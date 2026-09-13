/**
 * @file: src/lib/route-edit.test.ts
 * @description: Какие адреса водитель может поменять в поездке.
 * @created: 2026-09-13 (1.5.61)
 */

import { describe, expect, it } from 'vitest';
import {
  editableRoutePoints,
  parseRoutePointKey,
  routePointKey,
} from './route-edit';
import type { OrderStop } from '@/types/order';

const stop = (overrides: Partial<OrderStop>): OrderStop => ({
  id: 's',
  address: 'улица Ленина, 10',
  lat: 56.1,
  lng: 94.5,
  entrance: null,
  note: null,
  arrivedAt: null,
  ...overrides,
});

describe('editableRoutePoints', () => {
  it('до посадки клиента менять нечего', () => {
    for (const status of ['assigned', 'driver_arrived'] as const) {
      expect(
        editableRoutePoints({ status, stops: [], dropoffAddress: 'улица Мира, 4', dropoffEntrance: null }),
      ).toEqual([]);
    }
  });

  it('без промежуточных точек — только конечная, и она текущая', () => {
    expect(
      editableRoutePoints({ status: 'in_progress', stops: [], dropoffAddress: 'улица Мира, 4', dropoffEntrance: '2' }),
    ).toEqual([
      { ref: { kind: 'dropoff' }, label: 'Куда', address: 'улица Мира, 4', entrance: '2', current: true },
    ]);
  });

  it('пройденная точка не предлагается, текущая — первая непройденная', () => {
    const points = editableRoutePoints({
      status: 'in_progress',
      stops: [
        stop({ id: 's1', arrivedAt: '2026-09-13T12:35:38Z' }),
        stop({ id: 's2', address: 'Набережная улица, 2' }),
      ],
      dropoffAddress: 'улица Бортникова, 48',
      dropoffEntrance: null,
    });
    expect(points.map((p) => [p.label, p.current])).toEqual([
      ['Точка 2', true],
      ['Куда', false],
    ]);
    expect(points[0]?.ref).toEqual({ kind: 'stop', stopId: 's2' });
  });

  it('конечной точки нет — её можно задать', () => {
    const [point] = editableRoutePoints({
      status: 'in_progress',
      stops: [],
      dropoffAddress: null,
      dropoffEntrance: null,
    });
    expect(point).toMatchObject({ label: 'Куда', address: null, current: true });
  });

  it('точка без id (старый сервер) не предлагается', () => {
    const points = editableRoutePoints({
      status: 'in_progress',
      stops: [stop({ id: null })],
      dropoffAddress: 'улица Мира, 4',
      dropoffEntrance: null,
    });
    expect(points.map((p) => p.label)).toEqual(['Куда']);
  });
});

describe('routePointKey', () => {
  it('туда и обратно', () => {
    expect(parseRoutePointKey(routePointKey({ kind: 'dropoff' }))).toEqual({ kind: 'dropoff' });
    expect(parseRoutePointKey(routePointKey({ kind: 'stop', stopId: 'abc' }))).toEqual({
      kind: 'stop',
      stopId: 'abc',
    });
  });

  it('битый ключ', () => {
    expect(parseRoutePointKey('stop:')).toBeNull();
    expect(parseRoutePointKey('pickup')).toBeNull();
    expect(parseRoutePointKey(undefined)).toBeNull();
  });
});
