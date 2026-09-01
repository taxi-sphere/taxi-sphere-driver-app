/**
 * @file: src/lib/semver.ts
 * @description:
 *   Разбор и сравнение версий по правилам semver 2.0, включая
 *   pre-release-суффиксы (`1.5.18-beta.1`).
 *
 *   Симметрично `src/lib/semver.ts` на бэкенде (razrab Taxi Sphere).
 *   Дублируем, чтобы не тащить пакет ради тридцати строк — версии обоих
 *   концов должны оставаться синхронными, правки вносить в обе.
 *
 *   ПОЧЕМУ ПОЯВИЛСЯ PRE-RELEASE (1.5.18). Здесь решается единственный
 *   вопрос: показывать ли водителю «Доступно обновление». Старый разбор
 *   резал строку по точкам, и `Number('18-beta')` давал NaN → 0: версия
 *   `1.5.18-beta.1` читалась как `1.5.0`, то есть всегда СТАРЕЕ
 *   установленной. Бета-канал был собран целиком — переключатель в
 *   настройках, канал в запросе, prerelease в GitHub — и не работал
 *   только из-за этой строки.
 *
 *   ВАЖНО: приложение сравнивает версию из ответа сервера со СВОЕЙ
 *   (`Constants.expoConfig.version`). Поэтому у бета-сборки версия в
 *   `app.json` тоже обязана нести суффикс (`1.5.18-beta.1`), иначе
 *   установленная `1.5.18` окажется старше предлагаемой беты и
 *   обновление снова не покажут. Сборка это проверяет — см. шаг
 *   «Тег и версия в app.json должны совпадать» в build-driver-apk.yml.
 *
 * @dependencies: нет (чистые функции)
 * @created: 2026-08-24
 * @updated: 2026-09-01 (1.5.18 — поддержка pre-release)
 */

/**
 * `1.5.18-beta.1+build.7` → major.minor.patch, pre-release, build.
 * Build-метаданные на порядок версий не влияют (semver 2.0 §10), но в
 * строке встречаться могут — разбираем, чтобы не считать её невалидной.
 */
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

/** Идентификатор pre-release: число сравнивается как число, слово — как слово. */
type PrereleaseIdent = string | number;

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  /**
   * Идентификаторы pre-release: `beta.1` → `['beta', 1]`.
   * Пустой массив означает обычный релиз — он СТАРШЕ любого своего
   * pre-release (`1.5.18` > `1.5.18-beta.1`).
   */
  prerelease: PrereleaseIdent[];
}

/**
 * Полный разбор версии.
 *
 * Строку, не подходящую под semver, разбираем снисходительно (числа по
 * точкам, остальное — нули): сравнение версий вызывается без
 * предварительной валидации, и падать здесь нельзя — иначе экран
 * обновления не отрисуется вовсе.
 */
export function parseSemverFull(v: string): ParsedSemver {
  const match = SEMVER_RE.exec(v.trim());

  if (!match) {
    const parts = v.trim().replace(/^v/, '').split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
      prerelease: [],
    };
  }

  const prerelease = (match[4] ?? '')
    .split('.')
    .filter(Boolean)
    .map((ident) => (/^\d+$/.test(ident) ? Number(ident) : ident));

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

/**
 * Разобрать строку версии на кортеж [major, minor, patch].
 * Убирает опциональный префикс "v". Некорректные сегменты дают 0.
 */
export function parseSemver(v: string): [number, number, number] {
  const { major, minor, patch } = parseSemverFull(v);
  return [major, minor, patch];
}

/**
 * Сравнить наборы pre-release-идентификаторов (semver 2.0 §11).
 *
 * Правила, которые здесь важны на практике:
 *   • релиз старше своего pre-release: `1.5.18` > `1.5.18-beta.1`;
 *   • числовые идентификаторы сравниваются как числа, поэтому
 *     `beta.10` > `beta.9` (строковое сравнение дало бы обратное);
 *   • числовой идентификатор младше буквенного: `1.5.18-1` < `1.5.18-beta`;
 *   • при равных префиксах длиннее — старше: `beta` < `beta.1`.
 */
function comparePrerelease(a: PrereleaseIdent[], b: PrereleaseIdent[]): -1 | 0 | 1 {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;

    const xIsNumber = typeof x === 'number';
    const yIsNumber = typeof y === 'number';
    if (xIsNumber && yIsNumber) {
      if (x !== y) return x > y ? 1 : -1;
      continue;
    }
    if (xIsNumber !== yIsNumber) return xIsNumber ? -1 : 1;
    if (x !== y) return (x as string) > (y as string) ? 1 : -1;
  }

  return 0;
}

/**
 * Сравнить две semver-строки: возвращает 1, -1 или 0.
 * Порядок значимости: major → minor → patch → pre-release.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const left = parseSemverFull(a);
  const right = parseSemverFull(b);

  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;

  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * true, если строка похожа на semver: `N.N.N` c опциональным префиксом `v`
 * и опциональным pre-release/build-суффиксом.
 */
export function isValidSemver(v: string): boolean {
  return SEMVER_RE.test(v.trim());
}

/** true, если версия — предварительная (`1.5.18-beta.1`). */
export function isPrerelease(v: string): boolean {
  return parseSemverFull(v).prerelease.length > 0;
}
