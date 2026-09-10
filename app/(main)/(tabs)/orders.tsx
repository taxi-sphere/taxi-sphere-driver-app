/**
 * @file: app/(main)/(tabs)/orders.tsx
 * @description:
 *   Список заказов: свободные и предзаказы — двумя режимами одного экрана.
 *
 *   ТОЛЬКО ЧУЖИЕ ЗАКАЗЫ. С v1.5.24 здесь ровно один список — свободные,
 *   которые можно взять. Предзаказы уехали в свою вкладку: в v1.5.17 их
 *   свели сюда вторым режимом переключателя, и в одном контроле оказались
 *   две разные вещи — «что можно взять» и «что я уже взял». Нажатие на свой
 *   предзаказ из-за этого открывало окно «Принять заказ?» и упиралось в
 *   отказ сервера.
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
 * @updated: 2026-09-10 (1.5.54 — фильтр «Все / Сейчас / Предзаказы»)
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAvailableOrders } from '@/hooks/useAvailableOrders';
import { activeOrdersQueryKey } from '@/hooks/useCurrentOrder';
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
  StaggerItem,
  Surface,
  useNotify,
} from '@/components/ui';
import { haptics } from '@/lib/haptics';
import {
  icon as iconTokens,
  radius,
  spacing,
  touch,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';
import type { AvailableOrder, CurrentOrder } from '@/types/order';

/** Род заказов в списке: все, только на сейчас, только предзаказы. */
type OrderKind = 'all' | 'now' | 'scheduled';

const ACCEPT_TIMER_SEC = 30;
const DEFAULT_ETA_MIN = 5;

/** Через сколько секунд пробовать переподключиться после обрыва. */
const RETRY_INTERVAL = 15;

