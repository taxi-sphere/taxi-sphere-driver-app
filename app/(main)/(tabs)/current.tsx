/**
 * @file: app/(main)/(tabs)/current.tsx
 * @description:
 *   Экран активного заказа — главный экран водителя.
 *   State machine: нет заказа → assigned → driver_arrived → in_progress →
 *   completed. Каждому состоянию отвечает своя цель на карте и своя главная
 *   кнопка.
 *
 *   ПЕРЕСОБРАН В v1.5.17. Было: вертикальная простыня из восьми карточек и
 *   карта высотой 180px где-то в середине. Чтобы прочитать адрес подачи,
 *   водитель скроллил; чтобы понять, куда ехать, — скроллил ещё раз.
 *   Стало:
 *     • карта во весь экран — по ней и работают;
 *     • шторка снизу с тем, что нужно прямо сейчас: текущая цель, клиент,
 *       цена. Подробности — потянуть вверх, и только если понадобились;
 *     • главная кнопка на неподвижном месте внизу. Её жмут не глядя, и она
 *       не должна уезжать вместе с содержимым;
 *     • полоса этапов вместо бейджа: видно и пройденное, и следующий шаг;
 *     • встречный заказ. Правило «второй заказ можно, когда клиент уже в
 *       машине» появилось на сервере ещё в v1.99.58, но показать второй
 *       заказ было негде: `/orders/current` отдаёт ровно один. Теперь
 *       экран берёт `/orders/active` (список) и, если заказов два,
 *       показывает переключатель между ними — с 1.5.27 он живёт чипами
 *       над картой, а не строкой в шторке.
 *
 *   ЧТО СОХРАНЕНО БЕЗ ИЗМЕНЕНИЙ (проверено при переносе):
 *     • v1.5.5 guard `pickupLat/Lng` перед картой — react-native-maps падал
 *       на невалидных координатах и уносил весь экран;
 *     • v1.5.5 логирование всех ошибок действий в админку через
 *       driverLogger — иначе водитель видел silent-fail, а админ не мог
 *       понять, почему заказ «завис»;
 *     • v1.5.12 однократный вывод подъезда (`splitAddressEntrance`); снятие
 *       города переехало на сервер в v1.99.78 — см. `shortAddresses`;
 *     • подтверждение каждого действия через Alert;
 *     • таймер ожидания клиента и авто-возврат к списку после завершения.
 *
 *   ПОЧИНЕНО ПО ДОРОГЕ: экран «Заказ завершён» был недостижим. Он показывался
 *   по условию `order.status === 'completed'`, а сервер завершённые заказы
 *   не отдаёт вовсе — ни `/orders/current`, ни `/orders/active` (оба
 *   фильтруют по активным статусам). Водитель нажимал «Завершить» и сразу
 *   попадал на «Нет активного заказа», не увидев ни суммы, ни подтверждения.
 *   Теперь экран показывается по ФАКТУ успешного завершения, с суммой из
 *   ответа сервера.
 *
 * @dependencies: useActiveOrders, useOrderActions, @/components/ui,
 *                @/components/order/*, @/components/map/OrderMap
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-03 (v1.5.27 — переключатель заказов над картой, отказ от встречного)
 */

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  Component,
  type ReactNode,
  type ErrorInfo,
} from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveOrders, activeOrdersQueryKey } from '@/hooks/useCurrentOrder';
import { releaseOrder } from '@/api/orders.api';
import { useOrderActions } from '@/hooks/useOrderActions';
import { useSettingsStore } from '@/stores/settings.store';
import { driverLogger } from '@/services/logger.service';
import { haptics } from '@/lib/haptics';
import {
  formatCurrency,
  formatDistance,
  formatDuration,
  formatTime,
  formatTimer,
  shortenStreetType,
  splitAddressEntrance,
} from '@/lib/utils';
import { ORDER_COMPLETE_REDIRECT_MS } from '@/lib/constants';
import { isEmbeddedMapAvailable, EMBEDDED_MAP_UNAVAILABLE_HINT } from '@/lib/map-availability';
import {
  icon as iconTokens,
  radius,
  spacing,
  touch,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';
import {
  AppText,
  Badge,
  BottomSheet,
  Button,
  Divider,
  EmptyState,
  IconButton,
  RoutePoints,
  ScalePress,
  Screen,
  Surface,
  useConfirm,
  useDialog,
  useNotify,
  type RoutePoint,
} from '@/components/ui';
import { OrderProgress } from '@/components/order/OrderProgress';
import { OrderMap } from '@/components/map/OrderMap';
import { SHEET_COLLAPSED, sheetExpandedHeight } from '@/lib/sheet-metrics';
import type { CurrentOrder, OrderStatus } from '@/types/order';

/**
 * v1.5.9: считается один раз на модуль — значение зависит только от
 * конфигурации сборки и в рантайме не меняется.
 */
const mapAvailable = isEmbeddedMapAvailable();

/**
 * Строка «сначала завершите текущую» над кнопкой отказа.
 *
 * Две строки текста подписью — ровно столько, чтобы объяснить, и ни строкой
 * больше: полоса действия и так съедает низ экрана.
 */
const WAIT_NOTE_HEIGHT = 34;
/**
 * Длина адреса, после которой заголовок переходит на шрифт поменьше.
 * Замерено на 360 точках: до 30 символов адрес встаёт в две строки `title`.
 */
const LONG_ADDRESS_CHARS = 30;
/** Панель главного действия под шторкой. */
const ACTION_BAR_HEIGHT = touch.primary + spacing.lg * 2;
/** Что водитель делает на каждом этапе. */
const ACTION_BY_STATUS: Partial<
  Record<OrderStatus, { label: string; confirmTitle: string; confirmBody: string; confirm: string }>
> = {
  assigned: {
    label: 'Я НА МЕСТЕ',
    confirmTitle: 'Прибыли?',
    confirmBody: 'Подтвердите прибытие на точку подачи',
    confirm: 'Прибыл',
  },
  driver_arrived: {
    label: 'КЛИЕНТ В МАШИНЕ',
    confirmTitle: 'Начать поездку?',
    confirmBody: 'Клиент в машине?',
    confirm: 'Поехали',
  },
  in_progress: {
    label: 'ЗАВЕРШИТЬ ПОЕЗДКУ',
    confirmTitle: 'Завершить заказ?',
    confirmBody: 'Поездка завершена?',
    confirm: 'Завершить',
  },
};

export default function CurrentOrderScreen() {
  const router = useRouter();
  const { data: orders, isLoading, error, refetch } = useActiveOrders();

  /**
   * Какой из активных заказов открыт.
   *
   * `null` — «первый в списке»: сервер ставит первым тот, что водитель
   * выполняет сейчас (`in_progress`), а не встречный. Явный выбор
   * запоминается, пока этот заказ жив.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const order = useMemo(() => {
    if (!orders || orders.length === 0) return null;
    return orders.find((o) => o.id === selectedId) ?? orders[0];
  }, [orders, selectedId]);
  const { arrive, start, complete } = useOrderActions();
  const preferredNavigator = useSettingsStore((s) => s.preferredNavigator);
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const askDialog = useDialog();

  /**
   * Высота области под шторку. Меряем, а не берём из `Dimensions`: окно
   * выше этого контейнера на шапку, полосу баланса и вкладки.
   */
  const [containerHeight, setContainerHeight] = useState(0);
  /** Идёт отказ от заказа — гасим кнопку, чтобы не нажали дважды. */
  const [releasing, setReleasing] = useState(false);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const notify = useNotify();

  // Таймер ожидания клиента (driver_arrived)
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const waitingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Что показать после завершения заказа.
   *
   * Держится отдельным состоянием, а не выводится из заказа: завершённого
   * заказа в ответе сервера уже нет, он исчезает из списка активных в тот
   * же момент.
   */
  const [completed, setCompleted] = useState<{ price: number | null } | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  /**
   * Адреса точек в порядке отрисовки.
   *
   * 1.5.27: город здесь больше не снимается. Это делает сервер (v1.99.78),
   * и делает правильнее: он знает базовый город службы, а приложение
   * выводило город из совпадения двух точек — у заказа с одной точкой
   * (клиент не сказал, куда едет) город оставался и съедал сам адрес.
   * Оставлять `stripSharedCityPrefix` поверх серверной чистки нельзя: у
   * двух адресов на одной улице совпадёт уже НЕ город, а улица, и «Ленина,
   * 1» превратилось бы в «1».
   */
  const shortAddresses = useMemo(() => {
    const short = [
      order?.pickupAddress ?? '',
      ...(order?.stops ?? []).map((s) => s.address),
      order?.dropoffAddress ?? '',
    ];
    return {
      pickup: short[0] ?? '',
      stops: short.slice(1, short.length - 1),
      dropoff: short[short.length - 1] ?? '',
    };
  }, [order]);

  // Управление таймером ожидания
  useEffect(() => {
    if (order?.status === 'driver_arrived') {
      setWaitingSeconds(0);
      waitingTimer.current = setInterval(() => {
        setWaitingSeconds((prev) => prev + 1);
      }, 1000);
    } else if (waitingTimer.current) {
      clearInterval(waitingTimer.current);
      waitingTimer.current = null;
    }
    return () => {
      if (waitingTimer.current) clearInterval(waitingTimer.current);
    };
  }, [order?.status]);

  /**
   * Последний известный список активных заказов — для момента после
   * завершения. Читать `orders` прямо в таймере нельзя: он замкнулся бы на
   * значение, каким оно было при запуске отсчёта, а именно в эти секунды
   * список и обновляется — завершённый заказ из него уходит.
   */
  const ordersRef = useRef<CurrentOrder[] | undefined>(undefined);
  ordersRef.current = orders;

  // Куда уходим после завершения заказа
  useEffect(() => {
    if (!completed) {
      setRedirectCountdown(null);
      return;
    }
    const seconds = ORDER_COMPLETE_REDIRECT_MS / 1000;
    setRedirectCountdown(seconds);
    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          setCompleted(null);

          /**
           * 1.5.23: остался встречный — открываем ЕГО, а не список
           * свободных. Раньше отсюда всегда уходили в «Заказы», и водитель
           * со вторым заказом в работе оказывался на экране свободных
           * заказов — а его клиент в это время ждал в машине. Найти
           * встречный можно было только вручную, через вкладку «Заказ».
           */
          const remaining = ordersRef.current ?? [];
          if (remaining.length > 0 && remaining[0]) {
            setSelectedId(remaining[0].id);
          } else {
            router.replace('/(main)/(tabs)/orders');
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [completed, router]);

  const openNavigator = useCallback(
    (lat: number, lng: number) => {
      haptics.tap();
      const urls: Record<string, string> = {
        yandex: `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`,
        '2gis': `dgis://2gis.ru/routeSearch/rsType/car/to/${lng},${lat}`,
        google: `google.navigation:q=${lat},${lng}`,
      };
      const url = urls[preferredNavigator] ?? urls.yandex;
      Linking.openURL(url).catch(() => {
        // Фолбэк на Google Maps web
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
      });
    },
    [preferredNavigator],
  );

  /**
   * v1.5.5: обёртка мутации с логированием ошибок в админку. Раньше при
   * сетевой ошибке /arrive|/start|/complete водитель видел silent-fail
   * (react-query показывал error state внутренне, но UI не менялся) —
   * админ не мог понять, почему заказ «завис».
   */
  const runOrderAction = useCallback(
    (action: 'arrive' | 'start' | 'complete', orderId: string, fn: () => void) => {
      try {
        fn();
      } catch (e) {
        void driverLogger.error(`Action ${action} threw synchronously`, {
          screen: 'current',
          action: `order_${action}_throw`,
          orderId,
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : null,
        });
        haptics.reject();
        void notify('Не удалось выполнить действие', 'Логи отправлены — диспетчер увидит ошибку.');
      }
    },
    [notify],
  );

  /**
   * Отказ от взятого заказа.
   *
   * Подтверждение обязательно: заказ уйдёт другому водителю, и отменить это
   * нажатие уже нельзя. Про штраф говорим ЗАРАНЕЕ, но без цифр — окно и
   * величина штрафа настраиваются на сервере, и захардкоженное «минус 5
   * баллов» рано или поздно соврёт.
   */
  const handleRelease = useCallback(async () => {
    if (!order) return;
    const ok = await confirm({
      title: 'Отказаться от заказа?',
      message:
        `Заказ № ${order.orderNumber} вернётся в поиск и уйдёт другому водителю. ` +
        'Если с момента взятия прошло много времени, отказ учтётся в рейтинге.',
      confirmLabel: 'Отказаться',
      variant: 'danger',
    });
    if (!ok) return;

    setReleasing(true);
    const result = await releaseOrder(order.id);
    setReleasing(false);

    if (!result.ok) {
      await notify('Не удалось отказаться', result.message);
      return;
    }

    // Выбор сбрасываем: заказа, который был открыт, в списке больше нет.
    setSelectedId(null);
    await queryClient.invalidateQueries({ queryKey: activeOrdersQueryKey });
    await notify('Заказ передан в поиск', result.message);
  }, [order, confirm, notify, queryClient]);

  /** Одно подтверждение на все три действия — текст берётся по статусу. */
  const handlePrimaryAction = useCallback(() => {
    if (!order) return;
    const config = ACTION_BY_STATUS[order.status];
    if (!config) return;

    const run = () => {
      haptics.confirm();
      const onError = (err: unknown, name: string) =>
        void driverLogger.error(`${name}.mutate failed`, {
          screen: 'current',
          action: `order_${name}_error`,
          orderId: order.id,
          message: err instanceof Error ? err.message : String(err),
        });

      if (order.status === 'assigned') {
        runOrderAction('arrive', order.id, () =>
          arrive.mutate(order.id, { onError: (e) => onError(e, 'arrive') }),
        );
      } else if (order.status === 'driver_arrived') {
        runOrderAction('start', order.id, () =>
          start.mutate(order.id, { onError: (e) => onError(e, 'start') }),
        );
      } else if (order.status === 'in_progress') {
        const price = order.estimatedPrice;
        runOrderAction('complete', order.id, () =>
          complete.mutate(
            { orderId: order.id },
            {
              // Сумму берём из ответа сервера: финальная цена может
              // отличаться от расчётной (наценки, правки диспетчера).
              onSuccess: (res) => setCompleted({ price: res.finalPrice ?? price }),
              onError: (e) => onError(e, 'complete'),
            },
          ),
        );
      }
    };

    haptics.tap();
    void confirm({
      title: config.confirmTitle,
      message: config.confirmBody,
      confirmLabel: config.confirm,
    }).then((ok) => {
      if (ok) run();
    });
  }, [order, arrive, start, complete, runOrderAction, confirm]);

  const call = (phone: string) => {
    haptics.tap();
    Linking.openURL(`tel:${phone}`);
  };

  /**
   * Трубка у адреса: кому звонить.
   *
   * Окно показывается ВСЕГДА, даже когда телефон диспетчерской не заполнен —
   * тогда второй пункт просто погашен. Если бы трубка иногда открывала выбор,
   * а иногда звонила сразу, водитель на ходу нажал бы её по памяти и позвонил
   * не тому. Одно действие — один исход.
   */
  const askWhomToCall = useCallback(async () => {
    if (!order) return;
    const dispatcherPhone = order.dispatcherPhone;

    const choice = await askDialog({
      title: 'Кому позвонить?',
      actions: [
        { label: 'Клиенту', icon: 'person-outline' },
        {
          label: 'Диспетчеру',
          icon: 'headset-outline',
          variant: 'secondary',
          disabled: !dispatcherPhone,
          hint: 'Телефон диспетчерской не заполнен в настройках службы',
        },
      ],
    });

    if (choice === 0) call(order.clientPhone);
    else if (choice === 1 && dispatcherPhone) call(dispatcherPhone);
  }, [askDialog, order]);

  // ─── Состояния без заказа ────────────────────────────────────────────

  if (isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (error && !order) {
    return (
      <Screen>
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Не удалось загрузить заказ"
          description="Проверьте связь и попробуйте ещё раз"
          action={{ label: 'Повторить', onPress: () => void refetch() }}
        />
      </Screen>
    );
  }

  // Показывается ПОСЛЕ завершения, пока идёт обратный отсчёт до возврата
  // к списку. Стоит выше проверки `!order` намеренно: завершённого заказа
  // в данных уже нет, и без этого водитель увидел бы «Нет активного заказа».
  if (completed) {
    return (
      <Screen style={styles.centered}>
        <CompletedCard price={completed.price} countdown={redirectCountdown} />
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen>
        <EmptyState
          icon="car-outline"
          title="Нет активного заказа"
          description="Возьмите заказ из списка — он появится здесь"
          action={{
            label: 'К списку заказов',
            onPress: () => router.replace('/(main)/(tabs)/orders'),
          }}
        />
      </Screen>
    );
  }

  // ─── Активный заказ ──────────────────────────────────────────────────

  const target = pickTarget(order, shortAddresses);
  const targetAddress = shortenStreetType(target.address);
  const action = ACTION_BY_STATUS[order.status];

  /**
   * Открытый заказ ждёт своей очереди: клиент другого заказа ещё в машине.
   *
   * То же правило, что теперь проверяет сервер (v1.99.78). До него «Я на
   * месте» у встречного заказа не только показывалось, но и принималось:
   * заказ уезжал в `driver_arrived`, и диспетчер видел машину у клиента,
   * которого она ещё даже не начинала везти.
   */
  const waitsForCurrent = Boolean(
    orders?.some((o) => o.id !== order.id && o.status === 'in_progress'),
  );
  /** Отказаться можно только до посадки — дальше это дело диспетчера. */
  const canRelease =
    waitsForCurrent && (order.status === 'assigned' || order.status === 'driver_arrived');

  // Нет кнопки — нет и полосы под неё: иначе шторка висела бы над пустой
  // полосой в 88. У ждущего заказа полоса выше на строку объяснения.
  const actionBarHeight = waitsForCurrent
    ? ACTION_BAR_HEIGHT + WAIT_NOTE_HEIGHT
    : action
      ? ACTION_BAR_HEIGHT
      : 0;
  const canShowMap = mapAvailable && order.pickupLat != null && order.pickupLng != null;

  const routePoints: RoutePoint[] = buildRoutePoints(order, shortAddresses, openNavigator);

  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      {canShowMap ? (
        <MapErrorBoundary orderId={order.id}>
          <OrderMap order={order} fill bottomInset={SHEET_COLLAPSED + actionBarHeight} />
        </MapErrorBoundary>
      ) : (
        <View style={[styles.mapFallback, { backgroundColor: colors.mapPlaceholder }]}>
          <Ionicons name="map-outline" size={iconTokens.xxl} color={colors.textMuted} />
          <AppText variant="label" tone="muted" center style={styles.mapFallbackText}>
            {mapAvailable ? 'Координаты не указаны' : EMBEDDED_MAP_UNAVAILABLE_HINT}
          </AppText>
        </View>
      )}

      {/* Плавающая строка над картой: заказ (или переключатель) и таймер */}
      <View style={styles.floatingTop} pointerEvents="box-none">
        {/**
         * Со встречным заказом чип с номером превращается в переключатель.
         *
         * 1.5.27: раньше переключатель жил в шапке шторки и занимал там
         * целую строку — а строк в шторке считаное число. Здесь он не стоит
         * ни одной: место над картой всё равно занято чипом с номером.
         * Заодно видно, какой заказ открыт, не разворачивая шторку.
         */}
        {orders && orders.length > 1 ? (
          orders.map((item, index) => {
            const active = item.id === order.id;
            return (
              <ScalePress
                key={item.id}
                onPress={() => setSelectedId(item.id)}
                accessibilityLabel={`Заказ № ${item.orderNumber}`}
              >
                <Surface
                  level={2}
                  padded={false}
                  radius={radius.pill}
                  style={[
                    styles.floatingChip,
                    active && { backgroundColor: colors.primary },
                  ]}
                >
                  <AppText
                    variant="labelStrong"
                    style={{ color: active ? colors.textInverse : colors.textSecondary }}
                  >
                    {index === 0 ? 'Текущий' : 'Встречный'} · № {item.orderNumber}
                  </AppText>
                </Surface>
              </ScalePress>
            );
          })
        ) : (
          <Surface level={2} padded={false} radius={radius.pill} style={styles.floatingChip}>
            <AppText variant="labelStrong">№ {order.orderNumber}</AppText>
          </Surface>
        )}

        {order.status === 'driver_arrived' && (
          <Surface level={2} padded={false} radius={radius.pill} style={styles.floatingChip}>
            <Ionicons name="hourglass-outline" size={iconTokens.xs} color={colors.warning} />
            <AppText variant="labelStrong" tone="warning">
              {formatTimer(waitingSeconds)}
            </AppText>
          </Surface>
        )}
      </View>

      <BottomSheet
        collapsedHeight={SHEET_COLLAPSED}
        expandedHeight={sheetExpandedHeight(containerHeight, actionBarHeight)}
        bottomOffset={actionBarHeight}
        header={
          <View style={styles.sheetHeader}>
            <OrderProgress status={order.status} />

            {/* Действия стоят у того адреса, к которому относятся, а не
                отдельной строкой ниже. Строка с именем и номером клиента
                убрана: номер всё равно под маской — прочитать и набрать его
                нельзя, — а места она занимала больше, чем обе кнопки. */}
            <View style={styles.targetBlock}>
              <View style={styles.targetRow}>
                <View style={styles.targetText}>
                  {/* Город приписан к подписи этапа, а не отдельной строкой:
                      в шторке каждая строка на счету, а нужен он только в
                      межгороде — сервер и присылает его лишь тогда. */}
                  <AppText variant="overline" tone="muted">
                    {target.label}
                    {order.cityLabel ? ` · ${order.cityLabel}` : ''}
                  </AppText>
                  {/* Длинный адрес («проспект Красноярский рабочий, 150»)
                      в две строки крупным шрифтом не помещается: сначала
                      сокращаем тип улицы, и только если и этого мало —
                      уменьшаем шрифт на шаг. Обрезать адрес нельзя. */}
                  <AppText
                    variant={targetAddress.length > LONG_ADDRESS_CHARS ? 'heading' : 'title'}
                    numberOfLines={2}
                  >
                    {targetAddress}
                  </AppText>
                </View>

                <View style={styles.targetActions}>
                  <IconButton
                    icon="call"
                    onPress={() => void askWhomToCall()}
                    accessibilityLabel="Позвонить"
                    background={colors.successSoft}
                    color={colors.success}
                  />
                  {target.lat != null && target.lng != null && (
                    <IconButton
                      icon="navigate"
                      onPress={() => openNavigator(target.lat!, target.lng!)}
                      accessibilityLabel="Открыть в навигаторе"
                      background={colors.primarySoft}
                      color={colors.primary}
                    />
                  )}
                </View>
              </View>

              {target.entrance ? (
                <Badge tone="brand" size="md" style={styles.entrance}>
                  Подъезд {target.entrance}
                </Badge>
              ) : null}
            </View>
          </View>
        }
      >
        <ScrollView
          contentContainerStyle={styles.sheetBody}
          showsVerticalScrollIndicator={false}
        >
          <Divider />

          <View style={styles.section}>
            <AppText variant="overline" tone="muted">
              Маршрут
            </AppText>
            <RoutePoints points={routePoints} style={styles.route} />
          </View>

          {order.comment ? (
            <Surface level={0} style={[styles.comment, { backgroundColor: colors.warningSoft }]}>
              <AppText variant="overline" tone="warning">
                Комментарий
              </AppText>
              <AppText variant="body" style={styles.commentText}>
                {order.comment}
              </AppText>
            </Surface>
          ) : null}

          <View style={styles.section}>
            <AppText variant="overline" tone="muted">
              Детали
            </AppText>
            <Surface level={0} padded={false} style={styles.details}>
              <DetailRow label="Стоимость" value={formatCurrency(order.estimatedPrice)} strong />
              {order.estimatedKm != null && (
                <DetailRow label="Расстояние" value={formatDistance(order.estimatedKm)} />
              )}
              {order.estimatedMin != null && (
                <DetailRow label="Время в пути" value={formatDuration(order.estimatedMin)} />
              )}
              {order.paymentMethod && (
                <DetailRow label="Оплата" value={PAYMENT_LABEL[order.paymentMethod]} />
              )}
              {/* Опции заказа (сервер v1.99.64) — водителю важно видеть, что
                  клиенту обещали детское кресло, а не узнавать об этом на
                  месте. Скрытые от водителя опции сервер не присылает. */}
              {(order.options ?? []).length > 0 && (
                <DetailRow
                  label="Опции"
                  value={(order.options ?? []).map((o) => o.name).join(', ')}
                />
              )}
              {order.tariffName && <DetailRow label="Тариф" value={order.tariffName} />}
              {order.serviceName && <DetailRow label="Служба" value={order.serviceName} />}
              {order.assignedAt && (
                <DetailRow label="Назначен" value={formatTime(order.assignedAt)} />
              )}
              {order.startedAt && <DetailRow label="Начат" value={formatTime(order.startedAt)} />}
            </Surface>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Панель главного действия. Вне шторки — чтобы не двигалась. */}
      {(action || waitsForCurrent) && (
        <View
          style={[
            styles.actionBar,
            { backgroundColor: colors.surface, height: actionBarHeight },
          ]}
        >
          {waitsForCurrent ? (
            <>
              {/* Объяснение, а не погашенная кнопка: серая кнопка читается
                  как поломка, строка говорит, чего ждать и когда. */}
              <AppText variant="caption" tone="muted" center style={styles.waitNote}>
                Сначала завершите текущую поездку — потом этот заказ станет
                текущим
              </AppText>
              {canRelease && (
                <Button
                  onPress={handleRelease}
                  size="lg"
                  fullWidth
                  variant="danger"
                  loading={releasing}
                >
                  ОТКАЗАТЬСЯ ОТ ЗАКАЗА
                </Button>
              )}
            </>
          ) : (
            action && (
              <Button
                onPress={handlePrimaryAction}
                size="lg"
                fullWidth
                variant={order.status === 'in_progress' ? 'success' : 'primary'}
                loading={arrive.isPending || start.isPending || complete.isPending}
              >
                {action.label}
              </Button>
            )
          )}
        </View>
      )}
    </View>
  );
}

/* ─── Вспомогательные части ───────────────────────────────────────────── */

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bonus: 'Бонусы',
};

type ShortAddresses = { pickup: string; stops: string[]; dropoff: string };

/**
 * Куда водитель едет ПРЯМО СЕЙЧАС.
 *
 * До подачи цель — клиент; после посадки — первая невыполненная остановка
 * или конечная точка. Именно этот адрес и стоит в шторке крупным шрифтом:
 * остальные нужны реже, и им место в развёрнутом маршруте.
 */
function pickTarget(
  order: CurrentOrder,
  short: ShortAddresses,
): { label: string; address: string; entrance: string | null; lat: number | null; lng: number | null } {
  if (order.status === 'assigned' || order.status === 'driver_arrived') {
    const point = splitAddressEntrance(short.pickup || order.pickupAddress, order.pickupEntrance);
    return {
      label: 'Подача',
      address: point.address,
      entrance: point.entrance,
      lat: order.pickupLat,
      lng: order.pickupLng,
    };
  }

  const firstStop = (order.stops ?? [])[0];
  if (firstStop) {
    const point = splitAddressEntrance(short.stops[0] ?? firstStop.address, firstStop.entrance);
    return {
      label: 'Остановка',
      address: point.address,
      entrance: point.entrance,
      lat: firstStop.lat,
      lng: firstStop.lng,
    };
  }

  const point = splitAddressEntrance(
    short.dropoff || order.dropoffAddress || '',
    order.dropoffEntrance,
  );
  return {
    label: 'Куда',
    address: point.address || 'Адрес не указан',
    entrance: point.entrance,
    lat: order.dropoffLat,
    lng: order.dropoffLng,
  };
}

/** Полный маршрут для развёрнутой шторки. */
function buildRoutePoints(
  order: CurrentOrder,
  short: ShortAddresses,
  openNavigator: (lat: number, lng: number) => void,
): RoutePoint[] {
  const navAction = (lat: number | null, lng: number | null) =>
    lat != null && lng != null ? (
      <IconButton
        icon="navigate-outline"
        onPress={() => openNavigator(lat, lng)}
        accessibilityLabel="Открыть в навигаторе"
        size={touch.min - 8}
      />
    ) : undefined;

  const pickup = splitAddressEntrance(short.pickup || order.pickupAddress, order.pickupEntrance);
  const points: RoutePoint[] = [
    {
      kind: 'pickup',
      address: shortenStreetType(pickup.address),
      note: joinNotes(pickup.entrance ? `Подъезд ${pickup.entrance}` : null, order.pickupNote),
      action: navAction(order.pickupLat, order.pickupLng),
    },
  ];

  (order.stops ?? []).forEach((stop, index) => {
    const point = splitAddressEntrance(short.stops[index] ?? stop.address, stop.entrance);
    points.push({
      kind: 'stop',
      address: shortenStreetType(point.address),
      note: joinNotes(point.entrance ? `Подъезд ${point.entrance}` : null, stop.note),
      action: navAction(stop.lat, stop.lng),
    });
  });

  if (order.dropoffAddress) {
    const dropoff = splitAddressEntrance(
      short.dropoff || order.dropoffAddress,
      order.dropoffEntrance,
    );
    points.push({
      kind: 'dropoff',
      address: shortenStreetType(dropoff.address),
      note: joinNotes(dropoff.entrance ? `Подъезд ${dropoff.entrance}` : null, order.dropoffNote),
      action: navAction(order.dropoffLat, order.dropoffLng),
    });
  } else {
    /**
     * Заказ без конечной точки — обычное дело: клиент сказал «поехали»,
     * а куда, скажет в машине. Раньше маршрут обрывался одной точкой без
     * пояснения, и это читалось как потерянные данные.
     */
    points.push({
      kind: 'dropoff',
      address: 'Адрес назначения уточнит клиент',
      muted: true,
    });
  }

  return points;
}

function joinNotes(...parts: (string | null | undefined)[]): string | null {
  const kept = parts.filter(Boolean);
  return kept.length > 0 ? kept.join(' · ') : null;
}

function DetailRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.detailRow}>
      <AppText variant="body" tone="muted">
        {label}
      </AppText>
      <AppText variant={strong ? 'subheading' : 'bodyStrong'}>{value}</AppText>
    </View>
  );
}

