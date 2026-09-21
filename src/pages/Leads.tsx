import React, { useEffect, useMemo, useState } from 'react';
import { db, auth } from '../lib/firebase';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
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
  Filter,
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
  project?: string;
  selectedProject?: string;
  projectName?: string;
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

const getLeadProject = (lead: Lead): string => {
  const direct = lead.project || lead.selectedProject || lead.projectName;
  if (direct) return String(direct).trim();

  const data = lead.data && typeof lead.data === 'object' ? lead.data : {};
  const dataProject =
    data.selectedProject ??
    data.project ??
    data.projectName ??
    data['Selected Project'] ??
    data['Project'];
  if (dataProject) return String(dataProject).trim();

  if (Array.isArray(lead.fields)) {
    const projectField = lead.fields.find((field) =>
      /\b(project|property|community|development|residence|residential)\b/i.test(String(field?.label || '')),
    );
    if (projectField?.value) return String(projectField.value).trim();
  }

  return '';
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
  // Project filter options come only from dedicated Project nodes in each flow.
  // Normal Single Choice / Multiple Choice options are intentionally ignored.
  const [flowProjectOptions, setFlowProjectOptions] = useState<Record<string, string[]>>({});

  const [selectedBotFilter, setSelectedBotFilter] = useState('ALL');
  const [selectedClientFilter, setSelectedClientFilter] = useState('ALL');
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; name: string; company?: string }>>([]);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Advanced lead filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('ALL');
  const [nameFilter, setNameFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [bookVisitFrom, setBookVisitFrom] = useState('');
  const [bookVisitTo, setBookVisitTo] = useState('');
  const [selectedSyncFilter, setSelectedSyncFilter] = useState('ALL');

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [isDeletingLead, setIsDeletingLead] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isRetryingSync, setIsRetryingSync] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (msg: string, type: Toast['type'] = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3500);
  };

  const authorizedFetch = async (url: string, options: RequestInit = {}) => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  useEffect(() => {
    if (!isAdmin || impersonatedClient) {
      setClientOptions([]);
      setSelectedClientFilter('ALL');
      return;
    }

    let cancelled = false;
    getDocs(collection(db, 'clients')).then((snapshot) => {
      if (cancelled) return;
      const options = snapshot.docs.map((clientDoc) => {
        const data = clientDoc.data();
        return {
          id: clientDoc.id,
          name: String(data.name || data.company || data.email || clientDoc.id),
          company: String(data.company || ''),
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      setClientOptions(options);
    }).catch((error) => {
      console.warn('[LEADS_PAGE] Client filter load warning:', error);
    });

    return () => { cancelled = true; };
  }, [isAdmin, impersonatedClient]);

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

      const response = await authorizedFetch(url);

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
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));

      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }

      return next;
    });
  };

  const confirmDeleteSelectedLeads = async () => {
    const targetIds = Array.from(selectedLeadIds);
    if (targetIds.length === 0) return;

    setIsDeletingBulk(true);
    try {
      const response = await authorizedFetch('/api/leads/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete selected leads.');
      }

      const deletedIds: string[] = Array.isArray(data.deletedIds)
        ? data.deletedIds.map((id: unknown) => String(id))
        : targetIds;

      const localDeletedIds = getDeletedLeadIds();
      const mergedDeletedIds = Array.from(new Set([...localDeletedIds, ...deletedIds]));
      localStorage.setItem('mintage_deleted_lead_ids', JSON.stringify(mergedDeletedIds));

      const localLeads = getLocalLeads();
      localStorage.setItem(
        'mintage_leads',
        JSON.stringify(localLeads.filter((lead) => !deletedIds.includes(lead?.id || ''))),
      );

      setLeads((previous) => previous.filter((lead) => !deletedIds.includes(lead.id)));
      setSelectedLeadIds(new Set());
      setIsBulkDeleteConfirmOpen(false);

      const failedCount = Array.isArray(data.failed) ? data.failed.length : 0;
      showToast(
        failedCount > 0
          ? `${deletedIds.length} leads deleted. ${failedCount} could not be deleted.`
          : `${deletedIds.length} leads deleted permanently.`,
        failedCount > 0 ? 'error' : 'success',
      );
    } catch (error) {
      console.error('[LEADS_PAGE] Bulk delete error:', error);
      showToast(
        `Failed to delete selected leads: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
        'error',
      );
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const confirmDeleteLead = async () => {
    if (!deletingLead) return;

    setIsDeletingLead(true);
    const targetId = deletingLead.id;

    try {
      // Delete from the server APIs. Failure here is tolerated because Firestore
      // and the local blacklist are also updated below.
      try {
        await authorizedFetch(`/api/leads/${encodeURIComponent(targetId)}`, {
          method: 'DELETE',
        });

        await authorizedFetch('/api/leads/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: targetId }),
        });
      } catch (apiError) {
        console.warn('[LEADS_PAGE] Server delete warning:', apiError);
      }

      // Delete from Firestore.
      try {
        await deleteDoc(doc(db, 'leads', targetId));
      } catch (firestoreError) {
        console.warn('[LEADS_PAGE] Firestore delete warning:', firestoreError);
      }

      // Persist a local blacklist so a stale API/cache record cannot reappear.
      const deletedIds = getDeletedLeadIds();

      if (!deletedIds.includes(targetId)) {
        deletedIds.push(targetId);
        localStorage.setItem(
          'mintage_deleted_lead_ids',
          JSON.stringify(deletedIds),
        );
      }

      // Remove the lead from the local cache.
      const localLeads = getLocalLeads();
      localStorage.setItem(
        'mintage_leads',
        JSON.stringify(localLeads.filter((lead) => lead?.id !== targetId)),
      );

      setLeads((previous) => previous.filter((lead) => lead.id !== targetId));

      if (selectedLead?.id === targetId) {
        setSelectedLead(null);
      }

      setDeletingLead(null);
      setSelectedLeadIds((previous) => {
        const next = new Set(previous);
        next.delete(targetId);
        return next;
      });
      showToast('Lead deleted permanently.');
    } catch (error) {
      console.error('[LEADS_PAGE] Error deleting lead:', error);
      showToast(
        `Failed to delete lead: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
        'error',
      );
    } finally {
      setIsDeletingLead(false);
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

    // Clients query only their own tenant. Admins may query all tenants.
    // This query shape is important because Firestore security rules reject an
    // unscoped collection query for a client even if the UI later filters it.
    const leadsQuery = isGlobalAdminView
      ? query(collection(db, 'leads'))
      : query(collection(db, 'leads'), where('ownerId', '==', resolvedUserId));

    const unsubscribe = onSnapshot(
      leadsQuery,
      async (snapshot) => {
        if (cancelled) return;

        let firestoreLeads = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        })) as Lead[];

        let userBotIds: string[] = [];

        try {
          const botSnapshot = await getDocs(collection(db, 'bot_configurations'));

          const allowedBotDocs = botSnapshot.docs.filter((botDoc) => {
            if (isGlobalAdminView) return true;

            const data = botDoc.data();
            return (
              data.createdBy === resolvedUserId ||
              data.clientId === resolvedUserId ||
              data.ownerId === resolvedUserId
            );
          });

          userBotIds = allowedBotDocs.map((botDoc) => botDoc.id);

          // IMPORTANT: Only the dedicated Project component contributes to the
          // dashboard Project filter. A Multiple Choice / Single Choice node,
          // even if its question happens to mention a project, must not add its
          // options here.
          const projectMap: Record<string, string[]> = {};

          allowedBotDocs.forEach((botDoc) => {
            const data = botDoc.data() || {};
            const rawNodes = Array.isArray(data.nodes)
              ? data.nodes
              : (data.nodes && typeof data.nodes === 'object' ? Object.values(data.nodes) : []);

            const projects: string[] = [];
            rawNodes.forEach((node: any) => {
              const type = String(node?.type || node?.data?.componentType || '').trim().toLowerCase();
              const isDedicatedProjectNode =
                type === 'project' ||
                node?.data?.isProjectSelection === true ||
                node?.data?.projectSelector === true ||
                node?.data?.projectField === true;

              if (!isDedicatedProjectNode) return;

              const choices = Array.isArray(node?.data?.choices) ? node.data.choices : [];
              choices.forEach((choice: any) => {
                const value = typeof choice === 'string'
                  ? choice.trim()
                  : String(choice?.label || choice?.value || choice?.text || '').trim();

                if (!value) return;
                if (!projects.some((project) => project.toLowerCase() === value.toLowerCase())) {
                  projects.push(value);
                }
              });
            });

            projectMap[botDoc.id] = projects.sort((a, b) => a.localeCompare(b));
          });

          setFlowProjectOptions(projectMap);
        } catch (error) {
          console.warn('[LEADS_PAGE] Bot configuration lookup warning:', error);
        }

        if (!isGlobalAdminView) {
          // The Firestore query is already tenant-scoped. Keep this defensive
          // check so a malformed legacy document cannot appear in a client UI.
          firestoreLeads = firestoreLeads.filter((lead) => lead.ownerId === resolvedUserId);
        }

        const serverLeads = isGlobalAdminView
          ? await getServerLeads(resolvedUserId, true)
          : [];

        if (cancelled) return;

        const mergedLeads = isGlobalAdminView
          ? mergeLeads(getLocalLeads(), serverLeads, firestoreLeads)
          : firestoreLeads;

        setLeads(mergedLeads);
        setLoading(false);
        setLoadError(null);

        await updateBotNames(mergedLeads);
      },
      async (error) => {
        console.error('[LEADS_PAGE] Firestore snapshot error:', error);

        const serverLeads = isGlobalAdminView
          ? await getServerLeads(resolvedUserId, true)
          : [];

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
      const response = await authorizedFetch('/api/leads/status', {
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
      const response = await authorizedFetch('/api/leads/retry-sync', {
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
      const response = await authorizedFetch('/api/leads/sync-all', {
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

  const getLeadFieldValue = (lead: Lead, matcher: (label: string, key: string) => boolean): string => {
    if (Array.isArray(lead.fields)) {
      for (const field of lead.fields) {
        const label = String(field?.label || '').trim();
        const key = String((field as any)?.fieldKey || (field as any)?.key || '').trim();
        const value = field?.value == null ? '' : String(field.value).trim();
        if (value && matcher(label, key)) return value;
      }
    }

    if (lead.data && typeof lead.data === 'object') {
      for (const [key, rawValue] of Object.entries(lead.data)) {
        const value = rawValue == null ? '' : String(rawValue).trim();
        if (value && matcher(key, key)) return value;
      }
    }

    return '';
  };

  const getLeadName = (lead: Lead): string =>
    String(lead.name || getLeadFieldValue(lead, (label, key) =>
      /^(name|full[ _-]?name)$/i.test(key) || /\b(full\s*)?name\b/i.test(label),
    )).trim();

  const getLeadPhone = (lead: Lead): string =>
    getLeadFieldValue(lead, (label, key) =>
      /^(phone|phone_number|mobile|mobile_number|contact_number)$/i.test(key) ||
      /\b(phone|mobile|contact\s*(number|no\.?)?)\b/i.test(label),
    );

  const getLeadEmail = (lead: Lead): string =>
    getLeadFieldValue(lead, (label, key) =>
      /^(email|email_address)$/i.test(key) || /\bemail\b/i.test(label),
    );

  const getLeadBookVisit = (lead: Lead): string => {
    const direct = (lead.data && typeof lead.data === 'object'
      ? (lead.data['Book a Visit'] ?? lead.data.book_a_visit ?? lead.data.bookVisit ?? lead.data.appointment ?? lead.data.dateTime ?? lead.data.datetime)
      : '') as unknown;
    if (direct) return String(direct).trim();

    return getLeadFieldValue(lead, (label, key) =>
      /\b(book\s*(a\s*)?visit|visit|appointment|date\s*(and|&)\s*time|date[_ -]?time)\b/i.test(`${label} ${key}`),
    );
  };

  const parseFilterDateTime = (value: string): Date | null => {
    if (!value) return null;
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const getBookVisitDate = (lead: Lead): Date | null => {
    const raw = getLeadBookVisit(lead);
    if (!raw) return null;
    const localMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (localMatch) {
      const date = new Date(`${localMatch[1]}T${localMatch[2]}:${localMatch[3]}:${localMatch[4] || '00'}`);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return parseFilterDateTime(raw);
  };

  const projectOptions = useMemo(() => {
    const botIds = selectedBotFilter === 'ALL'
      ? Object.keys(flowProjectOptions)
      : [selectedBotFilter];

    const projects = botIds.flatMap((botId) => flowProjectOptions[botId] || []);

    return Array.from(
      new Set(projects.filter(Boolean).map((project) => String(project).trim())),
    ).sort((a, b) => a.localeCompare(b));
  }, [flowProjectOptions, selectedBotFilter]);

  const clearLeadFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTimeFrom('');
    setTimeTo('');
    setSelectedProjectFilter('ALL');
    setNameFilter('');
    setPhoneFilter('');
    setEmailFilter('');
    setBookVisitFrom('');
    setBookVisitTo('');
    setSelectedSyncFilter('ALL');
    setSearchQuery('');
    setSelectedBotFilter('ALL');
    setSelectedClientFilter('ALL');
    setSelectedStatusFilter('ALL');
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

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const normalizedName = nameFilter.trim().toLowerCase();
    const normalizedPhone = phoneFilter.replace(/\D/g, '');
    const normalizedEmail = emailFilter.trim().toLowerCase();

    return leads.filter((lead) => {
      if (isAdmin && !impersonatedClient && selectedClientFilter !== 'ALL') {
        const clientId = String(lead.clientId || lead.ownerId || '');
        if (clientId !== selectedClientFilter) return false;
      }

      const botId = lead.botId || lead.flowId || '';
      const currentStatus = lead.status || 'New';
      const syncStatus = lead.googleSheetSyncStatus || 'pending';
      const leadDate = getLeadDate(lead);
      const leadProject = getLeadProject(lead);
      const leadName = getLeadName(lead);
      const leadPhone = getLeadPhone(lead);
      const leadEmail = getLeadEmail(lead);
      const bookVisitDate = getBookVisitDate(lead);

      if (selectedBotFilter !== 'ALL' && botId !== selectedBotFilter) return false;
      if (selectedStatusFilter !== 'ALL' && currentStatus !== selectedStatusFilter) return false;
      if (selectedProjectFilter !== 'ALL' && leadProject !== selectedProjectFilter) return false;
      if (selectedSyncFilter !== 'ALL' && syncStatus !== selectedSyncFilter) return false;

      if (normalizedName && !leadName.toLowerCase().includes(normalizedName)) return false;
      if (normalizedPhone && !leadPhone.replace(/\D/g, '').includes(normalizedPhone)) return false;
      if (normalizedEmail && !leadEmail.toLowerCase().includes(normalizedEmail)) return false;

      // Submitted date range.
      if (dateFrom) {
        if (!leadDate) return false;
        const from = new Date(`${dateFrom}T00:00:00`);
        if (leadDate < from) return false;
      }
      if (dateTo) {
        if (!leadDate) return false;
        const to = new Date(`${dateTo}T23:59:59.999`);
        if (leadDate > to) return false;
      }

      // Submitted time-of-day range.
      if (timeFrom || timeTo) {
        if (!leadDate) return false;
        const minutes = leadDate.getHours() * 60 + leadDate.getMinutes();
        if (timeFrom) {
          const [h, m] = timeFrom.split(':').map(Number);
          if (minutes < h * 60 + m) return false;
        }
        if (timeTo) {
          const [h, m] = timeTo.split(':').map(Number);
          if (minutes > h * 60 + m) return false;
        }
      }

      // Book-a-Visit date range.
      if (bookVisitFrom) {
        if (!bookVisitDate) return false;
        const from = new Date(`${bookVisitFrom}T00:00:00`);
        if (bookVisitDate < from) return false;
      }
      if (bookVisitTo) {
        if (!bookVisitDate) return false;
        const to = new Date(`${bookVisitTo}T23:59:59.999`);
        if (bookVisitDate > to) return false;
      }

      if (!query) return true;

      const botName = (
        botNames[botId] || lead.botName || lead.flowName || lead.clientName || ''
      ).toLowerCase();
      const fieldMatch = getLeadFieldEntries(lead).some(
        (field) => field.label.toLowerCase().includes(query) || field.value.toLowerCase().includes(query),
      );
      const urlMatch = (lead.sourceUrl || '').toLowerCase().includes(query);
      const idMatch = lead.id.toLowerCase().includes(query);
      const statusMatch = currentStatus.toLowerCase().includes(query);
      const projectMatch = leadProject.toLowerCase().includes(query);

      return (
        botName.includes(query) || projectMatch || leadName.toLowerCase().includes(query) ||
        leadPhone.toLowerCase().includes(query) || leadEmail.toLowerCase().includes(query) ||
        fieldMatch || urlMatch || idMatch || statusMatch
      );
    });
  }, [
    leads,
    searchQuery,
    selectedBotFilter,
    selectedClientFilter,
    isAdmin,
    impersonatedClient,
    selectedStatusFilter,
    selectedProjectFilter,
    selectedSyncFilter,
    nameFilter,
    phoneFilter,
    emailFilter,
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
    bookVisitFrom,
    bookVisitTo,
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
      'Project',
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
        escapeCsv(getLeadProject(lead)),
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

      <div className="leads-control-bar" style={{ alignItems: 'stretch', flexWrap: 'wrap', gap: '10px' }}>
        {isAdmin && !impersonatedClient && (
          <label className="inline-select">
            <Filter />
            <select value={selectedClientFilter} onChange={(event) => setSelectedClientFilter(event.target.value)} aria-label="Filter by client">
              <option value="ALL">All clients ({leads.length})</option>
              {clientOptions.map((client) => (
                <option key={client.id} value={client.id}>{client.name}{client.company ? ` — ${client.company}` : ''}</option>
              ))}
            </select>
          </label>
        )}

        <label className="inline-select">
          <Bot />
          <select value={selectedBotFilter} onChange={(event) => setSelectedBotFilter(event.target.value)} aria-label="Filter by chatbot">
            <option value="ALL">All chatbots ({leads.length})</option>
            {uniqueBotsList.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </select>
        </label>

        <label className="inline-select">
          <Tag />
          <select value={selectedStatusFilter} onChange={(event) => setSelectedStatusFilter(event.target.value)} aria-label="Filter by status">
            <option value="ALL">All statuses ({leads.length})</option>
            <option value="New">New ({leadStats.new})</option>
            <option value="Contacted">Contacted ({leadStats.contacted})</option>
            <option value="Qualified">Qualified ({leadStats.qualified})</option>
            <option value="Converted">Converted ({leadStats.converted})</option>
            <option value="Lost">Lost ({leadStats.lost})</option>
          </select>
        </label>

        <label className="inline-select">
          <Filter />
          <select value={selectedProjectFilter} onChange={(event) => setSelectedProjectFilter(event.target.value)} aria-label="Filter by project">
            <option value="ALL">All projects ({leads.length})</option>
            {projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}
          </select>
        </label>

        <label className="inline-select">
          <select value={selectedSyncFilter} onChange={(event) => setSelectedSyncFilter(event.target.value)} aria-label="Filter by Google Sheet sync status">
            <option value="ALL">All sync states</option>
            <option value="synced">Synced</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        <label className="search-field" style={{ minWidth: '240px', flex: '1 1 240px' }}>
          <Search />
          <input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search anything…" className="input" aria-label="Search leads" />
        </label>
      </div>

      <div style={{ marginTop: '10px', padding: '14px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '12px', background: 'rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '13px' }}>Advanced filters</strong>
          <button type="button" onClick={clearLeadFilters} className="button-secondary compact">Clear all filters</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <label><span className="cell-sub">Submitted from</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" /></label>
          <label><span className="cell-sub">Submitted to</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" /></label>
          <label><span className="cell-sub">Time from</span><input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} className="input" /></label>
          <label><span className="cell-sub">Time to</span><input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} className="input" /></label>
          <label><span className="cell-sub">Name</span><input type="text" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="Lead name" className="input" /></label>
          <label><span className="cell-sub">Phone</span><input type="text" value={phoneFilter} onChange={(e) => setPhoneFilter(e.target.value)} placeholder="Phone number" className="input" /></label>
          <label><span className="cell-sub">Email</span><input type="text" value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)} placeholder="Email address" className="input" /></label>
          <label><span className="cell-sub">Book a Visit from</span><input type="date" value={bookVisitFrom} onChange={(e) => setBookVisitFrom(e.target.value)} className="input" /></label>
          <label><span className="cell-sub">Book a Visit to</span><input type="date" value={bookVisitTo} onChange={(e) => setBookVisitTo(e.target.value)} className="input" /></label>
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', opacity: 0.7 }}>
          Showing <strong>{filteredLeads.length}</strong> of <strong>{leads.length}</strong> leads
        </div>
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

      {selectedLeadIds.size > 0 && (
        <div
          className="leads-bulk-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '12px',
            padding: '10px 14px',
            border: '1px solid rgba(91,61,245,0.16)',
            borderRadius: '12px',
            background: 'rgba(91,61,245,0.05)',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600 }}>
            {selectedLeadIds.size} lead{selectedLeadIds.size === 1 ? '' : 's'} selected
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setSelectedLeadIds(new Set())}
              className="button-secondary compact"
            >
              Clear selection
            </button>
            <button
              type="button"
              onClick={() => setIsBulkDeleteConfirmOpen(true)}
              className="button-danger compact"
            >
              <Trash2 />
              Delete selected
            </button>
          </div>
        </div>
      )}

      <div className="table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '44px' }}>
                  <input
                    type="checkbox"
                    checked={filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.has(lead.id))}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible leads"
                    title="Select all visible leads"
                    onClick={(event) => event.stopPropagation()}
                  />
                </th>
                <th>Date &amp; Time</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone Number</th>
                <th>Project</th>
                <th>Book a Site Visit</th>
                <th className="cell-right">Details</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="loading-state is-inline">
                      <Loader2 className="animate-spin" />
                      <span>Loading leads…</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="loading-state is-inline">
                      <span>No leads match your current filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const date = getLeadDate(lead);
                  const name = getLeadName(lead);
                  const email = getLeadEmail(lead);
                  const phone = getLeadPhone(lead);
                  const project = getLeadProject(lead);
                  const bookVisit = getLeadBookVisit(lead);

                  return (
                    <tr key={lead.id}>
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
                          {date ? format(date, 'MMM d, yyyy') : '—'}
                        </span>
                        <span className="cell-sub">
                          {date ? format(date, 'HH:mm:ss') : ''}
                        </span>
                      </td>
                      <td><span className="cell-title">{name || '—'}</span></td>
                      <td className="max-w-[220px] truncate">{email || '—'}</td>
                      <td className="whitespace-nowrap">{phone || '—'}</td>
                      <td className="max-w-[200px] truncate">{project || '—'}</td>
                      <td className="max-w-[210px] truncate">{bookVisit || '—'}</td>
                      <td className="cell-right">
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() => setSelectedLead(lead)}
                            className="button-secondary compact"
                          >
                            Details
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
                  <dt>Project</dt>
                  <dd>{getLeadProject(selectedLead) || 'Not specified'}</dd>
                </div>
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
                onClick={() => void confirmDeleteSelectedLeads()}
                disabled={isDeletingBulk}
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
