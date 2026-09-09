/**
 * @file: src/lib/trip-odometer.test.ts
 * @description:
 *   Тесты одометра поездки.
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Одометр — вход в денежный расчёт, и его ошибки не
 *   видны на экране: пробег просто оказывается не тем. Проверяется каждое
 *   правило, из-за которого он вообще написан отдельным модулем — порог
 *   смещения (стоящая машина не должна набирать километры), потолок
 *   промежутка (час в тоннеле не время в движении), неподвижная точка
 *   отсчёта при шагах ниже порога (иначе медленное движение теряется
 *   целиком) и запоздавшие пакеты (расстояние не должно считаться дважды).
 *
 * @dependencies: vitest, @/lib/trip-odometer
 * @created: 2026-09-09 (1.5.46)
 */

import { describe, it, expect } from 'vitest';
import {
  accumulate,
  emptyOdometer,
  MAX_GAP_SEC,
  MIN_STEP_M,
  PUSH_EVERY_M,
  PUSH_EVERY_MS,
  readingOf,
  shouldPush,
  type OdometerPoint,
} from './trip-odometer';

/**
 * Точка со сдвигом на север.
 *
 * Пересчёт здесь ПЛОСКИЙ (111 320 м на градус), а `distanceMeters` считает
 * по сфере — на сотнях метров это расходится на доли процента. Поэтому
 * длины сверяются с допуском, а точными числами проверяется только то, что
 * от геометрии не зависит: время, пороги и отбрасывание точек.
 */
const north = (meters: number, atSec: number): OdometerPoint => ({
  latitude: 55 + meters / 111_320,
  longitude: 37,
  at: atSec * 1000,
});

const start = (atSec = 0): OdometerPoint => north(0, atSec);

describe('накопление пробега', () => {
  it('первая точка задаёт отсчёт и ничего не добавляет', () => {
    const s = accumulate(emptyOdometer(), start());
    expect(s.distanceM).toBe(0);
    expect(s.movingSec).toBe(0);
    expect(s.last).not.toBeNull();
  });

  it('шаг больше порога идёт в пробег и во время', () => {
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(50, 10));
    expect(Math.round(s.distanceM)).toBe(50);
    expect(s.movingSec).toBe(10);
  });

  it('пробег складывается по шагам', () => {
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(50, 10));
    s = accumulate(s, north(120, 20));
    expect(Math.round(s.distanceM)).toBe(120);
    expect(s.movingSec).toBe(20);
  });
});

describe('стоящая машина не набирает ничего', () => {
  it('дрожание приёмника ниже порога отбрасывается', () => {
    let s = accumulate(emptyOdometer(), start(0));
    for (let i = 1; i <= 20; i++) {
      s = accumulate(s, north(i % 2 === 0 ? 3 : 6, i));
    }
    expect(s.distanceM).toBe(0);
    expect(s.movingSec).toBe(0);
  });

  it('ровно порог уже считается движением', () => {
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(MIN_STEP_M + 0.5, 5));
    expect(s.distanceM).toBeGreaterThan(0);
  });

  it('точка отсчёта при шаге ниже порога НЕ сдвигается', () => {
    // Иначе медленное движение рассыпалось бы на шаги по 5 м и не набрало
    // бы ни метра за всю поездку.
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(5, 1));
    s = accumulate(s, north(10, 2));
    s = accumulate(s, north(15, 3));
    expect(Math.round(s.distanceM)).toBe(15);
  });
});

describe('провалы в потоке', () => {
  it('длинный промежуток даёт пробег, но не время в движении', () => {
    // Тоннель: машина проехала километр, но считать этот час поездкой
    // нельзя — водитель мог всё это время стоять.
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(1000, MAX_GAP_SEC + 60));
    expect(s.distanceM).toBeGreaterThan(990);
    expect(s.movingSec).toBe(0);
  });

  it('промежуток ровно на границе ещё считается', () => {
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(100, MAX_GAP_SEC));
    expect(s.movingSec).toBe(MAX_GAP_SEC);
  });

  it('запоздавший пакет не двигает одометр', () => {
    let s = accumulate(emptyOdometer(), start(10));
    s = accumulate(s, north(100, 20));
    const before = s.distanceM;
    s = accumulate(s, north(50, 15));
    expect(s.distanceM).toBe(before);
  });

  it('точка с тем же временем игнорируется', () => {
    let s = accumulate(emptyOdometer(), start(10));
    s = accumulate(s, north(100, 20));
    const before = { ...s };
    s = accumulate(s, north(300, 20));
    expect(s.distanceM).toBe(before.distanceM);
  });

  it('мусор в координатах не роняет одометр', () => {
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, { latitude: Number.NaN, longitude: 37, at: 10_000 });
    expect(s.distanceM).toBe(0);
    expect(s.last?.at).toBe(0);
  });
});

