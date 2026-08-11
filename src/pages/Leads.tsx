import React, { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, where } from 'firebase/firestore'; import { format } from 'date-fns';
import {
  User, Mail, Calendar, ExternalLink, Bot, Download, Filter, Search,
  CheckCircle2, AlertCircle, Clock, RefreshCw, X, Layers, FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
  const [botNames, setBotNames] = useState<Record<string, string>>({});
  const [selectedBotFilter, setSelectedBotFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isRetryingSync, setIsRetryingSync] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const [isSyncingAll, setIsSyncingAll] = useState(false);

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

      // Merge Firestore + Server API leads without duplication
      const leadMap = new Map<string, Lead>();
      serverLeads.forEach(l => leadMap.set(l.id, l));
      firestoreLeads.forEach(l => leadMap.set(l.id, l));

      const mergedLeads = Array.from(leadMap.values());
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
    }, async (error) => {
      console.warn('Leads snapshot error, fetching from server API fallback:', error);
      try {
        const url = isGlobalAdminView ? '/api/leads' : `/api/leads?ownerId=${encodeURIComponent(targetUserId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const sData = await res.json();
          if (sData.success && Array.isArray(sData.leads)) {
            setLeads(sData.leads);
          }
        }
      } catch (e) { }
      setLoading(false);
    });

    return () => unsubscribeLeads();
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

  // Filter leads based on selected bot and search query
  const filteredLeads = leads.filter(lead => {
    const bId = lead.botId || lead.flowId;
    if (selectedBotFilter !== 'ALL' && bId !== selectedBotFilter) {
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
      return bName.includes(q) || fieldMatch || urlMatch || idMatch;
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

  // Retry Google Sheets sync
  const handleRetrySync = async (lead: Lead) => {
    setIsRetryingSync(true);
    try {
      let googleTokens: any = null;
      let spreadsheetId: string | null = null;
      let worksheetName: string = 'Sheet1';

      if (auth.currentUser) {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const uData = docSnap.data();
          googleTokens = uData.googleTokens;
          spreadsheetId = uData.spreadsheetId;
        }
      }

      // Check if bot has dedicated spreadsheetId
      const bId = lead.botId || lead.flowId;
      if (bId) {
        try {
          const botDoc = await getDoc(doc(db, 'bot_configurations', bId));
          if (botDoc.exists() && botDoc.data().spreadsheetId) {
            spreadsheetId = botDoc.data().spreadsheetId;
            if (botDoc.data().worksheetName) worksheetName = botDoc.data().worksheetName;
          }
        } catch { }
      }

      if (!googleTokens || !spreadsheetId) {
        showToast('Please connect Google Account and link a Google Sheet in Integrations first.', 'error');
        setIsRetryingSync(false);
        return;
      }

      const res = await fetch('/api/leads/retry-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          googleTokens,
          spreadsheetId,
          worksheetName
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('🎉 Lead successfully synchronized to Google Sheet!');
        if (selectedLead && selectedLead.id === lead.id) {
          setSelectedLead({
            ...selectedLead,
            googleSheetSyncStatus: 'synced',
            googleSheetSyncError: undefined
          });
        }
        // Refresh local leads list
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, googleSheetSyncStatus: 'synced' } : l));
      } else {
        showToast(data.error || 'Retry sync failed.', 'error');
      }
    } catch (err: any) {
      showToast('Retry sync failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsRetryingSync(false);
    }
  };

  const handleSyncAllExistingLeads = async () => {
    setIsSyncingAll(true);
    try {
      const res = await fetch('/api/leads/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🎉 Processed ${data.processedCount} leads for Google Sheets sync!`);
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
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-2 animate-bounce ${toast.type === 'success'
          ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
          : 'bg-red-900 text-red-100 border-red-700'
          }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Leads Center</h2>
          <p className="text-gray-500 text-sm mt-1">
            Dynamic lead capture dashboard with real-time Google Sheets synchronization status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Bot Filter Dropdown */}
          <div className="flex items-center gap-2 bg-white px-3.5 py-2 border border-gray-200 rounded-xl shadow-2xs">
            <Filter className="w-4 h-4 text-indigo-600" />
            <select
              value={selectedBotFilter}
              onChange={(e) => setSelectedBotFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer"
            >
              <option value="ALL">All Chatbots ({leads.length} leads)</option>
              {uniqueBotsList.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search leads, values, URL..."
              className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 w-48 md:w-64"
            />
          </div>

          {/* Export CSV Button */}
          <button
            onClick={exportLeads}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all shadow-md"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>

          {/* Sync All Existing Leads to Google Sheets Button */}
          <button
            onClick={handleSyncAllExistingLeads}
            disabled={isSyncingAll}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
            {isSyncingAll ? 'Syncing...' : 'Sync All to Google Sheet'}
          </button>

        </div>
      </div>

      {/* Dynamic Table Section */}
      <div className="bg-white rounded-[32px] shadow-xs border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">
                  Submission Date
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">
                  Chatbot
                </th>

                {/* Dynamically Generated Field Columns */}
                {dynamicColumnLabels.length > 0 ? (
                  dynamicColumnLabels.map(label => (
                    <th key={label} className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-700 uppercase tracking-wider">
                      {label}
                    </th>
                  ))
                ) : (
                  <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">
                    Captured Fields
                  </th>
                )}

                <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">
                  Source Page URL
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">
                  Google Sheet Sync
                </th>
                <th className="px-6 py-4 text-right text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={dynamicColumnLabels.length + 5} className="px-8 py-20 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={dynamicColumnLabels.length + 5} className="px-8 py-20 text-center text-gray-400 font-medium">
                    No leads found matching your criteria.
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
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                    >
                      {/* Date & Time */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-900">
                            {lead.submittedAt ? format(new Date(lead.submittedAt), 'MMM d, yyyy') : (lead.timestamp?.toDate ? format(lead.timestamp.toDate(), 'MMM d, yyyy') : 'Recently')}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium">
                            {lead.submittedAt ? format(new Date(lead.submittedAt), 'HH:mm aaa') : (lead.timestamp?.toDate ? format(lead.timestamp.toDate(), 'HH:mm aaa') : '')}
                          </span>
                        </div>
                      </td>

                      {/* Chatbot Name */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-xl w-fit">
                          <Bot className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="text-xs font-bold text-indigo-900">{bName}</span>
                        </div>
                      </td>

                      {/* Dynamic Field Values */}
                      {dynamicColumnLabels.length > 0 ? (
                        dynamicColumnLabels.map(label => {
                          const val = String(fieldMap.get(String(label)) ?? ''); return (
                            <td key={label} className="px-6 py-4 text-xs font-medium text-gray-800 max-w-[200px] truncate">
                              {val ? (
                                <span>{val}</span>
                              ) : (
                                <span className="text-gray-300 italic">-</span>
                              )}
                            </td>
                          );
                        })
                      ) : (
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {fieldEntries.slice(0, 3).map((f, idx) => (
                              <span key={idx} className="text-[10px] bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md font-medium text-gray-700">
                                {f.label}: {f.value}
                              </span>
                            ))}
                          </div>
                        </td>
                      )}

                      {/* Source Page URL */}
                      <td className="px-6 py-4 text-xs font-mono text-gray-500 max-w-[180px] truncate">
                        {lead.sourceUrl ? (
                          <a
                            href={lead.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-indigo-600 hover:underline flex items-center gap-1 font-sans font-bold"
                          >
                            <span>{new URL(lead.sourceUrl).hostname || lead.sourceUrl}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-gray-400 italic">Direct Embed</span>
                        )}
                      </td>

                      {/* Google Sheets Sync Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {syncStatus === 'synced' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Synced
                          </span>
                        ) : syncStatus === 'failed' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-[11px] font-bold">
                            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[11px] font-bold">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLead(lead);
                          }}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-indigo-600 hover:text-white text-gray-700 rounded-xl text-xs font-bold transition-all"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LEAD DETAILS MODAL */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 space-y-6 p-8 relative animate-in fade-in zoom-in-95">
            {/* Close Button */}
            <button
              onClick={() => setSelectedLead(null)}
              className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-4 border-b border-gray-100 pb-5">
              <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                <FileText className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-gray-900">Lead Detail View</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  ID: {selectedLead.id} • Chatbot: {botNames[selectedLead.botId || selectedLead.flowId] || selectedLead.botName || selectedLead.clientName || 'Chatbot'}
                </p>
              </div>
            </div>

            {/* Dynamic Captured Fields List */}
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                Dynamically Captured Lead Fields
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {getLeadFieldEntries(selectedLead).map((field, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-gray-100 space-y-1">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                      {field.label}
                    </span>
                    <span className="text-sm font-bold text-gray-900 break-words block">
                      {field.value || <span className="text-gray-400 italic">Not provided</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Submission Metadata */}
            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-3 text-xs">
              <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">Submission Metadata</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600 font-medium">
                <div>
                  <span className="text-gray-400 font-bold block">Submission Date:</span>
                  <span className="text-gray-900 font-bold">
                    {selectedLead.submittedAt ? new Date(selectedLead.submittedAt).toLocaleString() : 'Recently'}
                  </span>
                </div>

                <div>
                  <span className="text-gray-400 font-bold block">Client / Account ID:</span>
                  <span className="text-gray-900 font-mono font-bold">
                    {selectedLead.clientId || selectedLead.ownerId || 'demo_user'}
                  </span>
                </div>

                <div className="sm:col-span-2">
                  <span className="text-gray-400 font-bold block">Source URL:</span>
                  {selectedLead.sourceUrl ? (
                    <a
                      href={selectedLead.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 font-mono font-bold hover:underline break-all"
                    >
                      {selectedLead.sourceUrl}
                    </a>
                  ) : (
                    <span className="text-gray-500 italic">Direct Embed Widget</span>
                  )}
                </div>
              </div>
            </div>

            {/* Google Sheets Synchronization Status & Retry */}
            <div className="p-5 rounded-2xl border space-y-3 bg-slate-900 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <span className="text-slate-400">Google Sheets Sync Status:</span>
                  {selectedLead.googleSheetSyncStatus === 'synced' ? (
                    <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Synced to Sheet
                    </span>
                  ) : selectedLead.googleSheetSyncStatus === 'failed' ? (
                    <span className="text-red-400 font-extrabold flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" /> Failed Sync
                    </span>
                  ) : (
                    <span className="text-amber-400 font-extrabold flex items-center gap-1">
                      <Clock className="w-4 h-4" /> Pending Sync
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleRetrySync(selectedLead)}
                  disabled={isRetryingSync}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetryingSync ? 'animate-spin' : ''}`} />
                  <span>{isRetryingSync ? 'Retrying...' : 'Retry Google Sheet Sync'}</span>
                </button>
              </div>

              {selectedLead.googleSheetSyncError && (
                <p className="text-xs text-red-300 bg-red-950/60 p-3 rounded-xl border border-red-800 font-mono">
                  Error: {selectedLead.googleSheetSyncError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
