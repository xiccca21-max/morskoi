import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'brutal' | 'radar' | 'blueprint';

export const THEMES: { id: Theme; name: string }[] = [
  { id: 'brutal', name: 'Необрутализм' },
  { id: 'radar', name: 'Тактический Радар' },
  { id: 'blueprint', name: 'Чертёж' },
];

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'brutal',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
    }),
    { name: 'theme-storage' }
  )
);
