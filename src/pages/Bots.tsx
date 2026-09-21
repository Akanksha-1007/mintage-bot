import React, {
  useEffect,
  useState,
} from 'react';

import {
  db,
  auth,
} from '../lib/firebase';

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

import {
  Link,
  useNavigate,
} from 'react-router-dom';

import {
  format,
} from 'date-fns';

import {
  useAuth,
} from '../context/AuthContext';

interface BotConfig {
  id: string;
  name: string;

  createdAt?: any;
  updatedAt?: any;

  /*
   * Tenant ownership
   */
  createdBy?: string;
  ownerId?: string;
  clientId?: string;

  spreadsheetId?: string;
  leadsCount?: number;

  [key: string]: any;
}

export default function Bots() {

  const {
    effectiveUserId,
    isAdmin,
    impersonatedClient,
  } = useAuth();

  const [
    bots,
    setBots,
  ] = useState<BotConfig[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    deletingBot,
    setDeletingBot,
  ] =
    useState<BotConfig | null>(
      null
    );

  const [
    isDeleting,
    setIsDeleting,
  ] = useState(false);

  const navigate =
    useNavigate();

  /*
   * ============================================================
   * CURRENT TENANT
   * ============================================================
   */

  const targetUserId =
    effectiveUserId ||
    auth.currentUser?.uid ||
    '';

  const isGlobalAdminView =
    isAdmin &&
    !impersonatedClient;

  /*
   * ============================================================
   * TENANT OWNERSHIP CHECK
   * ============================================================
   */

  const belongsToCurrentClient =
    (
      bot: BotConfig
    ) => {

      /*
       * Admin can see everything in admin mode.
       */

      if (
        isGlobalAdminView
      ) {
        return true;
      }

      if (
        !targetUserId
      ) {
        return false;
      }

      const target =
        String(
          targetUserId
        );

      return (
        String(
          bot.createdBy ||
          ''
        ) === target ||

        String(
          bot.ownerId ||
          ''
        ) === target ||

        String(
          bot.clientId ||
          ''
        ) === target
      );
    };

  /*
   * ============================================================
   * LOAD BOTS
   * ============================================================
   */

  useEffect(() => {

    if (
      !isGlobalAdminView &&
      !targetUserId
    ) {
      setBots([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    let cancelled =
      false;

    /*
     * ==========================================================
     * DELETED BOT IDS
     * ==========================================================
     */

    const getDeletedIds =
      (): string[] => {

        const raw =
          localStorage.getItem(
            'mintage_deleted_bot_ids'
          );

        if (!raw) {
          return [];
        }

        try {

          const parsed =
            JSON.parse(
              raw
            );

          if (
            Array.isArray(
              parsed
            )
          ) {
            return parsed.map(
              String
            );
          }

        } catch {
          return [];
        }

        return [];
      };

    /*
     * ==========================================================
     * LOAD LOCAL BOTS
     * ==========================================================
     */

    const getLocalBots =
      (): BotConfig[] => {

        const raw =
          localStorage.getItem(
            'mintage_bots'
          ) ||
          localStorage.getItem(
            'botflow_local_bots'
          );

        if (!raw) {
          return [];
        }

        try {

          const parsed =
            JSON.parse(
              raw
            );

          if (
            !Array.isArray(
              parsed
            )
          ) {
            return [];
          }

          return parsed
            .filter(
              (
                bot: any
              ) =>
                bot &&
                bot.id
            )
            .filter(
              (
                bot: BotConfig
              ) =>
                belongsToCurrentClient(
                  bot
                )
            );

        } catch {
          return [];
        }
      };

    /*
     * ==========================================================
     * LOAD FIRESTORE BOTS
     * ==========================================================
     */

    const loadFirestoreBots =
      async (): Promise<
        BotConfig[]
      > => {

        const botMap =
          new Map<
            string,
            BotConfig
          >();

        /*
         * ADMIN
         */

        if (
          isGlobalAdminView
        ) {

          try {

            const snapshot =
              await getDocs(
                collection(
                  db,
                  'bot_configurations'
                )
              );

            snapshot.docs.forEach(
              (
                botDoc
              ) => {

                botMap.set(
                  botDoc.id,
                  {
                    id:
                      botDoc.id,

                    ...botDoc.data(),
                  } as BotConfig
                );

              }
            );

          } catch (
          error
          ) {

            console.warn(
              'Unable to load admin bots:',
              error
            );

          }

        }

        /*
         * CLIENT
         */

        else if (
          targetUserId
        ) {

          /*
           * Query all three ownership fields.
           *
           * This supports bots created by older versions
           * as well as the new multi-tenant structure.
           */

          const ownershipFields = [
            'createdBy',
            'ownerId',
            'clientId',
          ];

          for (
            const field of
            ownershipFields
          ) {

            try {

              const botQuery =
                query(
                  collection(
                    db,
                    'bot_configurations'
                  ),

                  where(
                    field,
                    '==',
                    targetUserId
                  )
                );

              const snapshot =
                await getDocs(
                  botQuery
                );

              snapshot.docs.forEach(
                (
                  botDoc
                ) => {

                  const bot =
                    {
                      id:
                        botDoc.id,

                      ...botDoc.data(),
                    } as BotConfig;

                  /*
                   * Final tenant check.
                   */

                  if (
                    belongsToCurrentClient(
                      bot
                    )
                  ) {

                    botMap.set(
                      botDoc.id,
                      bot
                    );

                  }

                }
              );

            } catch (
            error
            ) {

              console.warn(
                `Bot query failed for ${field}:`,
                error
              );

            }

          }

        }

        /*
         * ======================================================
         * GET LEAD COUNT
         * ======================================================
         */

        const result =
          await Promise.all(
            Array.from(
              botMap.values()
            ).map(
              async (
                bot
              ) => {

                let leadsCount =
                  0;

                try {

                  const flowQuery =
                    query(
                      collection(
                        db,
                        'leads'
                      ),

                      where(
                        'flowId',
                        '==',
                        bot.id
                      )
                    );

                  const botQuery =
                    query(
                      collection(
                        db,
                        'leads'
                      ),

                      where(
                        'botId',
                        '==',
                        bot.id
                      )
                    );

                  const [
                    flowSnapshot,
                    botSnapshot,
                  ] =
                    await Promise.all([
                      getDocs(
                        flowQuery
                      ).catch(
                        () => null
                      ),

                      getDocs(
                        botQuery
                      ).catch(
                        () => null
                      ),
                    ]);

                  const leadIds =
                    new Set<string>();

                  flowSnapshot?.docs.forEach(
                    (
                      lead
                    ) => {

                      const data =
                        lead.data();

                      /*
                       * Only count leads belonging
                       * to this client.
                       */

                      if (
                        isGlobalAdminView ||
                        String(
                          data.ownerId ||
                          data.clientId ||
                          data.createdBy ||
                          ''
                        ) ===
                        String(
                          targetUserId
                        )
                      ) {

                        leadIds.add(
                          lead.id
                        );

                      }

                    }
                  );

                  botSnapshot?.docs.forEach(
                    (
                      lead
                    ) => {

                      const data =
                        lead.data();

                      if (
                        isGlobalAdminView ||
                        String(
                          data.ownerId ||
                          data.clientId ||
                          data.createdBy ||
                          ''
                        ) ===
                        String(
                          targetUserId
                        )
                      ) {

                        leadIds.add(
                          lead.id
                        );

                      }

                    }
                  );

                  leadsCount =
                    leadIds.size;

                } catch {
                  leadsCount = 0;
                }

                return {
                  ...bot,
                  leadsCount,
                };

              }
            )
          );

        return result;
      };

    /*
     * ==========================================================
     * LOAD SERVER BOTS
     * ==========================================================
     */

    const loadServerBots =
      async (): Promise<
        BotConfig[]
      > => {

        try {

          const url =
            isGlobalAdminView
              ? '/api/bots'
              : `/api/bots?ownerId=${encodeURIComponent(
                targetUserId
              )}`;

          const response =
            await fetch(
              url
            );

          if (
            !response.ok
          ) {
            return [];
          }

          const data =
            await response.json();

          if (
            !data.success ||
            !Array.isArray(
              data.bots
            )
          ) {
            return [];
          }

          /*
           * IMPORTANT:
           *
           * Never identify ownership by:
           *
           * "river"
           * "riverscape"
           * "risinia"
           * etc.
           */

          return data.bots.filter(
            (
              bot: BotConfig
            ) =>
              belongsToCurrentClient(
                bot
              )
          );

        } catch (
        error
        ) {

          console.warn(
            'Server bots API failed:',
            error
          );

          return [];
        }
      };

    /*
     * ==========================================================
     * COMBINE SOURCES
     * ==========================================================
     */

    const loadAllBots =
      async () => {

        const deletedIds =
          getDeletedIds();

        const [
          firestoreBots,
          serverBots,
        ] =
          await Promise.all([
            loadFirestoreBots(),
            loadServerBots(),
          ]);

        const localBots =
          getLocalBots();

        const botMap =
          new Map<
            string,
            BotConfig
          >();

        /*
         * Local
         */

        localBots.forEach(
          (
            bot
          ) => {

            if (
              bot.id &&
              !deletedIds.includes(
                bot.id
              )
            ) {

              botMap.set(
                bot.id,
                bot
              );

            }

          }
        );

        /*
         * Server
         */

        serverBots.forEach(
          (
            bot
          ) => {

            if (
              bot.id &&
              !deletedIds.includes(
                bot.id
              )
            ) {

              botMap.set(
                bot.id,
                bot
              );

            }

          }
        );

        /*
         * Firestore
         */

        firestoreBots.forEach(
          (
            bot
          ) => {

            if (
              bot.id &&
              !deletedIds.includes(
                bot.id
              )
            ) {

              botMap.set(
                bot.id,
                bot
              );

            }

          }
        );

        /*
         * FINAL TENANT FILTER
         */

        const mergedBots =
          Array.from(
            botMap.values()
          ).filter(
            (
              bot
            ) =>
              belongsToCurrentClient(
                bot
              )
          );

        /*
         * Newest first.
         */

        mergedBots.sort(
          (
            a,
            b
          ) =>
            getTimestampMs(
              b.updatedAt
            ) -
            getTimestampMs(
              a.updatedAt
            )
        );

        if (
          !cancelled
        ) {

          setBots(
            mergedBots
          );

          setLoading(
            false
          );

        }

      };

    loadAllBots();

    /*
     * ==========================================================
     * FIRESTORE REALTIME LISTENER
     * ==========================================================
     */

    let unsubscribe:
      | (() => void)
      | null = null;

    try {

      if (
        isGlobalAdminView
      ) {

        unsubscribe =
          onSnapshot(
            collection(
              db,
              'bot_configurations'
            ),

            () => {
              loadAllBots();
            },

            (
              error
            ) => {
              console.warn(
                'Admin bot listener:',
                error
              );
            }
          );

      } else if (
        targetUserId
      ) {

        const clientQuery =
          query(
            collection(
              db,
              'bot_configurations'
            ),

            where(
              'createdBy',
              '==',
              targetUserId
            )
          );

        unsubscribe =
          onSnapshot(
            clientQuery,

            () => {
              loadAllBots();
            },

            (
              error
            ) => {
              console.warn(
                'Client bot listener:',
                error
              );
            }
          );

      }

    } catch (
    error
    ) {

      console.warn(
        'Realtime bot listener failed:',
        error
      );

    }

    /*
     * ==========================================================
     * BOT SAVED EVENT
     * ==========================================================
     */

    const handleBotSaved =
      () => {

        loadAllBots();

      };

    window.addEventListener(
      'mintage_bot_saved',
      handleBotSaved
    );

    /*
     * ==========================================================
     * BOT DELETED EVENT
     * ==========================================================
     */

    const handleBotDeleted =
      () => {

        loadAllBots();

      };

    window.addEventListener(
      'mintage_bot_deleted',
      handleBotDeleted
    );

    /*
     * ==========================================================
     * FALLBACK POLLING
     * ==========================================================
     */

    const interval =
      window.setInterval(
        () => {
          loadAllBots();
        },
        5000
      );

    /*
     * ==========================================================
     * CLEANUP
     * ==========================================================
     */

    return () => {

      cancelled = true;

      if (
        unsubscribe
      ) {
        unsubscribe();
      }

      window.removeEventListener(
        'mintage_bot_saved',
        handleBotSaved
      );

      window.removeEventListener(
        'mintage_bot_deleted',
        handleBotDeleted
      );

      window.clearInterval(
        interval
      );

    };

  }, [
    effectiveUserId,
    isAdmin,
    impersonatedClient,
  ]);

  /*
   * ============================================================
   * DELETE BOT
   * ============================================================
   */

  const confirmDeleteBot =
    async () => {

      if (
        !deletingBot
      ) {
        return;
      }

      setIsDeleting(
        true
      );

      const targetId =
        deletingBot.id;

      try {

        /*
         * SERVER
         */

        try {

          await fetch(
            `/api/bots/${encodeURIComponent(
              targetId
            )}`,
            {
              method:
                'DELETE',
            }
          );

          await fetch(
            '/api/bots/delete',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  id:
                    targetId,
                }),
            }
          );

        } catch (
        error
        ) {

          console.warn(
            'Server delete error:',
            error
          );

        }

        /*
         * FIRESTORE
         */

        await deleteDoc(
          doc(
            db,
            'bot_configurations',
            targetId
          )
        ).catch(
          () => null
        );

        /*
         * DELETED IDS
         */

        const raw =
          localStorage.getItem(
            'mintage_deleted_bot_ids'
          );

        let deletedIds:
          string[] = [];

        if (raw) {

          try {

            const parsed =
              JSON.parse(
                raw
              );

            if (
              Array.isArray(
                parsed
              )
            ) {

              deletedIds =
                parsed.map(
                  String
                );

            }

          } catch {
            deletedIds = [];
          }

        }

        if (
          !deletedIds.includes(
            targetId
          )
        ) {

          deletedIds.push(
            targetId
          );

        }

        localStorage.setItem(
          'mintage_deleted_bot_ids',
          JSON.stringify(
            deletedIds
          )
        );

        /*
         * LOCAL CACHE
         */

        [
          'mintage_bots',
          'botflow_local_bots',
          'mintage_bot_configurations',
        ].forEach(
          (
            key
          ) => {

            const raw =
              localStorage.getItem(
                key
              );

            if (!raw) {
              return;
            }

            try {

              const parsed =
                JSON.parse(
                  raw
                );

              if (
                Array.isArray(
                  parsed
                )
              ) {

                localStorage.setItem(
                  key,
                  JSON.stringify(
                    parsed.filter(
                      (
                        bot: any
                      ) =>
                        bot &&
                        bot.id !==
                        targetId
                    )
                  )
                );

              }

            } catch {
              // Ignore invalid cache.
            }

          }
        );

        /*
         * UPDATE UI
         */

        setBots(
          (
            previous
          ) =>
            previous.filter(
              (
                bot
              ) =>
                bot.id !==
                targetId
            )
        );

        window.dispatchEvent(
          new CustomEvent(
            'mintage_bot_deleted',
            {
              detail: {
                id:
                  targetId,
              },
            }
          )
        );

        setDeletingBot(
          null
        );

      } catch (
      error
      ) {

        console.error(
          'Error deleting bot:',
          error
        );

      } finally {

        setIsDeleting(
          false
        );

      }

    };

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <div className="workspace-page bots-page">

      <header className="page-heading">

        <div>

          <span className="eyebrow">
            Chatbot library
          </span>

          <h1>
            My bots
          </h1>

          <p>
            Open a flow, review its setup,
            or publish a new chatbot.
          </p>

        </div>

        <Link
          to="/builder"
          className="button-primary"
        >
          <Plus />
          New bot
        </Link>

      </header>

      <div className="database-toolbar">

        <div className="database-view is-active">

          <GitBranch />

          All flows

          <span>
            {bots.length}
          </span>

        </div>

        <p className="database-toolbar-note">
          Updated automatically
        </p>

      </div>

      {loading ? (

        <div className="loading-state is-inline">

          <Loader2 className="animate-spin" />

          <span>
            Loading bots…
          </span>

        </div>

      ) : bots.length === 0 ? (

        <div className="empty-state">

          <div className="empty-icon">
            <GitBranch />
          </div>

          <h3>
            No bots in this workspace
          </h3>

          <p>
            Create your first conversational
            flow and publish it when you are ready.
          </p>

          <Link
            to="/builder"
            className="button-primary"
          >
            <Plus />
            Create a bot
          </Link>

        </div>

      ) : (

        <div className="bot-card-grid">

          {bots.map(
            (
              bot
            ) => (

              <article
                key={
                  bot.id
                }
                className="bot-card"
              >

                <div className="bot-card-head">

                  <div className="bot-icon">
                    <GitBranch />
                  </div>

                  <div className="bot-card-actions">

                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/builder/${bot.id}`
                        )
                      }
                      className="icon-button"
                      title="Edit bot flow"
                    >
                      <Edit2 />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setDeletingBot(
                          bot
                        )
                      }
                      className="icon-button danger"
                      title="Delete bot"
                    >
                      <Trash2 />
                    </button>

                  </div>

                </div>

                <div className="bot-title-row">

                  <div className="min-w-0 flex-1">

                    <h3>
                      {bot.name ||
                        'Untitled bot'}
                    </h3>

                    <p>
                      Updated{' '}
                      {formatUpdatedDate(
                        bot.updatedAt
                      )}
                    </p>

                  </div>

                  <span
                    className={`status-pill ${bot.leadsCount &&
                        bot.leadsCount > 0
                        ? 'status-live'
                        : ''
                      }`}
                  >
                    <span />

                    {bot.leadsCount &&
                      bot.leadsCount > 0
                      ? 'Active'
                      : 'Draft'}

                  </span>

                </div>

                <div className="bot-properties">

                  <div>

                    <span>
                      Leads
                    </span>

                    <strong>
                      {bot.leadsCount ||
                        0}
                    </strong>

                  </div>

                  <div>

                    <span>
                      Google Sheet
                    </span>

                    {bot.spreadsheetId ? (

                      <a
                        href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(
                          bot.spreadsheetId
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >

                        <FileSpreadsheet />

                        Connected

                      </a>

                    ) : (

                      <Link
                        to={`/builder/${bot.id}`}
                      >
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
                    href={`/widget/${encodeURIComponent(
                      bot.id
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button-secondary compact"
                  >
                    Preview
                    <ExternalLink />
                  </a>

                </div>

              </article>

            )
          )}

        </div>

      )}

      {deletingBot && (

        <div className="modal-backdrop">

          <div
            className="app-modal is-centered"
            role="dialog"
            aria-modal="true"
          >

            <div className="modal-danger-icon">
              <AlertTriangle />
            </div>

            <h3>
              Delete this bot?
            </h3>

            <p className="mt-1.5">

              <strong>
                “{deletingBot.name}”
              </strong>{' '}

              and its published widget
              endpoint will be permanently removed.

            </p>

            <p className="modal-note">

              Previously captured leads will
              remain available in Lead data.

            </p>

            <div className="modal-actions">

              <button
                type="button"
                onClick={() =>
                  setDeletingBot(
                    null
                  )
                }
                disabled={
                  isDeleting
                }
                className="button-secondary flex-1"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  confirmDeleteBot
                }
                disabled={
                  isDeleting
                }
                className="button-danger flex-1"
              >

                {isDeleting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}

                <span>
                  {isDeleting
                    ? 'Deleting…'
                    : 'Delete bot'}
                </span>

              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function getTimestampMs(
  value: any
): number {

  if (!value) {
    return 0;
  }

  if (
    typeof value?.toMillis ===
    'function'
  ) {

    try {
      return value.toMillis();
    } catch {
      return 0;
    }

  }

  if (
    typeof value?.toDate ===
    'function'
  ) {

    try {
      return value
        .toDate()
        .getTime();
    } catch {
      return 0;
    }

  }

  if (
    typeof value?.seconds ===
    'number'
  ) {

    return (
      value.seconds *
      1000
    );

  }

  if (
    value instanceof Date
  ) {

    return value.getTime();

  }

  if (
    typeof value ===
    'number'
  ) {

    return value;

  }

  const parsed =
    new Date(
      value
    ).getTime();

  return Number.isNaN(
    parsed
  )
    ? 0
    : parsed;
}

function formatUpdatedDate(
  value: any
): string {

  const timestamp =
    getTimestampMs(
      value
    );

  if (!timestamp) {
    return 'recently';
  }

  try {

    return format(
      new Date(
        timestamp
      ),
      'MMM d, yyyy'
    );

  } catch {

    return 'recently';

  }
}