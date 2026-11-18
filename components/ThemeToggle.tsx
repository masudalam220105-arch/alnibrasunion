'use client';

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';

interface ThemeToggleProps {
  compact?: boolean;
  variant?: 'default' | 'navbar' | 'sidebar';
}

export function ThemeToggle({ compact = false, variant = 'default' }: ThemeToggleProps) {
  const { theme, mounted, setTheme } = useTheme();

  const options: {
    value: ThemeMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const containerClass =
    variant === 'sidebar'
      ? 'inline-flex items-center gap-0.5 p-1 rounded-lg bg-white/10 border border-white/15'
      : 'inline-flex items-center gap-0.5 p-1 rounded-lg bg-[#F0F4F1] dark:bg-[#112A22] border border-[#E5EAE6] dark:border-[#1E3F35]';

  return (
    <div
      role="group"
      aria-label="Theme preference"
      data-testid="theme-toggle"
      className={containerClass}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = mounted ? theme === opt.value : opt.value === 'light';
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-label={`${opt.label} theme`}
            aria-pressed={active}
            title={`Switch to ${opt.label} theme`}
            className={`relative press-scale inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              active
                ? variant === 'sidebar'
                  ? 'text-[#064E3B] font-semibold'
                  : 'text-white dark:text-[#064E3B] font-semibold'
                : variant === 'sidebar'
                ? 'text-white/75 hover:text-white'
                : 'text-[#718078] dark:text-[#9AB0A6] hover:text-[#17221F] dark:hover:text-white'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`theme-pill-${variant}`}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className={`absolute inset-0 rounded-md shadow-xs ${
                  variant === 'sidebar'
                    ? 'bg-[#D4AF37]'
                    : 'bg-[#064E3B] dark:bg-[#D4AF37]'
                }`}
                aria-hidden="true"
              />
            )}
            <Icon className="relative z-10 w-3.5 h-3.5 shrink-0" />
            {!compact && <span className="relative z-10">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface FloatingThemeToggleProps {
  className?: string;
}

/**
 * Floating dark/light mode toggle button for the main navigation header.
 * Persists preference to localStorage and updates Tailwind theme context.
 */
export function FloatingThemeToggle({ className = '' }: FloatingThemeToggleProps) {
  const { resolvedTheme, mounted, toggleTheme } = useTheme();
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileHover={{ y: -1, scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      data-testid="floating-theme-toggle"
      className={`relative inline-flex items-center justify-center gap-1.5 sm:gap-2 p-2 sm:px-3 sm:py-2 rounded-xl bg-white/95 dark:bg-[#0B241E]/95 backdrop-blur-md border border-[#E5EAE6] dark:border-[#D4AF37]/40 text-[#064E3B] dark:text-[#D4AF37] shadow-[0_6px_20px_-4px_rgba(6,78,59,0.22)] dark:shadow-[0_6px_20px_-4px_rgba(0,0,0,0.65)] hover:border-[#064E3B]/40 dark:hover:border-[#D4AF37] transition-colors shrink-0 cursor-pointer ${className}`}
    >
      <span className="relative flex items-center justify-center w-4 h-4">
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.span
              key="sun"
              initial={{ opacity: 0, rotate: -45, scale: 0.75 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 45, scale: 0.75 }}
              transition={{ duration: 0.16 }}
              className="inline-flex items-center justify-center"
            >
              <Sun className="w-4 h-4 text-[#D4AF37]" />
            </motion.span>
          ) : (
            <motion.span
              key="moon"
              initial={{ opacity: 0, rotate: 45, scale: 0.75 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -45, scale: 0.75 }}
              transition={{ duration: 0.16 }}
              className="inline-flex items-center justify-center"
            >
              <Moon className="w-4 h-4 text-[#064E3B]" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="hidden sm:inline text-xs font-bold tracking-tight whitespace-nowrap text-[#17221F] dark:text-[#F0F5F2]">
        {isDark ? 'Light' : 'Dark'}
      </span>
    </motion.button>
  );
}

/**
 * Global layout Floating Action Button (FAB) for manual light/dark mode toggling.
 * Updates ThemeProvider local state, syncs Tailwind `.dark` class, and persists preference in localStorage.
 */
export function FloatingThemeFab({ className = '' }: FloatingThemeToggleProps) {
  const { resolvedTheme, mounted, toggleTheme } = useTheme();
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileHover={{ y: -2, scale: 1.05 }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      data-testid="floating-theme-fab"
      className={`fixed bottom-5 right-5 z-40 print:hidden inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/95 dark:bg-[#0D231D]/95 backdrop-blur-md border border-[#064E3B]/20 dark:border-[#D4AF37]/45 text-[#064E3B] dark:text-[#D4AF37] shadow-[0_8px_24px_-4px_rgba(6,78,59,0.28)] dark:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.72)] hover:border-[#064E3B]/50 dark:hover:border-[#D4AF37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#064E3B] dark:focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAF7] dark:focus-visible:ring-offset-[#071713] transition-colors cursor-pointer ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="fab-sun"
            initial={{ opacity: 0, rotate: -45, scale: 0.75 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 45, scale: 0.75 }}
            transition={{ duration: 0.16 }}
            className="inline-flex items-center justify-center"
          >
            <Sun className="w-5 h-5 text-[#D4AF37]" />
          </motion.span>
        ) : (
          <motion.span
            key="fab-moon"
            initial={{ opacity: 0, rotate: 45, scale: 0.75 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -45, scale: 0.75 }}
            transition={{ duration: 0.16 }}
            className="inline-flex items-center justify-center"
          >
            <Moon className="w-5 h-5 text-[#064E3B]" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export default ThemeToggle;

