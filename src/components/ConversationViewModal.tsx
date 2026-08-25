import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { X, MessageSquare, Bot, User, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface Message {
  id: string;
  sender: 'bot' | 'user' | 'system';
  message: string;
  timestamp: string;
  messageType?: string;
  metadata?: any;
}

interface ConversationViewModalProps {
  conversationId: string | null;
  onClose: () => void;
  userName?: string;
}

export default function ConversationViewModal({ conversationId, onClose, userName }: ConversationViewModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    setLoading(true);

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/chatbot/conversations/${encodeURIComponent(conversationId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.messages)) {
            setMessages(data.messages);
            setError(null);
          }
        }
      } catch (err: any) {
        console.warn('API fetch conversation notice:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    // Firestore real-time listener if available
    let unsubscribe: (() => void) | null = null;
    try {
      const q = query(collection(db, 'conversations', conversationId, 'messages'), orderBy('timestamp', 'asc'));
      unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const fsMsgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Message[];
          setMessages(prev => {
            const map = new Map<string, Message>();
            prev.forEach(m => map.set(m.id, m));
            fsMsgs.forEach(m => map.set(m.id, m));
            const merged = Array.from(map.values());
            merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            return merged;
          });
          setLoading(false);
        }
      }, () => {});
    } catch (e) {}

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [conversationId]);

  if (!conversationId) return null;

  return (
    <div className="modal-backdrop">
      <div className="transcript-modal">
        {/* Header */}
        <div className="transcript-head">
          <div className="modal-head-main">
            <span className="icon-tile"><MessageSquare /></span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold">
                Conversation transcript
                {userName && <span className="text-muted ml-1.5 text-[12.5px] font-normal">({userName})</span>}
              </h3>
              <p className="text-faint text-mono truncate">{conversationId}</p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="icon-button" aria-label="Close">
            <X />
          </button>
        </div>

        {/* Transcript */}
        <div className="transcript-body">
          {loading ? (
            <div className="loading-state">
              <Loader2 className="animate-spin" />
              <span>Loading transcript…</span>
            </div>
          ) : error ? (
            <div className="callout tone-red">
              <span>{error}</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state" style={{ margin: 'auto' }}>
              <div className="empty-icon"><MessageSquare /></div>
              <h4>No messages recorded</h4>
              <p>This conversation has no stored messages yet.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender === 'user';
              const isSystem = msg.sender === 'system';
              const dateObj = msg.timestamp ? new Date(msg.timestamp) : new Date();
              const timeFormatted = isNaN(dateObj.getTime()) ? '' : format(dateObj, 'MMM d, yyyy · HH:mm');

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="transcript-system">{msg.message} · {timeFormatted}</span>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`transcript-row ${isUser ? 'is-user' : ''}`}>
                  {!isUser && (
                    <span className="transcript-avatar"><Bot /></span>
                  )}

                  <div className="min-w-0 max-w-[78%]">
                    <div className={`chat-bubble ${isUser ? '' : ''}`} style={isUser ? { background: 'var(--accent)', color: 'var(--text-on-accent)', borderColor: 'transparent' } : undefined}>
                      <p>{msg.message}</p>
                    </div>

                    <div className={`transcript-meta ${isUser ? 'justify-end' : ''}`}>
                      <Clock />
                      <span>{timeFormatted}</span>
                    </div>
                  </div>

                  {isUser && (
                    <span className="transcript-avatar"><User /></span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="table-footer">
          <p>{messages.length} {messages.length === 1 ? 'message' : 'messages'}</p>
          <button type="button" onClick={onClose} className="button-secondary compact">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
