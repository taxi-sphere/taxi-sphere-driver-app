/**
 * @file: src/lib/design/palette.ts
 * @description:
 *   Две палитры — светлая и тёмная — и производные от них тени.
 *
 *   ТЁМНАЯ ТЕМА ЗДЕСЬ НЕ ВТОРОСТЕПЕННА. Ночная смена — половина работы
 *   водителя, и белый экран в лицо на трассе это не вопрос вкуса. До
 *   v1.5.17 переключатель темы в настройках существовал, но применялся
 *   ровно на одном экране из семнадцати, а в `app.json` стоял
 *   `userInterfaceStyle: "light"`, из-за которого `useColorScheme()` вообще
 *   не мог вернуть `dark` — режим «Авто» был мёртв по построению.
 *
 *   ПОЧЕМУ ЦВЕТА ПАРАМИ (`success` + `successSoft`). Цветной текст на
 *   цветной подложке нужен постоянно — баннеры, бейджи, чипы. Пока пары не
 *   было, подложки подбирались на глаз прямо в экранах, и один и тот же
 *   «предупреждающий жёлтый» существовал в четырёх оттенках.
 *
 *   ТЕНИ РАЗНЫЕ ПО ТЕМАМ. В тёмной теме тень почти не видна: чёрное на
 *   чёрном. Поэтому глубина там передаётся не тенью, а более светлой
 *   поверхностью и обводкой — `elevation` отдаёт уже готовый набор стилей
 *   под текущую тему, а не общий на обе.
 *
 * @dependencies: react-native (только типы), ./tokens
 * @created: 2026-09-01 (v1.5.17)
 */

import type { ViewStyle } from 'react-native';
import { radius } from './tokens';

export interface ThemeColors {
  // --- Поверхности ---
  /** Фон экрана. */
  background: string;
  /** Карточка, панель, шапка. */
  surface: string;
  /** Утопленный блок: поле ввода, «колодец» под значение. */
  surfaceSunken: string;
  /** Приподнятый блок: шторка, всплывающая панель, модалка. */
  surfaceElevated: string;

  // --- Текст ---
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Текст на цветной заливке (кнопка, бейдж). */
  textInverse: string;

  // --- Бренд ---
  primary: string;
  primaryDark: string;
  /** Подложка под элемент бренда: активный таб, выбранный чип. */
  primarySoft: string;

  // --- Статусы: цвет + подложка под него ---
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;

  // --- Точки маршрута ---
  /** Откуда забрать. */
  pointPickup: string;
  /** Промежуточная остановка. */
  pointStop: string;
  /** Куда везти. */
  pointDropoff: string;

  // --- Границы ---
  border: string;
  /** Обводка, которая должна быть заметна: выбранный элемент, разделитель. */
  borderStrong: string;

  // --- Служебные ---
  /** Затемнение под модалкой и шторкой. */
  scrim: string;
  /** Цвет тени (в тёмной теме — почти чистый чёрный). */
  shadow: string;
  /** Заливка скелетона загрузки. */
  skeleton: string;
  /** Фон нижней панели вкладок. */
  tabBar: string;
  /** Подложка карты, пока тайлы не загрузились. */
  mapPlaceholder: string;
}

const light: ThemeColors = {
  background: '#f4f5f7',
  surface: '#ffffff',
  surfaceSunken: '#eceef2',
  surfaceElevated: '#ffffff',

  textPrimary: '#0f1729',
  textSecondary: '#4b5563',
  // Было #8b93a1 — 2.84:1 на фоне экрана. Им пишут подписи разделов и
  // пояснения под полями: мельком, но читать их надо.
  textMuted: '#6b7280',
  textInverse: '#ffffff',

  primary: '#4f46e5',
  primaryDark: '#4338ca',
  primarySoft: '#eef2ff',

  // Зелёный и жёлтый затемнены: на них ложится БЕЛЫЙ текст (сплошные
  // бейджи, кнопка «Завершить поездку»), а прежние #16a34a и #d97706
  // давали 3.30:1 и 3.19:1 при норме 4.5. Жёлтый заодно не читался на
  // собственной подложке — 2.86:1.
  success: '#15803d',
  successSoft: '#dcfce7',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  info: '#2563eb',
  infoSoft: '#dbeafe',

  pointPickup: '#16a34a',
  pointStop: '#d97706',
  pointDropoff: '#dc2626',

  border: '#e2e5ea',
  borderStrong: '#cbd2dc',

  scrim: 'rgba(15, 23, 42, 0.45)',
  shadow: '#0f172a',
  skeleton: '#e4e7ec',
  tabBar: '#ffffff',
  mapPlaceholder: '#e8eaee',
};

