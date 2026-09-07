import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, getDocs, collection, query, where, orderBy, limit, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

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



// In-memory store for tokens (In production, use Firestore)
const userTokens = new Map<string, any>();
// ============================================================
// GOOGLE OAUTH CONFIGURATION
// ============================================================

function getGoogleAppUrl(): string {
  const appUrl =
    process.env.APP_URL?.trim() ||
    'http://localhost:3000';

  return appUrl.replace(/\/+$/, '');
}

function getGoogleRedirectUri(): string {
  // IMPORTANT:
  // This value must exactly match one of the Authorized redirect URIs
  // configured for the same Google OAuth Web Client ID.
  const configuredRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

  if (configuredRedirectUri) {
    return configuredRedirectUri.replace(/\/$/, '');
  }

  return `${getGoogleAppUrl()}/auth/callback`;
}

function createOAuth2Client(tokens?: any) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = getGoogleRedirectUri();

  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured.');
  }

  if (!clientSecret) {
    throw new Error('GOOGLE_CLIENT_SECRET is not configured.');
  }

  console.log('[GOOGLE_OAUTH_CLIENT]', {
    clientIdPrefix: `${clientId.substring(0, 12)}...`,
    redirectUri
  });

  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  if (tokens) {
    client.setCredentials(tokens);
  }

  return client;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Safe Google OAuth Startup Diagnostics
  const gClientId = process.env.GOOGLE_CLIENT_ID || '';
  const gClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const gAppUrl = getGoogleAppUrl();
  const gRedirectUri = getGoogleRedirectUri();
  const gClientIdPrefix = gClientId ? (gClientId.length > 12 ? gClientId.substring(0, 12) + '...' : gClientId) : 'NONE';

  console.log('[GOOGLE_OAUTH_CONFIG]', {
    clientConfigured: !!gClientId,
    secretConfigured: !!gClientSecret,
    appUrl: gAppUrl,
    redirectUri: gRedirectUri,
    clientIdPrefix: gClientIdPrefix
  });

  if (process.env.NODE_ENV === 'production' && !process.env.GOOGLE_REDIRECT_URI) {
    console.warn(
      '[GOOGLE_OAUTH_WARNING] GOOGLE_REDIRECT_URI is not set. ' +
      'Using APP_URL + /auth/callback. For production, set ' +
      'GOOGLE_REDIRECT_URI to the exact URI configured in Google Cloud.'
    );
  }

  // Use the single OAuth configuration defined above.
  // Do not derive the redirect URI from the incoming request host.
  // Google requires an exact redirect URI match.

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

  // Safe Google OAuth Diagnostics Endpoint
  // ============================================================
  // GOOGLE OAUTH DIAGNOSTICS
  // ============================================================

  app.get('/api/auth/google/diagnostics', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';

    const appUrl = getGoogleAppUrl();
    const redirectUri = getGoogleRedirectUri();

    res.json({
      success: true,

      clientConfigured: Boolean(clientId),
      secretConfigured: Boolean(clientSecret),

      appUrl,

      redirectUri,

      clientIdPrefix: clientId
        ? `${clientId.substring(0, 12)}...`
        : 'NONE',

      environment: process.env.NODE_ENV || 'development'
    });
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

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Google OAuth credentials missing. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.'
      });
    }

    console.log('[GOOGLE_OAUTH_RECONNECT]', { started: true });

    const client = createOAuth2Client();

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
  app.get(
    ['/auth/callback', '/auth/callback/', '/auth/google/callback', '/auth/google/callback/'],
    async (req, res) => {
      const { code } = req.query;
      if (!code) return res.redirect('/dashboard');

      try {
        const client = createOAuth2Client();
        const { tokens } = await client.getToken(code as string);

        console.log('[GOOGLE_OAUTH_RECONNECT]', { tokenReceived: true });

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
      } catch (error: any) {
        console.error('[GOOGLE_OAUTH_CALLBACK_ERROR]', error?.message || error);
        res.status(500).send('Authentication failed: ' + (error?.message || error));
      }
    });

  // Endpoint to clear / disconnect stored Google OAuth credentials
  app.post('/api/auth/google/disconnect', async (req, res) => {
    const { userId } = req.body || {};
    const targetUserId = userId || 'demo_user';

    console.log('[GOOGLE_OAUTH_DISCONNECT]', { userId: targetUserId });

    userTokens.delete(targetUserId);

    if (db && targetUserId) {
      try {
        await setDoc(doc(db, 'users', targetUserId), {
          googleTokens: null,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => null);
      } catch (e) { }
    }

    res.json({ success: true, message: 'Google Account disconnected.' });
  });

  // Endpoint to store new Google OAuth tokens
  app.post('/api/auth/google/tokens', async (req, res) => {
    const { userId, tokens } = req.body || {};
    const targetUserId = userId || 'demo_user';

    console.log('[GOOGLE_OAUTH_RECONNECT]', { tokenReceived: true });

    if (tokens) {
      let tokensToStore = { ...tokens };

      // Google may omit refresh_token on subsequent authorizations. Preserve a
      // previously valid refresh token rather than replacing it with an access-only token.
      if (db && targetUserId) {
        try {
          const existingUserSnap = await getDoc(doc(db, 'users', targetUserId)).catch(() => null);
          const existingTokens = existingUserSnap?.exists() ? (existingUserSnap.data()?.googleTokens || {}) : {};
          if (!tokensToStore.refresh_token && existingTokens.refresh_token) {
            tokensToStore.refresh_token = existingTokens.refresh_token;
          }
        } catch (e) { }
      }

      userTokens.set(targetUserId, tokensToStore);
      if (db && targetUserId) {
        try {
          await setDoc(doc(db, 'users', targetUserId), {
            googleTokens: tokensToStore,
            googleOwnerId: targetUserId,
            updatedAt: new Date().toISOString()
          }, { merge: true }).catch(() => null);
        } catch (e) { }
      }

      // Auto-sync legacy and failed leads as well; those leads can still have
      // clientId=demo_user while their bot now points to targetUserId.
      autoSyncPendingLeads(undefined, targetUserId).catch(err =>
        console.warn('[AUTO_SYNC_AFTER_REAUTH_WARNING]', err?.message || err)
      );
    }

    res.json({ success: true });
  });

  // Classification helper for OAuth errors
  function classifyOAuthError(err: any): { code: string; message: string } {
    const errStr = String(err?.message || err || '').toLowerCase();

    if (errStr.includes('unauthorized_client')) {
      return {
        code: 'unauthorized_client',
        message: 'Google Account authorization expired. Please re-authorize your Google account.'
      };
    }
    if (errStr.includes('invalid_grant')) {
      return {
        code: 'invalid_grant',
        message: 'Google Account authorization expired. Please re-authorize your Google account.'
      };
    }
    if (errStr.includes('invalid_client')) {
      return {
        code: 'invalid_client',
        message: 'invalid_client: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET mismatch. Verify environment variables.'
      };
    }
    if (errStr.includes('redirect_uri_mismatch')) {
      return {
        code: 'redirect_uri_mismatch',
        message: 'redirect_uri_mismatch: Redirect URI setting does not match Google Console settings.'
      };
    }
    return {
      code: 'oauth_error',
      message: err?.message || String(err)
    };
  }

  // Helper to extract clean Spreadsheet ID from raw string or Google Sheets URL
  function extractSpreadsheetId(input?: string): string {
    if (!input) return '';
    const trimmed = String(input).trim();
    if (trimmed.includes('/d/')) {
      const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) return match[1];
    }
    return trimmed;
  }

  // Per-process lead/sheet lock. This serializes concurrent sync calls for the same
  // lead on a Render instance, which prevents the read->append race that was creating
  // multiple identical rows. The frontend also has a submission guard.
  const googleSheetSyncInFlight = new Map<string, Promise<any>>();

  async function withGoogleSheetLeadLock<T>(
    spreadsheetId: string,
    leadId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const key = `${spreadsheetId}::${leadId}`;
    const existing = googleSheetSyncInFlight.get(key);
    if (existing) {
      console.log('[GOOGLE_SHEET_SYNC_DEDUP]', { leadId, spreadsheetId });
      return existing as Promise<T>;
    }

    const promise = operation().finally(() => {
      googleSheetSyncInFlight.delete(key);
    });

    googleSheetSyncInFlight.set(key, promise);
    return promise;
  }

  function columnNumberToLetter(columnNumber: number): string {
    let result = '';
    while (columnNumber > 0) {
      const remainder = (columnNumber - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      columnNumber = Math.floor((columnNumber - 1) / 26);
    }
    return result;
  }

  // Google Sheets synchronization.
  // Sheet layout:
  //   Row 1 = Date + the questions/field labels actually answered by users
  //   Row 2+ = one row per NEW lead
  // Internal metadata such as lead ID, bot ID, source URL, status, etc. is never
  // written to the user-facing lead data tab.
  async function syncLeadToGoogleSheets(tokens: any, rawSpreadsheetId: string, worksheetName = 'Sheet1', lead: any) {
    const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
    if (!tokens || !spreadsheetId) throw new Error('Missing tokens or valid spreadsheetId');

    const leadKey = String(lead.id || `anonymous_${Date.now()}`);

    return withGoogleSheetLeadLock(spreadsheetId, leadKey, async () => {
      const auth = createOAuth2Client(tokens);
      const sheets = google.sheets({ version: 'v4', auth });
      let targetWorksheet = worksheetName || 'Sheet1';

      try {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: 'sheets.properties.title'
        });
        const titles = (meta.data.sheets || [])
          .map((s: any) => s.properties?.title)
          .filter(Boolean) as string[];

        if (titles.length > 0 && !titles.includes(targetWorksheet)) {
          targetWorksheet = titles[0];
        }

        // Preserve the old metadata-heavy tab. Future lead data goes to a clean tab.
        const headerCheck = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${targetWorksheet}'!A1:ZZ2`
        });
        const firstRow = headerCheck.data.values?.[0] || [];
        const legacyHeaders = new Set([
          'timestamp', 'all captured fields', 'lead id', 'bot id', 'bot name',
          'status', 'source url', 'conversation id', 'user id', 'client / account'
        ]);
        const hasLegacyLayout = firstRow.some((value: any) => legacyHeaders.has(String(value || '').trim().toLowerCase()));

        if (hasLegacyLayout) {
          const cleanTabName = 'Lead Data';
          if (!titles.includes(cleanTabName)) {
            const addSheetResponse = await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: {
                requests: [{ addSheet: { properties: { title: cleanTabName } } }]
              }
            });
            targetWorksheet = addSheetResponse.data.replies?.[0]?.addSheet?.properties?.title || cleanTabName;
            console.log('[SHEETS_CLEAN_TAB_CREATED]', { spreadsheetId, targetWorksheet });
          } else {
            targetWorksheet = cleanTabName;
          }
        }
      } catch (err: any) {
        const code = String(err?.code || '').toLowerCase();
        const msg = String(err?.message || err).toLowerCase();
        if (code === '401' || code === '403' || msg.includes('invalid_grant') || msg.includes('unauthorized_client') || msg.includes('invalid_client')) {
          if (msg.includes('invalid_grant') || msg.includes('unauthorized_client') || msg.includes('invalid_client')) {
            const oauthErr: any = new Error('Google Account authorization expired. Please re-authorize your Google account.');
            oauthErr.code = 'invalid_grant';
            oauthErr.reconnectRequired = true;
            throw oauthErr;
          }
        }
        throw err;
      }

      let existingRows: any[][] = [];
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${targetWorksheet}'!A1:ZZ1000`
        });
        existingRows = response.data.values || [];
      } catch (err: any) {
        const msg = String(err?.message || err).toLowerCase();
        if (msg.includes('invalid_grant') || msg.includes('unauthorized_client') || msg.includes('invalid_client')) {
          const oauthErr: any = new Error('Google Account authorization expired. Please re-authorize your Google account.');
          oauthErr.code = 'invalid_grant';
          oauthErr.reconnectRequired = true;
          throw oauthErr;
        }
        throw err;
      }

      // IMPORTANT: only the actual chatbot-captured fields are sent to Sheets.
      // We intentionally do not inspect lead.data because it may contain internal data.
      const fieldValues = new Map<string, string>();
      if (Array.isArray(lead.fields)) {
        for (const field of lead.fields) {
          const label = String(field?.label ?? '').replace(/\s+/g, ' ').trim();
          const value = field?.value == null ? '' : String(field.value).trim();
          if (!label || !value) continue;
          if (!fieldValues.has(label)) fieldValues.set(label, value);
        }
      }

      if (fieldValues.size === 0) {
        return {
          success: true,
          action: 'skipped_no_user_fields',
          updatedRange: null,
          rowNumber: null,
          spreadsheetId,
          worksheetName: targetWorksheet,
          fields: []
        };
      }

      const existingHeaders = (existingRows[0] || [])
        .map((h: any) => String(h ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      // Clean schema: Date + one column per question/field label.
      let headers = existingHeaders.length > 0 ? [...existingHeaders] : ['Date'];

      // If the newly-created clean tab is empty, start it with Date.
      if (headers.length === 1 && headers[0].toLowerCase() !== 'date' && existingRows.length === 0) {
        headers = ['Date'];
      }

      // If the tab is empty but has no header, create Date first.
      if (headers.length === 0) headers = ['Date'];

      // Remove any old metadata if this is somehow still present after tab selection.
      // These are internal/legacy metadata columns. Do NOT treat normal
      // captured fields such as Name, Email, or Phone as legacy columns.
      const forbidden = new Set([
        'timestamp',
        'all captured fields',
        'lead id',
        'bot id',
        'bot name',
        'status',
        'source url',
        'conversation id',
        'user id',
        'client / account'
      ]);
      const isLegacyHeaderStillPresent = headers.some(h => forbidden.has(h.toLowerCase()));
      if (isLegacyHeaderStillPresent) {
        throw new Error('Configured Google Sheet tab uses the old lead metadata layout. The clean Lead Data tab should be used.');
      }

      for (const label of fieldValues.keys()) {
        if (!headers.some(h => h.toLowerCase() === label.toLowerCase())) {
          headers.push(label);
        }
      }

      const previousHeaderRow = existingRows[0] || [];
      if (JSON.stringify(previousHeaderRow) !== JSON.stringify(headers)) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${targetWorksheet}'!1:1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [headers] }
        });
      }

      const submittedDate = new Date(lead.submittedAt || lead.timestamp || Date.now());
      const dateValue = Number.isNaN(submittedDate.getTime())
        ? new Date().toISOString().slice(0, 10)
        : submittedDate.toISOString().slice(0, 10);

      const rowValues = headers.map(header => {
        if (header.toLowerCase() === 'date') return dateValue;
        for (const [label, value] of fieldValues.entries()) {
          if (label.toLowerCase() === header.toLowerCase()) return value;
        }
        return '';
      });

      // ALWAYS APPEND for a genuine new lead. Existing rows are never overwritten.
      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${targetWorksheet}'`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] }
      });

      const updatedRange = appendRes.data.updates?.updatedRange || null;
      console.log('[GOOGLE_SHEET_LEAD_APPENDED]', {
        leadId: lead.id,
        spreadsheetId,
        worksheet: targetWorksheet,
        updatedRange,
        fieldCount: fieldValues.size,
        fields: Array.from(fieldValues.keys())
      });

      return {
        success: true,
        action: 'appended',
        updatedRange,
        spreadsheetId,
        worksheetName: targetWorksheet,
        fields: Array.from(fieldValues.keys())
      };
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

      const syncResult = await syncLeadToGoogleSheets(tokens, spreadsheetId, worksheetName || 'Sheet1', leadObj);
      res.json({
        success: true,
        action: syncResult?.action || 'synced',
        updatedRange: syncResult?.updatedRange || null,
        rowNumber: syncResult?.rowNumber || null,
        spreadsheetId: extractSpreadsheetId(spreadsheetId),
        worksheetName: syncResult?.worksheetName || worksheetName || 'Sheet1'
      });
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
    const { id, name, nodes, edges, spreadsheetId, createdBy, googleOwnerId, worksheetName, designConfig } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Bot ID is required' });
    }

    const existing = serverBotsMap.get(id);
    const botObj = {
      id,
      name: name || existing?.name || 'Unnamed Bot',
      nodes: Array.isArray(nodes) ? nodes : (existing?.nodes || []),
      edges: Array.isArray(edges) ? edges : (existing?.edges || []),
      spreadsheetId: spreadsheetId !== undefined ? spreadsheetId : (existing?.spreadsheetId || ''),
      worksheetName: worksheetName || existing?.worksheetName || 'Sheet1',
      createdBy: createdBy || existing?.createdBy || existing?.clientId || existing?.ownerId || 'guest_user',
      googleOwnerId: googleOwnerId || existing?.googleOwnerId || createdBy || existing?.createdBy || '',
      designConfig: designConfig || existing?.designConfig || undefined,
      updatedAt: new Date().toISOString()
    };

    serverBotsMap.set(id, botObj);
    saveBotsToFile();
    broadcastEvent('BOT_SAVED', botObj);

    if (spreadsheetId) {
      autoSyncPendingLeads(id).catch(() => null);
    }

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

  // Permanently Delete Bot Configuration on Server & Firestore
  async function deleteBotPermanently(botId: string) {
    const cleanId = (botId || '').trim();
    if (!cleanId) return false;

    // 1. Remove from server in-memory map
    serverBotsMap.delete(cleanId);

    const lowerId = cleanId.toLowerCase();
    for (const [key, value] of serverBotsMap.entries()) {
      if (key.toLowerCase() === lowerId || (value && value.id && value.id.toLowerCase() === lowerId)) {
        serverBotsMap.delete(key);
      }
    }

    // 2. Persist updated bots list to public/bots.json
    saveBotsToFile();

    // 3. Delete from Firestore if db is active
    if (db) {
      try {
        await deleteDoc(doc(db, 'bot_configurations', cleanId)).catch(() => null);
        const q = query(collection(db, 'bot_configurations'), where('id', '==', cleanId));
        const qSnap = await getDocs(q).catch(() => null);
        if (qSnap && !qSnap.empty) {
          for (const d of qSnap.docs) {
            await deleteDoc(doc(db, 'bot_configurations', d.id)).catch(() => null);
          }
        }
      } catch (err) {
        console.warn('[BOT_DELETE_WARNING] Firestore deletion warning:', err);
      }
    }

    // 4. Broadcast SSE Event so dashboards update live
    broadcastEvent('BOT_DELETED', { botId: cleanId });
    return true;
  }

  app.delete('/api/bots/:id', async (req, res) => {
    const { id } = req.params;
    await deleteBotPermanently(id);
    res.json({ success: true, deletedId: id });
  });

  app.post('/api/bots/delete', async (req, res) => {
    const { id, botId } = req.body || {};
    const targetId = id || botId;
    if (!targetId) {
      return res.status(400).json({ error: 'Bot ID is required' });
    }
    await deleteBotPermanently(targetId);
    res.json({ success: true, deletedId: targetId });
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
          if (data) {
            return {
              botId: cleanBotId,
              botName: data.name || data.botName || 'Chatbot',
              clientId: data.createdBy || data.clientId || data.ownerId || 'demo_user',
              googleOwnerId: data.googleOwnerId || data.createdBy || data.clientId || data.ownerId || '',
              spreadsheetId: data.spreadsheetId || data.spreadsheet_id || '',
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
          if (docData) {
            return {
              botId: cleanBotId,
              botName: docData.name || docData.botName || 'Chatbot',
              clientId: docData.createdBy || docData.clientId || docData.ownerId || 'demo_user',
              googleOwnerId: docData.googleOwnerId || docData.createdBy || docData.clientId || docData.ownerId || '',
              spreadsheetId: docData.spreadsheetId || docData.spreadsheet_id || '',
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
              return {
                botId: data.id || cleanBotId,
                botName: data.name || 'Chatbot',
                clientId: data.createdBy || data.clientId || data.ownerId || 'demo_user',
                googleOwnerId: data.googleOwnerId || data.createdBy || data.clientId || data.ownerId || '',
                spreadsheetId: data.spreadsheetId || data.spreadsheet_id || '',
                worksheetName: data.worksheetName || 'Sheet1'
              };
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
      if (b) {
        return {
          botId: cleanBotId,
          botName: b.name || 'Chatbot',
          clientId: b.createdBy || b.clientId || b.ownerId || 'demo_user',
          googleOwnerId: b.googleOwnerId || b.createdBy || b.clientId || b.ownerId || '',
          spreadsheetId: b.spreadsheetId || b.spreadsheet_id || '',
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
        googleOwnerId: found.googleOwnerId || found.createdBy || found.clientId || found.ownerId || '',
        spreadsheetId: found.spreadsheetId || found.spreadsheet_id || '',
        worksheetName: found.worksheetName || 'Sheet1'
      };
    }

    // Always return fallback bot configuration so lead capture never fails or drops
    return {
      botId: cleanBotId || 'default_bot',
      botName: cleanBotId.toLowerCase().includes('river') ? 'River Scape Residences' : (cleanBotId.toLowerCase().includes('risinia') ? 'Risinia Builders' : 'Chatbot'),
      clientId: 'demo_user',
      googleOwnerId: '',
      spreadsheetId: '',
      worksheetName: 'Sheet1'
    };
  }

  // Resolve Google Sheets credentials only for the explicit Google owner of the bot.
  async function resolveClientGoogleSheetsConfig(
    clientId: string,
    botSpreadsheetId?: string,
    botWorksheetName?: string,
    googleOwnerId?: string
  ) {
    let googleTokens: any = null;
    let spreadsheetId = extractSpreadsheetId(botSpreadsheetId) || '';
    let worksheetName = botWorksheetName || 'Sheet1';
    const ownerId = (googleOwnerId || clientId || '').trim();

    if (db && ownerId) {
      try {
        const ownerDoc = await getDoc(doc(db, 'users', ownerId)).catch(() => null);
        if (ownerDoc?.exists()) {
          const data = ownerDoc.data();
          googleTokens = data.googleTokens || null;
          if (!spreadsheetId && data.spreadsheetId) spreadsheetId = extractSpreadsheetId(data.spreadsheetId);
          if (!botWorksheetName && data.worksheetName) worksheetName = data.worksheetName;
        }
      } catch (e) {
        console.warn('[GOOGLE_CONFIG_OWNER_LOOKUP_WARNING]', { ownerId, error: String(e) });
      }
    }

    if (!googleTokens && ownerId && userTokens.has(ownerId)) googleTokens = userTokens.get(ownerId);
    if (!googleTokens && clientId && clientId !== 'demo_user' && clientId !== 'guest_user' && userTokens.has(clientId)) {
      googleTokens = userTokens.get(clientId);
    }

    if (!spreadsheetId && process.env.GOOGLE_SPREADSHEET_ID) spreadsheetId = extractSpreadsheetId(process.env.GOOGLE_SPREADSHEET_ID);
    if (!spreadsheetId && process.env.SPREADSHEET_ID) spreadsheetId = extractSpreadsheetId(process.env.SPREADSHEET_ID);

    return { googleTokens, spreadsheetId, worksheetName, googleOwnerId: ownerId };
  }

  // Dynamic Background Auto-Sync Engine for Pending Leads
  async function autoSyncPendingLeads(specificBotId?: string, specificClientId?: string) {
    loadLeadsFromFile();
    let firestoreLeads: any[] = [];
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'leads')).catch(() => null);
        if (snap && !snap.empty) {
          firestoreLeads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
      } catch (e) { }
    }

    const leadMap = new Map<string, any>();
    serverLeadsList.forEach(l => { if (l && l.id) leadMap.set(l.id, l); });
    firestoreLeads.forEach(l => { if (l && l.id) leadMap.set(l.id, l); });

    let leadsToProcess = Array.from(leadMap.values()).filter(l => l && l.googleSheetSyncStatus !== 'synced');

    if (specificBotId && specificBotId !== 'ALL') {
      leadsToProcess = leadsToProcess.filter(l => l.botId === specificBotId || l.flowId === specificBotId);
    }

    // IMPORTANT: when Google is re-authorized, the authenticated Google owner UID
    // may differ from the public lead's clientId (for example, clientId=demo_user).
    // Do not filter pending leads only by clientId; resolve the bot owner below.

    if (leadsToProcess.length === 0) return { processed: 0, synced: 0 };

    console.log('[AUTO_SYNC_PENDING_START]', { count: leadsToProcess.length, specificBotId, specificClientId });

    let syncedCount = 0;
    for (const lead of leadsToProcess) {
      try {
        const botId = lead.botId || lead.flowId;
        const resolvedBot = await resolveBotAndOwner(botId);
        const leadOwnerId = lead.googleOwnerId || resolvedBot?.googleOwnerId || lead.clientId || lead.ownerId || '';

        // When called after OAuth reconnect, only process leads belonging to that
        // Google owner. This also catches legacy leads whose clientId is demo_user.
        if (specificClientId && specificClientId !== 'ALL' && specificClientId !== 'admin') {
          const ownerMatches =
            leadOwnerId === specificClientId ||
            lead.clientId === specificClientId ||
            lead.ownerId === specificClientId ||
            resolvedBot?.googleOwnerId === specificClientId;

          if (!ownerMatches) continue;
        }

        const clientId = lead.clientId || lead.ownerId || (resolvedBot ? resolvedBot.clientId : 'demo_user');
        const sheetConfig = await resolveClientGoogleSheetsConfig(clientId, resolvedBot?.spreadsheetId, resolvedBot?.worksheetName, resolvedBot?.googleOwnerId || lead.googleOwnerId);

        if (sheetConfig.googleTokens && sheetConfig.spreadsheetId) {
          const syncResult = await syncLeadToGoogleSheets(sheetConfig.googleTokens, sheetConfig.spreadsheetId, sheetConfig.worksheetName, lead);
          lead.googleSheetSyncStatus = 'synced';
          lead.googleSheetSyncAction = syncResult?.action || 'synced';
          lead.googleSheetSyncedAt = new Date().toISOString();
          lead.spreadsheetId = sheetConfig.spreadsheetId;
          lead.worksheetName = sheetConfig.worksheetName;
          lead.googleOwnerId = sheetConfig.googleOwnerId || resolvedBot?.googleOwnerId || lead.googleOwnerId || '';
          delete lead.googleSheetSyncError;

          const idx = serverLeadsList.findIndex(l => l.id === lead.id);
          if (idx !== -1) serverLeadsList[idx] = lead;
          else serverLeadsList.unshift(lead);

          if (db) {
            await setDoc(doc(db, 'leads', lead.id), {
              googleSheetSyncStatus: 'synced',
              googleSheetSyncedAt: lead.googleSheetSyncedAt,
              spreadsheetId: sheetConfig.spreadsheetId,
              worksheetName: sheetConfig.worksheetName,
              googleSheetSyncError: null
            }, { merge: true }).catch(() => null);
          }

          syncedCount++;
          broadcastEvent('LEAD_SYNCED', lead);
          console.log('[AUTO_SYNC_SUCCESS]', { leadId: lead.id, botId, spreadsheetId: sheetConfig.spreadsheetId });
        }
      } catch (err: any) {
        console.warn('[AUTO_SYNC_LEAD_FAILED]', { leadId: lead.id, error: err?.message || err });
      }
    }

    if (syncedCount > 0) {
      saveLeadsToFile();
    }

    console.log('[AUTO_SYNC_PENDING_END]', { processed: leadsToProcess.length, synced: syncedCount });
    return { processed: leadsToProcess.length, synced: syncedCount };
  }



  // Backend Lead Storage & Retrieval
  app.post('/api/leads', async (req, res) => {
    const leadPayload = req.body || {};
    const botId = leadPayload.botId || leadPayload.flowId;

    console.log('[LEAD_RECEIVED]', { botId, sourceUrl: leadPayload.sourceUrl, fieldsCount: Array.isArray(leadPayload.fields) ? leadPayload.fields.length : 0 });

    if (!botId) {
      return res.status(400).json({ success: false, error: 'botId is required.' });
    }

    const passedClientId = leadPayload.clientId || leadPayload.ownerId;
    const resolvedBot = await resolveBotAndOwner(botId);

    const clientId = passedClientId || (resolvedBot ? resolvedBot.clientId : 'demo_user') || 'demo_user';
    const botName = (resolvedBot && resolvedBot.botName) || leadPayload.botName || 'Chatbot';
    const userId = leadPayload.userId || leadPayload.chatUserId || '';
    const conversationId = leadPayload.conversationId || '';

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
    let extractedName = '';
    let extractedEmail = '';
    let extractedPhone = '';

    fields.forEach(f => {
      if (f.label) {
        flattenedData[f.label] = f.value;
        const lblLower = f.label.toLowerCase();
        if (lblLower.includes('name')) extractedName = f.value;
        if (lblLower.includes('email')) extractedEmail = f.value;
        if (lblLower.includes('phone') || lblLower.includes('mobile') || lblLower.includes('contact')) extractedPhone = f.value;
      }
    });

    loadLeadsFromFile();

    // Deduplication check: check by explicit ID, or (userId + conversationId), or (userId + botId)
    let existingLead: any = null;
    let leadId = leadPayload.id;

    if (leadId) {
      existingLead = serverLeadsList.find(l => l.id === leadId);
    }
    if (!existingLead && conversationId) {
      existingLead = serverLeadsList.find(l => l.conversationId === conversationId);
    }
    if (!existingLead && userId && botId) {
      existingLead = serverLeadsList.find(l => l.userId === userId && l.botId === botId);
    }
    if (!existingLead && db && conversationId) {
      try {
        const q = query(collection(db, 'leads'), where('conversationId', '==', conversationId));
        const qSnap = await getDocs(q).catch(() => null);
        if (qSnap && !qSnap.empty) {
          existingLead = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() };
        }
      } catch (e) { }
    }

    const nowIso = new Date().toISOString();
    const isUpdate = !!existingLead;

    if (existingLead) {
      leadId = existingLead.id;
    } else if (!leadId) {
      leadId = (conversationId ? `lead_${botId}_${conversationId}` : `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    }

    const leadRecord: any = {
      id: leadId,
      botId,
      flowId: botId,
      clientId,
      ownerId: clientId,
      googleOwnerId: resolvedBot?.googleOwnerId || existingLead?.googleOwnerId || '',
      userId: userId || existingLead?.userId || '',
      conversationId: conversationId || existingLead?.conversationId || '',
      botName,
      clientName: botName,
      name: extractedName || leadPayload.name || existingLead?.name || '',
      email: extractedEmail || leadPayload.email || existingLead?.email || '',
      phone: extractedPhone || leadPayload.phone || existingLead?.phone || '',
      status: existingLead?.status || leadPayload.status || 'New',
      fields,
      data: flattenedData,
      sourceUrl: leadPayload.sourceUrl || existingLead?.sourceUrl || '',
      source: leadPayload.source || existingLead?.source || 'Website Widget',
      referrer: leadPayload.referrer || existingLead?.referrer || '',
      submittedAt: leadPayload.submittedAt || existingLead?.submittedAt || nowIso,
      createdAt: existingLead?.createdAt || nowIso,
      updatedAt: nowIso,
      updatedBy: 'system',
      googleSheetSyncStatus: existingLead?.googleSheetSyncStatus || 'pending'
    };

    console.log('[LEAD_PERSISTENCE_START]', { leadId, clientId, botId, isUpdate });

    // Always persist to local memory & disk JSON file first
    const idx = serverLeadsList.findIndex(l => l.id === leadId);
    if (idx !== -1) {
      serverLeadsList[idx] = leadRecord;
    } else {
      serverLeadsList.unshift(leadRecord);
    }
    saveLeadsToFile();

    if (db) {
      try {
        await setDoc(doc(db, 'leads', leadId), leadRecord, { merge: true });
        console.log('[LEAD_PERSISTENCE_SUCCESS]', { leadId, clientId });
      } catch (fsErr: any) {
        console.warn('[LEAD_FIRESTORE_PERSISTENCE_WARNING]', { leadId, error: fsErr?.message || fsErr });
      }
    }

    console.log('[LEAD_CAPTURE]', {
      leadId,
      botId,
      clientId,
      sourceUrl: leadPayload.sourceUrl,
      fieldsCount: Array.isArray(leadPayload.fields) ? leadPayload.fields.length : 0
    });

    const sheetConfig = await resolveClientGoogleSheetsConfig(clientId, resolvedBot?.spreadsheetId, resolvedBot?.worksheetName, resolvedBot?.googleOwnerId);

    if (sheetConfig.googleTokens && sheetConfig.spreadsheetId) {
      try {
        const syncRes = await syncLeadToGoogleSheets(sheetConfig.googleTokens, sheetConfig.spreadsheetId, sheetConfig.worksheetName, leadRecord);
        leadRecord.googleSheetSyncStatus = 'synced';
        leadRecord.googleSheetSyncAction = syncRes?.action || 'synced';
        leadRecord.googleSheetSyncedAt = new Date().toISOString();
        leadRecord.spreadsheetId = sheetConfig.spreadsheetId;
        leadRecord.worksheetName = sheetConfig.worksheetName;
        delete leadRecord.googleSheetSyncError;

        if (db) {
          await setDoc(doc(db, 'leads', leadId), {
            googleSheetSyncStatus: 'synced',
            googleSheetSyncedAt: leadRecord.googleSheetSyncedAt,
            spreadsheetId: sheetConfig.spreadsheetId,
            worksheetName: sheetConfig.worksheetName,
            googleSheetSyncError: null
          }, { merge: true }).catch(() => null);
        }
        saveLeadsToFile();
      } catch (syncErr: any) {
        console.error('[GOOGLE_SHEET_SYNC_FAILED]', { leadId, botId, spreadsheetId: sheetConfig.spreadsheetId, error: syncErr?.message || syncErr });
        leadRecord.googleSheetSyncStatus = 'failed';
        leadRecord.googleSheetSyncError = syncErr?.message || 'Sync failed';
        leadRecord.spreadsheetId = sheetConfig.spreadsheetId;
        leadRecord.worksheetName = sheetConfig.worksheetName;

        if (db) {
          await setDoc(doc(db, 'leads', leadId), {
            googleSheetSyncStatus: 'failed',
            googleSheetSyncError: leadRecord.googleSheetSyncError,
            spreadsheetId: sheetConfig.spreadsheetId,
            worksheetName: sheetConfig.worksheetName
          }, { merge: true }).catch(() => null);
        }
        saveLeadsToFile();
      }
    } else {
      console.log('[GOOGLE_SHEET_SYNC_FAILED]', { leadId, botId, error: 'Google Account or Spreadsheet not connected for this bot' });
      leadRecord.googleSheetSyncStatus = 'not_configured';
      if (db) {
        await setDoc(doc(db, 'leads', leadId), { googleSheetSyncStatus: 'not_configured' }, { merge: true }).catch(() => null);
      }
      saveLeadsToFile();
    }

    broadcastEvent(isUpdate ? 'LEAD_UPDATED' : 'LEAD_CAPTURED', leadRecord);

    if (leadRecord.googleSheetSyncStatus !== 'synced') {
      autoSyncPendingLeads(botId, clientId).catch(() => null);
    }

    return res.json({
      success: true,
      leadId,
      isUpdate,
      googleSheetSync: {
        status: leadRecord.googleSheetSyncStatus,
        spreadsheetId: sheetConfig.spreadsheetId || null,
        worksheetName: sheetConfig.worksheetName || null,
        action: leadRecord.googleSheetSyncAction || null,
        error: leadRecord.googleSheetSyncError || null
      }
    });
  });

  // Update Lead Status Endpoint
  app.post('/api/leads/status', async (req, res) => {
    const { leadId, id, status, updatedBy } = req.body || {};
    const targetId = leadId || id;
    const cleanStatus = (status || '').trim();

    if (!targetId || !cleanStatus) {
      return res.status(400).json({ success: false, error: 'leadId and status are required.' });
    }

    const validStatuses = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
    if (!validStatuses.includes(cleanStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    }

    loadLeadsFromFile();
    const nowIso = new Date().toISOString();
    let lead: any = serverLeadsList.find(l => l.id === targetId || l.docId === targetId);

    if (!lead && db) {
      try {
        const lSnap = await getDoc(doc(db, 'leads', targetId));
        if (lSnap.exists()) {
          lead = { id: lSnap.id, ...lSnap.data() };
        }
      } catch (e) { }
    }

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }

    lead.status = cleanStatus;
    lead.updatedAt = nowIso;
    lead.updatedBy = updatedBy || 'user';

    const idx = serverLeadsList.findIndex(l => l.id === targetId || l.docId === targetId);
    if (idx !== -1) {
      serverLeadsList[idx] = lead;
    } else {
      serverLeadsList.unshift(lead);
    }
    saveLeadsToFile();

    if (db) {
      try {
        await setDoc(doc(db, 'leads', targetId), {
          status: cleanStatus,
          updatedAt: nowIso,
          updatedBy: lead.updatedBy
        }, { merge: true });
      } catch (fsErr) {
        console.warn('[LEAD_STATUS_UPDATE] Firestore warning:', fsErr);
      }
    }

    broadcastEvent('LEAD_UPDATED', lead);
    return res.json({ success: true, lead });
  });

  app.patch('/api/leads/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, updatedBy } = req.body || {};
    const cleanStatus = (status || '').trim();

    if (!id || !cleanStatus) {
      return res.status(400).json({ success: false, error: 'id and status are required.' });
    }

    const validStatuses = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
    if (!validStatuses.includes(cleanStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    }

    loadLeadsFromFile();
    const nowIso = new Date().toISOString();
    let lead: any = serverLeadsList.find(l => l.id === id || l.docId === id);

    if (!lead && db) {
      try {
        const lSnap = await getDoc(doc(db, 'leads', id));
        if (lSnap.exists()) lead = { id: lSnap.id, ...lSnap.data() };
      } catch (e) { }
    }

    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found.' });

    lead.status = cleanStatus;
    lead.updatedAt = nowIso;
    lead.updatedBy = updatedBy || 'user';

    const idx = serverLeadsList.findIndex(l => l.id === id || l.docId === id);
    if (idx !== -1) serverLeadsList[idx] = lead;
    else serverLeadsList.unshift(lead);
    saveLeadsToFile();

    if (db) {
      await setDoc(doc(db, 'leads', id), { status: cleanStatus, updatedAt: nowIso, updatedBy: lead.updatedBy }, { merge: true }).catch(() => null);
    }
    broadcastEvent('LEAD_UPDATED', lead);
    return res.json({ success: true, lead });
  });

  // Alias endpoint for fetching lead conversation transcript
  app.get('/api/leads/conversation/:conversationId', async (req, res) => {
    const { conversationId } = req.params;
    loadChatbotStoreFromFile();

    let conversation = serverConversationsMap.get(conversationId);
    let messages = serverMessagesMap.get(conversationId) || [];

    if (db) {
      try {
        if (!conversation) {
          const cSnap = await getDoc(doc(db, 'conversations', conversationId)).catch(() => null);
          if (cSnap && cSnap.exists()) {
            conversation = { id: cSnap.id, ...cSnap.data() };
          }
        }
        const mSnap = await getDocs(collection(db, 'conversations', conversationId, 'messages')).catch(() => null);
        if (mSnap && !mSnap.empty) {
          const fsMsgs = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const mSet = new Map<string, any>();
          messages.forEach(m => mSet.set(m.id, m));
          fsMsgs.forEach(m => mSet.set(m.id, m));
          messages = Array.from(mSet.values());
        }
      } catch (e) { }
    }

    messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return res.json({
      success: true,
      conversationId,
      conversation,
      messages
    });
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

    // Auto-sync any unsynced leads in background when dashboard loads/fetches leads
    if (allLeads.some(l => l && l.googleSheetSyncStatus !== 'synced')) {
      autoSyncPendingLeads(targetBot as string, targetOwner as string).catch(() => null);
    }

    res.json({ success: true, leads: allLeads });
  });

  // Permanently Delete Lead Record on Server & Firestore
  async function deleteLeadPermanently(leadId: string) {
    const cleanId = (leadId || '').trim();
    if (!cleanId) return false;

    // 1. Remove from server in-memory list
    loadLeadsFromFile();
    let removed = false;
    for (let i = serverLeadsList.length - 1; i >= 0; i--) {
      if (serverLeadsList[i] && (serverLeadsList[i].id === cleanId || serverLeadsList[i].docId === cleanId)) {
        serverLeadsList.splice(i, 1);
        removed = true;
      }
    }

    // 2. Persist updated leads to leads.json file
    saveLeadsToFile();

    // 3. Delete from Cloud Firestore
    if (db) {
      try {
        await deleteDoc(doc(db, 'leads', cleanId)).catch(() => null);
        const q = query(collection(db, 'leads'), where('id', '==', cleanId));
        const qSnap = await getDocs(q).catch(() => null);
        if (qSnap && !qSnap.empty) {
          for (const d of qSnap.docs) {
            await deleteDoc(doc(db, 'leads', d.id)).catch(() => null);
          }
        }
      } catch (err) {
        console.warn('[LEAD_DELETE_WARNING] Firestore deletion warning:', err);
      }
    }

    // 4. Broadcast SSE Event so connected dashboards update instantly
    broadcastEvent('LEAD_DELETED', { leadId: cleanId });
    return true;
  }

  app.delete('/api/leads/:id', async (req, res) => {
    const { id } = req.params;
    await deleteLeadPermanently(id);
    res.json({ success: true, deletedId: id });
  });

  app.post('/api/leads/delete', async (req, res) => {
    const { id, leadId } = req.body || {};
    const targetId = id || leadId;
    if (!targetId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }
    await deleteLeadPermanently(targetId);
    res.json({ success: true, deletedId: targetId });
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
    const googleOwnerId = lead.googleOwnerId || resolvedBot?.googleOwnerId || '';

    if (!clientId && !googleOwnerId) {
      return res.status(400).json({ success: false, error: 'Could not resolve client owner for lead.' });
    }

    const sheetConfig = await resolveClientGoogleSheetsConfig(clientId || googleOwnerId, resolvedBot?.spreadsheetId, resolvedBot?.worksheetName, googleOwnerId || resolvedBot?.googleOwnerId);

    if (!sheetConfig.googleTokens || !sheetConfig.spreadsheetId) {
      return res.status(400).json({ success: false, error: 'Google Account or Spreadsheet not connected for client.' });
    }

    console.log('[GOOGLE_SHEET_RETRY_SYNC]', { leadId, spreadsheetId: sheetConfig.spreadsheetId, worksheet: sheetConfig.worksheetName });

    try {
      const syncResult = await syncLeadToGoogleSheets(sheetConfig.googleTokens, sheetConfig.spreadsheetId, sheetConfig.worksheetName, lead);
      lead.googleSheetSyncStatus = 'synced';
      lead.googleSheetSyncAction = syncResult?.action || 'synced';
      lead.googleSheetSyncedAt = new Date().toISOString();
      lead.googleOwnerId = sheetConfig.googleOwnerId || resolvedBot?.googleOwnerId || lead.googleOwnerId || '';
      lead.spreadsheetId = sheetConfig.spreadsheetId;
      lead.worksheetName = sheetConfig.worksheetName;
      delete lead.googleSheetSyncError;

      if (db) {
        await setDoc(doc(db, 'leads', leadId), {
          googleSheetSyncStatus: 'synced',
          googleSheetSyncedAt: lead.googleSheetSyncedAt,
          googleSheetSyncError: null,
          googleOwnerId: lead.googleOwnerId || null,
          spreadsheetId: lead.spreadsheetId || null,
          worksheetName: lead.worksheetName || null
        }, { merge: true }).catch(() => null);
      }

      loadLeadsFromFile();
      const idx = serverLeadsList.findIndex(l => l.id === leadId);
      if (idx !== -1) serverLeadsList[idx] = lead;
      saveLeadsToFile();

      broadcastEvent('LEAD_SYNCED', lead);
      console.log('[GOOGLE_SHEET_SYNC_SUCCESS]', { leadId, action: lead.googleSheetSyncAction || 'synced' });
      res.json({ success: true, lead, action: lead.googleSheetSyncAction || 'synced' });
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
    const { clientId, googleOwnerId, botId, botIds } = req.body || {};
    const targetClientId = (clientId || req.query.clientId || '') as string;
    const targetGoogleOwnerId = (googleOwnerId || req.query.googleOwnerId || '') as string;
    const requestedBotIds: string[] = Array.isArray(botIds) ? botIds.map((x: any) => String(x)) : (botId ? [String(botId)] : []);

    console.log('[SYNC_ALL_START]', { targetClientId, targetGoogleOwnerId, requestedBotIds });

    let firestoreLeads: any[] = [];
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'leads'));
        firestoreLeads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e: any) {
        console.error('[SYNC_ALL_FIRESTORE_QUERY_ERROR]', e?.message || e);
      }
    }

    loadLeadsFromFile();
    const map = new Map<string, any>();
    serverLeadsList.forEach(l => { if (l && l.id) map.set(l.id, l); });
    firestoreLeads.forEach(l => { if (l && l.id) map.set(l.id, l); });

    const allLeads = Array.from(map.values());
    const clientLeads: any[] = [];

    // Build the sync set using explicit bot/Google-owner mapping. This is crucial
    // for legacy public-widget leads that still carry clientId=demo_user.
    for (const lead of allLeads) {
      if (!lead || lead.googleSheetSyncStatus === 'synced') continue;

      const leadBotId = lead.botId || lead.flowId || '';
      if (requestedBotIds.length > 0 && !requestedBotIds.includes(leadBotId)) continue;

      if (targetGoogleOwnerId) {
        const resolvedBot = await resolveBotAndOwner(leadBotId);
        const ownerMatches =
          lead.googleOwnerId === targetGoogleOwnerId ||
          resolvedBot?.googleOwnerId === targetGoogleOwnerId;
        if (!ownerMatches) continue;
      } else if (targetClientId && targetClientId !== 'ALL') {
        if (lead.clientId !== targetClientId && lead.ownerId !== targetClientId) continue;
      }

      clientLeads.push(lead);
    }

    const total = clientLeads.length;
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
      const sheetConfig = await resolveClientGoogleSheetsConfig(
        lead.clientId || targetClientId || resolvedBot?.clientId || 'demo_user',
        resolvedBot?.spreadsheetId,
        resolvedBot?.worksheetName,
        targetGoogleOwnerId || lead.googleOwnerId || resolvedBot?.googleOwnerId
      );

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
        const syncResult = await syncLeadToGoogleSheets(sheetConfig.googleTokens, sheetConfig.spreadsheetId, sheetConfig.worksheetName, lead);
        lead.googleSheetSyncStatus = 'synced';
        lead.googleSheetSyncAction = syncResult?.action || 'synced';
        lead.googleSheetSyncedAt = new Date().toISOString();
        delete lead.googleSheetSyncError;

        lead.googleOwnerId = sheetConfig.googleOwnerId || resolvedBot?.googleOwnerId || lead.googleOwnerId || '';

        if (db) {
          await setDoc(doc(db, 'leads', lead.id), {
            googleSheetSyncStatus: 'synced',
            googleSheetSyncedAt: lead.googleSheetSyncedAt,
            googleSheetSyncError: null,
            googleOwnerId: lead.googleOwnerId || null,
            spreadsheetId: sheetConfig.spreadsheetId,
            worksheetName: sheetConfig.worksheetName
          }, { merge: true }).catch(() => null);
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

  // ==========================================
  // Chatbot User & Conversation Tracking Engine
  // ==========================================

  const CHATBOT_USERS_FILE = path.join(process.cwd(), 'public', 'chatbot_users.json');
  const CONVERSATIONS_FILE = path.join(process.cwd(), 'public', 'conversations.json');
  const MESSAGES_FILE = path.join(process.cwd(), 'public', 'messages.json');

  const serverChatbotUsersMap = new Map<string, any>();
  const serverConversationsMap = new Map<string, any>();
  const serverMessagesMap = new Map<string, any[]>(); // conversationId -> messages array

  function loadChatbotStoreFromFile() {
    try {
      if (fs.existsSync(CHATBOT_USERS_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(CHATBOT_USERS_FILE, 'utf-8'));
        if (Array.isArray(parsed)) parsed.forEach(u => u && u.id && serverChatbotUsersMap.set(u.id, u));
      }
      if (fs.existsSync(CONVERSATIONS_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf-8'));
        if (Array.isArray(parsed)) parsed.forEach(c => c && c.id && serverConversationsMap.set(c.id, c));
      }
      if (fs.existsSync(MESSAGES_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([cId, msgs]) => {
            if (Array.isArray(msgs)) serverMessagesMap.set(cId, msgs);
          });
        }
      }
    } catch (e) {
      console.warn('[CHATBOT_STORE] Load file warning:', e);
    }
  }

  loadChatbotStoreFromFile();

  function saveChatbotStoreToFile() {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

      const usersArr = Array.from(serverChatbotUsersMap.values());
      fs.writeFileSync(CHATBOT_USERS_FILE, JSON.stringify(usersArr, null, 2), 'utf-8');

      const convArr = Array.from(serverConversationsMap.values());
      fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(convArr, null, 2), 'utf-8');

      const msgsObj: Record<string, any[]> = {};
      serverMessagesMap.forEach((v, k) => { msgsObj[k] = v; });
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgsObj, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[CHATBOT_STORE] Save file warning:', e);
    }
  }

  // Data Validation Helpers
  function isValidEmail(email?: string): boolean {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function isValidPhone(phone?: string): boolean {
    if (!phone) return false;
    return /^[+\d\s\-()]{7,20}$/.test(phone.trim());
  }

  function cleanString(str?: string, maxLen: number = 5000): string {
    if (!str) return '';
    return String(str).trim().substring(0, maxLen);
  }

  // 1. Session / Identify User & Conversation Endpoint
  app.post('/api/chatbot/session', async (req, res) => {
    const { userId: providedUserId, botId, name, email, phone, source, consent } = req.body || {};
    const cleanBotId = cleanString(botId || 'default_bot', 100);
    const cleanName = cleanString(name, 200);
    const cleanEmail = isValidEmail(email) ? email!.trim().toLowerCase() : (email ? cleanString(email, 200) : '');
    const cleanPhone = isValidPhone(phone) ? phone!.trim() : (phone ? cleanString(phone, 50) : '');
    const cleanSource = cleanString(source || (req.headers.referer || 'Direct Widget'), 500);

    let targetUserId = providedUserId ? cleanString(providedUserId, 100) : '';

    loadChatbotStoreFromFile();
    const nowIso = new Date().toISOString();

    let userRecord: any = null;

    // Search existing user by ID or Email/Phone if available to prevent duplicates
    if (targetUserId && serverChatbotUsersMap.has(targetUserId)) {
      userRecord = serverChatbotUsersMap.get(targetUserId);
    } else if (cleanEmail || cleanPhone) {
      for (const u of serverChatbotUsersMap.values()) {
        if ((cleanEmail && u.email && u.email.toLowerCase() === cleanEmail) ||
          (cleanPhone && u.phone && u.phone === cleanPhone)) {
          userRecord = u;
          targetUserId = u.id;
          break;
        }
      }
    }

    // Try Firestore lookup if not found in memory
    if (!userRecord && db) {
      try {
        if (targetUserId) {
          const uSnap = await getDoc(doc(db, 'chatbot_users', targetUserId)).catch(() => null);
          if (uSnap && uSnap.exists()) {
            userRecord = { id: uSnap.id, ...uSnap.data() };
          }
        }
        if (!userRecord && (cleanEmail || cleanPhone)) {
          const qSnap = await getDocs(collection(db, 'chatbot_users')).catch(() => null);
          if (qSnap && !qSnap.empty) {
            const matched = qSnap.docs.find(d => {
              const dData = d.data();
              return (cleanEmail && dData.email && dData.email.toLowerCase() === cleanEmail) ||
                (cleanPhone && dData.phone && dData.phone === cleanPhone);
            });
            if (matched) {
              userRecord = { id: matched.id, ...matched.data() };
              targetUserId = matched.id;
            }
          }
        }
      } catch (e) {
        console.warn('[CHATBOT_SESSION] Firestore lookup error:', e);
      }
    }

    let isNewUser = false;
    if (!userRecord) {
      isNewUser = true;
      if (!targetUserId) {
        targetUserId = 'cb_user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      }
      userRecord = {
        id: targetUserId,
        name: cleanName || 'Anonymous Visitor',
        email: cleanEmail || '',
        phone: cleanPhone || '',
        createdAt: nowIso,
        lastActiveAt: nowIso,
        status: 'active',
        totalConversations: 1,
        totalMessages: 0,
        source: cleanSource,
        consent: consent !== undefined ? Boolean(consent) : true,
        metadata: {}
      };
    } else {
      userRecord.lastActiveAt = nowIso;
      if (cleanName && (!userRecord.name || userRecord.name === 'Anonymous Visitor')) userRecord.name = cleanName;
      if (cleanEmail && !userRecord.email) userRecord.email = cleanEmail;
      if (cleanPhone && !userRecord.phone) userRecord.phone = cleanPhone;
    }

    // Persist User
    serverChatbotUsersMap.set(targetUserId, userRecord);
    if (db) {
      await setDoc(doc(db, 'chatbot_users', targetUserId), userRecord, { merge: true }).catch(() => null);
      // Also update standard users collection for unified admin view
      await setDoc(doc(db, 'users', targetUserId), {
        displayName: userRecord.name,
        email: userRecord.email,
        phone: userRecord.phone,
        lastActiveAt: nowIso,
        role: 'user',
        isChatbotUser: true
      }, { merge: true }).catch(() => null);
    }

    // Create or find active conversation for user
    let activeConvId = '';
    const userConvs = Array.from(serverConversationsMap.values()).filter(c => c.userId === targetUserId && c.botId === cleanBotId);
    if (userConvs.length > 0) {
      const sorted = userConvs.sort((a, b) => new Date(b.lastMessageAt || b.startedAt).getTime() - new Date(a.lastMessageAt || a.startedAt).getTime());
      const mostRecent = sorted[0];
      const timeDiffMs = new Date().getTime() - new Date(mostRecent.lastMessageAt || mostRecent.startedAt).getTime();
      // Resume conversation if active within last 2 hours
      if (timeDiffMs < 2 * 60 * 60 * 1000) {
        activeConvId = mostRecent.id;
      }
    }

    if (!activeConvId) {
      activeConvId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const convRecord = {
        id: activeConvId,
        userId: targetUserId,
        botId: cleanBotId,
        startedAt: nowIso,
        lastMessageAt: nowIso,
        status: 'active',
        messageCount: 0
      };
      serverConversationsMap.set(activeConvId, convRecord);
      if (db) {
        await setDoc(doc(db, 'conversations', activeConvId), convRecord).catch(() => null);
      }
      if (!isNewUser) {
        userRecord.totalConversations = (userRecord.totalConversations || 0) + 1;
        serverChatbotUsersMap.set(targetUserId, userRecord);
        if (db) {
          await setDoc(doc(db, 'chatbot_users', targetUserId), { totalConversations: userRecord.totalConversations }, { merge: true }).catch(() => null);
        }
      }
    }

    saveChatbotStoreToFile();
    broadcastEvent('CHATBOT_USER_UPDATED', userRecord);

    return res.json({
      success: true,
      userId: targetUserId,
      conversationId: activeConvId,
      user: userRecord,
      isNewUser
    });
  });

  // 2. Post Chatbot Message Endpoint (Stores both user & bot messages)
  app.post('/api/chatbot/message', async (req, res) => {
    const { userId, conversationId, botId, sender, message, messageType, metadata, userProfileUpdate } = req.body || {};

    if (!userId || !conversationId) {
      return res.status(400).json({ success: false, error: 'userId and conversationId are required.' });
    }

    const cleanSender = sender === 'bot' ? 'bot' : (sender === 'system' ? 'system' : 'user');
    const cleanMsg = cleanString(message, 5000);
    const cleanMsgType = cleanString(messageType || 'text', 50);
    const nowIso = new Date().toISOString();
    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    loadChatbotStoreFromFile();

    // 1. Record Message object
    const msgRecord = {
      id: msgId,
      conversationId,
      userId,
      botId: cleanString(botId || 'default_bot', 100),
      sender: cleanSender,
      message: cleanMsg,
      timestamp: nowIso,
      messageType: cleanMsgType,
      metadata: metadata || {}
    };

    let convMsgs = serverMessagesMap.get(conversationId) || [];
    convMsgs.push(msgRecord);
    serverMessagesMap.set(conversationId, convMsgs);

    // 2. Update Conversation Summary Record
    let convRecord = serverConversationsMap.get(conversationId) || {
      id: conversationId,
      userId,
      botId: cleanString(botId || 'default_bot', 100),
      startedAt: nowIso,
      lastMessageAt: nowIso,
      status: 'active',
      messageCount: 0
    };

    convRecord.lastMessageAt = nowIso;
    convRecord.messageCount = (convRecord.messageCount || 0) + 1;
    serverConversationsMap.set(conversationId, convRecord);

    // 3. Update User Record & Counters
    let userRecord = serverChatbotUsersMap.get(userId) || {
      id: userId,
      name: 'Anonymous Visitor',
      email: '',
      phone: '',
      createdAt: nowIso,
      lastActiveAt: nowIso,
      status: 'active',
      totalConversations: 1,
      totalMessages: 0,
      source: 'Chat Widget',
      consent: true
    };

    userRecord.lastActiveAt = nowIso;
    userRecord.totalMessages = (userRecord.totalMessages || 0) + 1;

    if (userProfileUpdate && typeof userProfileUpdate === 'object') {
      if (userProfileUpdate.name) userRecord.name = cleanString(userProfileUpdate.name, 200);
      if (isValidEmail(userProfileUpdate.email)) userRecord.email = userProfileUpdate.email.trim().toLowerCase();
      if (isValidPhone(userProfileUpdate.phone)) userRecord.phone = userProfileUpdate.phone.trim();
    }

    serverChatbotUsersMap.set(userId, userRecord);
    saveChatbotStoreToFile();

    // 4. Firestore Persistence
    if (db) {
      try {
        await setDoc(doc(db, 'conversations', conversationId, 'messages', msgId), msgRecord).catch(() => null);
        await setDoc(doc(db, 'conversations', conversationId), convRecord, { merge: true }).catch(() => null);
        await setDoc(doc(db, 'chatbot_users', userId), userRecord, { merge: true }).catch(() => null);
      } catch (fsErr) {
        console.warn('[CHATBOT_MSG] Firestore persistence warning:', fsErr);
      }
    }

    // 5. Broadcast SSE Event for Instant Dashboard Live Update
    broadcastEvent('CHATBOT_MESSAGE_ADDED', { message: msgRecord, conversation: convRecord, user: userRecord });

    return res.json({
      success: true,
      messageId: msgId,
      timestamp: nowIso,
      user: userRecord,
      conversation: convRecord
    });
  });

  // 3. Get Chatbot Users Directory Endpoint
  app.get('/api/chatbot/users', async (req, res) => {
    const { search, status, sortBy = 'lastActiveAt', sortOrder = 'desc', page = '1', limit = '20' } = req.query;

    loadChatbotStoreFromFile();
    let firestoreUsers: any[] = [];

    if (db) {
      try {
        const uSnap = await getDocs(collection(db, 'chatbot_users')).catch(() => null);
        if (uSnap && !uSnap.empty) {
          firestoreUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
      } catch (e) {
        console.warn('[CHATBOT_USERS_FETCH] Firestore fetch warning:', e);
      }
    }

    // Merge memory file store with Firestore
    const userMap = new Map<string, any>();
    serverChatbotUsersMap.forEach(u => userMap.set(u.id, u));
    firestoreUsers.forEach(u => userMap.set(u.id, u));

    let allUsers = Array.from(userMap.values());

    // Search filter
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.toLowerCase().trim();
      allUsers = allUsers.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q) ||
        (u.id || '').toLowerCase().includes(q) ||
        (u.source || '').toLowerCase().includes(q)
      );
    }

    // Status filter
    if (status && status !== 'ALL' && typeof status === 'string') {
      allUsers = allUsers.filter(u => u.status === status);
    }

    // Sorting
    allUsers.sort((a, b) => {
      let valA = a[sortBy as string] || '';
      let valB = b[sortBy as string] || '';
      if (sortBy === 'totalMessages' || sortBy === 'totalConversations') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit as string, 10) || 20);
    const total = allUsers.length;
    const totalPages = Math.ceil(total / limitNum) || 1;
    const paginatedUsers = allUsers.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return res.json({
      success: true,
      users: paginatedUsers,
      total,
      page: pageNum,
      totalPages,
      limit: limitNum
    });
  });

  // 4. Get User Profile & Conversations Endpoint
  app.get('/api/chatbot/users/:userId', async (req, res) => {
    const { userId } = req.params;
    loadChatbotStoreFromFile();

    let userRecord = serverChatbotUsersMap.get(userId);

    if (!userRecord && db) {
      try {
        const uSnap = await getDoc(doc(db, 'chatbot_users', userId)).catch(() => null);
        if (uSnap && uSnap.exists()) {
          userRecord = { id: uSnap.id, ...uSnap.data() };
        }
      } catch (e) { }
    }

    if (!userRecord) {
      return res.status(404).json({ success: false, error: 'User record not found.' });
    }

    // Fetch user conversations
    let userConvs = Array.from(serverConversationsMap.values()).filter(c => c.userId === userId);

    if (db) {
      try {
        const q = query(collection(db, 'conversations'), where('userId', '==', userId));
        const cSnap = await getDocs(q).catch(() => null);
        if (cSnap && !cSnap.empty) {
          const fsConvs = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const cMap = new Map<string, any>();
          userConvs.forEach(c => cMap.set(c.id, c));
          fsConvs.forEach(c => cMap.set(c.id, c));
          userConvs = Array.from(cMap.values());
        }
      } catch (e) { }
    }

    userConvs.sort((a, b) => new Date(b.lastMessageAt || b.startedAt).getTime() - new Date(a.lastMessageAt || a.startedAt).getTime());

    return res.json({
      success: true,
      user: userRecord,
      conversations: userConvs
    });
  });

  // 5. Get Full Conversation Messages Transcript Endpoint
  app.get('/api/chatbot/conversations/:conversationId', async (req, res) => {
    const { conversationId } = req.params;
    loadChatbotStoreFromFile();

    let conversation = serverConversationsMap.get(conversationId);
    let messages = serverMessagesMap.get(conversationId) || [];

    if (db) {
      try {
        if (!conversation) {
          const cSnap = await getDoc(doc(db, 'conversations', conversationId)).catch(() => null);
          if (cSnap && cSnap.exists()) {
            conversation = { id: cSnap.id, ...cSnap.data() };
          }
        }
        const mSnap = await getDocs(collection(db, 'conversations', conversationId, 'messages')).catch(() => null);
        if (mSnap && !mSnap.empty) {
          const fsMsgs = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const msgMap = new Map<string, any>();
          messages.forEach(m => msgMap.set(m.id, m));
          fsMsgs.forEach(m => msgMap.set(m.id, m));
          messages = Array.from(msgMap.values());
        }
      } catch (e) { }
    }

    if (!conversation && messages.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation record not found.' });
    }

    messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return res.json({
      success: true,
      conversation: conversation || { id: conversationId, messageCount: messages.length },
      messages
    });
  });

  // 6. Chatbot Analytics Overview Stats & Trends Endpoint
  app.get('/api/chatbot/stats', async (req, res) => {
    loadChatbotStoreFromFile();

    let firestoreUsers: any[] = [];
    let firestoreConvs: any[] = [];

    if (db) {
      try {
        const uSnap = await getDocs(collection(db, 'chatbot_users')).catch(() => null);
        if (uSnap && !uSnap.empty) firestoreUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const cSnap = await getDocs(collection(db, 'conversations')).catch(() => null);
        if (cSnap && !cSnap.empty) firestoreConvs = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { }
    }

    const uMap = new Map<string, any>();
    serverChatbotUsersMap.forEach(u => uMap.set(u.id, u));
    firestoreUsers.forEach(u => uMap.set(u.id, u));
    const allUsers = Array.from(uMap.values());

    const cMap = new Map<string, any>();
    serverConversationsMap.forEach(c => cMap.set(c.id, c));
    firestoreConvs.forEach(c => cMap.set(c.id, c));
    const allConvs = Array.from(cMap.values());

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);

    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter(u => u.lastActiveAt && new Date(u.lastActiveAt).getTime() >= thirtyDaysAgo).length;
    const newUsersToday = allUsers.filter(u => u.createdAt && new Date(u.createdAt).getTime() >= todayStart).length;
    const newUsersThisWeek = allUsers.filter(u => u.createdAt && new Date(u.createdAt).getTime() >= sevenDaysAgo).length;

    const totalConversations = allConvs.length;
    let totalMessages = allConvs.reduce((acc, c) => acc + (c.messageCount || 0), 0);
    if (totalMessages === 0) {
      totalMessages = allUsers.reduce((acc, u) => acc + (u.totalMessages || 0), 0);
    }

    const avgMessagesPerConversation = totalConversations > 0
      ? Math.round((totalMessages / totalConversations) * 10) / 10
      : 0;

    // Daily growth trend (Last 7 Days)
    const dailyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      const dayUsers = allUsers.filter(u => u.createdAt && new Date(u.createdAt).getTime() >= dayStart && new Date(u.createdAt).getTime() < dayEnd).length;
      const dayConvs = allConvs.filter(c => c.startedAt && new Date(c.startedAt).getTime() >= dayStart && new Date(c.startedAt).getTime() < dayEnd).length;

      dailyTrend.push({
        date: dayLabel,
        users: dayUsers,
        conversations: dayConvs
      });
    }

    return res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        newUsersToday,
        newUsersThisWeek,
        totalConversations,
        totalMessages,
        avgMessagesPerConversation,
        dailyTrend
      }
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