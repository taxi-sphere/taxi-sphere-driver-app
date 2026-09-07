/**
 * @file: src/lib/route-snap.test.ts
 * @description:
 *   Тесты притягивания машины к линии маршрута.
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Проверяется то, ради чего модуль появился: точка
 *   встаёт НА дорогу, курс берётся с дороги, а не с шумного фикса, и
 *   притягивание НЕ происходит, когда водитель действительно уехал с
 *   маршрута. Плюс два случая, на которых наивная проекция врёт: точка
 *   позади начала отрезка (её нельзя проецировать на продолжение) и
 *   повторяющиеся точки в геометрии от маршрутизатора.
 *
 * @dependencies: vitest, @/lib/route-snap
 * @created: 2026-09-07 (1.5.39)
 */

import { describe, it, expect } from 'vitest';
import { MAX_SNAP_M, projectOnSegment, routeAhead, snapToRoute } from './route-snap';

/** Тула, центр — на этой широте градус долготы ≈ 65 км. */
const BASE = { latitude: 54.193, longitude: 37.617 };

const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((BASE.latitude * Math.PI) / 180);

function at(northM: number, eastM: number) {
  return {
    latitude: BASE.latitude + northM / M_PER_DEG_LAT,
    longitude: BASE.longitude + eastM / M_PER_DEG_LNG,
  };
}

/** Прямая дорога на север длиной 300 метров. */
const STRAIGHT = [at(0, 0), at(100, 0), at(200, 0), at(300, 0)];

describe('projectOnSegment', () => {
  it('точка сбоку садится на отрезок, расстояние — до линии', () => {
    const p = projectOnSegment(at(50, 30), at(0, 0), at(100, 0));
    expect(p.distanceM).toBeCloseTo(30, 0);
    expect(p.point.latitude).toBeCloseTo(at(50, 0).latitude, 6);
    expect(p.point.longitude).toBeCloseTo(BASE.longitude, 6);
  });

  it('точка ПОЗАДИ начала прижимается к началу, а не к продолжению', () => {
    const p = projectOnSegment(at(-40, 0), at(0, 0), at(100, 0));
    expect(p.point.latitude).toBeCloseTo(BASE.latitude, 9);
    expect(p.distanceM).toBeCloseTo(40, 0);
  });

  it('вырожденный отрезок не делит на ноль', () => {
    const p = projectOnSegment(at(10, 0), at(0, 0), at(0, 0));
    expect(p.distanceM).toBeCloseTo(10, 0);
    expect(Number.isFinite(p.distanceM)).toBe(true);
  });
});

describe('snapToRoute', () => {
  it('машину во дворе ставит на дорогу и берёт курс дороги', () => {
    const snap = snapToRoute(at(150, 35), STRAIGHT);
    expect(snap).not.toBeNull();
    expect(snap!.distanceM).toBeCloseTo(35, 0);
    expect(snap!.bearing).toBeCloseTo(0, 0);
    expect(snap!.index).toBe(1);
    expect(snap!.point.longitude).toBeCloseTo(BASE.longitude, 6);
  });

  it('курс берётся с дороги, а не из положения самой точки', () => {
    // Дорога поворачивает на восток, машину GPS увёл на север от поворота.
    const corner = [at(0, 0), at(100, 0), at(100, 200)];
    const snap = snapToRoute(at(110, 60), corner);
    expect(snap!.bearing).toBeCloseTo(90, 0);
  });

  it('на самой вершине поворота курс уже НОВЫЙ, а не тот, откуда приехали', () => {
    const corner = [at(0, 0), at(100, 0), at(100, 200)];
    const snap = snapToRoute(at(100, 0), corner);
    expect(snap!.bearing).toBeCloseTo(90, 0);
  });

  it('съехавшего с маршрута не притягивает', () => {
    expect(snapToRoute(at(150, MAX_SNAP_M + 20), STRAIGHT)).toBeNull();
  });

  it('порог можно задать явно', () => {
    expect(snapToRoute(at(150, 80), STRAIGHT, 100)).not.toBeNull();
    expect(snapToRoute(at(150, 80), STRAIGHT, 40)).toBeNull();
  });

  it('маршрута нет — притягивать не к чему', () => {
    expect(snapToRoute(at(0, 0), [])).toBeNull();
    expect(snapToRoute(at(0, 0), [at(0, 0)])).toBeNull();
  });

  it('повторяющиеся точки геометрии не дают курс 0 на ровном месте', () => {
    // Маршрутизатор отдаёт дубли на перекрёстках; курс надо искать дальше.
    const withDupes = [at(0, 0), at(0, 0), at(0, 100), at(0, 200)];
    const snap = snapToRoute(at(5, 0), withDupes);
    expect(snap!.bearing).toBeCloseTo(90, 0);
  });

  it('маршрут целиком из одной точки — курса нет, а значит нет и проекции', () => {
    expect(snapToRoute(at(0, 0), [at(0, 0), at(0, 0)])).toBeNull();
  });
});

describe('routeAhead', () => {
  it('линия начинается ровно под машиной, хвост позади отрезан', () => {
    const snap = snapToRoute(at(150, 20), STRAIGHT)!;
    const ahead = routeAhead(STRAIGHT, snap);

    expect(ahead[0]).toEqual(snap.point);
    expect(ahead).toHaveLength(3); // проекция + две точки впереди
    expect(ahead[ahead.length - 1]).toEqual(STRAIGHT[3]);
  });

  it('на последнем отрезке остаётся линия из двух точек, а не огрызок', () => {
    const snap = snapToRoute(at(250, 10), STRAIGHT)!;
    const ahead = routeAhead(STRAIGHT, snap);

    expect(ahead).toHaveLength(2);
    expect(ahead[1]).toEqual(STRAIGHT[3]);
  });

  it('без проекции маршрут отдаётся целиком', () => {
    expect(routeAhead(STRAIGHT, null)).toBe(STRAIGHT);
  });
});
