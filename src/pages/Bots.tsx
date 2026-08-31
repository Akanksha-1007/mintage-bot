import React, { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs,
} from 'firebase/firestore';
import {
  GitBranch,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

interface BotConfig {
  id: string;
  name: string;
  createdAt?: any;
  updatedAt?: any;
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

    if (!targetUserId && !isAdmin) {
      setBots([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const isGlobalAdminView = isAdmin && !impersonatedClient;

    const q = isGlobalAdminView
      ? query(collection(db, 'bot_configurations'))
      : targetUserId
        ? query(
          collection(db, 'bot_configurations'),
          where('createdBy', '==', targetUserId),
        )
        : null;

    if (!q) {
      setBots([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        let firestoreBots: BotConfig[] = await Promise.all(
          snapshot.docs.map(async (botDoc) => {
            let leadsCount = 0;

            try {
              const leadsQ = query(
                collection(db, 'leads'),
                where('flowId', '==', botDoc.id),
              );

              const leadsSnap = await getDocs(leadsQ).catch(() => null);

              if (leadsSnap) {
                leadsCount = leadsSnap.size;
              }
            } catch {
              // Keep leadsCount at zero if the leads query fails.
            }

            return {
              id: botDoc.id,
              ...botDoc.data(),
              leadsCount,
            } as BotConfig;
          }),
        );

        // Fetch bots from the server API as well.
        let serverBots: BotConfig[] = [];

        try {
          const response = await fetch('/api/bots');

          if (response.ok) {
            const data = await response.json();

            if (data.success && Array.isArray(data.bots)) {
              serverBots = data.bots as BotConfig[];
            }
          }
        } catch {
          // Firestore/local storage can still provide the bot list.
        }

        // Restrict server bots when the current user is not in the global
        // administrator view.
        if (!isGlobalAdminView && targetUserId) {
          serverBots = serverBots.filter((bot) => {
            if (
              !bot.createdBy ||
              bot.createdBy === 'demo_user' ||
              bot.createdBy === 'guest_user'
            ) {
              const botName = (bot.name || '').toLowerCase();
              const botId = (bot.id || '').toLowerCase();
              const userId = targetUserId.toLowerCase();

              // Preserve the existing compatibility behavior for legacy
              // seeded/demo records.
              if (userId.includes('risinia')) {
                return (
                  botName.includes('risinia') ||
                  botId.includes('risinia')
                );
              }

              if (userId.includes('river')) {
                return (
                  botName.includes('river') ||
                  botId.includes('river')
                );
              }

              return true;
            }

            return bot.createdBy === targetUserId;
          });
        }

        // Read deleted bot IDs so deleted bots do not reappear from another
        // data source.
        const deletedIdsRaw = localStorage.getItem(
          'mintage_deleted_bot_ids',
        );

        let deletedIds: string[] = [];

        if (deletedIdsRaw) {
          try {
            const parsed = JSON.parse(deletedIdsRaw);
            if (Array.isArray(parsed)) {
              deletedIds = parsed.filter(
                (value): value is string => typeof value === 'string',
              );
            }
          } catch {
            deletedIds = [];
          }
        }

        // Merge locally cached bots as a third source.
        const localBotsRaw =
          localStorage.getItem('mintage_bots') ||
          localStorage.getItem('botflow_local_bots');

        let localBots: BotConfig[] = [];

        if (localBotsRaw) {
          try {
            const parsed = JSON.parse(localBotsRaw);

            if (Array.isArray(parsed)) {
              localBots = parsed.filter(
                (bot): bot is BotConfig =>
                  Boolean(bot && typeof bot === 'object' && bot.id),
              );

              if (!isGlobalAdminView && targetUserId) {
                localBots = localBots.filter(
                  (bot) =>
                    bot.createdBy === targetUserId || !bot.createdBy,
                );
              }
            }
          } catch {
            localBots = [];
          }
        }

        // Merge all sources by bot ID. Later sources take precedence.
        const botMap = new Map<string, BotConfig>();

        localBots.forEach((bot) => {
          if (bot.id && !deletedIds.includes(bot.id)) {
            botMap.set(bot.id, bot);
          }
        });

        serverBots.forEach((bot) => {
          if (bot.id && !deletedIds.includes(bot.id)) {
            botMap.set(bot.id, bot);
          }
        });

        firestoreBots.forEach((bot) => {
          if (bot.id && !deletedIds.includes(bot.id)) {
            botMap.set(bot.id, bot);
          }
        });

        const mergedBots = Array.from(botMap.values());

        mergedBots.sort((a, b) => {
          const timeA = getTimestampMs(a.updatedAt);
          const timeB = getTimestampMs(b.updatedAt);
          return timeB - timeA;
        });

        setBots(mergedBots);
        setLoading(false);
      },
      (error) => {
        console.warn(
          'Snapshot listener error on bots, relying on local cache:',
          error,
        );

        const localBotsRaw =
          localStorage.getItem('mintage_bots') ||
          localStorage.getItem('botflow_local_bots');

        if (localBotsRaw) {
          try {
            const parsed = JSON.parse(localBotsRaw);
            const deletedIdsRaw = localStorage.getItem(
              'mintage_deleted_bot_ids',
            );

            let deletedIds: string[] = [];

            if (deletedIdsRaw) {
              try {
                const deletedParsed = JSON.parse(deletedIdsRaw);
                if (Array.isArray(deletedParsed)) {
                  deletedIds = deletedParsed.filter(
                    (value): value is string =>
                      typeof value === 'string',
                  );
                }
              } catch {
                deletedIds = [];
              }
            }

            if (Array.isArray(parsed)) {
              setBots(
                parsed.filter(
                  (bot: any) =>
                    bot &&
                    bot.id &&
                    !deletedIds.includes(bot.id),
                ),
              );
            } else {
              setBots([]);
            }
          } catch {
            setBots([]);
          }
        } else {
          setBots([]);
        }

        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [effectiveUserId, isAdmin, impersonatedClient]);

  const confirmDeleteBot = async () => {
    if (!deletingBot) {
      return;
    }

    setIsDeleting(true);
    const targetId = deletingBot.id;

    try {
      // 1. Delete from the server API.
      try {
        await fetch(`/api/bots/${encodeURIComponent(targetId)}`, {
          method: 'DELETE',
        });

        await fetch('/api/bots/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: targetId }),
        });
      } catch (apiError) {
        console.warn('Server bot delete API error:', apiError);
      }

      // 2. Delete from Firestore.
      await deleteDoc(
        doc(db, 'bot_configurations', targetId),
      ).catch(() => null);

      // 3. Add the ID to the local deletion blacklist.
      const deletedIdsRaw = localStorage.getItem(
        'mintage_deleted_bot_ids',
      );

      let deletedIds: string[] = [];

      if (deletedIdsRaw) {
        try {
          const parsed = JSON.parse(deletedIdsRaw);

          if (Array.isArray(parsed)) {
            deletedIds = parsed.filter(
              (value): value is string => typeof value === 'string',
            );
          }
        } catch {
          deletedIds = [];
        }
      }

      if (!deletedIds.includes(targetId)) {
        deletedIds.push(targetId);
        localStorage.setItem(
          'mintage_deleted_bot_ids',
          JSON.stringify(deletedIds),
        );
      }

      // 4. Remove the bot from all local caches.
      [
        'mintage_bots',
        'botflow_local_bots',
        'mintage_bot_configurations',
      ].forEach((key) => {
        const raw = localStorage.getItem(key);

        if (!raw) {
          return;
        }

        try {
          const parsed = JSON.parse(raw);

          if (Array.isArray(parsed)) {
            const filtered = parsed.filter(
              (bot: any) => bot && bot.id !== targetId,
            );

            localStorage.setItem(key, JSON.stringify(filtered));
          }
        } catch {
          // Ignore malformed local cache entries.
        }
      });

      window.dispatchEvent(
        new CustomEvent('mintage_bot_deleted', {
          detail: { id: targetId },
        }),
      );

      setBots((previousBots) =>
        previousBots.filter((bot) => bot.id !== targetId),
      );

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
          <p>
            Open a flow, review its setup, or publish a new chatbot.
          </p>
        </div>

        <Link to="/builder" className="button-primary">
          <Plus />
          New bot
        </Link>
      </header>

      <div className="database-toolbar">
        <div className="database-view is-active">
          <GitBranch />
          All flows
          <span>{bots.length}</span>
        </div>

        <p className="database-toolbar-note">
          Updated automatically
        </p>
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

          <p>
            Create your first conversational flow and publish it
            when you are ready.
          </p>

          <Link to="/builder" className="button-primary">
            <Plus />
            Create a bot
          </Link>
        </div>
      ) : (
        <div className="bot-card-grid">
          {bots.map((bot) => (
            <article key={bot.id} className="bot-card">
              <div className="bot-card-head">
                <div className="bot-icon">
                  <GitBranch aria-hidden="true" />
                </div>

                <div className="bot-card-actions">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/builder/${bot.id}`)
                    }
                    className="icon-button"
                    title="Edit bot flow"
                    aria-label={`Edit ${bot.name}`}
                  >
                    <Edit2 />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingBot(bot)}
                    className="icon-button danger"
                    title="Delete bot"
                    aria-label={`Delete ${bot.name}`}
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>

              <div className="bot-title-row">
                <div className="min-w-0 flex-1">
                  <h3>{bot.name || 'Untitled bot'}</h3>
                  <p>
                    Updated {formatUpdatedDate(bot.updatedAt)}
                  </p>
                </div>

                <span
                  className={`status-pill ${bot.leadsCount && bot.leadsCount > 0
                      ? 'status-live'
                      : ''
                    }`}
                >
                  <span />
                  {bot.leadsCount && bot.leadsCount > 0
                    ? 'Active'
                    : 'Draft'}
                </span>
              </div>

              <div className="bot-properties">
                <div>
                  <span>Leads</span>
                  <strong>{bot.leadsCount || 0}</strong>
                </div>

                <div>
                  <span>Google Sheet</span>

                  {bot.spreadsheetId ? (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(
                        bot.spreadsheetId,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileSpreadsheet />
                      Connected
                    </a>
                  ) : (
                    <Link to={`/builder/${bot.id}`}>
                      Not connected
                    </Link>
                  )}
                </div>
              </div>

              <div className="bot-card-footer">
                <Link
                  to={`/builder/${bot.id}`}
                  className="button-primary compact"
                >
                  Open flow
                </Link>

                <a
                  href={`/widget/${encodeURIComponent(bot.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button-secondary compact"
                >
                  Preview
                  <ExternalLink />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      {deletingBot && (
        <div className="modal-backdrop">
          <div
            className="app-modal is-centered"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-bot-title"
          >
            <div className="modal-danger-icon">
              <AlertTriangle />
            </div>

            <h3 id="delete-bot-title">Delete this bot?</h3>

            <p className="mt-1.5">
              <strong>“{deletingBot.name}”</strong> and its
              published widget endpoint will be permanently removed.
            </p>

            <p className="modal-note">
              Previously captured leads will remain available in
              Lead data.
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
                {isDeleting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}

                <span>
                  {isDeleting ? 'Deleting…' : 'Delete bot'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTimestampMs(value: any): number {
  if (!value) {
    return 0;
  }

  if (typeof value?.seconds === 'number') {
    return value.seconds * 1000;
  }

  if (typeof value?.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch {
      return 0;
    }
  }

  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().getTime();
    } catch {
      return 0;
    }
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatUpdatedDate(value: any): string {
  const timestamp = getTimestampMs(value);

  if (!timestamp) {
    return 'recently';
  }

  try {
    return format(new Date(timestamp), 'MMM d, yyyy');
  } catch {
    return 'recently';
  }
}
