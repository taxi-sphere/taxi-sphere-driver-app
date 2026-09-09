/**
 * @file: src/types/history.ts
 * @description:
 *   Запись истории заказов — то, что водитель уже отвозил.
 *   Форма приходит с `GET /api/v1/driver/orders/history`.
 * @dependencies: нет
 * @created: 2026-09-09 (1.5.52)
 */

/** Чем кончился заказ. Третьего состояния в истории не бывает. */
export type HistoryOrderStatus = 'completed' | 'canceled';

export interface HistoryOrder {
  id: string;
  orderNumber: number;
  status: HistoryOrderStatus;
  /** Время завершения или отмены, ISO. */
  finishedAt: string;
  pickupAddress: string;
  dropoffAddress: string | null;
  stopsCount: number;
  /** Сколько стоила поездка. `null` — заказ отменён, платить было не за что. */
  price: number | null;
  paymentMethod: 'cash' | 'card' | 'bonus' | null;
  distanceM: number | null;
  durationSec: number | null;
  waitingSec: number | null;
  /**
   * Сколько служба списала за заказ.
   * `null` — списания не было; ноль — оно было нулевым.
   */
  deduction: number | null;
  cancelReason: string | null;
  serviceName: string | null;
  tariffName: string | null;
}

export interface HistoryPage {
  items: HistoryOrder[];
  /** Время окончания последней записи. `null` — дальше ничего нет. */
  nextCursor: string | null;
}

/** Что показывать в ленте. */
export type HistoryFilter = 'all' | 'completed' | 'canceled';