export default function OrdersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  const notify = useNotify();

  const { data: orders, isLoading, refetch, meta, error, isOffline, isDriverOffline } =
    useAvailableOrders();
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


  const handleConfirmAccept = useCallback(
    (pickupEtaMin: number) => {
      if (!pendingOrder) return;

      /**
       * Встречный ли это заказ — решаем ДО принятия, по тому, есть ли уже
       * активный. После успеха список уже обновится, и отличить встречный от
       * обычного будет нечем.
       */
      const active = queryClient.getQueryData<CurrentOrder[]>(activeOrdersQueryKey);
      const isCounter = (active?.length ?? 0) > 0;
      const orderNumber = pendingOrder.orderNumber;

      accept.mutate(
        { orderId: pendingOrder.id, pickupEtaMin },
        {
          onSuccess: async () => {
            // v1.5.5: сразу открываем экран «Текущий заказ», чтобы водитель
            // не искал куда идти дальше. Раньше он оставался на «Заказы»
            // и должен был вручную кликнуть по вкладке.
            router.replace('/(main)/(tabs)/current');

            /**
             * 1.5.23: про встречный говорим вслух. Раньше переход выглядел
             * так же, как при обычном заказе: экран открывался на ПЕРВОМ
             * заказе, а второй появлялся неприметным переключателем в шапке
             * шторки. Водитель не понимал, взялся заказ или нет, и жал
             * «Встречный» второй раз.
             */
            if (isCounter) {
              await notify(
                `Встречный заказ № ${orderNumber} принят`,
                `Подача через ${pickupEtaMin} мин — после того, как высадите текущего клиента. ` +
                  'Переключаться между заказами можно вверху шторки.',
              );
            }
          },
          onSettled: () => setPendingOrder(null),
        },
      );
    },
    [accept, pendingOrder, router, queryClient, notify],
  );

  const handleDismissModal = useCallback(() => {
    if (accept.isPending) return;
    setPendingOrder(null);
  }, [accept.isPending]);

  /**
   * Что показывать: всё, только на сейчас или только предзаказы (1.5.54).
   *
   * ФИЛЬТРУЕМ НА ТЕЛЕФОНЕ, А НЕ НА СЕРВЕРЕ. `scheduledAt` уже приходит в
   * каждой карточке, список короткий (не длиннее `limit`), и переключение
   * должно быть мгновенным — запрос на каждое нажатие превратил бы выбор
   * режима в ожидание. Сервер при этом остаётся единственным, кто решает,
   * ЧТО водителю вообще доступно: фильтр только прячет, но не добавляет.
   */
  const [orderKind, setOrderKind] = useState<OrderKind>('all');

  // Через `useMemo`, а не `orders ?? []` прямо в теле: пустой литерал
  // рождается заново на каждый рендер и пересчитывал бы всё, что от него
  // зависит, — включая счётчики на кнопках фильтра.
  const all = useMemo(() => orders ?? [], [orders]);
  const list = useMemo(() => {
    if (orderKind === 'now') return all.filter((o) => !o.scheduledAt);
    if (orderKind === 'scheduled') return all.filter((o) => o.scheduledAt);
    return all;
  }, [all, orderKind]);

  /** Сколько заказов каждого рода — числа на кнопках фильтра. */
  const counts = useMemo(
    () => ({
      all: all.length,
      now: all.filter((o) => !o.scheduledAt).length,
      scheduled: all.filter((o) => o.scheduledAt).length,
    }),
    [all],
  );

  const listLoading = isLoading;
  const listError = error;
  const reload = refetch;

  /**
   * Нажатие на карточку.
   *
   * Свободный заказ, который можно взять, — сразу окно подтверждения: это
   * самый частый путь, и лишний экран в нём был бы платой ни за что.
   *
   * Во всех остальных случаях открываем детали:
   *   • свой предзаказ — посмотреть адреса и время (принимать нечего, он
   *     уже за водителем). До 1.5.23 нажатие на него открывало окно
   *     «Принять заказ?», а подтверждение уходило в `/accept` и получало
   *     409: свой заказ принять нельзя;
   *   • заказ, который сейчас брать нельзя, — там водитель прочитает,
   *     почему нельзя и когда будет можно. Раньше такие карточки просто
   *     не нажимались, и это выглядело как поломка списка.
   */
  const handleCardPress = useCallback(
    (order: AvailableOrder) => {
      if (blockedMessage) {
        router.push(`/(main)/order/${order.id}` as never);
        return;
      }
      setPendingOrder(order);
    },
    [blockedMessage, router],
  );

  return (
    <Screen>
      {/* Обрыв сокета — ПОЛОСКА, а не заглушка на весь экран.

          До 1.5.38 здесь стояло `isDisconnected ? <EmptyState/> : <список>`,
          и весь экран заказов подменялся надписью «Нет связи с сервером».
          Это неверно по существу: сокет разносит мгновенные уведомления о
          новых заказах, а сам СПИСОК приходит обычным опросом по HTTP и
          прекрасно живёт без сокета. Хуже того, стартовое значение
          `socketStatus` — `disconnected`, так что ровно так экран выглядел
          при каждом запуске приложения до подключения сокета, и навсегда,
          если сокет не поднялся. Водитель при живом интернете видел пустой
          экран и не понимал, почему «нет заказов». */}
      {/* Интернета нет вовсе — это сильнее, чем «нет сокета», и говорится
          вместо него: две полоски про связь подряд только сбивают. */}
      {isOffline ? (
        <Banner
          tone="danger"
          icon="cloud-offline-outline"
          text="Нет интернета. Список обновится сам, как только связь вернётся"
        />
      ) : (
        isDisconnected && (
          <Banner
            tone="warning"
            icon="cloud-offline-outline"
            text={`Уведомления о новых заказах не приходят. Список обновляется сам, переподключение через ${retryCountdown} с`}
            action={{ label: 'Сейчас', onPress: handleRetry, loading: isRetrying }}
          />
        )
      )}

      {/* Именно `=== false`: поле необязательное, и «не пришло» —
          это не «GPS выключен». */}
      {meta?.hasGps === false && (
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

      {/* Переключатель рода заказов. Прячем, когда предзаказов нет вовсе:
          фильтр из одного значимого варианта — лишний ряд кнопок на экране,
          где место занимают карточки. */}
      {counts.scheduled > 0 && (
        <OrderKindFilter value={orderKind} counts={counts} onChange={setOrderKind} />
      )}

      {/* `!isOffline` — страховка, а не необходимость: у запроса на паузе
          `isLoading` уже false (замерено, см. query-bridges.test.ts), так что
          скелетоны и без неё не крутились бы вечно. Условие оставлено, чтобы
          порядок ветвей читался однозначно: нет сети — это не «загрузка». */}
      {listLoading && !isOffline && list.length === 0 ? (
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
            // Список НЕ пустой, но брать нельзя. Обычное состояние водителя
            // с заказом: сервер отдаёт свободные заказы всегда (v1.99.76,
            // с v1.99.88 — ещё и без радиуса), а принять можно не всегда.
            // Без этой строки выглядело бы как поломка: карточки есть,
            // нажатие ничего не делает.
            blockedMessage && list.length > 0 ? (
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
                onPress={handleCardPress}
                scheduled={false}
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
            <AvailableEmpty
              blockedMessage={blockedMessage}
              offline={isOffline}
              driverOffline={isDriverOffline}
              // Список пуст ИЗ-ЗА ФИЛЬТРА — это не «заказов нет», и говорить
              // так значило бы врать: заказы есть, просто другого рода.
              hiddenByFilter={all.length > 0 ? orderKind : null}
              onShowAll={() => setOrderKind('all')}
              onGoToOrder={() => router.replace('/(main)/(tabs)/current')}
            />
          }
        />
      )}

      <IncomingOrderModal
        visible={!!pendingOrder}
        order={pendingOrder}
        mode="confirm"
        timerSec={ACCEPT_TIMER_SEC}
        initialEtaMin={etaQuery.data?.etaMin ?? DEFAULT_ETA_MIN}
        etaLoading={etaQuery.isFetching}
        etaPresets={etaQuery.data?.presets}
        etaViaCurrentTrip={etaQuery.data?.viaCurrentTrip}
        accepting={accept.isPending}
        onAccept={handleConfirmAccept}
        onDismiss={handleDismissModal}
      />
    </Screen>
  );
}

/**
 * Переключатель рода заказов над списком (1.5.54).
 *
 * ЗАЧЕМ. До этого свободные заказы и предзаказы лежали в списке вперемешку,
 * и различить их можно было только по метке времени на карточке. Водителю
 * это два разных решения: «взять сейчас и поехать» и «занять себе вечер».
 * Числа на кнопках нужны не для красоты — без них переключение вслепую:
 * нажал «Предзаказы», увидел пусто и не понял, фильтр это или их правда нет.
 */
function OrderKindFilter({
  value,
  counts,
  onChange,
}: {
  value: OrderKind;
  counts: Record<OrderKind, number>;
  onChange: (next: OrderKind) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const options: { key: OrderKind; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'now', label: 'Сейчас' },
    { key: 'scheduled', label: 'Предзаказы' },
  ];

  return (
    <View style={styles.filterRow}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              haptics.tap();
              onChange(option.key);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${option.label}, заказов: ${counts[option.key]}`}
            style={[
              styles.filterChip,
              {
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primarySoft : 'transparent',
              },
            ]}
          >
            {/* Одна строка и сжатие кегля: «Предзаказы · 1» иначе не влезает
                в треть ширины и обрезается многоточием — на эмуляторе это
                выглядело как «Предзака…». Тот же приём уже применён к
                кнопкам выбора в настройках. */}
            <AppText
              variant="label"
              weight={active ? '700' : '500'}
              style={{ color: active ? colors.primary : colors.textSecondary }}
              center
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {option.label} · {counts[option.key]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
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
  offline,
  driverOffline,
  hiddenByFilter,
  onShowAll,
  onGoToOrder,
}: {
  blockedMessage: string | null;
  /** Сети нет — список не пуст, его просто неоткуда взять. */
  offline: boolean;
  /** Водитель не на линии — заказы вообще не запрашивались. */
  driverOffline: boolean;
  /**
   * Заказы есть, но их скрыл фильтр. `null` — список пуст по-настоящему.
   * Разница принципиальная: «заказов нет» при живых заказах — это ложь,
   * из-за которой водитель уходит с экрана.
   */
  hiddenByFilter: OrderKind | null;
  onShowAll: () => void;
  onGoToOrder: () => void;
}) {
  // Раньше всего остального: водитель вне линии видел «Свободных заказов
  // нет» и ждал, что они появятся сами. Они не появятся — запрос выключен.
  if (driverOffline) {
    return (
      <EmptyState
        icon="power-outline"
        tone="warning"
        title="Вы не на линии"
        description="Заказы не приходят, пока статус «Оффлайн». Смените статус в шапке экрана."
      />
    );
  }

  // Раньше всего: «Свободных заказов нет» без интернета — прямая ложь,
  // мы про заказы сейчас ничего не знаем.
  if (offline) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        tone="danger"
        title="Нет интернета"
        description="Заказы появятся здесь сами, как только связь вернётся"
      />
    );
  }

  // Заказы есть, просто другого рода — говорим именно это и даём вернуть
  // полный список одним нажатием.
  if (hiddenByFilter && hiddenByFilter !== 'all') {
    return (
      <EmptyState
        icon="funnel-outline"
        title={
          hiddenByFilter === 'scheduled'
            ? 'Предзаказов сейчас нет'
            : 'Заказов на сейчас нет'
        }
        description={
          hiddenByFilter === 'scheduled'
            ? 'Есть заказы на сейчас — их видно в режиме «Все»'
            : 'Есть предзаказы — их видно в режиме «Все»'
        }
        action={{ label: 'Показать все', onPress: onShowAll }}
      />
    );
  }

  /**
   * Заказ у водителя уже есть — и список ПУСТ.
   *
   * Заголовок здесь говорит про список, а не про запрет. Раньше стояло
   * «Сейчас новых заказов не даём», и это читалось ровно так, как звучит:
   * заказы есть, но их прячут. Хотя сервер отдаёт свободные заказы в любом
   * состоянии водителя (v1.99.76) и с v1.99.88 даже без радиуса — пусто
   * здесь означает, что свободных заказов правда нет.
   *
   * Причина, по которой второй заказ пока не взять, остаётся — но второй
   * строкой, как пояснение, а не как отказ.
   */
  if (blockedMessage) {
    return (
      <EmptyState
        icon="search-outline"
        title="Свободных заказов сейчас нет"
        description={`Новые появятся здесь сами — список виден всегда, даже когда заказ уже есть. ${blockedMessage}`}
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
  action?: { label: string; onPress: () => void; loading?: boolean };
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
        <Button
          onPress={action.onPress}
          variant="ghost"
          size="sm"
          loading={action.loading}
        >
          {action.label}
        </Button>
      )}
    </Surface>
  );
}

const createStyles = (_t: Theme) =>
  StyleSheet.create({
    tabs: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
    /* Полоса фильтра над списком: не карточка и не шапка — узкий ряд,
       который не отнимает у карточек больше одной строки. */
    filterRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    filterChip: {
      flex: 1,
      minHeight: touch.min,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1.5,
    },
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
