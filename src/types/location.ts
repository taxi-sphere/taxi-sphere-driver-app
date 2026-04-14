/**
 * @file: src/types/location.ts
 * @description:
 *   Типы GPS-геолокации: точки, батчи.
 *   Контракт совпадает с POST /api/v1/driver/location на backend.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

/** Одна GPS-точка */
export interface LocationPoint {
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  recordedAt?: string;
}

/** Запрос отправки батча точек */
export interface LocationBatch {
  points: LocationPoint[];
}

/** Ответ POST /driver/location */
export interface LocationResponse {
  success: true;
  pointsReceived: number;
}
