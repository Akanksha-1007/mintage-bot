import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, onSnapshot } from 'firebase/firestore';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Loader2,
  Mail,
  Phone,
  Search,
  User,
} from 'lucide-react';
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
    <section className="chatbot-directory-card">
      <div className="directory-heading">
        <div className="directory-title-icon"><User /></div>
        <div className="min-w-0">
          <span className="directory-eyebrow">Workspace database</span>
          <h3>People and conversations</h3>
          <p>Every identified visitor and their latest chatbot activity.</p>
        </div>
        <div className="directory-view-pill"><span />Table view</div>
      </div>

      {/* Controls */}
      <div className="table-toolbar">
        <label className="search-field" style={{ width: 'min(100%, 300px)' }}>
          <Search />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="Search by name, email or phone…"
            className="input"
            aria-label="Search chatbot users"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-select">
            <Filter />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              aria-label="Filter by status"
            >
              <option value="ALL">All statuses ({users.length})</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>

          <label className="inline-select">
            <ArrowUpDown />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort users"
            >
              <option value="lastActiveAt">Last active</option>
              <option value="createdAt">Created date</option>
              <option value="totalMessages">Message count</option>
              <option value="totalConversations">Conversation count</option>
            </select>
          </label>

          <button type="button" onClick={exportCSV} className="button-secondary">
            <Download />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Directory table */}
      {loading ? (
        <div className="loading-state is-inline">
          <Loader2 className="animate-spin" />
          <span>Loading chatbot users…</span>
        </div>
      ) : paginatedUsers.length === 0 ? (
        <div style={{ padding: '20px' }}>
          <div className="empty-state">
            <div className="empty-icon"><User /></div>
            <h4>No chatbot users found</h4>
            <p>No records match your current search or filter.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Contact</th>
                <th>Conversations</th>
                <th>Messages</th>
                <th>Last active</th>
                <th>Status</th>
                <th className="cell-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr key={user.id}>
                  {/* Profile */}
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="avatar-initial">
                        {(user.name || 'U').substring(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <span className="cell-title block truncate">{user.name || 'Anonymous user'}</span>
                        <span className="cell-sub text-mono">{user.id}</span>
                      </div>
                    </div>
                  </td>

                  {/* Contact */}
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="truncate">
                        {user.email || <span className="cell-empty">No email</span>}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Phone className="h-3 w-3 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="truncate">
                        {user.phone || <span className="cell-empty">No phone</span>}
                      </span>
                    </div>
                  </td>

                  {/* Counts */}
                  <td><span className="tag">{user.totalConversations || 1}</span></td>
                  <td><span className="tag">{user.totalMessages || 0}</span></td>

                  {/* Last active */}
                  <td>
                    <span className="cell-title block whitespace-nowrap">
                      {user.lastActiveAt ? format(new Date(user.lastActiveAt), 'MMM d, yyyy') : 'Recently'}
                    </span>
                    <span className="cell-sub">
                      {user.lastActiveAt ? format(new Date(user.lastActiveAt), 'HH:mm') : ''}
                    </span>
                  </td>

                  {/* Status */}
                  <td>
                    <span className={`status-pill ${user.status === 'active' || !user.status ? 'tone-green' : ''}`}>
                      <span />
                      {user.status || 'Active'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="cell-right">
                    <button
                      type="button"
                      onClick={() => onSelectUser(user.id)}
                      className="button-secondary compact"
                    >
                      <Eye />
                      <span>View history</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="table-footer">
        <p>
          Showing {paginatedUsers.length} of {filteredUsers.length} users
        </p>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="icon-button bordered"
            aria-label="Previous page"
          >
            <ChevronLeft />
          </button>
          <span className="text-muted px-1.5 text-[12px]">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="icon-button bordered"
            aria-label="Next page"
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </section>
  );
}
