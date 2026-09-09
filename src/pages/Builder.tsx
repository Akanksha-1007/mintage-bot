import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { ReactFlow, Controls, Background, MiniMap, Node, Edge, ReactFlowProvider, MarkerType, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useBotStore } from '../store/useBotStore';
import {
  AlertCircle, CheckCircle2, CheckSquare, ChevronRight, ExternalLink,
  FileSpreadsheet, HelpCircle, Layers, List, Loader2, Mail, MessageSquare,
  Phone, Plus, Save, Send, Sparkles, Trash2, User,
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { serverTimestamp, doc, updateDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ImageNode, MessageNode, NameNode, PhoneNode, EmailNode, SingleChoiceNode,
  MultipleChoiceNode, TextQuestionNode, AiResponseNode, ApiNode, SaveNode,
} from '../components/CustomNodes';
import { Check, Copy, Database, Share2, X } from 'lucide-react';
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
  const { fitView } = useReactFlow();
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
  const [builderMode, setBuilderMode] = useState<'classic' | 'visual'>('visual');

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
      } catch (e) { }

      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'bot_configurations', id)).catch(() => null);

      // 3. Blacklist in localStorage
      const deletedIdsRaw = localStorage.getItem('mintage_deleted_bot_ids');
      let deletedIds: string[] = [];
      if (deletedIdsRaw) {
        try { deletedIds = JSON.parse(deletedIdsRaw); } catch { }
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
          } catch { }
        }
      });

      window.dispatchEvent(new CustomEvent('mintage_bot_deleted', { detail: { id } }));

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
      } catch { }
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
        } catch { }
      }
    }
    showToast('Google Sheet linked to Chatbot!');
  };

  // Load an existing bot by ID, or start a completely clean flow for /builder.
  // The store is shared between pages, so it must be cleared when creating a new bot;
  // otherwise the previously opened bot's nodes remain visible and can be saved again.
  useEffect(() => {
    let cancelled = false;

    setSelectedNode(null);

    if (!id) {
      // NEW BOT: never reuse the previous bot's in-memory flow.
      setBotName('My New Bot');
      setBotSpreadsheetId('');
      setNodes([]);
      setEdges([]);
      return () => {
        cancelled = true;
      };
    }

    const loadBot = async () => {
      try {
        const docRef = doc(db, 'bot_configurations', id);
        const docSnap = await getDoc(docRef).catch(() => null);

        if (cancelled) return;

        if (docSnap && docSnap.exists()) {
          const data = docSnap.data();
          const rawNodes = data.nodes;
          const nodesArr = Array.isArray(rawNodes)
            ? rawNodes
            : (rawNodes && typeof rawNodes === 'object' ? Object.values(rawNodes) : []);
          const rawEdges = data.edges;
          const edgesArr = Array.isArray(rawEdges)
            ? rawEdges
            : (rawEdges && typeof rawEdges === 'object' ? Object.values(rawEdges) : []);

          setBotName(data.name || 'My New Bot');
          setBotSpreadsheetId(data.spreadsheetId || '');
          setNodes(nodesArr);
          setEdges(edgesArr);
          return;
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Firestore loadBot error, checking cache:', err);
        }
      }

      if (cancelled) return;

      // Fallback to local storage cache.
      const localBotsRaw = localStorage.getItem('mintage_bots');
      if (localBotsRaw) {
        try {
          const localBots = JSON.parse(localBotsRaw);
          const found = Array.isArray(localBots)
            ? localBots.find((b: any) => b && b.id === id)
            : null;

          if (found && !cancelled) {
            const rawLocalNodes = found.nodes;
            const localNodesArr = Array.isArray(rawLocalNodes)
              ? rawLocalNodes
              : (rawLocalNodes && typeof rawLocalNodes === 'object' ? Object.values(rawLocalNodes) : []);
            const rawLocalEdges = found.edges;
            const localEdgesArr = Array.isArray(rawLocalEdges)
              ? rawLocalEdges
              : (rawLocalEdges && typeof rawLocalEdges === 'object' ? Object.values(rawLocalEdges) : []);

            setBotName(found.name || 'My New Bot');
            setBotSpreadsheetId(found.spreadsheetId || '');
            setNodes(localNodesArr);
            setEdges(localEdgesArr);
          }
        } catch (e) {
          if (!cancelled) {
            console.error('Local cache parse error:', e);
          }
        }
      }
    };

    loadBot();

    return () => {
      cancelled = true;
    };
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
        try { existingBots = JSON.parse(existingBotsRaw); } catch { }
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
        url: '',
        urlLabel: 'Open link',
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

  // Arrange nodes into a large left-to-right visual flow without changing any connections.
  const autoArrangeFlow = () => {
    const currentNodes = [...safeNodes];
    const currentEdges = [...safeEdges];
    if (!currentNodes.length) return;

    const outgoing = new Map<string, string[]>();
    const indegree = new Map<string, number>();
    currentNodes.forEach(node => {
      outgoing.set(node.id, []);
      indegree.set(node.id, 0);
    });

    currentEdges.forEach(edge => {
      if (!outgoing.has(edge.source) || !indegree.has(edge.target)) return;
      outgoing.get(edge.source)!.push(edge.target);
      indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    });

    const roots = currentNodes.filter(node => (indegree.get(node.id) || 0) === 0);
    const queue = roots.length ? roots.map(node => node.id) : [currentNodes[0].id];
    const level = new Map<string, number>();
    queue.forEach(nodeId => level.set(nodeId, 0));

    for (let index = 0; index < queue.length; index += 1) {
      const sourceId = queue[index];
      const nextLevel = (level.get(sourceId) || 0) + 1;
      for (const targetId of outgoing.get(sourceId) || []) {
        const previousLevel = level.get(targetId);
        if (previousLevel === undefined || nextLevel > previousLevel) {
          level.set(targetId, nextLevel);
        }
        if (!queue.includes(targetId)) queue.push(targetId);
      }
    }

    let maxLevel = Math.max(0, ...Array.from(level.values()));
    currentNodes.forEach(node => {
      if (!level.has(node.id)) {
        maxLevel += 1;
        level.set(node.id, maxLevel);
      }
    });

    const groups = new Map<number, Node[]>();
    currentNodes.forEach(node => {
      const nodeLevel = level.get(node.id) || 0;
      if (!groups.has(nodeLevel)) groups.set(nodeLevel, []);
      groups.get(nodeLevel)!.push(node);
    });

    const horizontalGap = 360;
    const verticalGap = 210;
    const arranged = currentNodes.map(node => {
      const nodeLevel = level.get(node.id) || 0;
      const group = groups.get(nodeLevel) || [];
      const index = group.findIndex(item => item.id === node.id);
      const totalHeight = Math.max(0, (group.length - 1) * verticalGap);

      return {
        ...node,
        position: {
          x: 80 + nodeLevel * horizontalGap,
          y: Math.max(60, 300 + index * verticalGap - totalHeight / 2),
        },
      };
    });

    setNodes(arranged);
    setTimeout(() => fitView({ padding: 0.18, minZoom: 0.15, maxZoom: 1.1, duration: 500 }), 100);
    showToast('Flow arranged visually. Connections were not changed.');
  };


  return (
    <div className="builder-page relative">

      {toast && (
        <div className={`toast toast-center ${toast.type === 'success' ? 'is-success' : 'is-error'}`}>
          {toast.type === 'success' ? <Check /> : <AlertCircle />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="modal-backdrop">
          <div className="app-modal is-md">
            <div className="modal-head">
              <h3>Embed chatbot</h3>
              <button onClick={() => setShowShareModal(false)} className="icon-button" aria-label="Close">
                <X />
              </button>
            </div>
            <div className="flex flex-col gap-5">
              <div>
                <p className="modal-section-title">Option 1 · Script tag (recommended)</p>
                <div className="code-block relative">
                  <pre>{embedScriptTag}</pre>
                  <button onClick={() => copyToClipboard(embedScriptTag)} className="icon-button bordered absolute right-2 top-2" aria-label="Copy script">
                    {copied ? <Check /> : <Copy />}
                  </button>
                </div>
                <p className="field-hint">Renders a floating chat bubble on any website.</p>
              </div>
              <div>
                <p className="modal-section-title">Option 2 · Inline iframe</p>
                <div className="code-block relative">
                  <pre>{embedIframeTag}</pre>
                  <button onClick={() => copyToClipboard(embedIframeTag)} className="icon-button bordered absolute right-2 top-2" aria-label="Copy iframe">
                    {copied ? <Check /> : <Copy />}
                  </button>
                </div>
                <p className="field-hint">Best for embedding into an existing page layout.</p>
              </div>
              <div className="modal-actions is-end">
                <button onClick={() => setShowShareModal(false)} className="button-secondary">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Bot Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="app-modal is-centered">
            <div className="modal-danger-icon"><AlertCircle /></div>
            <h3>Delete this bot?</h3>
            <p className="mt-1.5"><strong>"{botName}"</strong> and its live widget endpoint will be permanently removed.</p>
            <p className="modal-note">Captured lead data for this bot stays in your Lead data logs.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowDeleteModal(false)} disabled={isDeletingBot} className="button-secondary flex-1">Cancel</button>
              <button type="button" onClick={handleDeleteBotInBuilder} disabled={isDeletingBot} className="button-danger flex-1">
                {isDeletingBot ? <Loader2 className="animate-spin" /> : <Trash2 />}
                <span>{isDeletingBot ? 'Deleting…' : 'Delete bot'}</span>
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
          <header className="builder-toolbar">
            <div className="min-w-0">
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                className="builder-title-input"
                placeholder="Untitled bot"
                aria-label="Bot name"
              />
              <p className="builder-subtitle">
                {id ? 'Published' : 'Draft'} · Last saved {id ? 'just now' : 'never'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={autoArrangeFlow}
                className="button-secondary"
                title="Automatically arrange the chatbot into a visual flow"
              >
                <Layers />
                <span>Arrange flow</span>
              </button>

              <button
                onClick={() => setBuilderMode('classic')}
                className="button-secondary"
                title="Switch to the linear chat flow builder"
              >
                <Layers />
                <span>Classic builder</span>
              </button>

              <button
                onClick={() => setShowSheetsModal(true)}
                className="button-secondary"
              >
                <FileSpreadsheet />
                <span>{botSpreadsheetId ? 'Sheet linked' : 'Connect sheet'}</span>
                {botSpreadsheetId && <span className="status-pill status-live"><span /></span>}
              </button>

              {id && (
                <>
                  <button onClick={() => setShowShareModal(true)} className="button-ghost">
                    <Share2 />
                    Share
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="icon-button danger bordered"
                    title="Delete bot"
                  >
                    <Trash2 />
                  </button>
                </>
              )}
              <button onClick={onSave} disabled={isSaving} className="button-primary">
                <Save />
                {isSaving ? 'Saving…' : 'Publish'}
              </button>
            </div>
          </header>
          {showSheetsModal && (
            <div className="modal-backdrop">
              <div className="app-modal is-xl">
                <div className="modal-head">
                  <div className="modal-head-main">
                    <span className="icon-tile tile-lg tone-green"><FileSpreadsheet /></span>
                    <div>
                      <h3>Google Sheets</h3>
                      <p>Connect this chatbot to a Google Sheet to log new leads automatically.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSheetsModal(false)}
                    className="icon-button"
                    aria-label="Close"
                  >
                    <X />
                  </button>
                </div>

                {/* Step 1: Account Auth Status */}
                <div className="sync-row">
                  <div>
                    <p className="text-ink text-[13px] font-semibold">
                      {googleTokens ? 'Google account connected' : 'Google account required'}
                    </p>
                    <p className="text-muted mt-0.5 text-[12px]">
                      {googleTokens ? 'Authorized to sync spreadsheet leads.' : 'Connect your account to select or create sheets.'}
                    </p>
                  </div>
                  {!googleTokens ? (
                    <button onClick={handleConnectGoogle} className="button-primary">
                      Connect Google account
                    </button>
                  ) : (
                    <span className="status-pill tone-green">
                      <CheckCircle2 />
                      Connected
                    </span>
                  )}
                </div>

                {googleTokens && (
                  <div className="space-y-6">
                    {/* 1-Click Quick Action: Create New Sheet */}
                    <div className="sync-row">
                      <div>
                        <p className="text-ink inline-flex items-center gap-2 text-[13px] font-semibold">
                          <Sparkles className="h-4 w-4" />
                          Create a dedicated sheet
                        </p>
                        <p className="text-muted mt-0.5 text-[12px]">
                          Generates "Leads - {botName}" with prepared column headers.
                        </p>
                      </div>
                      <button
                        onClick={handleCreateNewSheet}
                        disabled={isCreatingSheet}
                        className="button-secondary"
                      >
                        {isCreatingSheet ? (
                          <>
                            <Loader2 className="animate-spin" />
                            Creating…
                          </>
                        ) : (
                          <>
                            <Plus />
                            Create sheet
                          </>
                        )}
                      </button>
                    </div>

                    {/* Option 2: Select from existing Drive sheets */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="modal-section-title" style={{ marginBottom: 0 }}>Select from Google Drive</span>
                        <button
                          onClick={loadUserGoogleSheets}
                          disabled={isLoadingSheets}
                          className="link-button inline-flex items-center gap-1"
                        >
                          {isLoadingSheets && <Loader2 className="h-3 w-3 animate-spin" />}
                          Refresh list
                        </button>
                      </div>

                      {isLoadingSheets ? (
                        <div className="loading-state">
                          <Loader2 className="animate-spin" />
                          <span>Fetching sheets from Drive…</span>
                        </div>
                      ) : userSheets.length > 0 ? (
                        <div className="table-card" style={{ maxHeight: '190px', overflowY: 'auto' }}>
                          {userSheets.map((sheet) => {
                            const isSelected = botSpreadsheetId === sheet.id;
                            return (
                              <div key={sheet.id} className="conversation-row" style={{ border: 0, borderRadius: 0 }}>
                                <div className="mr-3 min-w-0 truncate">
                                  <strong className="block truncate">{sheet.name}</strong>
                                  <p className="text-mono truncate">{sheet.id}</p>
                                </div>
                                <button
                                  onClick={() => {
                                    setBotSpreadsheetId(sheet.id);
                                    setSheetTestResult({
                                      success: true,
                                      message: `Selected sheet: "${sheet.name}"`
                                    });
                                  }}
                                  className={isSelected ? 'button-primary compact' : 'button-secondary compact'}
                                >
                                  {isSelected ? 'Selected' : 'Select'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="subtle-card text-muted text-[12.5px]">No spreadsheets found in Drive. Create one above to get started.</p>
                      )}
                    </div>

                    {/* Option 3: Manual Spreadsheet ID or URL */}
                    <div className="modal-section">
                      <p className="modal-section-title">Or enter a sheet ID / URL</p>
                      <div className="field-row">
                        <input
                          type="text"
                          value={botSpreadsheetId}
                          onChange={(e) => setBotSpreadsheetId(e.target.value)}
                          placeholder="Spreadsheet ID or full sheet URL"
                          className="input input-mono"
                        />
                        <button
                          onClick={handleTestConnection}
                          disabled={isTestingSheet}
                          className="button-inverse"
                        >
                          {isTestingSheet ? <Loader2 className="animate-spin" /> : null}
                          Test link
                        </button>
                      </div>

                      {/* Feedback Banner */}
                      {sheetTestResult && (
                        <div className={`callout ${sheetTestResult.success ? 'tone-green' : 'tone-red'}`} style={{ marginTop: '10px' }}>
                          {sheetTestResult.success ? <CheckCircle2 /> : <AlertCircle />}
                          <span>{sheetTestResult.message}</span>
                        </div>
                      )}

                      {botSpreadsheetId && (
                        <div className="sync-row" style={{ marginTop: '10px' }}>
                          <span className="text-mono text-faint truncate">{botSpreadsheetId}</span>
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${botSpreadsheetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent inline-flex items-center gap-1 text-[12px] font-medium"
                          >
                            Open sheet <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="modal-actions is-end">
                  <button
                    onClick={() => setShowSheetsModal(false)}
                    className="button-secondary"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      onSave();
                      setShowSheetsModal(false);
                    }}
                    className="button-primary"
                  >
                    Save &amp; link
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar: Node Library */}
            <aside className="builder-library">
              <div className="builder-panel-head">Add chat component</div>
              <div className="builder-scroll flex-1 overflow-y-auto">
                <div className="builder-group">
                  <div className="builder-group-toggle" role="presentation">
                    <span>Frequently used</span>
                  </div>
                  <div className="builder-group-body">
                    <button onClick={() => addNode('message')} className="component-tile">
                      <span className="icon-tile tone-blue"><MessageSquare /></span>
                      <span>Message</span>
                    </button>
                    <button onClick={() => addNode('name')} className="component-tile">
                      <span className="icon-tile tone-green"><User /></span>
                      <span>Name</span>
                    </button>
                    <button onClick={() => addNode('phone')} className="component-tile">
                      <span className="icon-tile tone-green"><Phone /></span>
                      <span>Phone number</span>
                    </button>
                    <button onClick={() => addNode('email')} className="component-tile">
                      <span className="icon-tile tone-blue"><Mail /></span>
                      <span>Email</span>
                    </button>
                    <button onClick={() => addNode('singleChoice')} className="component-tile">
                      <span className="icon-tile tone-purple"><CheckSquare /></span>
                      <span>Single choice</span>
                    </button>
                    <button onClick={() => addNode('multipleChoice')} className="component-tile">
                      <span className="icon-tile tone-purple"><List /></span>
                      <span>Multiple choice</span>
                    </button>
                    <button onClick={() => addNode('textQuestion')} className="component-tile">
                      <span className="icon-tile tone-orange"><HelpCircle /></span>
                      <span>Text question</span>
                    </button>
                    <button onClick={() => addNode('aiResponse')} className="component-tile">
                      <span className="icon-tile tone-pink"><Sparkles /></span>
                      <span>AI response</span>
                    </button>
                    <button onClick={() => addNode('saveLead')} className="component-tile">
                      <span className="icon-tile tone-yellow"><Database /></span>
                      <span>Save lead</span>
                    </button>
                  </div>
                </div>

                <div className="builder-group">
                  <div className="builder-group-toggle" role="presentation">
                    <span>Request information</span>
                    <ChevronRight />
                  </div>
                  <div className="builder-group-body">
                    <button onClick={() => addNode('name')} className="component-tile-plain">Name input</button>
                    <button onClick={() => addNode('phone')} className="component-tile-plain">Phone input</button>
                    <button onClick={() => addNode('email')} className="component-tile-plain">Email input</button>
                  </div>
                </div>

                <div className="builder-group">
                  <div className="builder-group-toggle" role="presentation">
                    <span>Decide and act</span>
                    <ChevronRight />
                  </div>
                  <div className="builder-group-body">
                    <button onClick={() => addNode('singleChoice')} className="component-tile-plain">Branch by choice</button>
                    <button onClick={() => addNode('saveLead')} className="component-tile-plain">Save lead checkpoint</button>
                  </div>
                </div>
              </div>
            </aside>

            {/* Canvas Area */}
            <div className="builder-canvas">
              <ReactFlow
                nodes={safeNodes}
                edges={safeEdges.map(edge => ({
                  ...edge,
                  type: edge.type || 'smoothstep',
                  markerEnd: edge.markerEnd || { type: MarkerType.ArrowClosed },
                }))}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedNode(node)}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.18, minZoom: 0.15, maxZoom: 1.1 }}
                minZoom={0.08}
                maxZoom={2}
                defaultEdgeOptions={{
                  type: 'smoothstep',
                  markerEnd: { type: MarkerType.ArrowClosed },
                }}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant="dots" color="var(--line-strong)" gap={18} size={1} />
                <MiniMap pannable zoomable nodeStrokeWidth={2} style={{ width: 180, height: 120 }} />
                <Controls showInteractive />
              </ReactFlow>
            </div>

            {/* Right Sidebar: Properties Panel */}
            {selectedNode && (
              <aside className="builder-properties">
                <div className="builder-panel-head is-row">
                  <span>Properties</span>
                  <button onClick={() => setSelectedNode(null)} className="icon-button" aria-label="Close properties">
                    <ChevronRight />
                  </button>
                </div>
                <div className="builder-scroll flex flex-1 flex-col gap-5 overflow-y-auto">
                  <div>
                    <label className="field-label">{selectedNode.type === 'saveLead' ? 'Action label' : 'Bot message'}</label>
                    <textarea
                      className="textarea"
                      value={selectedNode.data.label as string}
                      onChange={(e) => {
                        const newLabel = e.target.value;
                        setNodes(safeNodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, label: newLabel } } : n));
                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, label: newLabel } });
                      }}
                      placeholder={selectedNode.type === 'saveLead' ? 'e.g. Save after welcome' : 'Type message here...'}
                    />
                    {selectedNode.type !== 'saveLead' && (
                      <div className="emoji-picker-grid" style={{ marginTop: '10px' }}>
                        {['👋', '😊', '🔥', '🚀', '✨', '💡', '✅', '❌', '📞', '📧', '👤', '🤖'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => {
                              const newLabel = (selectedNode.data.label as string || '') + emoji;
                              setNodes(safeNodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, label: newLabel } } : n));
                              setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, label: newLabel } });
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {['name', 'email', 'phone', 'textQuestion', 'singleChoice', 'multipleChoice'].includes(selectedNode.type!) && (
                    <div>
                      <label className="field-label">Lead data key</label>
                      <input
                        type="text"
                        className="input input-mono"
                        value={selectedNode.data.leadKey as string || ''}
                        onChange={(e) => {
                          const newKey = e.target.value;
                          setNodes(safeNodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, leadKey: newKey } } : n));
                          setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, leadKey: newKey } });
                        }}
                        placeholder="Auto-generated if empty"
                      />
                      <p className="field-hint">Links this answer to a column in your dashboard and spreadsheet.</p>
                    </div>
                  )}

                  {/* URL Configuration for ALL Component Types */}
                  <div className="modal-section" style={{ marginTop: 0 }}>
                    <p className="modal-section-title" style={{ justifyContent: 'space-between' }}>
                      <span>URL / Link</span>
                      <span className="tag">Optional</span>
                    </p>
                    <p className="field-hint" style={{ marginBottom: '10px', marginTop: 0 }}>Add a link to this component. The chatbot will show an “Open link” button when a URL is provided.</p>
                    <label className="field-label">URL</label>
                    <input
                      type="url"
                      className="input"
                      value={(selectedNode.data.url as string) || ''}
                      onChange={(e) => {
                        const newUrl = e.target.value;
                        const updatedNode = {
                          ...selectedNode,
                          data: { ...selectedNode.data, url: newUrl }
                        };
                        setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                        setSelectedNode(updatedNode);
                      }}
                      placeholder="https://example.com/page"
                      inputMode="url"
                      autoComplete="url"
                    />
                    <label className="field-label" style={{ marginTop: '10px' }}>Button text</label>
                    <input
                      type="text"
                      className="input"
                      value={(selectedNode.data.urlLabel as string) || 'Open link'}
                      onChange={(e) => {
                        const newUrlLabel = e.target.value;
                        const updatedNode = {
                          ...selectedNode,
                          data: { ...selectedNode.data, urlLabel: newUrlLabel }
                        };
                        setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                        setSelectedNode(updatedNode);
                      }}
                      placeholder="Open link"
                      maxLength={40}
                    />
                  </div>

                  {/* Next Step Configuration for ALL Component Types */}
                  <div className="modal-section" style={{ marginTop: 0 }}>
                    <p className="modal-section-title" style={{ justifyContent: 'space-between' }}>
                      <span>Next step</span>
                      <span className="tag">Flow control</span>
                    </p>
                    <p className="field-hint" style={{ marginBottom: '8px', marginTop: 0 }}>Choose which step follows this one.</p>
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
                      className="select"
                    >
                      <option value="">Default next step (sequential)</option>
                      <option value="END">End chat flow here</option>
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
                    <div>
                      <p className="modal-section-title">Options &amp; redirection</p>
                      <p className="field-hint" style={{ marginBottom: '10px', marginTop: 0 }}>Connect each option to a specific next step, or leave it sequential.</p>

                      <div>
                        {(selectedNode.data.choices as string[] || []).map((choice, i) => {
                          const currentRoute = (selectedNode.data.optionRoutes as Record<string, string>)?.[choice] || '';
                          const currentUrl = (selectedNode.data.optionUrls as Record<string, string>)?.[choice] || '';
                          const currentDestination = currentUrl ? '__URL__' : currentRoute;

                          return (
                            <div key={i} className="choice-editor">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  className="input compact"
                                  value={choice}
                                  onChange={(e) => {
                                    const newChoiceName = e.target.value;
                                    const oldChoices = [...(selectedNode.data.choices as string[])];
                                    oldChoices[i] = newChoiceName;

                                    const oldRoutes = { ...((selectedNode.data.optionRoutes as Record<string, string>) || {}) };
                                    const oldUrls = { ...((selectedNode.data.optionUrls as Record<string, string>) || {}) };
                                    if (choice !== newChoiceName) {
                                      if (oldRoutes[choice]) {
                                        oldRoutes[newChoiceName] = oldRoutes[choice];
                                        delete oldRoutes[choice];
                                      }
                                      if (oldUrls[choice]) {
                                        oldUrls[newChoiceName] = oldUrls[choice];
                                        delete oldUrls[choice];
                                      }
                                    }

                                    const updatedNode = {
                                      ...selectedNode,
                                      data: { ...selectedNode.data, choices: oldChoices, optionRoutes: oldRoutes, optionUrls: oldUrls }
                                    };
                                    setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                                    setSelectedNode(updatedNode);
                                  }}
                                />
                                <button
                                  onClick={() => {
                                    const newChoices = (selectedNode.data.choices as string[]).filter((_, idx) => idx !== i);
                                    const oldRoutes = { ...((selectedNode.data.optionRoutes as Record<string, string>) || {}) };
                                    const oldUrls = { ...((selectedNode.data.optionUrls as Record<string, string>) || {}) };
                                    delete oldRoutes[choice];
                                    delete oldUrls[choice];

                                    const updatedNode = {
                                      ...selectedNode,
                                      data: { ...selectedNode.data, choices: newChoices, optionRoutes: oldRoutes, optionUrls: oldUrls }
                                    };
                                    setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                                    setSelectedNode(updatedNode);

                                    const updatedEdges = safeEdges.filter(ed => !(ed.source === selectedNode.id && (ed.label === choice || ed.sourceHandle === choice)));
                                    setEdges(updatedEdges);
                                  }}
                                  className="icon-button danger"
                                  title="Remove option"
                                >
                                  <X />
                                </button>
                              </div>

                              <div className="choice-editor-route">
                                <span>Go to</span>
                                <select
                                  value={currentDestination}
                                  onChange={(e) => {
                                    const target = e.target.value;
                                    const oldRoutes = { ...((selectedNode.data.optionRoutes as Record<string, string>) || {}) };
                                    const oldUrls = { ...((selectedNode.data.optionUrls as Record<string, string>) || {}) };

                                    let nextRoutes = oldRoutes;
                                    let nextUrls = oldUrls;
                                    if (target === '__URL__') {
                                      delete nextRoutes[choice];
                                    } else {
                                      delete nextUrls[choice];
                                      if (target) nextRoutes[choice] = target;
                                      else delete nextRoutes[choice];
                                    }

                                    const updatedNode = {
                                      ...selectedNode,
                                      data: { ...selectedNode.data, optionRoutes: nextRoutes, optionUrls: nextUrls }
                                    };
                                    setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                                    setSelectedNode(updatedNode);

                                    let updatedEdges = safeEdges.filter(ed => !(ed.source === selectedNode.id && (ed.label === choice || ed.sourceHandle === choice)));
                                    if (target && target !== '__URL__') {
                                      updatedEdges.push({
                                        id: `e_${selectedNode.id}_${choice}_${target}`,
                                        source: selectedNode.id,
                                        target,
                                        label: choice,
                                        sourceHandle: choice,
                                        type: 'smoothstep',
                                        style: { stroke: '#6366f1', strokeWidth: 2 }
                                      });
                                    }
                                    setEdges(updatedEdges);
                                  }}
                                >
                                  <option value="">Default next step</option>
                                  <option value="END">End chat flow here</option>
                                  <option value="__URL__">Open URL</option>
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

                              {currentDestination === '__URL__' && (
                                <div className="choice-editor-route">
                                  <span>URL</span>
                                  <input
                                    type="url"
                                    className="input compact"
                                    value={currentUrl}
                                    onChange={(e) => {
                                      const url = e.target.value;
                                      const oldUrls = { ...((selectedNode.data.optionUrls as Record<string, string>) || {}) };
                                      if (url.trim()) {
                                        oldUrls[choice] = url.trim();
                                      } else {
                                        delete oldUrls[choice];
                                      }

                                      const updatedNode = {
                                        ...selectedNode,
                                        data: { ...selectedNode.data, optionUrls: oldUrls }
                                      };
                                      setNodes(safeNodes.map(n => n.id === selectedNode.id ? updatedNode : n));
                                      setSelectedNode(updatedNode);
                                    }}
                                    placeholder="https://example.com"
                                  />
                                </div>
                              )}
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
                          className="add-dashed"
                          style={{ marginTop: '8px' }}
                        >
                          <Plus /> Add option
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="modal-section flex flex-col gap-2">
                    <button
                      onClick={() => {
                        showToast('Node properties updated successfully!');
                        setSelectedNode(null); // Closes properties sidebar and indicates node update is saved and confirmed
                      }}
                      className="button-primary button-block"
                    >
                      <Check />
                      Apply changes
                    </button>
                    <button
                      onClick={() => deleteNode(selectedNode.id)}
                      className="button-danger button-block"
                    >
                      <Trash2 />
                      Delete node
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
