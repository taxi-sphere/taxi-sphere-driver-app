/**
 * @file: src/types/earnings.ts
 * @description:
 *   Типы заработка водителя.
 *   Контракт совпадает с GET /api/v1/driver/earnings на backend.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

/** Недавний завершённый заказ */
export interface RecentOrder {
  id: string;
  orderNumber: string;
  finalPrice: number | null;
  completedAt: string;
  pickupAddress: string;
  dropoffAddress: string;
  paymentMethod: string;
}

/** Заработок за один день — для столбчатого графика. */
export interface DailyEarnings {
  /** Дата в формате YYYY-MM-DD. */
  date: string;
  amount: number;
  trips: number;
}

/** Ответ GET /driver/earnings */
export interface EarningsResponse {
  period: {
    totalEarnings: number;
    tripsCount: number;
    averagePrice: number;
    dateFrom: string | null;
    dateTo: string | null;
  };
  overall: {
    totalTrips: number;
    totalEarnings: number;
    rating: number;
  };
  recentOrders: RecentOrder[];
  /**
   * Разбивка по дням за запрошенный период.
   *
   * Появилось на сервере в v1.99.59. Поле необязательное: приложение
   * новее сервера не должно падать, а старое — ломаться от лишнего поля.
   * Пока сервер не обновлён, график просто не показывается — это честнее,
   * чем то, что было до v1.5.17: график рисовался по `Math.random()`.
   */
  daily?: DailyEarnings[] | null;
}
