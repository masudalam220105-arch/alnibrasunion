'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  THEME_STORAGE_KEY,
  getNextDarkLightTheme,
  parseStoredThemeMode,
  resolveThemeMode,
  type ResolvedTheme,
  type ThemeMode,
} from '@/lib/theme-utils';

export type { ThemeMode, ResolvedTheme };

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  mounted: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const noopSubscribe = () => () => {};

function getSystemThemeSnapshot(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribeSystemTheme(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      return parseStoredThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return 'light';
    }
  });

  const systemTheme = useSyncExternalStore<ResolvedTheme>(
    subscribeSystemTheme,
    getSystemThemeSnapshot,
    () => 'light'
  );

  const resolvedTheme: ResolvedTheme = resolveThemeMode(theme, systemTheme === 'dark');

  // Synchronize Tailwind '.dark' / '.light' class on <html> and persist preference in localStorage
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    root.setAttribute('data-theme', resolvedTheme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme, resolvedTheme, mounted]);

  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // Ignore storage access errors
      }
    }
  };

  const toggleTheme = () => {
    const nextTheme = getNextDarkLightTheme(resolvedTheme);
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, mounted, setTheme, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
