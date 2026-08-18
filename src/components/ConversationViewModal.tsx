import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { X, MessageSquare, Bot, User, Clock, Loader2, Sparkles } from 'lucide-react';
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
    <div className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-2xl flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <span>Conversation Transcript</span>
                {userName && <span className="text-xs text-indigo-300 font-normal">({userName})</span>}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                ID: {conversationId}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Transcript Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-2">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">Loading chat transcript...</p>
              </div>
            </div>
          ) : error ? (
            <div className="p-8 text-center bg-red-50 rounded-2xl border border-red-100 text-red-700 text-xs font-bold">
              {error}
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center p-8">
              <div>
                <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600">No messages recorded in this conversation.</p>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender === 'user';
              const isSystem = msg.sender === 'system';
              const dateObj = msg.timestamp ? new Date(msg.timestamp) : new Date();
              const timeFormatted = isNaN(dateObj.getTime()) ? '' : format(dateObj, 'MMM d, yyyy • HH:mm:ss');

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-3 py-1 rounded-full uppercase tracking-wider">
                      {msg.message} • {timeFormatted}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 shadow-sm mt-1">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[78%] space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-tr-none font-medium'
                          : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none font-medium'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                    </div>

                    <div className={`flex items-center gap-1.5 px-1 text-[10px] text-slate-400 font-medium ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <Clock className="w-3 h-3 text-slate-300" />
                      <span>{timeFormatted}</span>
                      <span className="uppercase font-bold text-[9px] text-slate-400 ml-1">
                        [{msg.sender}]
                      </span>
                    </div>
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center shrink-0 shadow-sm mt-1">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-medium">
            Total Messages: <strong className="text-slate-700">{messages.length}</strong>
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
