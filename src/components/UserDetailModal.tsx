import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { X, User, Mail, Phone, Calendar, Clock, MessageSquare, ShieldCheck, ExternalLink, Loader2, ArrowRight } from 'lucide-react';
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
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-8 space-y-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {loading ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Fetching user profile & conversation history...</p>
          </div>
        ) : error || !user ? (
          <div className="py-16 text-center bg-red-50 rounded-2xl border border-red-100 text-red-700 text-xs font-bold">
            {error || 'User not found.'}
          </div>
        ) : (
          <>
            {/* Header: User Identification */}
            <div className="flex items-start gap-4 pb-6 border-b border-slate-100">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-3xl flex items-center justify-center text-xl font-extrabold shadow-lg shadow-indigo-200 shrink-0">
                {(user.name || 'U').substring(0, 2).toUpperCase()}
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">{user.name || 'Anonymous User'}</h3>
                  <span className={`px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    user.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {user.status || 'Active'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">User ID: {user.id}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="font-medium truncate">Source: {user.source || 'Website Chat Widget'}</span>
                </div>
              </div>
            </div>

            {/* User Profile Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <Mail className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Email Address</span>
                </div>
                <p className="text-xs font-bold text-slate-900 truncate">
                  {user.email || <span className="text-slate-400 italic font-normal">Not provided</span>}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <Phone className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Phone Number</span>
                </div>
                <p className="text-xs font-bold text-slate-900 truncate">
                  {user.phone || <span className="text-slate-400 italic font-normal">Not provided</span>}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Registration Date</span>
                </div>
                <p className="text-xs font-bold text-slate-900">
                  {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : 'Recently'}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Last Active</span>
                </div>
                <p className="text-xs font-bold text-slate-900">
                  {user.lastActiveAt ? format(new Date(user.lastActiveAt), 'MMM d, HH:mm') : 'Recently'}
                </p>
              </div>
            </div>

            {/* Additional User Stats & Consent */}
            <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-indigo-400 font-bold text-[10px] uppercase block">Total Conversations</span>
                  <span className="text-indigo-950 font-black text-sm">{user.totalConversations || conversations.length || 1}</span>
                </div>
                <div className="h-6 w-px bg-indigo-200" />
                <div>
                  <span className="text-indigo-400 font-bold text-[10px] uppercase block">Total Messages</span>
                  <span className="text-indigo-950 font-black text-sm">{user.totalMessages || 0}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-indigo-100 text-indigo-900 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Consent Status: {user.consent ? 'Granted' : 'Pending'}</span>
              </div>
            </div>

            {/* Conversations History List */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <span>Conversation History ({conversations.length})</span>
                </h4>
              </div>

              {conversations.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs font-medium text-slate-500">
                  No conversation sessions recorded for this user yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {conversations.map((conv, idx) => {
                    const startedStr = conv.startedAt ? format(new Date(conv.startedAt), 'MMM d, yyyy • HH:mm') : 'Recent';
                    const lastMsgStr = conv.lastMessageAt ? format(new Date(conv.lastMessageAt), 'MMM d, yyyy • HH:mm') : 'Recent';

                    return (
                      <div
                        key={conv.id || idx}
                        onClick={() => onSelectConversation(conv.id)}
                        className="p-4 bg-white hover:bg-indigo-50/50 rounded-2xl border border-slate-200/80 hover:border-indigo-300 transition-all cursor-pointer flex items-center justify-between gap-4 group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">Conversation #{conversations.length - idx}</span>
                            <span className="text-[10px] font-mono text-slate-400">({conv.id})</span>
                          </div>
                          <p className="text-[11px] text-slate-500 flex items-center gap-3">
                            <span>Started: <strong>{startedStr}</strong></span>
                            <span>•</span>
                            <span>Last Active: <strong>{lastMsgStr}</strong></span>
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold">
                            {conv.messageCount || 0} Messages
                          </span>
                          <div className="p-2 bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-600 rounded-xl transition-colors">
                            <ArrowRight className="w-4 h-4" />
                          </div>
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
