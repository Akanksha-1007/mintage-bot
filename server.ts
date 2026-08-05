import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`
);

// In-memory store for tokens (In production, use Firestore)
const userTokens = new Map<string, any>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Allow framing and CORS globally for all routes so widget and iframes load on external sites
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Security-Policy', "frame-ancestors *;");
    res.removeHeader('X-Frame-Options');

    // Override setHeader to prevent X-Frame-Options SAMEORIGIN / DENY from blocking iframe
    const originalSetHeader = res.setHeader;
    res.setHeader = function (name: string, value: any) {
      const lowerName = name.toLowerCase();
      if (lowerName === 'x-frame-options') {
        return this;
      }
      if (lowerName === 'content-security-policy') {
        return originalSetHeader.call(this, name, "frame-ancestors *;");
      }
      return originalSetHeader.call(this, name, value);
    };

    const originalWriteHead = res.writeHead;
    res.writeHead = function (statusCode: any, ...args: any[]) {
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', "frame-ancestors *;");
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (args.length > 0) {
        const lastArg = args[args.length - 1];
        if (lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg)) {
          delete lastArg['x-frame-options'];
          delete lastArg['X-Frame-Options'];
          lastArg['Content-Security-Policy'] = "frame-ancestors *;";
          lastArg['access-control-allow-origin'] = '*';
        }
      }
      return originalWriteHead.apply(this, [statusCode, ...args]);
    };
    next();
  });

  // Serve widget.js directly
  app.get('/widget.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(path.join(__dirname, 'public', 'widget.js'));
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Google OAuth URL
  app.get('/api/auth/google/url', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // Use the actual origin if APP_URL is missing, but prioritize APP_URL
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/auth/callback`.replace(/\/+$/, '') + '/auth/callback'; // Safety against trailing slashes
    
    // Actually, just construct a clean one
    const cleanBaseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const finalRedirectUri = `${cleanBaseUrl}/auth/callback`;

    if (!clientId || !clientSecret) {
      return res.status(400).json({ 
        error: 'Google OAuth credentials missing. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.' 
      });
    }

    const client = new google.auth.OAuth2(clientId, clientSecret, finalRedirectUri);

    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      prompt: 'consent'
    });
    res.json({ url });
  });

  // Google OAuth Callback
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/dashboard');

    try {
      const cleanBaseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const finalRedirectUri = `${cleanBaseUrl}/auth/callback`;
      
      const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        finalRedirectUri
      );

      const { tokens } = await client.getToken(code as string);
      // For this demo, we'll just send the tokens back to the window
      // The client will then save them to Firestore associated with the user
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  tokens: ${JSON.stringify(tokens)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/dashboard';
              }
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  // Helper to create OAuth2 client with client credentials
  function createOAuth2Client(tokens?: any) {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    if (tokens) {
      client.setCredentials(tokens);
    }
    return client;
  }

  // Sync Lead to Google Sheets
  app.post('/api/sync-lead', async (req, res) => {
    const { tokens, spreadsheetId, leadData } = req.body;
    
    if (!tokens || !spreadsheetId) {
      return res.status(400).json({ error: 'Missing tokens or spreadsheetId' });
    }

    try {
      const auth = createOAuth2Client(tokens);
      const sheets = google.sheets({ version: 'v4', auth });
      
      // Check if sheet has headers first
      let range = 'Sheet1!A:E';
      try {
        const getRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Sheet1!A1:E1',
        });
        if (!getRes.data.values || getRes.data.values.length === 0) {
          // Initialize headers if sheet is blank
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Sheet1!A1:E1',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [['Timestamp', 'Name', 'Email', 'Phone', 'All Captured Fields']]
            }
          });
        }
      } catch (err) {
        console.warn('Header check warning (proceeding to append):', err);
      }

      // Prepare row data
      const name = leadData.name || leadData.fullName || leadData.full_name || '';
      const email = leadData.email || leadData.emailAddress || '';
      const phone = leadData.phone || leadData.phoneNumber || leadData.mobile || '';
      const formattedDetails = Object.entries(leadData)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');

      const values = [
        [
          new Date().toLocaleString(),
          name,
          email,
          phone,
          formattedDetails || JSON.stringify(leadData)
        ]
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Sheets Sync Error:', error?.message || error);
      res.status(500).json({ error: 'Failed to sync lead to Google Sheets. Please re-authenticate Google account.' });
    }
  });

  // List user's Google Sheets from Drive
  app.post('/api/sheets/list', async (req, res) => {
    const { tokens } = req.body;
    if (!tokens) {
      return res.status(400).json({ error: 'Missing tokens' });
    }

    try {
      const auth = createOAuth2Client(tokens);
      const drive = google.drive({ version: 'v3', auth });
      const response = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        pageSize: 20,
        fields: 'files(id, name, webViewLink, createdTime, modifiedTime)',
        orderBy: 'modifiedTime desc',
      });

      res.json({ files: response.data.files || [] });
    } catch (error: any) {
      console.error('Error listing Google Sheets:', error?.message || error);
      res.status(400).json({ error: 'Google session expired or invalid request. Please reconnect Google account.' });
    }
  });

  // Create a new Google Sheet
  app.post('/api/sheets/create', async (req, res) => {
    const { tokens, title } = req.body;
    if (!tokens) {
      return res.status(400).json({ error: 'Missing tokens' });
    }

    try {
      const auth = createOAuth2Client(tokens);
      const sheets = google.sheets({ version: 'v4', auth });
      
      const sheetTitle = title || 'BotFlow Chatbot Leads';
      const resource = {
        properties: {
          title: sheetTitle,
        },
      };

      const response = await sheets.spreadsheets.create({
        requestBody: resource,
        fields: 'spreadsheetId,spreadsheetUrl',
      });

      const spreadsheetId = response.data.spreadsheetId;
      const spreadsheetUrl = response.data.spreadsheetUrl;

      if (spreadsheetId) {
        // Add header row to new sheet
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Sheet1!A1:E1',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['Timestamp', 'Name', 'Email', 'Phone', 'All Captured Fields']],
          },
        });
      }

      res.json({ 
        success: true, 
        spreadsheetId, 
        spreadsheetUrl, 
        title: sheetTitle 
      });
    } catch (error: any) {
      console.error('Error creating Google Sheet:', error?.message || error);
      res.status(400).json({ error: 'Failed to create Google Sheet. Please reconnect your Google account.' });
    }
  });

  // Test connection to a Google Sheet
  app.post('/api/sheets/test', async (req, res) => {
    const { tokens, spreadsheetId } = req.body;
    if (!tokens || !spreadsheetId) {
      return res.status(400).json({ error: 'Missing tokens or spreadsheetId' });
    }

    try {
      const auth = createOAuth2Client(tokens);
      const sheets = google.sheets({ version: 'v4', auth });
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title',
      });

      res.json({ 
        success: true, 
        title: response.data.properties?.title || 'Google Sheet' 
      });
    } catch (error: any) {
      console.error('Error testing Google Sheet:', error?.message || error);
      res.status(400).json({ error: 'Could not access spreadsheet. Check ID and ensure Google account is connected.' });
    }
  });

  // Level 4: API Proxy
  app.post('/api/proxy', async (req, res) => {
    const { url, method, headers, body } = req.body;
    try {
      const response = await fetch(url, {
        method: method || 'GET',
        headers: headers || {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch external API' });
    }
  });

  // Server-side Bot Configurations Cache & File Persistence
  const BOTS_FILE_PATH = path.join(process.cwd(), 'public', 'bots.json');
  const serverBotsMap = new Map<string, any>();

  function loadBotsFromFile() {
    try {
      if (fs.existsSync(BOTS_FILE_PATH)) {
        const rawData = fs.readFileSync(BOTS_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
          parsed.forEach((bot: any) => {
            if (bot && bot.id) {
              serverBotsMap.set(bot.id, bot);
            }
          });
        }
      }
    } catch (err) {
      console.warn('Could not load bots.json:', err);
    }
  }

  // Load initially
  loadBotsFromFile();

  function saveBotsToFile() {
    try {
      const botsArray = Array.from(serverBotsMap.values());
      const publicDir = path.join(process.cwd(), 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      fs.writeFileSync(BOTS_FILE_PATH, JSON.stringify(botsArray, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Could not write to bots.json:', err);
    }
  }

  // Save/Update Bot Configuration
  app.post('/api/bots/save', (req, res) => {
    const { id, name, nodes, edges, spreadsheetId, createdBy } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Bot ID is required' });
    }

    const botObj = {
      id,
      name: name || 'Unnamed Bot',
      nodes: nodes || [],
      edges: edges || [],
      spreadsheetId: spreadsheetId || '',
      createdBy: createdBy || 'guest_user',
      updatedAt: new Date().toISOString()
    };

    serverBotsMap.set(id, botObj);
    saveBotsToFile();
    res.json({ success: true, bot: botObj });
  });

  // Get Bot Configuration by ID
  app.get('/api/bots/:id', (req, res) => {
    const { id } = req.params;
    loadBotsFromFile(); // Reload to capture any direct file edits or multi-worker updates

    if (serverBotsMap.has(id)) {
      return res.json({ success: true, bot: serverBotsMap.get(id) });
    }

    // Fallback: If requested ID is not found, but we have saved bots, return the most recent custom bot flow
    if (serverBotsMap.size > 0) {
      const allBots = Array.from(serverBotsMap.values());
      allBots.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      return res.json({ success: true, bot: allBots[0], fallback: true });
    }

    res.status(404).json({ error: 'Bot configuration not found on server' });
  });

  // List all Bot Configurations on Server
  app.get('/api/bots', (req, res) => {
    loadBotsFromFile();
    const botsList = Array.from(serverBotsMap.values());
    res.json({ success: true, bots: botsList });
  });

  // Level 5: Lead Routing to Google Sheets (Placeholder)
  app.post('/api/leads', async (req, res) => {
    const leadData = req.body;
    console.log('Captured Lead:', leadData);
    // In a real implementation, we would use googleapis to append to a sheet
    res.json({ success: true, message: 'Lead captured' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
