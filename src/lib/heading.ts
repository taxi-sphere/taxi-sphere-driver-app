/**
 * @file: src/lib/heading.ts
 * @description:
 *   Куда смотрит стрелка водителя на карте.
 *
 *   ПОЧЕМУ НЕ `coords.heading` ИЗ ТЕЛЕФОНА. Курс от GPS-приёмника выглядит
 *   готовым ответом и им не является: на серверной записи трека из 356 точек
 *   он принимал ВСЕГО ДВА различных значения — на малых скоростях приёмник
 *   его просто не считает, а на стоянке отдаёт последний известный. Стрелка
 *   с таким источником смотрит мимо дороги, и это ровно тот дефект, который
 *   разбирали в админке (v1.99.84).
 *
 *   ОТКУДА БЕРЁМ. Из ГЕОМЕТРИИ: направление отрезка, по которому водитель
 *   едет. Лучший источник — линия маршрута с сервера: она построена по
 *   дорогам, начинается в точке водителя, и её первый отрезок и есть «куда
 *   ехать». Если маршрута нет — считаем по двум последним координатам
 *   самого водителя.
 *
 *   ПОРОГ РАССТОЯНИЯ ОБЯЗАТЕЛЕН. Две точки в полуметре друг от друга дают
 *   случайный угол: это шум приёмника, а не поворот машины. Поэтому берём
 *   не «следующую точку», а первую, отстоящую хотя бы на `MIN_SPAN_M`.
 *
 * @dependencies: нет (чистые функции)
 * @created: 2026-09-07 (1.5.38)
 */

/** Точка, от которой можно считать направление. */
export interface HeadingPoint {
  latitude: number;
  longitude: number;
}

/**
 * Минимальная база для расчёта угла, в метрах.
 *
 * 5 м — примерно длина машины и заметно больше типичной погрешности
 * городского GPS-фикса в движении. Меньше — стрелка начнёт дрожать на месте.
 */
export const MIN_SPAN_M = 5;

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Расстояние между точками по большому кругу, в метрах. */
export function distanceMeters(from: HeadingPoint, to: HeadingPoint): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Азимут от точки к точке: 0° — на север, 90° — на восток.
 *
 * Результат всегда в [0, 360): именно в такой шкале его ждёт `rotation`
 * маркера, и отрицательный угол там читался бы как поворот в другую сторону.
 */
export function bearingDegrees(from: HeadingPoint, to: HeadingPoint): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLng = toRadians(to.longitude - from.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Направление в начале ломаной — куда ехать из первой точки.
 *
 * Идём вперёд до первой точки, отстоящей не меньше чем на `minSpanMeters`:
 * ломаная маршрута сгущается на поворотах, и соседняя точка там бывает в
 * метре, а угол по ней — это угол шума, а не дороги.
 *
 * `null` — направление неизвестно (точек мало или все они в одном месте).
 * Именно `null`, а не 0: ноль означал бы «на север», и стрелка уверенно
 * смотрела бы не туда вместо того, чтобы сохранить прежний угол.
 */
export function headingAlong(
  points: readonly HeadingPoint[],
  minSpanMeters: number = MIN_SPAN_M,
): number | null {
  const anchor = points[0];
  if (!anchor) return null;

  for (let i = 1; i < points.length; i++) {
    const next = points[i]!;
    if (distanceMeters(anchor, next) >= minSpanMeters) {
      return bearingDegrees(anchor, next);
    }
  }
  return null;
}
