import React, { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, limit, orderBy, onSnapshot } from 'firebase/firestore';
import { 
  Users, 
  MessageSquare, 
  TrendingUp, 
  Bot, 
  ArrowRight, 
  GitBranch,
  Sparkles,
  Zap,
  Activity,
  CheckCircle2,
  Code2,
  Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface RecentLead {
  id: string;
  flowName?: string;
  data: Record<string, any>;
  timestamp?: any;
}

export default function Dashboard() {
  const { effectiveUserId, impersonatedClient, clientUser, isAdmin } = useAuth();
  const [stats, setStats] = useState({
    bots: 0,
    leads: 0,
    conversion: 0
  });
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const targetUserId = effectiveUserId || auth.currentUser?.uid;
    const isGlobalAdminView = isAdmin && !impersonatedClient;

    const fetchStats = async () => {
      let botsCount = 0;
      let leadsCount = 0;
      let fetchedLeads: RecentLead[] = [];

      // Read deleted bot IDs blacklist
      const deletedIdsRaw = localStorage.getItem('mintage_deleted_bot_ids');
      let deletedIds: string[] = [];
      if (deletedIdsRaw) {
        try { deletedIds = JSON.parse(deletedIdsRaw); } catch {}
      }

      // 1. Local storage fallback reads
      const localBotsRaw = localStorage.getItem('mintage_bots');
      if (localBotsRaw) {
        try { 
          const parsed = JSON.parse(localBotsRaw); 
          const filtered = (!isGlobalAdminView && targetUserId ? parsed.filter((b: any) => b.createdBy === targetUserId || !b.createdBy) : parsed).filter((b: any) => b && b.id && !deletedIds.includes(b.id));
          botsCount = filtered.length;
        } catch {}
      }

      const localLeadsRaw = localStorage.getItem('mintage_leads');
      if (localLeadsRaw) {
        try { 
          const parsed = JSON.parse(localLeadsRaw);
          const filtered = !isGlobalAdminView && targetUserId ? parsed.filter((l: any) => l.ownerId === targetUserId || !l.ownerId || targetUserId === 'demo_user') : parsed;
          leadsCount = filtered.length; 
          fetchedLeads = filtered.slice(0, 5);
        } catch {}
      }

      // 2. Fetch API server leads
      let apiLeadsList: RecentLead[] = [];
      try {
        const url = isGlobalAdminView ? '/api/leads' : `/api/leads?ownerId=${encodeURIComponent(targetUserId || 'demo_user')}`;
        const res = await fetch(url);
        if (res.ok) {
          const apiData = await res.json();
          if (apiData.success && Array.isArray(apiData.leads)) {
            apiLeadsList = apiData.leads;
          }
        }
      } catch (e) {
        console.warn('Backend leads API warning:', e);
      }

      // 3. Fetch Firestore bots count
      try {
        const botsQuery = isGlobalAdminView
          ? query(collection(db, 'bot_configurations'))
          : query(collection(db, 'bot_configurations'), where('createdBy', '==', targetUserId));
        
        const botsSnap = await getDocs(botsQuery).catch(() => null);
        if (botsSnap) {
          const validDocs = botsSnap.docs.filter(d => !deletedIds.includes(d.id));
          botsCount = isGlobalAdminView ? validDocs.length : Math.max(botsCount, validDocs.length);
        }
      } catch (e) {
        console.warn('Bots query skipped:', e);
      }

      // 4. Fetch Firestore leads & combine all sources
      const allLeadsMap = new Map<string, RecentLead>();
      fetchedLeads.forEach(l => allLeadsMap.set(l.id, l));
      apiLeadsList.forEach(l => allLeadsMap.set(l.id, l));

      try {
        const leadsQuery = isGlobalAdminView
          ? query(collection(db, 'leads'), orderBy('timestamp', 'desc'), limit(5))
          : query(collection(db, 'leads'), where('ownerId', '==', targetUserId), orderBy('timestamp', 'desc'), limit(5));

        const leadsSnap = await getDocs(leadsQuery).catch(() => null);
        if (leadsSnap && !leadsSnap.empty) {
          const fsLeads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RecentLead[];
          fsLeads.forEach(l => allLeadsMap.set(l.id, l));
        }
      } catch (e) {
        console.warn('Leads query skipped:', e);
      }

      const combinedLeads = Array.from(allLeadsMap.values());
      leadsCount = Math.max(leadsCount, combinedLeads.length);
      fetchedLeads = combinedLeads.slice(0, 5);

      setStats({
        bots: botsCount,
        leads: leadsCount,
        conversion: botsCount > 0 ? Math.round((leadsCount / (botsCount * 10)) * 100) / 10 : 0
      });
      setRecentLeads(fetchedLeads);
      setLoading(false);
    };

    fetchStats();

    // Real-Time Listener 1: Firestore Realtime Snapshots
    let unsubscribeLeads: (() => void) | null = null;
    let unsubscribeBots: (() => void) | null = null;
    try {
      unsubscribeLeads = onSnapshot(collection(db, 'leads'), () => fetchStats(), () => {});
      unsubscribeBots = onSnapshot(collection(db, 'bot_configurations'), () => fetchStats(), () => {});
    } catch (e) {}

    // Real-Time Listener 2: Server-Sent Events (SSE) Stream from backend
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        if (event.data && !event.data.startsWith(':')) {
          fetchStats();
        }
      };
    } catch (e) {}

    // Real-Time Listener 3: Custom intra-tab window events
    const handleCustomLead = () => fetchStats();
    window.addEventListener('mintage_lead_captured', handleCustomLead);

    // Fallback polling interval (every 4 seconds)
    const pollInterval = setInterval(() => {
      fetchStats();
    }, 4000);

    return () => {
      if (unsubscribeLeads) unsubscribeLeads();
      if (unsubscribeBots) unsubscribeBots();
      if (eventSource) eventSource.close();
      window.removeEventListener('mintage_lead_captured', handleCustomLead);
      clearInterval(pollInterval);
    };
  }, [effectiveUserId, isAdmin, impersonatedClient]);

  return (
    <div className="workspace-page dashboard-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow-row">
            <span className="eyebrow">Workspace overview</span>
            <span className="status-pill status-live"><span />Live</span>
          </div>
          <h1>{impersonatedClient ? `${impersonatedClient.name}'s workspace` : (clientUser ? `${clientUser.name}'s workspace` : 'Dashboard')}</h1>
          <p>Manage your chatbot flows, captured leads, and publishing tools from one place.</p>
        </div>
        <div className="page-actions">
          <Link to="/integrations" className="button-secondary">
            <Code2 className="h-4 w-4" />
            Embed widget
          </Link>
          <Link to="/builder" className="button-primary">
            <PlusIcon />
            New bot
          </Link>
        </div>
      </header>

      <section className="metric-grid" aria-label="Workspace statistics">
        <article className="metric-card">
          <div className="metric-icon"><Bot /></div>
          <div><p>Active bots</p><strong>{loading ? '—' : stats.bots}</strong></div>
          <Link to="/bots">Open <ArrowRight /></Link>
        </article>
        <article className="metric-card">
          <div className="metric-icon"><Users /></div>
          <div><p>Captured leads</p><strong>{loading ? '—' : stats.leads}</strong></div>
          <Link to="/leads">View <ArrowRight /></Link>
        </article>
        <article className="metric-card">
          <div className="metric-icon"><TrendingUp /></div>
          <div><p>Conversion rate</p><strong>{loading ? '—' : `${stats.conversion}%`}</strong></div>
          <div className="metric-progress"><span style={{ width: `${Math.min(stats.conversion * 5, 100)}%` }} /></div>
        </article>
      </section>

      <div className="dashboard-columns">
        <section className="dashboard-main-column">
          <div className="section-title-row">
            <div><p className="eyebrow">Quick start</p><h2>Build and publish</h2></div>
            <span className="text-note">Everything stays in this workspace</span>
          </div>

          <article className="builder-feature">
            <div className="feature-copy">
              <span className="feature-icon"><GitBranch /></span>
              <h3>Shape a conversation visually</h3>
              <p>Arrange messages, questions, conditions, and lead capture steps in the drag-and-drop builder.</p>
              <Link to="/builder" className="button-primary">Open builder <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="feature-canvas" aria-hidden="true">
              <div className="flow-card flow-card-a"><span />Welcome message</div>
              <div className="flow-line" />
              <div className="flow-card flow-card-b"><span />Capture contact</div>
              <div className="flow-card flow-card-c"><span />Save lead</div>
            </div>
          </article>

          <Link to="/integrations" className="inline-resource-card">
            <span className="resource-icon"><MessageSquare /></span>
            <span className="min-w-0 flex-1"><strong>Website embed</strong><small>Add a floating chatbot to any site with one script.</small></span>
            <ArrowRight />
          </Link>
        </section>

        <aside className="recent-panel">
          <div className="section-title-row compact">
            <div><p className="eyebrow">Activity</p><h2>Recent leads</h2></div>
            <Link to="/leads">View all</Link>
          </div>

          {recentLeads.length > 0 ? (
            <div className="recent-list">
              {recentLeads.map((lead, idx) => {
                const leadEmail = lead.data?.email || lead.data?.Email || lead.data?.name || 'Anonymous lead';
                return (
                  <div key={lead.id || idx} className="recent-item">
                    <div className="avatar-initial">{String(leadEmail).charAt(0).toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><strong>{leadEmail}</strong><span><Clock /> Recent submission</span></div>
                    <span className="status-pill">New</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-activity">
              <CheckCircle2 />
              <strong>No leads yet</strong>
              <p>New submissions will appear here as they arrive.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PlusIcon() {
  return <span className="plus-icon" aria-hidden="true">+</span>;
}
