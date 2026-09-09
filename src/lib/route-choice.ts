/**
 * @file: src/lib/route-choice.ts
 * @description:
 *   Выбор варианта пути и его удержание при перестроении маршрута.
 *
 *   ЗАДАЧА. Роутер отдаёт 2-3 варианта; водитель выбирает. Но линия
 *   перестраивается каждые 60-110 метров (`order-route-key`), и выбор надо
 *   как-то пронести через пересчёт.
 *
 *   ЧЕМ ПЛОХИ ОЧЕВИДНЫЕ СПОСОБЫ:
 *
 *   • по индексу («водитель выбрал второй») — порядок вариантов в следующем
 *     ответе роутера уже другой, и второй значит не то;
 *   • по километражу («ищем ближайший к 39.5 км») — два пути в пределах
 *     полукилометра друг от друга неразличимы, и водителя перекинет на
 *     чужой.
 *
 *   ЧТО СДЕЛАНО. Выбор запоминается ГЕОМЕТРИЧЕСКИ: берётся точка, где
 *   выбранный путь дальше всего отходит от быстрого, и дальше маршрут
 *   строится ЧЕРЕЗ неё. Роутер сам ведёт по нужному пути, сколько бы раз
 *   ни пересчитывал: выбор держится по построению, а не угадыванием.
 *
 *   Точка снимается, когда водитель её проехал: развилка позади, и держать
 *   крюк дальше не за чем — иначе маршрут начнёт тянуть назад.
 *
 * @dependencies: нет (чистые функции)
 * @created: 2026-09-09 (1.5.49, MOB-024)
 */

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

/**
 * Радиус, внутри которого опорная точка считается пройденной.
 *
 * 150 метров: меньше — и точка не снимется, если водитель объехал её по
 * соседней полосе или развязке; больше — снимется до развилки, и выбор
 * потеряется в самый нужный момент.
 */
export const ANCHOR_REACHED_M = 150;

/**
 * Минимальное расхождение путей, при котором есть что выбирать.
 *
 * Роутер иногда отдаёт варианты, отличающиеся объездом одного двора. Ставить
 * ради этого выбор перед водителем — отвлекать его на ходу ради ничего.
 */
export const MIN_DIVERGENCE_M = 300;

const EARTH_R = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Расстояние по большому кругу, метры. */
export function distanceM(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Расстояние от точки до ОТРЕЗКА, метры.
 *
 * Считается в локальной плоской проекции: на масштабах маршрута (километры)
 * кривизна Земли даёт доли процента, а формулы на сфере для проекции точки
 * на отрезок стоят несоизмеримо дороже.
 */
function distanceToSegment(point: RoutePoint, a: RoutePoint, b: RoutePoint): number {
  // Метры на градус: по широте почти постоянны, по долготе сжимаются к полюсу.
  const mPerLat = 111_320;
  const mPerLng = 111_320 * Math.cos(toRad(point.latitude));

  const px = (point.longitude - a.longitude) * mPerLng;
  const py = (point.latitude - a.latitude) * mPerLat;
  const bx = (b.longitude - a.longitude) * mPerLng;
  const by = (b.latitude - a.latitude) * mPerLat;

  const lenSq = bx * bx + by * by;
  // Вырожденный отрезок (две одинаковые точки) — просто расстояние до неё.
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / lenSq)) : 0;

  const dx = px - t * bx;
  const dy = py - t * by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Ближайшее расстояние от точки до ломаной, метры.
 *
 * По ОТРЕЗКАМ, а не по вершинам. Разница не теоретическая: если эталонная
 * линия задана редкими точками (роутер умеет отдавать упрощённую
 * геометрию), точка ровно посередине между двумя вершинами окажется
 * «далеко» от обеих — и совпадающие пути будут признаны разными. Поймано
 * тестом: две вершины в двух километрах друг от друга давали 1250 метров
 * расхождения там, где пути идут по одной прямой.
 */
function distanceToPath(point: RoutePoint, path: RoutePoint[]): number {
  if (path.length === 1) return distanceM(point, path[0]!);

  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distanceToSegment(point, path[i]!, path[i + 1]!);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Точка, которой выбранный путь отличается от быстрого.
 *
 * Берётся та, что дальше всего от эталонной линии: именно она определяет,
 * «через что» едем, и именно её надо передать роутеру, чтобы он повторил
 * выбор. Середина маршрута для этого не годится — у двух путей с общим
 * началом и концом середина может лежать на общем участке.
 *
 * `null` — пути практически совпадают (расхождение меньше
 * `MIN_DIVERGENCE_M`): выбирать нечего, и предлагать выбор не нужно.
 */
export function pickAnchor(
  selected: RoutePoint[],
  reference: RoutePoint[],
): RoutePoint | null {
  if (selected.length === 0 || reference.length === 0) return null;

  let best: RoutePoint | null = null;
  let bestDistance = 0;

  for (const point of selected) {
    const d = distanceToPath(point, reference);
    if (d > bestDistance) {
      bestDistance = d;
      best = point;
    }
  }

  return bestDistance >= MIN_DIVERGENCE_M ? best : null;
}

/**
 * Пора ли забыть опорную точку.
 *
 * Два случая, и оба означают «развилка позади»: водитель подъехал к точке
 * вплотную либо УЖЕ БЛИЖЕ К ЦЕЛИ, чем она. Второе условие обязательно:
 * объехав точку по другой стороне развязки, водитель может не попасть в
 * радиус, и маршрут повёл бы его назад — к точке, которая ему уже не нужна.
 */
export function isAnchorPassed(
  anchor: RoutePoint | null,
  driver: RoutePoint | null,
  target: RoutePoint | null,
): boolean {
  if (!anchor || !driver) return false;
  if (distanceM(driver, anchor) <= ANCHOR_REACHED_M) return true;
  if (target && distanceM(driver, target) < distanceM(anchor, target)) return true;
  return false;
}

/** Есть ли из чего выбирать: хотя бы два ощутимо разных пути. */
export function hasRealChoice(variants: { coordinates: RoutePoint[] }[]): boolean {
  if (variants.length < 2) return false;
  const reference = variants[0]!.coordinates;
  return variants
    .slice(1)
    .some((v) => pickAnchor(v.coordinates, reference) !== null);
}
