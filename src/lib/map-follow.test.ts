/**
 * @file: src/lib/map-follow.test.ts
 * @description:
 *   Тесты правила «чья сейчас камера».
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Проверяется связка ДВУХ условий: по отдельности каждое
 *   даёт поломку, которую в коде не видно, а в машине видно сразу — только
 *   время выдёргивает карту у стоящего водителя, только расстояние возвращает
 *   её посреди жеста. Плюс запас длительности анимации: без него карта
 *   останавливается на каждом опоздавшем фиксе, и это ровно те «рывки», из-за
 *   которых правило вообще появилось.
 *
 * @dependencies: vitest, @/lib/map-follow
 * @created: 2026-09-08 (1.5.45)
 */

import { describe, it, expect } from 'vitest';
import {
  blendInterval,
  FOLLOW_DEFAULT_INTERVAL_MS,
  FOLLOW_MAX_MS,
  FOLLOW_MIN_MS,
  FOLLOW_RESUME_M,
  FOLLOW_RESUME_MS,
  followCameraDuration,
  shouldResumeFollow,
  type FollowInterrupt,
} from './map-follow';

/** Точка примерно в 111 метрах к северу от `from` на каждые 0.001° широты. */
const at = (latOffsetDeg: number) => ({ latitude: 55 + latOffsetDeg, longitude: 37 });

const HERE = at(0);
/** ~33 м к северу: чуть больше порога в 30. */
const MOVED = at(0.0003);
/** ~11 м к северу: меньше порога. */
const NUDGED = at(0.0001);

const interrupt = (atMs: number, from = HERE): FollowInterrupt => ({ at: atMs, from });

describe('shouldResumeFollow — оба условия обязательны', () => {
  it('время прошло, машина проехала — возвращаем', () => {
    expect(shouldResumeFollow(interrupt(0), FOLLOW_RESUME_MS, MOVED)).toBe(true);
  });

  it('машина проехала, но времени прошло мало — карта остаётся у водителя', () => {
    // Иначе карта прыгала бы прямо посреди жеста: тронулся — и потерял то,
    // что разглядывал.
    expect(shouldResumeFollow(interrupt(0), FOLLOW_RESUME_MS - 1, MOVED)).toBe(false);
  });

  it('время прошло, но машина стоит — карта остаётся у водителя', () => {
    // Водитель ждёт клиента и смотрит двор. Выдёргивать карту не за что.
    expect(shouldResumeFollow(interrupt(0), FOLLOW_RESUME_MS * 10, HERE)).toBe(false);
    expect(shouldResumeFollow(interrupt(0), FOLLOW_RESUME_MS * 10, NUDGED)).toBe(false);
  });

  it('ровно порог расстояния считается пройденным', () => {
    const from = { latitude: 55, longitude: 37 };
    // Смещение подбирать не нужно: проверяем саму границу через опции.
    expect(
      shouldResumeFollow({ at: 0, from }, FOLLOW_RESUME_MS, MOVED, { afterMeters: 33 }),
    ).toBe(true);
    expect(
      shouldResumeFollow({ at: 0, from }, FOLLOW_RESUME_MS, MOVED, { afterMeters: 34 }),
    ).toBe(false);
  });
});

describe('shouldResumeFollow — вырожденные случаи не залипают', () => {
  it('перехвата не было — возвращать нечего, но и блокировать нельзя', () => {
    expect(shouldResumeFollow(null, 0, HERE)).toBe(true);
  });

  it('где была машина, неизвестно — решает только время', () => {
    expect(shouldResumeFollow({ at: 0, from: null }, FOLLOW_RESUME_MS, HERE)).toBe(true);
    expect(shouldResumeFollow({ at: 0, from: null }, FOLLOW_RESUME_MS - 1, HERE)).toBe(false);
  });

  it('где машина сейчас, неизвестно — возвращать не к чему', () => {
    expect(shouldResumeFollow(interrupt(0), FOLLOW_RESUME_MS * 10, null)).toBe(false);
  });

  it('часы ушли назад — считаем, что время прошло, а не ждём вечно', () => {
    // Отрицательная разница не должна запирать слежение навсегда.
    expect(shouldResumeFollow(interrupt(FOLLOW_RESUME_MS * 5), 0, MOVED)).toBe(true);
  });
});

describe('followCameraDuration — анимация всегда длиннее интервала', () => {
  it('запас есть: следующая анимация начнётся до конца предыдущей', () => {
    // Ровно интервал означал бы остановку на каждом опоздавшем фиксе.
    expect(followCameraDuration(1000)).toBeGreaterThan(1000);
  });

  it('интервала ещё нет — берём значение по умолчанию', () => {
    expect(followCameraDuration(null)).toBe(followCameraDuration(FOLLOW_DEFAULT_INTERVAL_MS));
    expect(followCameraDuration(Number.NaN)).toBe(
      followCameraDuration(FOLLOW_DEFAULT_INTERVAL_MS),
    );
    expect(followCameraDuration(0)).toBe(followCameraDuration(FOLLOW_DEFAULT_INTERVAL_MS));
  });

  it('очень частый и очень редкий GPS упираются в границы', () => {
    expect(followCameraDuration(100)).toBe(FOLLOW_MIN_MS);
    expect(followCameraDuration(60_000)).toBe(FOLLOW_MAX_MS);
  });
});

describe('blendInterval — среднее не прыгает от одного пакета', () => {
  it('первый замер задаёт среднее целиком', () => {
    expect(blendInterval(null, 1000)).toBe(1000);
  });

  it('один опоздавший фикс сдвигает среднее, но не подменяет его', () => {
    const next = blendInterval(1000, 3000);
    expect(next).toBeGreaterThan(1000);
    expect(next).toBeLessThan(2000);
  });

  it('провал связи в среднее не идёт целиком', () => {
    // Тоннель на минуту — это не темп съёмки. Замер обрезается.
    expect(blendInterval(1000, 60_000)).toBe(blendInterval(1000, 5000));
  });

  it('двойной фикс от приёмника среднее не обнуляет', () => {
    expect(blendInterval(1000, 1)).toBe(blendInterval(1000, 250));
  });

  it('мусор оставляет прежнее среднее', () => {
    expect(blendInterval(1200, Number.NaN)).toBe(1200);
    expect(blendInterval(null, Number.NaN)).toBe(FOLLOW_DEFAULT_INTERVAL_MS);
  });
});

describe('константы согласованы между собой', () => {
  it('порог расстояния меньше того, что машина проезжает за время ожидания', () => {
    // Иначе на городской скорости решало бы расстояние, и правило «время И
    // расстояние» выродилось бы в одно расстояние.
    const metersAt40kmh = (40_000 / 3600) * (FOLLOW_RESUME_MS / 1000);
    expect(FOLLOW_RESUME_M).toBeLessThan(metersAt40kmh);
  });
});
