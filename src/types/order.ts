/**
 * @file: src/types/order.ts
 * @description:
 *   Типы заказов: статусы, доступные заказы, текущий заказ, остановки.
 *   Контракты совпадают с /api/v1/driver/orders/* на backend.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-02 (v1.5.23 — детали заказа, телефон диспетчерской)
 */

/** Статус заказа */
export type OrderStatus =
  | 'new'
  | 'searching'
  | 'assigned'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'canceled';

/** Способ оплаты */
export type PaymentMethod = 'cash' | 'card' | 'bonus';

/** Промежуточная остановка */
export interface OrderStop {
  address: string;
  lat: number | null;
  lng: number | null;
  entrance: string | null;
  note: string | null;
}

/**
 * Опция заказа (детское кресло, животное и т.п.) — сервер v1.99.64+.
 * Названия уже отфильтрованы сервером: скрытые от водителя не приходят,
 * обезличенные приходят как «Дополнительная опция».
 */
export interface OrderOption {
  id: string;
  name: string;
}

/** Заказ из списка доступных (GET /driver/orders/available) */
export interface AvailableOrder {
  id: string;
  orderNumber: number;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  estimatedPrice: number | null;
  estimatedKm: number | null;
  paymentMethod: PaymentMethod | null;
  comment: string | null;
  scheduledAt: string | null;
  createdAt?: string;
  serviceName: string | null;
  tariffName: string | null;
  stopsCount: number;
  stops: OrderStop[];
  distanceToPickup: number | null;
  options: OrderOption[];
  /**
   * «Горящий» — заказ, который авто-подбор раздать не смог (сервер
   * v1.99.69). Такие показываются в любом состоянии водителя, даже когда
   * взять их нельзя.
   */
  isHot: boolean;
}

/** Текущий активный заказ (GET /driver/orders/current) */
export interface CurrentOrder {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  clientPhone: string;
  clientName: string | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupEntrance: string | null;
  pickupNote: string | null;
  dropoffAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffEntrance: string | null;
  dropoffNote: string | null;
  estimatedPrice: number | null;
  estimatedKm: number | null;
  estimatedMin: number | null;
  paymentMethod: PaymentMethod | null;
  comment: string | null;
  createdAt?: string;
  assignedAt: string | null;
  startedAt: string | null;
  serviceName: string | null;
  /** Телефон диспетчерской службы заказа. `null` — не заполнен в админке. */
  dispatcherPhone: string | null;
  tariffName: string | null;
  stops: OrderStop[];
  options: OrderOption[];
}

/**
 * Детали одного заказа (`GET /driver/orders/{id}`, сервер v1.99.76).
 *
 * Один тип на два случая: чужой свободный заказ и свой предзаказ. Их
 * различает `isMine`; у своего кнопки «Принять» нет вовсе, у чужого она
 * есть и гаснет с объяснением в `blockedMessage`.
 */
export interface OrderDetails {
  order: AvailableOrder;
  isMine: boolean;
  canAccept: boolean;
  blockedReason: string | null;
  blockedMessage: string | null;
}

/** Мета-информация из API доступных заказов */
export interface AvailableOrdersMeta {
  effectiveRadius?: number;
  showOrdersWithoutGps?: boolean;
  hasGps?: boolean;
  /**
   * Появилось на сервере в v1.99.58 вместе с правилом «один активный заказ
   * на водителя». Пустой список — это два разных случая: «заказов нет» и
   * «вам сейчас нельзя». Без этих полей приложение показывало обоим одно
   * и то же «Нет доступных заказов», и водитель на подаче считал, что
   * заказов в городе нет.
   */
  blockedReason?: string | null;
  blockedMessage?: string | null;
}

/** Ответ принятия заказа (POST /driver/orders/{id}/accept) */
export interface AcceptOrderResponse {
  success: true;
  message: string;
  orderId: string;
  orderNumber: string;
}

/** Ответ завершения заказа (POST /driver/orders/{id}/complete) */
export interface CompleteOrderResponse {
  success: true;
  message: string;
  orderId: string;
  orderNumber: string;
  finalPrice: number | null;
}
