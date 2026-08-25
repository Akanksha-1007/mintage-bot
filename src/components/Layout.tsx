import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  ChevronsUpDown,
  Database,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
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

  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  const activeItem = navItems.find((item) =>
    item.path === '/builder'
      ? location.pathname.startsWith('/builder')
      : location.pathname === item.path,
  );

  const workspaceName = impersonatedClient?.name || clientUser?.name || (isAdmin ? 'Admin workspace' : 'Mintage workspace');
  const workspaceDetail = impersonatedClient?.email || clientUser?.email || (isAdmin ? 'Administrator' : 'Personal workspace');

  const sidebar = (
    <aside className="notion-sidebar flex h-full shrink-0 flex-col">
      <div className="px-2 pt-2">
        <button type="button" className="workspace-switcher">
          <MintageLogo size="sm" />
          <ChevronsUpDown />
        </button>
      </div>

      <div className="sidebar-divider" />

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <p className="sidebar-section-label">Workspace</p>
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/builder'
              ? location.pathname.startsWith('/builder')
              : location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-link ${isActive ? 'is-active' : ''}`}
              >
                <Icon />
                <span className="truncate">{item.name}</span>
                {item.path === '/admin' && <span className="sidebar-badge">Admin</span>}
              </Link>
            );
          })}
        </div>

        <p className="sidebar-section-label">Workspace details</p>
        <div className="sidebar-workspace-card">
          <strong>{workspaceName}</strong>
          <span>{workspaceDetail}</span>
        </div>
      </nav>

      <div className="sidebar-footer">
        <button type="button" onClick={handleLogout} className="sidebar-link">
          <LogOut />
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
                className="icon-button absolute right-2 top-2"
              >
                <X />
              </button>
            </div>
          </div>
        )}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="workspace-topbar shrink-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => setMobileNavOpen(true)}
                className="icon-button md:hidden"
              >
                <Menu />
              </button>
              <div className="breadcrumb">
                <span className="crumb-root hidden sm:inline">Mintage</span>
                <span className="crumb-sep hidden sm:inline">/</span>
                <span className="crumb-current">{activeItem?.name || 'Workspace'}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="topbar-search hidden sm:inline-flex">
                <Search />
                <span>Search workspace</span>
                <kbd>⌘K</kbd>
              </button>
              <ThemeToggle />
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
