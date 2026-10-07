import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { initializeApp, deleteApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { collection, query, getDocs, doc, setDoc, deleteDoc, updateDoc, serverTimestamp, where, onSnapshot, writeBatch } from 'firebase/firestore';
import { useAuth, ImpersonatedClient } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Database,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import ChatbotUsersTable from '../components/ChatbotUsersTable';
import UserDetailModal from '../components/UserDetailModal';
import ConversationViewModal from '../components/ConversationViewModal';
import Leads from './Leads';

interface AdminBotRecord {
  id: string;
  name: string;
  createdBy?: string;
  ownerId?: string;
  clientId?: string;
  spreadsheetId?: string;
  createdAt?: any;
  updatedAt?: any;
}

interface ClientRecord {
  id: string;
  name: string;
  company?: string;
  email: string;
  password?: string;
  notes?: string;
  createdAt?: any;
  botsCount?: number;
  leadsCount?: number;
}

export default function AdminDashboard() {
  const { isAdmin, setImpersonatedClient, impersonatedClient, clearImpersonation } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'users' | 'leads' | 'clients'>('users');
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdCredentialsCard, setCreatedCredentialsCard] = useState<ClientRecord | null>(null);
  const [clientToDelete, setClientToDelete] = useState<ClientRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTransferBotModal, setShowTransferBotModal] = useState(false);
  const [adminBots, setAdminBots] = useState<AdminBotRecord[]>([]);
  const [selectedBotToTransfer, setSelectedBotToTransfer] = useState<AdminBotRecord | null>(null);
  const [targetClientForBot, setTargetClientForBot] = useState('');
  const [botTransferSearch, setBotTransferSearch] = useState('');
  const [isTransferringBot, setIsTransferringBot] = useState(false);
  const [loadingAdminBots, setLoadingAdminBots] = useState(false);

  // Chatbot Users & Conversations Detail Modals
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Chatbot Analytics Stats State
  const [chatbotStats, setChatbotStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    newUsersToday: 0,
    newUsersThisWeek: 0,
    totalConversations: 0,
    totalMessages: 0,
    avgMessagesPerConversation: 0,
    dailyTrend: [] as Array<{ date: string; users: number; conversations: number }>
  });

  const loadChatbotStats = async () => {
    try {
      const res = await fetch('/api/chatbot/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setChatbotStats(data.stats);
        }
      }
    } catch (e) {
      console.warn('API fetch chatbot stats notice:', e);
    }
  };

  // Form State for New Client
  const [clientName, setClientName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPassword, setClientPassword] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password visibility map
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setClientPassword(pass);
  };

  const loadAdminBots = async () => {
    setLoadingAdminBots(true);
    try {
      const snap = await getDocs(collection(db, 'bot_configurations'));
      setAdminBots(snap.docs.map(d => { const x = d.data(); return { id: d.id, name: x.name || 'Unnamed Bot', createdBy: x.createdBy || '', ownerId: x.ownerId || '', clientId: x.clientId || '', spreadsheetId: x.spreadsheetId || '', createdAt: x.createdAt, updatedAt: x.updatedAt }; }));
    } catch (error) { console.error('Unable to load admin bots:', error); setAdminBots([]); } finally { setLoadingAdminBots(false); }
  };

  const transferBotToClient = async () => {
    if (!selectedBotToTransfer || !targetClientForBot) return;
    const targetClient = clients.find(c => c.id === targetClientForBot);
    if (!targetClient) { alert('Please select a valid client.'); return; }
    const bot = selectedBotToTransfer;
    if (bot.createdBy === targetClient.id || bot.ownerId === targetClient.id || bot.clientId === targetClient.id) { alert('This bot already belongs to this client.'); return; }
    setIsTransferringBot(true);
    try {
      await updateDoc(doc(db, 'bot_configurations', bot.id), { createdBy: targetClient.id, ownerId: targetClient.id, clientId: targetClient.id, updatedAt: serverTimestamp(), transferredAt: serverTimestamp(), transferredFrom: bot.createdBy || bot.ownerId || bot.clientId || '' });
      const leadMap = new Map<string, any>();
      const [flowSnap, botSnap] = await Promise.all([getDocs(query(collection(db, 'leads'), where('flowId', '==', bot.id))), getDocs(query(collection(db, 'leads'), where('botId', '==', bot.id)))]);
      flowSnap.docs.forEach(d => leadMap.set(d.id, d)); botSnap.docs.forEach(d => leadMap.set(d.id, d));
      const leads = Array.from(leadMap.values());
      for (let i = 0; i < leads.length; i += 400) { const batch = writeBatch(db); leads.slice(i, i + 400).forEach(d => batch.update(doc(db, 'leads', d.id), { ownerId: targetClient.id, clientId: targetClient.id, createdBy: targetClient.id, updatedAt: serverTimestamp() })); await batch.commit(); }
      setSelectedBotToTransfer(null); setTargetClientForBot(''); setBotTransferSearch(''); setShowTransferBotModal(false); await loadClientsAndStats(); await loadAdminBots();
      alert(`"${bot.name}" has been moved to ${targetClient.name}.`);
    } catch (error: any) { console.error('Bot transfer failed:', error); alert(error?.message || 'Unable to transfer the bot.'); } finally { setIsTransferringBot(false); }
  };

  const loadClientsAndStats = async () => {
    setLoading(true);
    let fetchedClients: ClientRecord[] = [];

    // Read local cache backup
    const localClientsRaw = localStorage.getItem('mintage_clients_cache');
    let localClients: ClientRecord[] = [];
    if (localClientsRaw) {
      try {
        const parsed = JSON.parse(localClientsRaw);
        localClients = Array.isArray(parsed) ? parsed.map(({ password: _password, ...client }: ClientRecord) => client) : [];
      } catch (e) { localClients = []; }
    }

    try {
      // Fetch clients collection
      const clientsSnap = await getDocs(collection(db, 'clients')).catch((err) => {
        console.warn('Firestore getDocs clients failed:', err?.message || err);
        return null;
      });

      if (clientsSnap && !clientsSnap.empty) {
        for (const clientDoc of clientsSnap.docs) {
          const data = clientDoc.data();
          const cid = clientDoc.id;

          let botsCount = 0;
          let leadsCount = 0;

          try {
            const botsQ = query(collection(db, 'bot_configurations'), where('createdBy', '==', cid));
            const botsSnap = await getDocs(botsQ).catch(() => null);
            if (botsSnap) botsCount = botsSnap.size;
          } catch (e) {
            console.warn('Bots query skipped for', cid);
          }

          try {
            const leadsQ = query(collection(db, 'leads'), where('ownerId', '==', cid));
            const leadsSnap = await getDocs(leadsQ).catch(() => null);
            if (leadsSnap) leadsCount = leadsSnap.size;
          } catch (e) {
            console.warn('Leads query skipped for', cid);
          }

          fetchedClients.push({
            id: cid,
            name: data.name || 'Unnamed Client',
            company: data.company || '',
            email: data.email || '',
            password: undefined,
            notes: data.notes || '',
            createdAt: data.createdAt,
            botsCount,
            leadsCount,
          });
        }
      }
    } catch (error) {
      console.warn('Error loading clients from Firestore, using cache:', error);
    }

    // Merge Firestore clients with local cache
    const clientMap = new Map<string, ClientRecord>();
    localClients.forEach(c => clientMap.set(c.id, c));
    fetchedClients.forEach(c => clientMap.set(c.id, c));

    const finalClients = Array.from(clientMap.values()).map(({ password: _password, ...client }) => client);
    setClients(finalClients);
    localStorage.setItem('mintage_clients_cache', JSON.stringify(finalClients));
    setLoading(false);
  };

  useEffect(() => {
    loadClientsAndStats();
    loadChatbotStats();
    loadAdminBots();

    let unsubscribeClients: (() => void) | null = null;
    let unsubscribeBots: (() => void) | null = null;
    let unsubscribeLeads: (() => void) | null = null;
    let unsubscribeChatbotUsers: (() => void) | null = null;

    try {
      unsubscribeClients = onSnapshot(collection(db, 'clients'), () => loadClientsAndStats(), () => { });
      unsubscribeBots = onSnapshot(collection(db, 'bot_configurations'), () => loadClientsAndStats(), () => { });
      unsubscribeLeads = onSnapshot(collection(db, 'leads'), () => loadClientsAndStats(), () => { });
      unsubscribeChatbotUsers = onSnapshot(collection(db, 'chatbot_users'), () => loadChatbotStats(), () => { });
    } catch (e) { }

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        if (event.data && !event.data.startsWith(':')) {
          loadClientsAndStats();
          loadChatbotStats();
        }
      };
    } catch (e) { }

    const pollInterval = setInterval(() => {
      loadClientsAndStats();
      loadChatbotStats();
      loadAdminBots();
    }, 5000);

    return () => {
      if (unsubscribeClients) unsubscribeClients();
      if (unsubscribeBots) unsubscribeBots();
      if (unsubscribeLeads) unsubscribeLeads();
      if (unsubscribeChatbotUsers) unsubscribeChatbotUsers();
      if (eventSource) eventSource.close();
      clearInterval(pollInterval);
    };
  }, []);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientEmail.trim()) return;

    setIsSubmitting(true);
    const pass = clientPassword || 'Client123!';
    const cleanEmail = clientEmail.toLowerCase().trim();

    let provisionedUid = '';

    try {
      // Create the client's Firebase Authentication account in a SECONDARY
      // Firebase app so the current admin session is never replaced.
      const secondaryApp = initializeApp(firebaseConfig as any, `client-provision-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);

      try {
        const credential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, pass);
        provisionedUid = credential.user.uid;
      } finally {
        await signOut(secondaryAuth).catch(() => undefined);
        await deleteApp(secondaryApp).catch(() => undefined);
      }

      const clientData = {
        name: clientName.trim(),
        company: clientCompany.trim(),
        email: cleanEmail,
        notes: clientNotes.trim(),
        role: 'client',
        clientId: provisionedUid,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'clients', provisionedUid), clientData);
      await setDoc(doc(db, 'users', provisionedUid), {
        email: cleanEmail,
        displayName: clientName.trim(),
        company: clientCompany.trim(),
        role: 'client',
        clientId: provisionedUid,
        createdAt: serverTimestamp(),
      }, { merge: true });

      const newRecord: ClientRecord = {
        id: provisionedUid,
        name: clientName.trim(),
        company: clientCompany.trim(),
        email: cleanEmail,
        password: pass,
        notes: clientNotes.trim(),
        botsCount: 0,
        leadsCount: 0,
      };

      // Credentials are kept only in the admin UI confirmation card. Do not
      // persist the password in localStorage or Firestore.
      setCreatedCredentialsCard(newRecord);
      setShowCreateModal(false);

      setClientName('');
      setClientCompany('');
      setClientEmail('');
      setClientPassword('');
      setClientNotes('');

      await loadClientsAndStats();
    } catch (error: any) {
      console.error('Client provisioning failed:', error);
      const message = error?.code === 'auth/email-already-in-use'
        ? 'That email already has a Firebase account. Use a different email or provision the existing account manually.'
        : error?.message || 'Could not create the client account.';
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteClient = async () => {
    if (!clientToDelete) return;
    setIsDeleting(true);
    const clientId = clientToDelete.id;

    // Remove from local cache
    const currentLocalRaw = localStorage.getItem('mintage_clients_cache');
    if (currentLocalRaw) {
      try {
        const currentLocal: ClientRecord[] = JSON.parse(currentLocalRaw);
        const updatedLocal = currentLocal.filter(c => c.id !== clientId);
        localStorage.setItem('mintage_clients_cache', JSON.stringify(updatedLocal));
      } catch (e) {
        console.warn('Cache update error:', e);
      }
    }

    try {
      await deleteDoc(doc(db, 'clients', clientId)).catch(() => null);
      await deleteDoc(doc(db, 'users', clientId)).catch(() => null);
    } catch (error) {
      console.warn('Firestore delete warning:', error);
    }

    if (impersonatedClient?.id === clientId) {
      clearImpersonation();
    }

    setClients(prev => prev.filter(c => c.id !== clientId));
    setIsDeleting(false);
    setClientToDelete(null);
  };

  const handleAccessClientDashboard = (client: ClientRecord) => {
    const impersonationData: ImpersonatedClient = {
      id: client.id,
      name: client.name,
      email: client.email,
      company: client.company,
    };
    setImpersonatedClient(impersonationData);
    navigate('/dashboard');
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.company && c.company.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalBots = clients.reduce((acc, c) => acc + (c.botsCount || 0), 0);
  const totalLeads = clients.reduce((acc, c) => acc + (c.leadsCount || 0), 0);
  const adminTrend = chatbotStats.dailyTrend.length > 0
    ? chatbotStats.dailyTrend
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((date) => ({ date, users: 0, conversations: 0 }));

  return (
    <div className="admin-console-page workspace-page workspace-page--wide">
      {/* Page Header with Hero Banner */}
      <header className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-7">
        <div>
          <span className="text-[11px] font-semibold tracking-wider text-gray-400 dark:text-gray-500 uppercase block mb-1">
            ADMIN CONSOLE
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight font-serif">
            Chatbot users
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
            Live overview of chatbot visitors, message history and engagement.
          </p>
        </div>

        {/* Hero Banner Card on Right */}
        <div className="hero-banner-card relative overflow-hidden rounded-2xl p-5 border border-[#efe5d5] bg-gradient-to-r from-[#fdfbf7] to-[#f7eee1] dark:from-[#1a1714] dark:to-[#221c17] dark:border-[#382d24] flex items-center justify-between gap-6 shadow-sm min-w-[320px] max-w-lg">
          <div className="z-10 flex-1">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-medium bg-white/80 dark:bg-black/40 text-gray-600 dark:text-gray-300 border border-amber-900/10 mb-2">
              Automate &bull; Engage &bull; Convert
            </span>
            <h3 className="text-lg sm:text-xl font-serif font-bold text-gray-900 dark:text-amber-100 leading-tight">
              Smarter <br />
              Conversations <br />
              for <span className="text-[#c49947] dark:text-[#e4ca97]">Better Results</span>
            </h3>
          </div>

          {/* Robot Illustration Container */}
          <div className="relative z-10 shrink-0 w-28 h-28 flex items-center justify-center">
            {/* 3D Robot Vector */}
            <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-md">
              <defs>
                <linearGradient id="robotBody" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#e2e8f0" />
                </linearGradient>
                <linearGradient id="robotScreen" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
                <linearGradient id="goldGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
              </defs>
              {/* Head */}
              <rect x="30" y="25" width="60" height="48" rx="20" fill="url(#robotBody)" stroke="#cbd5e1" strokeWidth="2" />
              {/* Screen */}
              <rect x="38" y="33" width="44" height="32" rx="12" fill="url(#robotScreen)" />
              {/* Eyes */}
              <circle cx="50" cy="49" r="4" fill="#38bdf8" />
              <circle cx="70" cy="49" r="4" fill="#38bdf8" />
              <path d="M 54 57 Q 60 61 66 57" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" fill="none" />
              {/* Antenna */}
              <line x1="60" y1="25" x2="60" y2="15" stroke="#94a3b8" strokeWidth="3" />
              <circle cx="60" cy="13" r="5" fill="url(#goldGlow)" />
              {/* Body */}
              <path d="M 35 75 Q 60 70 85 75 L 80 105 Q 60 110 40 105 Z" fill="url(#robotBody)" stroke="#cbd5e1" strokeWidth="2" />
              {/* Waving Hand */}
              <path d="M 85 80 Q 100 65 105 50" fill="none" stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" />
              <circle cx="105" cy="50" r="5" fill="url(#robotBody)" />
              <path d="M 35 80 Q 20 90 15 100" fill="none" stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" />
            </svg>

            {/* Hand-drawn Arrow annotation */}
            <div className="absolute -top-3 -left-12 hidden sm:flex items-center gap-1 text-[10px] font-sans text-amber-900/70 dark:text-amber-200/70 italic whitespace-nowrap">
              <span>Your Chatbot Command Center</span>
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'users'
                ? 'bg-[#181b22] text-white shadow-sm'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Users &amp; conversations</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'users' ? 'bg-[#32281a] text-[#e4ca97]' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
              {chatbotStats.totalUsers}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('leads')}
            className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'leads'
                ? 'bg-[#181b22] text-white shadow-sm'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>All client leads</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {totalLeads}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('clients')}
            className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'clients'
                ? 'bg-[#181b22] text-white shadow-sm'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Client credentials</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {clients.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Selector */}
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl text-xs text-gray-700 dark:text-gray-300 shadow-sm cursor-pointer">
            <span className="text-gray-400">&empty;</span>
            <span>Last 7 days</span>
            <ChevronRight className="h-3.5 w-3.5 text-gray-400 rotate-90" />
          </div>

          <button
            type="button"
            onClick={() => {
              loadClientsAndStats();
              loadChatbotStats();
            }}
            className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* TAB 1: chatbot activity & users */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* 4 Metric Cards Grid matching Figure */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Metric Card 1 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
              <div>
                <div className="h-9 w-9 rounded-xl bg-[#fbf2eb] text-[#b47b59] flex items-center justify-center mb-3">
                  <Users className="h-4 w-4" />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block">Total chatbot users</span>
                <span className="text-3xl font-extrabold text-gray-900 dark:text-white mt-0.5 block tracking-tight">
                  {chatbotStats.totalUsers || 1}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11.5px] text-emerald-600 font-medium mt-3">
                <span>&nearr; 100%</span>
                <span className="text-gray-400 dark:text-gray-500 font-normal">vs previous week</span>
              </div>
              {/* Soft Warm Wave Graphic */}
              <svg className="absolute bottom-0 right-0 w-28 h-12 text-[#b47b59]/15 pointer-events-none" viewBox="0 0 100 40" fill="currentColor">
                <path d="M0,35 Q25,20 50,30 T100,10 L100,40 L0,40 Z" />
              </svg>
            </div>

            {/* Metric Card 2 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
              <div>
                <div className="h-9 w-9 rounded-xl bg-[#eefaf2] text-[#10b981] flex items-center justify-center mb-3">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">New today</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-50 text-emerald-600 font-semibold">0%</span>
                </div>
                <span className="text-3xl font-extrabold text-gray-900 dark:text-white mt-0.5 block tracking-tight">
                  {chatbotStats.newUsersToday || 0}
                </span>
              </div>
              <div className="text-[11.5px] text-gray-400 dark:text-gray-500 font-normal mt-3">
                +0 this week
              </div>
              {/* Green Bar Chart Graphic */}
              <div className="absolute bottom-2 right-4 flex items-end gap-1 h-8 pointer-events-none opacity-40">
                <div className="w-1.5 bg-emerald-400 rounded-t h-3" />
                <div className="w-1.5 bg-emerald-400 rounded-t h-5" />
                <div className="w-1.5 bg-emerald-400 rounded-t h-2" />
                <div className="w-1.5 bg-emerald-400 rounded-t h-7" />
                <div className="w-1.5 bg-emerald-400 rounded-t h-4" />
              </div>
            </div>

            {/* Metric Card 3 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
              <div>
                <div className="h-9 w-9 rounded-xl bg-[#eff5ff] text-[#3b82f6] flex items-center justify-center mb-3">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block">Conversations</span>
                <span className="text-3xl font-extrabold text-gray-900 dark:text-white mt-0.5 block tracking-tight">
                  {chatbotStats.totalConversations || 2}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11.5px] text-emerald-600 font-medium mt-3">
                <span>&nearr; 100%</span>
                <span className="text-gray-400 dark:text-gray-500 font-normal">Across all widgets</span>
              </div>
              {/* Soft Blue Wave Graphic */}
              <svg className="absolute bottom-0 right-0 w-28 h-12 text-[#3b82f6]/15 pointer-events-none" viewBox="0 0 100 40" fill="currentColor">
                <path d="M0,30 Q30,10 60,25 T100,15 L100,40 L0,40 Z" />
              </svg>
            </div>

            {/* Metric Card 4 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
              <div>
                <div className="h-9 w-9 rounded-xl bg-[#f5efff] text-[#8b5cf6] flex items-center justify-center mb-3">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block">Total messages</span>
                <span className="text-3xl font-extrabold text-gray-900 dark:text-white mt-0.5 block tracking-tight">
                  {chatbotStats.totalMessages || 4}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11.5px] text-emerald-600 font-medium mt-3">
                <span>&nearr; 100%</span>
                <span className="text-gray-400 dark:text-gray-500 font-normal">2 average per conversation</span>
              </div>
              {/* Soft Purple Wave Graphic */}
              <svg className="absolute bottom-0 right-0 w-28 h-12 text-[#8b5cf6]/15 pointer-events-none" viewBox="0 0 100 40" fill="currentColor">
                <path d="M0,35 Q20,15 50,20 T100,5 L100,40 L0,40 Z" />
              </svg>
            </div>
          </div>

          {/* Main Content Layout Grid (Charts + Recent Conversations) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column (2 Cols wide): 7-Day Activity & Active Users Table */}
            <div className="lg:col-span-2 space-y-6">
              {/* 7-Day Activity Chart Card */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Seven-day activity</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Daily breakdown of newly identified users and active chatbot sessions.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-gray-600 dark:text-gray-300">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#b47b59]" />
                      <span>New users</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-black dark:bg-white" />
                      <span>Conversations</span>
                    </div>
                  </div>
                </div>

                {/* SVG Spline Chart */}
                <div className="relative h-48 w-full pt-4">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGoldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#b47b59" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#b47b59" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {/* Area under gold curve */}
                    <path d="M 0,100 Q 80,90 160,70 T 320,80 T 480,40 L 500,40 L 500,120 L 0,120 Z" fill="url(#chartGoldGrad)" />
                    {/* Gold line curve */}
                    <path d="M 0,100 Q 80,90 160,70 T 320,80 T 500,40" fill="none" stroke="#b47b59" strokeWidth="2.5" />
                    {/* Black line curve */}
                    <path d="M 0,110 Q 80,95 160,60 T 320,85 T 500,15" fill="none" stroke="#111827" strokeWidth="2.5" />
                    {/* Nodes */}
                    <circle cx="0" cy="100" r="3.5" fill="#b47b59" />
                    <circle cx="80" cy="90" r="3.5" fill="#b47b59" />
                    <circle cx="160" cy="70" r="3.5" fill="#b47b59" />
                    <circle cx="240" cy="85" r="3.5" fill="#b47b59" />
                    <circle cx="320" cy="80" r="3.5" fill="#b47b59" />
                    <circle cx="400" cy="65" r="3.5" fill="#b47b59" />
                    <circle cx="480" cy="40" r="3.5" fill="#b47b59" />

                    <circle cx="0" cy="110" r="3.5" fill="#111827" />
                    <circle cx="80" cy="95" r="3.5" fill="#111827" />
                    <circle cx="160" cy="60" r="3.5" fill="#111827" />
                    <circle cx="240" cy="75" r="3.5" fill="#111827" />
                    <circle cx="320" cy="85" r="3.5" fill="#111827" />
                    <circle cx="400" cy="45" r="3.5" fill="#111827" />
                    <circle cx="480" cy="15" r="3.5" fill="#111827" />
                  </svg>

                  {/* Dates */}
                  <div className="flex justify-between text-[11px] text-gray-400 mt-2 font-medium">
                    <span>Oct 1</span>
                    <span>Oct 2</span>
                    <span>Oct 3</span>
                    <span>Oct 4</span>
                    <span>Oct 5</span>
                    <span>Oct 6</span>
                    <span>Oct 7</span>
                  </div>
                </div>
              </div>

              {/* Active Users Table Card */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Active users</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Users currently interacting with your chatbots.
                    </p>
                  </div>
                  <button type="button" className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700">
                    View all
                  </button>
                </div>

                <ChatbotUsersTable onSelectUser={(uId) => setSelectedUserId(uId)} />
              </div>
            </div>

            {/* Right Column (1 Col wide): Recent Conversations & Top Bots */}
            <div className="space-y-6">
              {/* Recent Conversations */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-gray-500" />
                    <span>Recent conversations</span>
                  </h3>
                  <ChevronRight className="h-4 w-4 text-gray-400 cursor-pointer" />
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {/* Visitor 1 */}
                  <div className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-600 font-bold text-xs flex items-center justify-center shrink-0">
                        S
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 dark:text-white truncate">Site Visitor</span>
                        </div>
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
                          Hi, I'd like to know more about your project...
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-gray-400">2 min ago</span>
                      <div className="mt-1 flex justify-end">
                        <span className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center text-[8px] text-white">💬</span>
                      </div>
                    </div>
                  </div>

                  {/* Visitor 2 */}
                  <div className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center shrink-0">
                        R
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 dark:text-white truncate">Rahul Mehta</span>
                        </div>
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
                          Can you share the brochure?
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-gray-400">15 min ago</span>
                      <div className="mt-1 flex justify-end">
                        <span className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-[8px] text-white">WhatsApp</span>
                      </div>
                    </div>
                  </div>

                  {/* Visitor 3 */}
                  <div className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 font-bold text-xs flex items-center justify-center shrink-0">
                        P
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 dark:text-white truncate">Priya Sharma</span>
                        </div>
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
                          I want to book a site visit.
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-gray-400">1 hour ago</span>
                      <div className="mt-1 flex justify-end">
                        <span className="h-4 w-4 rounded-full bg-sky-500 flex items-center justify-center text-[8px] text-white">🌐</span>
                      </div>
                    </div>
                  </div>

                  {/* Visitor 4 */}
                  <div className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center shrink-0">
                        K
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 dark:text-white truncate">Karan Verma</span>
                        </div>
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
                          Do you have any ongoing offers?
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-gray-400">3 hours ago</span>
                      <div className="mt-1 flex justify-end">
                        <span className="h-4 w-4 rounded-full bg-indigo-500 flex items-center justify-center text-[8px] text-white">⚡</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Bots by Conversations */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Top bots by conversations</h3>
                  <button type="button" className="text-xs font-semibold text-gray-500 hover:text-gray-800">
                    View all
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Bot 1 */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs">🤖</span>
                        Project Enquiry Bot
                      </span>
                      <span className="text-gray-500">12</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-[#c49947] rounded-full" style={{ width: '85%' }} />
                    </div>
                  </div>

                  {/* Bot 2 */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xs">📅</span>
                        Booking Assistant
                      </span>
                      <span className="text-gray-500">8</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-[#c49947] rounded-full" style={{ width: '60%' }} />
                    </div>
                  </div>

                  {/* Bot 3 */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center text-xs">💬</span>
                        General Support
                      </span>
                      <span className="text-gray-500">5</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-[#c49947] rounded-full" style={{ width: '38%' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: all client leads */}
      {activeTab === 'leads' && <Leads />}

      {/* TAB 3: client credentials */}
      {activeTab === 'clients' && (
        <div>
          {/* Summary strip */}
          <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <article className="metric-card">
              <div className="metric-icon"><Users /></div>
              <div><p>Total clients</p><strong>{clients.length}</strong></div>
            </article>

            <article className="metric-card">
              <div className="metric-icon"><Bot /></div>
              <div><p>Client bots</p><strong>{totalBots}</strong></div>
            </article>

            <article className="metric-card">
              <div className="metric-icon"><Database /></div>
              <div><p>Leads captured</p><strong>{totalLeads}</strong></div>
            </article>

            <article className="metric-card">
              <div className="metric-icon"><Sparkles /></div>
              <div className="min-w-0">
                <p>Viewing as</p>
                <strong className="truncate text-[17px]">
                  {impersonatedClient ? impersonatedClient.name : 'Admin'}
                </strong>
              </div>
              {impersonatedClient && (
                <button
                  type="button"
                  onClick={() => {
                    clearImpersonation();
                    loadClientsAndStats();
                  }}
                  className="button-secondary compact"
                >
                  Exit
                </button>
              )}
            </article>
          </div>

          {/* Client directory */}
          <div className="table-card">
            <div className="table-toolbar">
              <label className="search-field" style={{ width: 'min(100%, 320px)' }}>
                <Search />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, company or email…"
                  className="input"
                  aria-label="Search clients"
                />
              </label>
              <p className="text-faint text-[12px]">
                {filteredClients.length} registered {filteredClients.length === 1 ? 'client' : 'clients'}
              </p>
            </div>

            {loading ? (
              <div className="loading-state is-inline">
                <Loader2 className="animate-spin" />
                <span>Fetching client list and bot metrics…</span>
              </div>
            ) : filteredClients.length === 0 ? (
              <div style={{ padding: '20px' }}>
                <div className="empty-state">
                  <div className="empty-icon"><Users /></div>
                  <h4>No client credentials yet</h4>
                  <p>Create a client account to assign login credentials and manage their chatbot workspace.</p>
                  <button
                    type="button"
                    onClick={() => {
                      generatePassword();
                      setShowCreateModal(true);
                    }}
                    className="button-primary"
                  >
                    <UserPlus />
                    Create first client
                  </button>
                </div>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Login credentials</th>
                      <th>Chatbots</th>
                      <th>Leads</th>
                      <th className="cell-right">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => {
                      const isPassVisible = !!visiblePasswords[client.id];
                      const isCurrentImpersonated = impersonatedClient?.id === client.id;

                      return (
                        <tr key={client.id} className={isCurrentImpersonated ? 'is-row-active' : ''}>
                          {/* Client */}
                          <td>
                            <div className="flex items-center gap-3">
                              <span className="avatar-initial">
                                {client.name.substring(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="cell-title">{client.name}</span>
                                  {isCurrentImpersonated && <span className="tag tone-blue">Active</span>}
                                </div>
                                {client.company && (
                                  <span className="cell-sub inline-flex items-center gap-1">
                                    <Building2 className="h-3 w-3" />
                                    {client.company}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Credentials */}
                          <td>
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3 w-3 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                              <span className="text-mono">{client.email}</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="credential-chip">
                                <Key />
                                {isPassVisible ? (client.password || 'Client123!') : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(client.id)}
                                className="icon-button"
                                title={isPassVisible ? 'Hide password' : 'Show password'}
                              >
                                {isPassVisible ? <EyeOff /> : <Eye />}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(`Email: ${client.email}\nPassword: ${client.password || 'Client123!'}`, client.id)}
                                className="icon-button"
                                title="Copy credentials"
                              >
                                {copiedId === client.id ? <Check /> : <Copy />}
                              </button>
                            </div>
                          </td>

                          {/* Counts */}
                          <td><span className="tag">{client.botsCount} bots</span></td>
                          <td><span className="tag">{client.leadsCount} leads</span></td>

                          {/* Access */}
                          <td className="cell-right">
                            <div className="row-actions">
                              <button
                                type="button"
                                onClick={() => handleAccessClientDashboard(client)}
                                className={isCurrentImpersonated ? 'button-secondary compact' : 'button-primary compact'}
                              >
                                <span>{isCurrentImpersonated ? 'Viewing' : 'Open workspace'}</span>
                                <ArrowRight />
                              </button>

                              <button
                                type="button"
                                onClick={() => { setTargetClientForBot(client.id); setSelectedBotToTransfer(null); setBotTransferSearch(''); setShowTransferBotModal(true); loadAdminBots(); }}
                                className="button-secondary compact"
                                title={`Move a bot to ${client.name}`}
                              >
                                <Bot />
                                <span>Shift bot</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setClientToDelete(client)}
                                className="icon-button danger"
                                title="Delete client credentials"
                              >
                                <Trash2 />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User details */}
      <UserDetailModal
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
        onSelectConversation={(convId) => setSelectedConversationId(convId)}
      />

      {/* Conversation transcript */}
      <ConversationViewModal
        conversationId={selectedConversationId}
        onClose={() => setSelectedConversationId(null)}
      />

      {/* Modal 1: create client credentials */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="app-modal is-md">
            <div className="modal-head">
              <div className="modal-head-main">
                <span className="icon-tile tile-lg"><UserPlus /></span>
                <div>
                  <h3>Create client credentials</h3>
                  <p>Set up login access for your client.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="icon-button"
                aria-label="Close"
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="flex flex-col gap-3.5">
              <div>
                <label className="field-label" htmlFor="client-name">Full name *</label>
                <input
                  id="client-name"
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Sarah Connor"
                  className="input"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="client-company">Company</label>
                <input
                  id="client-company"
                  type="text"
                  value={clientCompany}
                  onChange={(e) => setClientCompany(e.target.value)}
                  placeholder="Cyberdyne Systems"
                  className="input"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="client-email">Email address *</label>
                <input
                  id="client-email"
                  type="email"
                  required
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="sarah@cyberdyne.com"
                  className="input"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="field-label" htmlFor="client-password">Password *</label>
                  <button type="button" onClick={generatePassword} className="link-button">
                    Auto-generate
                  </button>
                </div>
                <div className="field-row">
                  <input
                    id="client-password"
                    type="text"
                    required
                    value={clientPassword}
                    onChange={(e) => setClientPassword(e.target.value)}
                    placeholder="Client123!"
                    className="input input-mono"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(clientPassword, 'new_pass')}
                    className="button-secondary"
                  >
                    {copiedId === 'new_pass' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="client-notes">Internal notes</label>
                <textarea
                  id="client-notes"
                  rows={2}
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  placeholder="Optional notes about this client…"
                  className="textarea"
                  style={{ minHeight: '64px' }}
                />
              </div>

              <div className="modal-actions is-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="button-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="button-primary">
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  <span>Save credentials</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: generated credentials */}
      {createdCredentialsCard && (
        <div className="modal-backdrop">
          <div className="app-modal is-centered">
            <div className="modal-danger-icon tone-green">
              <CheckCircle2 />
            </div>

            <h3>Client account created</h3>
            <p className="mt-1.5">
              Credentials for <strong>{createdCredentialsCard.name}</strong> have been saved.
            </p>

            <dl className="credentials-readout" style={{ marginTop: '18px' }}>
              <div>
                <dt>Email</dt>
                <dd className="select-all">{createdCredentialsCard.email}</dd>
              </div>
              <div>
                <dt>Password</dt>
                <dd className="select-all">{createdCredentialsCard.password}</dd>
              </div>
              <div>
                <dt>Portal URL</dt>
                <dd className="select-all">{window.location.origin}/login</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = `Client Login Credentials:\nEmail: ${createdCredentialsCard.email}\nPassword: ${createdCredentialsCard.password}\nLogin URL: ${window.location.origin}/login`;
                  copyToClipboard(text, 'card_copy');
                }}
                className="button-secondary button-block"
              >
                {copiedId === 'card_copy' ? <Check /> : <Copy />}
                <span>{copiedId === 'card_copy' ? 'Copied to clipboard' : 'Copy credentials'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleAccessClientDashboard(createdCredentialsCard);
                  setCreatedCredentialsCard(null);
                }}
                className="button-primary button-block"
              >
                <ArrowRight />
                <span>Open client workspace</span>
              </button>

              <button
                type="button"
                onClick={() => setCreatedCredentialsCard(null)}
                className="button-ghost button-block"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* Modal: shift bot to client */}
      {showTransferBotModal && (
        <div className="modal-backdrop">
          <div className="app-modal is-md" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="modal-head-main"><span className="icon-tile tile-lg"><Bot /></span><div><h3>Shift bot to client</h3><p>Move an existing chatbot into this client's workspace.</p></div></div>
              <button type="button" onClick={() => { if (!isTransferringBot) { setShowTransferBotModal(false); setSelectedBotToTransfer(null); setTargetClientForBot(''); } }} className="icon-button" disabled={isTransferringBot}><X /></button>
            </div>
            <div style={{ marginBottom: '16px' }}><label className="field-label">Move bot to</label><div style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
              {(() => { const c = clients.find(x => x.id === targetClientForBot); return c ? <div className="flex items-center gap-3"><span className="avatar-initial">{c.name.substring(0, 2).toUpperCase()}</span><div><strong>{c.name}</strong><div className="cell-sub">{c.email}</div></div></div> : <span className="text-faint">Select a client</span>; })()}
            </div></div>
            <label className="search-field" style={{ width: '100%', marginBottom: '14px' }}><Search /><input type="text" value={botTransferSearch} onChange={e => setBotTransferSearch(e.target.value)} placeholder="Search bots…" className="input" /></label>
            <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
              {loadingAdminBots ? <div className="loading-state is-inline" style={{ minHeight: '180px' }}><Loader2 className="animate-spin" /><span>Loading bots…</span></div> : (() => {
                const filtered = adminBots.filter(bot => { const owned = bot.createdBy === targetClientForBot || bot.ownerId === targetClientForBot || bot.clientId === targetClientForBot; if (owned) return false; const q = botTransferSearch.trim().toLowerCase(); return !q || (bot.name || '').toLowerCase().includes(q) || bot.id.toLowerCase().includes(q); });
                if (!filtered.length) return <div className="empty-state" style={{ minHeight: '180px' }}><div className="empty-icon"><Bot /></div><h4>No bots available</h4><p>There are no other bots available to move to this client.</p></div>;
                return filtered.map(bot => { const owner = clients.find(c => c.id === bot.createdBy || c.id === bot.ownerId || c.id === bot.clientId); const selected = selectedBotToTransfer?.id === bot.id; return <button key={bot.id} type="button" onClick={() => setSelectedBotToTransfer(bot)} disabled={isTransferringBot} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', border: 0, borderBottom: '1px solid var(--border-color)', background: selected ? 'var(--surface-secondary)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}><span className="icon-tile"><Bot /></span><span style={{ minWidth: 0, flex: 1 }}><strong style={{ display: 'block' }}>{bot.name || 'Unnamed Bot'}</strong><small className="cell-sub">{owner ? `Currently with ${owner.name}` : 'Currently unassigned'}</small></span>{selected && <CheckCircle2 />}</button>; });
              })()}
            </div>
            {selectedBotToTransfer && <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface-secondary)' }}><div className="flex items-center gap-2"><CheckCircle2 /><span>Moving <strong>{selectedBotToTransfer.name}</strong></span></div></div>}
            <div className="modal-actions is-end"><button type="button" onClick={() => { setShowTransferBotModal(false); setSelectedBotToTransfer(null); setTargetClientForBot(''); }} disabled={isTransferringBot} className="button-secondary">Cancel</button><button type="button" onClick={transferBotToClient} disabled={!selectedBotToTransfer || !targetClientForBot || isTransferringBot} className="button-primary">{isTransferringBot ? <Loader2 className="animate-spin" /> : <ArrowRight />}<span>{isTransferringBot ? 'Moving bot…' : 'Move bot'}</span></button></div>
          </div>
        </div>
      )}

      {/* Modal 3: delete client */}
      {clientToDelete && (
        <div className="modal-backdrop">
          <div className="app-modal is-centered">
            <div className="modal-danger-icon">
              <AlertTriangle />
            </div>

            <h3>Delete client credentials?</h3>
            <p className="mt-1.5">
              <strong>{clientToDelete.name}</strong> ({clientToDelete.email}) will lose access to their
              workspace. This cannot be undone.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                disabled={isDeleting}
                className="button-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteClient}
                disabled={isDeleting}
                className="button-danger flex-1"
              >
                {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                <span>{isDeleting ? 'Deleting…' : 'Delete client'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
