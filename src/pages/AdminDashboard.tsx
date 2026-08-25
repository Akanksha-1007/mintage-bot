import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, deleteDoc, serverTimestamp, where, onSnapshot } from 'firebase/firestore';
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

  const loadClientsAndStats = async () => {
    setLoading(true);
    let fetchedClients: ClientRecord[] = [];

    // Read local cache backup
    const localClientsRaw = localStorage.getItem('mintage_clients_cache');
    let localClients: ClientRecord[] = [];
    if (localClientsRaw) {
      try { localClients = JSON.parse(localClientsRaw); } catch (e) { localClients = []; }
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
            password: data.password || '',
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

    const finalClients = Array.from(clientMap.values());
    setClients(finalClients);
    localStorage.setItem('mintage_clients_cache', JSON.stringify(finalClients));
    setLoading(false);
  };

  useEffect(() => {
    loadClientsAndStats();
    loadChatbotStats();

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
    if (!clientName || !clientEmail) return;

    setIsSubmitting(true);
    const clientId = `client_${Date.now()}`;
    const pass = clientPassword || 'Client123!';
    const cleanEmail = clientEmail.toLowerCase().trim();

    const clientData = {
      name: clientName,
      company: clientCompany,
      email: cleanEmail,
      password: pass,
      notes: clientNotes,
      role: 'user',
      createdAt: serverTimestamp(),
    };

    const newRecord: ClientRecord = {
      id: clientId,
      name: clientName,
      company: clientCompany,
      email: cleanEmail,
      password: pass,
      notes: clientNotes,
      botsCount: 0,
      leadsCount: 0,
    };

    // Save to local cache immediately
    const currentLocalRaw = localStorage.getItem('mintage_clients_cache');
    let currentLocal: ClientRecord[] = [];
    if (currentLocalRaw) {
      try { currentLocal = JSON.parse(currentLocalRaw); } catch { }
    }
    const updatedLocal = [newRecord, ...currentLocal.filter(c => c.id !== clientId)];
    localStorage.setItem('mintage_clients_cache', JSON.stringify(updatedLocal));

    try {
      // Save to 'clients' collection
      await setDoc(doc(db, 'clients', clientId), clientData).catch(err => {
        console.warn('Firestore setDoc clients error:', err?.message || err);
      });

      // Also create/sync user record in 'users'
      await setDoc(doc(db, 'users', clientId), {
        email: cleanEmail,
        displayName: clientName,
        password: pass,
        company: clientCompany,
        role: 'user',
        createdAt: serverTimestamp(),
      }, { merge: true }).catch(err => {
        console.warn('Firestore setDoc users error:', err?.message || err);
      });
    } catch (error) {
      console.warn('Client created locally, Firestore save warning:', error);
    }

    setCreatedCredentialsCard(newRecord);
    setShowCreateModal(false);

    // Reset form
    setClientName('');
    setClientCompany('');
    setClientEmail('');
    setClientPassword('');
    setClientNotes('');

    loadClientsAndStats();
    setIsSubmitting(false);
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
      password: client.password,
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
      {/* Header */}
      <header className="page-heading">
        <div>
          <div className="eyebrow-row">
            <span className="status-pill tone-blue"><ShieldCheck />Admin console</span>
            {impersonatedClient && (
              <span className="status-pill tone-yellow"><Sparkles />Client view</span>
            )}
          </div>
          <h2>
            {activeTab === 'users'
              ? 'Chatbot users'
              : (activeTab === 'leads' ? 'All client leads' : 'Client credentials')}
          </h2>
          <p>
            {activeTab === 'users'
              ? 'Live overview of chatbot visitors, message history and engagement.'
              : (activeTab === 'leads'
                ? 'Centralised lead management across every published client chatbot.'
                : 'Generate client credentials and open any client workspace in one click.')}
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            onClick={() => {
              loadClientsAndStats();
              loadChatbotStats();
            }}
            className="icon-button bordered"
            title="Refresh admin data"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </button>
          {activeTab === 'clients' && (
            <button
              type="button"
              onClick={() => {
                generatePassword();
                setShowCreateModal(true);
              }}
              className="button-primary"
            >
              <UserPlus />
              <span>New client</span>
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="tab-strip" style={{ marginBottom: '28px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`tab ${activeTab === 'users' ? 'is-active' : ''}`}
        >
          <Users />
          <span>Users &amp; conversations</span>
          <span className="count-badge">{chatbotStats.totalUsers}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('leads')}
          className={`tab ${activeTab === 'leads' ? 'is-active' : ''}`}
        >
          <Database />
          <span>All client leads</span>
          <span className="count-badge">{totalLeads}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('clients')}
          className={`tab ${activeTab === 'clients' ? 'is-active' : ''}`}
        >
          <Building2 />
          <span>Client credentials</span>
          <span className="count-badge">{clients.length}</span>
        </button>
      </div>

      {/* TAB 1: chatbot activity & users */}
      {activeTab === 'users' && (
        <div>
          <section className="admin-overview-deck">
            <article className="admin-primary-stat">
              <div className="admin-stat-icon"><Users /></div>
              <div>
                <span className="admin-card-kicker">Audience</span>
                <p>Total chatbot users</p>
                <strong>{chatbotStats.totalUsers}</strong>
              </div>
              <div className="admin-primary-footer">
                <span><UserCheck /> {chatbotStats.activeUsers} active recently</span>
                <span>Live directory</span>
              </div>
              <div className="admin-sparkline" aria-hidden="true">
                {adminTrend.map((item, index) => (
                  <i key={index} style={{ height: `${Math.max(12, item.users * 12)}%` }} />
                ))}
              </div>
            </article>

            <div className="admin-secondary-stats">
              <article>
                <div className="admin-secondary-icon tone-green"><TrendingUp /></div>
                <div>
                  <span>New today</span>
                  <strong>{chatbotStats.newUsersToday}</strong>
                  <small>+{chatbotStats.newUsersThisWeek} this week</small>
                </div>
              </article>
              <article>
                <div className="admin-secondary-icon tone-yellow"><MessageSquare /></div>
                <div>
                  <span>Conversations</span>
                  <strong>{chatbotStats.totalConversations}</strong>
                  <small>Across all widgets</small>
                </div>
              </article>
              <article>
                <div className="admin-secondary-icon tone-purple"><BarChart3 /></div>
                <div>
                  <span>Total messages</span>
                  <strong>{chatbotStats.totalMessages}</strong>
                  <small>{chatbotStats.avgMessagesPerConversation} average per conversation</small>
                </div>
              </article>
            </div>
          </section>

          {/* 7-day activity */}
          <div className="admin-activity-card">
            <div className="admin-activity-head">
              <div>
                <h3>Seven-day activity</h3>
                <p>Daily breakdown of newly identified users and active chatbot sessions.</p>
              </div>
              <div className="chart-legend">
                <span><i className="swatch-users" />New users</span>
                <span><i className="swatch-convs" />Conversations</span>
              </div>
            </div>

            <div className="activity-chart">
              {adminTrend.map((item, idx) => {
                const maxVal = Math.max(
                  ...adminTrend.flatMap(t => [t.users, t.conversations]),
                  5
                );
                const userHeightPct = Math.max(6, Math.round((item.users / maxVal) * 100));
                const convHeightPct = Math.max(6, Math.round((item.conversations / maxVal) * 100));

                return (
                  <div key={idx}>
                    <div className="activity-bars">
                      <div
                        className="bar-users"
                        style={{ height: `${userHeightPct}%` }}
                        title={`Users: ${item.users}`}
                      />
                      <div
                        className="bar-convs"
                        style={{ height: `${convHeightPct}%` }}
                        title={`Conversations: ${item.conversations}`}
                      />
                    </div>
                    <span className="chart-label">{item.date}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <ChatbotUsersTable onSelectUser={(uId) => setSelectedUserId(uId)} />
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
          <div className="notion-modal is-md">
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
          <div className="notion-modal is-centered">
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
      )}

      {/* Modal 3: delete client */}
      {clientToDelete && (
        <div className="modal-backdrop">
          <div className="notion-modal is-centered">
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
