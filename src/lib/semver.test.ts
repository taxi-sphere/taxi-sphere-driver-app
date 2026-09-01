/**
 * @file: src/lib/semver.test.ts
 * @description:
 *   1.5.18: тесты сравнения версий, включая pre-release.
 *
 *   ГЛАВНЫЙ ТЕСТ ЗДЕСЬ — «обычные версии сравниваются как раньше». От
 *   `compareSemver` зависит единственное: показать ли водителю «Доступно
 *   обновление». Поддержка беты не имела права поменять это для обычных
 *   релизов, поэтому старый алгоритм воспроизведён прямо в тесте и
 *   результаты сверяются на матрице версий, а не на паре примеров.
 *
 *   Остальное закрывает то, ради чего правка и делалась: `1.5.18-beta.1`
 *   должна читаться как «новее 1.5.17, но старее 1.5.18». До 1.5.18 она
 *   читалась как `1.5.0` — то есть обновление на бету не предлагалось
 *   никогда.
 *
 * @dependencies: vitest, @/lib/semver
 * @created: 2026-09-01 (1.5.18)
 */

import { describe, it, expect } from 'vitest';
import {
  compareSemver,
  isPrerelease,
  isValidSemver,
  parseSemver,
  parseSemverFull,
} from './semver';

/** Алгоритм ДО 1.5.18 — эталон для обычных версий. */
function legacyCompare(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string): [number, number, number] => {
    const parts = v.replace(/^v/, '').split('.').map(Number);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
  if (aMin !== bMin) return aMin > bMin ? 1 : -1;
  if (aPat !== bPat) return aPat > bPat ? 1 : -1;
  return 0;
}

const PLAIN_VERSIONS = [
  '0.0.1',
  '1.0.0',
  '1.5.0',
  '1.5.9',
  '1.5.10',
  '1.5.17',
  '1.5.18',
  '1.6.0',
  '2.0.0',
  'v1.99.59',
  '1.99.60',
  '1.99.100',
];

describe('обычные версии сравниваются ровно как до 1.5.18', () => {
  it('матрица всех пар даёт тот же результат, что старый алгоритм', () => {
    for (const a of PLAIN_VERSIONS) {
      for (const b of PLAIN_VERSIONS) {
        expect(
          compareSemver(a, b),
          `сравнение «${a}» и «${b}» разошлось со старым поведением`,
        ).toBe(legacyCompare(a, b));
      }
    }
  });

  it('десятки сравниваются числами, а не строками', () => {
    // Строковое сравнение дало бы «1.5.9» > «1.5.10».
    expect(compareSemver('1.5.10', '1.5.9')).toBe(1);
    expect(compareSemver('1.99.100', '1.99.60')).toBe(1);
  });

  it('префикс v не влияет', () => {
    expect(compareSemver('v1.5.18', '1.5.18')).toBe(0);
  });
});

describe('pre-release — то, ради чего правка', () => {
  it('бета новее предыдущего релиза', () => {
    // Именно это было сломано: раньше «1.5.18-beta.1» читалась как 1.5.0.
    expect(compareSemver('1.5.18-beta.1', '1.5.17')).toBe(1);
  });

  it('бета старее одноимённого релиза', () => {
    expect(compareSemver('1.5.18-beta.1', '1.5.18')).toBe(-1);
    expect(compareSemver('1.5.18', '1.5.18-beta.1')).toBe(1);
  });

  it('номера бет сравниваются числами', () => {
    // Строковое сравнение поставило бы beta.10 ниже beta.9.
    expect(compareSemver('1.5.18-beta.10', '1.5.18-beta.9')).toBe(1);
  });

  it('alpha < beta < rc', () => {
    expect(compareSemver('1.5.18-alpha.1', '1.5.18-beta.1')).toBe(-1);
    expect(compareSemver('1.5.18-beta.1', '1.5.18-rc.1')).toBe(-1);
  });

  it('числовой идентификатор младше буквенного', () => {
    expect(compareSemver('1.5.18-1', '1.5.18-beta')).toBe(-1);
  });

  it('при равном префиксе длиннее — старше', () => {
    expect(compareSemver('1.5.18-beta', '1.5.18-beta.1')).toBe(-1);
  });

  it('одинаковые pre-release равны', () => {
    expect(compareSemver('1.5.18-beta.1', '1.5.18-beta.1')).toBe(0);
  });

  it('build-метаданные на порядок не влияют', () => {
    expect(compareSemver('1.5.18+build.7', '1.5.18')).toBe(0);
    expect(compareSemver('1.5.18-beta.1+build.7', '1.5.18-beta.1')).toBe(0);
  });
});

describe('parseSemver', () => {
  it('патч из версии с суффиксом больше не теряется', () => {
    // Старый разбор давал [1, 5, 0] — Number('18-beta') === NaN.
    expect(parseSemver('1.5.18-beta.1')).toEqual([1, 5, 18]);
  });

  it('битая строка не роняет разбор', () => {
    expect(parseSemver('не версия')).toEqual([0, 0, 0]);
    expect(parseSemver('')).toEqual([0, 0, 0]);
  });

  it('parseSemverFull раскладывает идентификаторы', () => {
    expect(parseSemverFull('1.5.18-beta.1')).toEqual({
      major: 1,
      minor: 5,
      patch: 18,
      prerelease: ['beta', 1],
    });
    expect(parseSemverFull('1.5.18').prerelease).toEqual([]);
  });
});

describe('isValidSemver', () => {
  it('пропускает обычные версии', () => {
    expect(isValidSemver('1.5.18')).toBe(true);
    expect(isValidSemver('v1.5.18')).toBe(true);
  });

  it('пропускает pre-release — раньше именно здесь регистрация беты падала с 400', () => {
    expect(isValidSemver('1.5.18-beta.1')).toBe(true);
    expect(isValidSemver('v1.5.18-beta.1')).toBe(true);
    expect(isValidSemver('1.5.18-rc.2')).toBe(true);
  });

  it('отвергает мусор', () => {
    expect(isValidSemver('1.5')).toBe(false);
    expect(isValidSemver('1.5.18.4')).toBe(false);
    expect(isValidSemver('версия')).toBe(false);
    expect(isValidSemver('1.5.18-')).toBe(false);
  });
});

describe('вспомогательные', () => {
  it('isPrerelease отличает бету от релиза', () => {
    expect(isPrerelease('1.5.18-beta.1')).toBe(true);
    expect(isPrerelease('1.5.18')).toBe(false);
  });

});
