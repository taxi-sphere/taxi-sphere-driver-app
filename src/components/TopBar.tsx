/**
 * @file: src/components/TopBar.tsx
 * @description:
 *   Верхняя панель — единственный элемент, который водитель видит на любом
 *   экране, поэтому именно она задаёт тон всему приложению.
 *
 *   ЧТО ИЗМЕНИЛОСЬ В v1.5.17.
 *   • Статус стал «таблеткой» с точкой и подписью, а не прямоугольной
 *     заливкой во всю ширину: заливка кричала громче кнопки действия на
 *     самом экране и перетягивала внимание на себя.
 *   • Панель больше не ПОДПРЫГИВАЕТ при потере связи. Раньше кнопка статуса
 *     и заглушка «НЕТ СВЯЗИ» были двумя разными ветками разметки, и при
 *     каждом обрыве шапка перестраивалась. Теперь это одно место с разным
 *     содержимым.
 *   • Появился статус `on_order`: он был в типе `DriverStatus`, но шапка
 *     показывала водителя на заказе как «ЗАНЯТ», и нажатие на кнопку в этот
 *     момент отправляло его в «Свободен» прямо посреди поездки.
 *   • Индикатор связи «дышит», пока соединение живо. Статичная точка не
 *     отличима от замёрзшего экрана — а зависший интерфейс водитель обязан
 *     замечать сразу.
 *
 * @dependencies:
 *   - @/hooks/useShiftToggle, useDriverProfile, useLocationTracking
 *   - @/stores/connection.store, chat.store, news.store
 *   - @/lib/theme, @/components/ui
 * @created: 2026-03-18 07:00:00
 * @updated: 2026-09-13 (1.5.61 — число непрочитанного на кнопке меню, правило статуса в useShiftToggle)
 */

import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useShiftToggle } from '@/hooks/useShiftToggle';
import { useDriverProfile } from '@/hooks/useDriverProfile';
import { useChatStore } from '@/stores/chat.store';
import { useNewsStore } from '@/stores/news.store';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useConnectionStore } from '@/stores/connection.store';
import { formatCurrency } from '@/lib/utils';
import {
  icon as iconTokens,
  radius,
  spacing,
  touch,
  useTheme,
  useThemedStyles,
  type Theme,
  type ThemeColors,
} from '@/lib/theme';
import { spring, timing } from '@/lib/design/motion';
import { AppText, IconButton } from '@/components/ui';
import type { DriverStatus } from '@/types/driver';

interface TopBarProps {
  onMenuPress: () => void;
}

interface StatusView {
  label: string;
  color: keyof ThemeColors;
  background: keyof ThemeColors;
  togglable: boolean;
}

/** Как выглядит каждый статус: подпись, цвет и можно ли его переключить. */
const STATUS_VIEW: Record<DriverStatus, StatusView> = {
  online: { label: 'СВОБОДЕН', color: 'success', background: 'successSoft', togglable: true },
  busy: { label: 'ЗАНЯТ', color: 'warning', background: 'warningSoft', togglable: true },
  // Подпись на заказе собирается отдельно — см. ON_ORDER_VIEW.
  on_order: { label: 'НА ЗАКАЗЕ', color: 'primary', background: 'primarySoft', togglable: true },
  offline: {
    label: 'НЕ НА ЛИНИИ',
    color: 'textMuted',
    background: 'surfaceSunken',
    togglable: true,
  },
};

/**
 * Пилюля во время поездки.
 *
 * ПОЧЕМУ ЗДЕСЬ ДРУГОЕ ПОЛЕ. Слово на кнопке одно и то же — «Свободен» или
 * «Занят», — но на заказе оно означает не смену, а готовность взять
 * встречный, и пишется в `acceptingOrders`, а не в `status`. Писать сюда
 * `status` было бы нельзя: он на заказе значит «везёт клиента», по нему
 * диспетчер видит водителя в пульте, и запись «занят» стёрла бы это.
 *
 * До 1.5.23 готовность переключалась отдельной кнопкой на экране заказа, а
 * пилюля в это время была мёртвой надписью. Два органа управления на одно
 * решение — и оба про «беру я заказы или нет».
 */
