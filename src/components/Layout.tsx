import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Bot,
  ChevronLeft,
  ChevronDown,
  Crown,
  Database,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Briefcase,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MintageLogo from './MintageLogo';
import ThemeToggle from './ThemeToggle';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { logout, isAdmin, impersonatedClient, clientUser, clearImpersonation } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = useMemo(() => {
    const items = [
      { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { name: 'My bots', path: '/bots', icon: Bot },
      { name: 'New bot', path: '/builder', icon: GitBranch },
      { name: 'Integrations', path: '/integrations', icon: MessageSquare },
      { name: 'Lead data', path: '/leads', icon: Database },
    ];

    if (isAdmin && !impersonatedClient && !clientUser) {
      items.unshift({ name: 'Admin console', path: '/admin', icon: ShieldCheck });
    }

    return items;
  }, [clientUser, impersonatedClient, isAdmin]);

  const manageItems = useMemo(() => {
    if (isAdmin && !impersonatedClient && !clientUser) {
      return [
        { name: 'Users', path: '/admin', icon: Users },
        { name: 'Clients', path: '/admin', icon: Briefcase },
        { name: 'Settings', path: '/integrations', icon: Settings },
      ];
    }
    return [
      { name: 'Settings', path: '/integrations', icon: Settings },
    ];
  }, [clientUser, impersonatedClient, isAdmin]);

  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  const sidebar = (
    <aside className="app-sidebar flex h-full shrink-0 flex-col">
      {/* Top Header Logo */}
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2.5">
          <MintageLogo size="sm" variant="light" />
        </div>
        <button
          type="button"
          className="icon-button-subtle text-gray-400 hover:text-white"
          title="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <p className="sidebar-section-label">Workspace</p>
        <div className="flex flex-col gap-1 mb-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/builder'
              ? location.pathname.startsWith('/builder')
              : location.pathname === item.path;

            return (
              <Link
                key={item.name}
                to={item.path}
                className={`sidebar-link ${isActive ? 'is-active' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </div>

        <p className="sidebar-section-label">MANAGE</p>
        <div className="flex flex-col gap-1 mb-6">
          {manageItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className="sidebar-link"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* Upgrade to Pro Card */}
        <div className="sidebar-upgrade-card">
          <div className="flex items-center gap-2 text-[#d4af37] font-semibold text-xs mb-1">
            <Crown className="h-4 w-4 fill-[#d4af37]" />
            <span>Upgrade to Pro</span>
          </div>
          <p className="text-[11.5px] text-gray-400 leading-snug mb-3">
            Unlock advanced analytics, more bots and integrations.
          </p>
          <button type="button" className="sidebar-upgrade-btn">
            <span>Upgrade plan</span>
            <span>&rarr;</span>
          </button>
        </div>
      </nav>

      {/* Footer Log out */}
      <div className="sidebar-footer px-3 py-3">
        <button type="button" onClick={handleLogout} className="sidebar-link text-gray-400 hover:text-white">
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="app-shell flex h-screen flex-col">
      {isAdmin && impersonatedClient && (
        <div className="impersonation-bar shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles />
            <span className="truncate">Viewing {impersonatedClient.name}'s client workspace</span>
          </div>
          <button
            type="button"
            onClick={() => {
              clearImpersonation();
              navigate('/admin');
            }}
          >
            <ArrowLeft />
            Return to admin
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden md:block">{sidebar}</div>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-[120] flex md:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="mobile-nav-backdrop"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="relative h-full shadow-2xl">
              {sidebar}
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileNavOpen(false)}
                className="icon-button absolute right-2 top-2 text-white"
              >
                <X />
              </button>
            </div>
          </div>
        )}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Topbar matching figure */}
          <header className="workspace-topbar shrink-0">
            <div className="flex items-center gap-2 md:hidden">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => setMobileNavOpen(true)}
                className="icon-button"
              >
                <Menu />
              </button>
            </div>

            {/* Central Search Bar */}
            <div className="topbar-search-container flex-1 max-w-lg mx-auto">
              <div className="relative flex items-center">
                <Search className="absolute left-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search bots, users, leads or conversations..."
                  className="topbar-search-input"
                />
                <kbd className="topbar-kbd">⌘K</kbd>
              </div>
            </div>

            {/* Right Profile & Notifications */}
            <div className="flex items-center gap-3">
              <ThemeToggle />

              {/* Notification Bell */}
              <button type="button" className="relative p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 border border-white" />
              </button>

              {/* User Avatar & Label */}
              <div className="flex items-center gap-2.5 pl-2 border-l border-gray-200 dark:border-gray-800">
                <div className="h-8 w-8 rounded-full bg-[#0e1117] text-white flex items-center justify-center font-bold text-xs uppercase">
                  {isAdmin && !impersonatedClient ? 'A' : (clientUser?.name?.[0] || impersonatedClient?.name?.[0] || 'C')}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-bold leading-none text-gray-900 dark:text-white">
                    {isAdmin && !impersonatedClient ? 'Admin' : (clientUser?.name || impersonatedClient?.name || 'Client')}
                  </span>
                  <span className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {isAdmin && !impersonatedClient ? 'Administrator' : (clientUser?.company || impersonatedClient?.company || 'Client Workspace')}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-auto" style={{ background: 'var(--bg)' }}>
            {children}
          </main>
        </section>
      </div>
    </div>
  );
}

