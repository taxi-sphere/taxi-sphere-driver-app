/**
 * @file: src/lib/route-snap.ts
 * @description:
 *   Притягивание машины к линии маршрута — то, из-за чего в навигаторе
 *   стрелка едет строго по дороге, а не рядом с ней.
 *
 *   ЗАЧЕМ. GPS в городе кладёт точку во двор, на соседний дом, на встречную
 *   полосу — обычная ошибка 20–40 метров. На карте это выглядит так, будто
 *   машина едет по газону, а линия маршрута идёт сама по себе в стороне и
 *   ни к чему не привязана. Любой навигатор проецирует позицию на маршрут и
 *   рисует машину там.
 *
 *   ОТСЮДА ЖЕ БЕРЁТСЯ КУРС. Направление отрезка дороги куда устойчивее угла
 *   между двумя фиксами приёмника: стоящая в пробке машина не начинает
 *   крутиться от шума, а на медленном ходу угол вообще не считается (тот же
 *   урок, что в `@/lib/heading` и в админке v1.99.84).
 *
 *   ПОЧЕМУ ЕСТЬ ПРЕДЕЛ. Притягивать безоговорочно нельзя: свернувший не туда
 *   водитель видел бы себя на дороге, с которой уже уехал, — и тем увереннее,
 *   чем дальше он от неё. Дальше `MAX_SNAP_M` точка считается «не на
 *   маршруте» и рисуется как есть; маршрут всё равно перестроится, он
 *   запрашивается от позиции водителя.
 *
 *   Геометрия здесь плоская: на длине одного отрезка маршрута (десятки
 *   метров) кривизна Земли не видна, а расстояния всё равно считает
 *   `distanceMeters` по формуле гаверсинуса.
 *
 * @dependencies: @/lib/heading
 * @created: 2026-09-07 (1.5.39)
 * @updated: 2026-09-09 (1.5.51 — линия маршрута не исчезает на последнем узле)
 */

import { bearingDegrees, type HeadingPoint } from '@/lib/heading';

/** Радиус Земли, метры — тот же, что в `@/lib/heading`. */
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Дальше этого расстояния до линии считаем, что водитель не на маршруте.
 *
 * 50 метров — с запасом больше обычной городской ошибки GPS (20–40 м) и
 * заметно меньше расстояния до соседней параллельной улицы. Маршрут
 * строится ОТ позиции водителя, то есть его первая точка — это уже
 * притянутая к дороге позиция самим маршрутизатором; сюда попадает лишь
 * накопленное расхождение с момента последнего перестроения.
 */
export const MAX_SNAP_M = 50;

/** Отрезок короче этого считается вырожденным: направления у него нет. */
const MIN_SEGMENT_M = 1;

export interface RouteSnap {
  /** Точка НА линии маршрута — туда и рисуется машина. */
  point: HeadingPoint;
  /** Индекс начала отрезка, на который спроецировались. */
  index: number;
  /** Куда ведёт этот отрезок, градусы от севера по часовой. */
  bearing: number;
  /** Насколько сырая точка отстояла от линии, метры. */
  distanceM: number;
}

/** Метры на градус долготы и широты возле заданной точки. */
function metersPerDegree(latitude: number): { lat: number; lng: number } {
  const rad = (latitude * Math.PI) / 180;
  const lat = (Math.PI / 180) * EARTH_RADIUS_M;
  return { lat, lng: lat * Math.cos(rad) };
}

interface Projection {
  point: HeadingPoint;
  distanceM: number;
}

/**
 * Проекция точки на отрезок — с зажимом в его границы.
 *
 * Зажим обязателен: без него точка, до которой отрезок «не дотягивается»,
 * спроецировалась бы на его продолжение, то есть машина уехала бы вперёд по
 * несуществующей дороге.
 */
