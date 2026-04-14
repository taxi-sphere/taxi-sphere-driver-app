/**
 * @file: src/stores/settings.store.ts
 * @description:
 *   Zustand store для пользовательских настроек водителя.
 *   Персистенция через AsyncStorage.
 * @dependencies: zustand, @react-native-async-storage/async-storage
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type NavigatorApp = 'yandex' | '2gis' | 'google';
type ThemeMode = 'light' | 'dark' | 'system';

interface SettingsState {
  serverUrl: string;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  voiceAlerts: boolean;
  preferredNavigator: NavigatorApp;
  themeMode: ThemeMode;
  lastPhone: string;

  setServerUrl: (url: string) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setVoiceAlerts: (enabled: boolean) => void;
  setPreferredNavigator: (nav: NavigatorApp) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLastPhone: (phone: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: '',
      soundEnabled: true,
      vibrationEnabled: true,
      voiceAlerts: false,
      preferredNavigator: 'yandex',
      themeMode: 'system',
      lastPhone: '',

      setServerUrl: (serverUrl) => set({ serverUrl }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setVibrationEnabled: (vibrationEnabled) => set({ vibrationEnabled }),
      setVoiceAlerts: (voiceAlerts) => set({ voiceAlerts }),
      setPreferredNavigator: (preferredNavigator) =>
        set({ preferredNavigator }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setLastPhone: (lastPhone) => set({ lastPhone }),
    }),
    {
      name: 'ts-driver-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
