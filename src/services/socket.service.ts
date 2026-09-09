/**
 * @file: src/services/socket.service.ts
 * @description:
 *   Singleton Socket.IO менеджер для namespace /driver.
 *   Управляет подключением, переподключением, подпиской на события.
 * @dependencies: socket.io-client, connection.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-09 (1.5.52 — подписка на chat:message)
 */

import { io, type Socket } from 'socket.io-client';
import { getSocketUrl } from '@/lib/constants';
import { useConnectionStore } from '@/stores/connection.store';
import { driverLogger } from '@/services/logger.service';
import type {
  OrderNewEvent,
  OrderStatusEvent,
  OrderCanceledEvent,
} from '@/types/socket-events';

type EventCallback<T> = (data: T) => void;

/**
 * Колбэк, каким его видит реестр: конкретный тип события знает подписчик,
 * службе он не нужен и не должен быть `any` — иначе ошибка в имени поля
 * события перестала бы ловиться на стороне подписчика.
 */
type RegisteredHandler = (...args: unknown[]) => void;

class SocketService {
  private socket: Socket | null = null;

  /**
   * РЕЕСТР СЛУШАТЕЛЕЙ — не роскошь, а единственный способ, которым подписки
   * вообще работают.
   *
   * ЧТО БЫЛО СЛОМАНО (исправлено в 1.5.49). Каждый `onXxx` вешал колбэк
   * прямо на сокет через `this.socket?.on(...)`. Опциональная цепочка молча
   * НИЧЕГО не делает, когда сокета ещё нет, — а функцию отписки возвращает,
   * будто всё удалось. И сокета в этот момент нет всегда: `SocketProvider`
   * подписывается синхронно, а `connect()` вызывает после `await` за
   * конфигом сервера. То есть НИ ОДНО событие не доходило, и приложение
   * жило на опросе: отмену заказа водитель узнавал через 10–30 секунд
   * вместо мгновенной доставки.
   *
   * Второй способ потерять подписки — переподключение. `connect()` создаёт
   * НОВЫЙ объект сокета, а компоненты, подписавшиеся на старый, об этом не
   * узнают: их эффекты давно отработали.
   *
   * Реестр закрывает оба случая: подписка живёт в службе, а не на объекте
   * сокета, и переносится на каждый новый сокет. Тот же приём, что в
   * `location.service` (`onLocationPoint`).
   */
  private handlers = new Map<string, Set<RegisteredHandler>>();

  /**
   * Подписаться на событие сервера.
   *
   * Работает независимо от того, подключён сокет сейчас или нет: колбэк
   * ложится в реестр, а на живой сокет вешается сразу либо при следующем
   * подключении.
   */
  private subscribe<T>(event: string, callback: EventCallback<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const handler = callback as RegisteredHandler;
    set.add(handler);
    this.socket?.on(event, handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
      this.socket?.off(event, handler);
    };
  }

  /** Перевесить все подписки из реестра на текущий сокет. */
  private attachHandlers(): void {
    const socket = this.socket;
    if (!socket) return;
    for (const [event, set] of this.handlers) {
      for (const callback of set) socket.on(event, callback);
    }
  }

