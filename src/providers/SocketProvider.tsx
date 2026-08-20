/**
 * @file: src/providers/SocketProvider.tsx
 * @description:
 *   Провайдер Socket.IO: подключает/отключает socket
 *   в зависимости от состояния авторизации.
 *   При ошибке токена — автоматически refresh и переподключение.
 *   Инвалидирует React Query при получении событий.
 * @dependencies: socket.service, auth.store, token.service, @tanstack/react-query
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-17 10:00:00
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { socketService } from '@/services/socket.service';
import { showLocalNotification } from '@/services/notification.service';
import * as tokenService from '@/services/token.service';
import { getApiBase, API_TIMEOUT_MS, fetchServerConfig } from '@/lib/constants';

/** Попытка refresh токена, возвращает новый accessToken или null */
async function tryRefreshToken(): Promise<string | null> {
  try {
    const refreshToken = await tokenService.getRefreshToken();
    if (!refreshToken) return null;

    const res = await fetch(`${getApiBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data.success && data.data?.accessToken) {
      await useAuthStore
        .getState()
        .updateAccessToken(data.data.accessToken, data.data.refreshToken);
      return data.data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const refreshAttempted = useRef(false);

  // Reconnect при возврате из фона
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && accessToken && !socketService.isConnected()) {
        console.log('[SocketProvider] App resumed, reconnecting socket...');
        socketService.reconnect();
      }
    });
    return () => subscription.remove();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      socketService.disconnect();
      refreshAttempted.current = false;
      return;
    }

    refreshAttempted.current = false;

    // Загрузить socket URL с сервера ДО подключения
    fetchServerConfig().finally(() => {
      socketService.connect(accessToken);
    });

    // При ошибке токена — попробовать refresh
    const handleConnectError = async (err: Error) => {
      const isTokenError =
        err.message?.includes('токен') ||
        err.message?.includes('token') ||
        err.message?.includes('Unauthorized') ||
        err.message?.includes('401');

      if (isTokenError && !refreshAttempted.current) {
        refreshAttempted.current = true;
        console.log('[SocketProvider] Token invalid, attempting refresh...');

        const newToken = await tryRefreshToken();
        if (newToken) {
          console.log('[SocketProvider] Refresh successful, reconnecting...');
          socketService.disconnect();
          socketService.connect(newToken);
        } else {
          console.log('[SocketProvider] Refresh failed, logging out...');
          await useAuthStore.getState().logout();
        }
      }
    };

    const socket = socketService.getSocket();
    socket?.on('connect_error', handleConnectError);

    // Подписка на события для инвалидации React Query + local notifications
    const unsubNew = socketService.onOrderNew((data) => {
      void queryClient.invalidateQueries({ queryKey: ['orders', 'available'] });
      // Local notification если приложение в фоне
      if (AppState.currentState !== 'active') {
        const d = data as Record<string, unknown> | undefined;
        void showLocalNotification(
          'Новый заказ',
          (d?.pickupAddress as string) || 'Доступен новый заказ',
          { type: 'new_order' },
        );
      }
    });

    const unsubStatus = socketService.onOrderStatus(() => {
      void queryClient.invalidateQueries({ queryKey: ['orders', 'current'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'available'] });
    });

    const unsubCanceled = socketService.onOrderCanceled((data) => {
      // Сброс кэша сразу, чтобы placeholderData не удерживал отменённый заказ
      queryClient.setQueryData(['orders', 'current'], null);
      void queryClient.invalidateQueries({ queryKey: ['orders', 'current'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'available'] });
      if (AppState.currentState !== 'active') {
        const d = data as Record<string, unknown> | undefined;
        void showLocalNotification(
          'Заказ отменён',
          `Заказ #${(d?.orderNumber as string) || ''} отменён`,
          { type: 'order_canceled' },
        );
      }
    });

    // Изменение баланса: инвалидация списка транзакций + профиль
    // + локальная нотификация с деталями для водителя.
    const unsubBalance = socketService.onBalanceChanged<{
      amount: number;
      balanceAfter: number;
      description?: string | null;
      orderNumber?: number | null;
      type?: string;
    }>((data) => {
      void queryClient.invalidateQueries({ queryKey: ['balance', 'transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['driver', 'profile'] });

      const amount = Number(data?.amount ?? 0);
      const sign = amount >= 0 ? '+' : '';
      const formatted = `${sign}${amount.toLocaleString('ru-RU')} ₽`;
      const balanceStr = `${Number(data?.balanceAfter ?? 0).toLocaleString('ru-RU')} ₽`;

      // Заголовок с деталями операции
      let title = 'Изменение баланса';
      if (data?.orderNumber != null) {
        title = `Комиссия с заказа #${data.orderNumber}`;
      } else if (data?.type === 'manual_deposit') {
        title = 'Пополнение баланса';
      } else if (data?.type === 'bonus') {
        title = 'Начислен бонус';
      } else if (data?.type === 'penalty') {
        title = 'Штраф';
      } else if (data?.type === 'shift_fee') {
        title = 'Абонплата за смену';
      } else if (data?.type === 'refund') {
        title = 'Возврат на баланс';
      }

      void showLocalNotification(
        title,
        `${formatted}. Текущий баланс: ${balanceStr}`,
        { type: 'balance_changed' },
      );
    });

    return () => {
      socket?.off('connect_error', handleConnectError);
      unsubNew();
      unsubStatus();
      unsubCanceled();
      unsubBalance();
      socketService.disconnect();
    };
  }, [accessToken, queryClient]);

  return <>{children}</>;
}
