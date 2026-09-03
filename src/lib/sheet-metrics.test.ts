/**
 * @file: src/lib/sheet-metrics.test.ts
 * @description:
 *   Тесты высоты шторки — обе стороны уже ломались в проде.
 *
 *   Слишком высоко (1.5.23): верх уезжает под шапку, и вместе с ним
 *   полоска-хват и точки полосы этапов. Слишком низко (1.5.24): шторка не
 *   доходит до верха, и половина подробностей остаётся за обрезом.
 *
 * @dependencies: vitest, @/lib/sheet-metrics
 * @created: 2026-09-03 (v1.5.25)
 */

import { describe, it, expect } from 'vitest';
import { MAP_MIN_VISIBLE, SHEET_COLLAPSED, sheetExpandedHeight } from '@/lib/sheet-metrics';

/** Эмулятор 360×800dp: контейнер под шапкой и вкладками. */
const CONTAINER = 616;
const ACTION_BAR = 88;

describe('sheetExpandedHeight', () => {
  it('доходит до верха — над шторкой остаётся только полоска карты с чипами', () => {
    // Ровно то, чего не хватало в 1.5.24: потолок в 66% высоты оставлял
    // над шторкой 122 вместо 56 и обрывал её на полпути.
    expect(sheetExpandedHeight(CONTAINER, ACTION_BAR)).toBe(
      CONTAINER - ACTION_BAR - MAP_MIN_VISIBLE,
    );
  });

  it('не вылезает за контейнер — иначе хват уходит под шапку', () => {
    expect(sheetExpandedHeight(CONTAINER, ACTION_BAR)).toBeLessThanOrEqual(
      CONTAINER - ACTION_BAR,
    );
  });

  it('до замера отдаёт свёрнутую высоту, чтобы не было прыжка', () => {
    expect(sheetExpandedHeight(0, ACTION_BAR)).toBe(SHEET_COLLAPSED);
    expect(sheetExpandedHeight(-10, ACTION_BAR)).toBe(SHEET_COLLAPSED);
  });

  it('на низком экране не схлопывается ниже свёрнутой', () => {
    // Развёрнутая меньше свёрнутой — это нулевой ход и мёртвый жест.
    expect(sheetExpandedHeight(300, ACTION_BAR)).toBe(SHEET_COLLAPSED);
  });

  it('без кнопки главного действия шторка занимает и её место', () => {
    expect(sheetExpandedHeight(CONTAINER, 0)).toBe(CONTAINER - MAP_MIN_VISIBLE);
  });
});
