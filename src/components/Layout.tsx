import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Database,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MintageLogo from './MintageLogo';

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
    <aside className="notion-sidebar flex h-full w-[248px] shrink-0 flex-col border-r border-[#e8e8e5] bg-[#f7f7f5]">
      <div className="px-2 pt-2">
        <button className="workspace-switcher flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left">
          <MintageLogo size="sm" />
          <ChevronDown className="h-3.5 w-3.5 text-[#9b9a97]" />
        </button>
      </div>

      <div className="mx-3 my-2 border-t border-[#e6e6e3]" />

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <p className="sidebar-section-label px-2 pb-1 pt-2">Workspace</p>
        <div className="space-y-0.5">
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
                <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} />
                <span className="truncate">{item.name}</span>
                {item.path === '/admin' && <span className="sidebar-badge">Admin</span>}
              </Link>
            );
          })}
        </div>

        <p className="sidebar-section-label mt-5 px-2 pb-1 pt-2">Workspace details</p>
        <div className="mx-1 rounded-md border border-[#e4e4e1] bg-white/60 px-3 py-2.5">
          <p className="truncate text-[12px] font-medium text-[#37352f]">{workspaceName}</p>
          <p className="mt-0.5 truncate text-[11px] text-[#9b9a97]">{workspaceDetail}</p>
        </div>
      </nav>

      <div className="border-t border-[#e6e6e3] p-2">
        <button onClick={handleLogout} className="sidebar-link w-full text-left">
          <LogOut className="h-[17px] w-[17px]" strokeWidth={1.8} />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="app-shell flex h-screen flex-col bg-white text-[#37352f]">
      {isAdmin && impersonatedClient && (
        <div className="flex shrink-0 flex-col items-center justify-between gap-2 border-b border-[#e7d7b7] bg-[#fbf3db] px-4 py-2 text-[12px] text-[#64473a] sm:flex-row">
          <div className="flex min-w-0 items-center gap-2">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Viewing {impersonatedClient.name}'s client workspace</span>
          </div>
          <button
            onClick={() => {
              clearImpersonation();
              navigate('/admin');
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium hover:bg-black/5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Return to admin
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden md:block">{sidebar}</div>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-[120] flex md:hidden">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/25"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="relative h-full shadow-2xl">
              {sidebar}
              <button
                aria-label="Close navigation"
                onClick={() => setMobileNavOpen(false)}
                className="absolute right-2 top-2 rounded-md p-1.5 text-[#787774] hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="workspace-topbar flex h-11 shrink-0 items-center justify-between border-b border-[#eeeeec] bg-white px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                aria-label="Open navigation"
                onClick={() => setMobileNavOpen(true)}
                className="rounded-md p-1.5 text-[#787774] hover:bg-[#f1f1ef] md:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="hidden text-[12px] text-[#9b9a97] sm:inline">Mintage</span>
              <span className="hidden text-[#c5c4c1] sm:inline">/</span>
              <span className="truncate text-[12px] font-medium text-[#37352f]">{activeItem?.name || 'Workspace'}</span>
            </div>
            <button className="topbar-search hidden items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-[#9b9a97] hover:bg-[#f7f7f5] sm:flex">
              <Search className="h-3.5 w-3.5" />
              <span>Search workspace</span>
              <kbd>⌘ K</kbd>
            </button>
          </header>

          <main className="mintage-page-shell min-h-0 flex-1 overflow-auto bg-white">
            {children}
          </main>
        </section>
      </div>
    </div>
  );
}
