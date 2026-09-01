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
 *   v1.5.17: экран переведён на тему приложения. Раньше он был жёстко
 *   светлым — включённая тёмная тема на него не действовала, и переход из
 *   «Денег» в «Историю» ночью бил по глазам белой вспышкой. Заодно строка
 *   операции доросла до читаемых размеров: подписи были 11-12px.
 *
 * @created: 2026-04-14 00:00:00
 * @updated: 2026-09-01 (v1.5.17 — тема, общие компоненты)
 */

import { useState, useMemo } from 'react';
import { View, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBalanceTransactions } from '@/hooks/useBalanceTransactions';
import { formatCurrency } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import {
  icon as iconTokens,
  radius,
  spacing,
  useTheme,
  useThemedStyles,
  type Theme,
  type ThemeColors,
} from '@/lib/theme';
import { AppText, EmptyState, Gradient, Screen } from '@/components/ui';
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

/**
 * Значок и смысловой цвет каждого типа операции.
 *
 * Цвет назван ролью из палитры, а не константой: до v1.5.17 здесь стояли
 * шесть hex-значений, и в тёмной теме зелёный `#22c55e` на тёмной подложке
 * выглядел ядовитым, а `#8b5cf6` не имел пары нигде в приложении.
 */
const TYPE_ICONS: Record<
  BalanceTransactionType,
  { name: keyof typeof Ionicons.glyphMap; tone: keyof ThemeColors }
> = {
  manual_deposit: { name: 'arrow-down-circle', tone: 'success' },
  manual_withdrawal: { name: 'arrow-up-circle', tone: 'danger' },
  order_deduction: { name: 'car-outline', tone: 'danger' },
  shift_fee: { name: 'time-outline', tone: 'warning' },
  bonus: { name: 'gift-outline', tone: 'info' },
  penalty: { name: 'warning-outline', tone: 'danger' },
  refund: { name: 'return-down-back-outline', tone: 'success' },
};

export default function BalanceHistoryScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
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
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'История операций' }} />

      {/* Шапка с текущим балансом */}
      <Gradient
        colors={
          currentBalance < 0 ? [colors.danger, '#7f1d1d'] : [colors.primary, colors.primaryDark]
        }
        style={styles.balanceHeader}
      >
        <AppText variant="label" style={styles.balanceLabel}>
          {currentBalance < 0 ? 'Задолженность' : 'Текущий баланс'}
        </AppText>
        <AppText variant="display" style={styles.balanceAmount}>
          {formatCurrency(currentBalance)}
        </AppText>
      </Gradient>

      {/* Фильтры по типу */}
      <View style={styles.filtersWrap}>
        <FlatList
          data={FILTER_OPTIONS}
          horizontal
          keyExtractor={(f) => f.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
          renderItem={({ item }) => {
            const active = filter === item.value;
            return (
              <Pressable
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => {
                  haptics.tap();
                  setFilter(item.value);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <AppText
                  variant="label"
                  weight={active ? '700' : '500'}
                  style={{ color: active ? colors.textInverse : colors.textSecondary }}
                >
                  {item.label}
                </AppText>
              </Pressable>
            );
          }}
        />
      </View>

      {/* Список */}
      {isLoading ? (
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
          keyExtractor={(s) => s.title + '-' + s.items.length}
          renderItem={({ item: section }) => (
            <View>
              <AppText variant="overline" tone="muted" style={styles.sectionTitle}>
                {section.title}
              </AppText>
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
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="Операций пока нет"
              description="Здесь появятся комиссии, пополнения и бонусы"
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
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const icon = TYPE_ICONS[tx.type];
  const accent = colors[icon.tone];
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
      {/* Подложка значка — тот же цвет с прозрачностью: в обеих темах
          читается одинаково, в отличие от подмешивания белого. */}
      <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
        <Ionicons name={icon.name} size={iconTokens.lg} color={accent} />
      </View>
      <View style={styles.cardContent}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {tx.description ? (
          <AppText variant="label" tone="secondary" numberOfLines={2}>
            {tx.description}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="muted" style={styles.cardMeta}>
          {time} · Баланс: {formatCurrency(tx.balanceAfter)}
        </AppText>
      </View>
      <AppText variant="subheading" tone={isIncome ? 'success' : 'danger'}>
        {isIncome ? '+' : ''}
        {formatCurrency(tx.amount)}
      </AppText>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const createStyles = (t: Theme) =>
  StyleSheet.create({
    balanceHeader: {
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
    },
    // Поверх градиента текст всегда белый, независимо от темы.
    balanceLabel: { color: 'rgba(255, 255, 255, 0.8)', marginBottom: spacing.xs },
    balanceAmount: { color: '#ffffff' },

    filtersWrap: {
      backgroundColor: t.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    filtersContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    filterPill: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: t.colors.surfaceSunken,
      marginRight: spacing.sm,
    },
    filterPillActive: { backgroundColor: t.colors.primary },

    listContent: { paddingVertical: spacing.sm, flexGrow: 1 },
    sectionTitle: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.surface,
      marginHorizontal: spacing.md,
      marginVertical: 3,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      gap: spacing.md,
      ...(t.isDark ? { borderWidth: 1, borderColor: t.colors.border } : {}),
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 21,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardContent: { flex: 1, gap: 2 },
    cardMeta: { marginTop: 1 },

    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxxl },
    footerLoader: { marginVertical: spacing.lg },
  });
