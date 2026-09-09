/**
 * @file: src/lib/waiting-hint.test.ts
 * @description:
 *   Тесты подсказки про ожидание.
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Это текст про деньги, и ошибка в нём не падает: водитель
 *   просто называет клиенту неверный остаток бесплатного времени или неверную
 *   сумму. Проверяется переход через границу бесплатного (главное место, где
 *   меняется смысл строки), тариф без платного ожидания и вырожденные случаи —
 *   ожидания ещё не было, счётчик выключен, время больше часа.
 *
 * @dependencies: vitest, @/lib/waiting-hint
 * @created: 2026-09-09 (1.5.47)
 */

import { describe, it, expect } from 'vitest';
import {
  formatWaitClock,
  liveWaitingSec,
  waitingHint,
  waitingTermsText,
  type WaitingState,
} from './waiting-hint';

const state = (over: Partial<WaitingState> = {}): WaitingState => ({
  waitingSec: 0,
  waitingOn: false,
  freeSec: 300,
  perMinute: 6,
  cost: 0,
  ...over,
});

describe('formatWaitClock', () => {
  it('минуты и секунды', () => {
    expect(formatWaitClock(0)).toBe('0:00');
    expect(formatWaitClock(9)).toBe('0:09');
    expect(formatWaitClock(65)).toBe('1:05');
    expect(formatWaitClock(600)).toBe('10:00');
  });

  it('больше часа считаем минутами, а не часами', () => {
    // Водитель ждёт минутами; «1:05:00» он читал бы как час и пять минут,
    // а на счётчике важна именно минута.
    expect(formatWaitClock(3900)).toBe('65:00');
  });

  it('отрицательное и мусор — ноль', () => {
    expect(formatWaitClock(-10)).toBe('0:00');
  });
});

describe('waitingHint — пока идёт бесплатное', () => {
  it('показывает потраченное И остаток бесплатного', () => {
    // Потраченное водитель называет клиенту, остаток отвечает ему самому на
    // вопрос «ждать ли дальше». Нужны оба.
    expect(waitingHint(state({ waitingOn: true, waitingSec: 100 }))).toEqual({
      text: '1:40 · ещё 3:20',
      paid: false,
    });
  });

  it('счётчик только включили', () => {
    expect(waitingHint(state({ waitingOn: true, waitingSec: 0 }))?.text).toBe(
      '0:00 · ещё 5:00',
    );
  });
});

describe('waitingHint — после границы бесплатного', () => {
  it('время остаётся на месте, к нему добавляется сумма', () => {
    // До 1.5.48 время здесь ПРОПАДАЛО — ровно там, где клиент спрашивает
    // «сколько я вас продержал».
    expect(
      waitingHint(state({ waitingOn: true, waitingSec: 420, cost: 12 })),
    ).toEqual({ text: '7:00 · 12 ₽', paid: true });
  });

  it('ровно на границе бесплатное уже кончилось', () => {
    expect(waitingHint(state({ waitingOn: true, waitingSec: 300, cost: 0 }))?.paid).toBe(
      true,
    );
  });

  it('сумма округляется до рубля', () => {
    expect(
      waitingHint(state({ waitingOn: true, waitingSec: 400, cost: 12.4 }))?.text,
    ).toBe('6:40 · 12 ₽');
  });
});

describe('waitingHint — вырожденные случаи', () => {
  it('ожидания не было и счётчик выключен — сказать нечего', () => {
    expect(waitingHint(state())).toBeNull();
  });

  it('счётчик выключен — строка не занимает места, даже если ожидание было', () => {
    // В поездке ожидание включают редко, и строка под НЕидущий счётчик
    // висела бы на плашке всю дорогу. Накопленное входит в сумму, разбор —
    // в развёрнутой шторке.
    expect(waitingHint(state({ waitingSec: 200, cost: 0 }))).toBeNull();
  });

  it('в тарифе ожидание не тарифицируется — только время', () => {
    // Ни «платно», ни «бесплатно ещё»: остаток бесплатного тут бесконечный,
    // и обещать по нему нечего.
    const s = state({ waitingOn: true, waitingSec: 900, perMinute: 0, freeSec: 0 });
    expect(waitingHint(s)).toEqual({ text: '15:00', paid: false });
  });

  it('бесплатного нет вовсе — сразу платно', () => {
    const s = state({ waitingOn: true, waitingSec: 60, freeSec: 0, cost: 6 });
    expect(waitingHint(s)).toEqual({ text: '1:00 · 6 ₽', paid: true });
  });
});

describe('liveWaitingSec', () => {
  it('счётчик выключен — время сервера как есть, ничего не дорастает', () => {
    expect(liveWaitingSec(200, false, 9_000)).toBe(200);
  });

  it('счётчик идёт — добавляет прошедшее с момента ответа', () => {
    expect(liveWaitingSec(200, true, 7_400)).toBe(207);
  });

  it('неполная секунда не считается', () => {
    expect(liveWaitingSec(200, true, 999)).toBe(200);
  });

  it('часы устройства ушли назад — не вычитаем', () => {
    // Между ответом и отрисовкой время не может идти вспять, но часы
    // телефона перевести можно, и таймер не должен пойти в минус.
    expect(liveWaitingSec(200, true, -5_000)).toBe(200);
  });

  it('мусор из сервера не уводит счётчик в минус', () => {
    expect(liveWaitingSec(-30, true, 3_000)).toBe(3);
  });
});

describe('waitingTermsText', () => {
  it('обычный тариф', () => {
    expect(waitingTermsText(300, 6)).toBe('Бесплатно 5 мин, дальше 6 ₽/мин');
  });

  it('бесплатного нет', () => {
    expect(waitingTermsText(0, 6)).toBe('Ожидание платное с первой минуты · 6 ₽/мин');
  });

  it('ожидание не тарифицируется — строки нет', () => {
    expect(waitingTermsText(300, 0)).toBeNull();
  });

  it('секунды округляются до минут', () => {
    expect(waitingTermsText(200, 6)).toBe('Бесплатно 3 мин, дальше 6 ₽/мин');
  });
});
