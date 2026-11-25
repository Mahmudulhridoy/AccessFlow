import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Icon from './Icon';
import Logo from './Logo';

const NAV = {
  USER: [
    {
      section: 'Navigation',
      items: [{ to: '/dashboard', also: '/projects', label: 'My Projects', icon: 'folder' }],
    },
  ],
  ADMIN: [
    {
      section: 'Platform',
      items: [
        { to: '/admin/scans', label: 'All Scans', icon: 'globe' },
        { to: '/admin/ml', label: 'ML Evaluation', icon: 'check' },
      ],
    },
  ],
};

function SidebarContent() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-full flex-col p-4 text-[#c4c9e4]">
      <div className="px-2 pb-4">
        <Logo light />
      </div>

      <nav aria-label="Main" className="flex-1">
        {NAV[user.role].map((group) => (
          <div key={group.section}>
            <p className="mx-2 mb-2 mt-4 text-[11px] font-medium uppercase tracking-widest text-[#9298bd]">
              {group.section}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.to || (item.also && pathname.startsWith(item.also));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 ${
                    active ? 'bg-brand/25 text-white shadow-[inset_3px_0_0_#7b6cf6]' : 'hover:bg-white/5'
                  }`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 pt-4 text-[13px]">
        <p className="break-all font-semibold text-white">{user.email}</p>
        <p className="mt-1">{user.role === 'ADMIN' ? 'Admin account' : 'User account'}</p>
        <button onClick={handleLogout} className="mt-2 flex min-h-11 items-center gap-3 hover:text-white">
          <Icon name="out" />
          Log out
        </button>
      </div>
    </div>
  );
}

export default function AppLayout({ title, children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <aside data-app-sidebar className="hidden w-62 shrink-0 bg-navy md:block">
        <SidebarContent />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <aside className="w-62 bg-navy">
            <SidebarContent />
          </aside>
          <button aria-label="Close menu" onClick={() => setOpen(false)} className="flex-1 bg-black/50" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-app-header className="flex h-16 items-center gap-3 border-b border-line bg-white px-4 md:px-6">
          <button
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-[10px] border border-[#e1e4ef] md:hidden"
          >
            <Icon name="menu" />
          </button>
          <p className="text-base font-bold">{title}</p>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={theme === 'dark'}
            className="ml-auto grid h-10 w-10 place-items-center rounded-full border border-line text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="sr-only">Dark mode</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[18px] w-[18px]">
              {theme === 'dark' ? (
                <>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </>
              ) : (
                <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
              )}
            </svg>
          </button>
          <div
            className="grid h-10 w-10 place-items-center rounded-full bg-brand font-bold text-white"
            aria-hidden="true"
          >
            {user.email[0].toUpperCase()}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
        <footer data-app-footer className="px-6 pb-6 text-[13px] text-muted">© 2026 AccessFlow</footer>
      </div>
    </div>
  );
}
