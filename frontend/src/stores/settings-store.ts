import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  sound: boolean;
  haptics: boolean;
  onboardingDone: boolean;
  setSound: (v: boolean) => void;
  setHaptics: (v: boolean) => void;
  setOnboardingDone: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      haptics: true,
      onboardingDone: false,
      setSound: (v) => set({ sound: v }),
      setHaptics: (v) => set({ haptics: v }),
      setOnboardingDone: (v) => set({ onboardingDone: v }),
    }),
    { name: 'settings-storage' },
  ),
);

/** Синхронное чтение настроек из localStorage (для модулей вне React, напр. audio/haptic). */
export function readSettings(): { sound: boolean; haptics: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem('settings-storage') || '{}');
    return {
      sound: raw?.state?.sound !== false,
      haptics: raw?.state?.haptics !== false,
    };
  } catch {
    return { sound: true, haptics: true };
  }
}
