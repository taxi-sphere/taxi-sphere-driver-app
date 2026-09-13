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
 *   ЧТО ЗДЕСЬ НЕ РЕШАЕТСЯ (1.5.62). `snapToRoute` выбирает ближайший кусок
 *   во ВСЁМ маршруте и ничего не помнит — на маршруте, который проходит
 *   рядом сам с собой (объезд квартала, разворот), стрелка от этого
 *   перескакивала на другой кусок. Выбор с памятью живёт в
 *   `@/lib/arrow-tracker`; отсюда он берёт геометрию: всех кандидатов рядом
 *   с точкой (`routeCandidates`), расстояние по маршруту (`routeDistances`) и
 *   точку на заданном расстоянии (`pointAlong`).
 *
 *   Геометрия здесь плоская: на длине одного отрезка маршрута (десятки
 *   метров) кривизна Земли не видна, а расстояния всё равно считает
 *   `distanceMeters` по формуле гаверсинуса.
 *
 * @dependencies: @/lib/heading
 * @created: 2026-09-07 (1.5.39)
 * @updated: 2026-09-13 (1.5.62 — кандидаты, расстояние по маршруту, точка на маршруте)
 */

import { bearingDegrees, distanceMeters, type HeadingPoint } from '@/lib/heading';

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

/** Кусок маршрута рядом с точкой — кандидат на то, где машина. */
export interface RouteCandidate {
  /** Индекс начала отрезка. */
  index: number;
  /** Проекция точки на этот отрезок. */
  point: HeadingPoint;
  /** Расстояние от точки до отрезка, метры. */
  distanceM: number;
  /** Сколько метров по маршруту от его начала до проекции. */
  alongM: number;
  /** Куда ведёт маршрут от проекции; `null` — впереди нет ни одной отличной точки. */
  bearing: number | null;
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
export function bearingAhead(
  route: readonly HeadingPoint[],
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
 * Расстояние по маршруту от его начала до каждой вершины, метры.
 *
 * Запоминается на сам массив: линия приходит с сервера раз в 60–110 метров
 * пути, а спрашивают её на каждом фиксе. Ключ — ссылка, а не содержимое:
 * react-query отдаёт один и тот же массив, пока маршрут не перестроен, и
 * `WeakMap` сам забывает старые линии.
 */
const distancesCache = new WeakMap<readonly HeadingPoint[], number[]>();

export function routeDistances(route: readonly HeadingPoint[]): number[] {
  const cached = distancesCache.get(route);
  if (cached) return cached;

  const distances: number[] = [];
  let total = 0;
  for (let i = 0; i < route.length; i += 1) {
    if (i > 0) total += distanceMeters(route[i - 1], route[i]);
    distances.push(total);
  }

  distancesCache.set(route, distances);
  return distances;
}

/**
 * Все куски маршрута не дальше `maxDistanceM` от точки — по одному на отрезок,
 * в порядке маршрута.
 *
 * Выбор между ними — не здесь: ближайший не всегда правильный (обратная нога
 * разворота бывает ближе прямой), и решает это тот, кто помнит, где машина
 * была секунду назад (`@/lib/arrow-tracker`).
 */
export function routeCandidates(
  point: HeadingPoint,
  route: readonly HeadingPoint[],
  maxDistanceM: number = MAX_SNAP_M,
): RouteCandidate[] {
  if (route.length < 2) return [];

  const distances = routeDistances(route);
  const candidates: RouteCandidate[] = [];

  for (let i = 0; i < route.length - 1; i += 1) {
    const projection = projectOnSegment(point, route[i], route[i + 1]);
    if (projection.distanceM > maxDistanceM) continue;

    candidates.push({
      index: i,
      point: projection.point,
      distanceM: projection.distanceM,
      alongM: distances[i] + distanceMeters(route[i], projection.point),
      bearing: bearingAhead(route, i, projection.point),
    });
  }

  return candidates;
}

/**
 * Точка на маршруте в `alongM` метрах от его начала.
 *
 * Расстояние зажимается в длину маршрута: стрелка, которая едет по маршруту
 * сама (фикс отсеян), не должна уехать за его конец. `null` — линии нет.
 */
export function pointAlong(
  route: readonly HeadingPoint[],
  alongM: number,
): { point: HeadingPoint; index: number } | null {
  if (route.length < 2) return null;

  const distances = routeDistances(route);
  const target = Math.max(0, Math.min(distances[distances.length - 1], alongM));

  for (let i = 0; i < route.length - 1; i += 1) {
    if (target > distances[i + 1] && i < route.length - 2) continue;

    const length = distances[i + 1] - distances[i];
    const t = length > 0 ? (target - distances[i]) / length : 0;
    return {
      index: i,
      point: {
        latitude: route[i].latitude + (route[i + 1].latitude - route[i].latitude) * t,
        longitude: route[i].longitude + (route[i + 1].longitude - route[i].longitude) * t,
      },
    };
  }

  return null;
}

/**
 * Притянуть позицию водителя к ближайшему куску маршрута.
 *
 * `null`, если маршрута нет или водитель от него дальше `maxDistanceM` —
 * вызывающий рисует сырую точку и честно показывает, что машина в стороне.
 * Карта с 1.5.62 берёт место машины из `@/lib/arrow-tracker`, где выбор
 * между кусками учитывает прошлое положение.
 */
export function snapToRoute(
  point: HeadingPoint,
  route: HeadingPoint[],
  maxDistanceM: number = MAX_SNAP_M,
): RouteSnap | null {
  let best: RouteCandidate | null = null;

  for (const candidate of routeCandidates(point, route, maxDistanceM)) {
    if (!best || candidate.distanceM < best.distanceM) best = candidate;
  }

  if (!best || best.bearing == null) return null;

  return { point: best.point, index: best.index, bearing: best.bearing, distanceM: best.distanceM };
}

/**
 * Часть маршрута ВПЕРЁД от машины.
 *
 * Навигатор не рисует то, что уже проехали: линия должна начинаться ровно
 * под машиной, иначе она выглядит чужой — висит рядом и никуда от водителя
 * не ведёт. Пройденный хвост отрезается, а первой точкой становится сама
 * проекция.
 */
export function routeAhead(
  route: HeadingPoint[],
  snap: Pick<RouteSnap, 'point' | 'index'> | null,
): HeadingPoint[] {
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
