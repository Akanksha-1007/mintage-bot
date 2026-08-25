import React, { useState, useEffect } from 'react';
import ChatWidget from '../components/ChatWidget';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
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

  const [deletingBot, setDeletingBot] = useState<BotInfo | null>(null);
  const [isDeletingBot, setIsDeletingBot] = useState(false);

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
      let resolvedTokens: any = null;
      let resolvedSpreadsheetId: string = '';

      if (auth.currentUser) {
        try {
          const userDocRef = doc(db, 'users', auth.currentUser.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            resolvedTokens = data.googleTokens || null;
            resolvedSpreadsheetId = data.spreadsheetId || '';
          }
        } catch (e) { }
      }

      if (!resolvedTokens) {
        const localTokensRaw = localStorage.getItem('mintage_google_tokens');
        if (localTokensRaw) {
          try { resolvedTokens = JSON.parse(localTokensRaw); } catch { }
        }
      }

      if (resolvedTokens) {
        setIsConnected(true);
        setGoogleTokens(resolvedTokens);
        fetchUserSheets(resolvedTokens);
      } else {
        setIsConnected(false);
        setGoogleTokens(null);
      }

      if (resolvedSpreadsheetId) {
        setGlobalSpreadsheetId(resolvedSpreadsheetId);
      }

      // Read deleted bot IDs blacklist
      const deletedIdsRaw = localStorage.getItem('mintage_deleted_bot_ids');
      let deletedIds: string[] = [];
      if (deletedIdsRaw) {
        try { deletedIds = JSON.parse(deletedIdsRaw); } catch { }
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
            if (!deletedIds.includes(d.id)) {
              fetchedBotMap.set(d.id, {
                id: d.id,
                name: d.data().name || 'Unnamed Bot',
                spreadsheetId: d.data().spreadsheetId || '',
                createdBy: d.data().createdBy
              });
            }
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
              if (b && b.id && !deletedIds.includes(b.id) && !fetchedBotMap.has(b.id)) {
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
      const localBotsRaw = localStorage.getItem('mintage_bots') || localStorage.getItem('botflow_local_bots');
      if (localBotsRaw) {
        try {
          const parsed: BotInfo[] = JSON.parse(localBotsRaw);
          parsed.forEach(b => {
            if (b && b.id && !deletedIds.includes(b.id)) {
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
            }
          });
        } catch { }
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

    // Listen to custom window event mintage_bot_deleted
    const handleCustomBotDeleted = (e: any) => {
      const deletedId = e.detail?.id;
      if (deletedId) {
        setBots(prev => prev.filter(b => b.id !== deletedId));
        setSelectedBotIdForEmbed(prev => prev === deletedId ? '' : prev);
      } else {
        loadData();
      }
    };
    window.addEventListener('mintage_bot_deleted', handleCustomBotDeleted);

    // Realtime Firestore Snapshot Listener
    let unsubscribeBots: (() => void) | null = null;
    try {
      unsubscribeBots = onSnapshot(collection(db, 'bot_configurations'), () => {
        loadData();
      }, () => { });
    } catch { }

    // SSE Listener from backend
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        if (event.data && !event.data.startsWith(':')) {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'BOT_DELETED') {
              const deletedId = parsed.data?.botId;
              if (deletedId) {
                setBots(prev => prev.filter(b => b.id !== deletedId));
                setSelectedBotIdForEmbed(prev => prev === deletedId ? '' : prev);
              } else {
                loadData();
              }
            }
          } catch { }
        }
      };
    } catch { }

    return () => {
      window.removeEventListener('mintage_bot_deleted', handleCustomBotDeleted);
      if (unsubscribeBots) unsubscribeBots();
      if (eventSource) eventSource.close();
    };
  }, [effectiveUserId]);

  const confirmDeleteBot = async () => {
    if (!deletingBot) return;
    const targetId = deletingBot.id;
    setIsDeletingBot(true);

    try {
      // 1. Delete from Server API
      try {
        await fetch(`/api/bots/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
        await fetch('/api/bots/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: targetId })
        });
      } catch (apiErr) {
        console.warn('Server bot delete API error:', apiErr);
      }

      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'bot_configurations', targetId)).catch(() => null);

      // 3. Update localStorage blacklist
      const deletedIdsRaw = localStorage.getItem('mintage_deleted_bot_ids');
      let deletedIds: string[] = [];
      if (deletedIdsRaw) {
        try { deletedIds = JSON.parse(deletedIdsRaw); } catch { }
      }
      if (!deletedIds.includes(targetId)) {
        deletedIds.push(targetId);
        localStorage.setItem('mintage_deleted_bot_ids', JSON.stringify(deletedIds));
      }

      // 4. Clean up localStorage bot caches
      ['mintage_bots', 'botflow_local_bots', 'mintage_bot_configurations'].forEach(key => {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter((b: any) => b && b.id !== targetId);
              localStorage.setItem(key, JSON.stringify(filtered));
            }
          } catch { }
        }
      });

      // 5. Broadcast custom event
      window.dispatchEvent(new CustomEvent('mintage_bot_deleted', { detail: { id: targetId } }));

      // 6. Update local state
      setBots(prev => prev.filter(b => b.id !== targetId));
      if (selectedBotIdForEmbed === targetId) {
        setSelectedBotIdForEmbed('');
      }
      showToast('Chatbot flow deleted permanently.');
      setDeletingBot(null);
    } catch (error: any) {
      showToast(`Error deleting chatbot: ${error?.message || error}`, 'error');
    } finally {
      setIsDeletingBot(false);
    }
  };

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
        if (tokens) {
          try {
            localStorage.setItem('mintage_google_tokens', JSON.stringify(tokens));

            const targetUid = effectiveUserId || auth.currentUser?.uid || 'demo_user';
            await fetch('/api/auth/google/tokens', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: targetUid,
                tokens
              })
            }).catch(() => null);

            if (auth.currentUser) {
              await setDoc(doc(db, 'users', auth.currentUser.uid), {
                googleTokens: tokens,
                updatedAt: serverTimestamp(),
              }, { merge: true }).catch(() => null);
            }

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
  }, [effectiveUserId]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch('/api/auth/google/url');
      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || 'Google OAuth credentials missing. Check GOOGLE_CLIENT_ID on server.', 'error');
        return;
      }

      if (data.url) {
        const popup = window.open(data.url, 'google_oauth', 'width=600,height=700');
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          // Fallback if popup is blocked: redirect full window
          window.location.href = data.url;
        }
      }
    } catch (error: any) {
      console.error('Failed to get auth URL:', error);
      showToast('An unexpected error occurred. Please try again.', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const targetUid = effectiveUserId || auth.currentUser?.uid || 'demo_user';
      await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUid })
      }).catch(() => null);

      localStorage.removeItem('mintage_google_tokens');

      if (auth.currentUser) {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          googleTokens: null,
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch(() => null);
      }

      setIsConnected(false);
      setGoogleTokens(null);
      setUserSheets([]);
      showToast('Google Account disconnected successfully.');
    } catch (error: any) {
      showToast(`Failed to disconnect: ${error?.message || error}`, 'error');
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
        await setDoc(doc(db, 'bot_configurations', botId), {
          spreadsheetId: cleanId,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        console.warn('Firestore update warning, persisting locally:', e);
      }

      // Update in Server API
      try {
        const existingBot = bots.find(b => b.id === botId);
        await fetch('/api/bots/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: botId,
            name: existingBot?.name || 'Chatbot',
            spreadsheetId: cleanId
          })
        });
      } catch (e) {
        console.warn('Server bot save error:', e);
      }

      // Update in Local Storage
      const localBotsRaw = localStorage.getItem('mintage_bots');
      if (localBotsRaw) {
        try {
          const parsed: BotInfo[] = JSON.parse(localBotsRaw);
          const updated = parsed.map(b => b.id === botId ? { ...b, spreadsheetId: cleanId } : b);
          localStorage.setItem('mintage_bots', JSON.stringify(updated));
        } catch { }
      }

      // Update state
      setBots(prev => prev.map(b => b.id === botId ? { ...b, spreadsheetId: cleanId } : b));
      setBotInputs(prev => ({ ...prev, [botId]: cleanId }));

      // Immediately trigger background sync for all leads of this bot
      fetch('/api/leads/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: effectiveUserId || 'demo_user' })
      }).catch(() => null);

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
          await setDoc(doc(db, 'bot_configurations', botId), {
            spreadsheetId: newSheetId,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.warn('Firestore update warning:', e);
        }

        // Save to Server API
        try {
          await fetch('/api/bots/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: botId,
              name: botName,
              spreadsheetId: newSheetId
            })
          });
        } catch (e) {
          console.warn('Server bot save error:', e);
        }

        // Save to Local Storage
        const localBotsRaw = localStorage.getItem('mintage_bots');
        if (localBotsRaw) {
          try {
            const parsed: BotInfo[] = JSON.parse(localBotsRaw);
            const updated = parsed.map(b => b.id === botId ? { ...b, spreadsheetId: newSheetId } : b);
            localStorage.setItem('mintage_bots', JSON.stringify(updated));
          } catch { }
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
        await setDoc(doc(db, 'bot_configurations', botId), {
          spreadsheetId: '',
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) { }

      try {
        const existingBot = bots.find(b => b.id === botId);
        await fetch('/api/bots/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: botId,
            name: existingBot?.name || 'Chatbot',
            spreadsheetId: ''
          })
        });
      } catch (e) { }

      const localBotsRaw = localStorage.getItem('mintage_bots');
      if (localBotsRaw) {
        try {
          const parsed: BotInfo[] = JSON.parse(localBotsRaw);
          const updated = parsed.map(b => b.id === botId ? { ...b, spreadsheetId: '' } : b);
          localStorage.setItem('mintage_bots', JSON.stringify(updated));
        } catch { }
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
        const action = data.action === 'updated' ? 'updated' : 'appended';
        const location = data.rowNumber
          ? ` (row ${data.rowNumber})`
          : data.updatedRange
            ? ` (${data.updatedRange})`
            : '';

        showToast(
          action === 'updated'
            ? `Test lead updated in Google Sheet${location}`
            : `Test lead appended to Google Sheet${location}`
        );
      } else {
        showToast(data.error || 'Failed to sync test lead', 'error');
      }
    } catch (err: any) {
      showToast(`Error syncing test lead: ${err.message}`, 'error');
    } finally {
      setBotLoading(prev => ({ ...prev, [botId]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="loading-state">
        <Loader2 className="animate-spin" />
        <span>Loading integrations…</span>
      </div>
    );
  }

  return (
    <div className="integrations-page workspace-page workspace-page--wide">
      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'is-success' : 'is-error'}`}>
          {toast.type === 'success' ? <Check /> : <AlertCircle />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="page-heading">
        <div>
          <span className="eyebrow">Connect</span>
          <h2>Integrations</h2>
          <p>Publish your chatbot to any website and stream captured leads straight into Google Sheets.</p>
        </div>
        {isConnected && activeTab === 'sheets' && (
          <div className="page-actions">
            <button
              type="button"
              onClick={() => fetchUserSheets(googleTokens)}
              className="button-secondary"
            >
              <RefreshCw />
              Refresh Drive sheets
            </button>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="tab-strip" style={{ marginBottom: '28px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('embed')}
          className={`tab ${activeTab === 'embed' ? 'is-active' : ''}`}
        >
          <Bot />
          <span>Website embed</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sheets')}
          className={`tab ${activeTab === 'sheets' ? 'is-active' : ''}`}
        >
          <FileSpreadsheet />
          <span>Google Sheets sync</span>
        </button>
      </div>

      {activeTab === 'embed' ? (
        /* ================= EMBED CODE ================= */
        <div className="flex flex-col gap-5">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Embed code</h3>
                <p>Pick a chatbot and copy the snippet that fits your site.</p>
              </div>

              <div className="flex items-center gap-2">
                <label className="inline-select">
                  <Bot />
                  <select
                    value={activeBotId}
                    onChange={(e) => setSelectedBotIdForEmbed(e.target.value)}
                    aria-label="Select chatbot"
                  >
                    {bots.length > 0 ? (
                      bots.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))
                    ) : (
                      <option value="demo_bot_id">Demo starter bot</option>
                    )}
                  </select>
                </label>
                {bots.length > 0 && activeBotId && activeBotId !== 'demo_bot_id' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = bots.find(b => b.id === activeBotId);
                      if (target) setDeletingBot(target);
                    }}
                    className="icon-button danger bordered"
                    title="Delete the selected bot"
                  >
                    <Trash2 />
                  </button>
                )}
              </div>
            </div>

            <div className="panel-body flex flex-col gap-5">
              {/* Preview vs production notice */}
              <div className="callout tone-yellow">
                <AlertTriangle />
                <div>
                  <strong>Iframe embeds are blocked on development preview URLs</strong>
                  <p>
                    <code className="code-inline">{activeOrigin}</code> is a temporary preview environment.
                    Browsers block third-party <code className="code-inline">&lt;iframe&gt;</code> embeds from
                    sandboxed preview proxies. Use option 2 or 3 on external sites, or deploy to production for
                    inline iframe support.
                  </p>
                </div>
              </div>

              {/* Option 1 */}
              <div className="embed-option-card option-widget">
                <div className="embed-option-head">
                  <div>
                    <h4><i />Floating chat widget</h4>
                    <p>Renders a floating chat bubble in the corner of your site.</p>
                  </div>
                  <button type="button" onClick={copyScriptToClipboard} className="button-secondary compact">
                    {copiedScript ? <Check /> : <Copy />}
                    <span>{copiedScript ? 'Copied' : 'Copy script'}</span>
                  </button>
                </div>
                <div className="code-block">
                  <pre>{embedScriptTag}</pre>
                </div>
              </div>

              {/* Option 2 */}
              <div className="embed-option-card option-popup">
                <div className="embed-option-head">
                  <div>
                    <h4><i />Popup window</h4>
                    <p>
                      Opens the chatbot in a clean popup. Recommended for local development and strict sites
                      such as <code className="code-inline">127.0.0.1:5500</code>.
                    </p>
                  </div>
                  <button type="button" onClick={copyPopupScriptToClipboard} className="button-secondary compact">
                    {copiedPopupScript ? <Check /> : <Copy />}
                    <span>{copiedPopupScript ? 'Copied' : 'Copy script'}</span>
                  </button>
                </div>
                <div className="code-block">
                  <pre>{embedPopupScriptTag}</pre>
                </div>
              </div>

              {/* Option 3 */}
              <div className="embed-option-card option-link">
                <div className="embed-option-head">
                  <div>
                    <h4><i />Direct link</h4>
                    <p>Point an existing “Contact us” or “Book a demo” button straight at your chatbot.</p>
                  </div>
                  <button type="button" onClick={copyDirectLinkToClipboard} className="button-secondary compact">
                    {copiedDirectLink ? <Check /> : <Copy />}
                    <span>{copiedDirectLink ? 'Copied' : 'Copy link'}</span>
                  </button>
                </div>
                <div className="code-block">
                  <pre>{directWebLinkTag}</pre>
                </div>
              </div>

              {/* Option 4 */}
              <div className="embed-option-card option-frame">
                <div className="embed-option-head">
                  <div>
                    <h4><i />Inline iframe</h4>
                    <p>Embeds the chatbot inside a container on your page.</p>
                  </div>
                  <button type="button" onClick={copyIframeToClipboard} className="button-secondary compact">
                    {copiedIframe ? <Check /> : <Copy />}
                    <span>{copiedIframe ? 'Copied' : 'Copy iframe'}</span>
                  </button>
                </div>
                <div className="code-block">
                  <pre>{embedIframeTag}</pre>
                </div>
              </div>
            </div>
          </section>

          {/* Platform guides */}
          <div>
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Installation</p>
                <h2>Where to paste the snippet</h2>
              </div>
            </div>

            <div className="platform-guide-grid">
              <article className="platform-guide">
                <div className="platform-guide-head">
                  <span className="platform-chip">HTML</span>
                  <h4>Static website</h4>
                </div>
                <ol>
                  <li>Open your HTML file, for example <code className="code-inline">index.html</code>.</li>
                  <li>Scroll to the bottom, just before the closing <code className="code-inline">&lt;/body&gt;</code> tag.</li>
                  <li>Paste the <code className="code-inline">&lt;script&gt;</code> tag and save.</li>
                </ol>
              </article>

              <article className="platform-guide">
                <div className="platform-guide-head">
                  <span className="platform-chip">WP</span>
                  <h4>WordPress</h4>
                </div>
                <ol>
                  <li>Log in to your WordPress dashboard.</li>
                  <li>Go to <strong>Plugins → Add New</strong> and install “Insert Headers and Footers” or “WPCode”.</li>
                  <li>Paste the script into <strong>Footer Scripts</strong> and save.</li>
                </ol>
              </article>

              <article className="platform-guide">
                <div className="platform-guide-head">
                  <span className="platform-chip">WF</span>
                  <h4>Webflow, Shopify, Wix</h4>
                </div>
                <ol>
                  <li>Open <strong>Site settings → Custom code</strong> or your theme editor.</li>
                  <li>Find the <strong>Footer code</strong> field.</li>
                  <li>Paste the script and publish.</li>
                </ol>
              </article>

              <article className="platform-guide">
                <div className="platform-guide-head">
                  <span className="platform-chip">REACT</span>
                  <h4>React and Next.js</h4>
                </div>
                <ol>
                  <li>
                    In Next.js, add <code className="code-inline">&lt;Script src="{activeOrigin}/widget.js" data-bot-id="{activeBotId}" /&gt;</code> to your layout.
                  </li>
                  <li>In plain React, add the script tag to <code className="code-inline">public/index.html</code>.</li>
                </ol>
              </article>
            </div>
          </div>
        </div>
      ) : (
        /* ================= GOOGLE SHEETS ================= */
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <section className="panel">
              <div className="panel-head">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="icon-tile tile-lg tone-green"><FileSpreadsheet /></span>
                  <div className="min-w-0">
                    <h3>Google Sheets</h3>
                    <p>Link any chatbot flow directly to a spreadsheet in your account.</p>
                  </div>
                </div>

                {isConnected ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="status-pill tone-green"><CheckCircle2 />Connected</span>
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="button-secondary compact"
                      title="Re-authorize the existing Google account connection"
                    >
                      <RefreshCw className={isConnecting ? 'animate-spin' : ''} />
                      <span>{isConnecting ? 'Re-authorizing…' : 'Re-authorize'}</span>
                    </button>
                    <button type="button" onClick={handleDisconnect} className="button-ghost compact">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="button-primary"
                  >
                    {isConnecting ? 'Connecting…' : 'Connect Google account'}
                  </button>
                )}
              </div>

              <div className="panel-body">
                {isConnected ? (
                  <div className="flex flex-col gap-5">
                    <div>
                      <h4 className="text-ink text-[13.5px] font-semibold">Per-bot spreadsheets</h4>
                      <p className="text-muted mt-0.5 text-[12.5px]">
                        Paste a sheet URL, pick one from Drive, or generate a new sheet automatically.
                      </p>
                    </div>

                    {bots.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon"><Bot /></div>
                        <h4>No chatbots yet</h4>
                        <p>Create your first chatbot to start linking Google Sheets.</p>
                        <Link to="/builder/new" className="button-primary">
                          <Plus />
                          Create a chatbot
                        </Link>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {bots.map((bot) => {
                          const currentInput = botInputs[bot.id] || '';
                          const isBusy = !!botLoading[bot.id];
                          const testRes = botTestResults[bot.id];
                          const hasSheetLinked = !!bot.spreadsheetId;

                          return (
                            <div key={bot.id} className="bot-sheet-row">
                              <div className="bot-sheet-head">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className="icon-tile"><Bot /></span>
                                  <div className="min-w-0">
                                    <h5>{bot.name}</h5>
                                    <p className="truncate">
                                      {bot.id} · {hasSheetLinked ? 'Sheet linked' : 'Using default sheet'}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {hasSheetLinked && (
                                    <a
                                      href={`https://docs.google.com/spreadsheets/d/${bot.spreadsheetId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="button-secondary compact"
                                    >
                                      Open sheet <ExternalLink />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setDeletingBot(bot)}
                                    className="icon-button danger bordered"
                                    title="Delete this chatbot flow"
                                  >
                                    <Trash2 />
                                  </button>
                                </div>
                              </div>

                              {/* Quick select from Drive */}
                              {userSheets.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                  <label className="field-label" htmlFor={`drive-${bot.id}`}>
                                    Choose from Google Drive
                                  </label>
                                  <select
                                    id={`drive-${bot.id}`}
                                    className="select"
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        setBotInputs(prev => ({ ...prev, [bot.id]: e.target.value }));
                                      }
                                    }}
                                  >
                                    <option value="">Select a spreadsheet…</option>
                                    {userSheets.map((s) => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {/* Paste URL or ID */}
                              <label className="field-label" htmlFor={`sheet-${bot.id}`}>
                                Or paste a sheet URL / spreadsheet ID
                              </label>
                              <div className="field-row">
                                <input
                                  id={`sheet-${bot.id}`}
                                  type="text"
                                  value={currentInput}
                                  onChange={(e) => setBotInputs(prev => ({ ...prev, [bot.id]: e.target.value }))}
                                  placeholder="https://docs.google.com/spreadsheets/d/…"
                                  className="input input-mono"
                                />

                                <button
                                  type="button"
                                  onClick={() => handleLinkBotToSheet(bot.id)}
                                  disabled={isBusy}
                                  className="button-primary"
                                >
                                  {isBusy ? <Loader2 className="animate-spin" /> : <Link2 />}
                                  <span>Link sheet</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleCreateDedicatedSheetForBot(bot.id, bot.name)}
                                  disabled={isBusy}
                                  className="button-secondary"
                                  title="Create a new Google Sheet for this bot"
                                >
                                  {isBusy ? <Loader2 className="animate-spin" /> : <Plus />}
                                  <span>Auto-create</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleTestBotSheet(bot.id)}
                                  disabled={isBusy || !currentInput}
                                  className="button-secondary"
                                >
                                  Test access
                                </button>

                                {hasSheetLinked && (
                                  <button
                                    type="button"
                                    onClick={() => handleUnlinkBotSheet(bot.id)}
                                    disabled={isBusy}
                                    className="icon-button danger"
                                    title="Unlink sheet from bot"
                                  >
                                    <Trash2 />
                                  </button>
                                )}
                              </div>

                              {/* Connection result */}
                              {testRes && (
                                <div className={`result-banner ${testRes.success ? 'tone-green' : 'tone-red'}`}>
                                  <span>{testRes.msg}</span>
                                  {testRes.success && (
                                    <button
                                      type="button"
                                      onClick={() => handleSendTestLead(bot.id, bot.name)}
                                      disabled={isBusy}
                                      className="button-secondary compact"
                                    >
                                      <Send /> Send test row
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Default fallback sheet */}
                    <div className="subtle-card">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-ink text-[13px] font-semibold">Default fallback sheet</h4>
                          <p className="text-muted mt-0.5 text-[12px]">
                            Used when a chatbot has no dedicated sheet linked above.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCreateDefaultSheet}
                          disabled={isCreatingGlobal}
                          className="button-secondary compact"
                        >
                          {isCreatingGlobal ? <Loader2 className="animate-spin" /> : <Sparkles />}
                          Create default sheet
                        </button>
                      </div>

                      <div className="field-row" style={{ marginTop: '12px' }}>
                        <input
                          type="text"
                          value={globalSpreadsheetId}
                          onChange={(e) => setGlobalSpreadsheetId(e.target.value)}
                          placeholder="Paste default Google Sheet URL or ID"
                          className="input input-mono"
                          aria-label="Default Google Sheet"
                        />
                        <button
                          type="button"
                          onClick={handleSaveGlobalSpreadsheet}
                          disabled={isConnecting}
                          className="button-inverse"
                        >
                          Save default
                        </button>
                      </div>

                      {globalSpreadsheetId && (
                        <div className="text-faint mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                          <span className="text-mono truncate">{globalSpreadsheetId}</span>
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${globalSpreadsheetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent inline-flex items-center gap-1 font-medium"
                          >
                            Open default sheet <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon"><FileSpreadsheet /></div>
                    <h4>Google account not connected</h4>
                    <p>Authorize Mintage to write captured leads directly into your Google Sheets.</p>
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="button-primary"
                    >
                      Connect Google account
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Side documentation */}
          <aside>
            <section className="panel">
              <div className="panel-body">
                <span className="icon-tile tone-blue"><Sparkles /></span>
                <h3 className="mt-3.5 text-[15px] font-semibold">How the sync works</h3>
                <ul className="feature-list" style={{ marginTop: '14px' }}>
                  <li>
                    <Check />
                    <span><strong>Connect any sheet.</strong> Paste a Google Sheet URL to link it instantly.</span>
                  </li>
                  <li>
                    <Check />
                    <span><strong>Pick from Drive.</strong> Select an existing spreadsheet in one click.</span>
                  </li>
                  <li>
                    <Check />
                    <span><strong>Auto-create.</strong> Generate a formatted sheet with prepared headers.</span>
                  </li>
                  <li>
                    <Check />
                    <span><strong>Live sync.</strong> Each answer is appended as a row the moment it is submitted.</span>
                  </li>
                </ul>
                <Link to="/bots" className="button-secondary button-block">
                  Manage my chatbots
                  <ExternalLink />
                </Link>
              </div>
            </section>
          </aside>
        </div>
      )}

      {/* Delete bot confirmation */}
      {deletingBot && (
        <div className="modal-backdrop">
          <div className="notion-modal is-centered">
            <div className="modal-danger-icon">
              <AlertTriangle />
            </div>

            <h3>Delete this chatbot?</h3>
            <p className="mt-1.5">
              <strong>“{deletingBot.name}”</strong> will be permanently removed, along with its embed endpoints
              and Google Sheet link.
            </p>
            <p className="modal-note">
              Leads already captured by this bot stay available in Lead data.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setDeletingBot(null)}
                disabled={isDeletingBot}
                className="button-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteBot}
                disabled={isDeletingBot}
                className="button-danger flex-1"
              >
                {isDeletingBot ? <Loader2 className="animate-spin" /> : <Trash2 />}
                <span>{isDeletingBot ? 'Deleting…' : 'Delete bot'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
