/**
 * @file: src/components/earnings/BalanceCard.tsx
 * @description:
 *   Карточка баланса водителя — первое, что он видит на экране «Деньги».
 *
 *   ИСПРАВЛЕНО В v1.5.17: карточка показывала НЕ БАЛАНС. Ей передавали
 *   `overall.totalEarnings` — сумму всего заработанного за всё время — под
 *   подписью «Баланс». Водитель видел на карточке десятки тысяч, а вывести
 *   мог совсем другую сумму. Теперь здесь настоящий баланс из профиля, а
 *   заработок живёт отдельным блоком и так и называется.
 *
 *   Отрицательный баланс (долг по абонплате или комиссии) показывается
 *   явно и другим цветом: раньше он выглядел так же, как положительный, и
 *   отличался только знаком минус, который на градиенте терялся.
 *
 * @dependencies: @/components/ui, @/lib/theme
 * @created: 2026-01-24 12:00:00
 * @updated: 2026-09-01 (v1.5.17 — настоящий баланс, градиент, вывод средств)
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '@/lib/utils';
import { icon as iconTokens, radius, spacing, touch, useTheme } from '@/lib/theme';
import { AppText, Gradient } from '@/components/ui';
import { haptics } from '@/lib/haptics';

interface BalanceCardProps {
  balance: number;
  /** Не задан — кнопка вывода не показывается (вывод недоступен). */
  onWithdraw?: () => void;
  /** Сколько заработано за выбранный период — подпись под балансом. */
  periodEarnings?: number;
  periodLabel?: string;
}

export function BalanceCard({
  balance,
  onWithdraw,
  periodEarnings,
  periodLabel,
}: BalanceCardProps) {
  const { colors } = useTheme();
  const negative = balance < 0;

  // При долге градиент меняется на красный: это не «мало денег», а
  // состояние, из-за которого водителя могут не выпустить на линию.
  const palette: [string, string] = negative
    ? [colors.danger, '#7f1d1d']
    : [colors.primary, colors.primaryDark];

  return (
    <Gradient colors={palette} radius={radius.lg} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={styles.labelRow}>
            <Ionicons
              name={negative ? 'alert-circle' : 'wallet-outline'}
              size={iconTokens.sm}
              color="rgba(255,255,255,0.85)"
            />
            <AppText variant="label" style={styles.label}>
              {negative ? 'Задолженность' : 'Баланс'}
            </AppText>
          </View>

          <AppText variant="display" style={styles.amount}>
            {formatCurrency(balance)}
          </AppText>

          {periodEarnings != null && (
            <AppText variant="label" style={styles.sub}>
              Заработано {periodLabel ? periodLabel.toLowerCase() : 'за период'}:{' '}
              {formatCurrency(periodEarnings)}
            </AppText>
          )}
        </View>
      </View>

      {/* Своя кнопка, а не `Button`: та красит подпись цветом темы, а
          поверх градиента подпись обязана быть белой при любой теме. */}
      {onWithdraw && (
        <Pressable
          onPress={() => {
            haptics.tap();
            onWithdraw();
          }}
          accessibilityRole="button"
          accessibilityLabel="Вывести деньги"
          style={({ pressed }) => [styles.withdraw, pressed && styles.withdrawPressed]}
        >
          <Ionicons name="arrow-up-circle-outline" size={iconTokens.md} color="#ffffff" />
          <AppText variant="bodyStrong" style={styles.amount}>
            Вывести деньги
          </AppText>
        </Pressable>
      )}
    </Gradient>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl, gap: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  left: { flex: 1, gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // Текст поверх градиента — всегда белый, независимо от темы.
  label: { color: 'rgba(255,255,255,0.85)' },
  amount: { color: '#ffffff' },
  sub: { color: 'rgba(255,255,255,0.75)' },
  withdraw: {
    height: touch.min,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  withdrawPressed: { backgroundColor: 'rgba(255,255,255,0.28)' },
});
