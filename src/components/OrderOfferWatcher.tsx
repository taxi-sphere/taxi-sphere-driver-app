/**
 * @file: src/components/OrderOfferWatcher.tsx
 * @description:
 *   Окно «Входящий заказ»: сервер предложил заказ этому водителю (1.5.59).
 *
 *   ЗАЧЕМ. Авто-подбор на сервере выбирает ближайшего свободного водителя и
 *   держит заказ за ним 30 секунд. До 1.5.59 приложение этого не видело:
 *   предложение приходило как обычный `order:new`, водитель слышал тот же
 *   звук, что на любой заказ в списке, и не знал, что заказ его. Предложение
 *   истекало, заказ уходил в «Без водителя» — 13.09.2026 владелец так и
 *   описал: «свободному водителю не предлагается заказ».
 *
 *   ЧТО ПОКАЗЫВАЕМ. То же окно, что при взятии заказа из свободных
 *   (`IncomingOrderModal`, режим `offer`), — водитель уже знает его наизусть:
 *   адрес, цена, время подачи, «Принять · N с». Таймер — сколько осталось у
 *   предложения на сервере.
 *
 *   ТРИ ОТВЕТА И ТРИ РАЗНЫХ ДЕЙСТВИЯ.
 *   - «Принять» — обычное принятие заказа, дальше экран поездки.
 *   - Крестик или «назад» — отказ на сервер: он сразу предложит заказ
 *     следующему, не дожидаясь срока.
 *   - Время вышло — ничего на сервер не шлём: он снимет предложение сам, а
 *     отказ вдогонку засчитался бы как отказ.
 *
 *   ПОЧЕМУ В КОРНЕ. Предложение приходит, где бы водитель ни был: в списке,
 *   в «Деньгах», в настройках. Тот же приём, что `ScheduledConfirmationWatcher`.
 *
 *   ПРИЛОЖЕНИЕ СВЁРНУТО. Показываем уведомление; окно откроется, когда
 *   водитель вернётся, если предложение ещё живо, — с честным остатком.
 *
 * @dependencies: socket.service, orders.api, useOrderActions, offer.store,
 *                @/lib/order-offer, IncomingOrderModal, notification.service,
 *                logger.service, react-query, expo-router
 * @created: 2026-09-13 (1.5.59)
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { socketService } from '@/services/socket.service';
import { declineOffer, getOrderDetails, getOrderEtaEstimate } from '@/api/orders.api';
import { useOrderActions } from '@/hooks/useOrderActions';
import { IncomingOrderModal } from '@/components/IncomingOrderModal';
import { useNotify } from '@/components/ui';
import { showLocalNotification } from '@/services/notification.service';
import { driverLogger } from '@/services/logger.service';
import { humanApiError } from '@/lib/utils';
import { offerRemainingSec } from '@/lib/order-offer';
import { useOfferStore } from '@/stores/offer.store';

/** Время подачи, пока сервер не прислал рекомендацию. Как в списке заказов. */
const DEFAULT_ETA_MIN = 5;

