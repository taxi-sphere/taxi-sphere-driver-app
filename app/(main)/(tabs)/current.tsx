/**
 * @file: app/(main)/(tabs)/current.tsx
 * @description:
 *   Экран текущего заказа — state machine:
 *   Нет заказа → assigned → driver_arrived → in_progress → completed.
 *   Каждое состояние имеет свои действия и UI.
 *
 *   v1.5.5: (1) guard `pickupLat/Lng` перед `<OrderMap>` — react-native-maps
 *   падал на невалидных координатах (undefined/NaN), краш убивал весь экран
 *   при ручном открытии вкладки. (2) все ошибки логируются через
 *   driverLogger.error — админ может отсмотреть в карточке водителя
 *   (/admin/drivers/[id] → Логи).
 * @dependencies: useCurrentOrder, useOrderActions, useDriverStatus
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-08-26 (v1.5.5 — guard OrderMap + логирование)
 */

import { useState, useEffect, useRef, useCallback, Component, type ReactNode, type ErrorInfo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCurrentOrder } from '@/hooks/useCurrentOrder';
import { useOrderActions } from '@/hooks/useOrderActions';
import { useDriverStatus } from '@/hooks/useDriverStatus';
import { useSettingsStore } from '@/stores/settings.store';
import { driverLogger } from '@/services/logger.service';
import {
  formatCurrency,
  formatDistance,
  formatDuration,
  formatTime,
  formatTimer,
  maskPhone,
} from '@/lib/utils';
import { ORDER_COMPLETE_REDIRECT_MS } from '@/lib/constants';
import type { OrderStatus } from '@/types/order';
import { OrderMap } from '@/components/map/OrderMap';