describe('скачки GPS не попадают в чек', () => {
  it('фикс с плохой точностью не двигает одометр', () => {
    // Двор-колодец: приёмник теряет небо и отдаёт положение по вышкам,
    // честно пометив его точностью в сотни метров.
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, { ...north(300, 1), accuracy: 400 });
    expect(s.distanceM).toBe(0);
  });

  it('после плохого фикса точка отсчёта остаётся прежней', () => {
    // Иначе прыжок туда и обратно засчитался бы как шестьсот метров.
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, { ...north(300, 1), accuracy: 400 });
    s = accumulate(s, { ...north(0, 2), accuracy: 8 });
    expect(s.distanceM).toBe(0);
  });

  it('хороший фикс с точностью в пределах нормы считается', () => {
    let s = accumulate(emptyOdometer(), { ...start(0), accuracy: 8 });
    s = accumulate(s, { ...north(50, 10), accuracy: 12 });
    expect(Math.round(s.distanceM)).toBe(50);
  });

  it('скачок без пометки точности отбрасывается по скорости', () => {
    // 300 метров за секунду — 1080 км/ч. Такого не бывает.
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(300, 1));
    expect(s.distanceM).toBe(0);
  });

  it('прыжок туда и обратно не добавляет ничего', () => {
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(300, 1));
    s = accumulate(s, north(0, 2));
    expect(s.distanceM).toBe(0);
  });

  it('быстрая, но возможная езда считается', () => {
    // 100 км/ч по трассе: 28 м/с — намного ниже потолка.
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(280, 10));
    expect(Math.round(s.distanceM)).toBe(280);
  });

  it('долгий провал связи скачком не считается', () => {
    // 60 км за час — 16 м/с, обычная езда. Пробег реальный, и он засчитан;
    // временем в движении этот час не станет (см. потолок промежутка).
    let s = accumulate(emptyOdometer(), start(0));
    s = accumulate(s, north(60_000, 3600));
    expect(s.distanceM).toBeGreaterThan(59_000);
    expect(s.movingSec).toBe(0);
  });

  it('бездорожье считается наравне с дорогой', () => {
    // Никакого притягивания к дорогам: за городом по полю водитель едет с
    // обычной скоростью и с нормальной погрешностью — счётчик обязан
    // считать этот путь.
    let s = accumulate(emptyOdometer(), { ...start(0), accuracy: 15 });
    for (let i = 1; i <= 10; i++) {
      s = accumulate(s, { ...north(i * 40, i * 5), accuracy: 15 });
    }
    expect(Math.round(s.distanceM)).toBe(400);
  });
});

describe('readingOf — целые числа для сервера', () => {
  it('округляет', () => {
    expect(readingOf({ distanceM: 1234.7, movingSec: 59.4, last: null })).toEqual({
      distanceM: 1235,
      movingSec: 59,
    });
  });
});

describe('shouldPush — когда слать на сервер', () => {
  const state = (distanceM: number) => ({ distanceM, movingSec: 10, last: null });

  it('пустой одометр не шлём', () => {
    expect(shouldPush(emptyOdometer(), null, 0)).toBe(false);
  });

  it('первые показания шлём сразу', () => {
    expect(shouldPush(state(30), null, 0)).toBe(true);
  });

  it('накопилось заметное расстояние — шлём', () => {
    expect(shouldPush(state(PUSH_EVERY_M + 1), { distanceM: 0, atMs: 0 }, 1000)).toBe(true);
  });

  it('расстояния мало, времени мало — молчим', () => {
    expect(shouldPush(state(10), { distanceM: 0, atMs: 0 }, 1000)).toBe(false);
  });

  it('машина стоит в пробке — шлём по времени, чтобы не выглядеть пропавшей', () => {
    expect(shouldPush(state(10), { distanceM: 10, atMs: 0 }, PUSH_EVERY_MS)).toBe(true);
  });
});
