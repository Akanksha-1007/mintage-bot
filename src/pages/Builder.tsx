import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { ReactFlow, Controls, Background, Panel, Node, Edge, Connection, addEdge, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useBotStore } from '../store/useBotStore';
import { Save, Plus, MessageSquare, UserPlus, List, Globe, Settings2, Trash2, ChevronRight, User, Phone, Mail, CheckSquare, HelpCircle, Sparkles, FileSpreadsheet, ExternalLink, Loader2, CheckCircle2, AlertCircle, LayoutGrid, Image as ImageIcon, Send } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { ImageNode, MessageNode, NameNode, PhoneNode, EmailNode, SingleChoiceNode, MultipleChoiceNode, TextQuestionNode, AiResponseNode, ApiNode, SaveNode } from '../components/CustomNodes';
import { Share2, Copy, Check, Database, X } from 'lucide-react';
import ClassicChatBuilder from '../components/ClassicChatBuilder';

import { useAuth } from '../context/AuthContext';

const nodeTypes = {
  image: ImageNode,
  message: MessageNode,
  name: NameNode,
  phone: PhoneNode,
  email: EmailNode,
  singleChoice: SingleChoiceNode,
  multipleChoice: MultipleChoiceNode,
  textQuestion: TextQuestionNode,
  aiResponse: AiResponseNode,
  api: ApiNode,
  saveLead: SaveNode,
};

function BuilderContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, setEdges } = useBotStore();
  const safeNodes = useMemo(() => Array.isArray(nodes) ? nodes : (nodes && typeof nodes === 'object' ? Object.values(nodes) as Node[] : []), [nodes]);
  const safeEdges = useMemo(() => Array.isArray(edges) ? edges : (edges && typeof edges === 'object' ? Object.values(edges) as Edge[] : []), [edges]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [botName, setBotName] = useState('My New Bot');
  const [botSpreadsheetId, setBotSpreadsheetId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingBot, setIsDeletingBot] = useState(false);
  const [builderMode, setBuilderMode] = useState<'classic' | 'visual'>('classic');

  const handleDeleteBotInBuilder = async () => {
    if (!id) return;
    setIsDeletingBot(true);
    try {
      // 1. Delete from Server API
      try {
        await fetch(`/api/bots/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await fetch('/api/bots/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
      } catch (e) {}

      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'bot_configurations', id)).catch(() => null);

      // 3. Blacklist in localStorage
      const deletedIdsRaw = localStorage.getItem('mintage_deleted_bot_ids');
      let deletedIds: string[] = [];
      if (deletedIdsRaw) {
        try { deletedIds = JSON.parse(deletedIdsRaw); } catch {}
      }
      if (!deletedIds.includes(id)) {
        deletedIds.push(id);
        localStorage.setItem('mintage_deleted_bot_ids', JSON.stringify(deletedIds));
      }

      // 4. Remove from all local caches
      ['mintage_bots', 'botflow_local_bots', 'mintage_bot_configurations'].forEach(key => {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              localStorage.setItem(key, JSON.stringify(parsed.filter((b: any) => b && b.id !== id)));
            }
          } catch {}
        }
      });

      navigate('/bots');
    } catch (error) {
      console.error('Error deleting bot:', error);
      showToast('Failed to delete bot. Please try again.', 'error');
      setIsDeletingBot(false);
    }
  };
  const [googleTokens, setGoogleTokens] = useState<any>(null);
  const [userSheets, setUserSheets] = useState<any[]>([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [isTestingSheet, setIsTestingSheet] = useState(false);
  const [sheetTestResult, setSheetTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const { effectiveUserId } = useAuth();

  const loadUserTokens = useCallback(async () => {
    // 1. Try local storage first for instant responsiveness
    const localTokens = localStorage.getItem('mintage_google_tokens');
    if (localTokens) {
      try {
        setGoogleTokens(JSON.parse(localTokens));
      } catch {}
    }

    // 2. Fetch from Firestore users collection if logged in
    const userUid = auth.currentUser?.uid || effectiveUserId;
    if (userUid) {
      try {
        const userDoc = await getDoc(doc(db, 'users', userUid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.googleTokens) {
            setGoogleTokens(data.googleTokens);
            localStorage.setItem('mintage_google_tokens', JSON.stringify(data.googleTokens));
          }
        }
      } catch (err: any) {
        if (err?.code !== 'permission-denied') {
          console.warn('Notice fetching Google tokens:', err?.message || err);
        }
      }
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadUserTokens();
  }, [loadUserTokens]);

  useEffect(() => {
    if (showSheetsModal) {
      loadUserTokens();
    }
  }, [showSheetsModal, loadUserTokens]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { tokens } = event.data;
        localStorage.setItem('mintage_google_tokens', JSON.stringify(tokens));
        setGoogleTokens(tokens);

        const userUid = auth.currentUser?.uid || effectiveUserId;
        if (userUid) {
          try {
            await setDoc(doc(db, 'users', userUid), {
              googleTokens: tokens,
              updatedAt: serverTimestamp(),
            }, { merge: true });
          } catch (error) {
            console.error('Error saving tokens:', error);
          }
        }
        showToast('Google Account connected successfully!');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [effectiveUserId]);

  const saveBotSpreadsheetId = async (sheetId: string) => {
    let cleanId = sheetId.trim();
    if (cleanId.includes('/d/')) {
      const match = cleanId.match(/\/d\/([\w-_]+)/);
      if (match && match[1]) cleanId = match[1];
    }
    setBotSpreadsheetId(cleanId);

    const targetUserId = effectiveUserId || auth.currentUser?.uid || 'guest_user';

    if (id) {
      try {
        await updateDoc(doc(db, 'bot_configurations', id), {
          spreadsheetId: cleanId,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Firestore bot update warning:', err);
      }

      // Sync to LocalStorage cache
      const localBotsRaw = localStorage.getItem('mintage_bots');
      if (localBotsRaw) {
        try {
          const parsed = JSON.parse(localBotsRaw);
          const updated = parsed.map((b: any) => b.id === id ? { ...b, spreadsheetId: cleanId } : b);
          localStorage.setItem('mintage_bots', JSON.stringify(updated));
        } catch {}
      }
    }
    showToast('Google Sheet linked to Chatbot!');
  };

  useEffect(() => {
    if (id) {
      const loadBot = async () => {
        try {
          const docRef = doc(db, 'bot_configurations', id);
          const docSnap = await getDoc(docRef).catch(() => null);
          if (docSnap && docSnap.exists()) {
            const data = docSnap.data();
            setBotName(data.name || '');
            const rawNodes = data.nodes;
            const nodesArr = Array.isArray(rawNodes) ? rawNodes : (rawNodes && typeof rawNodes === 'object' ? Object.values(rawNodes) : []);
            const rawEdges = data.edges;
            const edgesArr = Array.isArray(rawEdges) ? rawEdges : (rawEdges && typeof rawEdges === 'object' ? Object.values(rawEdges) : []);
            setNodes(nodesArr);
            setEdges(edgesArr);
            if (data.spreadsheetId) {
              setBotSpreadsheetId(data.spreadsheetId);
            }
            return;
          }
        } catch (err) {
          console.warn('Firestore loadBot error, checking cache:', err);
        }

        // Fallback to local storage cache
        const localBotsRaw = localStorage.getItem('mintage_bots');
        if (localBotsRaw) {
          try {
            const localBots = JSON.parse(localBotsRaw);
            const found = localBots.find((b: any) => b.id === id);
            if (found) {
              setBotName(found.name || '');
              const rawLocalNodes = found.nodes;
              const localNodesArr = Array.isArray(rawLocalNodes) ? rawLocalNodes : (rawLocalNodes && typeof rawLocalNodes === 'object' ? Object.values(rawLocalNodes) : []);
              const rawLocalEdges = found.edges;
              const localEdgesArr = Array.isArray(rawLocalEdges) ? rawLocalEdges : (rawLocalEdges && typeof rawLocalEdges === 'object' ? Object.values(rawLocalEdges) : []);
              setNodes(localNodesArr);
              setEdges(localEdgesArr);
              if (found.spreadsheetId) setBotSpreadsheetId(found.spreadsheetId);
            }
          } catch (e) {
            console.error('Local cache parse error:', e);
          }
        }
      };
      loadBot();
    }
  }, [id, setNodes, setEdges]);

  const loadUserGoogleSheets = async () => {
    if (!googleTokens) return;
    setIsLoadingSheets(true);
    try {
      const res = await fetch('/api/sheets/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: googleTokens }),
      });
      const data = await res.json();
      if (res.ok) {
        setUserSheets(data.files || []);
      }
    } catch (error) {
      console.error('Failed to load sheets:', error);
    } finally {
      setIsLoadingSheets(false);
    }
  };

  useEffect(() => {
    if (showSheetsModal && googleTokens) {
      loadUserGoogleSheets();
    }
  }, [showSheetsModal, googleTokens]);

  const handleConnectGoogle = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Failed to get auth URL', 'error');
        return;
      }
      window.open(data.url, 'google_oauth', 'width=600,height=700');
    } catch (error) {
      showToast('An unexpected error occurred during Google Auth', 'error');
    }
  };

  const handleCreateNewSheet = async () => {
    if (!googleTokens) {
      showToast('Please connect your Google Account first', 'error');
      return;
    }
    setIsCreatingSheet(true);
    try {
      const res = await fetch('/api/sheets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: googleTokens,
          title: `Leads - ${botName || 'BotFlow Chatbot'}`
        }),
      });
      const data = await res.json();
      if (res.ok && data.spreadsheetId) {
        await saveBotSpreadsheetId(data.spreadsheetId);
        setSheetTestResult({
          success: true,
          message: `Created sheet "${data.title}" and linked to this chatbot!`
        });
        showToast('New Google Sheet created and linked!');
        loadUserGoogleSheets();
      } else {
        showToast(data.error || 'Failed to create sheet', 'error');
      }
    } catch (error) {
      console.error('Error creating sheet:', error);
      showToast('Error creating new sheet', 'error');
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleTestConnection = async () => {
    let cleanId = botSpreadsheetId.trim();
    if (cleanId.includes('/d/')) {
      const match = cleanId.match(/\/d\/([\w-_]+)/);
      if (match && match[1]) cleanId = match[1];
    }
    if (!cleanId) {
      showToast('Please enter a Spreadsheet ID or URL', 'error');
      return;
    }
    if (!googleTokens) {
      showToast('Please connect Google Account first', 'error');
      return;
    }
    setIsTestingSheet(true);
    setSheetTestResult(null);
    try {
      const res = await fetch('/api/sheets/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: googleTokens, spreadsheetId: cleanId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await saveBotSpreadsheetId(cleanId);
        setSheetTestResult({
          success: true,
          message: `Connected successfully to sheet: "${data.title}"`
        });
      } else {
        setSheetTestResult({
          success: false,
          message: data.error || 'Could not connect to Google Sheet.'
        });
      }
    } catch (error: any) {
      setSheetTestResult({
        success: false,
        message: error.message || 'Connection test failed'
      });
    } finally {
      setIsTestingSheet(false);
    }
  };

  const onSave = async () => {
    const targetUserId = effectiveUserId || auth.currentUser?.uid || 'guest_user';
    
    setIsSaving(true);
    try {
      let cleanSpreadsheetId = botSpreadsheetId.trim();
      if (cleanSpreadsheetId.includes('/d/')) {
        const match = cleanSpreadsheetId.match(/\/d\/([\w-_]+)/);
        if (match && match[1]) cleanSpreadsheetId = match[1];
      }

      // Clean data to prevent "Unsupported field value: undefined" errors
      const cleanNodes = JSON.parse(JSON.stringify(safeNodes));
      const cleanEdges = JSON.parse(JSON.stringify(safeEdges));

      let savedId = id || ('bot_' + Date.now());
      let firestoreSuccess = false;

      // 1. Try saving to Firestore with explicit document ID matching savedId
      try {
        await setDoc(doc(db, 'bot_configurations', savedId), {
          id: savedId,
          name: botName || 'Unnamed Bot',
          nodes: cleanNodes,
          edges: cleanEdges,
          spreadsheetId: cleanSpreadsheetId,
          createdBy: targetUserId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        firestoreSuccess = true;
      } catch (fsErr) {
        console.warn('Firestore save flow warning, falling back to local/server cache:', fsErr);
      }

      // 2. Always sync to LocalStorage and Express Server API
      if (!savedId) {
        savedId = 'bot_' + Date.now();
      }

      const newBotObj = {
        id: savedId,
        name: botName || 'Unnamed Bot',
        nodes: cleanNodes,
        edges: cleanEdges,
        spreadsheetId: cleanSpreadsheetId,
        createdBy: targetUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Sync to Express Server
      try {
        await fetch('/api/bots/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newBotObj)
        });
      } catch (apiErr) {
        console.warn('Server bot sync error:', apiErr);
      }

      const existingBotsRaw = localStorage.getItem('mintage_bots');
      let existingBots: any[] = [];
      if (existingBotsRaw) {
        try { existingBots = JSON.parse(existingBotsRaw); } catch {}
      }

      const existingIdx = existingBots.findIndex(b => b.id === savedId);
      if (existingIdx >= 0) {
        existingBots[existingIdx] = newBotObj;
      } else {
        existingBots.unshift(newBotObj);
      }
      localStorage.setItem('mintage_bots', JSON.stringify(existingBots));

      if (!id && savedId) {
        navigate(`/builder/${savedId}`, { replace: true });
      }

      showToast('Bot configurations saved successfully!');
    } catch (error) {
      console.error('Error saving flow:', error);
      showToast('Saved to local session.', 'success');
    } finally {
      setIsSaving(false);
    }
  };

  const getAppBaseUrl = () => {
    if (typeof window === 'undefined') return 'https://akanksha-1007.github.io/mintage-bot';
    const origin = window.location.origin;
    const baseUrl = import.meta.env.BASE_URL || '/';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return origin + cleanBase;
  };
  const activeOrigin = getAppBaseUrl();

  const embedScriptTag = `<script src="${activeOrigin}/widget.js" data-bot-id="${id || 'SAVE_FIRST'}" async></script>`;
  const embedIframeTag = `<iframe src="${activeOrigin}/widget/${id || 'SAVE_FIRST'}" width="380" height="600" style="border:none; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,0.15);"></iframe>`;

  const bubbleScript = `<script>
  (function() {
    var container = document.createElement('div');
    container.id = 'botflow-widget-container';
    container.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:2147483647; font-family:sans-serif;';
    
    var button = document.createElement('button');
    button.id = 'botflow-widget-button';
    button.innerHTML = '💬';
    button.style.cssText = 'width:60px; height:60px; border-radius:30px; background:#4f46e5; border:none; color:white; font-size:24px; cursor:pointer; box-shadow:0 4px 15px rgba(79,70,229,0.4); transition:transform 0.2s; display:flex; align-items:center; justify-content:center; padding:0; margin:0; outline:none;';
    button.onmouseover = function() { this.style.transform = 'scale(1.1)'; };
    button.onmouseout = function() { this.style.transform = 'scale(1)'; };
    
    var iframe = document.createElement('iframe');
    iframe.id = 'botflow-widget-iframe';
    iframe.src = '${activeOrigin}/widget/${id || 'SAVE_FIRST'}';
    iframe.style.cssText = 'display:none; position:absolute; bottom:80px; right:0; width:400px; height:600px; border:none; border-radius:20px; box-shadow:0 10px 40px rgba(0,0,0,0.15); background:white; transition: opacity 0.3s ease; opacity:0; z-index:2147483647;';
    
    if (window.innerWidth < 480) {
      iframe.style.width = 'calc(100vw - 40px)';
      iframe.style.height = 'calc(100vh - 120px)';
    }
    
    var isOpen = false;
    button.onclick = function() {
      isOpen = !isOpen;
      if (isOpen) {
        iframe.style.display = 'block';
        setTimeout(function() { iframe.style.opacity = '1'; }, 10);
        button.innerHTML = '✕';
      } else {
        iframe.style.opacity = '0';
        setTimeout(function() { iframe.style.display = 'none'; }, 300);
        button.innerHTML = '💬';
      }
    };
    
    container.appendChild(iframe);
    container.appendChild(button);
    document.body.appendChild(container);
  })();
</script>`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addNode = (type: string) => {
    const newNode: Node = {
      id: `${Date.now()}`,
      type,
      data: { 
        label: type === 'message' ? 'Welcome! Thanks for showing interest! 🚀' : 
               type === 'singleChoice' || type === 'multipleChoice' ? 'Please select an option:' : 
               type === 'textQuestion' ? 'To start, could you share your full name with us? ✨' :
               'New Node',
        choices: (type === 'singleChoice' || type === 'multipleChoice') ? ['Option 1', 'Option 2'] : undefined,
      },
      position: { x: 400, y: 200 },
    };
    setNodes([...(Array.isArray(nodes) ? nodes : []), newNode]);
  };

  const deleteNode = (id: string) => {
    setNodes((Array.isArray(nodes) ? nodes : []).filter(n => n.id !== id));
    setEdges((Array.isArray(edges) ? edges : []).filter(e => e.source !== id && e.target !== id));
    setSelectedNode(null);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 relative">
      {/* Visual Elegant Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 bg-gray-900/95 backdrop-blur-md text-white px-5 py-3 rounded-xl shadow-2xl border border-white/10 animate-fade-in-up">
          <div className={`p-1 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
            <Check className="w-4 h-4 text-white stroke-[3px]" />
          </div>
          <span className="text-xs font-bold font-sans tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Google Sheets Modal */}
      {showSheetsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Google Sheets Integration</h3>
                  <p className="text-xs text-gray-500">Connect this chatbot to any Google Sheet to automatically log new leads.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSheetsModal(false)} 
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Account Auth Status */}
            <div className="mb-6 p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${googleTokens ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                <div>
                  <p className="text-xs font-bold text-gray-900">
                    {googleTokens ? 'Google Account Connected' : 'Google Account Required'}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {googleTokens ? 'Authorized to sync spreadsheet leads.' : 'Connect your account to select or create Google Sheets.'}
                  </p>
                </div>
              </div>
              {!googleTokens ? (
                <button
                  onClick={handleConnectGoogle}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                >
                  Connect Google Account
                </button>
              ) : (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Connected
                </span>
              )}
            </div>

            {googleTokens && (
              <div className="space-y-6">
                {/* 1-Click Quick Action: Create New Sheet */}
                <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Create a Dedicated Sheet for This Bot
                    </h4>
                    <p className="text-xs text-emerald-800/80 mt-1">
                      Generates a new Google Sheet named "Leads - {botName}" with pre-formatted column headers.
                    </p>
                  </div>
                  <button
                    onClick={handleCreateNewSheet}
                    disabled={isCreatingSheet}
                    className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 shrink-0 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isCreatingSheet ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create New Sheet
                      </>
                    )}
                  </button>
                </div>

                {/* Option 2: Select from existing Drive sheets */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Select From Your Google Drive</label>
                    <button 
                      onClick={loadUserGoogleSheets}
                      disabled={isLoadingSheets}
                      className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      {isLoadingSheets && <Loader2 className="w-3 h-3 animate-spin" />}
                      Refresh List
                    </button>
                  </div>

                  {isLoadingSheets ? (
                    <div className="p-8 text-center bg-gray-50 rounded-2xl">
                      <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                      <p className="text-xs text-gray-500 font-medium">Fetching Google Sheets from Drive...</p>
                    </div>
                  ) : userSheets.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-2xl divide-y divide-gray-50 bg-white">
                      {userSheets.map((sheet) => {
                        const isSelected = botSpreadsheetId === sheet.id;
                        return (
                          <div key={sheet.id} className="p-3 hover:bg-gray-50 flex items-center justify-between transition-colors">
                            <div className="truncate mr-3">
                              <p className="text-xs font-bold text-gray-800 truncate">{sheet.name}</p>
                              <p className="text-[10px] text-gray-400">ID: {sheet.id}</p>
                            </div>
                            <button
                              onClick={async () => {
                                await saveBotSpreadsheetId(sheet.id);
                                setSheetTestResult({
                                  success: true,
                                  message: `Selected & linked sheet: "${sheet.name}"`
                                });
                              }}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 ${
                                isSelected 
                                  ? 'bg-emerald-600 text-white' 
                                  : 'bg-gray-100 text-gray-700 hover:bg-indigo-600 hover:text-white'
                              }`}
                            >
                              {isSelected ? '✓ Linked' : 'Select Sheet'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-xl">No existing Google Sheets found in Drive. Click above to create one!</p>
                  )}
                </div>

                {/* Option 3: Manual Spreadsheet ID or URL */}
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Or Enter Sheet ID / URL Manually</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={botSpreadsheetId}
                      onChange={(e) => setBotSpreadsheetId(e.target.value)}
                      placeholder="e.g. 1aBcDeFgHiJkLmNoPqRsTuVwXyZ or full sheet URL"
                      className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                    />
                    <button
                      onClick={handleTestConnection}
                      disabled={isTestingSheet}
                      className="px-4 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-all shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isTestingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Save & Link
                    </button>
                  </div>

                  {/* Feedback Banner */}
                  {sheetTestResult && (
                    <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      sheetTestResult.success 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                        : 'bg-red-50 text-red-800 border border-red-100'
                    }`}>
                      {sheetTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                      <span>{sheetTestResult.message}</span>
                    </div>
                  )}

                  {botSpreadsheetId && googleTokens && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-200/80">
                      <div>
                        <span className="font-mono text-[10px] text-gray-400 block">Linked ID: {botSpreadsheetId}</span>
                        <a 
                          href={`https://docs.google.com/spreadsheets/d/${botSpreadsheetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 mt-0.5"
                        >
                          Open Sheet <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/sync-lead', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                tokens: googleTokens,
                                spreadsheetId: botSpreadsheetId,
                                leadData: {
                                  fullName: 'Sample Test Lead',
                                  email: 'testlead@example.com',
                                  phone: '+1 (555) 019-2831',
                                  sourceBot: botName || 'BotFlow Chatbot',
                                  status: 'Verified from Builder'
                                }
                              }),
                            });
                            const data = await res.json();
                            if (res.ok && data.success) {
                              showToast('🎉 Test row appended to Google Sheet successfully!');
                            } else {
                              showToast(data.error || 'Failed to append test row', 'error');
                            }
                          } catch (err: any) {
                            showToast(`Error syncing: ${err.message}`, 'error');
                          }
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1 shrink-0"
                      >
                        <Send className="w-3 h-3" /> Send Test Row
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button 
                onClick={() => setShowSheetsModal(false)}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all"
              >
                Close
              </button>
              <button 
                onClick={async () => {
                  if (botSpreadsheetId) {
                    await saveBotSpreadsheetId(botSpreadsheetId);
                  }
                  await onSave();
                  setShowSheetsModal(false);
                }}
                className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Embed Chatbot</h3>
              <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Option 1: One-Line JS Script Tag (Recommended)</label>
                <div className="relative group">
                  <pre className="bg-gray-900 text-gray-300 p-4 rounded-xl text-[10px] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {embedScriptTag}
                  </pre>
                  <button 
                    onClick={() => copyToClipboard(embedScriptTag)}
                    className="absolute top-2 right-2 p-2 bg-indigo-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 italic">Automatically renders a floating chat widget bubble on any website.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Option 2: Inline iFrame</label>
                <div className="relative group">
                  <pre className="bg-gray-900 text-gray-300 p-4 rounded-xl text-[10px] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {embedIframeTag}
                  </pre>
                  <button 
                    onClick={() => copyToClipboard(embedIframeTag)}
                    className="absolute top-2 right-2 p-2 bg-indigo-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 italic">Best for embedding directly into a page layout or custom container.</p>
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setShowShareModal(false)}
                className="px-6 py-2 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Bot Confirmation Modal in Builder */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-gray-100 text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto shrink-0">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900">Delete This Bot?</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Are you sure you want to delete <strong className="text-gray-800">"{botName}"</strong>? This will permanently remove the bot flow and its live widget endpoint.
              </p>
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 p-2.5 rounded-xl font-medium mt-2">
                Note: Captured lead data for this bot will remain in your Lead Data logs.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingBot}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteBotInBuilder}
                disabled={isDeletingBot}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeletingBot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{isDeletingBot ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {builderMode === 'classic' ? (
        <ClassicChatBuilder
          nodes={safeNodes}
          edges={safeEdges}
          botName={botName}
          setBotName={setBotName}
          setNodes={setNodes}
          setEdges={setEdges}
          onSave={onSave}
          isSaving={isSaving}
          onToggleMode={() => setBuilderMode('visual')}
          botSpreadsheetId={botSpreadsheetId}
          setShowSheetsModal={setShowSheetsModal}
          setShowShareModal={setShowShareModal}
          setShowDeleteModal={setShowDeleteModal}
          botId={id}
          showToast={showToast}
        />
      ) : (
        <>
          {/* Builder Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <Settings2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <input 
              type="text" 
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              className="text-sm font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 w-48"
              placeholder="Bot Name"
            />
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
              {id ? 'Live' : 'Draft'} • Last saved {id ? 'just now' : 'never'}
            </p>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => setBuilderMode('classic')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-all shadow-xs"
            title="Switch to Classic 3-Column Chat Flow Builder"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Classic Builder</span>
          </button>

          <button
            onClick={() => setShowSheetsModal(true)}
            className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-all border ${
              botSpreadsheetId 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <FileSpreadsheet className={`w-4 h-4 ${botSpreadsheetId ? 'text-emerald-600' : 'text-gray-500'}`} />
            <span>{botSpreadsheetId ? 'Google Sheet Linked' : 'Connect Sheet'}</span>
            {botSpreadsheetId && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            )}
          </button>

          {id && (
            <>
              <button 
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <button 
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100"
                title="Delete Bot"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
                <span>Delete</span>
              </button>
            </>
          )}
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Publish Bot'}
          </button>
        </div>
      </header>

      {/* Google Sheets Modal */}
      {showSheetsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Google Sheets Integration</h3>
                  <p className="text-xs text-gray-500">Connect this chatbot to any Google Sheet to automatically log new leads.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSheetsModal(false)} 
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Account Auth Status */}
            <div className="mb-6 p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${googleTokens ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                <div>
                  <p className="text-xs font-bold text-gray-900">
                    {googleTokens ? 'Google Account Connected' : 'Google Account Required'}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {googleTokens ? 'Authorized to sync spreadsheet leads.' : 'Connect your account to select or create Google Sheets.'}
                  </p>
                </div>
              </div>
              {!googleTokens ? (
                <button
                  onClick={handleConnectGoogle}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                >
                  Connect Google Account
                </button>
              ) : (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Connected
                </span>
              )}
            </div>

            {googleTokens && (
              <div className="space-y-6">
                {/* 1-Click Quick Action: Create New Sheet */}
                <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Create a Dedicated Sheet for This Bot
                    </h4>
                    <p className="text-xs text-emerald-800/80 mt-1">
                      Generates a new Google Sheet named "Leads - {botName}" with pre-formatted column headers.
                    </p>
                  </div>
                  <button
                    onClick={handleCreateNewSheet}
                    disabled={isCreatingSheet}
                    className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 shrink-0 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isCreatingSheet ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create New Sheet
                      </>
                    )}
                  </button>
                </div>

                {/* Option 2: Select from existing Drive sheets */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Select From Your Google Drive</label>
                    <button 
                      onClick={loadUserGoogleSheets}
                      disabled={isLoadingSheets}
                      className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      {isLoadingSheets && <Loader2 className="w-3 h-3 animate-spin" />}
                      Refresh List
                    </button>
                  </div>

                  {isLoadingSheets ? (
                    <div className="p-8 text-center bg-gray-50 rounded-2xl">
                      <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                      <p className="text-xs text-gray-500 font-medium">Fetching Google Sheets from Drive...</p>
                    </div>
                  ) : userSheets.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-2xl divide-y divide-gray-50 bg-white">
                      {userSheets.map((sheet) => {
                        const isSelected = botSpreadsheetId === sheet.id;
                        return (
                          <div key={sheet.id} className="p-3 hover:bg-gray-50 flex items-center justify-between transition-colors">
                            <div className="truncate mr-3">
                              <p className="text-xs font-bold text-gray-800 truncate">{sheet.name}</p>
                              <p className="text-[10px] text-gray-400">ID: {sheet.id}</p>
                            </div>
                            <button
                              onClick={() => {
                                setBotSpreadsheetId(sheet.id);
                                setSheetTestResult({
                                  success: true,
                                  message: `Selected sheet: "${sheet.name}"`
                                });
                              }}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 ${
                                isSelected 
                                  ? 'bg-emerald-600 text-white' 
                                  : 'bg-gray-100 text-gray-700 hover:bg-indigo-600 hover:text-white'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Select Sheet'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-xl">No existing Google Sheets found in Drive. Click above to create one!</p>
                  )}
                </div>

                {/* Option 3: Manual Spreadsheet ID or URL */}
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Or Enter Sheet ID / URL Manually</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={botSpreadsheetId}
                      onChange={(e) => setBotSpreadsheetId(e.target.value)}
                      placeholder="e.g. 1aBcDeFgHiJkLmNoPqRsTuVwXyZ or full sheet URL"
                      className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                      onClick={handleTestConnection}
                      disabled={isTestingSheet}
                      className="px-4 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-all shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isTestingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Test Link
                    </button>
                  </div>

                  {/* Feedback Banner */}
                  {sheetTestResult && (
                    <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      sheetTestResult.success 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                        : 'bg-red-50 text-red-800 border border-red-100'
                    }`}>
                      {sheetTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                      <span>{sheetTestResult.message}</span>
                    </div>
                  )}

                  {botSpreadsheetId && (
                    <div className="flex items-center justify-between text-[11px] text-gray-500 bg-gray-50 px-3 py-2 rounded-xl">
                      <span className="font-mono text-[10px] text-gray-400">Linked ID: {botSpreadsheetId}</span>
                      <a 
                        href={`https://docs.google.com/spreadsheets/d/${botSpreadsheetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 font-bold hover:underline flex items-center gap-1"
                      >
                        Open Sheet <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button 
                onClick={() => setShowSheetsModal(false)}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  onSave();
                  setShowSheetsModal(false);
                }}
                className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                Save & Link to Bot
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Node Library */}
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col z-10">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Add Chat Component</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Frequently Used */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Frequently used</h4>
              
              <button onClick={() => addNode('message')} className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all group">
                <div className="p-1.5 bg-blue-500 rounded text-white"><MessageSquare className="w-3.5 h-3.5" /></div>
                <span className="text-xs font-bold text-gray-700">Message</span>
              </button>

              <button onClick={() => addNode('name')} className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all group">
                <div className="p-1.5 bg-emerald-500 rounded text-white"><User className="w-3.5 h-3.5" /></div>
                <span className="text-xs font-bold text-gray-700">Name</span>
              </button>

              <button onClick={() => addNode('phone')} className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-teal-200 hover:bg-teal-50 transition-all group">
                <div className="p-1.5 bg-teal-500 rounded text-white"><Phone className="w-3.5 h-3.5" /></div>
                <span className="text-xs font-bold text-gray-700">Phone Number</span>
              </button>

              <button onClick={() => addNode('email')} className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-cyan-200 hover:bg-cyan-50 transition-all group">
                <div className="p-1.5 bg-cyan-500 rounded text-white"><Mail className="w-3.5 h-3.5" /></div>
                <span className="text-xs font-bold text-gray-700">Email</span>
              </button>

              <button onClick={() => addNode('singleChoice')} className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 transition-all group">
                <div className="p-1.5 bg-indigo-500 rounded text-white"><CheckSquare className="w-3.5 h-3.5" /></div>
                <span className="text-xs font-bold text-gray-700">Single Choice</span>
              </button>

              <button onClick={() => addNode('multipleChoice')} className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-purple-200 hover:bg-purple-50 transition-all group">
                <div className="p-1.5 bg-purple-500 rounded text-white"><List className="w-3.5 h-3.5" /></div>
                <span className="text-xs font-bold text-gray-700">Multiple Choice</span>
              </button>

              <button onClick={() => addNode('textQuestion')} className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-orange-200 hover:bg-orange-50 transition-all group">
                <div className="p-1.5 bg-orange-500 rounded text-white"><HelpCircle className="w-3.5 h-3.5" /></div>
                <span className="text-xs font-bold text-gray-700">Text Question</span>
              </button>

              <button onClick={() => addNode('aiResponse')} className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-pink-200 hover:bg-pink-50 transition-all group">
                <div className="p-1.5 bg-gradient-to-r from-pink-500 to-rose-500 rounded text-white"><Sparkles className="w-3.5 h-3.5" /></div>
                <span className="text-xs font-bold text-gray-700">AI Responses</span>
              </button>

              <button onClick={() => addNode('saveLead')} className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-amber-200 hover:bg-amber-50 transition-all group">
                <div className="p-1.5 bg-amber-500 rounded text-white"><Database className="w-3.5 h-3.5" /></div>
                <span className="text-xs font-bold text-gray-700">Save Lead (Checkpoint)</span>
              </button>
            </div>

            {/* Other Categories */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 py-2 border-t border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Request Information</span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
              </div>
              <div className="flex items-center justify-between px-1 py-2 border-t border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Send Information</span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
              </div>
              <div className="flex items-center justify-between px-1 py-2 border-t border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Decide and Act</span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
              </div>
            </div>
          </div>
        </aside>

        {/* Canvas Area */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={safeNodes}
            edges={safeEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background color="#e5e7eb" gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Right Sidebar: Properties Panel */}
        {selectedNode && (
          <aside className="w-80 bg-white border-l border-gray-200 flex flex-col z-10">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Properties</h3>
              <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customize {selectedNode.type === 'saveLead' ? 'Action' : 'Bot Message'}</label>
                <textarea
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[100px]"
                  value={selectedNode.data.label as string}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    setNodes(safeNodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, label: newLabel } } : n));
                    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, label: newLabel } });
                  }}
                  placeholder={selectedNode.type === 'saveLead' ? 'e.g. Save after welcome' : 'Type message here...'}
                />
                {selectedNode.type !== 'saveLead' && (
                  <div className="grid grid-cols-6 gap-2 pt-2">
                    {['👋', '😊', '🔥', '🚀', '✨', '💡', '✅', '❌', '📞', '📧', '👤', '🤖'].map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => {
                          const newLabel = (selectedNode.data.label as string || '') + emoji;
                          setNodes(safeNodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, label: newLabel } } : n));
                          setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, label: newLabel } });
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded text-lg flex items-center justify-center transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {['name', 'email', 'phone', 'textQuestion', 'singleChoice', 'multipleChoice'].includes(selectedNode.type!) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Lead Data Key (e.g. company_name)</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    value={selectedNode.data.leadKey as string || ''}
                    onChange={(e) => {
                      const newKey = e.target.value;
                      setNodes(safeNodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, leadKey: newKey } } : n));
                      setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, leadKey: newKey } });
                    }}
                    placeholder="Auto-generated if empty"
                  />
                  <p className="text-[9px] text-gray-400">This links the answer to a field in your dashboard/spreadsheet.</p>
                </div>
              )}

              {/* Next Step Configuration for ALL Component Types */}
              <div className="space-y-2 pt-3 border-t border-gray-100">
                <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center justify-between">
                  <span>Next Step (Redirection)</span>
                  <span className="text-[9px] bg-indigo-50 px-1.5 py-0.5 rounded text-indigo-700 font-semibold">Flow Control</span>
                </label>
                <p className="text-[10px] text-gray-500">Choose which component step follows this step in the chat flow.</p>
                <select
                  value={(selectedNode.data.nextStepId as string) || ''}
                  onChange={(e) => {
                    const targetId = e.target.value;
                    const updatedNode = {
                      ...selectedNode,
                      data: { ...selectedNode.data, nextStepId: targetId }
                    };
                    setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                    setSelectedNode(updatedNode);

                    // Sync edges
                    let otherEdges = safeEdges.filter(ed => ed.source !== selectedNode.id || ed.sourceHandle);
                    if (targetId && targetId !== 'END') {
                      otherEdges.push({
                        id: `e_${selectedNode.id}-${targetId}`,
                        source: selectedNode.id,
                        target: targetId,
                        type: 'smoothstep',
                        style: { stroke: '#6366f1', strokeWidth: 2 }
                      });
                    }
                    setEdges(otherEdges);
                  }}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-indigo-200 outline-none"
                >
                  <option value="">Default Next Step (Sequential)</option>
                  <option value="END">🛑 End Chat Flow Here</option>
                  {safeNodes.filter(n => n.id !== selectedNode.id).map((n) => {
                    const idx = safeNodes.findIndex(sn => sn.id === n.id) + 1;
                    const label = (n.data?.label as string) || n.type;
                    return (
                      <option key={n.id} value={n.id}>
                        Step #{idx}: {label.length > 22 ? label.slice(0, 22) + '...' : label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {(selectedNode.type === 'singleChoice' || selectedNode.type === 'multipleChoice') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Options & Choice Redirection</label>
                  <p className="text-[10px] text-gray-500 mb-2">Connect each choice option to a specific next step or leave as default.</p>

                  <div className="space-y-3">
                    {(selectedNode.data.choices as string[] || []).map((choice, i) => {
                      const currentRoute = (selectedNode.data.optionRoutes as Record<string, string>)?.[choice] || '';

                      return (
                        <div key={i} className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2 shadow-2xs">
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              className="flex-1 border border-gray-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-800"
                              value={choice}
                              onChange={(e) => {
                                const newChoiceName = e.target.value;
                                const oldChoices = [...(selectedNode.data.choices as string[])];
                                oldChoices[i] = newChoiceName;

                                const oldRoutes = { ...((selectedNode.data.optionRoutes as Record<string, string>) || {}) };
                                if (oldRoutes[choice] && choice !== newChoiceName) {
                                  oldRoutes[newChoiceName] = oldRoutes[choice];
                                  delete oldRoutes[choice];
                                }

                                const updatedNode = {
                                  ...selectedNode,
                                  data: { ...selectedNode.data, choices: oldChoices, optionRoutes: oldRoutes }
                                };
                                setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                                setSelectedNode(updatedNode);
                              }}
                            />
                            <button
                              onClick={() => {
                                const newChoices = (selectedNode.data.choices as string[]).filter((_, idx) => idx !== i);
                                const oldRoutes = { ...((selectedNode.data.optionRoutes as Record<string, string>) || {}) };
                                delete oldRoutes[choice];

                                const updatedNode = {
                                  ...selectedNode,
                                  data: { ...selectedNode.data, choices: newChoices, optionRoutes: oldRoutes }
                                };
                                setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                                setSelectedNode(updatedNode);

                                const updatedEdges = safeEdges.filter(ed => !(ed.source === selectedNode.id && (ed.label === choice || ed.sourceHandle === choice)));
                                setEdges(updatedEdges);
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-gray-100"
                              title="Remove choice option"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2 pt-1.5 border-t border-gray-200/80">
                            <span className="text-[10px] font-bold text-indigo-600 shrink-0">➜ Connects To:</span>
                            <select
                              value={currentRoute}
                              onChange={(e) => {
                                const targetId = e.target.value;
                                const oldRoutes = { ...((selectedNode.data.optionRoutes as Record<string, string>) || {}) };
                                if (targetId) {
                                  oldRoutes[choice] = targetId;
                                } else {
                                  delete oldRoutes[choice];
                                }

                                const updatedNode = {
                                  ...selectedNode,
                                  data: { ...selectedNode.data, optionRoutes: oldRoutes }
                                };
                                setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                                setSelectedNode(updatedNode);

                                let updatedEdges = safeEdges.filter(ed => !(ed.source === selectedNode.id && (ed.label === choice || ed.sourceHandle === choice)));
                                if (targetId) {
                                  updatedEdges.push({
                                    id: `e_${selectedNode.id}_${choice}_${targetId}`,
                                    source: selectedNode.id,
                                    target: targetId,
                                    label: choice,
                                    sourceHandle: choice,
                                    type: 'smoothstep',
                                    style: { stroke: '#6366f1', strokeWidth: 2 }
                                  });
                                }
                                setEdges(updatedEdges);
                              }}
                              className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-medium text-gray-800 focus:ring-2 focus:ring-indigo-200"
                            >
                              <option value="">Default Next Step</option>
                              {safeNodes.filter(n => n.id !== selectedNode.id).map((n) => {
                                const idx = safeNodes.findIndex(sn => sn.id === n.id) + 1;
                                const label = (n.data?.label as string) || n.type;
                                return (
                                  <option key={n.id} value={n.id}>
                                    Step #{idx}: {label.length > 20 ? label.slice(0, 20) + '...' : label}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                    <button 
                      onClick={() => {
                        const newChoices = [...(selectedNode.data.choices as string[] || []), `Option ${(selectedNode.data.choices as string[] || []).length + 1}`];
                        const updatedNode = {
                          ...selectedNode,
                          data: { ...selectedNode.data, choices: newChoices }
                        };
                        setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                        setSelectedNode(updatedNode);
                      }}
                      className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all font-bold flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Option
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-gray-100 space-y-3">
                <button
                  onClick={() => {
                    showToast('Node properties updated successfully!');
                    setSelectedNode(null); // Closes properties sidebar and indicates node update is saved and confirmed
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all text-sm font-bold shadow-lg shadow-indigo-100/50"
                >
                  <Check className="w-4 h-4" />
                  Save / Apply Changes
                </button>
                <button
                  onClick={() => deleteNode(selectedNode.id)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 active:scale-[0.98] transition-all text-sm font-bold"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Node
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
        </>
      )}
    </div>
  );
}

export default function Builder() {
  return (
    <ReactFlowProvider>
      <BuilderContent />
    </ReactFlowProvider>
  );
}

