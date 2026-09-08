import React, { useEffect, useMemo, useState } from 'react';
import { db, auth } from '../lib/firebase';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { format } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConversationViewModal from '../components/ConversationViewModal';

interface DynamicField {
  fieldId?: string;
  label: string;
  value: unknown;
}

interface Lead {
  id: string;
  botId?: string;
  flowId?: string;
  clientId?: string;
  ownerId?: string;
  botName?: string;
  flowName?: string;
  clientName?: string;
  name?: string;
  status?: string;
  conversationId?: string;
  fields?: DynamicField[];
  data?: Record<string, unknown>;
  timestamp?: unknown;
  submittedAt?: string;
  sourceUrl?: string;
  googleSheetSyncStatus?: 'synced' | 'pending' | 'failed' | string;
  googleSheetSyncError?: string;
  googleSheetSyncedAt?: string;
}

type Toast = {
  msg: string;
  type: 'success' | 'error';
};

const getTimestampDate = (value: unknown): Date | null => {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

const getLeadDate = (lead: Lead): Date | null => {
  if (lead.submittedAt) {
    const submitted = new Date(lead.submittedAt);
    if (!Number.isNaN(submitted.getTime())) return submitted;
  }

  return getTimestampDate(lead.timestamp);
};

const escapeCsv = (value: unknown): string => {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
};

export default function Leads() {
  const { effectiveUserId, isAdmin, impersonatedClient } = useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [botNames, setBotNames] = useState<Record<string, string>>({});

  const [selectedBotFilter, setSelectedBotFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [isDeletingLead, setIsDeletingLead] = useState(false);
  const [isRetryingSync, setIsRetryingSync] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (msg: string, type: Toast['type'] = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3500);
  };

  const getDeletedLeadIds = (): string[] => {
    try {
      const raw = localStorage.getItem('mintage_deleted_lead_ids');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  };

  const getLocalLeads = (): Lead[] => {
    try {
      const raw = localStorage.getItem('mintage_leads');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as Lead[]) : [];
    } catch {
      return [];
    }
  };

  const getServerLeads = async (
    targetUserId: string,
    isGlobalAdminView: boolean,
  ): Promise<Lead[]> => {
    try {
      const url = isGlobalAdminView
        ? '/api/leads'
        : `/api/leads?ownerId=${encodeURIComponent(targetUserId)}`;

      const response = await fetch(url);

      if (!response.ok) return [];

      const data = await response.json();

      return data?.success && Array.isArray(data.leads) ? (data.leads as Lead[]) : [];
    } catch (error) {
      console.warn('[LEADS_PAGE] Backend leads API warning:', error);
      return [];
    }
  };

  const mergeLeads = (
    localLeads: Lead[],
    serverLeads: Lead[],
    firestoreLeads: Lead[],
  ): Lead[] => {
    const deletedIds = new Set(getDeletedLeadIds());
    const map = new Map<string, Lead>();

    [...localLeads, ...serverLeads, ...firestoreLeads].forEach((lead) => {
      if (!lead?.id || deletedIds.has(lead.id)) return;
      map.set(lead.id, lead);
    });

    return Array.from(map.values());
  };

  const updateBotNames = async (items: Lead[]) => {
    const names: Record<string, string> = {};

    items.forEach((lead) => {
      const botId = lead.botId || lead.flowId;
      const botName = lead.botName || lead.flowName || lead.clientName;

      if (botId && botName) {
        names[botId] = botName;
      }
    });

    const uniqueBotIds = Array.from(
      new Set(items.map((lead) => lead.botId || lead.flowId).filter(Boolean)),
    ) as string[];

    for (const botId of uniqueBotIds) {
      if (names[botId]) continue;

      if (botId.toLowerCase().includes('risinia')) {
        names[botId] = 'Risinia Builders';
        continue;
      }

      if (botId.toLowerCase().includes('river')) {
        names[botId] = 'River Scape Residences';
        continue;
      }

      try {
        const botDoc = await getDoc(doc(db, 'bot_configurations', botId));
        if (botDoc.exists()) {
          const data = botDoc.data();
          if (typeof data.name === 'string' && data.name.trim()) {
            names[botId] = data.name;
          }
        }
      } catch {
        // A missing bot configuration should not prevent the Leads page from loading.
      }
    }

    setBotNames((previous) => ({ ...previous, ...names }));
  };

  const addDeletedLeadIds = (ids: string[]) => {
    const existing = new Set(getDeletedLeadIds());
    ids.forEach((id) => {
      if (id) existing.add(id);
    });
    localStorage.setItem('mintage_deleted_lead_ids', JSON.stringify(Array.from(existing)));
  };

  const removeLeadsFromLocalCache = (ids: string[]) => {
    const idSet = new Set(ids);
    const localLeads = getLocalLeads();
    localStorage.setItem(
      'mintage_leads',
      JSON.stringify(localLeads.filter((lead) => lead?.id && !idSet.has(lead.id))),
    );
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((previous) => {
      const next = new Set(previous);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedLeadIds((previous) => {
      const next = new Set(previous);
      const visibleIds = filteredLeads.map((lead) => lead.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));

      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));

      return next;
    });
  };

  const confirmDeleteLead = async () => {
    if (!deletingLead) return;

    setIsDeletingLead(true);
    const targetId = deletingLead.id;

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Server delete failed (${response.status}).`);
      }

      try {
        await deleteDoc(doc(db, 'leads', targetId));
      } catch (firestoreError) {
        console.warn('[LEADS_PAGE] Firestore delete warning:', firestoreError);
      }

      addDeletedLeadIds([targetId]);
      removeLeadsFromLocalCache([targetId]);
      setLeads((previous) => previous.filter((lead) => lead.id !== targetId));
      setSelectedLeadIds((previous) => {
        const next = new Set(previous);
        next.delete(targetId);
        return next;
      });

      if (selectedLead?.id === targetId) setSelectedLead(null);
      setDeletingLead(null);
      showToast('Lead deleted permanently.');
    } catch (error) {
      console.error('[LEADS_PAGE] Error deleting lead:', error);
      showToast(
        `Failed to delete lead: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsDeletingLead(false);
    }
  };

  const confirmBulkDelete = async () => {
    const targetIds = Array.from(selectedLeadIds);
    if (targetIds.length === 0) return;

    setIsDeletingBulk(true);

    try {
      const response = await fetch('/api/leads/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Bulk delete failed (${response.status}).`);
      }

      const deletedIds: string[] = Array.isArray(data.deletedIds)
        ? data.deletedIds.filter((id: unknown): id is string => typeof id === 'string')
        : [];

      if (deletedIds.length > 0) {
        // Keep this client-side Firestore cleanup as a second layer. The server is
        // the source of truth, while this prevents stale snapshot data reappearing.
        await Promise.allSettled(
          deletedIds.map((id) => deleteDoc(doc(db, 'leads', id))),
        );

        addDeletedLeadIds(deletedIds);
        removeLeadsFromLocalCache(deletedIds);
        const deletedSet = new Set(deletedIds);
        setLeads((previous) => previous.filter((lead) => !deletedSet.has(lead.id)));
        setSelectedLeadIds((previous) => {
          const next = new Set(previous);
          deletedIds.forEach((id) => next.delete(id));
          return next;
        });
      }

      setIsBulkDeleteConfirmOpen(false);

      if (data.failedCount > 0) {
        showToast(
          `${data.deletedCount || 0} deleted. ${data.failedCount} could not be deleted.`,
          data.deletedCount > 0 ? 'success' : 'error',
        );
      } else {
        showToast(`${data.deletedCount || deletedIds.length} leads deleted permanently.`);
      }
    } catch (error) {
      console.error('[LEADS_PAGE] Bulk delete error:', error);
      showToast(
        `Failed to delete selected leads: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsDeletingBulk(false);
    }
  };

  useEffect(() => {
    const targetUserId = effectiveUserId || auth.currentUser?.uid;

    if (!targetUserId && !isAdmin) {
      setLeads([]);
      setLoading(false);
      return;
    }

    const resolvedUserId = targetUserId || 'demo_user';
    const isGlobalAdminView = isAdmin && !impersonatedClient;

    setLoading(true);
    setLoadError(null);

    let cancelled = false;

    const refreshServerLeads = async () => {
      const serverLeads = await getServerLeads(
        resolvedUserId,
        isGlobalAdminView,
      );

      if (cancelled || serverLeads.length === 0) return;

      const deletedIds = new Set(getDeletedLeadIds());

      setLeads((previous) => {
        const map = new Map<string, Lead>();

        previous.forEach((lead) => {
          if (lead?.id && !deletedIds.has(lead.id)) {
            map.set(lead.id, lead);
          }
        });

        serverLeads.forEach((lead) => {
          if (lead?.id && !deletedIds.has(lead.id)) {
            map.set(lead.id, lead);
          }
        });

        return Array.from(map.values());
      });
    };

    const unsubscribe = onSnapshot(
      collection(db, 'leads'),
      async (snapshot) => {
        if (cancelled) return;

        let firestoreLeads = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        })) as Lead[];

        let userBotIds: string[] = [];

        try {
          const botSnapshot = await getDocs(collection(db, 'bot_configurations'));

          userBotIds = botSnapshot.docs
            .filter((botDoc) => {
              const data = botDoc.data();
              return (
                data.createdBy === resolvedUserId ||
                data.clientId === resolvedUserId ||
                data.ownerId === resolvedUserId
              );
            })
            .map((botDoc) => botDoc.id);
        } catch (error) {
          console.warn('[LEADS_PAGE] Bot configuration lookup warning:', error);
        }

        if (!isGlobalAdminView) {
          firestoreLeads = firestoreLeads.filter((lead) => {
            return (
              lead.clientId === resolvedUserId ||
              lead.ownerId === resolvedUserId ||
              userBotIds.includes(lead.botId || '') ||
              userBotIds.includes(lead.flowId || '') ||
              lead.clientId === 'demo_user' ||
              lead.ownerId === 'demo_user' ||
              resolvedUserId === 'demo_user'
            );
          });
        }

        const serverLeads = await getServerLeads(
          resolvedUserId,
          isGlobalAdminView,
        );

        if (cancelled) return;

        const mergedLeads = mergeLeads(
          getLocalLeads(),
          serverLeads,
          firestoreLeads,
        );

        setLeads(mergedLeads);
        setLoading(false);
        setLoadError(null);

        await updateBotNames(mergedLeads);
      },
      async (error) => {
        console.error('[LEADS_PAGE] Firestore snapshot error:', error);

        const serverLeads = await getServerLeads(
          resolvedUserId,
          isGlobalAdminView,
        );

        if (cancelled) return;

        if (serverLeads.length > 0) {
          const deletedIds = new Set(getDeletedLeadIds());
          setLeads(
            serverLeads.filter(
              (lead) => lead?.id && !deletedIds.has(lead.id),
            ),
          );
          setLoadError(null);
        } else {
          setLoadError(
            'Unable to load leads. Please check your network connection.',
          );
        }

        setLoading(false);
      },
    );

    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        if (event.data && !event.data.startsWith(':')) {
          void refreshServerLeads();
        }
      };

      eventSource.onerror = () => {
        // SSE is only an enhancement; polling below remains active.
      };
    } catch (error) {
      console.warn('[LEADS_PAGE] SSE unavailable:', error);
    }

    const handleCustomLead = () => {
      void refreshServerLeads();
    };

    window.addEventListener('mintage_lead_captured', handleCustomLead);

    const pollInterval = window.setInterval(() => {
      void refreshServerLeads();
    }, 5000);

    return () => {
      cancelled = true;
      unsubscribe();
      eventSource?.close();
      window.removeEventListener('mintage_lead_captured', handleCustomLead);
      window.clearInterval(pollInterval);
    };
  }, [effectiveUserId, isAdmin, impersonatedClient]);

  const getLeadFieldEntries = (
    lead: Lead,
  ): Array<{ label: string; value: string }> => {
    const map = new Map<string, string>();

    if (Array.isArray(lead.fields)) {
      lead.fields.forEach((field) => {
        if (field?.label) {
          map.set(
            String(field.label).trim(),
            field.value === undefined || field.value === null
              ? ''
              : String(field.value),
          );
        }
      });
    }

    if (lead.data && typeof lead.data === 'object') {
      Object.entries(lead.data).forEach(([key, value]) => {
        const cleanKey = key.trim();

        const ignoredKeys = new Set([
          'id',
          'botId',
          'flowId',
          'clientId',
          'ownerId',
          'botName',
          'flowName',
          'clientName',
          'fields',
          'sourceUrl',
          'submittedAt',
          'timestamp',
          'googleSheetSyncStatus',
          'googleSheetSyncError',
          'googleSheetSyncedAt',
        ]);

        if (ignoredKeys.has(cleanKey)) return;

        let prettyLabel = cleanKey;

        if (cleanKey === 'name' || cleanKey === 'full_name') {
          prettyLabel = 'Name';
        } else if (cleanKey === 'phone' || cleanKey === 'phone_number') {
          prettyLabel = 'Phone Number';
        } else if (cleanKey === 'email' || cleanKey === 'email_address') {
          prettyLabel = 'Email';
        }

        if (!map.has(prettyLabel)) {
          map.set(
            prettyLabel,
            value === undefined || value === null ? '' : String(value),
          );
        }
      });
    }

    return Array.from(map.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  };

  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    try {
      const response = await fetch('/api/leads/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          status: newStatus,
          updatedBy: auth.currentUser?.email || 'client',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast(data?.error || 'Failed to update status.', 'error');
        return;
      }

      setLeads((previous) =>
        previous.map((lead) =>
          lead.id === leadId ? { ...lead, status: newStatus } : lead,
        ),
      );

      setSelectedLead((previous) =>
        previous?.id === leadId
          ? { ...previous, status: newStatus }
          : previous,
      );

      showToast(`Lead status updated to "${newStatus}".`);
    } catch (error) {
      showToast(
        `Error updating status: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
        'error',
      );
    }
  };

  const handleRetrySync = async (lead: Lead) => {
    setIsRetryingSync(true);

    try {
      const response = await fetch('/api/leads/retry-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.success) {
        showToast('Lead successfully synchronized to Google Sheet.');

        setLeads((previous) =>
          previous.map((item) =>
            item.id === lead.id
              ? {
                ...item,
                googleSheetSyncStatus: 'synced',
                googleSheetSyncError: undefined,
              }
              : item,
          ),
        );

        setSelectedLead((previous) =>
          previous?.id === lead.id
            ? {
              ...previous,
              googleSheetSyncStatus: 'synced',
              googleSheetSyncError: undefined,
            }
            : previous,
        );
      } else {
        const errorMessage = data?.error || 'Retry sync failed.';

        showToast(errorMessage, 'error');

        setSelectedLead((previous) =>
          previous?.id === lead.id
            ? {
              ...previous,
              googleSheetSyncStatus: 'failed',
              googleSheetSyncError: errorMessage,
            }
            : previous,
        );
      }
    } catch (error) {
      showToast(
        `Retry sync failed: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
        'error',
      );
    } finally {
      setIsRetryingSync(false);
    }
  };

  const handleSyncAllExistingLeads = async () => {
    setIsSyncingAll(true);

    const targetUserId =
      effectiveUserId || auth.currentUser?.uid || 'demo_user';

    try {
      const response = await fetch('/api/leads/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: targetUserId }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.success) {
        showToast(
          `Synced ${data.synced || 0} leads to Google Sheet (${data.skipped || 0} already synced).`,
        );

        window.setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast(
          data?.error || 'Failed to sync existing leads.',
          'error',
        );
      }
    } catch (error) {
      showToast(
        `Error syncing existing leads: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
        'error',
      );
    } finally {
      setIsSyncingAll(false);
    }
  };

  const leadStats = useMemo(
    () => ({
      total: leads.length,
      new: leads.filter((lead) => (lead.status || 'New') === 'New').length,
      contacted: leads.filter((lead) => lead.status === 'Contacted').length,
      qualified: leads.filter((lead) => lead.status === 'Qualified').length,
      converted: leads.filter((lead) => lead.status === 'Converted').length,
      lost: leads.filter((lead) => lead.status === 'Lost').length,
    }),
    [leads],
  );

  useEffect(() => {
    const visibleIds = new Set(leads.map((lead) => lead.id));
    setSelectedLeadIds((previous) => {
      const next = new Set(Array.from(previous).filter((id) => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return leads.filter((lead) => {
      const botId = lead.botId || lead.flowId || '';
      const currentStatus = lead.status || 'New';

      if (selectedBotFilter !== 'ALL' && botId !== selectedBotFilter) {
        return false;
      }

      if (
        selectedStatusFilter !== 'ALL' &&
        currentStatus !== selectedStatusFilter
      ) {
        return false;
      }

      if (!query) return true;

      const botName = (
        botNames[botId] ||
        lead.botName ||
        lead.flowName ||
        lead.clientName ||
        ''
      ).toLowerCase();

      const fieldMatch = getLeadFieldEntries(lead).some(
        (field) =>
          field.label.toLowerCase().includes(query) ||
          field.value.toLowerCase().includes(query),
      );

      const urlMatch = (lead.sourceUrl || '').toLowerCase().includes(query);
      const idMatch = lead.id.toLowerCase().includes(query);
      const statusMatch = currentStatus.toLowerCase().includes(query);

      return (
        botName.includes(query) ||
        fieldMatch ||
        urlMatch ||
        idMatch ||
        statusMatch
      );
    });
  }, [
    leads,
    searchQuery,
    selectedBotFilter,
    selectedStatusFilter,
    botNames,
  ]);

  const dynamicColumnLabels = useMemo(
    () =>
      Array.from(
        new Set(
          filteredLeads.flatMap((lead) =>
            getLeadFieldEntries(lead).map((field) => field.label),
          ),
        ),
      ),
    [filteredLeads],
  );

  const uniqueBotsList = useMemo(() => {
    return Array.from(
      new Set(
        leads
          .map((lead) => lead.botId || lead.flowId)
          .filter((id): id is string => Boolean(id)),
      ),
    ).map((id) => ({
      id,
      name: botNames[id] || id,
    }));
  }, [leads, botNames]);

  const exportLeads = () => {
    const headers = [
      'Date',
      'Lead ID',
      'Bot Name',
      ...dynamicColumnLabels,
      'Source URL',
      'Google Sheet Sync',
      'Status',
    ];

    const rows = filteredLeads.map((lead) => {
      const fieldMap = new Map(
        getLeadFieldEntries(lead).map((field) => [
          field.label,
          field.value,
        ]),
      );

      const date = getLeadDate(lead);
      const dateString = date ? format(date, 'yyyy-MM-dd HH:mm') : '';

      const botName =
        botNames[lead.botId || lead.flowId || ''] ||
        lead.botName ||
        lead.flowName ||
        lead.clientName ||
        'Chatbot';

      return [
        escapeCsv(dateString),
        escapeCsv(lead.id),
        escapeCsv(botName),
        ...dynamicColumnLabels.map((label) =>
          escapeCsv(fieldMap.get(label) || ''),
        ),
        escapeCsv(lead.sourceUrl || ''),
        escapeCsv(lead.googleSheetSyncStatus || 'synced'),
        escapeCsv(lead.status || 'New'),
      ].join(',');
    });

    const csvContent = [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `mintage_leads_${format(new Date(), 'yyyy_MM_dd')}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="leads-page workspace-page workspace-page--wide">
      {toast && (
        <div
          className={`toast ${toast.type === 'success' ? 'is-success' : 'is-error'
            }`}
          role="status"
        >
          {toast.type === 'success' ? <CheckCircle2 /> : <AlertCircle />}
          <span>{toast.msg}</span>
        </div>
      )}

      <header className="page-heading">
        <div>
          <div className="eyebrow-row">
            <span className="eyebrow">Lead database</span>
            <span className="status-pill status-live">
              <span />
              Live
            </span>
          </div>

          <h2>Leads</h2>
          <p>
            Every captured submission, its source page, and its Google Sheets
            sync state.
          </p>
        </div>

        <div className="page-actions">
          {selectedLeadIds.size > 0 && (
            <>
              <button
                type="button"
                onClick={() => setSelectedLeadIds(new Set())}
                className="button-secondary"
              >
                Clear selection ({selectedLeadIds.size})
              </button>
              <button
                type="button"
                onClick={() => setIsBulkDeleteConfirmOpen(true)}
                className="button-danger"
                disabled={isDeletingBulk}
              >
                <Trash2 />
                Delete selected ({selectedLeadIds.size})
              </button>
            </>
          )}

          <button
            type="button"
            onClick={exportLeads}
            className="button-secondary"
          >
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

      <div className="leads-control-bar">
        <label className="inline-select">
          <Bot />
          <select
            value={selectedBotFilter}
            onChange={(event) => setSelectedBotFilter(event.target.value)}
            aria-label="Filter by chatbot"
          >
            <option value="ALL">All chatbots ({leads.length})</option>
            {uniqueBotsList.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-select">
          <Tag />
          <select
            value={selectedStatusFilter}
            onChange={(event) => setSelectedStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses ({leads.length})</option>
            <option value="New">New ({leadStats.new})</option>
            <option value="Contacted">
              Contacted ({leadStats.contacted})
            </option>
            <option value="Qualified">
              Qualified ({leadStats.qualified})
            </option>
            <option value="Converted">
              Converted ({leadStats.converted})
            </option>
            <option value="Lost">Lost ({leadStats.lost})</option>
          </select>
        </label>

        <label className="search-field">
          <Search />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search leads, values, URL…"
            className="input"
            aria-label="Search leads"
          />
        </label>
      </div>

      <div className="leads-stat-grid">
        <div className="lead-stat-card is-total">
          <span>Total</span>
          <strong>{leadStats.total}</strong>
        </div>

        <div className="lead-stat-card is-new">
          <span>New</span>
          <strong>{leadStats.new}</strong>
        </div>

        <div className="lead-stat-card is-contacted">
          <span>Contacted</span>
          <strong>{leadStats.contacted}</strong>
        </div>

        <div className="lead-stat-card is-qualified">
          <span>Qualified</span>
          <strong>{leadStats.qualified}</strong>
        </div>

        <div className="lead-stat-card is-converted">
          <span>Converted</span>
          <strong>{leadStats.converted}</strong>
        </div>

        <div className="lead-stat-card is-lost">
          <span>Lost</span>
          <strong>{leadStats.lost}</strong>
        </div>
      </div>

      {loadError && (
        <div
          className="callout tone-red"
          style={{ marginBottom: '20px' }}
        >
          <AlertCircle />
          <span>{loadError}</span>
        </div>
      )}

      <div className="table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '48px' }}>
                  <input
                    type="checkbox"
                    checked={filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.has(lead.id))}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible leads"
                  />
                </th>
                <th>Submitted</th>
                <th>Chatbot</th>

                {dynamicColumnLabels.length > 0 ? (
                  dynamicColumnLabels.map((label) => (
                    <th key={label}>{label}</th>
                  ))
                ) : (
                  <th>Captured fields</th>
                )}

                <th>Source page</th>
                <th>Status</th>
                <th>Sheet sync</th>
                <th className="cell-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={dynamicColumnLabels.length + 7}>
                    <div className="loading-state is-inline">
                      <Loader2 className="animate-spin" />
                      <span>Loading leads…</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={dynamicColumnLabels.length + 7}>
                    <div className="loading-state is-inline">
                      <span>No leads match your current filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const botId = lead.botId || lead.flowId || '';
                  const botName =
                    botNames[botId] ||
                    lead.botName ||
                    lead.flowName ||
                    lead.clientName ||
                    'Chatbot';

                  const fieldEntries = getLeadFieldEntries(lead);
                  const fieldMap = new Map(
                    fieldEntries.map((field) => [
                      field.label,
                      field.value,
                    ]),
                  );

                  const syncStatus =
                    lead.googleSheetSyncStatus || 'synced';
                  const currentStatus = lead.status || 'New';
                  const date = getLeadDate(lead);

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          aria-label={`Select lead ${lead.id}`}
                        />
                      </td>

                      <td>
                        <span className="cell-title block whitespace-nowrap">
                          {date ? format(date, 'MMM d, yyyy') : 'Recently'}
                        </span>
                        <span className="cell-sub">
                          {date ? format(date, 'HH:mm') : ''}
                        </span>
                      </td>

                      <td>
                        <span className="tag">
                          <Bot />
                          {botName}
                        </span>
                      </td>

                      {dynamicColumnLabels.length > 0 ? (
                        dynamicColumnLabels.map((label) => {
                          const value = String(fieldMap.get(label) ?? '');

                          return (
                            <td
                              key={label}
                              className="max-w-[200px] truncate"
                            >
                              {value || (
                                <span className="cell-empty">—</span>
                              )}
                            </td>
                          );
                        })
                      ) : (
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {fieldEntries.slice(0, 3).map((field, index) => (
                              <span
                                key={`${field.label}-${index}`}
                                className="tag"
                              >
                                {field.label}: {field.value}
                              </span>
                            ))}
                            {fieldEntries.length === 0 && (
                              <span className="cell-empty">No fields</span>
                            )}
                          </div>
                        </td>
                      )}

                      <td className="max-w-[190px] truncate">
                        {lead.sourceUrl ? (
                          <a
                            href={lead.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="text-accent inline-flex items-center gap-1"
                          >
                            <span className="truncate">
                              {(() => {
                                try {
                                  return new URL(lead.sourceUrl).hostname;
                                } catch {
                                  return lead.sourceUrl;
                                }
                              })()}
                            </span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="cell-empty">Direct embed</span>
                        )}
                      </td>

                      <td onClick={(event) => event.stopPropagation()}>
                        <select
                          value={currentStatus}
                          onChange={(event) =>
                            void handleUpdateStatus(
                              lead.id,
                              event.target.value,
                            )
                          }
                          className="input"
                          aria-label={`Update status for ${lead.id}`}
                        >
                          <option value="New">New</option>
                          <option value="Contacted">Contacted</option>
                          <option value="Qualified">Qualified</option>
                          <option value="Converted">Converted</option>
                          <option value="Lost">Lost</option>
                        </select>
                      </td>

                      <td>
                        {syncStatus === 'synced' ? (
                          <span className="status-pill tone-green">
                            <CheckCircle2 />
                            Synced
                          </span>
                        ) : syncStatus === 'failed' ? (
                          <span className="status-pill tone-red">
                            <AlertCircle />
                            Failed
                          </span>
                        ) : (
                          <span className="status-pill tone-yellow">
                            <Clock />
                            Pending
                          </span>
                        )}
                      </td>

                      <td className="cell-right">
                        <div
                          className="row-actions"
                          onClick={(event) => event.stopPropagation()}
                        >
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
                            aria-label="Delete lead"
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

      {selectedLead && (
        <div className="modal-backdrop">
          <div
            className="app-modal is-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-detail-title"
          >
            <div className="modal-head">
              <div className="modal-head-main">
                <span className="icon-tile tile-lg">
                  <FileText />
                </span>

                <div className="min-w-0">
                  <h3 id="lead-detail-title">Lead detail</h3>
                  <p className="text-mono truncate">
                    {selectedLead.id} ·{' '}
                    {botNames[
                      selectedLead.botId || selectedLead.flowId || ''
                    ] ||
                      selectedLead.botName ||
                      selectedLead.flowName ||
                      selectedLead.clientName ||
                      'Chatbot'}
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

            <div
              className="modal-section"
              style={{
                borderTop: 0,
                marginTop: 0,
                paddingTop: 0,
              }}
            >
              <p className="modal-section-title">
                <Layers />
                Captured fields
              </p>

              <div className="lead-detail-grid">
                {getLeadFieldEntries(selectedLead).length > 0 ? (
                  getLeadFieldEntries(selectedLead).map((field, index) => (
                    <div
                      key={`${field.label}-${index}`}
                      className="lead-detail-field"
                    >
                      <span>{field.label}</span>
                      <strong>
                        {field.value || (
                          <span className="cell-empty">Not provided</span>
                        )}
                      </strong>
                    </div>
                  ))
                ) : (
                  <span className="cell-empty">No captured fields.</span>
                )}
              </div>
            </div>

            <div className="modal-section">
              <p className="modal-section-title">Submission metadata</p>

              <dl className="meta-grid">
                <div>
                  <dt>Submitted</dt>
                  <dd>
                    {(() => {
                      const date = getLeadDate(selectedLead);
                      return date ? date.toLocaleString() : 'Recently';
                    })()}
                  </dd>
                </div>

                <div>
                  <dt>Client / account</dt>
                  <dd className="text-mono">
                    {selectedLead.clientId ||
                      selectedLead.ownerId ||
                      'demo_user'}
                  </dd>
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
                      <span className="cell-empty">
                        Direct embed widget
                      </span>
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Status</dt>
                  <dd>{selectedLead.status || 'New'}</dd>
                </div>
              </dl>
            </div>

            {selectedLead.conversationId && (
              <div className="modal-section">
                <div className="sync-row">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="icon-tile tone-blue">
                      <MessageSquare />
                    </span>

                    <div className="min-w-0">
                      <strong className="text-ink block text-[13px] font-semibold">
                        Conversation history
                      </strong>
                      <span className="text-muted text-[12px]">
                        See the exact messages exchanged before capture.
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveConversationId(
                        selectedLead.conversationId || selectedLead.id,
                      )
                    }
                    className="button-secondary compact"
                  >
                    <MessageSquare />
                    View transcript
                  </button>
                </div>
              </div>
            )}

            <div className="modal-section">
              <p className="modal-section-title">Google Sheets sync</p>

              <div className="sync-row">
                {selectedLead.googleSheetSyncStatus === 'synced' ? (
                  <span className="status-pill tone-green">
                    <CheckCircle2 />
                    Synced to sheet
                  </span>
                ) : selectedLead.googleSheetSyncStatus === 'failed' ? (
                  <span className="status-pill tone-red">
                    <AlertCircle />
                    Sync failed
                  </span>
                ) : (
                  <span className="status-pill tone-yellow">
                    <Clock />
                    Pending sync
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => void handleRetrySync(selectedLead)}
                  disabled={isRetryingSync}
                  className="button-secondary compact"
                >
                  <RefreshCw
                    className={isRetryingSync ? 'animate-spin' : ''}
                  />
                  <span>
                    {isRetryingSync ? 'Retrying…' : 'Retry sync'}
                  </span>
                </button>
              </div>

              {selectedLead.googleSheetSyncError && (
                <div
                  className="callout tone-red"
                  style={{
                    marginTop: '10px',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  }}
                >
                  <span className="text-mono break-all">
                    {selectedLead.googleSheetSyncError}
                  </span>

                  {(() => {
                    const errorText =
                      selectedLead.googleSheetSyncError.toLowerCase();

                    const needsReauthorization =
                      errorText.includes('expired') ||
                      errorText.includes('re-authorize') ||
                      errorText.includes('unauthorized') ||
                      errorText.includes('invalid_grant');

                    return needsReauthorization ? (
                      <Link
                        to="/integrations"
                        className="button-secondary compact"
                      >
                        <RefreshCw />
                        Re-authorize Google account
                      </Link>
                    ) : null;
                  })()}
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

      {deletingLead && (
        <div className="modal-backdrop">
          <div
            className="app-modal is-centered"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-lead-title"
          >
            <div className="modal-danger-icon">
              <AlertTriangle />
            </div>

            <h3 id="delete-lead-title">Delete this lead?</h3>

            <p className="mt-1.5">
              <strong className="text-mono">{deletingLead.id}</strong> will be
              permanently removed from your dashboard and server storage.
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
                onClick={() => void confirmDeleteLead()}
                disabled={isDeletingLead}
                className="button-danger flex-1"
              >
                {isDeletingLead ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                <span>
                  {isDeletingLead ? 'Deleting…' : 'Delete lead'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isBulkDeleteConfirmOpen && (
        <div className="modal-backdrop">
          <div
            className="app-modal is-centered"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-leads-title"
          >
            <div className="modal-danger-icon">
              <AlertTriangle />
            </div>

            <h3 id="bulk-delete-leads-title">Delete selected leads?</h3>
            <p className="mt-1.5">
              You are about to permanently delete <strong>{selectedLeadIds.size}</strong> selected lead{selectedLeadIds.size === 1 ? '' : 's'}.
            </p>
            <p className="modal-note">This action cannot be undone.</p>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                disabled={isDeletingBulk}
                className="button-secondary flex-1"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void confirmBulkDelete()}
                disabled={isDeletingBulk || selectedLeadIds.size === 0}
                className="button-danger flex-1"
              >
                {isDeletingBulk ? <Loader2 className="animate-spin" /> : <Trash2 />}
                <span>{isDeletingBulk ? 'Deleting…' : 'Delete selected'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
