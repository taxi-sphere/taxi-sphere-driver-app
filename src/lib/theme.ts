/**
 * @file: src/lib/theme.ts
 * @description:
 *   Система цветовых тем: светлая и тёмная.
 *   Хук useTheme() для получения текущей палитры.
 */

import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/stores/settings.store';

export interface ThemeColors {
  // Фоны
  background: string;
  surface: string;
  surfaceElevated: string;
  // Текст
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  // Бренд
  primary: string;
  primaryDark: string;
  primaryLight: string;
  // Статусы
  success: string;
  warning: string;
  danger: string;
  info: string;
  // Границы
  border: string;
  borderLight: string;
  // Специальные
  overlay: string;
  cardBg: string;
  inputBg: string;
  tabBarBg: string;
  statusBarStyle: 'light-content' | 'dark-content';
}

const lightTheme: ThemeColors = {
  background: '#f3f4f6',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#9ca3af',
  textInverse: '#ffffff',
  primary: '#4f46e5',
  primaryDark: '#4338ca',
  primaryLight: '#e0e7ff',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  border: '#e5e7eb',
  borderLight: '#f0f0f0',
  overlay: 'rgba(0, 0, 0, 0.5)',
  cardBg: '#ffffff',
  inputBg: '#f9fafb',
  tabBarBg: '#ffffff',
  statusBarStyle: 'dark-content',
};

const darkTheme: ThemeColors = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceElevated: '#334155',
  textPrimary: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#64748b',
  textInverse: '#0f172a',
  primary: '#6366f1',
  primaryDark: '#4f46e5',
  primaryLight: '#312e81',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#f87171',
  info: '#60a5fa',
  border: '#334155',
  borderLight: '#1e293b',
  overlay: 'rgba(0, 0, 0, 0.7)',
  cardBg: '#1e293b',
  inputBg: '#0f172a',
  tabBarBg: '#1e293b',
  statusBarStyle: 'light-content',
};

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Хук для получения текущей палитры цветов.
 * Учитывает пользовательскую настройку и системную тему.
 */
export function useTheme(): { colors: ThemeColors; isDark: boolean; mode: ThemeMode } {
  const themeMode = useSettingsStore((s) => s.themeMode ?? 'system');
  const systemScheme = useColorScheme();

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemScheme === 'dark');

  return {
    colors: isDark ? darkTheme : lightTheme,
    isDark,
    mode: themeMode,
  };
}
