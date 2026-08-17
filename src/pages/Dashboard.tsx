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

      // 1. Local storage fallback reads
      const localBotsRaw = localStorage.getItem('mintage_bots');
      if (localBotsRaw) {
        try { 
          const parsed = JSON.parse(localBotsRaw); 
          const filtered = !isGlobalAdminView && targetUserId ? parsed.filter((b: any) => b.createdBy === targetUserId || !b.createdBy) : parsed;
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
      try {
        const url = isGlobalAdminView ? '/api/leads' : `/api/leads?ownerId=${encodeURIComponent(targetUserId || 'demo_user')}`;
        const res = await fetch(url);
        if (res.ok) {
          const apiData = await res.json();
          if (apiData.success && Array.isArray(apiData.leads)) {
            const apiLeads = apiData.leads;
            leadsCount = Math.max(leadsCount, apiLeads.length);
            if (apiLeads.length > 0) {
              fetchedLeads = apiLeads.slice(0, 5);
            }
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
          botsCount = isGlobalAdminView ? botsSnap.size : Math.max(botsCount, botsSnap.size);
        }
      } catch (e) {
        console.warn('Bots query skipped:', e);
      }

      // 4. Fetch Firestore leads
      try {
        const leadsQuery = isGlobalAdminView
          ? query(collection(db, 'leads'), orderBy('timestamp', 'desc'), limit(5))
          : query(collection(db, 'leads'), where('ownerId', '==', targetUserId), orderBy('timestamp', 'desc'), limit(5));

        const leadsSnap = await getDocs(leadsQuery).catch(() => null);
        if (leadsSnap) {
          if (isGlobalAdminView) {
            const allLeadsSnap = await getDocs(collection(db, 'leads')).catch(() => null);
            leadsCount = Math.max(leadsCount, allLeadsSnap ? allLeadsSnap.size : leadsSnap.size);
          } else {
            leadsCount = Math.max(leadsCount, leadsSnap.size);
          }

          if (!leadsSnap.empty) {
            const fsLeads = leadsSnap.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as RecentLead[];
            const map = new Map<string, RecentLead>();
            fetchedLeads.forEach(l => map.set(l.id, l));
            fsLeads.forEach(l => map.set(l.id, l));
            fetchedLeads = Array.from(map.values()).slice(0, 5);
          }
        }
      } catch (e) {
        console.warn('Leads query skipped:', e);
      }

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
    <div className="min-h-full bg-slate-50/80 p-6 sm:p-8 space-y-8">
      {/* Header Banner with Premium Indigo/Slate Palette */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-8 shadow-xl shadow-slate-900/10 border border-slate-800">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Mintage Client Workspace</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Real-Time Live</span>
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {impersonatedClient ? `${impersonatedClient.name}'s Dashboard` : (clientUser ? `${clientUser.name}'s Dashboard` : 'Chatbot Command Center')}
            </h1>
            <p className="text-slate-300 text-sm max-w-xl leading-relaxed">
              Monitor active AI conversational flows, review incoming customer leads, and fine-tune your automated funnel.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/builder"
              className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white text-xs font-bold rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              <span>Create Bot Flow</span>
            </Link>
            <Link
              to="/integrations"
              className="px-4 py-3 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-bold rounded-2xl transition-all flex items-center gap-2"
            >
              <Code2 className="w-4 h-4 text-indigo-400" />
              <span>Widget Script</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Active Bots */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all duration-300 group">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm">
              <Bot className="w-6 h-6" />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              <Activity className="w-3 h-3" /> Active
            </span>
          </div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Active Bot Flows</h3>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-4xl font-extrabold text-slate-900 tracking-tight">{loading ? '...' : stats.bots}</p>
            <Link to="/bots" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Manage <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Total Leads */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-emerald-300 transition-all duration-300 group">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              +18% this month
            </span>
          </div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Captured Leads</h3>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-4xl font-extrabold text-slate-900 tracking-tight">{loading ? '...' : stats.leads}</p>
            <Link to="/leads" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              View Leads <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Avg Conversion */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-violet-300 transition-all duration-300 group">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3.5 bg-violet-50 text-violet-600 rounded-2xl group-hover:bg-violet-600 group-hover:text-white transition-all duration-300 shadow-sm">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
              High Efficiency
            </span>
          </div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Conversion Efficiency</h3>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-4xl font-extrabold text-slate-900 tracking-tight">{loading ? '...' : `${stats.conversion}%`}</p>
            <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-violet-500 to-indigo-600 h-full rounded-full" style={{ width: `${Math.min(stats.conversion * 5, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Action Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Quick Flow Builder & Integration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Builder Promo Card */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden group border border-indigo-800/50">
            <div className="relative z-10 max-w-lg space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-400/20">
                <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                Visual AI Canvas
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Design & Launch AI Chatbots</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Build intuitive conditional logic trees, collect contact info, and automate customer support in a drag-and-drop editor.
              </p>
              <div className="pt-2">
                <Link 
                  to="/builder"
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold text-xs rounded-2xl hover:from-indigo-600 hover:to-violet-700 transition-all shadow-lg shadow-indigo-600/30 group-hover:translate-x-1"
                >
                  <span>Launch Visual Builder</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
            <div className="absolute top-1/2 -right-8 -translate-y-1/2 opacity-10 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none">
              <Bot className="w-80 h-80 text-indigo-300" />
            </div>
          </div>

          {/* Quick Integration Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-violet-50 text-violet-600 rounded-2xl shrink-0">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Embed Chatbot Widget</h4>
                <p className="text-xs text-slate-500 mt-0.5">Copy one line of JS script to embed on your website or landing page.</p>
              </div>
            </div>
            <Link 
              to="/integrations"
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shrink-0 flex items-center gap-2"
            >
              <span>Get Embed Code</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Right Col: Recent Lead Activity */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-base font-bold text-slate-900">Recent Leads</h3>
            </div>
            <Link to="/leads" className="text-xs font-bold text-indigo-600 hover:text-indigo-700">
              View All
            </Link>
          </div>

          {recentLeads.length > 0 ? (
            <div className="space-y-3 flex-1">
              {recentLeads.map((lead, idx) => {
                const leadEmail = lead.data?.email || lead.data?.Email || lead.data?.name || 'Anonymous Lead';
                return (
                  <div key={lead.id || idx} className="p-3.5 bg-slate-50 hover:bg-indigo-50/50 rounded-2xl border border-slate-100 transition-all flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{leadEmail}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Recent Submission</span>
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full shrink-0">
                      Lead Captured
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex-1 flex flex-col items-center justify-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-600">No leads captured yet</p>
              <p className="text-[11px] text-slate-400 max-w-xs">Test your chatbot widget to capture your first customer leads.</p>
            </div>
          )}

          <Link
            to="/leads"
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-2xl transition-all text-center block"
          >
            Open Lead Center
          </Link>
        </div>
      </div>
    </div>
  );
}

