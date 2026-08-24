/**
 * @file: src/lib/semver.ts
 * @description:
 *   Минимальный semver-парсер для сравнения major.minor.patch.
 *   Симметрично src/lib/semver.ts на бэкенде (razrab Taxi Sphere).
 *   Дублируем чтобы не тащить пакет ради 10 строк — версии обоих
 *   концов должны оставаться синхронными.
 * @created: 2026-08-24
 */

export function parseSemver(v: string): [number, number, number] {
  const parts = v.replace(/^v/, '').split('.').map((n) => Number(n));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const [aMaj, aMin, aPat] = parseSemver(a);
  const [bMaj, bMin, bPat] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
  if (aMin !== bMin) return aMin > bMin ? 1 : -1;
  if (aPat !== bPat) return aPat > bPat ? 1 : -1;
  return 0;
}

export function isValidSemver(v: string): boolean {
  return /^v?\d+\.\d+\.\d+$/.test(v);
}
