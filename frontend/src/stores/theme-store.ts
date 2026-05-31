import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'brutal' | 'radar' | 'blueprint' | 'depth';

export const THEMES: { id: Theme; name: string; base: string; accent: string; panel: string }[] = [
  { id: 'brutal', name: 'Необрутализм', base: '#eae6d7', accent: '#e1574b', panel: '#ffffff' },
  { id: 'radar', name: 'Тактический Радар', base: '#020a04', accent: '#4af626', panel: '#041408' },
  { id: 'blueprint', name: 'Чертёж', base: '#0a1628', accent: '#5b9bd5', panel: '#0f1f38' },
  { id: 'depth', name: 'Глубина', base: '#0b1a2e', accent: '#3dd6c6', panel: '#122640' },
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
