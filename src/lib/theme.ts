/**
 * @file: src/lib/theme.ts
 * @description:
 *   Точка входа в дизайн-систему: текущая тема и хук для стилей, зависящих
 *   от неё.
 *
 *   ГЛАВНОЕ ЗДЕСЬ — `useThemedStyles`. `StyleSheet.create` статичен и хуки
 *   вызывать не может, поэтому до v1.5.17 экран, которому нужны были цвета
 *   темы, либо размазывал `{ color: colors.x }` по всей разметке (так
 *   сделан `profile.tsx` — единственный экран, знавший про тему), либо
 *   просто хардкодил цвета (так сделаны остальные шестнадцать).
 *
 *   `useThemedStyles` принимает фабрику стилей и отдаёт готовый
 *   `StyleSheet`, пересобирая его только при смене темы. Разметка при этом
 *   выглядит как обычно — `style={styles.card}`, без цветов по месту.
 *
 *   Фабрику ОБЪЯВЛЯТЬ НА УРОВНЕ МОДУЛЯ, не внутри компонента: кеш держится
 *   по ссылке на функцию, и новая функция на каждый рендер сделает кеш
 *   бесполезным.
 *
 *     const styles = useThemedStyles(createStyles);
 *     // ...
 *     const createStyles = (t: Theme) => StyleSheet.create({ ... });
 *
 * @dependencies:
 *   - react-native (useColorScheme, StyleSheet)
 *   - @/stores/settings.store
 *   - ./design/palette, ./design/tokens
 * @created: 2026-01-24 12:00:00
 * @updated: 2026-09-01 (v1.5.17 — токены, useThemedStyles, тема на всех экранах)
 */

import { useMemo } from 'react';
import {
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSettingsStore } from '@/stores/settings.store';
import { THEMES, type Theme, type ThemeColors } from './design/palette';

export type { Theme, ThemeColors, ElevationLevel } from './design/palette';
export {
  text,
  spacing,
  radius,
  touch,
  icon,
  border,
  motion,
  MAX_STAGGER_ITEMS,
} from './design/tokens';

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Текущая тема.
 *
 * `system` опирается на `useColorScheme()`. Учтите: это работает только
 * пока в `app.json` стоит `userInterfaceStyle: "automatic"` — со значением
 * `"light"` нативная оболочка возвращает `light` всегда, и режим «Авто»
 * молча превращается в «Светлая» (так и было до v1.5.17).
 */
export function useTheme(): Theme & { mode: ThemeMode } {
  const mode = useSettingsStore((s) => s.themeMode ?? 'system');
  const systemScheme = useColorScheme();

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const theme = isDark ? THEMES.dark : THEMES.light;

  return useMemo(() => ({ ...theme, mode }), [theme, mode]);
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

type StyleFactory<T> = (theme: Theme) => T;

/**
 * Кеш готовых `StyleSheet` по паре (фабрика, тема).
 *
 * `WeakMap` — чтобы стили экрана уходили вместе с выгруженным модулем и не
 * держали память. Обе темы считаются лениво: тёмная не собирается, пока
 * водитель её не включил.
 */
const styleCache = new WeakMap<
  StyleFactory<unknown>,
  Partial<Record<'light' | 'dark', unknown>>
>();

export function useThemedStyles<T extends NamedStyles<T>>(factory: StyleFactory<T>): T {
  const theme = useTheme();
  const key: 'light' | 'dark' = theme.isDark ? 'dark' : 'light';

  let byTheme = styleCache.get(factory as StyleFactory<unknown>);
  if (!byTheme) {
    byTheme = {};
    styleCache.set(factory as StyleFactory<unknown>, byTheme);
  }
  if (!byTheme[key]) {
    byTheme[key] = StyleSheet.create(factory(theme));
  }
  return byTheme[key] as T;
}

/**
 * Только палитра — для случаев, где стили не нужны, а цвет нужен: проп
 * `color` у иконки, `tintColor` у `RefreshControl`, цвет маркера на карте.
 */
export function useColors(): ThemeColors {
  return useTheme().colors;
}
