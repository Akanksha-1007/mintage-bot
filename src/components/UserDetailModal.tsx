import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { X, Mail, Phone, Calendar, Clock, MessageSquare, ShieldCheck, ExternalLink, Loader2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

interface UserDetailModalProps {
  userId: string | null;
  onClose: () => void;
  onSelectConversation: (convId: string) => void;
}

export default function UserDetailModal({ userId, onClose, onSelectConversation }: UserDetailModalProps) {
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    const fetchUserDetails = async () => {
      try {
        const res = await fetch(`/api/chatbot/users/${encodeURIComponent(userId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setUser(data.user);
            setConversations(data.conversations || []);
            setError(null);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('API fetch user details notice:', err);
      }

      // Firestore Fallback
      if (db) {
        try {
          const uSnap = await getDoc(doc(db, 'chatbot_users', userId)).catch(() => null);
          if (uSnap && uSnap.exists()) {
            setUser({ id: uSnap.id, ...uSnap.data() });
          }

          const q = query(collection(db, 'conversations'), where('userId', '==', userId));
          const cSnap = await getDocs(q).catch(() => null);
          if (cSnap && !cSnap.empty) {
            setConversations(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          }
          setError(null);
        } catch (e: any) {
          setError('Unable to load user details.');
        }
      } else {
        setError('User details not found.');
      }
      setLoading(false);
    };

    fetchUserDetails();
  }, [userId]);

  if (!userId) return null;

  return (
    <div className="modal-backdrop">
      <div className="notion-modal is-xl">
        {loading ? (
          <div className="loading-state">
            <Loader2 className="animate-spin" />
            <span>Loading profile and conversation history…</span>
          </div>
        ) : error || !user ? (
          <>
            <div className="modal-head">
              <h3>User</h3>
              <button type="button" onClick={onClose} className="icon-button" aria-label="Close">
                <X />
              </button>
            </div>
            <div className="callout tone-red">
              <span>{error || 'User not found.'}</span>
            </div>
          </>
        ) : (
          <>
            {/* Identity */}
            <div className="modal-head">
              <div className="modal-head-main">
                <span className="avatar-initial avatar-lg">
                  {(user.name || 'U').substring(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3>{user.name || 'Anonymous user'}</h3>
                    <span className={`status-pill ${user.status === 'active' ? 'tone-green' : ''}`}>
                      <span />
                      {user.status || 'Active'}
                    </span>
                  </div>
                  <p className="text-mono text-faint mt-0.5">{user.id}</p>
                  <p className="text-muted mt-1 inline-flex items-center gap-1.5 text-[12px]">
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate">Source: {user.source || 'Website chat widget'}</span>
                  </p>
                </div>
              </div>

              <button type="button" onClick={onClose} className="icon-button" aria-label="Close">
                <X />
              </button>
            </div>

            {/* Profile fields */}
            <div className="lead-detail-grid">
              <div className="lead-detail-field">
                <span className="inline-flex items-center gap-1.5"><Mail className="h-3 w-3" />Email</span>
                <strong className="truncate">
                  {user.email || <span className="cell-empty">Not provided</span>}
                </strong>
              </div>

              <div className="lead-detail-field">
                <span className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3" />Phone</span>
                <strong className="truncate">
                  {user.phone || <span className="cell-empty">Not provided</span>}
                </strong>
              </div>

              <div className="lead-detail-field">
                <span className="inline-flex items-center gap-1.5"><Calendar className="h-3 w-3" />Registered</span>
                <strong>{user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : 'Recently'}</strong>
              </div>

              <div className="lead-detail-field">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" />Last active</span>
                <strong>{user.lastActiveAt ? format(new Date(user.lastActiveAt), 'MMM d, HH:mm') : 'Recently'}</strong>
              </div>
            </div>

            {/* Engagement summary */}
            <div className="sync-row" style={{ marginTop: '12px' }}>
              <div className="flex flex-wrap items-center gap-5">
                <div>
                  <span className="text-faint block text-[10.5px] font-semibold uppercase tracking-[0.05em]">
                    Conversations
                  </span>
                  <strong className="text-ink text-[15px] font-semibold">
                    {user.totalConversations || conversations.length || 1}
                  </strong>
                </div>
                <div>
                  <span className="text-faint block text-[10.5px] font-semibold uppercase tracking-[0.05em]">
                    Messages
                  </span>
                  <strong className="text-ink text-[15px] font-semibold">{user.totalMessages || 0}</strong>
                </div>
              </div>

              <span className={`status-pill ${user.consent ? 'tone-green' : 'tone-yellow'}`}>
                <ShieldCheck />
                Consent {user.consent ? 'granted' : 'pending'}
              </span>
            </div>

            {/* Conversation history */}
            <div className="modal-section">
              <p className="modal-section-title">
                <MessageSquare />
                Conversation history ({conversations.length})
              </p>

              {conversations.length === 0 ? (
                <div className="empty-state" style={{ padding: '28px 20px' }}>
                  <p>No conversation sessions recorded for this user yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {conversations.map((conv, idx) => {
                    const startedStr = conv.startedAt ? format(new Date(conv.startedAt), 'MMM d, yyyy · HH:mm') : 'Recent';
                    const lastMsgStr = conv.lastMessageAt ? format(new Date(conv.lastMessageAt), 'MMM d, yyyy · HH:mm') : 'Recent';

                    return (
                      <div
                        key={conv.id || idx}
                        onClick={() => onSelectConversation(conv.id)}
                        className="conversation-row"
                      >
                        <div className="min-w-0">
                          <strong>Conversation #{conversations.length - idx}</strong>
                          <p>
                            <span>Started {startedStr}</span>
                            <span>Last active {lastMsgStr}</span>
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className="tag">{conv.messageCount || 0} messages</span>
                          <span className="icon-button bordered"><ArrowRight /></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
