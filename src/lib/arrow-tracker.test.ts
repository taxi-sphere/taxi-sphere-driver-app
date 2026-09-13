/**
 * @file: src/lib/arrow-tracker.test.ts
 * @description:
 *   Тесты стрелки «с памятью».
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Каждый случай — механизм, который контрольный опыт
 *   13.09.2026 поймал на логике 1.5.61: неточный фикс уводил стрелку на
 *   соседнюю улицу, ближайший кусок маршрута перетягивал её на обратную ногу
 *   разворота, одиночный выброс переносил вперёд по маршруту. Плюс то, что
 *   нельзя сломать, починяя это: настоящий съезд с маршрута и настоящий
 *   разворот должны быть видны.
 *
 * @dependencies: vitest, @/lib/arrow-tracker, @/lib/heading, @/lib/route-snap
 * @created: 2026-09-13 (1.5.62)
 */

import { describe, it, expect } from 'vitest';
import {
  CONFIRM_FIXES,
  JOURNAL_FIXES,
  MAX_FIX_ACCURACY_M,
  createTracker,
  judgeFix,
  routeOrigin,
  trackFix,
  trackRoute,
  type TrackerFix,
  type TrackerState,
  type TrackerStep,
} from './arrow-tracker';
import { angleDelta, type HeadingPoint } from './heading';
import { snapToRoute } from './route-snap';

/** Тула, центр — как в тестах `route-snap`. */
const BASE = { latitude: 54.193, longitude: 37.617 };
const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((BASE.latitude * Math.PI) / 180);
const T0 = 1_757_000_000_000;

function at(northM: number, eastM: number): HeadingPoint {
  return {
    latitude: BASE.latitude + northM / M_PER_DEG_LAT,
    longitude: BASE.longitude + eastM / M_PER_DEG_LNG,
  };
}

const northOf = (p: HeadingPoint) => (p.latitude - BASE.latitude) * M_PER_DEG_LAT;
const eastOf = (p: HeadingPoint) => (p.longitude - BASE.longitude) * M_PER_DEG_LNG;

function fix(second: number, northM: number, eastM = 0, extra: Partial<TrackerFix> = {}): TrackerFix {
  return { ...at(northM, eastM), accuracy: 8, speed: 10, timestamp: T0 + second * 1000, ...extra };
}

/** Прямая на север, вершина каждые 10 метров — как густая геометрия роутера. */
function straight(lengthM: number, stepM = 10): HeadingPoint[] {
  const points: HeadingPoint[] = [];
  for (let n = 0; n <= lengthM; n += stepM) points.push(at(n, 0));
  return points;
}

function run(fixes: TrackerFix[], route: readonly HeadingPoint[], from: TrackerState = createTracker()) {
  let state = from;
  const steps: TrackerStep[] = [];
  for (const f of fixes) {
    const step = trackFix(state, f, route);
    steps.push(step);
    state = step.state;
  }
  return { state, steps };
}

/** Машина едет на север 10 м/с с первой по `seconds`-ю секунду. */
function drive(seconds: number, startSecond = 0) {
  return Array.from({ length: seconds }, (_, i) => fix(startSecond + i, (startSecond + i) * 10));
}

describe('judgeFix — отсев фиксов', () => {
  it('первый фикс принимается даже неточным: сравнивать не с чем', () => {
    expect(judgeFix(null, fix(0, 0, 0, { accuracy: 400 }))).toBe('accepted');
  });

  it('фикс не новее прошлого отсеивается', () => {
    expect(judgeFix(fix(5, 0), fix(4, 10))).toBe('stale');
    expect(judgeFix(fix(5, 0), fix(5, 10))).toBe('stale');
  });

  it('точность хуже 50 м отсеивается, неизвестная — нет', () => {
    expect(judgeFix(fix(0, 0), fix(1, 10, 0, { accuracy: MAX_FIX_ACCURACY_M + 1 }))).toBe('inaccurate');
    expect(judgeFix(fix(0, 0), fix(1, 10, 0, { accuracy: null }))).toBe('accepted');
  });

  it('скачок быстрее машины отсеивается, но не бесконечно', () => {
    expect(judgeFix(fix(0, 0), fix(1, 300))).toBe('jump');
    expect(judgeFix(fix(0, 0), fix(1, 300), CONFIRM_FIXES - 1)).toBe('accepted');
  });

  it('после неточного фикса честно далёкий хороший не считается скачком', () => {
    expect(judgeFix(fix(0, 0, 0, { accuracy: 400 }), fix(1, 300))).toBe('accepted');
  });
});

