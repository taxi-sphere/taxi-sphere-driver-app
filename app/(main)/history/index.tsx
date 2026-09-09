/**
 * @file: app/(main)/history/index.tsx
 * @description:
 *   История заказов водителя: что и когда возил, за сколько, сколько
 *   удержала служба.
 *
 *   ЗАЧЕМ ЭКРАН. До 1.5.52 прошлых заказов в приложении не было вовсе.
 *   Водитель не мог ни свериться с расчётом («сколько мне заплатили за
 *   тот дальний?»), ни вспомнить вчерашний адрес, ни увидеть, за что с
 *   него списали: баланс показывал сумму комиссии, но не поездку.
 *
 *   КАРТОЧКА РАСКРЫВАЕТСЯ ЗДЕСЬ ЖЕ, а не ведёт на отдельный экран.
 *   Подробности прошлой поездки — километраж, ожидание, тариф — читают
 *   мельком, между заказами; переход на другой экран ради четырёх строк
 *   стоил бы дороже, чем даёт.
 *
 * @dependencies:
 *   - @/hooks/useOrderHistory
 *   - @/types/history
 *   - @/components/ui
 * @created: 2026-09-09 (1.5.52)
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOrderHistory } from '@/hooks/useOrderHistory';
import { useConnectionStore } from '@/stores/connection.store';
import { formatCurrency, formatDistance, formatDuration, formatTime } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import {
  icon as iconTokens,
  radius,
  spacing,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';
import { AppText, EmptyState, OfflineState, Screen } from '@/components/ui';
import type { HistoryFilter, HistoryOrder } from '@/types/history';

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'completed', label: 'Выполненные' },
  { value: 'canceled', label: 'Отменённые' },
];

export default function OrderHistoryScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const isNetworkOnline = useConnectionStore((s) => s.isNetworkOnline);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useOrderHistory(filter);

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const sections = useMemo(() => groupByDate(items), [items]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'История заказов' }} />

      <View style={styles.filtersWrap}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Pressable
              key={f.value}
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => {
                haptics.tap();
                setFilter(f.value);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <AppText
                variant="label"
                weight={active ? '700' : '500'}
                style={{ color: active ? colors.textInverse : colors.textSecondary }}
              >
                {f.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {!isNetworkOnline && items.length === 0 ? (
        <OfflineState what="История" />
      ) : isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <EmptyState
          icon="alert-circle-outline"
          tone="danger"
          title="Не удалось загрузить"
          description={error instanceof Error ? error.message : 'Попробуйте ещё раз'}
          action={{ label: 'Повторить', onPress: () => void refetch() }}
        />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.title}
          renderItem={({ item: section }) => (
            <View>
              <View style={styles.sectionHeader}>
                <AppText variant="overline" tone="muted">
                  {section.title}
                </AppText>
                {/* Итог дня — только если в нём было что заработать. В дне
                    из одних отмен «0 ₽» ничего не сообщает, а выглядит как
                    смена, отработанная впустую. */}
                {section.total > 0 ? (
                  <AppText variant="overline" tone="muted">
                    {formatCurrency(section.total)}
                  </AppText>
                ) : null}
              </View>
              {section.items.map((order) => (
                <HistoryCard
                  key={order.id}
                  order={order}
                  expanded={openId === order.id}
                  onToggle={() => {
                    haptics.tap();
                    setOpenId((id) => (id === order.id ? null : order.id));
                  }}
                />
              ))}
            </View>
          )}
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isFetchingNextPage}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="time-outline"
              title={filter === 'canceled' ? 'Отменённых заказов нет' : 'Заказов пока нет'}
              description={
                filter === 'canceled'
                  ? 'Здесь появятся заказы, которые не состоялись'
                  : 'Здесь появятся поездки, которые вы выполнили'
              }
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/*  Карточка заказа                                                            */
/* -------------------------------------------------------------------------- */

