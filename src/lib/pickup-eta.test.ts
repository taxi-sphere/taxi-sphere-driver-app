/**
 * @file: src/lib/pickup-eta.test.ts
 * @description:
 *   Обратный отсчёт до подачи: границы уровней, округление минут и случаи,
 *   когда показывать нечего.
 * @dependencies: vitest, @/lib/pickup-eta
 * @created: 2026-09-10 (1.5.53)
 */

import { describe, it, expect } from 'vitest';
import { pickupEtaState, SOON_THRESHOLD_SEC } from '@/lib/pickup-eta';

const CONFIRMED = '2026-09-10T10:00:00.000Z';
const at = (offsetSec: number) => new Date(Date.parse(CONFIRMED) + offsetSec * 1000);

describe('pickupEtaState', () => {
  it('показывает остаток, пока времени с запасом', () => {
    // Обещано 10 минут, прошла одна.
    const state = pickupEtaState(CONFIRMED, 10, at(60));

    expect(state?.level).toBe('ok');
    expect(state?.remainingSec).toBe(9 * 60);
    expect(state?.label).toBe('Подача 9 мин');
  });

  it('переходит в «пора» ровно на пяти минутах', () => {
    const state = pickupEtaState(CONFIRMED, 10, at(10 * 60 - SOON_THRESHOLD_SEC));

    expect(state?.level).toBe('soon');
    expect(state?.label).toBe('Подача 5 мин');
  });

  it('за секунду до пятиминутной границы ещё спокойно', () => {
    const state = pickupEtaState(CONFIRMED, 10, at(10 * 60 - SOON_THRESHOLD_SEC - 1));

    expect(state?.level).toBe('ok');
  });

  it('меньше минуты — «сейчас», а не «1 мин»', () => {
    // Округление вверх дало бы «1 мин» и за 50 секунд до срока: водитель
    // ждал бы минуту, которой уже нет.
    const state = pickupEtaState(CONFIRMED, 10, at(10 * 60 - 50));

    expect(state?.label).toBe('Подача сейчас');
    expect(state?.level).toBe('soon');
  });

  it('после срока считает опоздание', () => {
    const state = pickupEtaState(CONFIRMED, 10, at(13 * 60));

    expect(state?.level).toBe('late');
    expect(state?.remainingSec).toBe(-3 * 60);
    expect(state?.label).toBe('Опоздание 3 мин');
  });

  it('первая секунда опоздания — уже опоздание, минимум одна минута', () => {
    const state = pickupEtaState(CONFIRMED, 10, at(10 * 60 + 1));

    expect(state?.level).toBe('late');
    expect(state?.label).toBe('Опоздание 1 мин');
  });

  it('округляет остаток вверх: 61 секунда — это две минуты', () => {
    const state = pickupEtaState(CONFIRMED, 10, at(10 * 60 - 61));

    expect(state?.label).toBe('Подача 2 мин');
  });

  it('нечего показывать, если водитель ничего не обещал', () => {
    // Ноль вместо null означал бы «опаздывает», хотя обещания не было.
    expect(pickupEtaState(null, 10)).toBeNull();
    expect(pickupEtaState(CONFIRMED, null)).toBeNull();
    expect(pickupEtaState(CONFIRMED, 0)).toBeNull();
  });

  it('битую дату не показываем вместо выдуманного отсчёта', () => {
    expect(pickupEtaState('вчера', 10)).toBeNull();
  });
});
