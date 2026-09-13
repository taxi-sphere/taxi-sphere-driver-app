/**
 * @file: src/types/socket-events.ts
 * @description:
 *   Типы Socket.IO событий для namespace /driver.
 *   Совпадают с socket-emitter.ts и socket-server.js на backend.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-13 (1.5.59 — order:offer)
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

/**
 * Событие order:offer — заказ предложен ЭТОМУ водителю (сервер v1.100.13).
 *
 * Отдельно от `order:new`: тот значит «в списке свободных появился заказ»,
 * а это — «решите за `ttlSec` секунд, берёте ли вы его». Совпадает с
 * `DriverOrderOffer` в src/lib/socket-emitter.ts сервера.
 */
export interface OrderOfferEvent {
  orderId: string;
  /** Когда сервер снимет предложение, ISO — по часам сервера. */
  expiresAt: string;
  /** Часы сервера в момент отправки, ISO. Только для поправки на часы телефона. */
  serverTime: string;
  /** Полный срок предложения, с. */
  ttlSec: number;
  /** Кто предложил: авто-подбор или диспетчер вручную. */
  source: 'auto' | 'dispatcher';
  pickupAddress: string;
  estimatedPrice?: number;
  distanceToPickup?: number;
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
