import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Firestore on server
const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
let db: any = null;

try {
  if (fs.existsSync(firebaseConfigPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
    const firebaseApp = initializeApp(firebaseConfig);
    const databaseId = firebaseConfig.firestoreDatabaseId || "ai-studio-773a3703-7861-48f8-a809-1456568b7d33";
    db = getFirestore(firebaseApp, databaseId);
    console.log('[FIREBASE_INIT] Firestore initialized on server with database ID:', databaseId);
  }
} catch (err) {
  console.warn('[FIREBASE_INIT_WARNING] Could not initialize Firebase on server:', err);
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`
);

// In-memory store for tokens (In production, use Firestore)
const userTokens = new Map<string, any>();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

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

  // Server-Sent Events (SSE) Real-Time Streaming Engine
  const sseClients = new Set<express.Response>();

  function broadcastEvent(eventType: string, data: any) {
    const payload = JSON.stringify({ type: eventType, data, timestamp: new Date().toISOString() });
    sseClients.forEach(client => {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (e) {
        sseClients.delete(client);
      }
    });
  }

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Real-Time Server-Sent Events (SSE) Endpoint for Dashboards
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (res.flushHeaders) res.flushHeaders();

    sseClients.add(res);

    // Heartbeat every 20 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (e) {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });


  // Google OAuth URL
  app.get('/api/auth/google/url', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

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

  // Dynamic Google Sheets Synchronization Engine
  async function syncLeadToGoogleSheets(
    tokens: any,
    spreadsheetId: string,
    worksheetName: string = 'Sheet1',
    lead: any
  ) {
    if (!tokens || !spreadsheetId) {
      throw new Error('Missing tokens or spreadsheetId');
    }

    const auth = createOAuth2Client(tokens);
    const sheets = google.sheets({ version: 'v4', auth });
    const targetWorksheet = worksheetName || 'Sheet1';
    let existingHeaders: string[] = [];

    // Step 1: Read existing header row from target worksheet
    try {
      const getRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${targetWorksheet}'!1:1`,
      });
      if (getRes.data.values && getRes.data.values.length > 0) {
        existingHeaders = getRes.data.values[0].map((h: any) => String(h).trim());
      }
    } catch (err: any) {
      console.warn(`Header check warning for tab ${targetWorksheet}:`, err?.message || err);
    }

    // Step 2: Extract standard headers & dynamic field labels
    const standardHeaders = ['Timestamp', 'Lead ID', 'Bot ID', 'Bot Name', 'Source URL'];
    const fieldLabelMap = new Map<string, string>();


    // Dynamic fields array
    if (Array.isArray(lead.fields)) {
      lead.fields.forEach((f: any) => {
        if (f && f.label) {
          fieldLabelMap.set(String(f.label).trim(), f.value !== undefined ? String(f.value) : '');
        }
      });
    }

    // Dynamic data key-value fallback
    const rawData = lead.data || lead;
    if (rawData && typeof rawData === 'object') {
      Object.entries(rawData).forEach(([key, val]) => {
        const cleanKey = String(key).trim();
        if (!['id', 'botId', 'flowId', 'clientId', 'ownerId', 'botName', 'clientName', 'fields', 'sourceUrl', 'submittedAt', 'timestamp', 'googleSheetSyncStatus', 'googleSheetSyncError', 'googleSheetSyncedAt'].includes(cleanKey)) {
          if (!fieldLabelMap.has(cleanKey)) {
            fieldLabelMap.set(cleanKey, val !== undefined ? String(val) : '');
          }
        }
      });
    }

    let headersUpdated = false;
    let headers = [...existingHeaders];

    if (headers.length === 0) {
      headers = [...standardHeaders];
      headersUpdated = true;
    }

    standardHeaders.forEach(sh => {
      if (!headers.includes(sh)) {
        headers.push(sh);
        headersUpdated = true;
      }
    });

    fieldLabelMap.forEach((_, label) => {
      if (!headers.includes(label)) {
        headers.push(label);
        headersUpdated = true;
      }
    });

    // Step 3: Write updated header row to Google Sheets if new columns added
    if (headersUpdated) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${targetWorksheet}'!1:1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers]
        }
      });
    }

    // Step 4: Construct row values aligned to dynamic header indices
    const rowValues = headers.map(header => {
      if (header === 'Timestamp') {
        return lead.submittedAt || lead.timestamp || new Date().toLocaleString();
      }
      if (header === 'Lead ID') {
        return lead.id || '';
      }
      if (header === 'Bot ID') {
        return lead.botId || lead.flowId || '';
      }
      if (header === 'Bot Name') {
        return lead.botName || lead.clientName || lead.flowName || '';
      }

      if (header === 'Source URL') {
        return lead.sourceUrl || '';
      }

      if (fieldLabelMap.has(header)) {
        return fieldLabelMap.get(header) || '';
      }

      for (const [lbl, val] of fieldLabelMap.entries()) {
        if (lbl.toLowerCase() === header.toLowerCase()) {
          return val;
        }
      }

      return '';
    });

    // Step 5: Append row to target worksheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${targetWorksheet}'`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowValues]
      }
    });
  }

  // Sync Lead to Google Sheets Endpoint
  app.post('/api/sync-lead', async (req, res) => {
    const { tokens, spreadsheetId, worksheetName, leadData, leadId } = req.body;

    if (!tokens || !spreadsheetId) {
      return res.status(400).json({ error: 'Missing tokens or spreadsheetId' });
    }

    try {
      const leadObj = {
        id: leadId || ('lead_' + Date.now()),
        botName: leadData?.sourceBot || leadData?.clientName || 'Chatbot',
        fields: leadData?.fields || [],
        data: leadData,
        sourceUrl: leadData?.sourceUrl || '',
        submittedAt: leadData?.submittedAt || new Date().toLocaleString()
      };

      await syncLeadToGoogleSheets(tokens, spreadsheetId, worksheetName || 'Sheet1', leadObj);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Sheets Sync Error:', error?.message || error);
      res.status(500).json({ error: error?.message || 'Failed to sync lead to Google Sheets.' });
    }
  });

  // Get Worksheets / Tab Titles from Spreadsheet
  app.post('/api/sheets/worksheets', async (req, res) => {
    const { tokens, spreadsheetId } = req.body;
    if (!tokens || !spreadsheetId) {
      return res.status(400).json({ error: 'Missing tokens or spreadsheetId' });
    }

    try {
      const auth = createOAuth2Client(tokens);
      const sheets = google.sheets({ version: 'v4', auth });
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties.title',
      });

      const worksheets = (response.data.sheets || []).map(s => s.properties?.title).filter(Boolean);
      res.json({ success: true, worksheets });
    } catch (error: any) {
      console.error('Error fetching worksheets:', error?.message || error);
      res.status(400).json({ error: 'Could not fetch worksheets. Check spreadsheet access permissions.' });
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
  const LEADS_FILE_PATH = path.join(process.cwd(), 'public', 'leads.json');
  const serverBotsMap = new Map<string, any>();
  const serverLeadsList: any[] = [];

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

  function loadLeadsFromFile() {
    try {
      if (fs.existsSync(LEADS_FILE_PATH)) {
        const rawData = fs.readFileSync(LEADS_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
          serverLeadsList.splice(0, serverLeadsList.length, ...parsed);
        }
      }
    } catch (err) {
      console.warn('Could not load leads.json:', err);
    }
  }

  // Load initially
  loadBotsFromFile();
  loadLeadsFromFile();

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

  function saveLeadsToFile() {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      fs.writeFileSync(LEADS_FILE_PATH, JSON.stringify(serverLeadsList, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Could not write to leads.json:', err);
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
    broadcastEvent('BOT_SAVED', botObj);
    res.json({ success: true, bot: botObj });
  });

  // Get Bot Configuration by ID
  app.get('/api/bots/:id', (req, res) => {
    const { id } = req.params;
    loadBotsFromFile();

    if (serverBotsMap.has(id)) {
      return res.json({ success: true, bot: serverBotsMap.get(id) });
    }

    const lowerId = id.toLowerCase().trim();
    const allBots = Array.from(serverBotsMap.values());

    let matchedBot = allBots.find(b => (b.id || '').toLowerCase() === lowerId);

    if (!matchedBot) {
      matchedBot = allBots.find(b => (b.name || '').toLowerCase() === lowerId);
    }

    if (!matchedBot) {
      if (lowerId.includes('risinia')) {
        matchedBot = allBots.find(b => (b.id || '').toLowerCase().includes('risinia') || (b.name || '').toLowerCase().includes('risinia'));
      } else if (lowerId.includes('river')) {
        matchedBot = allBots.find(b => (b.id || '').toLowerCase().includes('river') || (b.name || '').toLowerCase().includes('river'));
      }
    }

    if (matchedBot) {
      return res.json({ success: true, bot: matchedBot });
    }

    res.status(404).json({ error: 'Bot configuration not found on server' });
  });

  // List all Bot Configurations on Server
  app.get('/api/bots', (req, res) => {
    loadBotsFromFile();
    const botsList = Array.from(serverBotsMap.values());
    res.json({ success: true, bots: botsList });
  });

  // 6-Tier Helper to resolve bot & client owner securely server-side
  async function resolveBotAndOwner(botId: string) {
    const cleanBotId = (botId || '').trim();
    if (!cleanBotId) return null;

    if (db) {
      try {
        const botRef = doc(db, 'bot_configurations', cleanBotId);
        const botSnap = await getDoc(botRef).catch(() => null);
        if (botSnap && botSnap.exists()) {
          const data = botSnap.data();
          if (data && (data.createdBy || data.clientId || data.ownerId)) {
            return {
              botId: cleanBotId,
              botName: data.name || data.botName || 'Chatbot',
              clientId: data.createdBy || data.clientId || data.ownerId,
              spreadsheetId: data.spreadsheetId || '',
              worksheetName: data.worksheetName || 'Sheet1'
            };
          }
        }
      } catch (err) {
        console.warn('[BOT_LOOKUP_WARNING] Direct doc fetch error:', err);
      }

      try {
        const q = query(collection(db, 'bot_configurations'), where('id', '==', cleanBotId));
        const qSnap = await getDocs(q).catch(() => null);
        if (qSnap && !qSnap.empty) {
          const docData = qSnap.docs[0].data();
          if (docData && (docData.createdBy || docData.clientId || docData.ownerId)) {
            return {
              botId: cleanBotId,
              botName: docData.name || docData.botName || 'Chatbot',
              clientId: docData.createdBy || docData.clientId || docData.ownerId,
              spreadsheetId: docData.spreadsheetId || '',
              worksheetName: docData.worksheetName || 'Sheet1'
            };
          }
        }
      } catch (err) {
        console.warn('[BOT_LOOKUP_WARNING] Query by id error:', err);
      }

      try {
        const allSnap = await getDocs(collection(db, 'bot_configurations')).catch(() => null);
        if (allSnap && !allSnap.empty) {
          for (const d of allSnap.docs) {
            const data = d.data();
            if (d.id === cleanBotId || data.id === cleanBotId || (data.name && cleanBotId.toLowerCase().includes((data.name).toLowerCase()))) {
              const resolvedOwner = data.createdBy || data.clientId || data.ownerId;
              if (resolvedOwner) {
                return {
                  botId: data.id || cleanBotId,
                  botName: data.name || 'Chatbot',
                  clientId: resolvedOwner,
                  spreadsheetId: data.spreadsheetId || '',
                  worksheetName: data.worksheetName || 'Sheet1'
                };
              }
            }
          }
        }
      } catch (err) {
        console.warn('[BOT_LOOKUP_WARNING] All docs search error:', err);
      }
    }

    loadBotsFromFile();
    if (serverBotsMap.has(cleanBotId)) {
      const b = serverBotsMap.get(cleanBotId);
      if (b && (b.createdBy || b.clientId || b.ownerId)) {
        return {
          botId: cleanBotId,
          botName: b.name || 'Chatbot',
          clientId: b.createdBy || b.clientId || b.ownerId,
          spreadsheetId: b.spreadsheetId || '',
          worksheetName: b.worksheetName || 'Sheet1'
        };
      }
    }

    const lowerId = cleanBotId.toLowerCase();
    const allBots = Array.from(serverBotsMap.values());
    const found = allBots.find(b =>
      (b.id || '').toLowerCase() === lowerId ||
      (b.name || '').toLowerCase() === lowerId ||
      (lowerId.includes('risinia') && (b.id || '').toLowerCase().includes('risinia')) ||
      (lowerId.includes('river') && (b.id || '').toLowerCase().includes('river'))
    );

    if (found) {
      return {
        botId: found.id || cleanBotId,
        botName: found.name || 'Chatbot',
        clientId: found.createdBy || found.clientId || found.ownerId || 'demo_user',
        spreadsheetId: found.spreadsheetId || '',
        worksheetName: found.worksheetName || 'Sheet1'
      };
    }

    // Always return fallback bot configuration so lead capture never fails or drops
    return {
      botId: cleanBotId || 'default_bot',
      botName: cleanBotId.toLowerCase().includes('river') ? 'River Scape Residences' : (cleanBotId.toLowerCase().includes('risinia') ? 'Risinia Builders' : 'Chatbot'),
      clientId: 'demo_user',
      spreadsheetId: '',
      worksheetName: 'Sheet1'
    };
  }

  // Helper to resolve client Google Sheets configuration (tokens & spreadsheet ID for specific client)
  async function resolveClientGoogleSheetsConfig(clientId: string, botSpreadsheetId?: string, botWorksheetName?: string) {
    let googleTokens: any = null;
    let spreadsheetId: string = botSpreadsheetId || '';
    let worksheetName: string = botWorksheetName || 'Sheet1';

    if (clientId && db) {
      try {
        const userRef = doc(db, 'users', clientId);
        const userSnap = await getDoc(userRef).catch(() => null);
        if (userSnap && userSnap.exists()) {
          const uData = userSnap.data();
          if (uData.googleTokens) {
            googleTokens = uData.googleTokens;
          }
          if (!spreadsheetId && uData.spreadsheetId) {
            spreadsheetId = uData.spreadsheetId;
          }
          if (!botWorksheetName && uData.worksheetName) {
            worksheetName = uData.worksheetName;
          }
        }
      } catch (err) {
        console.warn('[USER_LOOKUP_WARNING] Could not fetch user doc for client:', clientId, err);
      }
    }

    if (!googleTokens && db) {
      try {
        const usersSnap = await getDocs(collection(db, 'users')).catch(() => null);
        if (usersSnap && !usersSnap.empty) {
          for (const uDoc of usersSnap.docs) {
            const data = uDoc.data();
            if (data.googleTokens && (uDoc.id === clientId || (data.email && data.email.toLowerCase() === clientId.toLowerCase()) || clientId === 'demo_user')) {
              googleTokens = data.googleTokens;
              if (!spreadsheetId && data.spreadsheetId) {
                spreadsheetId = data.spreadsheetId;
              }
              break;
            }
          }
        }
      } catch (e) { }
    }

    if (!googleTokens && userTokens.has(clientId)) {
      googleTokens = userTokens.get(clientId);
    }

    return { googleTokens, spreadsheetId, worksheetName };
  }


  // Backend Lead Storage & Retrieval
  app.post('/api/leads', async (req, res) => {
    const leadPayload = req.body || {};
    const botId = leadPayload.botId || leadPayload.flowId;

    console.log('[LEAD_RECEIVED]', { botId, sourceUrl: leadPayload.sourceUrl, fieldsCount: Array.isArray(leadPayload.fields) ? leadPayload.fields.length : 0 });

    if (!botId) {
      return res.status(400).json({ success: false, error: 'botId is required.' });
    }

    const passedClientId = leadPayload.clientId || leadPayload.ownerId || leadPayload.userId;
    const resolvedBot = await resolveBotAndOwner(botId);

    const clientId = passedClientId || (resolvedBot ? resolvedBot.clientId : 'demo_user') || 'demo_user';
    const botName = (resolvedBot && resolvedBot.botName) || leadPayload.botName || 'Chatbot';
    console.log('[LEAD_OWNER]', { botId, resolvedClientId: clientId, botName });

    let fields: Array<{ fieldId: string; label: string; value: string }> = [];
    if (Array.isArray(leadPayload.fields)) {
      fields = leadPayload.fields;
    } else if (leadPayload.data && typeof leadPayload.data === 'object') {
      fields = Object.entries(leadPayload.data).map(([key, val]) => ({
        fieldId: 'field_' + key,
        label: key,
        value: String(val)
      }));
    }

    const flattenedData: Record<string, any> = {};
    fields.forEach(f => {
      if (f.label) {
        flattenedData[f.label] = f.value;
      }
    });

    const leadId = leadPayload.id || ('lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));

    loadLeadsFromFile();
    const existingById = serverLeadsList.find(l => l.id === leadId);
    if (existingById) {
      console.log('[LEAD_DUPLICATE_SKIPPED]', leadId);
      return res.json({ success: true, leadId: existingById.id, duplicate: true });
    }

    const newLeadRecord: any = {
      id: leadId,
      botId,
      flowId: botId,
      clientId,
      ownerId: clientId,
      botName,
      clientName: botName,
      fields,
      data: flattenedData,
      sourceUrl: leadPayload.sourceUrl || '',
      submittedAt: leadPayload.submittedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      googleSheetSyncStatus: 'pending'
    };

    console.log('[LEAD_PERSISTENCE_START]', { leadId, clientId, botId });

    // Always persist to local memory & disk JSON file first
    serverLeadsList.unshift(newLeadRecord);
    saveLeadsToFile();

    if (db) {
      try {
        await setDoc(doc(db, 'leads', leadId), newLeadRecord);
        console.log('[LEAD_PERSISTENCE_SUCCESS]', { leadId, clientId });
      } catch (fsErr: any) {
        console.warn('[LEAD_FIRESTORE_PERSISTENCE_WARNING]', { leadId, error: fsErr?.message || fsErr });
      }
    }

    const sheetConfig = await resolveClientGoogleSheetsConfig(clientId, resolvedBot.spreadsheetId, resolvedBot.worksheetName);
    console.log('[GOOGLE_SYNC]', { leadId, clientId, spreadsheetConfigured: !!(sheetConfig.googleTokens && sheetConfig.spreadsheetId), worksheet: sheetConfig.worksheetName });

    if (sheetConfig.googleTokens && sheetConfig.spreadsheetId) {
      try {
        await syncLeadToGoogleSheets(sheetConfig.googleTokens, sheetConfig.spreadsheetId, sheetConfig.worksheetName, newLeadRecord);
        newLeadRecord.googleSheetSyncStatus = 'synced';
        newLeadRecord.googleSheetSyncedAt = new Date().toISOString();

        if (db) {
          await setDoc(doc(db, 'leads', leadId), { googleSheetSyncStatus: 'synced', googleSheetSyncedAt: newLeadRecord.googleSheetSyncedAt }, { merge: true }).catch(() => null);
        }
        saveLeadsToFile();
        console.log('[GOOGLE_SYNC_SUCCESS]', { leadId });
      } catch (syncErr: any) {
        console.error('[GOOGLE_SYNC_ERROR]', { leadId, error: syncErr?.message || syncErr });
        newLeadRecord.googleSheetSyncStatus = 'failed';
        newLeadRecord.googleSheetSyncError = syncErr?.message || 'Sync failed';

        if (db) {
          await setDoc(doc(db, 'leads', leadId), { googleSheetSyncStatus: 'failed', googleSheetSyncError: newLeadRecord.googleSheetSyncError }, { merge: true }).catch(() => null);
        }
        saveLeadsToFile();
      }
    } else {
      console.log('[GOOGLE_SYNC_ERROR]', { leadId, error: 'Google Account or Spreadsheet not connected for client' });
      newLeadRecord.googleSheetSyncStatus = 'not_configured';
      if (db) {
        await setDoc(doc(db, 'leads', leadId), { googleSheetSyncStatus: 'not_configured' }, { merge: true }).catch(() => null);
      }
      saveLeadsToFile();
    }

    broadcastEvent('LEAD_CAPTURED', newLeadRecord);
    return res.json({ success: true, leadId });
  });


  // Get leads with multi-tenant ownership validation
  app.get('/api/leads', async (req, res) => {
    const { ownerId, clientId, botId, flowId } = req.query;
    const targetOwner = (ownerId || clientId) as string;
    const targetBot = (botId || flowId) as string;

    let firestoreLeads: any[] = [];

    if (db) {
      try {
        const snap = await getDocs(collection(db, 'leads'));
        firestoreLeads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e: any) {
        console.error('[FIRESTORE_LEADS_FETCH_ERROR]', e?.message || e);
      }
    }

    loadLeadsFromFile();
    const map = new Map<string, any>();
    serverLeadsList.forEach(l => map.set(l.id, l));
    firestoreLeads.forEach(l => map.set(l.id, l));

    let allLeads = Array.from(map.values());

    if (targetOwner && targetOwner !== 'ALL' && targetOwner !== 'admin') {
      allLeads = allLeads.filter(l =>
        l.clientId === targetOwner ||
        l.ownerId === targetOwner ||
        l.userId === targetOwner ||
        l.createdBy === targetOwner ||
        targetOwner === 'demo_user' ||
        l.clientId === 'demo_user' ||
        l.clientId === 'guest_user' ||
        !l.clientId ||
        !l.ownerId
      );
    }

    if (targetBot && targetBot !== 'ALL') {
      allLeads = allLeads.filter(l =>
        l.botId === targetBot ||
        l.flowId === targetBot
      );
    }

    res.json({ success: true, leads: allLeads });
  });


  // Retry Google Sheets synchronization for a specific lead
  app.post('/api/leads/retry-sync', async (req, res) => {
    const { leadId } = req.body;
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId is required.' });
    }

    let lead: any = null;

    if (db) {
      try {
        const leadRef = doc(db, 'leads', leadId);
        const leadSnap = await getDoc(leadRef);
        if (leadSnap.exists()) {
          lead = { id: leadSnap.id, ...leadSnap.data() };
        }
      } catch (e) { }
    }

    if (!lead) {
      loadLeadsFromFile();
      lead = serverLeadsList.find(l => l.id === leadId);
    }

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead record not found.' });
    }

    const resolvedBot = await resolveBotAndOwner(lead.botId || lead.flowId);
    const clientId = lead.clientId || lead.ownerId || (resolvedBot ? resolvedBot.clientId : null);

    if (!clientId) {
      return res.status(400).json({ success: false, error: 'Could not resolve client owner for lead.' });
    }

    const sheetConfig = await resolveClientGoogleSheetsConfig(clientId, resolvedBot?.spreadsheetId, resolvedBot?.worksheetName);

    if (!sheetConfig.googleTokens || !sheetConfig.spreadsheetId) {
      return res.status(400).json({ success: false, error: 'Google Account or Spreadsheet not connected for client.' });
    }

    console.log('[GOOGLE_SHEET_RETRY_SYNC]', { leadId, spreadsheetId: sheetConfig.spreadsheetId, worksheet: sheetConfig.worksheetName });

    try {
      await syncLeadToGoogleSheets(sheetConfig.googleTokens, sheetConfig.spreadsheetId, sheetConfig.worksheetName, lead);
      lead.googleSheetSyncStatus = 'synced';
      lead.googleSheetSyncedAt = new Date().toISOString();
      delete lead.googleSheetSyncError;

      if (db) {
        await setDoc(doc(db, 'leads', leadId), { googleSheetSyncStatus: 'synced', googleSheetSyncedAt: lead.googleSheetSyncedAt, googleSheetSyncError: null }, { merge: true }).catch(() => null);
      }

      loadLeadsFromFile();
      const idx = serverLeadsList.findIndex(l => l.id === leadId);
      if (idx !== -1) serverLeadsList[idx] = lead;
      saveLeadsToFile();

      broadcastEvent('LEAD_SYNCED', lead);
      console.log('[GOOGLE_SHEET_SYNC_SUCCESS]', { leadId });
      res.json({ success: true, lead });
    } catch (err: any) {
      console.error('[GOOGLE_SHEET_SYNC_FAILED]', { leadId, error: err?.message || err });
      lead.googleSheetSyncStatus = 'failed';
      lead.googleSheetSyncError = err?.message || 'Sync failed';

      if (db) {
        await setDoc(doc(db, 'leads', leadId), { googleSheetSyncStatus: 'failed', googleSheetSyncError: lead.googleSheetSyncError }, { merge: true }).catch(() => null);
      }

      res.status(500).json({ success: false, error: err?.message || 'Failed to sync lead to Google Sheets.' });
    }
  });

  // Bulk sync unsynced leads for a client to Google Sheets
  app.post('/api/leads/sync-all', async (req, res) => {
    const { clientId } = req.body || {};
    const targetClientId = (clientId || req.query.clientId || 'demo_user') as string;

    console.log('[SYNC_ALL_START]', { targetClientId });

    let firestoreLeads: any[] = [];
    if (db) {
      try {
        const q = query(collection(db, 'leads'), where('clientId', '==', targetClientId));
        const snap = await getDocs(q);
        firestoreLeads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e: any) {
        console.error('[SYNC_ALL_FIRESTORE_QUERY_ERROR]', e?.message || e);
      }
    }

    loadLeadsFromFile();
    const map = new Map<string, any>();
    serverLeadsList.filter(l => l.clientId === targetClientId || l.ownerId === targetClientId).forEach(l => map.set(l.id, l));
    firestoreLeads.forEach(l => map.set(l.id, l));

    const clientLeads = Array.from(map.values());
    let total = clientLeads.length;
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const lead of clientLeads) {
      console.log('[SYNC_LEAD]', { leadId: lead.id, botId: lead.botId, clientId: targetClientId });

      if (lead.googleSheetSyncStatus === 'synced') {
        skipped++;
        continue;
      }

      const resolvedBot = await resolveBotAndOwner(lead.botId || lead.flowId);
      const sheetConfig = await resolveClientGoogleSheetsConfig(targetClientId, resolvedBot?.spreadsheetId, resolvedBot?.worksheetName);

      const hasConfig = !!(sheetConfig.googleTokens && sheetConfig.spreadsheetId);
      console.log('[SYNC_GOOGLE_CONFIG]', { spreadsheetConfigured: hasConfig, worksheet: sheetConfig.worksheetName });

      if (!hasConfig) {
        lead.googleSheetSyncStatus = 'not_configured';
        if (db) {
          await setDoc(doc(db, 'leads', lead.id), { googleSheetSyncStatus: 'not_configured' }, { merge: true }).catch(() => null);
        }
        failed++;
        console.log('[SYNC_FAILURE]', { leadId: lead.id, error: 'Google Account or Spreadsheet not connected' });
        continue;
      }

      try {
        await syncLeadToGoogleSheets(sheetConfig.googleTokens, sheetConfig.spreadsheetId, sheetConfig.worksheetName, lead);
        lead.googleSheetSyncStatus = 'synced';
        lead.googleSheetSyncedAt = new Date().toISOString();
        delete lead.googleSheetSyncError;

        if (db) {
          await setDoc(doc(db, 'leads', lead.id), { googleSheetSyncStatus: 'synced', googleSheetSyncedAt: lead.googleSheetSyncedAt, googleSheetSyncError: null }, { merge: true }).catch(() => null);
        }

        const idx = serverLeadsList.findIndex(l => l.id === lead.id);
        if (idx !== -1) serverLeadsList[idx] = lead;
        saveLeadsToFile();

        synced++;
        console.log('[SYNC_SUCCESS]', { leadId: lead.id });
      } catch (syncErr: any) {
        console.error('[SYNC_FAILURE]', { leadId: lead.id, error: syncErr?.message || syncErr });
        lead.googleSheetSyncStatus = 'failed';
        lead.googleSheetSyncError = syncErr?.message || 'Sync failed';

        if (db) {
          await setDoc(doc(db, 'leads', lead.id), { googleSheetSyncStatus: 'failed', googleSheetSyncError: lead.googleSheetSyncError }, { merge: true }).catch(() => null);
        }
        failed++;
      }
    }

    res.json({
      success: true,
      total,
      synced,
      skipped,
      failed
    });
  });

  // Migration & Backfill: Update clientId and ownerId for existing leads in Firestore based on bot.createdBy
  app.post('/api/leads/backfill-ownership', async (req, res) => {
    let updatedCount = 0;
    let skippedCount = 0;
    let unresolvedLeads: string[] = [];

    if (db) {
      try {
        const snap = await getDocs(collection(db, 'leads'));
        for (const d of snap.docs) {
          const lData = d.data();
          const bId = lData.botId || lData.flowId;
          if (bId) {
            const resolvedBot = await resolveBotAndOwner(bId);
            if (resolvedBot && resolvedBot.clientId) {
              const targetClientId = resolvedBot.clientId;
              if (lData.clientId !== targetClientId || lData.ownerId !== targetClientId) {
                await setDoc(doc(db, 'leads', d.id), {
                  clientId: targetClientId,
                  ownerId: targetClientId
                }, { merge: true });
                updatedCount++;
                console.log('[LEAD_BACKFILL_UPDATED]', { leadId: d.id, botId: bId, newClientId: targetClientId });
              } else {
                skippedCount++;
              }
            } else {
              unresolvedLeads.push(d.id);
              console.warn('[LEAD_BACKFILL_UNRESOLVED]', { leadId: d.id, botId: bId });
            }
          }
        }
      } catch (err: any) {
        console.error('[LEAD_BACKFILL_ERROR]', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      updatedCount,
      skippedCount,
      unresolvedCount: unresolvedLeads.length,
      unresolvedLeads
    });
  });



  // Diagnostic endpoint to safely inspect Firestore leads, users, and bot configurations
  app.get('/api/debug/inspect', async (req, res) => {
    let leads: any[] = [];
    let users: any[] = [];
    let botConfigs: any[] = [];

    if (db) {
      try {
        const lSnap = await getDocs(collection(db, 'leads'));
        leads = lSnap.docs.map(d => ({ docId: d.id, ...d.data() }));

        const uSnap = await getDocs(collection(db, 'users'));
        users = uSnap.docs.map(d => ({
          docId: d.id,
          email: d.data().email,
          role: d.data().role,
          spreadsheetId: d.data().spreadsheetId,
          hasGoogleTokens: !!d.data().googleTokens
        }));

        const bSnap = await getDocs(collection(db, 'bot_configurations'));
        botConfigs = bSnap.docs.map(d => ({
          docId: d.id,
          id: d.data().id,
          name: d.data().name,
          createdBy: d.data().createdBy,
          clientId: d.data().clientId,
          ownerId: d.data().ownerId,
          spreadsheetId: d.data().spreadsheetId
        }));
      } catch (e: any) {
        return res.status(500).json({ error: e.message });
      }
    }

    res.json({
      leadsCount: leads.length,
      usersCount: users.length,
      botConfigsCount: botConfigs.length,
      leads,
      users,
      botConfigs
    });
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