function HistoryCard({
  order,
  expanded,
  onToggle,
}: {
  order: HistoryOrder;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const canceled = order.status === 'canceled';
  const accent = canceled ? colors.danger : colors.success;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceSunken }]}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`Заказ №${order.orderNumber}`}
      accessibilityState={{ expanded }}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
          <Ionicons
            name={canceled ? 'close-circle-outline' : 'checkmark-circle-outline'}
            size={iconTokens.lg}
            color={accent}
          />
        </View>

        <View style={styles.cardMain}>
          <View style={styles.cardHeadRow}>
            <AppText variant="caption" tone="muted">
              {formatTime(order.finishedAt)} · №{order.orderNumber}
            </AppText>
            <AppText variant="bodyStrong" style={{ color: canceled ? colors.textMuted : colors.textPrimary }}>
              {canceled ? 'Отменён' : formatCurrency(order.price)}
            </AppText>
          </View>

          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <AppText variant="body" numberOfLines={1} style={styles.addressText}>
              {order.pickupAddress}
            </AppText>
          </View>

          {order.dropoffAddress ? (
            <View style={styles.addressRow}>
              <View style={[styles.dot, { backgroundColor: colors.danger }]} />
              <AppText variant="body" numberOfLines={1} style={styles.addressText}>
                {order.dropoffAddress}
              </AppText>
            </View>
          ) : null}

          {order.stopsCount > 0 ? (
            <AppText variant="caption" tone="muted">
              +{order.stopsCount} {pluralStops(order.stopsCount)} по пути
            </AppText>
          ) : null}
        </View>
      </View>

      {expanded ? (
        <View style={styles.details}>
          {canceled && order.cancelReason ? (
            <DetailRow label="Причина отмены" value={order.cancelReason} />
          ) : null}
          {!canceled ? (
            <>
              {/* Пробег и время показываем, только если счётчик их
                  посчитал. Заказ, завершённый диспетчером за водителя,
                  приходит без показаний, и строки «— » и «0 мин» рядом
                  выглядят как поломка, хотя поездка была. */}
              {order.distanceM ? (
                <DetailRow label="Пробег" value={formatDistance(order.distanceM / 1000)} />
              ) : null}
              {order.durationSec ? (
                <DetailRow
                  label="В пути"
                  value={
                    order.durationSec < 60
                      ? 'меньше минуты'
                      : formatDuration(order.durationSec / 60)
                  }
                />
              ) : null}
              {order.waitingSec ? (
                <DetailRow label="Ожидание" value={formatDuration(order.waitingSec / 60)} />
              ) : null}
              {/* Ноль показываем: «удержано 0 ₽» — это ответ, а пропуск
                  строки водитель читает как «неизвестно сколько». */}
              {order.deduction != null ? (
                <DetailRow
                  label="Удержала служба"
                  value={formatCurrency(order.deduction)}
                  tone="danger"
                />
              ) : null}
              {order.deduction != null && order.price != null ? (
                <DetailRow
                  label="Осталось вам"
                  value={formatCurrency(order.price - order.deduction)}
                  tone="success"
                />
              ) : null}
            </>
          ) : null}
          {order.paymentMethod ? (
            <DetailRow label="Оплата" value={PAYMENT_LABELS[order.paymentMethod]} />
          ) : null}
          {order.tariffName ? <DetailRow label="Тариф" value={order.tariffName} /> : null}
          {order.serviceName ? <DetailRow label="Служба" value={order.serviceName} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const PAYMENT_LABELS: Record<'cash' | 'card' | 'bonus', string> = {
  cash: 'Наличные',
  card: 'Карта',
  bonus: 'Бонусы',
};

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger' | 'success';
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color =
    tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.textPrimary;

  return (
    <View style={styles.detailRow}>
      <AppText variant="label" tone="secondary">
        {label}
      </AppText>
      <AppText variant="labelStrong" style={{ color }}>
        {value}
      </AppText>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Группировка по дням                                                        */
/* -------------------------------------------------------------------------- */

interface Section {
  title: string;
  items: HistoryOrder[];
  /** Сколько заработано за день — без отменённых, за них не платят. */
  total: number;
}

function groupByDate(items: HistoryOrder[]): Section[] {
  const map = new Map<string, HistoryOrder[]>();

  for (const order of items) {
    const key = formatDateGroup(order.finishedAt);
    const existing = map.get(key);
    if (existing) existing.push(order);
    else map.set(key, [order]);
  }

  return Array.from(map.entries()).map(([title, group]) => ({
    title,
    items: group,
    total: group.reduce((sum, o) => sum + (o.status === 'completed' ? o.price ?? 0 : 0), 0),
  }));
}

function formatDateGroup(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return 'Сегодня';
  if (sameDay(date, yesterday)) return 'Вчера';
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

function pluralStops(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'точка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'точки';
  return 'точек';
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    filtersWrap: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    filterPill: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: t.colors.surfaceSunken,
    },
    filterPillActive: { backgroundColor: t.colors.primary },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { paddingBottom: spacing.xxxl },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xs,
    },
    card: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    cardTop: { flexDirection: 'row', gap: spacing.md },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardMain: { flex: 1, gap: 2 },
    cardHeadRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dot: { width: 6, height: 6, borderRadius: 3 },
    addressText: { flex: 1 },
    details: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      gap: spacing.xs,
    },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    footerLoader: { marginVertical: spacing.lg },
  });