describe('стрелка на маршруте', () => {
  const ROUTE = straight(1000);

  it('неточный фикс «по вышкам» не уводит стрелку с дороги', () => {
    const { state } = run(drive(10), ROUTE);
    const step = trackFix(state, fix(10, 100, 70, { accuracy: 150 }), ROUTE);

    expect(step.verdict).toBe('inaccurate');
    expect(Math.abs(eastOf(step.state.output!.point))).toBeLessThan(1);
    // Стрелка при этом не стоит: едет по маршруту своей скоростью.
    expect(northOf(step.state.output!.point)).toBeGreaterThan(95);
  });

  it('одиночный точный фикс в 60 м сбоку не уводит, три подряд — машина съехала', () => {
    const { state } = run(drive(10), ROUTE);
    const aside = [fix(10, 100, 60), fix(11, 110, 60), fix(12, 120, 60)];
    const { steps } = run(aside, ROUTE, state);

    expect(Math.abs(eastOf(steps[0]!.state.output!.point))).toBeLessThan(1);
    expect(Math.abs(eastOf(steps[1]!.state.output!.point))).toBeLessThan(1);
    expect(eastOf(steps[2]!.state.output!.point)).toBeCloseTo(60, 0);
    expect(steps[2]!.state.output!.snap).toBeNull();
  });

  it('один фикс далеко впереди по маршруту не переносит стрелку, три подряд — переносят', () => {
    const { state } = run(drive(11), ROUTE);
    // Пауза в съёмке 20 с — скачок по скорости правдоподобный.
    const ahead = [fix(30, 300), fix(31, 310), fix(32, 320)];
    const { steps } = run(ahead, ROUTE, state);

    expect(northOf(steps[0]!.state.output!.point)).toBeLessThan(200);
    expect(northOf(steps[1]!.state.output!.point)).toBeLessThan(200);
    expect(northOf(steps[2]!.state.output!.point)).toBeCloseTo(320, 0);
  });

  it('стоящая машина не ползёт назад по маршруту', () => {
    const { state } = run(drive(11), ROUTE);
    const standing = [95, 90, 97].map((n, i) => fix(11 + i, n, 0, { speed: 0 }));
    const { state: after } = run(standing, ROUTE, state);

    expect(northOf(after.output!.point)).toBeGreaterThanOrEqual(99.5);
  });

  it('первый захват на густой геометрии не отъезжает на вершину позади', () => {
    const { state } = run([fix(0, 105, 5)], ROUTE);
    expect(northOf(state.output!.point)).toBeCloseTo(105, 0);
  });
});

describe('маршрут, проходящий рядом сам с собой', () => {
  /** Подача позади: 250 м на север, разворот, обратно по соседней полосе в 8 м. */
  const THERE_AND_BACK = [...straight(250), at(250, 8), at(0, 8)];

  it('при первом захвате выбирается ранний кусок, а не ближайшая обратная нога', () => {
    const fromTheSide = at(50, 5);
    // Старое притягивание брало обратную ногу — ровно тот разворот назад.
    expect(Math.abs(angleDelta(180, snapToRoute(fromTheSide, THERE_AND_BACK)!.bearing))).toBeLessThan(1);

    const { state } = run([fix(0, 50, 5)], THERE_AND_BACK);
    expect(Math.abs(angleDelta(0, state.output!.heading!))).toBeLessThan(1);
    expect(Math.abs(eastOf(state.output!.point))).toBeLessThan(1);
  });

  it('в движении шум к обратной ноге не переносит стрелку на неё', () => {
    const fixes = Array.from({ length: 20 }, (_, i) => fix(i, i * 10, i % 2 === 0 ? 6 : 2));
    const { steps } = run(fixes, THERE_AND_BACK);

    for (const step of steps.slice(2)) {
      expect(Math.abs(eastOf(step.state.output!.point))).toBeLessThan(1);
      expect(Math.abs(angleDelta(0, step.state.output!.heading!))).toBeLessThan(1);
    }
  });
});

describe('курс собственного движения', () => {
  /** Без маршрута курс держится только на движении. */
  const NONE: HeadingPoint[] = [];
  const seconds = (norths: number[], start: number, speed = 20) =>
    norths.map((n, i) => fix(start + i, n, 0, { speed }));

  it('одиночный замер назад не разворачивает стрелку', () => {
    const { state } = run(seconds([0, 20, 40, 60, 80], 0), NONE);
    const { steps } = run(seconds([60, 100, 120], 5), NONE, state);

    for (const step of steps) expect(Math.abs(angleDelta(0, step.state.output!.heading!))).toBeLessThan(1);
  });

  it('настоящий разворот принимается после подтверждения и без рывка больше 45° за фикс', () => {
    const { state } = run(seconds([0, 20, 40, 60, 80], 0), NONE);
    const { steps } = run(seconds([60, 40, 20, 0, -20, -40, -60], 5), NONE, state);

    let previous = 0;
    for (const step of steps) {
      const heading = step.state.output!.heading!;
      expect(Math.abs(angleDelta(previous, heading))).toBeLessThanOrEqual(45 + 1e-9);
      previous = heading;
    }
    expect(Math.abs(angleDelta(180, previous))).toBeLessThan(1);
  });

  it('разворот на ходу попадает в журнал с последними фиксами — не чаще раза в минуту', () => {
    const there = seconds([0, 20, 40, 60, 80], 0);
    const back = seconds([60, 40, 20, 0, -20, -40], 5);
    const again = seconds([-20, 0, 20, 40, 60, 80, 100], 11);
    const { steps } = run([...there, ...back, ...again], NONE);

    const reversals = steps.flatMap((step) => (step.reversal ? [step.reversal] : []));
    expect(reversals).toHaveLength(1);
    expect(Math.abs(angleDelta(reversals[0]!.from, reversals[0]!.to))).toBeGreaterThan(120);
    expect(reversals[0]!.fixes.length).toBeLessThanOrEqual(JOURNAL_FIXES);
    expect(reversals[0]!.fixes.at(-1)!.at).toBe(reversals[0]!.at);
  });
});

