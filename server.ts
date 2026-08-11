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

  // Backend Lead Storage & Retrieval with Dynamic Fields, Backend Ownership & Idempotency
  app.post('/api/leads', async (req, res) => {
    const leadRecord = req.body || {};
    const botId = leadRecord.botId || leadRecord.flowId || 'default_bot';

    // 1. Resolve bot owner securely from server configuration (DO NOT trust client-supplied ownerId)
    loadBotsFromFile();
    let resolvedOwnerId = 'demo_user';
    let resolvedBotName = leadRecord.botName || leadRecord.clientName || 'Chatbot';
    let resolvedSpreadsheetId = leadRecord.spreadsheetId || '';
    let resolvedWorksheetName = leadRecord.worksheetName || 'Sheet1';

    if (serverBotsMap.has(botId)) {
      const botConfig = serverBotsMap.get(botId);
      if (botConfig.createdBy) resolvedOwnerId = botConfig.createdBy;
      if (botConfig.name) resolvedBotName = botConfig.name;
      if (botConfig.spreadsheetId) resolvedSpreadsheetId = botConfig.spreadsheetId;
      if (botConfig.worksheetName) resolvedWorksheetName = botConfig.worksheetName;
    } else {
      resolvedOwnerId = leadRecord.clientId || leadRecord.ownerId || 'demo_user';
    }

    // 2. Parse dynamic fields list
    let fields: Array<{ fieldId: string; label: string; value: string }> = [];
    if (Array.isArray(leadRecord.fields)) {
      fields = leadRecord.fields;
    } else if (leadRecord.data && typeof leadRecord.data === 'object') {
      fields = Object.entries(leadRecord.data).map(([key, val]) => ({
        fieldId: 'field_' + key,
        label: key,
        value: String(val)
      }));
    }

    const leadId = leadRecord.id || ('lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));

    // 3. Deduplication Check (Idempotency) - Prevent duplicate submissions from fast clicks or network retries
    loadLeadsFromFile();
    const existingById = serverLeadsList.find(l => l.id === leadId);
    if (existingById) {
      console.log('Duplicate submission skipped by ID:', leadId);
      return res.json({ success: true, lead: existingById, duplicate: true });
    }

    // Secondary duplicate check: same botId and identical field values in last 10 seconds
    const tenSecsAgo = Date.now() - 10000;
    const isRecentDuplicate = serverLeadsList.find(l => {
      if ((l.botId === botId || l.flowId === botId) && l.submittedAt) {
        const leadTime = new Date(l.submittedAt).getTime();
        if (leadTime > tenSecsAgo) {
          const lValues = JSON.stringify(l.fields || l.data);
          const newValues = JSON.stringify(fields || leadRecord.data);
          return lValues === newValues;
        }
      }
      return false;
    });

    if (isRecentDuplicate) {
      console.log('Recent duplicate submission skipped for bot:', botId);
      return res.json({ success: true, lead: isRecentDuplicate, duplicate: true });
    }

    const newLead: any = {
      id: leadId,
      botId,
      flowId: botId,
      clientId: resolvedOwnerId,
      ownerId: resolvedOwnerId,
      botName: resolvedBotName,
      clientName: resolvedBotName,
      fields,
      data: leadRecord.data || leadRecord,
      timestamp: leadRecord.timestamp || new Date().toISOString(),
      submittedAt: leadRecord.submittedAt || new Date().toISOString(),
      sourceUrl: leadRecord.sourceUrl || '',
      googleSheetSyncStatus: 'pending'
    };

    // Save lead to application database FIRST (Primary source of truth)
    serverLeadsList.unshift(newLead);
    saveLeadsToFile();
    console.log('Captured & Saved Lead to Backend:', newLead.id);

    // Attempt automatic Google Sheets synchronization if tokens & spreadsheet details provided
    const googleTokens = leadRecord.googleTokens;
    const spreadsheetId = resolvedSpreadsheetId || leadRecord.spreadsheetId;
    const worksheetName = resolvedWorksheetName || leadRecord.worksheetName || 'Sheet1';

    if (googleTokens && spreadsheetId) {
      try {
        await syncLeadToGoogleSheets(googleTokens, spreadsheetId, worksheetName, newLead);
        newLead.googleSheetSyncStatus = 'synced';
        newLead.googleSheetSyncedAt = new Date().toISOString();
        saveLeadsToFile();
      } catch (syncErr: any) {
        console.warn('Auto Google Sheets sync failed on lead creation (Lead preserved in DB):', syncErr?.message || syncErr);
        newLead.googleSheetSyncStatus = 'failed';
        newLead.googleSheetSyncError = syncErr?.message || 'Sync failed';
        saveLeadsToFile();
      }
    }

    res.json({ success: true, lead: newLead });
  });


  // Get leads with multi-tenant ownership validation
  app.get('/api/leads', (req, res) => {
    loadLeadsFromFile();
    const { ownerId, clientId, botId, flowId } = req.query;
    let filtered = [...serverLeadsList];

    const targetOwner = (ownerId || clientId) as string;
    if (targetOwner) {
      filtered = filtered.filter(l => l.ownerId === targetOwner || l.clientId === targetOwner);
    }

    const targetBot = (botId || flowId) as string;
    if (targetBot) {
      filtered = filtered.filter(l => l.botId === targetBot || l.flowId === targetBot);
    }

    res.json({ success: true, leads: filtered });
  });

  // Get leads for a specific bot with ownership validation
  app.get('/api/bots/:botId/leads', (req, res) => {
    const { botId } = req.params;
    const { ownerId, clientId } = req.query;
    loadLeadsFromFile();

    let filtered = serverLeadsList.filter(l => l.botId === botId || l.flowId === botId);

    const targetOwner = (ownerId || clientId) as string;
    if (targetOwner) {
      filtered = filtered.filter(l => l.ownerId === targetOwner || l.clientId === targetOwner);
    }

    res.json({ success: true, leads: filtered });
  });

  // Get single lead details
  app.get('/api/leads/:id', (req, res) => {
    const { id } = req.params;
    loadLeadsFromFile();
    const lead = serverLeadsList.find(l => l.id === id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json({ success: true, lead });
  });

  // Retry Google Sheets synchronization for a specific lead
  app.post('/api/leads/retry-sync', async (req, res) => {
    const { leadId, googleTokens, spreadsheetId, worksheetName } = req.body;
    loadLeadsFromFile();

    const leadIndex = serverLeadsList.findIndex(l => l.id === leadId);
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead record not found' });
    }

    const lead = serverLeadsList[leadIndex];
    if (!googleTokens || !spreadsheetId) {
      return res.status(400).json({ error: 'Missing Google tokens or Spreadsheet ID for retry.' });
    }

    try {
      await syncLeadToGoogleSheets(googleTokens, spreadsheetId, worksheetName || 'Sheet1', lead);
      lead.googleSheetSyncStatus = 'synced';
      lead.googleSheetSyncedAt = new Date().toISOString();
      delete lead.googleSheetSyncError;
      serverLeadsList[leadIndex] = lead;
      saveLeadsToFile();
      res.json({ success: true, lead });
    } catch (err: any) {
      console.error('Retry Sync Error:', err?.message || err);
      lead.googleSheetSyncStatus = 'failed';
      lead.googleSheetSyncError = err?.message || 'Sync failed';
      serverLeadsList[leadIndex] = lead;
      saveLeadsToFile();
      res.status(500).json({ error: err?.message || 'Failed to sync lead to Google Sheets.' });
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