export default function CurrentOrderScreen() {
  const router = useRouter();
  const { data: order, isLoading, error, refetch } = useCurrentOrder();
  const { status: driverStatus } = useDriverStatus();
  const { arrive, start, complete } = useOrderActions();
  const preferredNavigator = useSettingsStore((s) => s.preferredNavigator);

  // Таймер ожидания клиента (driver_arrived)
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const waitingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Авторедирект после завершения
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
    null,
  );

  // Управление таймером ожидания
  useEffect(() => {
    if (order?.status === 'driver_arrived') {
      setWaitingSeconds(0);
      waitingTimer.current = setInterval(() => {
        setWaitingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (waitingTimer.current) {
        clearInterval(waitingTimer.current);
        waitingTimer.current = null;
      }
    }
    return () => {
      if (waitingTimer.current) clearInterval(waitingTimer.current);
    };
  }, [order?.status]);

  // Авторедирект на вкладку «Заказы» после завершения
  useEffect(() => {
    if (order?.status === 'completed') {
      const seconds = ORDER_COMPLETE_REDIRECT_MS / 1000;
      setRedirectCountdown(seconds);
      const timer = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            router.replace('/(main)/(tabs)/orders');
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
    setRedirectCountdown(null);
  }, [order?.status, router]);

  const openNavigator = useCallback(
    (lat: number, lng: number) => {
      const urls: Record<string, string> = {
        yandex: `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`,
        '2gis': `dgis://2gis.ru/routeSearch/rsType/car/to/${lng},${lat}`,
        google: `google.navigation:q=${lat},${lng}`,
      };
      const url = urls[preferredNavigator] ?? urls.yandex;
      Linking.openURL(url).catch(() => {
        // Фолбэк на Google Maps web
        Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        );
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
  const runOrderAction = (
    action: 'arrive' | 'start' | 'complete',
    orderId: string,
    fn: () => void,
  ) => {
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
      Alert.alert('Ошибка', 'Не удалось выполнить действие. Логи отправлены.');
    }
  };

  const handleArrive = (orderId: string) => {
    Alert.alert('Прибыли?', 'Подтвердите прибытие на точку подачи', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Прибыл',
        onPress: () =>
          runOrderAction('arrive', orderId, () =>
            arrive.mutate(orderId, {
              onError: (err) =>
                void driverLogger.error('arrive.mutate failed', {
                  screen: 'current',
                  action: 'order_arrive_error',
                  orderId,
                  message: err instanceof Error ? err.message : String(err),
                }),
            }),
          ),
      },
    ]);
  };

  const handleStart = (orderId: string) => {
    Alert.alert('Начать поездку?', 'Клиент в машине?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Поехали',
        onPress: () =>
          runOrderAction('start', orderId, () =>
            start.mutate(orderId, {
              onError: (err) =>
                void driverLogger.error('start.mutate failed', {
                  screen: 'current',
                  action: 'order_start_error',
                  orderId,
                  message: err instanceof Error ? err.message : String(err),
                }),
            }),
          ),
      },
    ]);
  };

  const handleComplete = (orderId: string) => {
    Alert.alert('Завершить заказ?', 'Поездка завершена?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Завершить',
        onPress: () =>
          runOrderAction('complete', orderId, () =>
            complete.mutate(
              { orderId },
              {
                onError: (err) =>
                  void driverLogger.error('complete.mutate failed', {
                    screen: 'current',
                    action: 'order_complete_error',
                    orderId,
                    message: err instanceof Error ? err.message : String(err),
                  }),
              },
            ),
          ),
      },
    ]);
  };

  const callClient = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // ─── Рендер состояний ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Ошибка загрузки</Text>
          <Text style={styles.emptySubtitle}>
            {error instanceof Error ? error.message : 'Не удалось загрузить заказ'}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void refetch()}
            activeOpacity={0.7}
          >
            <Text style={styles.retryBtnText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!order || driverStatus !== 'on_order') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Нет активного заказа</Text>
          <Text style={styles.emptySubtitle}>
            Перейдите на вкладку «Заказы» и примите заказ
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Шапка: номер + статус */}
        <View style={styles.header}>
          <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
          <StatusBadge status={order.status} />
        </View>

        {/* Карта заказа — guard от невалидных координат.
            v1.5.5: react-native-maps падает при lat/lng=undefined/NaN,
            что убивало ВЕСЬ экран (пользователь ловил краш при ручном
            открытии вкладки «Текущий заказ»). Теперь рендерим карту
            только когда pickup-координаты валидны — иначе показываем
            плейсхолдер. */}
        {Number.isFinite(order.pickupLat) && Number.isFinite(order.pickupLng) ? (
          <MapErrorBoundary orderId={order.id}>
            <OrderMap order={order} height={180} />
          </MapErrorBoundary>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>
              Координаты подачи не заданы — карта недоступна
            </Text>
          </View>
        )}

        {/* Информация о клиенте */}
        <View style={styles.clientCard}>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>
              {order.clientName ?? 'Пассажир'}
            </Text>
            <Text style={styles.clientPhone}>
              {maskPhone(order.clientPhone)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.callButton}
            onPress={() => callClient(order.clientPhone)}
          >
            <Text style={styles.callButtonText}>Позвонить</Text>
          </TouchableOpacity>
        </View>

        {/* Адреса */}
        <View style={styles.addressesCard}>
          <View style={styles.addressRow}>
            <View style={[styles.dot, styles.dotGreen]} />
            <View style={styles.addressContent}>
              <Text style={styles.addressLabel}>Подача</Text>
              <Text style={styles.addressText}>{order.pickupAddress}</Text>
              {order.pickupEntrance && (
                <Text style={styles.addressNote}>
                  Подъезд: {order.pickupEntrance}
                </Text>
              )}
              {order.pickupNote && (
                <Text style={styles.addressNote}>{order.pickupNote}</Text>
              )}
            </View>
            {order.pickupLat != null &&
              order.pickupLng != null &&
              order.status === 'assigned' && (
                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() =>
                    openNavigator(order.pickupLat!, order.pickupLng!)
                  }
                >
                  <Text style={styles.navButtonText}>Ехать</Text>
                </TouchableOpacity>
              )}
          </View>

          {/* Промежуточные остановки */}
          {(order.stops ?? []).map((stop, idx) => (
            <View key={idx} style={styles.addressRow}>
              <View style={[styles.dot, styles.dotYellow]} />
              <View style={styles.addressContent}>
                <Text style={styles.addressLabel}>Остановка {idx + 1}</Text>
                <Text style={styles.addressText}>{stop.address}</Text>
                {stop.entrance && (
                  <Text style={styles.addressNote}>
                    Подъезд: {stop.entrance}
                  </Text>
                )}
                {stop.note && (
                  <Text style={styles.addressNote}>{stop.note}</Text>
                )}
              </View>
              {stop.lat != null &&
                stop.lng != null &&
                order.status === 'in_progress' && (
                  <TouchableOpacity
                    style={styles.navButton}
                    onPress={() => openNavigator(stop.lat!, stop.lng!)}
                  >
                    <Text style={styles.navButtonText}>Ехать</Text>
                  </TouchableOpacity>
                )}
            </View>
          ))}

          {order.dropoffAddress && (
            <View style={styles.addressRow}>
              <View style={[styles.dot, styles.dotRed]} />
              <View style={styles.addressContent}>
                <Text style={styles.addressLabel}>Высадка</Text>
                <Text style={styles.addressText}>{order.dropoffAddress}</Text>
                {order.dropoffEntrance && (
                  <Text style={styles.addressNote}>
                    Подъезд: {order.dropoffEntrance}
                  </Text>
                )}
                {order.dropoffNote && (
                  <Text style={styles.addressNote}>{order.dropoffNote}</Text>
                )}
              </View>
              {order.dropoffLat != null &&
                order.dropoffLng != null &&
                order.status === 'in_progress' && (
                  <TouchableOpacity
                    style={styles.navButton}
                    onPress={() =>
                      openNavigator(order.dropoffLat!, order.dropoffLng!)
                    }
                  >
                    <Text style={styles.navButtonText}>Ехать</Text>
                  </TouchableOpacity>
                )}
            </View>
          )}
        </View>

        {/* Детали заказа */}
        <View style={styles.detailsCard}>
          <DetailRow label="Стоимость" value={formatCurrency(order.estimatedPrice)} />
          {order.estimatedKm != null && (
            <DetailRow label="Расстояние" value={formatDistance(order.estimatedKm)} />
          )}
          {order.estimatedMin != null && (
            <DetailRow label="Время" value={formatDuration(order.estimatedMin)} />
          )}
          {order.paymentMethod && (
            <DetailRow
              label="Оплата"
              value={
                order.paymentMethod === 'cash'
                  ? 'Наличные'
                  : order.paymentMethod === 'card'
                    ? 'Карта'
                    : 'Бонусы'
              }
            />
          )}
          {order.tariffName && (
            <DetailRow label="Тариф" value={order.tariffName} />
          )}
          {order.serviceName && (
            <DetailRow label="Служба" value={order.serviceName} />
          )}
          {order.assignedAt && (
            <DetailRow label="Назначен" value={formatTime(order.assignedAt)} />
          )}
          {order.startedAt && (
            <DetailRow label="Начат" value={formatTime(order.startedAt)} />
          )}
        </View>

        {/* Комментарий */}
        {order.comment && (
          <View style={styles.commentCard}>
            <Text style={styles.commentLabel}>Комментарий</Text>
            <Text style={styles.commentText}>{order.comment}</Text>
          </View>
        )}

        {/* Таймер ожидания */}
        {order.status === 'driver_arrived' && (
          <View style={styles.waitingCard}>
            <Text style={styles.waitingLabel}>Ожидание клиента</Text>
            <Text style={styles.waitingTimer}>
              {formatTimer(waitingSeconds)}
            </Text>
          </View>
        )}

        {/* Итог завершения */}
        {order.status === 'completed' && (
          <View style={styles.completedCard}>
            <Text style={styles.completedTitle}>Заказ завершён</Text>
            <Text style={styles.completedPrice}>
              {formatCurrency(order.estimatedPrice)}
            </Text>
            {redirectCountdown != null && (
              <Text style={styles.redirectText}>
                Переход к заказам через {redirectCountdown}с
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Кнопки действий */}
      {order.status !== 'completed' && order.status !== 'canceled' && (
        <View style={styles.actionsBar}>
          {order.status === 'assigned' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionArrive]}
              onPress={() => handleArrive(order.id)}
              disabled={arrive.isPending}
            >
              <Text style={styles.actionButtonText}>
                {arrive.isPending ? 'Отправка...' : 'Я НА МЕСТЕ'}
              </Text>
            </TouchableOpacity>
          )}

          {order.status === 'driver_arrived' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionStart]}
              onPress={() => handleStart(order.id)}
              disabled={start.isPending}
            >
              <Text style={styles.actionButtonText}>
                {start.isPending ? 'Отправка...' : 'ПОЕХАЛИ'}
              </Text>
            </TouchableOpacity>
          )}

          {order.status === 'in_progress' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionComplete]}
              onPress={() => handleComplete(order.id)}
              disabled={complete.isPending}
            >
              <Text style={styles.actionButtonText}>
                {complete.isPending ? 'Отправка...' : 'ЗАВЕРШИТЬ'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

/* ─── Вспомогательные компоненты ──────────────────────────────────────── */

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

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void driverLogger.error('OrderMap crash caught by boundary', {
      screen: 'current',
      action: 'order_map_crash',
      orderId: this.props.orderId,
      stack: error?.stack ?? null,
      componentStack: info?.componentStack ?? null,
    });
    void driverLogger.flush();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPlaceholderText}>
            Карту не удалось отобразить. Заказ можно продолжать вести.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    assigned: { label: 'Назначен', bg: '#dbeafe', color: '#2563eb' },
    driver_arrived: { label: 'На месте', bg: '#fef3c7', color: '#d97706' },
    in_progress: { label: 'В пути', bg: '#d1fae5', color: '#059669' },
    completed: { label: 'Завершён', bg: '#f3f4f6', color: '#6b7280' },
    canceled: { label: 'Отменён', bg: '#fee2e2', color: '#dc2626' },
  };
  const c = config[status] ?? config.assigned;

  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