describe('trackRoute — новая линия без нового фикса', () => {
  it('тот же маршрут — то же состояние', () => {
    const route = straight(500);
    const { state } = run(drive(5), route);
    expect(trackRoute(state, route)).toBe(state);
  });

  it('новая линия захватывается по последнему фиксу, место относится к ней', () => {
    const first = straight(500);
    const { state } = run(drive(5), first);
    const rebuilt = straight(500).map((p) => ({ ...p }));

    const next = trackRoute(state, rebuilt);
    expect(next.output!.route).toBe(rebuilt);
    expect(northOf(next.output!.point)).toBeCloseTo(40, 0);
  });
});

describe('разворот по маршруту и езда назад по линии', () => {
  it('на развороте, заложенном в маршрут, стрелка поворачивает с дорогой, не дожидаясь курса движения', () => {
    // 200 м на север, разворот через (208, 6), обратно на юг в 12 м.
    const route = [...straight(200), at(208, 6), at(200, 12), at(100, 12), at(0, 12)];
    const { state } = run(drive(20), route);

    const turn = [at(200, 0), at(206, 4), at(206, 9), at(198, 12), at(190, 12), at(185, 12)].map(
      (p, i) => ({ ...p, accuracy: 8, speed: 5, timestamp: T0 + (20 + i) * 1000 }),
    );
    const { steps } = run(turn, route, state);

    let previous = state.output!.heading!;
    for (const step of steps) {
      const heading = step.state.output!.heading!;
      expect(Math.abs(angleDelta(previous, heading))).toBeLessThanOrEqual(45 + 1e-9);
      previous = heading;
    }
    expect(Math.abs(angleDelta(180, previous))).toBeLessThan(10);
  });

  it('машина развернулась сама и едет назад по линии — курс из движения, а не с маршрута', () => {
    const route = straight(1000);
    const { state } = run(drive(21), route);
    const back = Array.from({ length: 8 }, (_, i) => fix(21 + i, 190 - i * 10));
    const { state: after } = run(back, route, state);

    expect(Math.abs(angleDelta(180, after.output!.heading!))).toBeLessThan(1);
    expect(Math.abs(eastOf(after.output!.point))).toBeLessThan(1);
  });
});

describe('routeOrigin — откуда просить маршрут', () => {
  const ROUTE = straight(1000);

  it('пока машина на маршруте, принятый выброс не становится началом маршрута', () => {
    const { state } = run(drive(10), ROUTE);
    // Приёмник занизил погрешность, между фиксами пауза — отсев выброс пропустил.
    const step = trackFix(state, fix(13, 130, 70, { accuracy: 10 }), ROUTE);

    expect(step.verdict).toBe('accepted');
    expect(Math.abs(eastOf(routeOrigin(step.state)!))).toBeLessThan(1);
  });

  it('машина сошла с маршрута — маршрут строится от настоящей позиции', () => {
    const { state } = run(drive(10), ROUTE);
    const aside = [fix(10, 100, 60), fix(11, 110, 60), fix(12, 120, 60)];
    const { state: after } = run(aside, ROUTE, state);

    expect(eastOf(routeOrigin(after)!)).toBeCloseTo(60, 0);
  });

  it('маршрута ещё нет — от последнего принятого фикса', () => {
    const { state } = run([fix(0, 0, 5)], []);
    expect(eastOf(routeOrigin(state)!)).toBeCloseTo(5, 0);
  });
});

describe('неподтверждённый выброс', () => {
  const ROUTE = straight(1000);
  /** Приёмник занизил погрешность, между фиксами пауза — отсев выброс пропустил. */
  const outlier = () => fix(13, 130, 70, { accuracy: 10 });

  it('не двигает курс движения и точку отсчёта', () => {
    const { state } = run(drive(10), ROUTE);
    const step = trackFix(state, outlier(), ROUTE);

    expect(step.verdict).toBe('accepted');
    expect(step.state.missStreak).toBe(1);
    expect(step.state.movement).toBe(state.movement);
    expect(step.state.anchor).toBe(state.anchor);
  });

  it('пришёл новый маршрут — место на нём ищется от стрелки, а не от выброса', () => {
    const { state } = run(drive(10), ROUTE);
    const step = trackFix(state, outlier(), ROUTE);
    const rebuilt = straight(1000).map((p) => ({ ...p }));

    const next = trackRoute(step.state, rebuilt);
    expect(next.output!.route).toBe(rebuilt);
    expect(Math.abs(eastOf(next.output!.point))).toBeLessThan(1);
  });
});
