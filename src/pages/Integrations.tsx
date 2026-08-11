import React, { useState, useEffect } from 'react';
import ChatWidget from '../components/ChatWidget';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { 
  Loader2, CheckCircle2, ExternalLink, AlertCircle, FileSpreadsheet, 
  Plus, Sparkles, Bot, Link2, RefreshCw, Send, Trash2, Check, Copy, HelpCircle 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface BotInfo {
  id: string;
  name: string;
  spreadsheetId?: string;
  createdBy?: string;
}

export default function Integrations() {
  const { effectiveUserId, isAdmin } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [globalSpreadsheetId, setGlobalSpreadsheetId] = useState('');
  const [googleTokens, setGoogleTokens] = useState<any>(null);
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [userSheets, setUserSheets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingGlobal, setIsCreatingGlobal] = useState(false);

  // Per-bot sheet linking states
  const [botInputs, setBotInputs] = useState<{ [botId: string]: string }>({});
  const [botLoading, setBotLoading] = useState<{ [botId: string]: boolean }>({});
  const [botTestResults, setBotTestResults] = useState<{ [botId: string]: { success: boolean; msg: string } | null }>({});

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [activeTab, setActiveTab] = useState<'embed' | 'sheets'>('embed');
  const [selectedBotIdForEmbed, setSelectedBotIdForEmbed] = useState<string>('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);

  const getAppBaseUrl = () => {
    if (typeof window === 'undefined') return 'https://akanksha-1007.github.io/mintage-bot';
    const origin = window.location.origin.indexOf('ais-dev-') !== -1
      ? window.location.origin.replace('ais-dev-', 'ais-pre-')
      : window.location.origin;
    const baseUrl = import.meta.env.BASE_URL || '/';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return origin + cleanBase;
  };

  const activeOrigin = getAppBaseUrl();

  const activeBotId = selectedBotIdForEmbed || (bots.length > 0 ? bots[0].id : 'demo_bot_id');
  
  const embedScriptTag = `<script src="${activeOrigin}/widget.js" data-bot-id="${activeBotId}" async></script>`;
  const embedPopupScriptTag = `<script src="${activeOrigin}/widget.js" data-bot-id="${activeBotId}" data-mode="popup" async></script>`;
  const embedIframeTag = `<iframe src="${activeOrigin}/widget/${activeBotId}" width="380" height="600" style="border:none; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,0.15);"></iframe>`;
  const directWebLinkTag = `<a href="${activeOrigin}/widget/${activeBotId}" target="_blank" rel="noopener noreferrer" class="chat-btn">Chat with Us</a>`;

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(embedScriptTag);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const [copiedPopupScript, setCopiedPopupScript] = useState(false);
  const [copiedDirectLink, setCopiedDirectLink] = useState(false);

  const copyPopupScriptToClipboard = () => {
    navigator.clipboard.writeText(embedPopupScriptTag);
    setCopiedPopupScript(true);
    setTimeout(() => setCopiedPopupScript(false), 2000);
  };

  const copyIframeToClipboard = () => {
    navigator.clipboard.writeText(embedIframeTag);
    setCopiedIframe(true);
    setTimeout(() => setCopiedIframe(false), 2000);
  };

  const copyDirectLinkToClipboard = () => {
    navigator.clipboard.writeText(directWebLinkTag);
    setCopiedDirectLink(true);
    setTimeout(() => setCopiedDirectLink(false), 2000);
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (auth.currentUser) {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsConnected(!!data.googleTokens);
          setGoogleTokens(data.googleTokens || null);
          setGlobalSpreadsheetId(data.spreadsheetId || '');

          if (data.googleTokens) {
            fetchUserSheets(data.googleTokens);
          }
        }
      }

      // Fetch user's bots from Firestore
      const fetchedBotMap = new Map<string, BotInfo>();

      if (auth.currentUser) {
        try {
          const botsQ = query(
            collection(db, 'bot_configurations'),
            where('createdBy', '==', auth.currentUser.uid)
          );
          const botsSnap = await getDocs(botsQ);
          botsSnap.docs.forEach(d => {
            fetchedBotMap.set(d.id, {
              id: d.id,
              name: d.data().name || 'Unnamed Bot',
              spreadsheetId: d.data().spreadsheetId || '',
              createdBy: d.data().createdBy
            });
          });
        } catch (err) {
          console.warn('Firestore bots fetch warning:', err);
        }
      }

      // Fallback/merge with server bots
      try {
        const sRes = await fetch('/api/bots');
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.success && Array.isArray(sData.bots)) {
            sData.bots.forEach((b: any) => {
              if (!fetchedBotMap.has(b.id)) {
                fetchedBotMap.set(b.id, {
                  id: b.id,
                  name: b.name || 'Unnamed Bot',
                  spreadsheetId: b.spreadsheetId || '',
                  createdBy: b.createdBy
                });
              }
            });
          }
        }
      } catch (sErr) {
        console.warn('Server bots fetch warning:', sErr);
      }

      // Fallback/merge with local storage bots
      const localBotsRaw = localStorage.getItem('mintage_bots');
      if (localBotsRaw) {
        try {
          const parsed: BotInfo[] = JSON.parse(localBotsRaw);
          parsed.forEach(b => {
            if (!fetchedBotMap.has(b.id)) {
              fetchedBotMap.set(b.id, {
                id: b.id,
                name: b.name || 'Unnamed Bot',
                spreadsheetId: b.spreadsheetId || '',
                createdBy: b.createdBy
              });
            } else {
              // Update spreadsheet ID if set in localStorage
              const existing = fetchedBotMap.get(b.id)!;
              if (b.spreadsheetId && !existing.spreadsheetId) {
                existing.spreadsheetId = b.spreadsheetId;
              }
            }
          });
        } catch {}
      }

      const botList = Array.from(fetchedBotMap.values());
      setBots(botList);

      // Initialize bot inputs with existing spreadsheetIds
      const initialInputs: { [id: string]: string } = {};
      botList.forEach(b => {
        initialInputs[b.id] = b.spreadsheetId || '';
      });
      setBotInputs(initialInputs);

    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

  const fetchUserSheets = async (tokens: any) => {
    try {
      const res = await fetch('/api/sheets/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens }),
      });
      const data = await res.json();
      if (res.ok) {
        setUserSheets(data.files || []);
      }
    } catch (err) {
      console.error('Error fetching sheets:', err);
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { tokens } = event.data;
        if (auth.currentUser) {
          try {
            await setDoc(doc(db, 'users', auth.currentUser.uid), {
              googleTokens: tokens,
              updatedAt: serverTimestamp(),
            }, { merge: true });
            setIsConnected(true);
            setGoogleTokens(tokens);
            fetchUserSheets(tokens);
            showToast('Google Account connected successfully!');
          } catch (error) {
            console.error('Error saving tokens:', error);
            showToast('Failed to connect Google account.', 'error');
          }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch('/api/auth/google/url');
      const data = await response.json();
      
      if (!response.ok) {
        showToast(data.error || 'Failed to get auth URL', 'error');
        return;
      }
      
      window.open(data.url, 'google_oauth', 'width=600,height=700');
    } catch (error) {
      console.error('Failed to get auth URL:', error);
      showToast('An unexpected error occurred. Please try again.', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          googleTokens: null,
          spreadsheetId: '',
          updatedAt: serverTimestamp(),
        }, { merge: true });
        setIsConnected(false);
        setGoogleTokens(null);
        setUserSheets([]);
        showToast('Google Account disconnected successfully.');
      } catch (error: any) {
        showToast(`Failed to disconnect: ${error?.message || error}`, 'error');
      }
    }
  };


  const handleCreateDefaultSheet = async () => {
    if (!googleTokens) {
      showToast('Please connect your Google Account first.', 'error');
      return;
    }
    setIsCreatingGlobal(true);
    try {
      const res = await fetch('/api/sheets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: googleTokens,
          title: 'BotFlow Central Leads'
        }),
      });
      const data = await res.json();
      if (res.ok && data.spreadsheetId) {
        setGlobalSpreadsheetId(data.spreadsheetId);
        if (auth.currentUser) {
          await setDoc(doc(db, 'users', auth.currentUser.uid), {
            spreadsheetId: data.spreadsheetId,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
        fetchUserSheets(googleTokens);
        showToast(`Default Google Sheet created: "${data.title}"`);
      } else {
        showToast(data.error || 'Failed to create sheet', 'error');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setIsCreatingGlobal(false);
    }
  };

  const handleSaveGlobalSpreadsheet = async () => {
    if (!auth.currentUser) return;
    
    let finalId = globalSpreadsheetId.trim();
    if (finalId.includes('/d/')) {
      const match = finalId.match(/\/d\/([\w-_]+)/);
      if (match && match[1]) {
        finalId = match[1];
        setGlobalSpreadsheetId(finalId);
      }
    }

    if (!finalId) {
      showToast('Please enter a valid Spreadsheet ID', 'error');
      return;
    }

    setIsConnecting(true);
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        spreadsheetId: finalId,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast('Default Global Spreadsheet saved successfully!');
    } catch (error: any) {
      showToast(`Error: ${error.message || 'Failed to save Spreadsheet ID'}`, 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  // Extract Spreadsheet ID from raw string or URL
  const extractSpreadsheetId = (input: string): string => {
    const trimmed = input.trim();
    if (trimmed.includes('/d/')) {
      const match = trimmed.match(/\/d\/([\w-_]+)/);
      if (match && match[1]) return match[1];
    }
    return trimmed;
  };

  // Link specific Bot to a Spreadsheet ID/URL
  const handleLinkBotToSheet = async (botId: string) => {
    const rawInput = botInputs[botId] || '';
    const cleanId = extractSpreadsheetId(rawInput);

    if (!cleanId) {
      showToast('Please enter or select a valid Google Sheet URL or ID.', 'error');
      return;
    }

    setBotLoading(prev => ({ ...prev, [botId]: true }));
    try {
      // Update in Firestore
      try {
        await updateDoc(doc(db, 'bot_configurations', botId), {
          spreadsheetId: cleanId,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        console.warn('Firestore update warning, persisting locally:', e);
      }

      // Update in Local Storage
      const localBotsRaw = localStorage.getItem('mintage_bots');
      if (localBotsRaw) {
        try {
          const parsed: BotInfo[] = JSON.parse(localBotsRaw);
          const updated = parsed.map(b => b.id === botId ? { ...b, spreadsheetId: cleanId } : b);
          localStorage.setItem('mintage_bots', JSON.stringify(updated));
        } catch {}
      }

      // Update state
      setBots(prev => prev.map(b => b.id === botId ? { ...b, spreadsheetId: cleanId } : b));
      setBotInputs(prev => ({ ...prev, [botId]: cleanId }));

      showToast('Google Sheet linked to Chatbot successfully!');
    } catch (err: any) {
      showToast(`Failed to link sheet: ${err.message}`, 'error');
    } finally {
      setBotLoading(prev => ({ ...prev, [botId]: false }));
    }
  };

  // Create New Dedicated Sheet for Bot
  const handleCreateDedicatedSheetForBot = async (botId: string, botName: string) => {
    if (!googleTokens) {
      showToast('Please connect your Google Account first.', 'error');
      return;
    }

    setBotLoading(prev => ({ ...prev, [botId]: true }));
    try {
      const res = await fetch('/api/sheets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: googleTokens,
          title: `${botName} - Captured Leads`
        }),
      });
      const data = await res.json();
      if (res.ok && data.spreadsheetId) {
        const newSheetId = data.spreadsheetId;

        // Save to bot in Firestore
        try {
          await updateDoc(doc(db, 'bot_configurations', botId), {
            spreadsheetId: newSheetId,
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.warn('Firestore update warning:', e);
        }

        // Save to Local Storage
        const localBotsRaw = localStorage.getItem('mintage_bots');
        if (localBotsRaw) {
          try {
            const parsed: BotInfo[] = JSON.parse(localBotsRaw);
            const updated = parsed.map(b => b.id === botId ? { ...b, spreadsheetId: newSheetId } : b);
            localStorage.setItem('mintage_bots', JSON.stringify(updated));
          } catch {}
        }

        // Update state
        setBots(prev => prev.map(b => b.id === botId ? { ...b, spreadsheetId: newSheetId } : b));
        setBotInputs(prev => ({ ...prev, [botId]: newSheetId }));

        fetchUserSheets(googleTokens);
        showToast(`Created & Linked new Google Sheet: "${data.title}"`);
      } else {
        showToast(data.error || 'Failed to create sheet', 'error');
      }
    } catch (err: any) {
      showToast(`Error creating sheet: ${err.message}`, 'error');
    } finally {
      setBotLoading(prev => ({ ...prev, [botId]: false }));
    }
  };

  // Unlink sheet from Bot
  const handleUnlinkBotSheet = async (botId: string) => {
    setBotLoading(prev => ({ ...prev, [botId]: true }));
    try {
      try {
        await updateDoc(doc(db, 'bot_configurations', botId), {
          spreadsheetId: '',
          updatedAt: serverTimestamp()
        });
      } catch (e) {}

      const localBotsRaw = localStorage.getItem('mintage_bots');
      if (localBotsRaw) {
        try {
          const parsed: BotInfo[] = JSON.parse(localBotsRaw);
          const updated = parsed.map(b => b.id === botId ? { ...b, spreadsheetId: '' } : b);
          localStorage.setItem('mintage_bots', JSON.stringify(updated));
        } catch {}
      }

      setBots(prev => prev.map(b => b.id === botId ? { ...b, spreadsheetId: '' } : b));
      setBotInputs(prev => ({ ...prev, [botId]: '' }));
      setBotTestResults(prev => ({ ...prev, [botId]: null }));

      showToast('Unlinked Google Sheet from Bot.');
    } catch (err: any) {
      showToast(`Error unlinking sheet: ${err.message}`, 'error');
    } finally {
      setBotLoading(prev => ({ ...prev, [botId]: false }));
    }
  };

  // Test sheet connection for a bot
  const handleTestBotSheet = async (botId: string) => {
    const sheetId = extractSpreadsheetId(botInputs[botId] || '');
    if (!sheetId) {
      showToast('Please enter a Google Sheet ID or URL to test.', 'error');
      return;
    }

    if (!googleTokens) {
      showToast('Please connect your Google Account first.', 'error');
      return;
    }

    setBotLoading(prev => ({ ...prev, [botId]: true }));
    try {
      const res = await fetch('/api/sheets/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: googleTokens,
          spreadsheetId: sheetId
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBotTestResults(prev => ({
          ...prev,
          [botId]: { success: true, msg: `Verified: "${data.title}"` }
        }));
        showToast(`Connection Verified! Sheet title: "${data.title}"`);
      } else {
        setBotTestResults(prev => ({
          ...prev,
          [botId]: { success: false, msg: data.error || 'Access denied' }
        }));
        showToast(data.error || 'Could not access sheet', 'error');
      }
    } catch (err: any) {
      setBotTestResults(prev => ({
        ...prev,
        [botId]: { success: false, msg: err.message || 'Connection failed' }
      }));
      showToast('Connection failed', 'error');
    } finally {
      setBotLoading(prev => ({ ...prev, [botId]: false }));
    }
  };

  // Send sample lead to test live sync
  const handleSendTestLead = async (botId: string, botName: string) => {
    const sheetId = extractSpreadsheetId(botInputs[botId] || globalSpreadsheetId);
    if (!sheetId) {
      showToast('No spreadsheet linked to test.', 'error');
      return;
    }
    if (!googleTokens) {
      showToast('Please connect Google Account first.', 'error');
      return;
    }

    setBotLoading(prev => ({ ...prev, [botId]: true }));
    try {
      const res = await fetch('/api/sync-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: googleTokens,
          spreadsheetId: sheetId,
          leadData: {
            fullName: 'Sample Test Lead',
            email: 'testlead@example.com',
            phone: '+1 (555) 019-2831',
            sourceBot: botName,
            status: 'Verified from Integrations Tab'
          }
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('🎉 Test row successfully appended to Google Sheet!');
      } else {
        showToast(data.error || 'Failed to append test row', 'error');
      }
    } catch (err: any) {
      showToast(`Error syncing test lead: ${err.message}`, 'error');
    } finally {
      setBotLoading(prev => ({ ...prev, [botId]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 font-sans">
      {/* Toast Banner */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-2 animate-bounce ${
          toast.type === 'success' 
            ? 'bg-emerald-900 text-emerald-100 border-emerald-700' 
            : 'bg-red-900 text-red-100 border-red-700'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header & Navigation Tabs */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Integrations & Website Embed</h2>
            <p className="text-gray-500 text-sm mt-1">Connect your chatbots to websites, custom apps, and Google Sheets easily.</p>
          </div>

          {isConnected && activeTab === 'sheets' && (
            <button
              onClick={() => fetchUserSheets(googleTokens)}
              className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Refresh Google Drive Sheets</span>
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-1">
          <button
            onClick={() => setActiveTab('embed')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'embed'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <Bot className="w-4 h-4 text-indigo-400" />
            <span>Website Embed Code</span>
          </button>

          <button
            onClick={() => setActiveTab('sheets')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'sheets'
                ? 'bg-emerald-700 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            <span>Google Sheets Live Sync</span>
          </button>
        </div>
      </div>

      {activeTab === 'embed' ? (
        /* ================= EMBED CODE SECTION ================= */
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-3xl shadow-xs border border-gray-200 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Bot className="w-6 h-6 text-indigo-600" />
                  Connect Chatbot to Your Website Code
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Select a chatbot below to generate its unique, ready-to-use embed script.
                </p>
              </div>

              {/* Bot Selector */}
              <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-200">
                <span className="text-xs font-bold text-gray-500 pl-2">Select Bot:</span>
                <select
                  value={activeBotId}
                  onChange={(e) => setSelectedBotIdForEmbed(e.target.value)}
                  className="bg-white text-xs font-bold text-gray-900 px-3 py-1.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  {bots.length > 0 ? (
                    bots.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (ID: {b.id.substring(0, 8)}...)
                      </option>
                    ))
                  ) : (
                    <option value="demo_bot_id">Demo Starter Bot</option>
                  )}
                </select>
              </div>
            </div>

            {/* Preview URL vs Production Callout Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-900 text-xs">
                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                Why is the bot iframe blank or not loading on external sites like mintagemarkcomm.com?
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                The current URL (<code className="bg-amber-100/80 px-1 py-0.5 rounded text-amber-950 font-mono text-[11px]">{activeOrigin}</code>) is a <strong>temporary AI Studio development preview environment</strong>. Modern web browsers automatically block third-party <code className="bg-amber-100/80 px-1 py-0.5 rounded text-amber-950 font-mono text-[11px]">&lt;iframe&gt;</code> embeds from sandboxed dev preview proxies due to cross-site cookie and framing security policies.
              </p>
              <div className="pt-1 flex flex-wrap gap-2 text-[11px]">
                <span className="bg-amber-100 text-amber-900 font-bold px-2.5 py-1 rounded-lg">
                  💡 Fix 1: Use Option 2 (Popup Window) or Option 3 (Direct Link) on external sites
                </span>
                <span className="bg-amber-100 text-amber-900 font-bold px-2.5 py-1 rounded-lg">
                  🚀 Fix 2: Deploy app to production to unlock seamless cross-domain inline iframe embedding
                </span>
              </div>
            </div>

            {/* Snippet Option 1: JS Script */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                    Option 1: Floating Chat Widget Script
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Renders a floating widget icon in the bottom corner of your website.
                  </p>
                </div>
                <button
                  onClick={copyScriptToClipboard}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center gap-1.5"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedScript ? 'Copied Script!' : 'Copy Script Tag'}</span>
                </button>
              </div>

              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
                <pre className="whitespace-pre-wrap leading-relaxed">{embedScriptTag}</pre>
              </div>
            </div>

            {/* Snippet Option 2: Popup Window Mode */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Option 2: Popup Window Mode (Recommended for Local Dev & Strict Sites)
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Opens the chatbot in a clean popup window when clicked. Bypasses third-party cookie/iframe restrictions on local servers (like <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800">127.0.0.1:5500</code>).
                  </p>
                </div>
                <button
                  onClick={copyPopupScriptToClipboard}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-100 flex items-center gap-1.5"
                >
                  {copiedPopupScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPopupScript ? 'Copied Popup Tag!' : 'Copy Popup Script'}</span>
                </button>
              </div>

              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
                <pre className="whitespace-pre-wrap leading-relaxed">{embedPopupScriptTag}</pre>
              </div>
            </div>

            {/* Snippet Option 3: Direct Web Link */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    Option 3: Direct Link for "Enquire Now" / "Contact Us" Buttons
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Link your website's existing "Contact Us", "Enquire Now", or "Book Demo" buttons directly to your live chatbot.
                  </p>
                </div>
                <button
                  onClick={copyDirectLinkToClipboard}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-100 flex items-center gap-1.5"
                >
                  {copiedDirectLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedDirectLink ? 'Copied Button Link!' : 'Copy Link Code'}</span>
                </button>
              </div>

              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
                <pre className="whitespace-pre-wrap leading-relaxed">{directWebLinkTag}</pre>
              </div>
            </div>

            {/* Snippet Option 4: iFrame */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    Option 4: Inline iFrame Embed
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Embeds the chatbot directly inside a container on your webpage.
                  </p>
                </div>
                <button
                  onClick={copyIframeToClipboard}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-100 flex items-center gap-1.5"
                >
                  {copiedIframe ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedIframe ? 'Copied iFrame!' : 'Copy iFrame Code'}</span>
                </button>
              </div>

              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
                <pre className="whitespace-pre-wrap leading-relaxed">{embedIframeTag}</pre>
              </div>
            </div>
          </div>

          {/* Platform Step-by-Step Installation Guides */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs">HTML</div>
                <h4 className="text-sm font-bold text-gray-900">Standard HTML Website</h4>
              </div>
              <ol className="text-xs text-gray-600 space-y-2 list-decimal pl-4 leading-relaxed">
                <li>Open your HTML file (e.g., <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800">index.html</code>).</li>
                <li>Scroll down to the bottom of the file right before the closing <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800">&lt;/body&gt;</code> tag.</li>
                <li>Paste the copied <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800">&lt;script&gt;</code> tag and save your file.</li>
              </ol>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs">WP</div>
                <h4 className="text-sm font-bold text-gray-900">WordPress</h4>
              </div>
              <ol className="text-xs text-gray-600 space-y-2 list-decimal pl-4 leading-relaxed">
                <li>Log in to your WordPress Dashboard.</li>
                <li>Go to <strong>Plugins &gt; Add New</strong> and install "Insert Headers and Footers" or "WPCode".</li>
                <li>Paste the script tag into the <strong>Footer Scripts</strong> section and save changes.</li>
              </ol>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl font-bold text-xs">WF</div>
                <h4 className="text-sm font-bold text-gray-900">Webflow / Shopify / Wix</h4>
              </div>
              <ol className="text-xs text-gray-600 space-y-2 list-decimal pl-4 leading-relaxed">
                <li>Open <strong>Site Settings &gt; Custom Code</strong> or Theme Editor.</li>
                <li>Locate the <strong>Footer Code</strong> or Custom Head/Body field.</li>
                <li>Paste the script tag and publish your site.</li>
              </ol>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs">REACT</div>
                <h4 className="text-sm font-bold text-gray-900">React / Next.js</h4>
              </div>
              <ol className="text-xs text-gray-600 space-y-2 list-decimal pl-4 leading-relaxed">
                <li>In Next.js, place <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800">&lt;Script src="{activeOrigin}/widget.js" data-bot-id="{activeBotId}" /&gt;</code> in layout.</li>
                <li>In standard React, add the script tag to <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800">public/index.html</code>.</li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        /* ================= GOOGLE SHEETS SECTION ================= */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">

          {/* SECTION 1: Google OAuth Connection */}
          <div className="bg-white p-8 rounded-3xl shadow-xs border border-gray-100 space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-2xs">
                  <FileSpreadsheet className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Google Sheets Integration</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Link any chatbot flow directly to any Google Sheet in your account.</p>
                </div>
              </div>
              {isConnected ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200 shadow-2xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Connected
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 rounded-xl text-xs font-bold transition-all border border-gray-200"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (

                <button 
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-50"
                >
                  {isConnecting ? 'Connecting...' : 'Connect Google Account'}
                </button>
              )}
            </div>

            {/* SECTION 2: Per-Bot Google Sheet Integrations */}
            {isConnected ? (
              <div className="space-y-6 pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-extrabold text-gray-900">Connect Chatbots to Any Google Sheet</h4>
                    <p className="text-xs text-gray-500">Paste any Google Sheet URL, select from Drive, or generate a new sheet automatically.</p>
                  </div>
                </div>

                {bots.length === 0 ? (
                  <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-200/80">
                    <Bot className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
                    <p className="text-xs font-bold text-gray-700">No Chatbots Created Yet</p>
                    <p className="text-[11px] text-gray-400 mt-1 mb-4">Create your first chatbot to start linking Google Sheets.</p>
                    <Link
                      to="/builder/new"
                      className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all inline-block shadow-sm"
                    >
                      + Create New Chatbot
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bots.map((bot) => {
                      const currentInput = botInputs[bot.id] || '';
                      const isBusy = !!botLoading[bot.id];
                      const testRes = botTestResults[bot.id];
                      const hasSheetLinked = !!bot.spreadsheetId;

                      return (
                        <div key={bot.id} className="p-5 bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-gray-200 transition-all space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                                <Bot className="w-5 h-5" />
                              </div>
                              <div>
                                <h5 className="text-xs font-extrabold text-gray-900">{bot.name}</h5>
                                <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                  ID: {bot.id} {hasSheetLinked ? '• Sheet Active' : '• Using Default Sheet'}
                                </p>
                              </div>
                            </div>

                            {hasSheetLinked && (
                              <div className="flex items-center gap-2">
                                <a
                                  href={`https://docs.google.com/spreadsheets/d/${bot.spreadsheetId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                                >
                                  Open Google Sheet <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>

                          {/* Quick Select from Drive Dropdown */}
                          {userSheets.length > 0 && (
                            <div>
                              <label className="block text-[11px] font-bold text-gray-600 mb-1">
                                Choose from your Google Drive Spreadsheets:
                              </label>
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    setBotInputs(prev => ({ ...prev, [bot.id]: e.target.value }));
                                  }
                                }}
                                className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-sans text-gray-700 outline-none"
                              >
                                <option value="">-- Select a Google Sheet from Drive --</option>
                                {userSheets.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    📊 {s.name} ({s.id.slice(0, 10)}...)
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Paste URL or ID Input */}
                          <div className="space-y-2">
                            <label className="block text-[11px] font-bold text-gray-600">
                              Or Paste Any Google Sheet URL / Spreadsheet ID:
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <input
                                type="text"
                                value={currentInput}
                                onChange={(e) => setBotInputs(prev => ({ ...prev, [bot.id]: e.target.value }))}
                                placeholder="https://docs.google.com/spreadsheets/d/1aBcDeFg... or Spreadsheet ID"
                                className="flex-1 min-w-[220px] text-xs px-3.5 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                              />

                              <button
                                onClick={() => handleLinkBotToSheet(bot.id)}
                                disabled={isBusy}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                                <span>Link Sheet</span>
                              </button>

                              <button
                                onClick={() => handleCreateDedicatedSheetForBot(bot.id, bot.name)}
                                disabled={isBusy}
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                                title="Create a brand new Google Sheet specifically for this bot"
                              >
                                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                <span>Auto-Create Sheet</span>
                              </button>

                              <button
                                onClick={() => handleTestBotSheet(bot.id)}
                                disabled={isBusy || !currentInput}
                                className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-bold rounded-xl transition-all shadow-2xs disabled:opacity-40"
                              >
                                Test Access
                              </button>

                              {hasSheetLinked && (
                                <button
                                  onClick={() => handleUnlinkBotSheet(bot.id)}
                                  disabled={isBusy}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-200"
                                  title="Unlink Sheet from Bot"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Connection Status Indicator */}
                          {testRes && (
                            <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-between ${
                              testRes.success ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              <span>{testRes.msg}</span>
                              {testRes.success && (
                                <button
                                  onClick={() => handleSendTestLead(bot.id, bot.name)}
                                  disabled={isBusy}
                                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1"
                                >
                                  <Send className="w-3 h-3" /> Send Test Row
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Default Fallback Sheet Config */}
                <div className="mt-8 p-5 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Default Global Fallback Sheet</h4>
                      <p className="text-[11px] text-gray-500">Used if a chatbot does not have a dedicated Google Sheet linked above.</p>
                    </div>
                    <button
                      onClick={handleCreateDefaultSheet}
                      disabled={isCreatingGlobal}
                      className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isCreatingGlobal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Create Default Sheet
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={globalSpreadsheetId}
                      onChange={(e) => setGlobalSpreadsheetId(e.target.value)}
                      placeholder="Paste default Google Sheet URL or ID"
                      className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                    />
                    <button 
                      onClick={handleSaveGlobalSpreadsheet}
                      disabled={isConnecting}
                      className="px-5 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-all"
                    >
                      Save Default
                    </button>
                  </div>

                  {globalSpreadsheetId && (
                    <div className="flex justify-between items-center text-[11px] text-gray-500 font-mono pt-1">
                      <span>Linked ID: {globalSpreadsheetId}</span>
                      <a 
                        href={`https://docs.google.com/spreadsheets/d/${globalSpreadsheetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 font-bold hover:underline flex items-center gap-1 font-sans"
                      >
                        Open Default Sheet <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-gray-800">Google Account Not Connected</h4>
                <p className="text-xs text-gray-500 mt-1 mb-4">Connect your Google Account to authorize BotFlow to write leads directly to Google Sheets.</p>
                <button 
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md"
                >
                  Connect Google Account Now
                </button>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Integration Documentation / Guidance */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 p-7 rounded-[32px] text-white shadow-xl shadow-indigo-100">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-300" />
              Flexible Google Sheets Integration
            </h3>
            <ul className="text-indigo-200 text-xs leading-relaxed space-y-3 mb-6">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0"></span>
                <span><strong>Connect Any Sheet</strong>: Simply paste any Google Sheet URL from your browser to link it instantly.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0"></span>
                <span><strong>Drive Picker</strong>: Select any existing spreadsheet from your Google Drive with one click.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0"></span>
                <span><strong>One-Click Auto Creation</strong>: Generate a formatted spreadsheet with pre-populated headers for any chatbot.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0"></span>
                <span><strong>Real-time Live Sync</strong>: Every conversation answer is appended as a row the second the user submits.</span>
              </li>
            </ul>
            <Link 
              to="/bots" 
              className="w-full py-3 bg-white text-indigo-900 font-bold rounded-xl hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 text-xs"
            >
              Manage My Chatbots
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