/* ─── Стили ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 100,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Client
  clientCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  clientPhone: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  callButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  callButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Addresses
  addressesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  dotGreen: {
    backgroundColor: '#22c55e',
  },
  dotYellow: {
    backgroundColor: '#f59e0b',
  },
  dotRed: {
    backgroundColor: '#ef4444',
  },
  addressContent: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressText: {
    fontSize: 13,
    color: '#374151',
  },
  addressNote: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  navButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  navButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Details
  detailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },

  // Comment
  commentCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  commentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    color: '#78350f',
  },

  // Waiting timer
  waitingCard: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  waitingLabel: {
    fontSize: 13,
    color: '#c2410c',
    fontWeight: '600',
    marginBottom: 4,
  },
  waitingTimer: {
    fontSize: 36,
    fontWeight: '700',
    color: '#ea580c',
    fontVariant: ['tabular-nums'],
  },

  // Completed
  completedCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 8,
  },
  completedPrice: {
    fontSize: 32,
    fontWeight: '700',
    color: '#15803d',
  },
  redirectText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 12,
  },

  // v1.5.5: плейсхолдер карты (когда координаты не заданы или карта упала)
  mapPlaceholder: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  mapPlaceholderText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },

  // Actions bar
  actionsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  actionButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionArrive: {
    backgroundColor: '#2563eb',
  },
  actionStart: {
    backgroundColor: '#059669',
  },
  actionComplete: {
    backgroundColor: '#dc2626',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});
