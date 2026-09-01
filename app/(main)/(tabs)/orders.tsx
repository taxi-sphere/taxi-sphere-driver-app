/**
 * @file: app/(main)/(tabs)/orders.tsx
 * @description:
 *   Список заказов: свободные и предзаказы — двумя режимами одного экрана.
 *
 *   ЧТО ИЗМЕНИЛОСЬ В v1.5.17.
 *   • Предзаказы переехали сюда из отдельной нижней вкладки, где висела
 *     заглушка «Здесь будут отображаться заказы». Вкладка занимала одно из
 *     четырёх мест главной навигации и не делала ничего.
 *   • Пустой список теперь объясняет ПОЧЕМУ он пуст. Сервер с v1.99.58
 *     присылает `meta.blockedMessage` («Водитель едет на подачу…»), но
 *     приложение его не читало — и водитель на подаче видел ровно то же
 *     «Нет доступных заказов», что и водитель в пустом городе.
 *   • Состояния «нет связи», «нет GPS» и «ошибка загрузки» приведены к
 *     одному виду. Раньше это были три разных самодельных баннера.
 *
 * @dependencies: useAvailableOrders, useScheduledOrders, useOrderActions,
 *                @/components/order/OrderCard, @/components/ui
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — редизайн, предзаказы, причина пустого списка)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAvailableOrders } from '@/hooks/useAvailableOrders';
import { useScheduledOrders } from '@/hooks/useScheduledOrders';
import { useOrderActions } from '@/hooks/useOrderActions';
import { useConnectionStore } from '@/stores/connection.store';
import { socketService } from '@/services/socket.service';
import { getOrderEtaEstimate } from '@/api/orders.api';
import { IncomingOrderModal } from '@/components/IncomingOrderModal';
import { OrderCard } from '@/components/order/OrderCard';
import {
  AppText,
  Button,
  EmptyState,
  OrderCardSkeleton,
  Screen,
  Segmented,
  StaggerItem,
  Surface,
} from '@/components/ui';
import { icon as iconTokens, spacing, useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import type { AvailableOrder } from '@/types/order';

const ACCEPT_TIMER_SEC = 30;
const DEFAULT_ETA_MIN = 5;

/** Через сколько секунд пробовать переподключиться после обрыва. */
const RETRY_INTERVAL = 15;

type Tab = 'available' | 'scheduled';

