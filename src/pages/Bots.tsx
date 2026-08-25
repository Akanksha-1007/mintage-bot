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

      window.dispatchEvent(new CustomEvent('mintage_bot_deleted', { detail: { id: targetId } }));

      setBots(prev => prev.filter(b => b.id !== targetId));
      setDeletingBot(null);
    } catch (error) {
      console.error('Error deleting bot:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="workspace-page bots-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Chatbot library</span>
          <h1>My bots</h1>
          <p>Open a flow, review its setup, or publish a new chatbot.</p>
        </div>
        <Link to="/builder" className="button-primary">
          <Plus />
          New bot
        </Link>
      </header>

      <div className="database-toolbar">
        <div className="database-view is-active"><GitBranch /> All flows <span>{bots.length}</span></div>
        <p className="database-toolbar-note">Updated automatically</p>
      </div>

      {loading ? (
        <div className="loading-state is-inline">
          <Loader2 className="animate-spin" />
          <span>Loading bots…</span>
        </div>
      ) : bots.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <GitBranch />
          </div>
          <h3>No bots in this workspace</h3>
          <p>Create your first conversational flow and publish it when you are ready.</p>
          <Link to="/builder" className="button-primary"><Plus /> Create a bot</Link>
        </div>
      ) : (
        <div className="bot-card-grid">
          {bots.map((bot) => (
            <article key={bot.id} className="bot-card">
              <div className="bot-card-head">
                <div className="bot-icon">
                  <BotIcon />
                </div>
                <div className="bot-card-actions">
                  <button onClick={() => navigate(`/builder/${bot.id}`)} className="icon-button" title="Edit bot flow">
                    <Edit2 />
                  </button>
                  <button onClick={() => setDeletingBot(bot)} className="icon-button danger" title="Delete bot">
                    <Trash2 />
                  </button>
                </div>
              </div>
              <div className="bot-title-row">
                <div className="min-w-0 flex-1"><h3>{bot.name}</h3><p>Updated {bot.updatedAt?.toDate ? format(bot.updatedAt.toDate(), 'MMM d, yyyy') : 'recently'}</p></div>
                <span className={`status-pill ${bot.leadsCount && bot.leadsCount > 0 ? 'status-live' : ''}`}><span />{bot.leadsCount && bot.leadsCount > 0 ? 'Active' : 'Draft'}</span>
              </div>

              <div className="bot-properties">
                <div><span>Leads</span><strong>{bot.leadsCount || 0}</strong></div>
                <div><span>Google Sheet</span>
                {bot.spreadsheetId ? (
                  <a href={`https://docs.google.com/spreadsheets/d/${bot.spreadsheetId}`} target="_blank" rel="noopener noreferrer">
                    <FileSpreadsheet /> Connected
                  </a>
                ) : (
                  <Link to={`/builder/${bot.id}`}>Not connected</Link>
                )}</div>
              </div>

              <div className="bot-card-footer">
                <Link to={`/builder/${bot.id}`} className="button-primary compact">
                  Open flow
                </Link>
                <a href={`/widget/${bot.id}`} target="_blank" rel="noopener noreferrer" className="button-secondary compact">
                  Preview <ExternalLink />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Delete Bot Confirmation Modal */}
      {deletingBot && (
        <div className="modal-backdrop">
          <div className="notion-modal is-centered">
            <div className="modal-danger-icon">
              <AlertTriangle />
            </div>

            <h3>Delete this bot?</h3>
            <p className="mt-1.5">
              <strong>“{deletingBot.name}”</strong> and its published widget endpoint will be permanently removed.
            </p>
            <p className="modal-note">
              Previously captured leads will remain available in Lead data.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setDeletingBot(null)}
                disabled={isDeleting}
                className="button-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteBot}
                disabled={isDeleting}
                className="button-danger flex-1"
              >
                {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                <span>{isDeleting ? 'Deleting…' : 'Delete bot'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BotIcon() {
  return <GitBranch aria-hidden="true" />;
}
