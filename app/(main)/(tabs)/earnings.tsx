/**
 * @file: app/(main)/(tabs)/earnings.tsx
 * @description:
 *   Экран заработка водителя: сводка за период (сегодня/неделя/месяц),
 *   общая статистика, список недавних поездок.
 * @dependencies: useEarnings
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEarnings } from '@/hooks/useEarnings';
import { formatCurrency, formatTime } from '@/lib/utils';
import { BalanceCard } from '@/components/earnings/BalanceCard';
import { EarningsChart } from '@/components/earnings/EarningsChart';
import type { RecentOrder } from '@/types/earnings';

type Period = 'today' | 'week' | 'month';

function getDateRange(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);

  let from: Date;
  switch (period) {
    case 'today':
      from = now;
      break;
    case 'week':
      from = new Date(now);
      from.setDate(from.getDate() - 7);
      break;
    case 'month':
      from = new Date(now);
      from.setMonth(from.getMonth() - 1);
      break;
  }
  const dateFrom = from.toISOString().slice(0, 10);
  return { dateFrom, dateTo };
}

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Сегодня',
  week: 'Неделя',
  month: 'Месяц',
};

export default function EarningsScreen() {
  const [period, setPeriod] = useState<Period>('today');
  const { dateFrom, dateTo } = useMemo(() => getDateRange(period), [period]);
  const { data, isLoading, refetch } = useEarnings(dateFrom, dateTo);

  const renderOrder = ({ item }: { item: RecentOrder }) => (
    <View style={styles.orderRow}>
      <View style={styles.orderLeft}>
        <Text style={styles.orderAddress} numberOfLines={1}>
          {item.pickupAddress}
        </Text>
        <Text style={styles.orderMeta}>
          {formatTime(item.completedAt)} · #{item.orderNumber} ·{' '}
          {item.paymentMethod === 'cash'
            ? 'Наличные'
            : item.paymentMethod === 'card'
              ? 'Карта'
              : 'Бонусы'}
        </Text>
      </View>
      <Text style={styles.orderPrice}>
        {formatCurrency(item.finalPrice)}
      </Text>
    </View>
  );

  // Данные для графика (заглушка — 7 дней)
  const chartData = useMemo(() => {
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const now = new Date();
    return days.map((label, i) => ({
      label,
      amount: i <= now.getDay() ? Math.random() * (data?.period.totalEarnings || 1000) / 3 : 0,
    }));
  }, [data?.period.totalEarnings]);

  const ListHeader = () => (
    <>
      {/* Баланс */}
      <BalanceCard
        balance={data?.overall.totalEarnings ?? 0}
        onWithdraw={() => {/* TODO */}}
      />

      {/* Переключатель периода */}
      <View style={styles.periodTabs}>
        {(['today', 'week', 'month'] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodTab, period === p && styles.periodTabActive]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={[
                styles.periodTabText,
                period === p && styles.periodTabTextActive,
              ]}
            >
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Сводка за период */}
      {isLoading && !data ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : data ? (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryAmount}>
              {formatCurrency(data.period.totalEarnings)}
            </Text>
            <Text style={styles.summaryLabel}>
              за {PERIOD_LABELS[period].toLowerCase()}
            </Text>

            <View style={styles.summaryRow}>
              <SummaryItem
                label="Поездок"
                value={String(data.period.tripsCount)}
              />
              <SummaryItem
                label="Средний чек"
                value={formatCurrency(data.period.averagePrice)}
              />
            </View>
          </View>

          {/* График по дням */}
          <EarningsChart data={chartData} title="Заработок по дням" />

          {/* Общая статистика */}
          <View style={styles.overallCard}>
            <Text style={styles.overallTitle}>Общая статистика</Text>
            <View style={styles.overallRow}>
              <OverallItem
                label="Всего поездок"
                value={String(data.overall.totalTrips)}
              />
              <OverallItem
                label="Всего заработано"
                value={formatCurrency(data.overall.totalEarnings)}
              />
              <OverallItem
                label="Рейтинг"
                value={data.overall.rating.toFixed(1)}
              />
            </View>
          </View>

          {/* Заголовок списка */}
          {data.recentOrders.length > 0 && (
            <Text style={styles.recentTitle}>Последние поездки</Text>
          )}
        </>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={data?.recentOrders ?? []}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => void refetch()}
            tintColor="#4f46e5"
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                Нет поездок за этот период
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

/* ─── Вспомогательные компоненты ──────────────────────────────────────── */

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryItemValue}>{value}</Text>
      <Text style={styles.summaryItemLabel}>{label}</Text>
    </View>
  );
}

function OverallItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.overallItem}>
      <Text style={styles.overallItemValue}>{value}</Text>
      <Text style={styles.overallItemLabel}>{label}</Text>
    </View>
  );
}

/* ─── Стили ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  list: {
    padding: 16,
    gap: 12,
  },

  // Period tabs
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    padding: 3,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  periodTabTextActive: {
    color: '#4f46e5',
  },

  // Summary
  summaryCard: {
    backgroundColor: '#4f46e5',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  summaryAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#ffffff',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#c7d2fe',
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 32,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryItemValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  summaryItemLabel: {
    fontSize: 12,
    color: '#c7d2fe',
    marginTop: 2,
  },

  // Overall
  overallCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  overallTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  overallRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overallItem: {
    alignItems: 'center',
    flex: 1,
  },
  overallItemValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  overallItemLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },

  // Recent orders
  recentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  orderRow: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderLeft: {
    flex: 1,
    marginRight: 12,
  },
  orderAddress: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  orderMeta: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  orderPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  // Loading
  loadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 48,
    alignItems: 'center',
  },

  // Empty
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
});
