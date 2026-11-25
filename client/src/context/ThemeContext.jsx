import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ThemeContext = createContext({ theme: 'light', toggle: () => {} });
const KEY = 'accessflow-theme';
// The sign-in pages have their own fixed design, so dark mode only applies inside the app.
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

// Storage can be blocked (private mode, strict settings), so every access is guarded.
const read = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* fall through to the system setting */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(read);
  const { pathname } = useLocation();
  const applied = AUTH_PATHS.some((p) => pathname.startsWith(p)) ? 'light' : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', applied === 'dark');
    document.documentElement.style.colorScheme = applied;
  }, [applied]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch { /* the choice just will not be remembered */ }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
