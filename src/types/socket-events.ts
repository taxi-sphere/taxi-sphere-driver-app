/**
 * @file: src/types/socket-events.ts
 * @description:
 *   Типы Socket.IO событий для namespace /driver.
 *   Совпадают с socket-emitter.ts и socket-server.js на backend.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import type { OrderStatus } from './order';

/** Событие order:new — новый заказ в радиусе */
export interface OrderNewEvent {
  orderId: string;
  orderNumber?: number;
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffAddress?: string;
  estimatedPrice?: number;
  estimatedKm?: number;
  tariffName?: string;
  serviceName?: string;
  distanceToPickup?: number;
  paymentMethod?: string;
  comment?: string;
}

/** Событие order:status — изменение статуса заказа */
export interface OrderStatusEvent {
  orderId: string;
  status: OrderStatus;
  driverInfo?: {
    driverUserId?: string;
    firstName?: string;
    lastName?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    vehiclePlate?: string;
    phone?: string;
  };
}

/** Событие order:canceled — заказ отменён */
export interface OrderCanceledEvent {
  orderId: string;
  reason?: string;
}
