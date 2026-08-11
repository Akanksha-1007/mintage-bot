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
    const standardHeaders = ['Timestamp', 'Lead ID', 'Bot Name', 'Source URL'];
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
    res.json({ success: true, bot: botObj });
  });

  // Get Bot Configuration by ID
  app.get('/api/bots/:id', (req, res) => {
    const { id } = req.params;
    loadBotsFromFile(); // Reload to capture any direct file edits or multi-worker updates

    // 1. Direct ID match
    if (serverBotsMap.has(id)) {
      return res.json({ success: true, bot: serverBotsMap.get(id) });
    }

    // 2. Case-insensitive ID or client name match
    const lowerId = id.toLowerCase().trim();
    const allBots = Array.from(serverBotsMap.values());

    // Exact case-insensitive ID match
    let matchedBot = allBots.find(b => (b.id || '').toLowerCase() === lowerId);

    // Exact name match
    if (!matchedBot) {
      matchedBot = allBots.find(b => (b.name || '').toLowerCase() === lowerId);
    }

    // Specific client keyword match ONLY when requested ID explicitly contains the keyword
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

  // Helper to resolve bot & client owner securely server-side
  async function resolveBotAndOwner(botId: string) {
    const cleanBotId = (botId || '').trim();
    if (!cleanBotId) return null;

    // 1. Check Firestore bot_configurations collection first
    if (db) {
      try {
        const botRef = doc(db, 'bot_configurations', cleanBotId);
        const botSnap = await getDoc(botRef).catch(() => null);
        if (botSnap && botSnap.exists()) {
          const data = botSnap.data();
          if (data && data.createdBy) {
            return {
              botId: cleanBotId,
              botName: data.name || 'Chatbot',
              clientId: data.createdBy,
              spreadsheetId: data.spreadsheetId || '',
              worksheetName: data.worksheetName || 'Sheet1'
            };
          }
        }
      } catch (err) {
        console.warn('[BOT_LOOKUP_WARNING] Firestore bot doc fetch error:', err);
      }
    }

    // 2. Check serverBotsMap (or bots.json)
    loadBotsFromFile();
    if (serverBotsMap.has(cleanBotId)) {
      const b = serverBotsMap.get(cleanBotId);
      if (b && b.createdBy) {
        return {
          botId: cleanBotId,
          botName: b.name || 'Chatbot',
          clientId: b.createdBy,
          spreadsheetId: b.spreadsheetId || '',
          worksheetName: b.worksheetName || 'Sheet1'
        };
      }
    }

    // 3. Check case-insensitive match in serverBotsMap
    const lowerId = cleanBotId.toLowerCase();
    const allBots = Array.from(serverBotsMap.values());
    const found = allBots.find(b => 
      (b.id || '').toLowerCase() === lowerId || 
      (b.name || '').toLowerCase() === lowerId ||
      (lowerId.includes('risinia') && (b.id || '').toLowerCase().includes('risinia')) ||
      (lowerId.includes('river') && (b.id || '').toLowerCase().includes('river'))
    );

    if (found && found.createdBy) {
      return {
        botId: found.id || cleanBotId,
        botName: found.name || 'Chatbot',
        clientId: found.createdBy,
        spreadsheetId: found.spreadsheetId || '',
        worksheetName: found.worksheetName || 'Sheet1'
      };
    }

    return null;
  }

  // Helper to resolve client Google Sheets configuration (tokens & spreadsheet ID)
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

    return { googleTokens, spreadsheetId, worksheetName };
  }

  // Backend Lead Storage & Retrieval with Dynamic Fields, Backend Ownership & Idempotency
  app.post('/api/leads', async (req, res) => {
    const leadPayload = req.body || {};
    const botId = leadPayload.botId || leadPayload.flowId;

    console.log('[LEAD_RECEIVED]', { botId, sourceUrl: leadPayload.sourceUrl, fieldsCount: Array.isArray(leadPayload.fields) ? leadPayload.fields.length : 0 });

    if (!botId) {
      return res.status(400).json({ success: false, error: 'botId is required.' });
    }

    // 1. Resolve bot & owner securely server-side (DO NOT trust client-supplied ownerId/clientId!)
    const resolvedBot = await resolveBotAndOwner(botId);
    if (!resolvedBot || !resolvedBot.clientId) {
      console.error('[LEAD_OWNER_ERROR]', 'Bot configuration or client ownership could not be resolved for botId:', botId);
      return res.status(400).json({
        success: false,
        error: 'Bot configuration or client ownership could not be resolved.'
      });
    }

    const clientId = resolvedBot.clientId;
    const botName = resolvedBot.botName;
    console.log('[LEAD_OWNER_RESOLVED]', { botId, clientId, botName });

    // 2. Format dynamic fields
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

    // Create flattened key-value data dictionary for fallback queries
    const flattenedData: Record<string, any> = {};
    fields.forEach(f => {
      if (f.label) {
        flattenedData[f.label] = f.value;
      }
    });

    const leadId = leadPayload.id || ('lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));

    // 3. Idempotency Check (Prevent duplicate submissions)
    loadLeadsFromFile();
    const existingById = serverLeadsList.find(l => l.id === leadId);
    if (existingById) {
      console.log('[LEAD_DUPLICATE_SKIPPED]', leadId);
      return res.json({ success: true, leadId: existingById.id, duplicate: true });
    }

    const tenSecsAgo = Date.now() - 10000;
    const isRecentDuplicate = serverLeadsList.find(l => {
      if ((l.botId === botId || l.flowId === botId) && l.submittedAt) {
        const leadTime = new Date(l.submittedAt).getTime();
        if (leadTime > tenSecsAgo) {
          const lValues = JSON.stringify(l.fields || l.data);
          const newValues = JSON.stringify(fields || leadPayload.data);
          return lValues === newValues;
        }
      }
      return false;
    });

    if (isRecentDuplicate) {
      console.log('[LEAD_RECENT_DUPLICATE_SKIPPED]', botId);
      return res.json({ success: true, leadId: isRecentDuplicate.id, duplicate: true });
    }

    // Build Lead Record
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

    // 4. SAVE TO FIRESTORE FIRST (Primary production database)
    if (db) {
      try {
        await setDoc(doc(db, 'leads', leadId), newLeadRecord);
        console.log('[LEAD_FIRESTORE_SAVED]', { leadId, clientId, botId });
      } catch (fsErr: any) {
        console.warn('[LEAD_FIRESTORE_SAVE_WARNING]', fsErr?.message || fsErr);
      }
    }

    // Save to local file memory for fallback API queries
    serverLeadsList.unshift(newLeadRecord);
    saveLeadsToFile();

    // 5. SERVER-SIDE GOOGLE SHEETS SYNC
    const sheetConfig = await resolveClientGoogleSheetsConfig(clientId, resolvedBot.spreadsheetId, resolvedBot.worksheetName);
    
    if (sheetConfig.googleTokens && sheetConfig.spreadsheetId) {
      console.log('[GOOGLE_SHEET_SYNC]', { leadId, spreadsheetId: sheetConfig.spreadsheetId, worksheet: sheetConfig.worksheetName });
      try {
        await syncLeadToGoogleSheets(sheetConfig.googleTokens, sheetConfig.spreadsheetId, sheetConfig.worksheetName, newLeadRecord);
        newLeadRecord.googleSheetSyncStatus = 'synced';
        newLeadRecord.googleSheetSyncedAt = new Date().toISOString();
        
        if (db) {
          await setDoc(doc(db, 'leads', leadId), { googleSheetSyncStatus: 'synced', googleSheetSyncedAt: newLeadRecord.googleSheetSyncedAt }, { merge: true }).catch(() => null);
        }
        saveLeadsToFile();
        console.log('[GOOGLE_SHEET_SYNC_SUCCESS]', { leadId });
      } catch (syncErr: any) {
        console.error('[GOOGLE_SHEET_SYNC_FAILED]', { leadId, error: syncErr?.message || syncErr });
        newLeadRecord.googleSheetSyncStatus = 'failed';
        newLeadRecord.googleSheetSyncError = syncErr?.message || 'Sync failed';
        
        if (db) {
          await setDoc(doc(db, 'leads', leadId), { googleSheetSyncStatus: 'failed', googleSheetSyncError: newLeadRecord.googleSheetSyncError }, { merge: true }).catch(() => null);
        }
        saveLeadsToFile();
      }
    } else {
      console.log('[GOOGLE_SHEET_NOT_CONFIGURED]', { leadId, clientId });
      newLeadRecord.googleSheetSyncStatus = 'not_configured';
      if (db) {
        await setDoc(doc(db, 'leads', leadId), { googleSheetSyncStatus: 'not_configured' }, { merge: true }).catch(() => null);
      }
      saveLeadsToFile();
    }

    return res.json({ success: true, leadId });
  });

  // Get leads with multi-tenant ownership validation
  app.get('/api/leads', async (req, res) => {
    const { ownerId, clientId, botId, flowId } = req.query;
    const targetOwner = (ownerId || clientId) as string;
    const targetBot = (botId || flowId) as string;

    let firestoreLeads: any[] = [];

    if (db && targetOwner) {
      try {
        const q = query(collection(db, 'leads'), where('clientId', '==', targetOwner));
        const snap = await getDocs(q);
        firestoreLeads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn('[FIRESTORE_LEADS_FETCH_WARNING]', e);
      }
    }

    loadLeadsFromFile();
    let fileLeads = [...serverLeadsList];
    if (targetOwner) {
      fileLeads = fileLeads.filter(l => l.ownerId === targetOwner || l.clientId === targetOwner);
    }
    if (targetBot) {
      fileLeads = fileLeads.filter(l => l.botId === targetBot || l.flowId === targetBot);
    }

    // Merge without duplicates
    const map = new Map<string, any>();
    fileLeads.forEach(l => map.set(l.id, l));
    firestoreLeads.forEach(l => map.set(l.id, l));

    res.json({ success: true, leads: Array.from(map.values()) });
  });

  // Retry Google Sheets synchronization for a specific lead
  app.post('/api/leads/retry-sync', async (req, res) => {
    const { leadId } = req.body;
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId is required.' });
    }

    let lead: any = null;

    // Fetch from Firestore
    if (db) {
      try {
        const leadRef = doc(db, 'leads', leadId);
        const leadSnap = await getDoc(leadRef);
        if (leadSnap.exists()) {
          lead = { id: leadSnap.id, ...leadSnap.data() };
        }
      } catch (e) {}
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
