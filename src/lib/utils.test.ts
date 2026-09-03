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
  apiErrorForStatus,
  humanApiError,
  shortenStreetType,
  stripSharedCityPrefix,
  usableChangelog,
  pickupEtaStep,
  formatScheduledAt,
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

/**
 * Время подачи предзаказа.
 *
 * `now` передаётся явно: тест, зависящий от системных часов, ломается сам
 * по себе один раз в сутки — в полночь.
 */
describe('formatScheduledAt', () => {
  const now = new Date('2026-09-01T12:00:00');

  it('сегодняшний заказ называется «Сегодня»', () => {
    expect(formatScheduledAt('2026-09-01T18:30:00', now)).toMatch(/^Сегодня 18:30$/);
  });

  it('завтрашний — «Завтра», даже если до него меньше часа', () => {
    // 00:30 второго сентября — это завтра, хотя ждать сорок минут.
    const lateNight = new Date('2026-09-01T23:50:00');
    expect(formatScheduledAt('2026-09-02T00:30:00', lateNight)).toMatch(/^Завтра 00:30$/);
  });

  it('дальше двух суток — дата с месяцем', () => {
    const result = formatScheduledAt('2026-09-12T09:00:00', now);
    expect(result).toContain('09:00');
    expect(result).toContain('12');
    expect(result).not.toContain('Сегодня');
    expect(result).not.toContain('Завтра');
  });

  it('прошедшее время не выдаётся за сегодняшнее только из-за разницы в часах', () => {
    // 20 часов назад — это ВЧЕРА, хотя разница меньше суток.
    const result = formatScheduledAt('2026-08-31T16:00:00', now);
    expect(result).not.toContain('Сегодня');
  });

  it('пустое и битое значение не роняют экран', () => {
    expect(formatScheduledAt(null, now)).toBe('—');
    expect(formatScheduledAt(undefined, now)).toBe('—');
    expect(formatScheduledAt('не дата', now)).toBe('—');
  });
});

describe('shortenStreetType — длинный адрес в две строки заголовка', () => {
  it.each([
    ['проспект Красноярский рабочий, 150', 'пр-т Красноярский рабочий, 150'],
    ['улица Ленина, д. 1', 'ул. Ленина, д. 1'],
    ['Набережная, д. 76', 'наб., д. 76'],
    ['переулок Тихий, 3', 'пер. Тихий, 3'],
    ['микрорайон Северный, 12', 'мкр. Северный, 12'],
  ])('%s → %s', (input, expected) => {
    expect(shortenStreetType(input)).toBe(expected);
  });

  it('знаки препинания после типа улицы сохраняются', () => {
    expect(shortenStreetType('улица, Ленина')).toBe('ул., Ленина');
  });

  it('обычные слова не трогаем', () => {
    expect(shortenStreetType('Бортникова, д. 48')).toBe('Бортникова, д. 48');
  });
});

describe('usableChangelog — что показать в окне обновления', () => {
  it('автотекст GitHub не показываем', () => {
    expect(
      usableChangelog('**Full Changelog**: https://github.com/x/y/compare/a...b'),
    ).toBeNull();
  });

  it('голая ссылка — тоже нет', () => {
    expect(usableChangelog('https://github.com/x/y/releases/tag/v1')).toBeNull();
  });

  it('человеческий текст показываем', () => {
    expect(usableChangelog('Починили шторку заказа.')).toBe('Починили шторку заказа.');
  });

  it('пусто — нечего показывать', () => {
    expect(usableChangelog('')).toBeNull();
    expect(usableChangelog(null)).toBeNull();
  });
});

describe('humanApiError — что видит водитель', () => {
  it('ссылку и код ответа заменяем человеческим текстом', () => {
    expect(
      humanApiError(
        'Request failed with status code 404: POST https://x/api/v1/driver/orders/1/release',
        'Сервер не ответил',
      ),
    ).toBe('Сервер не ответил');
  });

  it('сообщение сервера показываем как есть', () => {
    expect(
      humanApiError('Клиент уже в машине — отказаться нельзя.', 'Сервер не ответил'),
    ).toBe('Клиент уже в машине — отказаться нельзя.');
  });

  it('сетевую ошибку тоже прячем', () => {
    expect(humanApiError('Network Error', 'Нет связи')).toBe('Нет связи');
  });
});

describe('apiErrorForStatus — причина вместо адреса', () => {
  it('404 объясняет, что сервер старее приложения', () => {
    // Раньше здесь водитель видел «Request failed with status code 404:
    // POST https://…/release» — адрес и код вместо причины.
    expect(apiErrorForStatus(404)).toContain('обновление сервера');
  });

  it.each([
    [401, 'заново'],
    [403, 'заново'],
    [504, 'связь'],
    [429, 'Подождите'],
    [500, 'ещё раз'],
    [503, 'ещё раз'],
  ])('%i → человеческая причина', (status, fragment) => {
    expect(apiErrorForStatus(status)).toContain(fragment);
  });

  it('ни в одном тексте нет ни кода, ни ссылки', () => {
    for (const status of [400, 401, 403, 404, 408, 429, 500, 503, 504]) {
      const text = apiErrorForStatus(status);
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/\d{3}/);
    }
  });
});
