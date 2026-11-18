export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

export function parseStoredThemeMode(raw: string | null | undefined): ThemeMode {
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return 'light';
}

export function resolveThemeMode(
  mode: ThemeMode,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (mode === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return mode;
}

export function getNextDarkLightTheme(
  currentResolved: ResolvedTheme
): ResolvedTheme {
  return currentResolved === 'dark' ? 'light' : 'dark';
}