/** Экран после завершения: сколько заработано и когда вернёмся к списку. */
function CompletedCard({
  price,
  countdown,
}: {
  price: number | null;
  countdown: number | null;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  useEffect(() => {
    haptics.success();
  }, []);

  return (
    <Surface level={2} style={styles.completed}>
      <View style={[styles.completedIcon, { backgroundColor: colors.successSoft }]}>
        <Ionicons name="checkmark-circle" size={iconTokens.xxl} color={colors.success} />
      </View>
      <AppText variant="heading" center>
        Заказ завершён
      </AppText>
      <AppText variant="display" tone="success" center style={styles.completedPrice}>
        {formatCurrency(price)}
      </AppText>
      {countdown != null && (
        <AppText variant="label" tone="muted" center>
          Переход к заказам через {countdown} с
        </AppText>
      )}
    </Surface>
  );
}

/**
 * v1.5.5: локальный ErrorBoundary для карты заказа. react-native-maps может
 * упасть на невалидных regions/coords даже несмотря на guard выше (например,
 * если сама тайл-сервисная конфигурация испортилась). Ловим краш здесь,
 * логируем в админку через driverLogger — вместо белого экрана.
 */
class MapErrorBoundary extends Component<
  { children: ReactNode; orderId: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; orderId: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void driverLogger.error('OrderMap crash caught by boundary', {
      screen: 'current',
      action: 'map_crash',
      orderId: this.props.orderId,
      message: error.message,
      stack: error.stack ?? info.componentStack ?? null,
    });
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.colors.background },
    centered: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

    mapFallback: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xxxl,
    },
    mapFallbackText: { maxWidth: 300 },

    floatingTop: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      gap: spacing.sm,
    },
    floatingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
    },

    sheetHeader: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.md,
    },
    targetBlock: { gap: spacing.xs },
    entrance: { marginTop: spacing.xs },
    targetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    targetText: { flex: 1, gap: spacing.xs },
    targetActions: { flexDirection: 'row', gap: spacing.sm },

    sheetBody: { padding: spacing.lg, paddingTop: 0, gap: spacing.lg },
    section: { gap: spacing.sm },
    route: { marginTop: spacing.xs },
    details: { gap: 0 },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    comment: { gap: spacing.xs },
    commentText: { marginTop: spacing.xs },

    waitNote: { marginBottom: spacing.xs },
    actionBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: ACTION_BAR_HEIGHT,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },

    completed: { alignItems: 'center', gap: spacing.sm, width: '100%', maxWidth: 380 },
    completedIcon: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    completedPrice: { marginVertical: spacing.xs },
  });
