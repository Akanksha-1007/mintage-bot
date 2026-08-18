import React, { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { GitBranch, Plus, Trash2, Edit2, ExternalLink, FileSpreadsheet, AlertTriangle, Loader2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

interface BotConfig {
  id: string;
  name: string;
  createdAt: any;
  updatedAt: any;
  createdBy?: string;
  spreadsheetId?: string;
  leadsCount?: number;
}

export default function Bots() {
  const { effectiveUserId, isAdmin, impersonatedClient } = useAuth();
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingBot, setDeletingBot] = useState<BotConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const targetUserId = effectiveUserId || auth.currentUser?.uid;
    if (!targetUserId && !isAdmin) return;

    setLoading(true);

    const isGlobalAdminView = isAdmin && !impersonatedClient;
    const q = isGlobalAdminView
      ? query(collection(db, 'bot_configurations'))
      : query(collection(db, 'bot_configurations'), where('createdBy', '==', targetUserId));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let firestoreBots = await Promise.all(snapshot.docs.map(async (botDoc) => {
        // Fetch leads count for each bot
        let leadsCount = 0;
        try {
          const leadsQ = query(
            collection(db, 'leads'),
            where('flowId', '==', botDoc.id)
          );
          const leadsSnap = await getDocs(leadsQ).catch(() => null);
          if (leadsSnap) leadsCount = leadsSnap.size;
        } catch {}
        
        return {
          id: botDoc.id,
          ...botDoc.data(),
          leadsCount
        };
      })) as BotConfig[];

      // Fetch server bots
      let serverBots: BotConfig[] = [];
      try {
        const sRes = await fetch('/api/bots');
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.success && Array.isArray(sData.bots)) {
            serverBots = sData.bots;
          }
        }
      } catch {}

      if (!isGlobalAdminView && targetUserId) {
        serverBots = serverBots.filter(b => {
          if (!b.createdBy || b.createdBy === 'demo_user' || b.createdBy === 'guest_user') {
            const bName = (b.name || '').toLowerCase();
            const bId = (b.id || '').toLowerCase();
            const tId = targetUserId.toLowerCase();
            if (tId.includes('risinia')) return bName.includes('risinia') || bId.includes('risinia');
            if (tId.includes('river')) return bName.includes('river') || bId.includes('river');
            return true;
          }
          return b.createdBy === targetUserId;
        });
      }

      // Read deleted bot IDs blacklist
      const deletedIdsRaw = localStorage.getItem('mintage_deleted_bot_ids');
      let deletedIds: string[] = [];
      if (deletedIdsRaw) {
        try { deletedIds = JSON.parse(deletedIdsRaw); } catch {}
      }

      // Merge with local storage cached flows so saved flows are always visible
      const localBotsRaw = localStorage.getItem('mintage_bots') || localStorage.getItem('botflow_local_bots');
      let localBots: BotConfig[] = [];
      if (localBotsRaw) {
        try { 
          localBots = JSON.parse(localBotsRaw); 
          if (!isGlobalAdminView && targetUserId) {
            localBots = localBots.filter(b => b.createdBy === targetUserId || !b.createdBy);
          }
        } catch {}
      }

      const botMap = new Map<string, BotConfig>();
      localBots.forEach(b => { if (b && b.id && !deletedIds.includes(b.id)) botMap.set(b.id, b); });
      serverBots.forEach(b => { if (b && b.id && !deletedIds.includes(b.id)) botMap.set(b.id, b); });
      firestoreBots.forEach(b => { if (b && b.id && !deletedIds.includes(b.id)) botMap.set(b.id, b); });

      const mergedBots = Array.from(botMap.values());
      
      setBots(mergedBots.sort((a, b) => {
        const timeA = a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : new Date(a.updatedAt || 0).getTime();
        const timeB = b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : new Date(b.updatedAt || 0).getTime();
        return timeB - timeA;
      }));
      setLoading(false);
    }, (error) => {
      console.warn('Snapshot listener error on bots, relying on local cache:', error);
      const localBotsRaw = localStorage.getItem('mintage_bots') || localStorage.getItem('botflow_local_bots');
      if (localBotsRaw) {
        try {
          const parsed = JSON.parse(localBotsRaw);
          const deletedIdsRaw = localStorage.getItem('mintage_deleted_bot_ids');
          const deletedIds: string[] = deletedIdsRaw ? JSON.parse(deletedIdsRaw) : [];
          setBots(parsed.filter((b: any) => b && b.id && !deletedIds.includes(b.id)));
        } catch {}
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveUserId, isAdmin, impersonatedClient]);

  const confirmDeleteBot = async () => {
    if (!deletingBot) return;
    setIsDeleting(true);
    const targetId = deletingBot.id;

    try {
      // 1. Delete from Server API backend
      try {
        await fetch(`/api/bots/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
        await fetch('/api/bots/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: targetId })
        });
      } catch (apiErr) {
        console.warn('Server bot delete API error:', apiErr);
      }

      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'bot_configurations', targetId)).catch(() => null);
      
      // 3. Update localStorage blacklist
      const deletedIdsRaw = localStorage.getItem('mintage_deleted_bot_ids');
      let deletedIds: string[] = [];
      if (deletedIdsRaw) {
        try { deletedIds = JSON.parse(deletedIdsRaw); } catch {}
      }
      if (!deletedIds.includes(targetId)) {
        deletedIds.push(targetId);
        localStorage.setItem('mintage_deleted_bot_ids', JSON.stringify(deletedIds));
      }

      // 4. Clean up all localStorage bot caches
      ['mintage_bots', 'botflow_local_bots', 'mintage_bot_configurations'].forEach(key => {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter((b: any) => b && b.id !== targetId);
              localStorage.setItem(key, JSON.stringify(filtered));
            }
          } catch {}
        }
      });

      setBots(prev => prev.filter(b => b.id !== targetId));
      setDeletingBot(null);
    } catch (error) {
      console.error('Error deleting bot:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Mintage Chatbots</h2>
          <p className="text-gray-500 mt-1">Manage, edit, and embed your Mintage chatbot flows.</p>
        </div>
        <Link 
          to="/builder"
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          <Plus className="w-5 h-5" />
          Create New Bot
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        </div>
      ) : bots.length === 0 ? (
        <div className="bg-white rounded-[32px] p-12 text-center border border-dashed border-gray-200">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <GitBranch className="w-10 h-10 text-indigo-200" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No bots yet</h3>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto">
            You haven't created any chatbot flows yet. Start building your first lead-gen machine!
          </p>
          <Link 
            to="/builder"
            className="inline-flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all"
          >
            Create Your First Bot
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bots.map((bot) => (
            <div key={bot.id} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <GitBranch className="w-6 h-6" />
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => navigate(`/builder/${bot.id}`)}
                    className="p-2 bg-gray-50 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                    title="Edit Bot Flow"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setDeletingBot(bot)}
                    className="p-2 bg-red-50 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-xl transition-all"
                    title="Delete Bot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-1 truncate">{bot.name}</h4>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-4">
                Updated {bot.updatedAt?.toDate ? format(bot.updatedAt.toDate(), 'MMM d, yyyy') : 'Recently'}
              </p>
              
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                  {bot.leadsCount || 0} Leads
                </div>
                <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                  {bot.leadsCount && bot.leadsCount > 0 ? 'Active' : 'Awaiting Flow'}
                </div>
                {bot.spreadsheetId ? (
                  <a 
                    href={`https://docs.google.com/spreadsheets/d/${bot.spreadsheetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
                    title="Open connected Google Sheet"
                  >
                    <FileSpreadsheet className="w-3 h-3 text-teal-600" />
                    Sheet Linked
                  </a>
                ) : (
                  <Link 
                    to={`/builder/${bot.id}`}
                    className="px-3 py-1 bg-gray-50 text-gray-400 hover:text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    + Link Sheet
                  </Link>
                )}
              </div>
              
              <div className="flex gap-2">
                <Link 
                  to={`/builder/${bot.id}`}
                  className="flex-1 py-2.5 px-3 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-indigo-600 transition-all text-center flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>View & Edit Flow</span>
                </Link>
                <a 
                  href={`/widget/${bot.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                  title="Test & Preview Live Chatbot Widget"
                >
                  <span>Test Widget</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Bot Confirmation Modal */}
      {deletingBot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-gray-100 text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto shrink-0">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900">Delete Chatbot Flow?</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Are you sure you want to delete <strong className="text-gray-800">"{deletingBot.name}"</strong>? This will permanently remove the bot configuration and widget endpoint.
              </p>
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 p-2.5 rounded-xl font-medium mt-2">
                Note: Any lead data previously captured by this bot will remain safely saved in your Lead Data section.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingBot(null)}
                disabled={isDeleting}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteBot}
                disabled={isDeleting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{isDeleting ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