const ON_ORDER_VIEW: Record<'accepting' | 'refusing', StatusView> = {
  accepting: {
    label: 'НА ЗАКАЗЕ · СВОБОДЕН',
    color: 'primary',
    background: 'primarySoft',
    togglable: true,
  },
  refusing: {
    label: 'НА ЗАКАЗЕ · ЗАНЯТ',
    color: 'warning',
    background: 'warningSoft',
    togglable: true,
  },
};

export function TopBar({ onMenuPress }: TopBarProps) {
  const router = useRouter();
  // На заказе та же пилюля переключает готовность взять встречный (1.5.23).
  // Правило переключения — общее с кнопкой «Выйти на линию» (1.5.61).
  const shift = useShiftToggle();
  const { isTracking } = useLocationTracking();

  /**
   * Непрочитанное — числом на кнопке меню (1.5.61).
   *
   * Числа у «Диспетчер» и «Объявления» внутри меню были с 1.5.52, но меню
   * закрыто почти всю смену, и увидеть их можно было, только открыв его
   * наугад. Счётчики ведёт `DrawerMenu` — он смонтирован всё время работы
   * приложения, — здесь они только читаются.
   */
  const unread =
    useChatStore((s) => s.unreadCount) + useNewsStore((s) => s.unreadCount);
  const socketStatus = useConnectionStore((s) => s.socketStatus);
  const isConnected = socketStatus === 'connected';

  // Тот же запрос, что был здесь раньше, плюс восстановление статуса
  // водителя при старте — см. useDriverProfile.
  const { data: profile } = useDriverProfile();

  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  /**
   * ВНЕ ЗАКАЗА ПИЛЮЛЯ ТОЖЕ СМОТРИТ НА `acceptingOrders` (1.5.51).
   *
   * У водителя ДВА независимых признака: `status` — состояние смены, и
   * `acceptingOrders` — «предлагайте / не предлагайте». Итог на скриншоте
   * владельца до 1.5.51: шапка пишет «СВОБОДЕН», а список заказов под ней —
   * «Вы отметили себя занятым». Правило, по которому показывать и
   * переключать оба признака, с 1.5.61 живёт в `useShiftToggle`.
   */
  const { onOrder, effectiveStatus, toggle, isBusy } = shift;

  const view = onOrder
    ? ON_ORDER_VIEW[shift.accepting ? 'accepting' : 'refusing']
    : (STATUS_VIEW[effectiveStatus] ?? STATUS_VIEW.offline);
  const canToggle = isConnected && view.togglable && !isBusy;

  const scale = useSharedValue(1);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const statusLabel = !isConnected ? 'НЕТ СВЯЗИ' : isBusy ? 'МЕНЯЮ…' : view.label;
  const statusColor = isConnected ? colors[view.color] : colors.danger;

  return (
    <View style={styles.wrapper}>
      <View style={styles.topRow}>
        <View>
          <IconButton
            icon="menu"
            onPress={onMenuPress}
            accessibilityLabel={
              unread > 0 ? `Открыть меню, непрочитанных: ${unread}` : 'Открыть меню'
            }
            size={touch.min}
            background="transparent"
            color={colors.textSecondary}
          />
          {unread > 0 ? (
            <View
              pointerEvents="none"
              style={[styles.menuBadge, { backgroundColor: colors.danger }]}
            >
              <AppText weight="700" style={[styles.menuBadgeText, { color: colors.textInverse }]}>
                {unread > 99 ? '99+' : unread}
              </AppText>
            </View>
          ) : null}
        </View>

        <Animated.View style={[styles.pillWrap, pillStyle]}>
          <Pressable
            onPress={canToggle ? toggle : undefined}
            disabled={!canToggle}
            onPressIn={() => {
              if (canToggle) scale.value = withSpring(0.97, spring.snappy);
            }}
            onPressOut={() => {
              scale.value = withSpring(1, spring.snappy);
            }}
            accessibilityRole="button"
            accessibilityLabel={
              isConnected ? `Статус: ${view.label.toLowerCase()}` : 'Нет связи с сервером'
            }
            accessibilityHint={
              canToggle
                ? onOrder
                  ? 'Нажмите, чтобы включить или выключить встречные заказы'
                  : 'Нажмите, чтобы переключить статус'
                : undefined
            }
            accessibilityState={{ disabled: !canToggle, busy: isBusy }}
            style={[
              styles.pill,
              { backgroundColor: isConnected ? colors[view.background] : colors.dangerSoft },
            ]}
          >
            <View style={[styles.pillDot, { backgroundColor: statusColor }]} />
            <AppText
              variant="labelStrong"
              style={{ color: statusColor, letterSpacing: 0.4 }}
              numberOfLines={1}
            >
              {statusLabel}
            </AppText>
          </Pressable>
        </Animated.View>

        <View style={styles.indicators}>
          <View style={styles.indicator}>
            <Ionicons
              name={isTracking ? 'navigate' : 'navigate-outline'}
              size={iconTokens.sm}
              color={isTracking ? colors.success : colors.danger}
            />
            <AppText
              variant="caption"
              style={{ color: isTracking ? colors.success : colors.danger, fontWeight: '700' }}
            >
              GPS
            </AppText>
          </View>
          <LiveDot connected={isConnected} />
        </View>
      </View>

      {profile && (
        <View style={styles.statRow}>
          <Pressable
            style={styles.stat}
            onPress={() => router.push('/(main)/balance' as never)}
            accessibilityRole="button"
            accessibilityLabel="Баланс, открыть"
            hitSlop={spacing.sm}
          >
            <Ionicons name="wallet-outline" size={iconTokens.xs} color={colors.textMuted} />
            <AppText variant="label" weight="700">
              {formatCurrency(profile.balance ?? 0)}
            </AppText>
            <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
          </Pressable>

          <View style={styles.statDivider} />

          <View style={styles.stat}>
            <Ionicons name="star" size={iconTokens.xs} color={colors.warning} />
            <AppText variant="label" weight="700">
              {(profile.rating ?? 0).toFixed(1)}
            </AppText>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.stat}>
            <Ionicons name="car-outline" size={iconTokens.xs} color={colors.textMuted} />
            <AppText variant="label" tone="secondary">
              {profile.totalTrips ?? 0}
            </AppText>
          </View>
        </View>
      )}
    </View>
  );
}

