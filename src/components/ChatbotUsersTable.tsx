import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, onSnapshot } from 'firebase/firestore';
import { Search, Filter, Download, ArrowUpDown, ChevronLeft, ChevronRight, User, Mail, Phone, Calendar, Clock, Eye, ShieldCheck, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface ChatbotUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  lastActiveAt: string;
  status: string;
  totalConversations: number;
  totalMessages: number;
  source?: string;
  consent?: boolean;
}

interface ChatbotUsersTableProps {
  onSelectUser: (userId: string) => void;
}

export default function ChatbotUsersTable({ onSelectUser }: ChatbotUsersTableProps) {
  const [users, setUsers] = useState<ChatbotUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'lastActiveAt' | 'createdAt' | 'totalMessages' | 'totalConversations'>('lastActiveAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadUsers = async () => {
    setLoading(true);
    let fetchedUsers: ChatbotUser[] = [];

    // Read static fallback file or API
    try {
      const res = await fetch(`/api/chatbot/users?limit=200`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          fetchedUsers = data.users;
        }
      }
    } catch (e) {
      console.warn('API fetch chatbot users notice:', e);
    }

    // Firestore fallback
    let firestoreUsers: ChatbotUser[] = [];
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'chatbot_users')).catch(() => null);
        if (snap && !snap.empty) {
          firestoreUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ChatbotUser[];
        }
      } catch (e) {}
    }

    const map = new Map<string, ChatbotUser>();
    fetchedUsers.forEach(u => map.set(u.id, u));
    firestoreUsers.forEach(u => map.set(u.id, u));

    const finalUsers = Array.from(map.values());
    setUsers(finalUsers);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = onSnapshot(collection(db, 'chatbot_users'), () => loadUsers(), () => {});
    } catch (e) {}

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        if (event.data && !event.data.startsWith(':')) {
          loadUsers();
        }
      };
    } catch (e) {}

    return () => {
      if (unsubscribe) unsubscribe();
      if (eventSource) eventSource.close();
    };
  }, []);

  // Filter & Sort Users
  const filteredUsers = users.filter(u => {
    if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q) ||
        (u.id || '').toLowerCase().includes(q) ||
        (u.source || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  filteredUsers.sort((a, b) => {
    let valA: any = a[sortBy] || '';
    let valB: any = b[sortBy] || '';
    if (sortBy === 'totalMessages' || sortBy === 'totalConversations') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const exportCSV = () => {
    const headers = ['User ID', 'Name', 'Email', 'Phone', 'Conversations', 'Messages', 'Created At', 'Last Active At', 'Status', 'Source'];
    const rows = filteredUsers.map(u => [
      `"${u.id}"`,
      `"${(u.name || '').replace(/"/g, '""')}"`,
      `"${(u.email || '').replace(/"/g, '""')}"`,
      `"${(u.phone || '').replace(/"/g, '""')}"`,
      u.totalConversations || 1,
      u.totalMessages || 0,
      `"${u.createdAt ? format(new Date(u.createdAt), 'yyyy-MM-dd HH:mm') : ''}"`,
      `"${u.lastActiveAt ? format(new Date(u.lastActiveAt), 'yyyy-MM-dd HH:mm') : ''}"`,
      `"${u.status || 'active'}"`,
      `"${(u.source || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `chatbot_users_${format(new Date(), 'yyyy_MM_dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4 p-6 font-sans">
      {/* Controls Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-100">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="Search users by name, email, phone..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="bg-transparent outline-none cursor-pointer"
            >
              <option value="ALL">All Status ({users.length})</option>
              <option value="active">Active Users</option>
              <option value="inactive">Inactive Users</option>
              <option value="blocked">Blocked Users</option>
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent outline-none cursor-pointer"
            >
              <option value="lastActiveAt">Sort: Last Active</option>
              <option value="createdAt">Sort: Created Date</option>
              <option value="totalMessages">Sort: Message Count</option>
              <option value="totalConversations">Sort: Conversation Count</option>
            </select>
          </div>

          {/* Export CSV */}
          <button
            onClick={exportCSV}
            className="px-4 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Directory Table */}
      {loading ? (
        <div className="p-16 text-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">Loading chatbot users directory...</p>
        </div>
      ) : paginatedUsers.length === 0 ? (
        <div className="p-16 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <User className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-700">No Chatbot Users Found</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            No chatbot user records match your search or filter criteria.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50/60 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-left">
                <th className="px-6 py-4">Chatbot User</th>
                <th className="px-6 py-4">Contact Info</th>
                <th className="px-6 py-4">Conversations</th>
                <th className="px-6 py-4">Messages</th>
                <th className="px-6 py-4">Last Active</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-indigo-50/30 transition-colors">
                  {/* User Profile */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                        {(user.name || 'U').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{user.name || 'Anonymous User'}</p>
                        <p className="text-[10px] font-mono text-slate-400">ID: {user.id}</p>
                      </div>
                    </div>
                  </td>

                  {/* Contact Info */}
                  <td className="px-6 py-4 space-y-1">
                    <div className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{user.email || <span className="text-slate-300 italic font-normal">No email</span>}</span>
                    </div>
                    <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{user.phone || <span className="text-slate-300 italic font-normal">No phone</span>}</span>
                    </div>
                  </td>

                  {/* Conversations Count */}
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold">
                      {user.totalConversations || 1} Conv
                    </span>
                  </td>

                  {/* Messages Count */}
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold">
                      {user.totalMessages || 0} Msgs
                    </span>
                  </td>

                  {/* Last Active */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800">
                        {user.lastActiveAt ? format(new Date(user.lastActiveAt), 'MMM d, yyyy') : 'Recently'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {user.lastActiveAt ? format(new Date(user.lastActiveAt), 'HH:mm aaa') : ''}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      user.status === 'active' || !user.status ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {user.status || 'Active'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onSelectUser(user.id)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View History</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-500 font-medium">
          Showing <strong className="text-slate-800">{paginatedUsers.length}</strong> of <strong className="text-slate-800">{filteredUsers.length}</strong> users
        </p>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-slate-700 px-3">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
