/**
 * @file: src/lib/design/palette.test.ts
 * @description:
 *   Контраст палитры — обе темы, по WCAG.
 *
 *   ЗАЧЕМ. Цвет подбирают на глаз, на большом мониторе, при комнатном
 *   свете. Водитель смотрит на телефон в машине: солнце в стекло днём,
 *   встречные фары ночью. Там разница между 4.5:1 и 2:1 — это разница
 *   между «прочитал адрес» и «остановился, чтобы прочитать».
 *
 *   ЧТО ЭТИ ТЕСТЫ УЖЕ ПОЙМАЛИ. В тёмной теме `textInverse` был белым —
 *   скопированным из светлой палитры, где заливки тёмные. Но в тёмной теме
 *   заливки СВЕТЛЫЕ: белое на `warning` (#fbbf24) давало 1.67:1. Это
 *   касалось сплошных бейджей и главной кнопки «Завершить поездку».
 *
 *   ПОЧЕМУ ОБВОДКИ НЕ ПРОВЕРЯЕМ. Граница — не текст: её задача едва
 *   наметить край, и 1.5:1 там нормально. Проверяем то, что читают.
 *
 *   1.5.65: приглушённый текст проверялся только на фоне экрана, и 3.27:1 на
 *   шторке заказа в тёмной теме прошёл незамеченным; значки на метках карты
 *   не проверялись вовсе.
 *
 * @dependencies: vitest, ./palette
 * @created: 2026-09-03 (v1.5.24)
 * @updated: 2026-09-14 (1.5.65 — приглушённый текст на поверхностях, значки меток)
 */

import { describe, it, expect } from 'vitest';
import { lightThemeColors, darkThemeColors, type ThemeColors } from './palette';

/** Относительная яркость по WCAG 2.1. */
function luminance(hex: string): number {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Обычный текст. Порог WCAG AA. */
const AA_TEXT = 4.5;
/**
 * Крупный и полужирный: подписи бейджей, значения в строках.
 * Порог WCAG AA для крупного текста.
 */
const AA_LARGE = 3;

const THEMES: [string, ThemeColors][] = [
  ['светлая', lightThemeColors],
  ['тёмная', darkThemeColors],
];

/** Поверхности, на которых лежит обычный текст. */
const SURFACES: (keyof ThemeColors)[] = [
  'background',
  'surface',
  'surfaceSunken',
  'surfaceElevated',
  'tabBar',
];

/** Сплошные заливки, поверх которых идёт `textInverse`. */
const SOLID_FILLS: (keyof ThemeColors)[] = [
  'primary',
  'primaryDark',
  'success',
  'warning',
  'danger',
  'info',
];

/** Пары «акцент на своей мягкой подложке» — бейджи и чипы. */
const SOFT_PAIRS: [keyof ThemeColors, keyof ThemeColors][] = [
  ['primary', 'primarySoft'],
  ['success', 'successSoft'],
  ['warning', 'warningSoft'],
  ['danger', 'dangerSoft'],
  ['info', 'infoSoft'],
];

describe.each(THEMES)('палитра: %s тема', (_name, colors) => {
  it.each(SURFACES)('основной текст читается на %s', (surface) => {
    expect(contrast(colors.textPrimary, colors[surface])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(SURFACES)('вторичный текст читается на %s', (surface) => {
    expect(contrast(colors.textSecondary, colors[surface])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(SOLID_FILLS)('textInverse читается на заливке %s', (fill) => {
    // Именно здесь ловится белое на жёлтом: в тёмной теме заливки светлые,
    // и «инверсный» текст обязан быть тёмным.
    expect(contrast(colors.textInverse, colors[fill])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(SOFT_PAIRS)('%s читается на %s', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('приглушённый текст различим на фоне экрана', () => {
    // Им пишут подписи «ПОДАЧА», «МАРШРУТ» и пояснения под полями —
    // читать их надо мельком, но читать.
    expect(contrast(colors.textMuted, colors.background)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.each(['surface', 'surfaceElevated'] as const)(
    'приглушённый текст читается на %s',
    (surface) => {
      // Шторка заказа — `surfaceElevated`: на ней ночью номер подъезда и
      // подписи этапов, и 3.27:1 здесь никто не ловил.
      expect(contrast(colors.textMuted, colors[surface])).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(SURFACES)('приглушённый текст различим на %s', (surface) => {
    expect(contrast(colors.textMuted, colors[surface])).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.each(['pointPickup', 'pointStop', 'pointDropoff'] as const)(
    'значок на метке %s читается',
    (point) => {
      // Значок метки — `textInverse`. Белый на светлых ночных метках давал
      // 1.67-2.77:1. Порог — как для крупных элементов: значок 15 pt.
      expect(contrast(colors.textInverse, colors[point])).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );
});