/** Длительность одной волны ореола. Медленнее пульса покоя — не суетится. */
const HALO_MS = 1400;

/**
 * Индикатор связи: точка с расходящимся ореолом, пока соединение живо.
 *
 * Движение здесь несёт смысл, а не украшает. Замерший интерфейс внешне
 * неотличим от работающего, и водитель узнавал об обрыве, только когда
 * переставали приходить заказы. Пульс прекращается вместе со связью.
 */
function LiveDot({ connected }: { connected: boolean }) {
  const { colors } = useTheme();
  const halo = useSharedValue(0);

  useEffect(() => {
    if (!connected) {
      halo.value = withTiming(0, timing.fast);
      return;
    }
    halo.value = withRepeat(
      withSequence(withTiming(1, { duration: HALO_MS }), withTiming(0, { duration: 0 })),
      -1,
      false,
    );
  }, [connected, halo]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - halo.value),
    transform: [{ scale: 1 + halo.value * 1.8 }],
  }));

  return (
    <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      {connected && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.success,
            },
            haloStyle,
          ]}
        />
      )}
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: connected ? colors.success : colors.danger,
        }}
      />
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    wrapper: {
      backgroundColor: t.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      gap: spacing.sm,
    },
    pillWrap: { flex: 1 },
    pill: {
      height: 40,
      borderRadius: radius.pill,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    pillDot: { width: 8, height: 8, borderRadius: 4 },
    indicators: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingRight: spacing.xs,
    },
    indicator: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    // Число поверх правого верхнего угла гамбургера. Обводка цветом шапки
    // отделяет его от линий иконки, иначе «2» сливалось с ними.
    menuBadge: {
      position: 'absolute',
      top: 2,
      right: 0,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: t.colors.surface,
    },
    menuBadgeText: { fontSize: 11, lineHeight: 14 },

    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surfaceSunken,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    stat: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    statDivider: { width: 1, height: 14, backgroundColor: t.colors.border },
  });
