/**
 * @file: src/lib/order-stop-progress.test.ts
 * @description:
 *   Тесты правила «какая точка сейчас».
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Ошибка здесь стоит завершённого раньше времени
 *   заказа: кнопка либо предложит завершить поездку на середине маршрута,
 *   либо не даст завершить её никогда. Отдельно проверяется совместимость
 *   со старым сервером — приложение и сервер обновляются порознь, и точка
 *   без `id` не должна запирать кнопку.
 *
 * @dependencies: vitest, @/lib/order-stop-progress
 * @created: 2026-09-09 (1.5.46)
 */

import { describe, it, expect } from 'vitest';
import {
  nextPendingStop,
  passedStopsCount,
  stopActionLabel,
} from './order-stop-progress';
import type { OrderStop } from '@/types/order';

const stop = (over: Partial<OrderStop> = {}): OrderStop => ({
  id: 's1',
  address: 'Москва, Тверская, 1',
  lat: 55.76,
  lng: 37.6,
  entrance: null,
  note: null,
  arrivedAt: null,
  ...over,
});

describe('nextPendingStop', () => {
  it('первая неотмеченная точка', () => {
    const stops = [stop({ id: 'a' }), stop({ id: 'b' })];
    expect(nextPendingStop(stops, 'in_progress')?.id).toBe('a');
  });

  it('пропускает уже отмеченные', () => {
    const stops = [
      stop({ id: 'a', arrivedAt: '2026-09-09T10:00:00Z' }),
      stop({ id: 'b' }),
    ];
    const pending = nextPendingStop(stops, 'in_progress');
    expect(pending?.id).toBe('b');
    expect(pending?.number).toBe(2);
  });

  it('все точки пройдены — впереди только завершение', () => {
    const stops = [
      stop({ id: 'a', arrivedAt: '2026-09-09T10:00:00Z' }),
      stop({ id: 'b', arrivedAt: '2026-09-09T10:10:00Z' }),
    ];
    expect(nextPendingStop(stops, 'in_progress')).toBeNull();
  });

  it('точек нет вовсе', () => {
    expect(nextPendingStop([], 'in_progress')).toBeNull();
    expect(nextPendingStop(null, 'in_progress')).toBeNull();
    expect(nextPendingStop(undefined, 'in_progress')).toBeNull();
  });

  it('номер точки считается по ПОЛНОМУ списку, а не по остатку', () => {
    // Иначе после первой отметки вторая точка снова называлась бы первой.
    const stops = [
      stop({ id: 'a', arrivedAt: '2026-09-09T10:00:00Z' }),
      stop({ id: 'b', arrivedAt: '2026-09-09T10:05:00Z' }),
      stop({ id: 'c' }),
    ];
    expect(nextPendingStop(stops, 'in_progress')?.number).toBe(3);
  });
});

describe('только с пассажиром в машине', () => {
  it('на подаче кнопка занята другим действием', () => {
    const stops = [stop({ id: 'a' })];
    expect(nextPendingStop(stops, 'assigned')).toBeNull();
    expect(nextPendingStop(stops, 'driver_arrived')).toBeNull();
  });
});

describe('совместимость со старым сервером', () => {
  it('точка без id неотмечаема и пропускается', () => {
    // До v1.100.2 сервер не присылал ни id, ни arrivedAt. Кнопка обязана
    // вести к завершению, как раньше, а не запираться навсегда.
    const stops = [stop({ id: undefined }), stop({ id: undefined })];
    expect(nextPendingStop(stops, 'in_progress')).toBeNull();
  });

  it('смешанный список: берём ту, которую можно отметить', () => {
    const stops = [stop({ id: undefined }), stop({ id: 'b' })];
    expect(nextPendingStop(stops, 'in_progress')?.id).toBe('b');
  });
});

describe('passedStopsCount', () => {
  it('считает отмеченные', () => {
    expect(
      passedStopsCount([
        stop({ arrivedAt: '2026-09-09T10:00:00Z' }),
        stop(),
        stop({ arrivedAt: '2026-09-09T10:10:00Z' }),
      ]),
    ).toBe(2);
  });

  it('пустой список и мусор', () => {
    expect(passedStopsCount([])).toBe(0);
    expect(passedStopsCount(null)).toBe(0);
  });
});

describe('stopActionLabel', () => {
  it('номер попадает в подпись', () => {
    expect(stopActionLabel({ id: 'a', number: 2, stop: stop() })).toBe('ТОЧКА 2 ПРОЙДЕНА');
  });
});
