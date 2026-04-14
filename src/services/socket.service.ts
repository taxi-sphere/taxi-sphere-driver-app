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

  /** Проверить подключение */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

/** Глобальный singleton */
export const socketService = new SocketService();
