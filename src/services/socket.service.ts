/**
 * @file: src/services/socket.service.ts
 * @description:
 *   Singleton Socket.IO менеджер для namespace /driver.
 *   Управляет подключением, переподключением, подпиской на события.
 * @dependencies: socket.io-client, connection.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
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

class SocketService {
  private socket: Socket | null = null;

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
    this.socket?.on('order:new', callback);
    return () => {
      this.socket?.off('order:new', callback);
    };
  }

  /** Подписка на событие «изменение статуса заказа» */
  onOrderStatus(callback: EventCallback<OrderStatusEvent>): () => void {
    this.socket?.on('order:status', callback);
    return () => {
      this.socket?.off('order:status', callback);
    };
  }

  /** Подписка на событие «заказ отменён» */
  onOrderCanceled(callback: EventCallback<OrderCanceledEvent>): () => void {
    this.socket?.on('order:canceled', callback);
    return () => {
      this.socket?.off('order:canceled', callback);
    };
  }

  /**
   * v1.5.5: подписка на событие «заказ отредактирован диспетчером».
   * Сервер шлёт `order:updated` с `{ orderId }`, когда диспетчер поменял
   * адрес/подъезд/комментарий и т.п. без смены статуса. Хуки на клиенте
   * должны сделать `queryClient.invalidateQueries(['currentOrder', orderId])`,
   * чтобы отобразить свежие данные без ожидания 30-секундного poll'а.
   */
  onOrderUpdated(callback: EventCallback<{ orderId: string }>): () => void {
    this.socket?.on('order:updated', callback);
    return () => {
      this.socket?.off('order:updated', callback);
    };
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
    this.socket?.on('order:confirmation_required', callback);
    return () => {
      this.socket?.off('order:confirmation_required', callback);
    };
  }

  /** Заказ передали другому водителю — водитель не подтвердил вовремя. */
  onOrderReassigned(
    callback: EventCallback<{ orderId: string; orderNumber: number; reason: string }>,
  ): () => void {
    this.socket?.on('order:reassigned', callback);
    return () => {
      this.socket?.off('order:reassigned', callback);
    };
  }

  /** Подписка на событие «баланс изменился» */
  onBalanceChanged<T>(callback: EventCallback<T>): () => void {
    this.socket?.on('balance:changed', callback);
    return () => {
      this.socket?.off('balance:changed', callback);
    };
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
