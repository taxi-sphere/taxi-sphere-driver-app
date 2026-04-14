/**
 * @file: src/types/balance.ts
 * @description:
 *   Типы операций с балансом водителя. Соответствуют ответу
 *   GET /api/v1/driver/balance-transactions и событию
 *   Socket.IO driver:balance:changed.
 * @created: 2026-04-14 00:00:00
 * @updated: 2026-04-14 00:00:00
 */

export type BalanceTransactionType =
  | 'manual_deposit'
  | 'manual_withdrawal'
  | 'order_deduction'
  | 'shift_fee'
  | 'bonus'
  | 'penalty'
  | 'refund';

export interface BalanceTransaction {
  id: string;
  type: BalanceTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  orderId: string | null;
  orderNumber: number | null;
  createdAt: string;
}

export interface BalanceTransactionsResponse {
  currentBalance: number;
  items: BalanceTransaction[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** Событие socket.io — изменение баланса в реальном времени */
export interface BalanceChangedEvent {
  transactionId: string;
  type: BalanceTransactionType;
  amount: number;
  balanceAfter: number;
  description: string | null;
  orderId: string | null;
  orderNumber: number | null;
  createdAt: string;
}
