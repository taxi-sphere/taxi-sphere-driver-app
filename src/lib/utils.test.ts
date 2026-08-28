/**
 * @file: src/lib/utils.test.ts
 * @description:
 *   Тесты чистых функций из `utils.ts`. Все они уже ломались в бою, поэтому
 *   каждый блок закрывает конкретный случай, а не «покрытие ради покрытия».
 *
 *   ГЛАВНОЕ — блок «маска: посимвольный ввод». Проверка маски ОДНИМ КУСКОМ
 *   (`formatPhoneInput('9230189196')`) ничего не доказывает: поле ввода
 *   контролируемое и возвращает в функцию её же вывод на каждом нажатии.
 *   Ровно на этом в v1.5.12 не поймался дефект, при котором «8923018»
 *   превращалось в «+7 777 793 19 96». Поэтому здесь ввод моделируется
 *   посимвольно через собственный вывод плюс проверяется идемпотентность.
 *
 * @dependencies: vitest, @/lib/utils
 * @created: 2026-08-28 (v1.5.13)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  formatPhoneInput,
  isPhoneComplete,
  splitAddressEntrance,
  stripSharedCityPrefix,
  pickupEtaStep,
  pickupEtaPresets,
} from './utils';

/** Ввод по одному символу через собственный вывод маски — как в поле. */
function typeSequence(chars: string): string {
  let value = '';
  for (const ch of chars) value = formatPhoneInput(value + ch);
  return value;
}

describe('normalizePhone — что уходит на сервер', () => {
  // Бэкенд ищет пользователя ТОЧНЫМ совпадением строки (where: { phone }),
  // поэтому любой привычный ввод обязан свестись к одному виду.
  it.each([
    ['свои 10 цифр', '9230189196'],
    ['через 8', '89230189196'],
    ['через 7', '79230189196'],
    ['уже с плюсом', '+79230189196'],
    ['вставка из контактов', '+7 (923) 018-91-96'],
    ['с пробелами', '+7 923 018 91 96'],
    ['с дефисами', '8-923-018-91-96'],
  ])('%s → +79230189196', (_name, input) => {
    expect(normalizePhone(input)).toBe('+79230189196');
  });
});

describe('formatPhoneInput — маска: посимвольный ввод', () => {
  it('набор своих десяти цифр', () => {
    expect(typeSequence('9230189196')).toBe('+7 923 018 91 96');
  });

  it('набор через 8 не задваивает код страны', () => {
    expect(typeSequence('89230189196')).toBe('+7 923 018 91 96');
  });

  it('набор через 7 не задваивает код страны', () => {
    expect(typeSequence('79230189196')).toBe('+7 923 018 91 96');
  });

  it('незаконченный ввод не искажается', () => {
    expect(typeSequence('8923018')).toBe('+7 923 018');
    expect(typeSequence('92301')).toBe('+7 923 01');
  });

  it('идемпотентна: f(f(x)) === f(x)', () => {
    const once = formatPhoneInput('9230189196');
    expect(formatPhoneInput(once)).toBe(once);
    expect(formatPhoneInput(formatPhoneInput(once))).toBe(once);
  });

  it('вставка целиком', () => {
    expect(formatPhoneInput('+7 (923) 018-91-96')).toBe('+7 923 018 91 96');
    expect(formatPhoneInput('8 923 018 91 96')).toBe('+7 923 018 91 96');
  });

  it('лишние цифры отбрасываются', () => {
    expect(formatPhoneInput('92301891969999')).toBe('+7 923 018 91 96');
  });

  it('пустой ввод остаётся пустым — иначе перекрывается placeholder', () => {
    expect(formatPhoneInput('')).toBe('');
  });

  it('стирание по одному символу', () => {
    let value = formatPhoneInput('9230189196');
    for (let i = 0; i < 3; i++) value = formatPhoneInput(value.slice(0, -1));
    expect(value).toBe('+7 923 018 9');
  });
});

describe('isPhoneComplete', () => {
  it.each([
    ['неполный', '+7 923 01', false],
    ['полный с маской', '+7 923 018 91 96', true],
    ['голые 10 цифр', '9230189196', true],
    ['через 8', '89230189196', true],
    ['пусто', '', false],
  ])('%s → %s', (_name, input, expected) => {
    expect(isPhoneComplete(input as string)).toBe(expected);
  });
});

