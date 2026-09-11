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
 * @updated: 2026-09-04 (1.5.34 — подъезд обычным текстом «под. N» внутри адреса,
 *                        примечание к адресу в шапке, чипы без номеров)
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
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveOrders, activeOrdersQueryKey } from '@/hooks/useCurrentOrder';
import { useAvailableOrders } from '@/hooks/useAvailableOrders';
import { arriveStop, releaseOrder, setWaiting } from '@/api/orders.api';
import { nextPendingStop, stopActionLabel } from '@/lib/order-stop-progress';
import { pickupEtaState } from '@/lib/pickup-eta';
import { rideCostOf } from '@/lib/trip-receipt';
import {
  waitingHint,
  waitingTermsText,
  formatWaitClock,
  liveWaitingSec,
} from '@/lib/waiting-hint';
import { finishMeter, setMeterOrder } from '@/services/trip-meter.service';
import { useOrderActions } from '@/hooks/useOrderActions';
import { useSettingsStore } from '@/stores/settings.store';
import { driverLogger } from '@/services/logger.service';
import { haptics } from '@/lib/haptics';
import {
  formatCurrency,
  formatDistance,
  formatDuration,
  formatTime,
  shortenStreetType,
  splitAddressEntrance,
} from '@/lib/utils';
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
  OfflineState,
} from '@/components/ui';
import { useConnectionStore } from '@/stores/connection.store';
import { OrderProgress } from '@/components/order/OrderProgress';
import { OrderMap } from '@/components/map/OrderMap';
import { SHEET_CHROME, SHEET_COLLAPSED, sheetExpandedHeight } from '@/lib/sheet-metrics';
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

/**
 * Видимый диаметр кнопок звонка и навигатора в шапке заказа.
 *
 * Меньше обычных 48, потому что они делят строку с полосой этапов, а той
 * нужна ширина под четыре подписи: самое длинное слово шкалы («Поездка»)
 * шрифтом 12 (мельче в проекте нельзя) занимает около 57 точек, четыре
 * слота — около 236 из 328 доступных. Зона нажатия от размера НЕ зависит:
 * `IconButton` добирает её до 48 невидимым запасом.
 */
const HEADER_ACTION_SIZE = 36;
/** Панель главного действия под шторкой. */
const ACTION_BAR_HEIGHT = touch.primary + spacing.lg * 2;
/**
 * Отступ справа для полосы поверх карты.
 *
 * В правом верхнем углу карты стоят её собственные кнопки — «общий план» и
 * «на себя», 40 pt при отступе 12 (`OrderMap`). Плашка с суммой обязана
 * кончаться раньше: иначе строка ожидания при длинном тексте уезжает под
 * кнопку и читается наполовину.
 */
const MAP_BUTTONS_INSET = 12 + 40 + spacing.md;

/**
 * Строка чека: за что слева, сколько справа.
 *
 * Отдельным компонентом, а не разметкой на месте: строк четыре, и
 * скопированные они разъезжаются — выравнивание сумм по правому краю живо
 * ровно до первой правки одной из копий.
 *
 * Стили берёт сам: `useThemedStyles` кэширует их по фабрике и теме, так что
 * вызов здесь ничего не стоит, а проброс `styles` пропом загромождал бы
 * каждое место применения.
 */
function FareRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  /** Итоговая строка — крупнее и жирнее остальных. */
  strong?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.fareRow}>
      <AppText
        variant={strong ? 'label' : 'caption'}
        style={styles.fareLabel}
        numberOfLines={2}
      >
        {label}
      </AppText>
      <AppText
        variant={strong ? 'label' : 'caption'}
        style={strong ? styles.fareValueStrong : styles.fareValue}
      >
        {value}
      </AppText>
    </View>
  );
}

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
  const { data: orders, isLoading, error, refetch, dataUpdatedAt } = useActiveOrders();
  const isNetworkOnline = useConnectionStore((s) => s.isNetworkOnline);

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
  /**
   * Какому заказу принадлежит счётчик пробега.
   *
   * ТОЛЬКО `in_progress`: подача не оплачивается, и мотать на неё метры
   * значило бы брать с клиента за дорогу к нему. Берётся из ВСЕГО списка
   * активных заказов, а не из открытого: водитель может смотреть карточку
   * встречного заказа, продолжая везти первого, — счётчик обязан идти по
   * тому, кто в машине.
   */
  const meteredOrderId = useMemo(
    () => orders?.find((o) => o.status === 'in_progress')?.id ?? null,
    [orders],
  );
  useEffect(() => {
    void setMeterOrder(meteredOrderId);
  }, [meteredOrderId]);

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
  /**
   * Высота шапки шторки — ИЗМЕРЕННАЯ, а не посчитанная.
   *
   * Шапка переменной высоты: примечание диспетчера к адресу есть не у
   * каждого заказа, а чип подъезда то встаёт в строку с адресом, то
   * переносится под него. Константа тут либо режет примечание молча, либо
   * всегда держит место под то, чего нет. 0 — ещё не мерили.
   */
  const [headerHeight, setHeaderHeight] = useState(0);
  /** Идёт отказ от заказа — гасим кнопку, чтобы не нажали дважды. */
  const [releasing, setReleasing] = useState(false);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const notify = useNotify();

  /**
   * «Сейчас» с точностью до секунды — чтобы таймер ожидания шёл ровно.
   *
   * Само ожидание считает СЕРВЕР, и его ответ приходит раз в десять секунд:
   * показанный прямо из ответа таймер стоял бы по десять секунд и прыгал
   * через десять. Здесь только дорисовывается прошедшее с момента ответа
   * (`liveWaitingSec`), а число, от которого идёт отсчёт, всегда серверное.
   *
   * До 1.5.48 таймер считался целиком на телефоне от нуля и только в статусе
   * `driver_arrived`: он начинался заново при каждом возвращении на экран, а
   * ожидание, включённое в поездке, не показывалось вовсе.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());

  /**
   * Что показать после завершения заказа.
   *
   * Держится отдельным состоянием, а не выводится из заказа: завершённого
   * заказа в ответе сервера уже нет, он исчезает из списка активных в тот
   * же момент.
   */
  const [completed, setCompleted] = useState<{ price: number | null } | null>(null);
  /** Идёт отметка промежуточной точки — блокирует главную кнопку. */
  const [markingStop, setMarkingStop] = useState(false);
  /** Идёт переключение ожидания. */
  const [switchingWaiting, setSwitchingWaiting] = useState(false);
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

  /**
   * Тикаем, когда на экране есть что отсчитывать: идёт ожидание либо
   * водитель едет на подачу с обещанным временем.
   *
   * ДО 1.5.53 УСЛОВИЕ БЫЛО ТОЛЬКО ПРО ОЖИДАНИЕ — и обратный отсчёт подачи,
   * появившийся в этой же версии, ЗАМЕРЗАЛ: `nowMs` оставался таким, каким
   * был при открытии экрана. Проверено на эмуляторе: чип показывал «Подача
   * 14 мин», когда до срока оставалось одиннадцать, и не менялся полторы
   * минуты. Врал он при этом в опасную сторону — водитель считал, что
   * времени больше, чем есть.
   *
   * Частота разная: ожиданию нужна секунда (там на экране бегут секунды),
   * отсчёту подачи — десять, он показывает минуты. Лишние девять
   * перерисовок в секунду на экране с картой не бесплатны.
   */
  const waitingRunning = order?.meter?.waitingOn ?? false;
  const pickupCountdownRunning =
    order?.status === 'assigned' &&
    Boolean(order?.pickupEtaConfirmedAt) &&
    (order?.pickupEtaMin ?? 0) > 0;

  useEffect(() => {
    if (!waitingRunning && !pickupCountdownRunning) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), waitingRunning ? 1000 : 10_000);
    return () => clearInterval(id);
  }, [waitingRunning, pickupCountdownRunning]);

  /**
   * Последний известный список активных заказов — для момента после
   * завершения. Читать `orders` прямо в таймере нельзя: он замкнулся бы на
   * значение, каким оно было при запуске отсчёта, а именно в эти секунды
   * список и обновляется — завершённый заказ из него уходит.
   */
  const ordersRef = useRef<CurrentOrder[] | undefined>(undefined);
  ordersRef.current = orders;

  /**
   * Уйти с карточки «Заказ завершён» — ПО НАЖАТИЮ, а не по таймеру.
   *
   * До 1.5.49 отсюда уводил обратный отсчёт в 5 секунд: водителя не
   * спрашивали. Пять секунд — это ровно столько, чтобы не успеть прочитать
   * сумму, а если в этот момент говоришь с клиентом — экран уезжает сам, и
   * вернуться к нему уже нельзя: завершённого заказа в ответе сервера нет.
   *
   * 1.5.23: остался встречный заказ — открываем ЕГО, а не список свободных.
   * Водитель со вторым заказом в работе, выброшенный на экран свободных
   * заказов, ищет своего клиента вручную, пока тот сидит в машине.
   */
  const handleCompletedDone = useCallback(() => {
    setCompleted(null);
    const remaining = ordersRef.current ?? [];
    if (remaining.length > 0 && remaining[0]) {
      setSelectedId(remaining[0].id);
    } else {
      router.replace('/(main)/(tabs)/orders');
    }
  }, [router]);

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

  /**
   * Отметить промежуточную точку пройденной.
   *
   * Отдельно от `handlePrimaryAction`, потому что это не смена статуса
   * заказа: заказ остаётся в пути, меняется только его маршрут по точкам.
   */
  const handleStopReached = useCallback(
    async (stopId: string, label: string) => {
      if (!order) return;
      haptics.tap();
      const ok = await confirm({
        title: `${label}?`,
        message: 'Отметить точку пройденной и ехать дальше',
        confirmLabel: 'Проехали',
      });
      if (!ok) return;

      setMarkingStop(true);
      try {
        haptics.confirm();
        await arriveStop(order.id, stopId);
        await queryClient.invalidateQueries({ queryKey: activeOrdersQueryKey });
      } catch (err) {
        driverLogger.error('arriveStop failed', {
          screen: 'current',
          action: 'order_stop_arrive_error',
          orderId: order.id,
          message: err instanceof Error ? err.message : String(err),
        });
        await notify('Не удалось отметить точку', 'Проверьте связь и попробуйте ещё раз.');
      } finally {
        setMarkingStop(false);
      }
    },
    [order, confirm, notify, queryClient],
  );

  /**
   * Включить или выключить платное ожидание.
   *
   * Без подтверждения: это переключатель, а не необратимое действие —
   * нажал не туда, нажми ещё раз. Диалог на каждую остановку у аптеки был
   * бы издевательством.
   */
  const handleToggleWaiting = useCallback(async () => {
    if (!order) return;
    const on = !order.meter?.waitingOn;
    setSwitchingWaiting(true);
    try {
      haptics.tap();
      await setWaiting(order.id, on);
      await queryClient.invalidateQueries({ queryKey: activeOrdersQueryKey });
    } catch (err) {
      driverLogger.error('setWaiting failed', {
        screen: 'current',
        action: 'order_waiting_error',
        orderId: order.id,
        message: err instanceof Error ? err.message : String(err),
      });
      await notify('Не удалось переключить ожидание', 'Проверьте связь и попробуйте ещё раз.');
    } finally {
      setSwitchingWaiting(false);
    }
  }, [order, notify, queryClient]);

  /** Одно подтверждение на все три действия — текст берётся по статусу. */
  const handlePrimaryAction = useCallback(() => {
    if (!order) return;

    // Пока впереди есть непройденная точка, главная кнопка ведёт к ней.
    // Завершение заказа на середине маршрута — самая дорогая ошибка на этом
    // экране: вернуть заказ в работу водитель уже не сможет.
    const pending = nextPendingStop(order.stops, order.status);
    if (pending) {
      void handleStopReached(pending.id, stopActionLabel(pending));
      return;
    }

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
        /**
         * Последние метры досылаются ДО завершения и именно с ожиданием.
         *
         * Сервер считает итог по показаниям, которые у него есть на момент
         * завершения. Пусти оба запроса наперегонки — и на медленной связи
         * завершение обгонит показания, а последние метры поездки просто не
         * попадут в чек. `finishMeter` не бросает: не ушло — сервер посчитает
         * по тому, что успел получить, но шанс мы дали.
         */
        void finishMeter(order.id).then(() =>
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
  }, [order, arrive, start, complete, runOrderAction, confirm, handleStopReached]);

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

  // Раньше загрузки: без сети запрос стоит на паузе, и «крутилка» врала бы
  // про идущую загрузку, которой нет.
  if (!isNetworkOnline && !order) {
    return (
      <Screen>
        <OfflineState what="Заказы" />
      </Screen>
    );
  }

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

  // Показывается ПОСЛЕ завершения и висит, пока водитель не нажмёт кнопку.
  // Стоит выше проверки `!order` намеренно: завершённого заказа в данных
  // уже нет, и без этого водитель увидел бы «Нет активного заказа».
  if (completed) {
    return (
      <Screen style={styles.centered}>
        <CompletedCard
          price={completed.price}
          onDone={handleCompletedDone}
          nextOrderNumber={ordersRef.current?.[0]?.orderNumber ?? null}
        />
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
  /**
   * Кегль адреса — и подъезда рядом с ним.
   *
   * Длинный адрес («проспект Красноярский рабочий, 150») крупным шрифтом в
   * две строки не помещается, поэтому на шаг мельче. Подъезд берёт тот же
   * кегль: он часть адресной строки, а не подпись к ней.
   *
   * Подъезд входит в РАСЧЁТ длины (1.5.33): он делит с адресом одну строку,
   * и без учёта его «под. 12» адрес выбирал бы крупный шрифт, а потом всё
   * равно переносился. Считаем в символах, как и раньше: «под. » — пять,
   * плюс сам номер, плюс пробел-разделитель.
   */
  const lineChars =
    targetAddress.length + (target.entrance ? target.entrance.length + 6 : 0);
  const addressVariant = lineChars > LONG_ADDRESS_CHARS ? 'heading' : 'title';
  const action = ACTION_BY_STATUS[order.status];

  /**
   * Счётчик показываем только пока есть что считать.
   *
   * На подаче он тоже идёт (там уже тикает ожидание), но показывать деньги
   * до посадки клиента незачем: водителю в этот момент нужен адрес, а не
   * сумма.
   */
  const meter =
    order.status === 'in_progress' && order.meter ? order.meter : null;

  /**
   * Сколько из итога приходится на саму поездку — всё, что не ожидание.
   *
   * Правило вынесено в `@/lib/trip-receipt`: там оно под тестами, потому что
   * держит СХОДИМОСТЬ чека, а она не выводится из типов и не падает при
   * нарушении — строки просто перестают давать итог на глазах у клиента.
   *
   * Правила «деньги считает сервер» это не нарушает: обе величины пришли ОТ
   * НЕГО, здесь только раскладка уже посчитанного.
   */
  const rideCost = meter ? rideCostOf(meter.total, meter.waitingCost) : 0;

  /**
   * Счётчик для ШАПКИ — начиная с подачи, а не с посадки.
   *
   * На подаче уже идёт платное ожидание, и именно там водителю нужен ответ
   * на «сколько ещё бесплатно». Развёрнутая карточка ниже остаётся про
   * поездку: до посадки в ней нечего расшифровывать, кроме ожидания.
   */
  const headerMeter =
    (order.status === 'driver_arrived' || order.status === 'in_progress') && order.meter
      ? order.meter
      : null;

  /**
   * Обратный отсчёт до времени подачи, которое водитель назвал сам.
   *
   * ТОЛЬКО НА ПОДАЧЕ. После «Я на месте» обещание исполнено — дальше
   * считать нечего, а чип занимал бы место, нужное счётчику поездки.
   *
   * `nowMs` тикает раз в секунду для ожидания — отсчёт живёт на нём же,
   * второй таймер здесь был бы лишним.
   */
  const pickupEta =
    order.status === 'assigned'
      ? pickupEtaState(order.pickupEtaConfirmedAt, order.pickupEtaMin, new Date(nowMs))
      : null;

  /** Что сказать про ожидание одной строкой. `null` — говорить нечего. */
  const hint = headerMeter
    ? waitingHint({
        waitingSec: liveWaitingSec(
          headerMeter.waitingSec,
          headerMeter.waitingOn,
          nowMs - dataUpdatedAt,
        ),
        waitingOn: headerMeter.waitingOn,
        freeSec: headerMeter.waitingFreeSec,
        perMinute: headerMeter.waitingPerMinute,
        cost: headerMeter.waitingCost,
      })
    : null;

  /**
   * Непройденная промежуточная точка. Пока она есть, главная кнопка ведёт
   * к ней, а не к завершению поездки: правило в `@/lib/order-stop-progress`.
   */
  const pendingStop = nextPendingStop(order.stops, order.status);

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
  /**
   * Отказаться можно только до посадки — дальше это дело диспетчера.
   *
   * 1.5.49: у ЛЮБОГО заказа, а не только у встречного. Сервер разрешал это
   * с v1.99.78 (`order-release.ts`), но приложение показывало кнопку лишь
   * при `waitsForCurrent` — то есть отказаться от обычного заказа было
   * нечем. Водитель, которому заказ не подходит (сломалась машина, ошибся
   * при взятии, клиент не выходит), звонил диспетчеру.
   */
  const canRelease = order.status === 'assigned' || order.status === 'driver_arrived';

  // Нет кнопки — нет и полосы под неё: иначе шторка висела бы над пустой
  // полосой в 88. У ждущего заказа полоса выше на строку объяснения.
  const actionBarHeight = waitsForCurrent
    ? ACTION_BAR_HEIGHT + WAIT_NOTE_HEIGHT
    : action
      ? ACTION_BAR_HEIGHT
      : 0;
  const collapsedHeight = headerHeight > 0 ? SHEET_CHROME + headerHeight : SHEET_COLLAPSED;
  const canShowMap = mapAvailable && order.pickupLat != null && order.pickupLng != null;

  const routePoints: RoutePoint[] = buildRoutePoints(order, shortAddresses, openNavigator);

  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      {canShowMap ? (
        <MapErrorBoundary
          orderId={order.id}
          fallback={<MapFallback text="Карта не открылась. Адреса и кнопки ниже работают." />}
        >
          <OrderMap order={order} fill bottomInset={collapsedHeight + actionBarHeight} />
        </MapErrorBoundary>
      ) : (
        <MapFallback
          text={mapAvailable ? 'Координаты не указаны' : EMBEDDED_MAP_UNAVAILABLE_HINT}
        />
      )}

      {/* Плавающая строка над картой: заказ (или переключатель) и таймер */}
      <View style={styles.floatingTop} pointerEvents="box-none">
        {/**
         * Переключатель заказов — только когда переключать есть на что.
         *
         * 1.5.27: переехал сюда из шапки шторки, где занимал целую строку.
         * 1.5.31: НОМЕРА УБРАНЫ. `orderNumber` — автоинкремент, до десяти
         * знаков; «Текущий · № 1048576» рядом со вторым таким же не
         * помещается на 360 точках. Номер нужен только чтобы назвать заказ
         * диспетчеру, и живёт теперь в «Деталях» — там, где его читают, а
         * не там, где на него смотрят каждую секунду.
         *
         * Одиночный чип с номером убран совсем: он не сообщал ничего —
         * водитель и так знает, что заказ у него один, — а строку над
         * картой занимал.
         */}
        {orders && orders.length > 1
          ? orders.map((item, index) => {
              const active = item.id === order.id;
              const title = index === 0 ? 'Текущий' : 'Встречный';
              return (
                <ScalePress
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
                  accessibilityLabel={`${title}: заказ № ${item.orderNumber}`}
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
                      {title}
                    </AppText>
                  </Surface>
                </ScalePress>
              );
            })
          : null}

        {/**
         * ИТОГО поверх карты — единственное место, где сумма видна, не
         * трогая шторку.
         *
         * ЗАЧЕМ СЮДА, А НЕ В ШАПКУ ШТОРКИ (как было в 1.5.47). Когда шторка
         * развёрнута, шапка уезжает вместе с ней, и сумма пропадает ровно
         * тогда, когда водитель читает расшифровку. Плашка же остаётся: от
         * карты при развёрнутой шторке нарочно оставлена полоска сверху
         * (56 pt, 1.5.25), и плашка живёт в ней. Одно место на оба
         * состояния — и дублирования больше нет: до 1.5.48 время ожидания
         * показывал чип на карте, а деньги за то же ожидание — строка в
         * шторке.
         *
         * НЕ НА ПОДАЧЕ: пока водитель едет к клиенту, счётчик не идёт, и
         * показывать нечего. Плашка появляется на месте, вместе с
         * ожиданием, и дальше живёт всю поездку.
         *
         * Чип ожидания — только пока оно ИДЁТ. В поездке его включают редко
         * («подождите, я в аптеку»), и держать под него постоянный чип
         * значило бы платить местом за событие, которого обычно нет.
         * Накопленное за ожидание при этом не теряется: оно в сумме, а
         * разбор — в развёрнутой шторке.
         *
         * ПРИ РАЗВЁРНУТОЙ ШТОРКЕ ЧИП ОСТАЁТСЯ. Сначала он там скрывался — из
         * опасения, что не поместится в полоску карты. Опасение оказалось
         * напрасным: чипы стоят В ОДНУ СТРОКУ, а строка в 56 pt помещается
         * целиком. Прятать было нечего, и водитель терял таймер ровно там,
         * где разбирается со стоимостью.
         */}
        {/**
         * Отсчёт до подачи — рядом со счётчиком, в той же полоске карты.
         *
         * Цветом, а не текстом: за рулём читают форму и цвет, а не слова.
         * Спокойный — времени с запасом, жёлтый — меньше пяти минут,
         * красный — срок прошёл, и это сказано прямо: клиент всё равно уже
         * ждёт, а молчащий экран мешает водителю решить, звонить ли ему.
         */}
        {pickupEta ? (
          <Surface
            level={2}
            padded={false}
            radius={radius.pill}
            style={[
              styles.floatingChip,
              pickupEta.level === 'late'
                ? { backgroundColor: colors.dangerSoft }
                : pickupEta.level === 'soon'
                  ? { backgroundColor: colors.warningSoft }
                  : null,
            ]}
          >
            <Ionicons
              name={pickupEta.level === 'late' ? 'alert-circle-outline' : 'time-outline'}
              size={iconTokens.xs}
              color={
                pickupEta.level === 'late'
                  ? colors.danger
                  : pickupEta.level === 'soon'
                    ? colors.warning
                    : colors.textSecondary
              }
            />
            <AppText
              variant="labelStrong"
              tone={
                pickupEta.level === 'late'
                  ? 'danger'
                  : pickupEta.level === 'soon'
                    ? 'warning'
                    : 'muted'
              }
            >
              {pickupEta.label}
            </AppText>
          </Surface>
        ) : null}

        {headerMeter ? (
          <Surface level={2} padded={false} radius={radius.pill} style={styles.floatingChip}>
            <AppText variant="overline" tone="muted">
              Итого
            </AppText>
            <AppText style={styles.meterBadgeValue}>
              {formatCurrency(headerMeter.total)}
            </AppText>
          </Surface>
        ) : null}

        {headerMeter && hint ? (
          <Surface
            level={2}
            padded={false}
            radius={radius.pill}
            style={[
              styles.floatingChip,
              hint.paid ? { backgroundColor: colors.warningSoft } : null,
            ]}
          >
            <Ionicons
              name="hourglass-outline"
              size={iconTokens.xs}
              color={hint.paid ? colors.warning : colors.textSecondary}
            />
            <AppText variant="labelStrong" tone={hint.paid ? 'warning' : 'muted'}>
              {hint.text}
            </AppText>
          </Surface>
        ) : null}
      </View>

      <BottomSheet
        collapsedHeight={collapsedHeight}
        expandedHeight={sheetExpandedHeight(containerHeight, actionBarHeight, collapsedHeight)}
        bottomOffset={actionBarHeight}
        header={
          <View
            style={styles.sheetHeader}
            onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
          >
            {/**
             * Полоса этапов и кнопки — В ОДНОЙ строке (1.5.31).
             *
             * Раньше кнопки стояли справа от адреса и съедали его ширину:
             * «Набережная, д. 76» не помещалось в строку и переносилось.
             * Здесь они не стоят ни одной новой строки — полоса всё равно
             * занимает эту, а справа от неё было пусто.
             *
             * Кнопки уменьшены, чтобы четыре подписи этапов не сжались до
             * переноса. Зона нажатия при этом осталась прежней: `IconButton`
             * добирает её невидимым запасом (см. его шапку).
             */}
            <View style={styles.progressRow}>
              <View style={styles.progressBar}>
                <OrderProgress status={order.status} />
              </View>
              <View style={styles.targetActions}>
                <IconButton
                  icon="call"
                  size={HEADER_ACTION_SIZE}
                  onPress={() => void askWhomToCall()}
                  accessibilityLabel="Позвонить"
                  background={colors.successSoft}
                  color={colors.success}
                />
                {target.lat != null && target.lng != null && (
                  <IconButton
                    icon="navigate"
                    size={HEADER_ACTION_SIZE}
                    onPress={() => openNavigator(target.lat!, target.lng!)}
                    accessibilityLabel="Открыть в навигаторе"
                    background={colors.primarySoft}
                    color={colors.primary}
                  />
                )}
              </View>
            </View>

            <View style={styles.targetBlock}>
              {/* Город приписан к подписи этапа, а не отдельной строкой: в
                  шторке каждая строка на счету, а нужен он только в
                  межгороде — сервер и присылает его лишь тогда. Само слово
                  этапа не лишнее: подпись принимает и значение
                  «Остановка», о которой полоса этапов не знает вовсе. */}
              <AppText variant="overline" tone="muted">
                {target.label}
                {order.cityLabel ? ` · ${order.cityLabel}` : ''}
              </AppText>

              {/**
                * Подъезд — ОБЫЧНЫМ ТЕКСТОМ ВНУТРИ адреса (1.5.33).
                *
                * Цветная пилюля рядом с адресом спорила с ним за внимание,
                * хотя главный здесь адрес. Тем же кеглем и шрифтом подъезд
                * читается как продолжение адреса — как его и пишут
                * по-русски. Отличается только насыщенностью и цветом:
                * адрес жирный и белый, подъезд обычный и приглушённый.
                *
                * ВЛОЖЕННЫМ Text, а не соседним элементом в строке с
                * переносом. Соседний элемент Yoga переносит ЦЕЛИКОМ: не
                * хватило трёх точек — и «подъезд 4» занимает отдельную
                * строку, то есть ровно ту, ради экономии которой всё и
                * затевалось (поймано на эмуляторе). Вложенный течёт как
                * обычный текст и переносится по словам.
                *
                * Сокращённо «под. 4» (1.5.34): полное слово занимало почти
                * треть строки и раз за разом не помещалось рядом с адресом.
                * Сокращение общепринятое и согласовано с тем, как экран уже
                * пишет «д. 48» и «пр-т».
                *
                * Три строки, а не две: обрезка съела бы КОНЕЦ, то есть сам
                * подъезд, а терять его нельзя — водитель без него звонит
                * клиенту и спрашивает.
                */}
              {/* Длинный адрес («проспект Красноярский рабочий, 150»)
                  в две строки крупным шрифтом не помещается: сначала
                  сокращаем тип улицы, и только если и этого мало —
                  уменьшаем шрифт на шаг. Обрезать адрес нельзя. */}
              <AppText variant={addressVariant} numberOfLines={3}>
                {targetAddress}
                {target.entrance ? (
                  <AppText variant={addressVariant} weight="500" tone="muted">
                    {'  под. '}
                    {target.entrance}
                  </AppText>
                ) : null}
              </AppText>

              {/**
               * Примечание диспетчера к этому адресу.
               *
               * 1.5.48: 17 пунктов вместо 12 и две строки вместо одной. По
               * замечанию владельца — было слишком мелко. Это и правда не
               * подпись: «ждать у шлагбаума, пропуск на посту» решает,
               * найдёт водитель клиента или будет ему звонить, а набрано
               * оно было втрое незаметнее, чем комментарий к заказу (19 pt)
               * в той же шторке. Место под это освободила ушедшая на карту
               * строка счётчика.
               *
               * Две строки, а не сколько получится: шапка видна в свёрнутом
               * состоянии, и её высота — это отнятая у карты высота.
               */}
              {target.note ? (
                <AppText style={styles.targetNote} tone="warning" numberOfLines={2}>
                  {target.note}
                </AppText>
              ) : null}

              {/**
               * ЗДЕСЬ БЫЛА СТРОКА СЧЁТЧИКА (1.5.47), убрана в 1.5.48.
               *
               * Сумма переехала на плашку поверх карты. Причина — не место,
               * а ДУБЛИРОВАНИЕ: время ожидания показывал чип на карте, а
               * деньги за то же самое ожидание — эта строка. Одно событие в
               * двух местах, и ни в одном целиком.
               *
               * Требование «сумма видна без жеста» плашка выполняет строже,
               * чем шапка: шапка уезжает вместе со шторкой, когда её
               * разворачивают, а плашка остаётся в полоске карты сверху.
               *
               * Освободившееся место отдано примечанию к адресу — оно выше и
               * теперь набрано читаемым кеглем.
               */}
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

          {/* Счётчик. Показывается, пока заказ выполняется и сервер умеет
              его считать (v1.100.2+). Клиент спрашивает «сколько уже
              натикало» посреди поездки, и до 1.5.46 ответить было нечем:
              в карточке стояла только предварительная стоимость.

              СУММУ СЧИТАЕТ СЕРВЕР. Тариф на телефоне подставной, и число,
              посчитанное здесь, разошлось бы с тем, что спишется. Телефон
              меряет метры, деньги приходят обратно. */}
          {meter && (
            <View style={styles.section}>
              <View style={styles.meterHeader}>
                {/**
                 * «Стоимость», а не «Счётчик» (1.5.48).
                 *
                 * Первое: заголовок «СЧЁТЧИК» и первая же строка под ним «На
                 * счётчике» — одно слово дважды подряд, владелец обвёл это
                 * на снимке. Второе: в блоке не только показания счётчика,
                 * но и условия тарифа с предварительной ценой, а «счётчик»
                 * называет механизм там, где водителю нужен ответ на вопрос
                 * «сколько».
                 */}
                <AppText variant="overline" tone="muted">
                  Стоимость
                </AppText>
                {/* «Ожидание…» — ярлык состояния, а не фраза. Многоточие
                    говорит «идёт прямо сейчас» короче, чем это делало слово
                    «идёт», и не спорит с иконкой паузы рядом, которая
                    сообщает ровно то же. Стоит у заголовка, а не внутри
                    карточки: это состояние всего блока. */}
                {meter.waitingOn && (
                  <View style={[styles.waitingChip, { backgroundColor: colors.warningSoft }]}>
                    <Ionicons name="pause" size={12} color={colors.warning} />
                    <AppText variant="caption" tone="warning">
                      Ожидание…
                    </AppText>
                  </View>
                )}
              </View>

              {/**
               * Предварительная цена — НАД чеком и вне его рамки.
               *
               * Внутри чека она стояла последней строкой, под итогом, и в
               * одном столбце с суммами читалась как ещё одно слагаемое.
               * А это не слагаемое: это то, что назвали клиенту при заказе,
               * ориентир, с которым водитель сверяет счёт. Место такому —
               * перед счётом, а не после него.
               */}
              {order.estimatedPrice != null && (
                <AppText variant="caption" tone="muted">
                  Предварительно называли {formatCurrency(order.estimatedPrice)}
                </AppText>
              )}

              {/**
               * ЧЕК, А НЕ СВОДКА (1.5.48).
               *
               * Раньше здесь стояла крупная сумма, а под ней — россыпь
               * подписей: пробег, ожидание, условия, предварительная цена.
               * Сумма при этом уже была на карте, то есть повторялась, а на
               * главный вопрос клиента — «за ЧТО столько?» — блок отвечал
               * набором строк, которые ещё надо было сложить самому.
               *
               * Строки «за что — сколько» отвечают на него сразу, а итог
               * внизу закрывает счёт, как в любом чеке.
               */}
              <Surface level={0} style={styles.meterCard}>
                <FareRow
                  label={`Поездка · ${formatDistance(meter.distanceM / 1000)} · ${formatDuration(
                    Math.round(meter.movingSec / 60),
                  )}`}
                  value={formatCurrency(rideCost)}
                />

                {/**
                 * Где именно ехали — подписью под строкой поездки.
                 *
                 * ЗАЧЕМ. С v1.100.5 сервер считает пробег ПО ЗОНАМ, и за
                 * городом километр стоит в разы дороже. Без этой подписи
                 * водитель видит «120 ₽ за 2.4 км» и объяснить клиенту
                 * ничего не может — то есть показания без разбора хуже, чем
                 * их отсутствие: повод для спора есть, а ответа нет.
                 *
                 * Строка появляется ТОЛЬКО когда есть что сказать: поездка
                 * целиком по городу — обычный случай, и повторять «по
                 * городу 2.4 км» под строкой, где уже написано 2.4 км,
                 * незачем.
                 */}
                {meter.zones &&
                  (meter.zones.settlementKm > 0 || meter.zones.intercityKm > 0) && (
                    <AppText variant="caption" tone="muted">
                      {[
                        meter.zones.cityKm > 0
                          ? `по городу ${formatDistance(meter.zones.cityKm)}`
                          : null,
                        meter.zones.settlementKm > 0
                          ? `по посёлку ${formatDistance(meter.zones.settlementKm)}`
                          : null,
                        meter.zones.intercityKm > 0
                          ? `за городом ${formatDistance(meter.zones.intercityKm)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </AppText>
                  )}

                {/* Ожидание отдельной строкой, а не хвостом к пробегу.
                    Водителю тут важны ТРИ разных числа, и слитые в одну
                    строку они не читаются: сколько всего ждал, сколько из
                    этого платного и на сколько рублей это вышло. Первый
                    вопрос клиента — «за что?», и ответ должен быть готов. */}
                {meter.waitingSec > 0 && (
                  <FareRow
                    label={
                      meter.chargeableWaitingSec > 0
                        ? `Ожидание ${formatWaitClock(meter.waitingSec)} · платно ${formatWaitClock(
                            meter.chargeableWaitingSec,
                          )}`
                        : `Ожидание ${formatWaitClock(meter.waitingSec)} · всё бесплатное`
                    }
                    value={formatCurrency(meter.waitingCost)}
                  />
                )}

                {/* Условия из тарифа. Их водитель не знает наизусть, а
                    объясняться с клиентом ему. */}
                {waitingTermsText(meter.waitingFreeSec, meter.waitingPerMinute) ? (
                  <AppText variant="caption" tone="muted">
                    {waitingTermsText(meter.waitingFreeSec, meter.waitingPerMinute)}
                  </AppText>
                ) : null}

                <Divider />

                <FareRow
                  label="Итого"
                  value={formatCurrency(meter.total)}
                  strong
                />
              </Surface>
            </View>
          )}

          {/* Комментарий диспетчера. Единственное место в карточке, где
              написано то, чего водитель не может узнать больше ниоткуда:
              «звонить не буду, выходите», «дом со двора», «поедет ребёнок».
              До 1.5.46 он был набран обычным текстом карточки и терялся среди
              соседних строк — водители его не замечали. Поэтому здесь и
              размер крупнее рядового текста, и цветная полоса слева, и
              значок: блок обязан читаться боковым зрением, а не находиться
              чтением. */}
          {order.comment ? (
            <Surface
              level={0}
              style={[
                styles.comment,
                { backgroundColor: colors.warningSoft, borderLeftColor: colors.warning },
              ]}
            >
              <View style={styles.commentHeader}>
                <Ionicons name="chatbubble-ellipses" size={16} color={colors.warning} />
                <AppText variant="overline" tone="warning">
                  Комментарий
                </AppText>
              </View>
              <AppText style={styles.commentText}>{order.comment}</AppText>
            </Surface>
          ) : null}



          <View style={styles.section}>
            <AppText variant="overline" tone="muted">
              Детали
            </AppText>
            <Surface level={0} padded={false} style={styles.details}>
              {/* Номер: с 1.5.31 его нет на чипе над картой, а назвать заказ
                  диспетчеру по телефону чем-то надо. */}
              <DetailRow label="Заказ" value={`№ ${order.orderNumber}`} />
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

          {/**
           * ОТКАЗА ЗДЕСЬ БОЛЬШЕ НЕТ (1.5.58) — он переехал в полосу действия,
           * крестиком слева от главной кнопки.
           *
           * С 1.5.49 кнопка стояла в конце шторки, и довод был такой: отказ
           * необратим, заказ уходит другому водителю, промах попадает в
           * рейтинг — значит действие должно требовать жеста и прокрутки, а
           * не лежать под пальцем.
           *
           * Довод оказался наполовину устаревшим: отказ и тогда уже шёл через
           * диалог подтверждения, то есть промах ничего не решал сам по себе.
           * А цена «жеста и прокрутки» — реальная: отказываются чаще всего
           * стоя у подъезда, когда клиент не выходит, и в этот момент водитель
           * разворачивает шторку и листает её до конца одной рукой.
           *
           * Двух входов в одно действие не держим: кнопка отсюда убрана, а не
           * продублирована. Исключение — ждущий встречный заказ ниже: там
           * главной кнопки нет и полоса пустует, отказ занимает её целиком.
           */}
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
              /**
               * Главное действие и ожидание — ОДНОЙ строкой.
               *
               * Ожидание включают в случайный момент («подождите, я в
               * аптеку»), и держать эту кнопку в шторке значило бы дёргать
               * шторку на каждой остановке. Квадрат рядом с главной кнопкой
               * — то же место, куда водитель и так смотрит.
               *
               * ПРОМАХ ЗДЕСЬ БЕЗОПАСЕН В ОБЕ СТОРОНЫ. Ожидание —
               * переключатель: нажал не туда, нажми ещё раз. А у «Завершить
               * поездку» есть подтверждение, поэтому случайное касание не
               * заканчивает заказ, а показывает диалог.
               */
              <View style={styles.actionRow}>
                {/**
                 * Отказ от заказа — крестиком СЛЕВА (1.5.58).
                 *
                 * Отказываются чаще всего стоя у подъезда: клиент не выходит,
                 * не отвечает, передумал. Раньше ради этого надо было
                 * развернуть шторку и пролистать её до конца — одной рукой, с
                 * машиной на ручнике. Теперь действие там же, где остальные.
                 *
                 * Слева, а не справа: справа ожидание, и менять местами
                 * привычные кнопки на ходу опаснее, чем добавить новую с
                 * пустой стороны. Красный цвет и подтверждение отличают его
                 * от главной кнопки — промах показывает диалог, а не
                 * отказывается от заказа.
                 */}
                {canRelease && (
                  <Pressable
                    onPress={handleRelease}
                    disabled={releasing}
                    accessibilityRole="button"
                    accessibilityLabel="Отказаться от заказа"
                    style={({ pressed }) => [
                      styles.barSquare,
                      {
                        backgroundColor: colors.dangerSoft,
                        borderColor: colors.danger,
                        opacity: pressed || releasing ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="close" size={24} color={colors.danger} />
                  </Pressable>
                )}

                {/* Обёртка обязательна: `fullWidth` у кнопки — это
                    `width: '100%'`, и в строке она заняла бы всю ширину,
                    вытолкнув квадраты за край экрана. `flex: 1` отдаёт
                    кнопке остаток строки, а «100 %» считается уже от него. */}
                <View style={styles.actionMain}>
                  <Button
                    onPress={handlePrimaryAction}
                    size="lg"
                    fullWidth
                    // Зелёная — только настоящее завершение. Пока впереди
                    // есть непройденная точка, кнопка ведёт по маршруту, и
                    // цвет «поездка закончена» на ней читался бы как
                    // приглашение завершить заказ на середине.
                    variant={
                      order.status === 'in_progress' && !pendingStop
                        ? 'success'
                        : 'primary'
                    }
                    loading={
                      arrive.isPending ||
                      start.isPending ||
                      complete.isPending ||
                      markingStop
                    }
                  >
                    {pendingStop ? stopActionLabel(pendingStop) : action.label}
                  </Button>
                </View>

                {/**
                 * Кнопка живёт и НА ПОДАЧЕ (исправлено в 1.5.50).
                 *
                 * Раньше она бралась от `meter`, а тот заводится только в
                 * поездке — и на подаче водитель не мог остановить счётчик,
                 * который включился САМ. Случай обычный: приехал раньше
                 * срока и готов подождать бесплатно, или клиент уже вышел, а
                 * посадка задерживается не по его вине. Сервер переключение
                 * на подаче принимал всегда (`/waiting` знает оба статуса) —
                 * не показывалась только кнопка.
                 *
                 * Берём `headerMeter`: он есть с момента «я на месте».
                 */}
                {headerMeter && (
                  <Pressable
                    onPress={handleToggleWaiting}
                    disabled={switchingWaiting}
                    accessibilityRole="button"
                    accessibilityLabel={
                      headerMeter.waitingOn
                        ? 'Закончить ожидание'
                        : 'Начать платное ожидание'
                    }
                    style={({ pressed }) => [
                      styles.barSquare,
                      {
                        backgroundColor: headerMeter.waitingOn
                          ? colors.danger
                          : colors.surfaceSunken,
                        borderColor: headerMeter.waitingOn ? colors.danger : colors.border,
                        opacity: pressed || switchingWaiting ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name={headerMeter.waitingOn ? 'pause' : 'hourglass-outline'}
                      size={24}
                      color={
                        headerMeter.waitingOn ? colors.textInverse : colors.textSecondary
                      }
                    />
                  </Pressable>
                )}
              </View>
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
interface Target {
  label: string;
  address: string;
  entrance: string | null;
  /**
   * Примечание диспетчера К ЭТОМУ адресу (`pickupNote` / `dropoffNote` /
   * `stop.note`). До 1.5.31 его было видно только в развёрнутом маршруте —
   * то есть практически никогда: шторку за рулём не разворачивают, а
   * «ждать у шлагбаума» нужно знать до того, как подъехал.
   */
  note: string | null;
  lat: number | null;
  lng: number | null;
}

function pickTarget(order: CurrentOrder, short: ShortAddresses): Target {
  if (order.status === 'assigned' || order.status === 'driver_arrived') {
    const point = splitAddressEntrance(short.pickup || order.pickupAddress, order.pickupEntrance);
    return {
      label: 'Подача',
      address: point.address,
      entrance: point.entrance,
      note: order.pickupNote,
      lat: order.pickupLat,
      lng: order.pickupLng,
    };
  }

  /**
   * Первая НЕПРОЙДЕННАЯ точка, а не просто первая (исправлено в 1.5.49).
   *
   * Брали `stops[0]` без оглядки на `arrivedAt`, и после отметки «точка
   * пройдена» шапка продолжала показывать адрес, где водитель уже стоит.
   * Кнопка при этом честно менялась на «Завершить поездку» — то есть экран
   * говорил две разные вещи одновременно: «вам сюда» и «поездка окончена».
   *
   * Правило берём ТО ЖЕ, что у кнопки (`nextPendingStop`), а не пишем своё
   * рядом: два правила про одну вещь неизбежно разъезжаются, и разъехались
   * бы снова на первой же правке.
   */
  const pending = nextPendingStop(order.stops, order.status);

  /**
   * Сервер старше приложения: `stops[].id` появился в v1.100.2, а без него
   * `nextPendingStop` вести по точкам не может и возвращает `null`. Тогда
   * ведём себя как до 1.5.46 — целью остаётся первая остановка. Молча
   * перескакивать на конечный адрес нельзя: промежуточная точка исчезла бы
   * с экрана вовсе.
   */
  const stops = order.stops ?? [];
  const legacyStop =
    !pending && stops.length > 0 && stops.every((s) => !s.id && !s.arrivedAt)
      ? { stop: stops[0]!, number: 1 }
      : null;

  const leg = pending ?? legacyStop;
  if (leg) {
    const index = leg.number - 1;
    const point = splitAddressEntrance(
      short.stops[index] ?? leg.stop.address,
      leg.stop.entrance,
    );
    return {
      label: `Точка ${leg.number}`,
      address: point.address,
      entrance: point.entrance,
      note: leg.stop.note,
      lat: leg.stop.lat,
      lng: leg.stop.lng,
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
    note: order.dropoffNote,
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
      entrance: pickup.entrance,
      note: order.pickupNote,
      action: navAction(order.pickupLat, order.pickupLng),
    },
  ];

  (order.stops ?? []).forEach((stop, index) => {
    const point = splitAddressEntrance(short.stops[index] ?? stop.address, stop.entrance);
    points.push({
      kind: 'stop',
      address: shortenStreetType(point.address),
      entrance: point.entrance,
      note: stop.note,
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
      entrance: dropoff.entrance,
      note: order.dropoffNote,
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

/**
 * Экран после завершения: сколько заработано и что дальше.
 *
 * УХОДИМ ПО КНОПКЕ, А НЕ ПО ТАЙМЕРУ (1.5.49). Прежние пять секунд обратного
 * отсчёта не давали ни прочитать сумму, ни назвать её клиенту: экран уезжал
 * сам, а вернуться было некуда — завершённого заказа в ответе сервера нет.
 *
 * ЦЕНА ЭТОГО РЕШЕНИЯ И ЧЕМ ОНА ЗАКРЫТА. Пока водитель стоит здесь, он не
 * видит новых заказов: они приходят обновлением списка на другом экране, а
 * уведомление показывается, только когда приложение в фоне. Стоянка на этой
 * карточке была бы слепой — поэтому карточка сама следит за свободными
 * заказами и говорит, сколько их рядом. Кнопка при этом меняет смысл: если
 * в работе остался встречный заказ, она ведёт к НЕМУ, а не в список.
 */
function CompletedCard({
  price,
  onDone,
  nextOrderNumber,
}: {
  price: number | null;
  onDone: () => void;
  /** Номер оставшегося в работе заказа — тогда кнопка ведёт к нему. */
  nextOrderNumber: number | null;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data: available } = useAvailableOrders();
  const nearby = available?.length ?? 0;

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

      {nextOrderNumber != null ? (
        <AppText variant="label" tone="muted" center>
          В работе остался заказ № {nextOrderNumber}
        </AppText>
      ) : nearby > 0 ? (
        // Живой счётчик: пока водитель читает сумму, рядом появляются
        // заказы, и он должен знать об этом, не уходя с экрана.
        <AppText variant="label" tone="success" center>
          Рядом свободных заказов: {nearby}
        </AppText>
      ) : (
        <AppText variant="label" tone="muted" center>
          Свободных заказов рядом пока нет
        </AppText>
      )}

      <Button
        onPress={onDone}
        size="lg"
        fullWidth
        variant={nextOrderNumber != null ? 'primary' : 'success'}
        style={styles.completedButton}
      >
        {nextOrderNumber != null ? 'К СЛЕДУЮЩЕМУ ЗАКАЗУ' : 'ГОТОВ К ЗАКАЗАМ'}
      </Button>
    </Surface>
  );
}

/**
 * Заглушка на месте карты — одна на все причины, по которым карты нет.
 *
 * Пустое место без единого слова водитель читает как поломку приложения и
 * идёт звонить диспетчеру. Строчка о том, что заказ при этом работает,
 * стоит дешевле звонка.
 */
function MapFallback({ text }: { text: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.mapFallback, { backgroundColor: colors.mapPlaceholder }]}>
      <Ionicons name="map-outline" size={iconTokens.xxl} color={colors.textMuted} />
      <AppText variant="label" tone="muted" center style={styles.mapFallbackText}>
        {text}
      </AppText>
    </View>
  );
}

/**
 * v1.5.5: локальный ErrorBoundary для карты заказа. react-native-maps может
 * упасть на невалидных regions/coords даже несмотря на guard выше (например,
 * если сама тайл-сервисная конфигурация испортилась). Ловим краш здесь,
 * логируем в админку через driverLogger — вместо белого экрана.
 *
 * 1.5.40: ДВЕ правки, обе про то, что бывало после отлова.
 * • Сброс на новом заказе. `hasError` живёт, пока жив экран, а падение
 *   ловится на КОНКРЕТНЫХ координатах — то есть один сломанный заказ
 *   уносил карту насовсем, до перезапуска приложения, включая все
 *   следующие заказы и встречный.
 * • Заглушка вместо `null`. Водитель видел пустоту ровно там, где ждал
 *   карту, и ничего не объясняющую.
 */
interface MapBoundaryProps {
  children: ReactNode;
  orderId: string;
  fallback: ReactNode;
}

class MapErrorBoundary extends Component<MapBoundaryProps, { hasError: boolean }> {
  constructor(props: MapBoundaryProps) {
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

  componentDidUpdate(prev: MapBoundaryProps) {
    if (prev.orderId !== this.props.orderId && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
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

    /**
     * Полоса поверх карты: чипы выбора заказа, «Итого» и ожидание — в один
     * ряд и одной высоты. Прижата к самому верху (4, а не 12) по просьбе
     * владельца: полоса и так съедает у карты высоту, и лишний отступ здесь
     * ничего не даёт.
     *
     * ПЕРЕНОС ОБЯЗАТЕЛЕН. При встречном заказе в ряду стоят четыре чипа, и
     * без `wrap` последний просто уезжает за край — молча, Yoga его не
     * обрежет и не пожалуется.
     *
     * Правый край НЕ до края экрана: там кнопки самой карты («общий план» и
     * «на себя», по 40 pt при отступе 12 — см. `OrderMap`).
     * `MAP_BUTTONS_INSET` держит от них дистанцию.
     */
    floatingTop: {
      position: 'absolute',
      top: spacing.xs,
      left: spacing.lg,
      right: MAP_BUTTONS_INSET,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
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
    // Полоса этапов забирает всю свободную ширину и потому начинается у
    // левого края шторки; кнопки прижаты к правому.
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    progressBar: { flex: 1 },
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
    // Счётчик. Сумма набрана крупно и моноширинно: её называют клиенту
    // вслух, глядя на экран одним взглядом, и цифры не должны прыгать по
    // ширине при каждом изменении.
    // Строка счётчика в ШАПКЕ шторки — её видно, не разворачивая.
    /**
     * Сумма в чипе «Итого».
     *
     * 16 pt при `lineHeight` 19 — том же, что у `labelStrong` в соседних
     * чипах: так чип с деньгами выходит той же высоты, что «Текущий» и
     * «Встречный», и ряд читается как ряд, а не как случайный набор плашек.
     * Соседей эта надпись перевешивает начертанием (800), а не кеглем — это
     * единственное число на карте, и проигрывать ей оно не должно.
     *
     * Табличные цифры — чтобы чип не дёргался по ширине на каждой смене
     * разряда.
     */
    meterBadgeValue: {
      fontSize: 16,
      lineHeight: 19,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },

    // 17 pt: примечание к адресу читают на ходу. Тот же порядок, что у
    // комментария к заказу (19), а не подпись под ним (12).
    targetNote: { fontSize: 17, lineHeight: 22, fontWeight: '500' },

    meterCard: { gap: spacing.xs },
    meterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    /**
     * Строка чека. Подпись тянется, сумма прижата вправо и набрана
     * табличными цифрами — так суммы стоят колонкой и сравниваются взглядом,
     * а не чтением.
     */
    fareRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    fareLabel: { flex: 1 },
    fareValue: { fontVariant: ['tabular-nums'] },
    fareValueStrong: { fontWeight: '800', fontVariant: ['tabular-nums'] },
    waitingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
    },
    // Полоса действия: главная кнопка тянется, ожидание — квадрат по её
    // высоте. Зазор больше обычного: кнопки делают разное, и палец не
    // должен «соскальзывать» с одной на другую.
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    actionMain: { flex: 1 },
    /**
     * Квадрат в полосе действия — один стиль на обе боковые кнопки: отказ
     * слева, ожидание справа. Раздельные стили разъехались бы по высоте, и
     * полоса перестала бы читаться как один ряд.
     */
    barSquare: {
      width: touch.primary,
      height: touch.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.lg,
      borderWidth: 1,
    },

    comment: { gap: spacing.xs, borderLeftWidth: 4 },
    commentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    // 19 против 16 у рядового текста и полужирный: комментарий читают на
    // ходу, одним взглядом, и он не должен выглядеть как ещё одна строка
    // описания заказа.
    commentText: {
      marginTop: spacing.xs,
      fontSize: 19,
      lineHeight: 25,
      fontWeight: '600',
    },

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
    // Отступ сверху больше обычного: кнопка уводит с экрана, и её не
    // должны нажать, целясь в строку про заказы рядом.
    completedButton: { marginTop: spacing.lg },
  });
