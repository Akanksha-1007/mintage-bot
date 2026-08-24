import { useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light';
  const storedTheme = window.localStorage.getItem('mintage_theme');
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('mintage_theme', theme);
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle ${isDark ? 'is-dark' : ''} ${className}`.trim()}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <Sun className="theme-icon theme-icon-sun" />
        <Moon className="theme-icon theme-icon-moon" />
      </span>
    </button>
  );
}
