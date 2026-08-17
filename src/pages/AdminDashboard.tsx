import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, deleteDoc, serverTimestamp, where, onSnapshot } from 'firebase/firestore';
import { useAuth, ImpersonatedClient } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  UserPlus, 
  Bot, 
  Database, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Eye, 
  EyeOff, 
  Key, 
  Sparkles, 
  Search, 
  X, 
  ArrowRight, 
  Loader2, 
  Building2, 
  Mail, 
  CheckCircle2, 
  ShieldCheck,
  Zap,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

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

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdCredentialsCard, setCreatedCredentialsCard] = useState<ClientRecord | null>(null);
  const [clientToDelete, setClientToDelete] = useState<ClientRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

    let unsubscribeClients: (() => void) | null = null;
    let unsubscribeBots: (() => void) | null = null;
    let unsubscribeLeads: (() => void) | null = null;

    try {
      unsubscribeClients = onSnapshot(collection(db, 'clients'), () => loadClientsAndStats(), () => {});
      unsubscribeBots = onSnapshot(collection(db, 'bot_configurations'), () => loadClientsAndStats(), () => {});
      unsubscribeLeads = onSnapshot(collection(db, 'leads'), () => loadClientsAndStats(), () => {});
    } catch (e) {}

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        if (event.data && !event.data.startsWith(':')) {
          loadClientsAndStats();
        }
      };
    } catch (e) {}

    const pollInterval = setInterval(() => {
      loadClientsAndStats();
    }, 5000);

    return () => {
      if (unsubscribeClients) unsubscribeClients();
      if (unsubscribeBots) unsubscribeBots();
      if (unsubscribeLeads) unsubscribeLeads();
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
      try { currentLocal = JSON.parse(currentLocalRaw); } catch {}
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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 border border-indigo-100">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              Admin Control Center
            </span>
            {impersonatedClient && (
              <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 border border-amber-200 animate-pulse">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                Active Client View Mode
              </span>
            )}
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 mt-2">Mintage Client Portal & Credentials</h2>
          <p className="text-gray-500 text-sm mt-1">
            Generate client credentials and jump into any client dashboard with 1-click access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadClientsAndStats}
            className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all border border-gray-200 bg-white"
            title="Refresh Client Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              generatePassword();
              setShowCreateModal(true);
            }}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Create Client Credentials</span>
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Clients</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5">{clients.length}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Client Bots</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5">{totalBots}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Client Leads Captured</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5">{totalLeads}</p>
          </div>
        </div>

        <div className={`p-6 rounded-3xl border flex items-center justify-between gap-4 transition-all ${
          impersonatedClient 
            ? 'bg-gradient-to-br from-indigo-900 to-slate-900 text-white border-indigo-800 shadow-xl' 
            : 'bg-white border-gray-100 shadow-sm text-gray-900'
        }`}>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${impersonatedClient ? 'text-indigo-200' : 'text-gray-400'}`}>
              Impersonation Mode
            </p>
            <p className="text-sm font-bold truncate max-w-[150px] mt-0.5">
              {impersonatedClient ? impersonatedClient.name : 'Viewing as Admin'}
            </p>
          </div>
          {impersonatedClient ? (
            <button
              onClick={() => {
                clearImpersonation();
                loadClientsAndStats();
              }}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-400/30 rounded-xl text-xs font-bold transition-all shrink-0"
            >
              Exit Client View
            </button>
          ) : (
            <span className="text-[10px] bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-bold">Standard</span>
          )}
        </div>
      </div>

      {/* Main Directory Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pb-4 border-b border-gray-100">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clients by name, company, or email..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
          <p className="text-xs text-gray-400 font-medium">
            Showing <strong className="text-gray-700">{filteredClients.length}</strong> registered clients
          </p>
        </div>

        {loading ? (
          <div className="p-16 text-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
            <p className="text-xs text-gray-500 font-medium">Fetching client list and bot metrics...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="p-16 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-gray-700">No client credentials created yet</h4>
            <p className="text-xs text-gray-400 max-w-md mx-auto mt-1 mb-4">
              Create your first client account above to assign custom login credentials and manage their chatbot workspace.
            </p>
            <button
              onClick={() => {
                generatePassword();
                setShowCreateModal(true);
              }}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            >
              + Create First Client
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left">
                  <th className="px-6 py-4">Client / Company</th>
                  <th className="px-6 py-4">Login Credentials</th>
                  <th className="px-6 py-4">Chatbots</th>
                  <th className="px-6 py-4">Leads Captured</th>
                  <th className="px-6 py-4 text-right">Instant Dashboard Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredClients.map((client) => {
                  const isPassVisible = !!visiblePasswords[client.id];
                  const isCurrentImpersonated = impersonatedClient?.id === client.id;

                  return (
                    <tr 
                      key={client.id}
                      className={`hover:bg-indigo-50/30 transition-colors ${isCurrentImpersonated ? 'bg-indigo-50/60' : ''}`}
                    >
                      {/* Client Info */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-100/70 text-indigo-700 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0">
                            {client.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                              <span>{client.name}</span>
                              {isCurrentImpersonated && (
                                <span className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full uppercase tracking-wider">
                                  Active
                                </span>
                              )}
                            </div>
                            {client.company && (
                              <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 text-gray-400" />
                                <span>{client.company}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Credentials */}
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-xs text-gray-800 font-medium flex items-center gap-1">
                            <Mail className="w-3 h-3 text-gray-400" />
                            <span className="font-mono text-[11px]">{client.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs font-mono bg-gray-50 border border-gray-200 px-2 py-0.5 rounded text-gray-700 flex items-center gap-1">
                              <Key className="w-3 h-3 text-amber-500" />
                              <span>{isPassVisible ? (client.password || 'Client123!') : '••••••••'}</span>
                            </div>
                            <button
                              onClick={() => togglePasswordVisibility(client.id)}
                              className="text-gray-400 hover:text-gray-600 p-1"
                              title={isPassVisible ? 'Hide Password' : 'Show Password'}
                            >
                              {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => copyToClipboard(`Email: ${client.email}\nPassword: ${client.password || 'Client123!'}`, client.id)}
                              className="text-gray-400 hover:text-indigo-600 p-1"
                              title="Copy Credentials"
                            >
                              {copiedId === client.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Chatbots Count */}
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold">
                          {client.botsCount} Bots
                        </span>
                      </td>

                      {/* Leads Count */}
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">
                          {client.leadsCount} Leads
                        </span>
                      </td>

                      {/* 1-Click Access Button */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleAccessClientDashboard(client)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0 ${
                              isCurrentImpersonated
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100'
                                : 'bg-gray-900 text-white hover:bg-black shadow-gray-200'
                            }`}
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span>{isCurrentImpersonated ? 'Viewing Dashboard' : 'Access Client Dashboard'}</span>
                            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                          </button>

                          <button
                            onClick={() => setClientToDelete(client)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            title="Delete Client Credentials"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Modal 1: Create Client Credentials */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border border-gray-100 space-y-6">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Create Client Credentials</h3>
                  <p className="text-xs text-gray-500">Set up login access for your client.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Client Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Sarah Connor"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Company / Agency Name
                </label>
                <input
                  type="text"
                  value={clientCompany}
                  onChange={(e) => setClientCompany(e.target.value)}
                  placeholder="e.g. Cyberdyne Systems"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Client Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="e.g. sarah@cyberdyne.com"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                    Generated Password *
                  </label>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> Auto-Generate
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={clientPassword}
                    onChange={(e) => setClientPassword(e.target.value)}
                    placeholder="e.g. Client123!"
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(clientPassword, 'new_pass')}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all shrink-0"
                  >
                    {copiedId === 'new_pass' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Notes / Internal Reference
                </label>
                <textarea
                  rows={2}
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  placeholder="Optional internal notes about this client..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save Client Credentials</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Generated Credentials Card */}
      {createdCredentialsCard && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-gray-100 text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900">Client Account Created!</h3>
              <p className="text-xs text-gray-500 mt-1">
                Credentials for <strong>{createdCredentialsCard.name}</strong> have been saved successfully.
              </p>
            </div>

            {/* Credential Box */}
            <div className="p-5 bg-gray-50 border border-gray-200 rounded-2xl text-left space-y-3 font-mono text-xs">
              <div>
                <p className="text-[10px] font-sans font-bold text-gray-400 uppercase">Client Email</p>
                <p className="text-gray-900 font-bold select-all mt-0.5">{createdCredentialsCard.email}</p>
              </div>
              <div>
                <p className="text-[10px] font-sans font-bold text-gray-400 uppercase">Password</p>
                <p className="text-indigo-600 font-bold select-all mt-0.5">{createdCredentialsCard.password}</p>
              </div>
              <div>
                <p className="text-[10px] font-sans font-bold text-gray-400 uppercase">Portal URL</p>
                <p className="text-gray-600 text-[11px] select-all mt-0.5">{window.location.origin}/login</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  const text = `Client Login Credentials:\nEmail: ${createdCredentialsCard.email}\nPassword: ${createdCredentialsCard.password}\nLogin URL: ${window.location.origin}/login`;
                  copyToClipboard(text, 'card_copy');
                }}
                className="w-full py-3 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {copiedId === 'card_copy' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedId === 'card_copy' ? 'Credentials Copied to Clipboard!' : 'Copy Client Credentials'}</span>
              </button>

              <button
                onClick={() => {
                  handleAccessClientDashboard(createdCredentialsCard);
                  setCreatedCredentialsCard(null);
                }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>1-Click Access Client Dashboard Now</span>
              </button>

              <button
                onClick={() => setCreatedCredentialsCard(null)}
                className="w-full py-2.5 text-gray-500 hover:text-gray-700 text-xs font-bold transition-all"
              >
                Close & Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Delete Client Confirmation */}
      {clientToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 text-center">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900">Delete Client Credentials?</h3>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                Are you sure you want to permanently delete <strong>{clientToDelete.name}</strong> ({clientToDelete.email})? This action will remove their access credentials.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteClient}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{isDeleting ? 'Deleting...' : 'Delete Client'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