/**
 * Тёмная палитра.
 *
 * Фон не чёрный, а тёмно-синий: чистый чёрный на OLED даёт заметный смаз
 * при прокрутке карты, а разница уровней поверхности на нём неразличима.
 * Бренд-цвет здесь светлее, чем в светлой теме (#818cf8 против #4f46e5):
 * тёмный индиго на тёмном фоне не проходит по контрасту.
 */
const dark: ThemeColors = {
  background: '#0b1220',
  surface: '#141c2e',
  surfaceSunken: '#080e1a',
  surfaceElevated: '#1c2740',

  textPrimary: '#eef2f8',
  textSecondary: '#aab4c5',
  textMuted: '#6b7789',
  /**
   * Текст НА ЦВЕТНОЙ ЗАЛИВКЕ — и в тёмной теме он тёмный, а не белый.
   *
   * «Инверсный» значит «противоположный фону под ним», а фон здесь —
   * акцентные цвета, и в тёмной теме они СВЕТЛЫЕ: пастельные жёлтый,
   * зелёный, синий. Белое на них не читается: на `warning` (#fbbf24)
   * получалось 1.67:1 при минимуме 4.5 — сплошной кнопки «Завершить» и
   * жёлтых бейджей это касалось напрямую. Белый здесь был просто
   * скопирован из светлой палитры, где заливки тёмные.
   */
  textInverse: '#0b1220',

  primary: '#818cf8',
  // Нажатое состояние главной кнопки. На нём лежит `textInverse`, и при
  // прежнем #6366f1 получалось 4.19:1 — под порогом. В тёмной теме
  // «нажато» не обязано быть темнее: важно, что оттенок другой.
  primaryDark: '#6f7bf7',
  primarySoft: '#232a4d',

  success: '#34d399',
  successSoft: '#0e2f24',
  warning: '#fbbf24',
  warningSoft: '#33270a',
  danger: '#f87171',
  dangerSoft: '#3a1618',
  info: '#60a5fa',
  infoSoft: '#132840',

  pointPickup: '#34d399',
  pointStop: '#fbbf24',
  pointDropoff: '#f87171',

  border: '#26324a',
  borderStrong: '#35435f',

  scrim: 'rgba(0, 0, 0, 0.62)',
  shadow: '#000000',
  skeleton: '#1f2a40',
  tabBar: '#141c2e',
  mapPlaceholder: '#111a2b',
};

/** Уровень глубины: 0 — вровень с фоном, 3 — шторка над всем. */
export type ElevationLevel = 0 | 1 | 2 | 3;

export type ElevationStyles = Record<ElevationLevel, ViewStyle>;

/**
 * Готовые стили глубины под конкретную тему.
 *
 * В светлой теме глубина — тень. В тёмной тень не видна, поэтому там
 * работает подъём поверхности плюс обводка: это единственный способ
 * показать, что шторка лежит НАД картой, а не врезана в неё.
 */
function buildElevation(colors: ThemeColors, isDark: boolean): ElevationStyles {
  if (isDark) {
    return {
      0: { backgroundColor: colors.surface },
      1: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      },
      2: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      },
      3: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        // Тень в тёмной теме почти не читается, но у самой верхней
        // поверхности слабый ореол всё же отделяет её от карты.
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 16,
      },
    };
  }

  return {
    0: { backgroundColor: colors.surface },
    1: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    2: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 6,
    },
    3: {
      backgroundColor: colors.surfaceElevated,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.14,
      shadowRadius: 20,
      elevation: 18,
    },
  };
}

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
  elevation: ElevationStyles;
  statusBarStyle: 'light-content' | 'dark-content';
  /** Стиль карты react-native-maps под текущую тему. */
  mapStyle: 'standard' | 'night';
  /** Радиус карточки по умолчанию — чтобы не писать `radius.md` в каждом файле. */
  cardRadius: number;
}

export const lightThemeColors = light;
export const darkThemeColors = dark;

export function buildTheme(isDark: boolean): Theme {
  const colors = isDark ? dark : light;
  return {
    colors,
    isDark,
    elevation: buildElevation(colors, isDark),
    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    mapStyle: isDark ? 'night' : 'standard',
    cardRadius: radius.md,
  };
}

/**
 * Обе темы собираются один раз на модуль, а не на каждый рендер: объект
 * темы уходит в зависимости `useMemo` по всему приложению, и новый объект
 * при каждом вызове сбрасывал бы кеш стилей на каждом кадре.
 */
export const THEMES: Record<'light' | 'dark', Theme> = {
  light: buildTheme(false),
  dark: buildTheme(true),
};
