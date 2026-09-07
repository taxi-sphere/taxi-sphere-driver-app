/**
 * @file: src/lib/order-route-key.test.ts
 * @description:
 *   Тесты ключа запроса линии маршрута и правила заглушки.
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Ключ меняется и от движения водителя, и от смены
 *   заказа со статусом, а вести себя в этих случаях надо противоположно: в
 *   первом прежняя линия спасает от моргания, во втором уводит машину на
 *   чужой маршрут. Проверяется эта развилка — и то, что правило читает ключ
 *   по тем же позициям, по которым он собирается.
 *
 * @dependencies: vitest, @/lib/order-route-key
 * @created: 2026-09-07 (1.5.39)
 */

import { describe, it, expect } from 'vitest';
import { isSameRouteTarget, orderRouteKey, KEY_PRECISION } from './order-route-key';

const ORDER = 'a1b2c3';
const HERE = { lat: 56.104735, lng: 94.592035 };

describe('orderRouteKey', () => {
  it('координаты огрубляются до заданного шага', () => {
    const key = orderRouteKey({ orderId: ORDER, status: 'in_progress', ...HERE });
    expect(key[3]).toBe(HERE.lat.toFixed(KEY_PRECISION));
    expect(key[4]).toBe(HERE.lng.toFixed(KEY_PRECISION));
  });

  it('сдвиг в пределах шага огрубления даёт ТОТ ЖЕ ключ', () => {
    const a = orderRouteKey({ orderId: ORDER, status: 'in_progress', ...HERE });
    const b = orderRouteKey({
      orderId: ORDER,
      status: 'in_progress',
      lat: HERE.lat + 0.0002,
      lng: HERE.lng + 0.0002,
    });
    expect(b).toEqual(a);
  });

  it('без координат ключ не ломается', () => {
    const key = orderRouteKey({ orderId: ORDER, status: 'in_progress', lat: null, lng: undefined });
    expect(key[3]).toBeNull();
    expect(key[4]).toBeNull();
  });
});

describe('isSameRouteTarget', () => {
  const keyOf = (orderId: string | null, status: string | null, lat = HERE.lat) =>
    orderRouteKey({ orderId, status, lat, lng: HERE.lng });

  it('водитель проехал сотню метров — линия та же, показываем прежнюю', () => {
    const prev = keyOf(ORDER, 'in_progress', HERE.lat + 0.001);
    expect(isSameRouteTarget(prev, ORDER, 'in_progress')).toBe(true);
  });

  it('переключились на встречный заказ — прежняя линия ведёт не туда', () => {
    expect(isSameRouteTarget(keyOf('другой', 'in_progress'), ORDER, 'in_progress')).toBe(false);
  });

  it('клиент сел в машину — цель сменилась с подачи на назначение', () => {
    expect(isSameRouteTarget(keyOf(ORDER, 'driver_arrived'), ORDER, 'in_progress')).toBe(false);
  });

  it('первый запрос — прежнего ключа нет', () => {
    expect(isSameRouteTarget(undefined, ORDER, 'in_progress')).toBe(false);
  });

  it('заказ пропал — заглушка не годится', () => {
    expect(isSameRouteTarget(keyOf(ORDER, 'in_progress'), null, null)).toBe(false);
  });

  it('правило читает ключ по тем же позициям, по которым он собран', () => {
    const key = orderRouteKey({ orderId: ORDER, status: 'in_progress', ...HERE });
    expect(key[1]).toBe(ORDER);
    expect(key[2]).toBe('in_progress');
    expect(isSameRouteTarget(key, ORDER, 'in_progress')).toBe(true);
  });
});