export function OrderOfferWatcher() {
  const current = useOfferStore((s) => s.current);
  const receive = useOfferStore((s) => s.receive);
  const clear = useOfferStore((s) => s.clear);
  const queryClient = useQueryClient();
  const notify = useNotify();
  const { accept } = useOrderActions();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  const orderId = current?.event.orderId ?? null;
  const deadlineMs = current?.deadlineMs ?? 0;

  useEffect(
    () =>
      socketService.onOrderOffer((event) => {
        // Сверяемся с системой в момент предложения: окно откроется, только
        // если приложение на экране, и ошибиться здесь стоит заказа.
        setAppActive(AppState.currentState === 'active');
        if (!receive(event, Date.now())) return;

        driverLogger.info('Предложен заказ', {
          screen: 'offer',
          action: 'order_offer_received',
          extra: { orderId: event.orderId, ttlSec: event.ttlSec, source: event.source },
        });

        if (AppState.currentState !== 'active') {
          void showLocalNotification(
            'Вам предложен заказ',
            `${event.pickupAddress} — ответ в течение ${event.ttlSec} с`,
            { type: 'order_offer', orderId: event.orderId },
          );
        }
      }),
    [receive],
  );

  /**
   * На экране ли приложение.
   *
   * НАЧАЛЬНОМУ ЗНАЧЕНИЮ НЕ ВЕРИМ. Этот компонент живёт в корне и
   * монтируется, пока Android ещё не вывел активити на экран: в первом
   * рендере `AppState.currentState` — «background», а переход в «active»
   * случается раньше, чем подписка ниже успевает повеситься. Проверено на
   * эмуляторе 13.09.2026: после холодного старта окно предложения не
   * открывалось вовсе, а после одного «свернуть — вернуть» открывалось
   * сразу. Поэтому состояние перечитывается при подписке и в момент
   * прихода предложения.
   */
  useEffect(() => {
    setAppActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) =>
      setAppActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  const refreshAvailable = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['orders', 'available'] });
  }, [queryClient]);

  /** Время вышло. Идемпотентно: сюда приходят и окно, и таймер хранилища. */
  const handleExpired = useCallback(
    (id: string) => {
      if (accept.isPending) return;
      if (useOfferStore.getState().current?.event.orderId !== id) return;
      driverLogger.info('Предложение истекло без ответа', {
        screen: 'offer',
        action: 'order_offer_expired',
        extra: { orderId: id },
      });
      clear(id);
      refreshAvailable();
    },
    [accept.isPending, clear, refreshAvailable],
  );

  // Снять предложение в срок, даже если окно так и не открылось: приложение
  // было в фоне, или заказ не успел загрузиться.
  useEffect(() => {
    if (!orderId) return;
    const timer = setTimeout(() => handleExpired(orderId), Math.max(0, deadlineMs - Date.now()));
    return () => clearTimeout(timer);
  }, [orderId, deadlineMs, handleExpired]);

  const details = useQuery({
    queryKey: ['order', orderId, 'details'],
    queryFn: () => getOrderDetails(orderId!),
    enabled: orderId !== null,
    retry: 1,
    staleTime: 0,
  });

  const eta = useQuery({
    queryKey: ['order', orderId, 'eta-estimate'],
    queryFn: () => getOrderEtaEstimate(orderId!),
    enabled: orderId !== null,
    retry: 1,
    staleTime: 0,
    gcTime: 0,
  });

  // Заказ забрали или взять его уже нельзя — окно не открываем вовсе.
  useEffect(() => {
    if (!orderId) return;
    const unavailable = details.isError || (details.data && !details.data.canAccept);
    if (!unavailable) return;
    driverLogger.info('Предложение снято: заказ недоступен', {
      screen: 'offer',
      action: 'order_offer_unavailable',
      extra: { orderId, reason: details.data?.blockedReason ?? 'load_failed' },
    });
    clear(orderId);
  }, [orderId, details.isError, details.data, clear]);

  const order =
    details.data?.canAccept && details.data.order.id === orderId ? details.data.order : null;
  const ready = appActive && order !== null;

  /**
   * Остаток считается в момент, когда окно готово открыться, — и заново
   * после возвращения из фона. Считать его на каждый рендер нельзя: окно
   * сбрасывает свой отсчёт при каждом изменении `timerSec`.
   */
  const [timerSec, setTimerSec] = useState(0);
  useEffect(() => {
    setTimerSec(ready ? offerRemainingSec(deadlineMs, Date.now()) : 0);
  }, [ready, deadlineMs]);

  const handleAccept = useCallback(
    (pickupEtaMin: number) => {
      if (!orderId) return;
      const id = orderId;
      accept.mutate(
        { orderId: id, pickupEtaMin },
        {
          onSuccess: () => {
            driverLogger.info('Предложенный заказ принят', {
              screen: 'offer',
              action: 'order_offer_accepted',
              extra: { orderId: id, pickupEtaMin },
            });
            clear(id);
            router.replace('/(main)/(tabs)/current');
          },
          onError: (error) => {
            clear(id);
            refreshAvailable();
            void notify(
              'Заказ не принят',
              humanApiError(
                error instanceof Error ? error.message : '',
                'Сервер не ответил. Возможно, заказ уже взял другой водитель.',
              ),
            );
          },
        },
      );
    },
    [accept, clear, notify, orderId, refreshAvailable],
  );

  const handleDecline = useCallback(() => {
    if (!orderId || accept.isPending) return;
    const id = orderId;
    driverLogger.info('Отказ от предложенного заказа', {
      screen: 'offer',
      action: 'order_offer_declined',
      extra: { orderId: id },
    });
    clear(id);
    void declineOffer(id).finally(refreshAvailable);
  }, [accept.isPending, clear, orderId, refreshAvailable]);

  const handleTimeout = useCallback(() => {
    if (orderId) handleExpired(orderId);
  }, [handleExpired, orderId]);

  return (
    <IncomingOrderModal
      visible={ready && timerSec > 0}
      order={order}
      mode="offer"
      timerSec={Math.max(timerSec, 1)}
      initialEtaMin={eta.data?.etaMin ?? DEFAULT_ETA_MIN}
      etaLoading={eta.isFetching}
      etaDistanceKm={eta.data?.distanceKm}
      etaPresets={eta.data?.presets}
      etaViaCurrentTrip={eta.data?.viaCurrentTrip}
      accepting={accept.isPending}
      onAccept={handleAccept}
      onDismiss={handleDecline}
      onTimeout={handleTimeout}
    />
  );
}
