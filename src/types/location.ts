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
  /**
   * Скорость, м/с. Android отдаёт -1, когда её нельзя определить, — такое
   * значение сюда не попадает (см. toLocationPoint), потому что сервер
   * трактует отрицательную скорость как «неизвестно» и всё равно её теряет.
   */
  speed?: number;
  heading?: number;
  /**
   * Радиус погрешности фикса, метры (v1.5.21).
   *
   * ЗАЧЕМ. Когда небо закрыто (двор-колодец, парковка ТЦ), Android
   * подставляет положение по вышкам с точностью в сотни метров. На карте
   * диспетчера машина уезжает в соседний квартал и через пять секунд
   * возвращается. Сервер по этому полю такие фиксы не показывает — но
   * пишет в историю, чтобы было видно, что данных не было.
   */
  accuracy?: number;
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
