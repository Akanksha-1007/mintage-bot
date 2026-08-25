import React, { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, doc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import {
  ExternalLink, Bot, Download, Search,
  CheckCircle2, AlertCircle, Clock, RefreshCw, X, Layers, FileText,
  Trash2, AlertTriangle, Loader2, MessageSquare, Tag
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import ConversationViewModal from '../components/ConversationViewModal';

interface DynamicField {
  fieldId?: string;
  label: string;
  value: any;
}

interface Lead {
  id: string;
  botId?: string;
  flowId: string;
  clientId?: string;
  ownerId?: string;
  botName?: string;
  flowName?: string;
  clientName?: string;
  name?: string;
  status?: string;
  conversationId?: string;
  fields?: DynamicField[];
  data: Record<string, any>;
  timestamp: any;
  submittedAt?: string;
  sourceUrl?: string;
  googleSheetSyncStatus?: 'synced' | 'pending' | 'failed' | string;
  googleSheetSyncError?: string;
  googleSheetSyncedAt?: string;
}

export default function Leads() {
  const { effectiveUserId, isAdmin, impersonatedClient } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [botNames, setBotNames] = useState<Record<string, string>>({});
  const [selectedBotFilter, setSelectedBotFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState<boolean>(false);
  const [isRetryingSync, setIsRetryingSync] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const confirmDeleteLead = async () => {
    if (!deletingLead) return;
    setIsDeletingLead(true);
    const targetId = deletingLead.id;

    try {
      // 1. Delete from Server Backend API
      try {
        await fetch(`/api/leads/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
        await fetch('/api/leads/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: targetId })
        });
      } catch (apiErr) {
        console.warn('Server lead delete API error:', apiErr);
      }

      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'leads', targetId)).catch(() => null);

      // 3. Blacklist lead ID in localStorage
      const deletedIdsRaw = localStorage.getItem('mintage_deleted_lead_ids');
      let deletedIds: string[] = [];
      if (deletedIdsRaw) {
        try { deletedIds = JSON.parse(deletedIdsRaw); } catch { }
      }
      if (!deletedIds.includes(targetId)) {
        deletedIds.push(targetId);
        localStorage.setItem('mintage_deleted_lead_ids', JSON.stringify(deletedIds));
      }

      // 4. Clean up localStorage cache
      const localRaw = localStorage.getItem('mintage_leads');
      if (localRaw) {
        try {
          const parsed = JSON.parse(localRaw);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((l: any) => l && l.id !== targetId);
            localStorage.setItem('mintage_leads', JSON.stringify(filtered));
          }
        } catch { }
      }

      // 5. Update local state
      setLeads(prev => prev.filter(l => l.id !== targetId));
      if (selectedLead && selectedLead.id === targetId) {
        setSelectedLead(null);
      }
      setDeletingLead(null);
      showToast('Lead deleted permanently');
    } catch (err: any) {
      console.error('Error deleting lead:', err);
      showToast('Failed to delete lead: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsDeletingLead(false);
    }
  };

  useEffect(() => {
    const targetUserId = effectiveUserId || auth.currentUser?.uid;
    console.log('[LEADS_PAGE] authenticatedUserId =', targetUserId);

    if (!targetUserId && !isAdmin) {
      setLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const isGlobalAdminView = isAdmin && !impersonatedClient;
    console.log('[LEADS_PAGE] leadQueryStarted (isGlobalAdminView =', isGlobalAdminView, ')');

    const q = collection(db, 'leads');

    const unsubscribeLeads = onSnapshot(q, async (snapshot) => {
      let firestoreLeads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lead[];

      // Fetch user's bot configurations to include leads matching user's bot IDs
      let userBotIds: string[] = [];
      try {
        const botSnap = await getDocs(collection(db, 'bot_configurations')).catch(() => null);
        if (botSnap && !botSnap.empty) {
          userBotIds = botSnap.docs
            .filter(d => d.data().createdBy === targetUserId || d.data().clientId === targetUserId || d.data().ownerId === targetUserId)
            .map(d => d.id || d.data().id);
        }
      } catch (e) { }

      if (!isGlobalAdminView) {
        firestoreLeads = firestoreLeads.filter(l =>
          l.clientId === targetUserId ||
          l.ownerId === targetUserId ||
          userBotIds.includes(l.botId || '') ||
          userBotIds.includes(l.flowId || '') ||
          l.clientId === 'demo_user' ||
          l.ownerId === 'demo_user' ||
          targetUserId === 'demo_user'
        );
      }

      console.log('[LEADS_PAGE] firestoreLeadCount =', firestoreLeads.length);

      // Fetch server backend leads
      let serverLeads: Lead[] = [];
      try {
        const url = isGlobalAdminView ? '/api/leads' : `/api/leads?ownerId=${encodeURIComponent(targetUserId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const sData = await res.json();
          if (sData.success && Array.isArray(sData.leads)) {
            serverLeads = sData.leads;
          }
        }
      } catch (err) {
        console.warn('Backend leads API warning:', err);
      }

      // Local storage backup leads
      let localLeads: Lead[] = [];
      const localRaw = localStorage.getItem('mintage_leads');
      if (localRaw) {
        try {
          const parsed = JSON.parse(localRaw);
          if (Array.isArray(parsed)) localLeads = parsed;
        } catch (e) { }
      }

      // Read deleted lead IDs blacklist
      const deletedIdsRaw = localStorage.getItem('mintage_deleted_lead_ids');
      let deletedIds: string[] = [];
      if (deletedIdsRaw) {
        try { deletedIds = JSON.parse(deletedIdsRaw); } catch { }
      }

      // Merge Local Storage + Server API + Firestore leads without duplication
      const leadMap = new Map<string, Lead>();
      localLeads.forEach(l => { if (l && l.id && !deletedIds.includes(l.id)) leadMap.set(l.id, l); });
      serverLeads.forEach(l => { if (l && l.id && !deletedIds.includes(l.id)) leadMap.set(l.id, l); });
      firestoreLeads.forEach(l => { if (l && l.id && !deletedIds.includes(l.id)) leadMap.set(l.id, l); });

      const mergedLeads = Array.from(leadMap.values());
      console.log('[LEAD_DASHBOARD]', { effectiveClientId: targetUserId, leadCount: mergedLeads.length });
      console.log('[LEADS_PAGE] mergedLeadCount =', mergedLeads.length, 'leadIds =', mergedLeads.map(l => l.id));

      setLeads(mergedLeads);
      setLoading(false);

      // Fetch unique bot names for these leads
      const names: Record<string, string> = { ...botNames };
      mergedLeads.forEach(l => {
        const bId = l.botId || l.flowId;
        const bName = l.botName || l.flowName || l.clientName;
        if (bId && bName) {
          names[bId] = bName;
        }
      });

      const uniqueBotIds = Array.from(new Set(mergedLeads.map(l => l.botId || l.flowId).filter(Boolean)));
      for (const bId of uniqueBotIds) {
        if (!names[bId]) {
          if (bId.includes('risinia')) names[bId] = 'Risinia Builders';
          else if (bId.includes('river')) names[bId] = 'River Scape Residences';
          else {
            try {
              const botDoc = await getDoc(doc(db, 'bot_configurations', bId));
              if (botDoc.exists()) {
                names[bId] = botDoc.data().name;
              }
            } catch (e) { }
          }
        }
      }
      setBotNames(names);
      setLoadError(null);
    }, async (error) => {
      console.error('[LEADS_PAGE] Firestore snapshot error, attempting server API fallback:', error);
      try {
        const deletedIdsRaw = localStorage.getItem('mintage_deleted_lead_ids');
        const deletedIds: string[] = deletedIdsRaw ? JSON.parse(deletedIdsRaw) : [];
        const url = isGlobalAdminView ? '/api/leads' : `/api/leads?ownerId=${encodeURIComponent(targetUserId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const sData = await res.json();
          if (sData.success && Array.isArray(sData.leads)) {
            setLeads(sData.leads.filter((l: Lead) => l && l.id && !deletedIds.includes(l.id)));
            setLoadError(null);
          } else {
            setLoadError('Unable to load leads from server.');
          }
        } else {
          setLoadError('Unable to load leads (server returned status ' + res.status + ').');
        }
      } catch (err: any) {
        console.error('[LEADS_PAGE] Server fallback leads fetch error:', err);
        setLoadError('Unable to load leads. Please check your network connection.');
      }
      setLoading(false);
    });

    // Helper to fetch server leads on SSE or window events
    const refreshServerLeads = async () => {
      try {
        const deletedIdsRaw = localStorage.getItem('mintage_deleted_lead_ids');
        let deletedIds: string[] = [];
        if (deletedIdsRaw) {
          try { deletedIds = JSON.parse(deletedIdsRaw); } catch { }
        }
        const url = isGlobalAdminView ? '/api/leads' : `/api/leads?ownerId=${encodeURIComponent(targetUserId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const sData = await res.json();
          if (sData.success && Array.isArray(sData.leads)) {
            setLeads(prev => {
              const map = new Map<string, Lead>();
              prev.forEach(l => { if (l && l.id && !deletedIds.includes(l.id)) map.set(l.id, l); });
              sData.leads.forEach((l: Lead) => { if (l && l.id && !deletedIds.includes(l.id)) map.set(l.id, l); });
              return Array.from(map.values());
            });
          }
        }
      } catch (e) { }
    };

    // Real-time EventSource SSE Listener
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        if (event.data && !event.data.startsWith(':')) {
          refreshServerLeads();
        }
      };
    } catch (e) { }

    // Custom intra-tab window listener
    const handleCustomLead = () => refreshServerLeads();
    window.addEventListener('mintage_lead_captured', handleCustomLead);

    // Fallback polling interval (every 5 seconds)
    const pollInterval = setInterval(() => {
      refreshServerLeads();
    }, 5000);

    return () => {
      unsubscribeLeads();
      if (eventSource) eventSource.close();
      window.removeEventListener('mintage_lead_captured', handleCustomLead);
      clearInterval(pollInterval);
    };
  }, [effectiveUserId, isAdmin, impersonatedClient]);


  // Extract all dynamic field entries for a lead
  const getLeadFieldEntries = (lead: Lead): Array<{ label: string; value: string }> => {
    const map = new Map<string, string>();

    // 1. Parse fields array
    if (Array.isArray(lead.fields)) {
      lead.fields.forEach(f => {
        if (f && f.label) {
          map.set(String(f.label).trim(), f.value !== undefined ? String(f.value) : '');
        }
      });
    }

    // 2. Parse data dictionary fallback
    if (lead.data && typeof lead.data === 'object') {
      Object.entries(lead.data).forEach(([key, val]) => {
        const cleanKey = String(key).trim();
        if (!['id', 'botId', 'flowId', 'clientId', 'ownerId', 'botName', 'clientName', 'fields', 'sourceUrl', 'submittedAt', 'timestamp', 'googleSheetSyncStatus', 'googleSheetSyncError', 'googleSheetSyncedAt'].includes(cleanKey)) {
          let prettyLabel = cleanKey;
          if (cleanKey === 'name' || cleanKey === 'full_name') prettyLabel = 'Name';
          else if (cleanKey === 'phone' || cleanKey === 'phone_number') prettyLabel = 'Phone Number';
          else if (cleanKey === 'email' || cleanKey === 'email_address') prettyLabel = 'Email';

          if (!map.has(prettyLabel)) {
            map.set(prettyLabel, val !== undefined ? String(val) : '');
          }
        }
      });
    }

    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  };

  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/leads/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, status: newStatus, updatedBy: auth.currentUser?.email || 'client' })
      });
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead({ ...selectedLead, status: newStatus });
        }
        showToast(`Lead status updated to "${newStatus}"`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to update status', 'error');
      }
    } catch (err: any) {
      showToast('Error updating status: ' + (err.message || 'Unknown error'), 'error');
    }
  };

  const leadStats = {
    total: leads.length,
    new: leads.filter(l => (l.status || 'New') === 'New').length,
    contacted: leads.filter(l => l.status === 'Contacted').length,
    qualified: leads.filter(l => l.status === 'Qualified').length,
    converted: leads.filter(l => l.status === 'Converted').length,
    lost: leads.filter(l => l.status === 'Lost').length,
  };

  // Filter leads based on selected bot, status filter, and search query
  const filteredLeads = leads.filter(lead => {
    const bId = lead.botId || lead.flowId;
    if (selectedBotFilter !== 'ALL' && bId !== selectedBotFilter) {
      return false;
    }
    const currentStatus = lead.status || 'New';
    if (selectedStatusFilter !== 'ALL' && currentStatus !== selectedStatusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const bName = (botNames[bId] || lead.botName || lead.clientName || '').toLowerCase();
      const fieldMatch = getLeadFieldEntries(lead).some(f =>
        f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)
      );
      const urlMatch = (lead.sourceUrl || '').toLowerCase().includes(q);
      const idMatch = (lead.id || '').toLowerCase().includes(q);
      const statusMatch = currentStatus.toLowerCase().includes(q);
      return bName.includes(q) || fieldMatch || urlMatch || idMatch || statusMatch;
    }
    return true;
  });

  // Calculate unique dynamic field labels across filtered leads for dynamic table columns
  const dynamicColumnLabels = Array.from(
    new Set(
      filteredLeads.flatMap(lead => getLeadFieldEntries(lead).map(f => f.label))
    )
  );

  // Available bot IDs for filter dropdown
  const uniqueBotsList = Array.from(
    new Set(leads.map(l => l.botId || l.flowId).filter(Boolean))
  ).map(bId => ({
    id: bId,
    name: botNames[bId] || bId
  }));

  // Retry Google Sheets sync securely through backend API
  const handleRetrySync = async (lead: Lead) => {
    setIsRetryingSync(true);
    try {
      const res = await fetch('/api/leads/retry-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Lead successfully synchronized to Google Sheet!');
        if (selectedLead && selectedLead.id === lead.id) {
          setSelectedLead({
            ...selectedLead,
            googleSheetSyncStatus: 'synced',
            googleSheetSyncError: undefined
          });
        }
        // Refresh local leads list
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, googleSheetSyncStatus: 'synced', googleSheetSyncError: undefined } : l));
      } else {
        showToast(data.error || 'Retry sync failed.', 'error');
        if (selectedLead && selectedLead.id === lead.id) {
          setSelectedLead({
            ...selectedLead,
            googleSheetSyncStatus: 'failed',
            googleSheetSyncError: data.error
          });
        }
      }
    } catch (err: any) {
      showToast('Retry sync failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsRetryingSync(false);
    }
  };

  const handleSyncAllExistingLeads = async () => {
    setIsSyncingAll(true);
    const targetUserId = effectiveUserId || auth.currentUser?.uid || 'demo_user';
    try {
      const res = await fetch('/api/leads/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: targetUserId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Synced ${data.synced || 0} leads to Google Sheet (${data.skipped || 0} already synced)!`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast(data.error || 'Failed to sync existing leads', 'error');
      }
    } catch (err: any) {
      showToast('Error syncing existing leads: ' + (err.message || err), 'error');
    } finally {
      setIsSyncingAll(false);
    }
  };


  const exportLeads = () => {
    const baseHeaders = ['Date', 'Lead ID', 'Bot Name', ...dynamicColumnLabels, 'Source URL', 'Google Sheet Sync'];
    const rows = filteredLeads.map(lead => {
      const fieldMap = new Map(getLeadFieldEntries(lead).map(f => [f.label, f.value]));
      const dateStr = lead.submittedAt || (lead.timestamp?.toDate ? format(lead.timestamp.toDate(), 'yyyy-MM-dd HH:mm') : '');
      const botName = botNames[lead.botId || lead.flowId] || lead.botName || lead.clientName || 'Chatbot';

      const dynamicVals = dynamicColumnLabels.map(label =>
        `${String(fieldMap.get(String(label)) ?? '').replace(/"/g, '""')}`
      );
      const syncStatus = lead.googleSheetSyncStatus || 'synced';

      return [
        `"${dateStr}"`,
        `"${lead.id}"`,
        `"${botName}"`,
        ...dynamicVals,
        `"${lead.sourceUrl || ''}"`,
        `"${syncStatus}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,"
      + baseHeaders.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mintage_leads_${format(new Date(), 'yyyy_MM_dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="leads-page workspace-page workspace-page--wide">
      {/* Toast notification */}
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'is-success' : 'is-error'}`}>
          {toast.type === 'success' ? <CheckCircle2 /> : <AlertCircle />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="page-heading">
        <div>
          <div className="eyebrow-row">
            <span className="eyebrow">Lead database</span>
            <span className="status-pill status-live"><span />Live</span>
          </div>
          <h2>Leads</h2>
          <p>Every captured submission, its source page, and its Google Sheets sync state.</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={exportLeads} className="button-secondary">
            <Download />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleSyncAllExistingLeads}
            disabled={isSyncingAll}
            className="button-primary"
          >
            <RefreshCw className={isSyncingAll ? 'animate-spin' : ''} />
            {isSyncingAll ? 'Syncing…' : 'Sync to Google Sheet'}
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="leads-control-bar">
        <label className="inline-select">
          <Bot />
          <select
            value={selectedBotFilter}
            onChange={(e) => setSelectedBotFilter(e.target.value)}
            aria-label="Filter by chatbot"
          >
            <option value="ALL">All chatbots ({leads.length})</option>
            {uniqueBotsList.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        <label className="inline-select">
          <Tag />
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses ({leads.length})</option>
            <option value="New">New ({leadStats.new})</option>
            <option value="Contacted">Contacted ({leadStats.contacted})</option>
            <option value="Qualified">Qualified ({leadStats.qualified})</option>
            <option value="Converted">Converted ({leadStats.converted})</option>
            <option value="Lost">Lost ({leadStats.lost})</option>
          </select>
        </label>

        <label className="search-field">
          <Search />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search leads, values, URL…"
            className="input"
            aria-label="Search leads"
          />
        </label>
      </div>

      {/* Stat strip */}
      <div className="leads-stat-grid">
        <div className="lead-stat-card is-total">
          <span>Total</span>
          <span>{leadStats.total}</span>
        </div>
        <div className="lead-stat-card is-new">
          <span>New</span>
          <span>{leadStats.new}</span>
        </div>
        <div className="lead-stat-card is-contacted">
          <span>Contacted</span>
          <span>{leadStats.contacted}</span>
        </div>
        <div className="lead-stat-card is-qualified">
          <span>Qualified</span>
          <span>{leadStats.qualified}</span>
        </div>
        <div className="lead-stat-card is-converted">
          <span>Converted</span>
          <span>{leadStats.converted}</span>
        </div>
        <div className="lead-stat-card is-lost">
          <span>Lost</span>
          <span>{leadStats.lost}</span>
        </div>
      </div>

      {loadError && (
        <div className="callout tone-red" style={{ marginBottom: '20px' }}>
          <AlertCircle />
          <span>{loadError}</span>
        </div>
      )}

      {/* Table */}
      <div className="table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Chatbot</th>
                {dynamicColumnLabels.length > 0 ? (
                  dynamicColumnLabels.map(label => <th key={label}>{label}</th>)
                ) : (
                  <th>Captured fields</th>
                )}
                <th>Source page</th>
                <th>Sheet sync</th>
                <th className="cell-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={dynamicColumnLabels.length + 5}>
                    <div className="loading-state is-inline">
                      <Loader2 className="animate-spin" />
                      <span>Loading leads…</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={dynamicColumnLabels.length + 5}>
                    <div className="loading-state is-inline">
                      <span>No leads match your current filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const bId = lead.botId || lead.flowId;
                  const bName = botNames[bId] || lead.botName || lead.clientName || 'Chatbot';
                  const fieldEntries = getLeadFieldEntries(lead);
                  const fieldMap = new Map(fieldEntries.map(f => [f.label, f.value]));
                  const syncStatus = lead.googleSheetSyncStatus || 'synced';

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Date & time */}
                      <td>
                        <span className="cell-title block whitespace-nowrap">
                          {lead.submittedAt ? format(new Date(lead.submittedAt), 'MMM d, yyyy') : (lead.timestamp?.toDate ? format(lead.timestamp.toDate(), 'MMM d, yyyy') : 'Recently')}
                        </span>
                        <span className="cell-sub">
                          {lead.submittedAt ? format(new Date(lead.submittedAt), 'HH:mm') : (lead.timestamp?.toDate ? format(lead.timestamp.toDate(), 'HH:mm') : '')}
                        </span>
                      </td>

                      {/* Chatbot */}
                      <td>
                        <span className="tag"><Bot />{bName}</span>
                      </td>

                      {/* Dynamic field values */}
                      {dynamicColumnLabels.length > 0 ? (
                        dynamicColumnLabels.map(label => {
                          const val = String(fieldMap.get(String(label)) ?? '');
                          return (
                            <td key={label} className="max-w-[200px] truncate">
                              {val ? val : <span className="cell-empty">—</span>}
                            </td>
                          );
                        })
                      ) : (
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {fieldEntries.slice(0, 3).map((f, idx) => (
                              <span key={idx} className="tag">{f.label}: {f.value}</span>
                            ))}
                          </div>
                        </td>
                      )}

                      {/* Source URL */}
                      <td className="max-w-[190px] truncate">
                        {lead.sourceUrl ? (
                          <a
                            href={lead.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-accent inline-flex items-center gap-1"
                          >
                            <span className="truncate">{new URL(lead.sourceUrl).hostname || lead.sourceUrl}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="cell-empty">Direct embed</span>
                        )}
                      </td>

                      {/* Sheet sync status */}
                      <td>
                        {syncStatus === 'synced' ? (
                          <span className="status-pill tone-green"><CheckCircle2 />Synced</span>
                        ) : syncStatus === 'failed' ? (
                          <span className="status-pill tone-red"><AlertCircle />Failed</span>
                        ) : (
                          <span className="status-pill tone-yellow"><Clock />Pending</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="cell-right">
                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedLead(lead)}
                            className="button-secondary compact"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingLead(lead)}
                            className="icon-button danger"
                            title="Delete lead"
                          >
                            <Trash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead detail modal */}
      {selectedLead && (
        <div className="modal-backdrop">
          <div className="app-modal is-lg">
            <div className="modal-head">
              <div className="modal-head-main">
                <span className="icon-tile tile-lg"><FileText /></span>
                <div className="min-w-0">
                  <h3>Lead detail</h3>
                  <p className="text-mono truncate">
                    {selectedLead.id} · {botNames[selectedLead.botId || selectedLead.flowId] || selectedLead.botName || selectedLead.clientName || 'Chatbot'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="icon-button"
                aria-label="Close"
              >
                <X />
              </button>
            </div>

            {/* Captured fields */}
            <div className="modal-section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
              <p className="modal-section-title"><Layers />Captured fields</p>
              <div className="lead-detail-grid">
                {getLeadFieldEntries(selectedLead).map((field, idx) => (
                  <div key={idx} className="lead-detail-field">
                    <span>{field.label}</span>
                    <strong>{field.value || <span className="cell-empty">Not provided</span>}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Submission metadata */}
            <div className="modal-section">
              <p className="modal-section-title">Submission metadata</p>
              <dl className="meta-grid">
                <div>
                  <dt>Submitted</dt>
                  <dd>{selectedLead.submittedAt ? new Date(selectedLead.submittedAt).toLocaleString() : 'Recently'}</dd>
                </div>
                <div>
                  <dt>Client / account</dt>
                  <dd className="text-mono">{selectedLead.clientId || selectedLead.ownerId || 'demo_user'}</dd>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt>Source URL</dt>
                  <dd>
                    {selectedLead.sourceUrl ? (
                      <a
                        href={selectedLead.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent text-mono break-all"
                      >
                        {selectedLead.sourceUrl}
                      </a>
                    ) : (
                      <span className="cell-empty">Direct embed widget</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Conversation transcript */}
            {selectedLead.conversationId && (
              <div className="modal-section">
                <div className="sync-row">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="icon-tile tone-blue"><MessageSquare /></span>
                    <div className="min-w-0">
                      <strong className="text-ink block text-[13px] font-semibold">Conversation history</strong>
                      <span className="text-muted text-[12px]">See the exact messages exchanged before capture.</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveConversationId(selectedLead.conversationId || selectedLead.id)}
                    className="button-secondary compact"
                  >
                    <MessageSquare />
                    View transcript
                  </button>
                </div>
              </div>
            )}

            {/* Google Sheets sync */}
            <div className="modal-section">
              <p className="modal-section-title">Google Sheets sync</p>
              <div className="sync-row">
                {selectedLead.googleSheetSyncStatus === 'synced' ? (
                  <span className="status-pill tone-green"><CheckCircle2 />Synced to sheet</span>
                ) : selectedLead.googleSheetSyncStatus === 'failed' ? (
                  <span className="status-pill tone-red"><AlertCircle />Sync failed</span>
                ) : (
                  <span className="status-pill tone-yellow"><Clock />Pending sync</span>
                )}

                <button
                  type="button"
                  onClick={() => handleRetrySync(selectedLead)}
                  disabled={isRetryingSync}
                  className="button-secondary compact"
                >
                  <RefreshCw className={isRetryingSync ? 'animate-spin' : ''} />
                  <span>{isRetryingSync ? 'Retrying…' : 'Retry sync'}</span>
                </button>
              </div>

              {selectedLead.googleSheetSyncError && (
                <div className="callout tone-red" style={{ marginTop: '10px', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span className="text-mono break-all">{selectedLead.googleSheetSyncError}</span>
                  {(selectedLead.googleSheetSyncError.toLowerCase().includes('expired') ||
                    selectedLead.googleSheetSyncError.toLowerCase().includes('re-authorize') ||
                    selectedLead.googleSheetSyncError.toLowerCase().includes('unauthorized') ||
                    selectedLead.googleSheetSyncError.toLowerCase().includes('invalid_grant')) && (
                    <Link to="/integrations" className="button-secondary compact">
                      <RefreshCw />
                      Re-authorize Google account
                    </Link>
                  )}
                </div>
              )}
            </div>

            <div className="modal-actions is-split">
              <button
                type="button"
                onClick={() => {
                  const leadToDelete = selectedLead;
                  setSelectedLead(null);
                  setDeletingLead(leadToDelete);
                }}
                className="button-danger"
              >
                <Trash2 />
                <span>Delete lead</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="button-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingLead && (
        <div className="modal-backdrop">
          <div className="app-modal is-centered">
            <div className="modal-danger-icon">
              <AlertTriangle />
            </div>

            <h3>Delete this lead?</h3>
            <p className="mt-1.5">
              <strong className="text-mono">{deletingLead.id}</strong> will be permanently removed from your
              dashboard and server storage.
            </p>
            <p className="modal-note">This action cannot be undone.</p>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setDeletingLead(null)}
                disabled={isDeletingLead}
                className="button-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteLead}
                disabled={isDeletingLead}
                className="button-danger flex-1"
              >
                {isDeletingLead ? <Loader2 className="animate-spin" /> : <Trash2 />}
                <span>{isDeletingLead ? 'Deleting…' : 'Delete lead'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conversation transcript modal */}
      {activeConversationId && (
        <ConversationViewModal
          conversationId={activeConversationId}
          onClose={() => setActiveConversationId(null)}
          userName={selectedLead?.name || selectedLead?.id}
        />
      )}
    </div>
  );
}