  /** Подключиться к Socket.IO с JWT-токеном */
  connect(token: string): void {
    if (this.socket?.connected) return;

    this.disconnect();

    useConnectionStore.getState().setSocketStatus('connecting');
    const socketUrl = getSocketUrl();
    console.log('[Socket] connecting to:', `${socketUrl}/driver`);

    this.socket = io(`${socketUrl}/driver`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] connected!');
      useConnectionStore.getState().setSocketStatus('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] disconnected:', reason);
      useConnectionStore.getState().setSocketStatus('disconnected');
    });

    this.socket.on('connect_error', (err) => {
      console.log('[Socket] connect_error:', err.message);
      useConnectionStore.getState().setSocketStatus('disconnected');
    });

    // Команда с сервера: включить/выключить realtime-режим логов.
    // Диспетчер в админке нажимает кнопку → сервер шлёт это событие.
    this.socket.on(
      'driver:logs:mode',
      (data: { realtime?: boolean } | undefined) => {
        driverLogger.setRealtime(Boolean(data?.realtime));
      },
    );

    // Подписки, сделанные ДО этого момента (а это все подписки приложения —
    // провайдер вешает их синхронно, пока `connect` ждёт конфиг сервера),
    // переносим на новый сокет. Без этой строки реестр бесполезен.
    this.attachHandlers();
  }

  /** Отключиться */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      useConnectionStore.getState().setSocketStatus('disconnected');
    }
  }

  /** Подписка на событие «новый заказ» */
  onOrderNew(callback: EventCallback<OrderNewEvent>): () => void {
    return this.subscribe('order:new', callback);
  }

  /** Подписка на событие «изменение статуса заказа» */
  onOrderStatus(callback: EventCallback<OrderStatusEvent>): () => void {
    return this.subscribe('order:status', callback);
  }

  /** Подписка на событие «заказ отменён» */
  onOrderCanceled(callback: EventCallback<OrderCanceledEvent>): () => void {
    return this.subscribe('order:canceled', callback);
  }

  /**
   * v1.5.5: подписка на событие «заказ отредактирован диспетчером».
   * Сервер шлёт `order:updated` с `{ orderId }`, когда диспетчер поменял
   * адрес/подъезд/комментарий и т.п. без смены статуса. Хуки на клиенте
   * должны сделать `queryClient.invalidateQueries(['currentOrder', orderId])`,
   * чтобы отобразить свежие данные без ожидания 30-секундного poll'а.
   */
  onOrderUpdated(callback: EventCallback<{ orderId: string }>): () => void {
    return this.subscribe('order:updated', callback);
  }

  /**
   * Сервер просит подтвердить предзаказ (DISPATCH-V5).
   *
   * До 1.5.23 приложение на это событие НЕ ПОДПИСЫВАЛОСЬ и эндпоинт
   * `confirm-scheduled` не вызывало ни разу. Сервер честно ждал
   * подтверждения, не получал его и по таймауту передавал заказ другому —
   * функция не работала от начала до конца. Держалось только на том, что
   * подтверждение выключено в стратегии по умолчанию.
   */
  onConfirmationRequired(
    callback: EventCallback<{
      orderId: string;
      orderNumber: number;
      pickupAddress: string;
      scheduledAt: string;
      graceMin: number;
      graceExpiresAt: string;
    }>,
  ): () => void {
    return this.subscribe('order:confirmation_required', callback);
  }

  /** Заказ передали другому водителю — водитель не подтвердил вовремя. */
  onOrderReassigned(
    callback: EventCallback<{ orderId: string; orderNumber: number; reason: string }>,
  ): () => void {
    return this.subscribe('order:reassigned', callback);
  }

  /** Подписка на событие «баланс изменился» */
  onBalanceChanged<T>(callback: EventCallback<T>): () => void {
    return this.subscribe('balance:changed', callback);
  }

  /**
   * Сообщение от диспетчера (1.5.52).
   *
   * Событие сервер шлёт с марта — админский чат вызывает `emitToDriver`
   * при каждой отправке. Подписчика на него не было: приложение не имело
   * ни экрана чата, ни обработчика, и сообщения диспетчера доходили до
   * телефона ровно до этой строки, дальше пропадая.
   */
  onChatMessage(
    callback: EventCallback<{
      id: string;
      message: string;
      authorRole: 'admin' | 'driver';
      adminName?: string | null;
      createdAt: string;
    }>,
  ): () => void {
    return this.subscribe('chat:message', callback);
  }

  /**
   * Соединение установлено — в том числе ПОСЛЕ обрыва.
   *
   * Зачем это наружу: пока связи не было, сервер слал события в пустоту, и
   * они потеряны безвозвратно — Socket.IO их не переигрывает. Единственный
   * честный способ узнать, что изменилось, — перечитать данные. Поэтому
   * подписчик (`SocketProvider`) на каждое подключение сбрасывает кэш
   * запросов. Без этого водитель после туннеля или лифта работает по
   * данным, устаревшим на всю длину обрыва.
   */
  onConnected(callback: () => void): () => void {
    return this.subscribe('connect', callback as RegisteredHandler);
  }

  /**
   * Ошибка подключения — обычно протухший токен.
   *
   * До 1.5.49 провайдер вешал этот обработчик через `getSocket()?.on(...)`
   * сразу после монтирования, когда сокета ещё нет: обработчик не
   * регистрировался, и обновление токена по ошибке авторизации не
   * срабатывало ни разу.
   */
  onConnectError(callback: (err: Error) => void): () => void {
    return this.subscribe('connect_error', callback as RegisteredHandler);
  }

  /** Принудительное переподключение */
  reconnect(): void {
    if (this.socket) {
      console.log('[Socket] manual reconnect');
      useConnectionStore.getState().setSocketStatus('connecting');
      this.socket.connect();
    }
  }

  /** Получить экземпляр сокета (для доступа из провайдера) */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Отправить координату на сервер через Socket.IO для мгновенной
   * трансляции в админскую карту (без задержки REST-батча).
   * Если сокет не подключён — тихо пропускаем (REST-батч подстрахует
   * историю в БД, а админка получит координату в следующем событии).
   */
  emitLocation(point: {
    lat: number;
    lng: number;
    speed?: number;
    heading?: number;
    recordedAt?: string;
  }): void {
    if (!this.socket?.connected) return;
    this.socket.emit('driver:location', point);
  }

  /** Проверить подключение */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

/** Глобальный singleton */
export const socketService = new SocketService();
