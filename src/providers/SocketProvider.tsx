/**
 * @file: src/providers/SocketProvider.tsx
 * @description:
 *   Провайдер Socket.IO: подключает/отключает socket
 *   в зависимости от состояния авторизации.
 *   При ошибке токена — автоматически refresh и переподключение.
 *   Инвалидирует React Query при получении событий.
 * @dependencies: socket.service, auth.store, token.service, @tanstack/react-query
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-09 (1.5.52 — сообщения диспетчера: бейдж и уведомление)
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
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

    // Через реестр службы, а не через `getSocket()?.on(...)`: сокета в этот
    // момент ещё НЕТ (его создаёт `connect()` выше, после `await` за
    // конфигом), и прежний обработчик не вешался ни разу — обновление
    // протухшего токена не срабатывало.
    const unsubConnectError = socketService.onConnectError(handleConnectError);

    /**
     * Каждое подключение — повод перечитать данные.
     *
     * Пока связи не было, сервер слал события в пустоту: Socket.IO их не
     * переигрывает, и всё, что случилось за время обрыва (заказ отменили,
     * адрес поправили, баланс изменился), приложение пропустило. Инвалидация
     * на `connect` — единственный честный способ это закрыть; она же
     * отрабатывает первое подключение после запуска.
     */
    const unsubConnected = socketService.onConnected(() => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['driver', 'profile'] });
    });

    // Подписка на события для инвалидации React Query + local notifications
    const unsubNew = socketService.onOrderNew((data) => {
      void queryClient.invalidateQueries({ queryKey: ['orders', 'available'] });
      // Local notification если приложение в фоне
      if (AppState.currentState !== 'active') {
        // v1.5.9: обращаемся к типизированному полю напрямую. Приведение
        // `data as Record<string, unknown>` TypeScript отвергал (у
        // OrderNewEvent нет index-signature), и заодно оно скрывало опечатки
        // в именах полей.
        void showLocalNotification(
          'Новый заказ',
          data?.pickupAddress || 'Доступен новый заказ',
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
        // v1.5.9: показываем ПРИЧИНУ отмены вместо номера заказа.
        // Раньше в текст подставлялся `data.orderNumber`, которого в событии
        // нет: сервер шлёт только `{ orderId, reason }` (orders.service.ts,
        // emitToDriver 'order:canceled'). Водитель всегда видел
        // «Заказ # отменён» с пустым номером, а причина — реально полезная —
        // не показывалась вовсе.
        void showLocalNotification(
          'Заказ отменён',
          data?.reason || 'Заказ отменён диспетчером',
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

    /**
     * Сообщение от диспетчера.
     *
     * Подписка живёт здесь, а не на экране чата: бейдж непрочитанных
     * должен загораться, даже если водитель за смену ни разу этот экран не
     * открывал, — а экран, смонтированный сейчас, увидит новое сообщение
     * через инвалидацию кэша.
     *
     * Счётчик прибавляется ТОЛЬКО чужому сообщению: своё же, вернувшееся
     * эхом, сделало бы непрочитанным собственный вопрос.
     */
    const unsubChat = socketService.onChatMessage((data) => {
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
      if (data?.authorRole === 'driver') return;

      useChatStore.getState().noteIncoming();
      if (AppState.currentState !== 'active') {
        void showLocalNotification(
          data?.adminName ? `Диспетчер ${data.adminName}` : 'Сообщение от диспетчера',
          data?.message || 'Открыть переписку',
          { type: 'chat_message' },
        );
      }
    });

    return () => {
      unsubConnectError();
      unsubConnected();
      unsubNew();
      unsubStatus();
      unsubCanceled();
      unsubBalance();
      unsubChat();
      socketService.disconnect();
    };
  }, [accessToken, queryClient]);

  return <>{children}</>;
}
