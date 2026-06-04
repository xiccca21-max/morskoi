import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'brutal' | 'radar';

export const THEMES: { id: Theme; name: string; base: string; accent: string; panel: string }[] = [
  { id: 'brutal', name: 'Необрутализм', base: '#eae6d7', accent: '#e1574b', panel: '#ffffff' },
  { id: 'radar', name: 'Тактический Радар', base: '#020a04', accent: '#4af626', panel: '#041408' },
];

const DEFAULT_THEME: Theme = 'brutal';
const VALID_THEMES = new Set<string>(THEMES.map((t) => t.id));

function normalizeTheme(t: string | undefined): Theme {
  if (!t || !VALID_THEMES.has(t)) return DEFAULT_THEME;
  return t as Theme;
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      setTheme: (theme) => {
        const next = normalizeTheme(theme);
        document.documentElement.setAttribute('data-theme', next);
        set({ theme: next });
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const next = normalizeTheme(state.theme);
        state.theme = next;
        document.documentElement.setAttribute('data-theme', next);
      },
    },
  ),
);