export function projectOnSegment(
  point: HeadingPoint,
  from: HeadingPoint,
  to: HeadingPoint,
): Projection {
  const m = metersPerDegree(from.latitude);

  const px = (point.longitude - from.longitude) * m.lng;
  const py = (point.latitude - from.latitude) * m.lat;
  const sx = (to.longitude - from.longitude) * m.lng;
  const sy = (to.latitude - from.latitude) * m.lat;

  const lengthSq = sx * sx + sy * sy;
  if (lengthSq === 0) {
    return { point: from, distanceM: Math.hypot(px, py) };
  }

  const t = Math.max(0, Math.min(1, (px * sx + py * sy) / lengthSq));

  return {
    point: {
      latitude: from.latitude + (to.latitude - from.latitude) * t,
      longitude: from.longitude + (to.longitude - from.longitude) * t,
    },
    distanceM: Math.hypot(px - sx * t, py - sy * t),
  };
}

/**
 * Куда ехать дальше — от самой проекции, а не от начала отрезка.
 *
 * Ищем вперёд первую точку, отстоящую хотя бы на метр. Это решает сразу две
 * задачи. Первая: маршрутизатор отдаёт геометрию с повторами и
 * микроотрезками на перекрёстках, и угол между двумя почти совпавшими
 * точками — не направление, а деление на ноль в приличной одежде. Вторая:
 * машина, доехавшая ровно до вершины, получает направление СЛЕДУЮЩЕГО
 * отрезка — ближняя точка оказывается в нуле и пропускается. Считай мы угол
 * от начала отрезка, стрелка на повороте показывала бы туда, откуда
 * приехали, пока проекция не переползёт на новый отрезок.
 */
function bearingFrom(
  route: HeadingPoint[],
  index: number,
  origin: HeadingPoint,
): number | null {
  const m = metersPerDegree(origin.latitude);

  for (let i = index + 1; i < route.length; i += 1) {
    const dx = (route[i].longitude - origin.longitude) * m.lng;
    const dy = (route[i].latitude - origin.latitude) * m.lat;
    if (Math.hypot(dx, dy) >= MIN_SEGMENT_M) {
      return bearingDegrees(origin, route[i]);
    }
  }

  return null;
}

/**
 * Притянуть позицию водителя к маршруту.
 *
 * `null`, если маршрута нет или водитель от него дальше `maxDistanceM` —
 * вызывающий рисует сырую точку и честно показывает, что машина в стороне.
 */
export function snapToRoute(
  point: HeadingPoint,
  route: HeadingPoint[],
  maxDistanceM: number = MAX_SNAP_M,
): RouteSnap | null {
  if (route.length < 2) return null;

  let bestIndex = -1;
  let best: Projection | null = null;

  for (let i = 0; i < route.length - 1; i += 1) {
    const projection = projectOnSegment(point, route[i], route[i + 1]);
    if (!best || projection.distanceM < best.distanceM) {
      best = projection;
      bestIndex = i;
    }
  }

  if (!best || best.distanceM > maxDistanceM) return null;

  const bearing = bearingFrom(route, bestIndex, best.point);
  if (bearing == null) return null;

  return { point: best.point, index: bestIndex, bearing, distanceM: best.distanceM };
}

/**
 * Часть маршрута ВПЕРЁД от машины.
 *
 * Навигатор не рисует то, что уже проехали: линия должна начинаться ровно
 * под машиной, иначе она выглядит чужой — висит рядом и никуда от водителя
 * не ведёт. Пройденный хвост отрезается, а первой точкой становится сама
 * проекция.
 */
export function routeAhead(route: HeadingPoint[], snap: RouteSnap | null): HeadingPoint[] {
  if (!snap || route.length < 2) return route;

  const ahead = [snap.point, ...route.slice(snap.index + 1)];

  /**
   * ЛИНИЯ НЕ ИСЧЕЗАЕТ, ПОКА МАРШРУТ ЕСТЬ.
   *
   * Когда проекция попала на последний узел, впереди не остаётся ни одной
   * точки, и хвост вырождается в одну — карта такую не рисует (`Polyline`
   * нужно минимум две), маршрут пропадает с экрана целиком. Снаружи это
   * читается как «маршрут сбросился», хотя он есть и построен: ровно так
   * это и выглядело у владельца 09.09.2026.
   *
   * Показать целую линию, включая пройденный кусок, — меньшее зло, чем не
   * показать никакой: водитель видит, куда ехать, а лишний хвост позади
   * исчезнет на следующем же обновлении маршрута.
   */
  return ahead.length >= 2 ? ahead : route;
}