describe('splitAddressEntrance — подъезд не должен двоиться', () => {
  it('вырезает дубль из адреса', () => {
    expect(
      splitAddressEntrance('Зеленогорск, Бортникова, д. 48 подъезд 1', '1'),
    ).toEqual({ address: 'Зеленогорск, Бортникова, д. 48', entrance: '1' });
  });

  it('вырезает дубль, отделённый запятой', () => {
    expect(splitAddressEntrance('Набережная, д. 76, подъезд 2', '2')).toEqual({
      address: 'Набережная, д. 76',
      entrance: '2',
    });
  });

  it('понимает сокращение «п2»', () => {
    expect(splitAddressEntrance('лавр 3 п2', '2')).toEqual({
      address: 'лавр 3',
      entrance: '2',
    });
  });

  it('НЕ трогает адрес, если в нём другой подъезд', () => {
    expect(splitAddressEntrance('Мира 5 подъезд 3', '1')).toEqual({
      address: 'Мира 5 подъезд 3',
      entrance: '1',
    });
  });

  it.each([
    ['улица «Победы 1»', 'Победы 1'],
    ['«пр. Мира 1»', 'пр. Мира 1'],
  ])('не режет название улицы: %s', (_name, address) => {
    expect(splitAddressEntrance(address, '1').address).toBe(address);
  });

  it('без подъезда возвращает адрес как есть', () => {
    expect(splitAddressEntrance('Мира 5', null)).toEqual({
      address: 'Мира 5',
      entrance: null,
    });
  });

  it('не оставляет пустой адрес', () => {
    expect(splitAddressEntrance('подъезд 1', '1').address).toBe('подъезд 1');
  });
});

describe('stripSharedCityPrefix — общий город избыточен', () => {
  it('снимает город, одинаковый у всех точек', () => {
    expect(
      stripSharedCityPrefix([
        'Зеленогорск, Бортникова, д. 48',
        'Зеленогорск, Набережная, д. 76',
      ]),
    ).toEqual(['Бортникова, д. 48', 'Набережная, д. 76']);
  });

  it('НЕ снимает разные города — это признак выезда за город', () => {
    const addresses = ['Зеленогорск, Мира 1', 'Красноярск, Ленина 2'];
    expect(stripSharedCityPrefix(addresses)).toEqual(addresses);
  });

  it('работает с промежуточными остановками', () => {
    expect(
      stripSharedCityPrefix([
        'Зеленогорск, А 1',
        'Зеленогорск, Б 2',
        'Зеленогорск, В 3',
      ]),
    ).toEqual(['А 1', 'Б 2', 'В 3']);
  });

  it('одна точка — снимать нечего', () => {
    expect(stripSharedCityPrefix(['Зеленогорск, Мира 1'])).toEqual([
      'Зеленогорск, Мира 1',
    ]);
  });

  it('пустые значения не ломают разбор', () => {
    expect(stripSharedCityPrefix(['Зеленогорск, Мира 1', ''])).toEqual([
      'Зеленогорск, Мира 1',
      '',
    ]);
  });

  it('адреса без запятых остаются как есть', () => {
    expect(stripSharedCityPrefix(['Мира 1', 'Мира 1'])).toEqual([
      'Мира 1',
      'Мира 1',
    ]);
  });
});

describe('pickupEtaStep — шаг соразмерен значению', () => {
  it.each([
    [5, 1],
    [29, 1],
    [30, 5],
    [119, 5],
    [120, 15],
    [1440, 15],
  ])('%i мин → шаг %i', (value, expected) => {
    expect(pickupEtaStep(value)).toBe(expected);
  });
});

describe('pickupEtaPresets — набор под рекомендацию сервера', () => {
  it.each([
    [5, [3, 5, 7, 10, 15]],
    [40, [10, 15, 20, 30, 45]],
    [70, [20, 30, 45, 60, 90]],
    [1440, [30, 45, 60, 90, 120]],
  ])('рекомендация %i мин', (recommended, expected) => {
    expect(pickupEtaPresets(recommended)).toEqual(expected);
  });

  it('всегда пять кнопок — разметка не должна прыгать', () => {
    for (const r of [1, 5, 20, 21, 45, 46, 90, 91, 1440]) {
      expect(pickupEtaPresets(r)).toHaveLength(5);
    }
  });
});
