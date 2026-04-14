/**
 * @file: app/(main)/balance/index.tsx
 * @description:
 *   Экран «История операций» водителя — таймлайн всех изменений
 *   баланса с фильтром по типу и бесконечной прокруткой. Крупная
 *   сумма текущего баланса сверху.
 * @dependencies:
 *   - @tanstack/react-query (через useBalanceTransactions)
 *   - @/types/balance
 *   - expo-router
 * @created: 2026-04-14 00:00:00
 * @updated: 2026-04-14 00:00:00
 */

import { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBalanceTransactions } from '@/hooks/useBalanceTransactions';
import { formatCurrency } from '@/lib/utils';
import type { BalanceTransaction, BalanceTransactionType } from '@/types/balance';

type FilterType = 'all' | BalanceTransactionType;

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'manual_deposit', label: 'Пополнения' },
  { value: 'order_deduction', label: 'Комиссия' },
  { value: 'shift_fee', label: 'Абонплата' },
  { value: 'bonus', label: 'Бонусы' },
  { value: 'penalty', label: 'Штрафы' },
];

const TYPE_LABELS: Record<BalanceTransactionType, string> = {
  manual_deposit: 'Пополнение',
  manual_withdrawal: 'Списание',
  order_deduction: 'Комиссия с заказа',
  shift_fee: 'Абонплата за смену',
  bonus: 'Бонус',
  penalty: 'Штраф',
  refund: 'Возврат',
};

const TYPE_ICONS: Record<
  BalanceTransactionType,
  { name: keyof typeof Ionicons.glyphMap; color: string }
> = {
  manual_deposit: { name: 'arrow-down-circle', color: '#22c55e' },
  manual_withdrawal: { name: 'arrow-up-circle', color: '#ef4444' },
  order_deduction: { name: 'car-outline', color: '#ef4444' },
  shift_fee: { name: 'time-outline', color: '#f59e0b' },
  bonus: { name: 'gift-outline', color: '#8b5cf6' },
  penalty: { name: 'warning-outline', color: '#ef4444' },
  refund: { name: 'return-down-back-outline', color: '#22c55e' },
};

export default function BalanceHistoryScreen() {
  const [filter, setFilter] = useState<FilterType>('all');
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useBalanceTransactions(filter);

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const currentBalance = data?.pages[0]?.currentBalance ?? 0;

  // Группируем транзакции по датам для заголовков («Сегодня», «Вчера», дата)
  const sections = useMemo(() => groupByDate(items), [items]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'История операций',
          headerStyle: { backgroundColor: '#ffffff' },
          headerTintColor: '#111827',
        }}
      />

      {/* Шапка с текущим балансом */}
      <View style={styles.balanceHeader}>
        <Text style={styles.balanceLabel}>Текущий баланс</Text>
        <Text
          style={[
            styles.balanceAmount,
            currentBalance < 0 && styles.balanceAmountNegative,
          ]}
        >
          {formatCurrency(currentBalance)}
        </Text>
      </View>

      {/* Фильтры по типу */}
      <View style={styles.filtersWrap}>
        <FlatList
          data={FILTER_OPTIONS}
          horizontal
          keyExtractor={(f) => f.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterPill,
                filter === item.value && styles.filterPillActive,
              ]}
              onPress={() => setFilter(item.value)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item.value && styles.filterTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Список */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#4f46e5" size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Ошибка загрузки'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => void refetch()}
          >
            <Text style={styles.retryButtonText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.title + '-' + s.items.length}
          renderItem={({ item: section }) => (
            <View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.items.map((tx) => (
                <TransactionCard key={tx.id} tx={tx} />
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
              tintColor="#4f46e5"
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>Операций пока нет</Text>
            </View>
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color="#4f46e5" />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/*  Группировка по дате                                                        */
/* -------------------------------------------------------------------------- */

interface Section {
  title: string;
  items: BalanceTransaction[];
}

function groupByDate(items: BalanceTransaction[]): Section[] {
  const map = new Map<string, BalanceTransaction[]>();

  for (const tx of items) {
    const key = formatDateGroup(tx.createdAt);
    const existing = map.get(key);
    if (existing) existing.push(tx);
    else map.set(key, [tx]);
  }

  return Array.from(map.entries()).map(([title, items]) => ({ title, items }));
}

function formatDateGroup(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return 'Сегодня';
  if (isSameDay(date, yesterday)) return 'Вчера';
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

/* -------------------------------------------------------------------------- */
/*  Карточка транзакции                                                        */
/* -------------------------------------------------------------------------- */

function TransactionCard({ tx }: { tx: BalanceTransaction }) {
  const icon = TYPE_ICONS[tx.type];
  const isIncome = tx.amount > 0;

  const title = (() => {
    if (tx.type === 'order_deduction' && tx.orderNumber != null) {
      return `Комиссия с заказа #${tx.orderNumber}`;
    }
    return TYPE_LABELS[tx.type];
  })();

  const time = new Date(tx.createdAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.card}>
      <View
        style={[styles.iconWrap, { backgroundColor: icon.color + '22' }]}
      >
        <Ionicons name={icon.name} size={22} color={icon.color} />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        {tx.description && (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {tx.description}
          </Text>
        )}
        <Text style={styles.cardMeta}>
          {time} · Баланс: {formatCurrency(tx.balanceAfter)}
        </Text>
      </View>
      <Text
        style={[
          styles.cardAmount,
          isIncome ? styles.amountIncome : styles.amountExpense,
        ]}
      >
        {isIncome ? '+' : ''}
        {formatCurrency(tx.amount)}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  balanceHeader: {
    backgroundColor: '#4f46e5',
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
  },
  balanceAmountNegative: {
    color: '#fecaca',
  },
  filtersWrap: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filtersContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: '#4f46e5',
  },
  filterText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  listContent: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 12,
    marginVertical: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  cardDescription: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    lineHeight: 16,
  },
  cardMeta: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 3,
  },
  cardAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  amountIncome: {
    color: '#22c55e',
  },
  amountExpense: {
    color: '#ef4444',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#9ca3af',
  },
  errorText: {
    color: '#991b1b',
    marginBottom: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
