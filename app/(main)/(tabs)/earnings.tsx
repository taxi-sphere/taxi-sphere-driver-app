/**
 * @file: app/(main)/(tabs)/earnings.tsx
 * @description:
 *   Экран «Деньги»: баланс, заработок за период, график по дням, последние
 *   поездки и вход в историю операций.
 *
 *   ЧТО ИЗМЕНИЛОСЬ В v1.5.17.
 *   • Экран переехал из бокового меню в нижние вкладки. Деньги водитель
 *     смотрит каждую смену — прятать их за гамбургером не за что.
 *   • Баланс теперь настоящий (из профиля). Раньше на карточке под
 *     подписью «Баланс» стояла сумма ВСЕГО заработанного за всё время —
 *     цифра в разы больше той, что можно вывести.
 *   • Кнопка «Вывести» перестала быть заглушкой `TODO`. Вывод средств на
 *     сервере реализован полностью (`/api/v1/driver/payout`), но в
 *     приложении кнопка не делала ничего — водитель физически не мог
 *     забрать деньги из приложения.
 *   • График строится по данным сервера, а не по `Math.random()`.
 *
 * @dependencies: useEarnings, useDriverProfile, @/components/earnings/*,
 *                @/components/ui
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — «Деньги»: настоящий баланс, вывод, реальный график)
 */

import { useState, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEarnings } from '@/hooks/useEarnings';
import { useDriverProfile } from '@/hooks/useDriverProfile';
import { formatCurrency, formatTime } from '@/lib/utils';
import { BalanceCard } from '@/components/earnings/BalanceCard';
import { EarningsChart } from '@/components/earnings/EarningsChart';
import {
  AppText,
  Divider,
  EarningsSkeleton,
  EmptyState,
  ScalePress,
  Screen,
  Segmented,
  Surface,
} from '@/components/ui';
import { icon as iconTokens, spacing, useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import type { RecentOrder } from '@/types/earnings';

type Period = 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Сегодня',
  week: 'Неделя',
  month: 'Месяц',
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bonus: 'Бонусы',
};

/**
 * v1.5.5 fix: раньше отправляли `date.toISOString().slice(0, 10)` →
 * получали HTTP 400 «Некорректный формат даты (ISO 8601)» от Zod-схемы
 * с `.datetime()`. И «Сегодня» брал `from = now` — фильтр по completedAt
 * не покрывал заказы, завершённые в течение сегодняшнего дня раньше момента
 * открытия экрана. Теперь: полный ISO 8601 datetime, `from` привязан к 00:00
 * локального дня, `to` — к 23:59:59.999. Backend v1.99.41 поддерживает
 * оба формата ради обратной совместимости со старой сборкой 1.5.4.
 */
function getDateRange(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date();

  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  switch (period) {
    case 'today':
      break;
    case 'week':
      from.setDate(from.getDate() - 6); // включая сегодня — 7 дней
      break;
    case 'month':
      from.setMonth(from.getMonth() - 1);
      break;
  }
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

export default function EarningsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [period, setPeriod] = useState<Period>('today');
  const { dateFrom, dateTo } = useMemo(() => getDateRange(period), [period]);
  const { data, isLoading, refetch, isRefetching } = useEarnings(dateFrom, dateTo);
  const { data: profile } = useDriverProfile();

  const daily = data?.daily ?? [];

  const header = (
    <View style={styles.header}>
      <BalanceCard
        balance={profile?.balance ?? 0}
        periodEarnings={data?.period.totalEarnings}
        periodLabel={PERIOD_LABELS[period]}
        onWithdraw={() => router.push('/(main)/payout' as never)}
      />

      <Segmented<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: PERIOD_LABELS.today },
          { value: 'week', label: PERIOD_LABELS.week },
          { value: 'month', label: PERIOD_LABELS.month },
        ]}
      />

      <Surface level={1} padded={false} style={styles.stats}>
        <Stat
          label="Заработок"
          value={formatCurrency(data?.period.totalEarnings ?? 0)}
          icon="cash-outline"
          accent={colors.success}
        />
        <Divider vertical size={36} />
        <Stat
          label="Поездок"
          value={String(data?.period.tripsCount ?? 0)}
          icon="car-outline"
          accent={colors.primary}
        />
        <Divider vertical size={36} />
        <Stat
          label="Средний чек"
          value={formatCurrency(data?.period.averagePrice ?? 0)}
          icon="trending-up-outline"
          accent={colors.info}
        />
      </Surface>

      {/* График показывается, только если сервер прислал разбивку по дням.
          Пустое место честнее выдуманных столбцов — см. EarningsChart. */}
      {daily.length > 0 && <EarningsChart data={daily} title={`Заработок · ${PERIOD_LABELS[period].toLowerCase()}`} />}

      <ScalePress
        onPress={() => router.push('/(main)/balance' as never)}
        accessibilityLabel="История операций"
      >
        <Surface level={1} style={styles.historyRow}>
          <Ionicons name="receipt-outline" size={iconTokens.md} color={colors.textSecondary} />
          <AppText variant="body" style={styles.historyLabel}>
            История операций
          </AppText>
          <Ionicons name="chevron-forward" size={iconTokens.sm} color={colors.textMuted} />
        </Surface>
      </ScalePress>

      <AppText variant="overline" tone="muted" style={styles.tripsTitle}>
        Последние поездки
      </AppText>
    </View>
  );

  if (isLoading && !data) {
    return (
      <Screen>
        <View style={styles.loading}>
          <EarningsSkeleton />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={data?.recentOrders ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <TripRow order={item} />}
        ItemSeparatorComponent={() => <Divider />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title="Поездок нет"
            description={`За период «${PERIOD_LABELS[period].toLowerCase()}» завершённых заказов не было`}
            style={styles.empty}
          />
        }
      />
    </Screen>
  );
}

function Stat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={iconTokens.md} color={accent} />
      <AppText variant="bodyStrong" numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

function TripRow({ order }: { order: RecentOrder }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.trip}>
      <View style={styles.tripLeft}>
        <AppText variant="body" numberOfLines={1}>
          {order.pickupAddress}
        </AppText>
        <AppText variant="caption" tone="muted">
          {formatTime(order.completedAt)} · № {order.orderNumber} ·{' '}
          {PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}
        </AppText>
      </View>
      <AppText variant="bodyStrong" tone="success">
        {formatCurrency(order.finalPrice)}
      </AppText>
    </View>
  );
}

const createStyles = (_t: Theme) =>
  StyleSheet.create({
    list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    loading: { padding: spacing.lg },
    header: { gap: spacing.lg, marginBottom: spacing.md },
    stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg },
    stat: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    historyLabel: { flex: 1 },
    tripsTitle: { marginTop: spacing.sm },
    trip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    tripLeft: { flex: 1, gap: 2 },
    empty: { paddingVertical: spacing.xxxl },
  });
