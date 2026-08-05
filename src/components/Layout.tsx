import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, GitBranch, Database, LogOut, MessageSquare, Bot, ShieldCheck, Zap, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import MintageLogo from './MintageLogo';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, isAdmin, impersonatedClient, clientUser, clearImpersonation } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'My Bots', path: '/bots', icon: Bot },
    { name: 'New Bot', path: '/builder', icon: GitBranch },
    { name: 'Integrations', path: '/integrations', icon: MessageSquare },
    { name: 'Lead Data', path: '/leads', icon: Database },
  ];

  // ONLY show Admin Console in sidebar if user is an Admin AND NOT currently in client view or client login
  if (isAdmin && !impersonatedClient && !clientUser) {
    navItems.unshift({ name: 'Admin Console', path: '/admin', icon: ShieldCheck });
  }

  return (
    <div className="flex h-screen bg-gray-50 flex-col">
      {/* Top Impersonation Notification Banner (Only for Admin impersonating client) */}
      {isAdmin && impersonatedClient && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 text-white px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-md z-50 text-xs font-bold shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-200 animate-bounce" />
            <span>
              VIEWING CLIENT WORKSPACE: <strong className="underline underline-offset-2">{impersonatedClient.name}</strong> ({impersonatedClient.email})
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                clearImpersonation();
                navigate('/admin');
              }}
              className="px-3 py-1 bg-black/20 hover:bg-black/40 text-white border border-white/20 rounded-lg transition-all flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Exit Client View & Return to Admin
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-5 border-b border-gray-200">
            <MintageLogo size="md" showSubtitle={true} />
            {impersonatedClient ? (
              <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mt-2 bg-amber-50 px-2 py-1 rounded border border-amber-100 truncate">
                Client View: {impersonatedClient.name}
              </p>
            ) : clientUser ? (
              <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mt-2 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 truncate">
                Client: {clientUser.name}
              </p>
            ) : isAdmin ? (
              <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider mt-2 bg-purple-50 px-2 py-1 rounded border border-purple-100 truncate">
                Admin Console
              </p>
            ) : null}
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const isAdminItem = item.path === '/admin';

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20 font-bold'
                      : isAdminItem
                        ? 'text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 font-bold'
                        : 'text-slate-600 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs tracking-wide">{item.name}</span>
                  {isAdminItem && (
                    <span className="ml-auto text-[9px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded uppercase font-black">
                      Admin
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 w-full text-left text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors text-xs font-bold"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
