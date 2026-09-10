/**
 * @file: src/types/order.ts
 * @description:
 *   Типы заказов: статусы, доступные заказы, текущий заказ, остановки.
 *   Контракты совпадают с /api/v1/driver/orders/* на backend.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-09 (1.5.51 — комментарии к точкам в списке)
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
  /**
   * Нужен, чтобы отметить точку пройденной. `null` у сборок сервера до
   * v1.100.2 — тогда отмечать нечем, и кнопка ведёт сразу к завершению.
   */
  id?: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  entrance: string | null;
  note: string | null;
  /** ISO-время отметки. `null`/отсутствует — точку ещё не проехали. */
  arrivedAt?: string | null;
}

/**
 * Показания счётчика по текущему заказу.
 *
 * Сумму считает СЕРВЕР по тарифу — приложение её только показывает.
 * Тариф на телефоне подставной, и число на экране водителя обязано
 * совпадать с тем, что спишется у клиента.
 */
export interface OrderMeter {
  distanceM: number;
  movingSec: number;
  waitingSec: number;
  waitingOn: boolean;
  chargeableWaitingSec: number;
  /** Начислено за ожидание, рубли. */
  waitingCost: number;
  /**
   * Условия ожидания из тарифа. Без них водитель видит только растущее
   * время и не может ответить клиенту, сколько ещё бесплатно и почём
   * пойдут деньги.
   */
  waitingFreeSec: number;
  waitingPerMinute: number;
  /**
   * Как пробег разложился по зонам (сервер v1.100.5+).
   *
   * `null` — считали по городским правилам: зон нет, трека ещё нет либо
   * сервер старше. Тогда чек показывает одну строку «Поездка», как раньше.
   */
  zones: {
    cityKm: number;
    settlementKm: number;
    intercityKm: number;
  } | null;
  total: number;
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
  /** Населённый пункт — только если он не свой (сервер v1.99.77). */
  cityLabel?: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  /** Комментарии диспетчера к точкам (сервер v1.100.7). */
  pickupNote?: string | null;
  dropoffNote?: string | null;
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
  /**
   * Сервер попросил подтвердить предзаказ и ждёт ответа (v1.99.76).
   * Заполнено без `confirmedAt` — значит, ответа ещё нет.
   */
  confirmationRequestedAt?: string | null;
  confirmedAt?: string | null;
}

/** Текущий активный заказ (GET /driver/orders/current) */
export interface CurrentOrder {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  clientPhone: string;
  clientName: string | null;
  pickupAddress: string;
  /** Населённый пункт — только если он не свой (сервер v1.99.77). */
  cityLabel?: string | null;
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
  /** Сколько минут до подачи обещал водитель при приёме заказа. */
  pickupEtaMin: number | null;
  /** Когда обещание зафиксировано — от него идёт обратный отсчёт. */
  pickupEtaConfirmedAt: string | null;
  serviceName: string | null;
  /** Телефон диспетчерской службы заказа. `null` — не заполнен в админке. */
  dispatcherPhone: string | null;
  tariffName: string | null;
  stops: OrderStop[];
  options: OrderOption[];
  /**
   * Счётчик. `null` у сборок сервера до v1.100.2 и у заказа без тарифа —
   * тогда строки «на счётчике» на экране просто нет.
   */
  meter?: OrderMeter | null;
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

/**
 * Ответ списка свободных заказов.
 *
 * Отдельным типом — чтобы читать кэш React Query по имени, а не пересказывать
 * форму ответа в каждом месте, где она нужна (1.5.54).
 */
export interface AvailableOrdersResponse {
  items: AvailableOrder[];
  meta?: AvailableOrdersMeta;
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
