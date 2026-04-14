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
}