export default function OrdersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [tab, setTab] = useState<Tab>('available');

  const { data: orders, isLoading, refetch, meta, error } = useAvailableOrders();
  const scheduled = useScheduledOrders();
  const { accept } = useOrderActions();
  const socketStatus = useConnectionStore((s) => s.socketStatus);
  const isDisconnected = socketStatus !== 'connected';

  // Таймер авто-переподключения
  const [retryCountdown, setRetryCountdown] = useState(RETRY_INTERVAL);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    socketService.reconnect();
    setRetryCountdown(RETRY_INTERVAL);
    setTimeout(() => setIsRetrying(false), 2000);
  }, []);

  useEffect(() => {
    if (!isDisconnected) {
      // Подключились — сброс таймера
      setRetryCountdown(RETRY_INTERVAL);
      if (retryTimer.current) {
        clearInterval(retryTimer.current);
        retryTimer.current = null;
      }
      return;
    }

    setRetryCountdown(RETRY_INTERVAL);
    retryTimer.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          handleRetry();
          return RETRY_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (retryTimer.current) clearInterval(retryTimer.current);
    };
  }, [isDisconnected, handleRetry]);

  // Выбранный заказ для модалки подтверждения
  const [pendingOrder, setPendingOrder] = useState<AvailableOrder | null>(null);

  // Загрузка рекомендованного времени подачи от сервера
  const etaQuery = useQuery({
    queryKey: ['order', pendingOrder?.id, 'eta-estimate'],
    queryFn: () => getOrderEtaEstimate(pendingOrder!.id),
    enabled: !!pendingOrder,
    retry: 1,
    staleTime: 0,
    gcTime: 0,
  });

  /** Почему заказы сейчас брать нельзя (сервер объясняет в `meta`). */
  const blockedMessage = meta?.blockedMessage ?? null;

  const handleAccept = useCallback((order: AvailableOrder) => {
    setPendingOrder(order);
  }, []);

  const handleConfirmAccept = useCallback(
    (pickupEtaMin: number) => {
      if (!pendingOrder) return;
      accept.mutate(
        { orderId: pendingOrder.id, pickupEtaMin },
        {
          onSuccess: () => {
            // v1.5.5: сразу открываем экран «Текущий заказ», чтобы водитель
            // не искал куда идти дальше. Раньше он оставался на «Заказы»
            // и должен был вручную кликнуть по вкладке.
            router.replace('/(main)/(tabs)/current');
          },
          onSettled: () => setPendingOrder(null),
        },
      );
    },
    [accept, pendingOrder, router],
  );

  const handleDismissModal = useCallback(() => {
    if (accept.isPending) return;
    setPendingOrder(null);
  }, [accept.isPending]);

  const isScheduledTab = tab === 'scheduled';
  const list = isScheduledTab ? (scheduled.data ?? []) : (orders ?? []);
  const listLoading = isScheduledTab ? scheduled.isLoading : isLoading;
  const listError = isScheduledTab ? scheduled.error : error;
  const reload = isScheduledTab ? scheduled.refetch : refetch;

  return (
    <Screen>
      <View style={styles.tabs}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'available', label: 'Свободные', count: orders?.length },
            { value: 'scheduled', label: 'Предзаказы', count: scheduled.data?.length },
          ]}
        />
      </View>

      {/* Нет связи — единственное состояние, которое перекрывает весь экран:
          без сокета список всё равно не обновляется. */}
      {isDisconnected ? (
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Нет связи с сервером"
          description={`Переподключение через ${retryCountdown} с`}
          action={{ label: 'Переподключиться', onPress: handleRetry, loading: isRetrying }}
        />
      ) : (
        <>
          {/* Именно `=== false`: поле необязательное, и «не пришло» —
              это не «GPS выключен». */}
          {!isScheduledTab && meta?.hasGps === false && (
            <Banner
              tone={meta.showOrdersWithoutGps ? 'warning' : 'danger'}
              icon="navigate-circle-outline"
              text={
                meta.showOrdersWithoutGps
                  ? 'GPS выключен — заказы показаны без фильтра расстояния'
                  : 'Включите GPS, иначе заказы не приходят'
              }
            />
          )}

          {listError && (
            <Banner
              tone="danger"
              icon="alert-circle-outline"
              text="Не удалось загрузить список"
              action={{ label: 'Повторить', onPress: () => void reload() }}
            />
          )}

          {listLoading && list.length === 0 ? (
            <View style={styles.list}>
              <OrderCardSkeleton />
              <OrderCardSkeleton />
              <OrderCardSkeleton />
            </View>
          ) : (
            <FlatList
              data={list}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[styles.list, list.length === 0 && styles.listEmpty]}
              ListHeaderComponent={
                // Список НЕ пустой, но брать нельзя — так бывает с горящими
                // заказами: сервер отдаёт их в любом состоянии водителя
                // (v1.99.69), а принять можно не всегда. Без этой строки
                // выглядело бы как поломка: карточки есть, нажатие ничего
                // не делает.
                !isScheduledTab && blockedMessage && list.length > 0 ? (
                  <Surface
                    level={1}
                    style={[styles.blockedNote, { borderColor: colors.warning }]}
                  >
                    <AppText variant="caption" tone="warning">
                      {blockedMessage}
                    </AppText>
                  </Surface>
                ) : null
              }
              renderItem={({ item, index }) => (
                <StaggerItem index={index}>
                  <OrderCard
                    order={item}
                    onPress={handleAccept}
                    scheduled={isScheduledTab}
                    disabled={!isScheduledTab && Boolean(blockedMessage)}
                  />
                </StaggerItem>
              )}
              refreshControl={
                <RefreshControl
                  refreshing={listLoading}
                  onRefresh={() => void reload()}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
              ListEmptyComponent={
                isScheduledTab ? (
                  <EmptyState
                    icon="time-outline"
                    title="Предзаказов нет"
                    description="Заказы, назначенные вам на определённое время, появятся здесь"
                  />
                ) : (
                  <AvailableEmpty
                    blockedMessage={blockedMessage}
                    onGoToOrder={() => router.replace('/(main)/(tabs)/current')}
                  />
                )
              }
            />
          )}
        </>
      )}

      <IncomingOrderModal
        visible={!!pendingOrder}
        order={pendingOrder}
        mode="confirm"
        timerSec={ACCEPT_TIMER_SEC}
        initialEtaMin={etaQuery.data?.etaMin ?? DEFAULT_ETA_MIN}
        etaLoading={etaQuery.isFetching}
        accepting={accept.isPending}
        onAccept={handleConfirmAccept}
        onDismiss={handleDismissModal}
      />
    </Screen>
  );
}

/**
 * Пустой список свободных заказов.
 *
 * Два принципиально разных случая под одним заголовком «пусто» — самая
 * частая причина, по которой водитель звонит диспетчеру. Если сервер
 * прислал причину (`blockedMessage` — правило одного активного заказа,
 * v1.99.58), показываем именно её и ведём туда, где заказ уже есть.
 */
function AvailableEmpty({
  blockedMessage,
  onGoToOrder,
}: {
  blockedMessage: string | null;
  onGoToOrder: () => void;
}) {
  if (blockedMessage) {
    return (
      <EmptyState
        icon="car"
        tone="warning"
        title="Сейчас новых заказов не даём"
        description={blockedMessage}
        action={{ label: 'К текущему заказу', onPress: onGoToOrder }}
      />
    );
  }

  return (
    <EmptyState
      icon="search-outline"
      title="Свободных заказов нет"
      description="Новые появятся здесь автоматически, обновлять вручную не нужно"
    />
  );
}

/** Узкая плашка над списком: предупреждение или ошибка. */
function Banner({
  tone,
  icon,
  text,
  action,
}: {
  tone: 'warning' | 'danger';
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const accent = tone === 'danger' ? colors.danger : colors.warning;
  const background = tone === 'danger' ? colors.dangerSoft : colors.warningSoft;

  return (
    <Surface level={0} padded={false} style={[styles.banner, { backgroundColor: background }]}>
      <Ionicons name={icon} size={iconTokens.md} color={accent} />
      <AppText variant="label" style={{ color: accent, flex: 1 }}>
        {text}
      </AppText>
      {action && (
        <Button onPress={action.onPress} variant="ghost" size="sm">
          {action.label}
        </Button>
      )}
    </Surface>
  );
}

const createStyles = (_t: Theme) =>
  StyleSheet.create({
    tabs: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
    list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
    // Без этого пустое состояние прижимается к верху вместо центра списка.
    listEmpty: { flexGrow: 1 },
    blockedNote: {
      borderWidth: 1,
      marginBottom: spacing.sm,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
  });
