/**
 * @file: app/(main)/payout/index.tsx
 * @description:
 *   Вывод средств: выбор способа, сумма, реквизиты и список заявок.
 *
 *   НОВЫЙ ЭКРАН v1.5.17. Серверная часть (`GET/POST /api/v1/driver/payout`)
 *   была готова давно, но в приложении кнопка «Вывести» на карточке баланса
 *   вызывала пустой `TODO` — вывести деньги из приложения было нельзя
 *   вообще. Для водителя это самый чувствительный сценарий: приложение, из
 *   которого не забрать заработок, доверия не вызывает.
 *
 *   КОМИССИЯ ПОКАЗЫВАЕТСЯ ДО ОТПРАВКИ, а не после. Водитель видит, сколько
 *   спишется и сколько он получит на руки, прежде чем нажать кнопку.
 *
 * @dependencies: usePayout, @/components/ui, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePayoutData, useCreatePayout } from '@/hooks/usePayout';
import { formatCurrency, formatDate } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import {
  icon as iconTokens,
  radius,
  spacing,
  text,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';
import {
  AppText,
  Badge,
  Button,
  Divider,
  EmptyState,
  ScalePress,
  Screen,
  Surface,
 useConfirm, useNotify } from '@/components/ui';
import type { PayoutMethod, PayoutRequest } from '@/api/payout.api';


/** Как называются статусы заявки на языке водителя. */
const STATUS_VIEW: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  pending: { label: 'На рассмотрении', tone: 'warning' },
  approved: { label: 'Одобрена', tone: 'success' },
  paid: { label: 'Выплачена', tone: 'success' },
  rejected: { label: 'Отклонена', tone: 'danger' },
  canceled: { label: 'Отменена', tone: 'neutral' },
};

export default function PayoutScreen() {
  const confirm = useConfirm();
  const notify = useNotify();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { data, isLoading, error, refetch } = usePayoutData();
  const create = useCreatePayout();

  const [methodId, setMethodId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [requisites, setRequisites] = useState('');

  const balance = data?.balance ?? 0;
  // `?? []` в теле компонента создавал новый массив на каждый рендер, и
  // useMemo ниже пересчитывался всегда — то есть не был мемоизацией.
  const methods = useMemo(() => data?.methods ?? [], [data?.methods]);
  const method = useMemo(
    () => methods.find((m) => m.id === methodId) ?? methods[0] ?? null,
    [methods, methodId],
  );

  const amount = Number(amountText.replace(',', '.')) || 0;
  const commission = method ? Math.round(amount * (method.commission / 100) * 100) / 100 : 0;
  const net = Math.max(amount - commission, 0);

  const problem = validate({ amount, balance, method, requisites });

  const submit = async () => {
    if (!method || problem) return;
    haptics.tap();
    const ok = await confirm({
      title: 'Вывести деньги?',
      message: `Списывается ${formatCurrency(amount)}, на руки ${formatCurrency(net)}.`,
      confirmLabel: 'Вывести',
    });
    if (!ok) return;

    create.mutate(
      { payoutMethodId: method.id, amount, requisites: requisites.trim() },
      {
        onSuccess: () => {
          haptics.success();
          setAmountText('');
          setRequisites('');
          void notify('Заявка создана', 'Деньги придут после подтверждения диспетчером.');
        },
        onError: (e: unknown) => {
          haptics.reject();
          void notify('Не получилось', e instanceof Error ? e.message : 'Попробуйте позже');
        },
      },
    );
  };

  if (error) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, headerTitle: 'Вывод средств' }} />
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Не удалось загрузить"
          description="Проверьте связь и попробуйте ещё раз"
          action={{ label: 'Повторить', onPress: () => void refetch() }}
        />
      </Screen>
    );
  }

  if (!isLoading && methods.length === 0) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, headerTitle: 'Вывод средств' }} />
        <EmptyState
          icon="card-outline"
          title="Вывод пока недоступен"
          description="Служба не настроила способы вывода. Обратитесь к диспетчеру."
          action={{ label: 'Назад', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Вывод средств' }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Surface level={1} style={styles.balance}>
            <AppText variant="overline" tone="muted">
              Доступно к выводу
            </AppText>
            <AppText variant="display" tone={balance > 0 ? 'success' : 'muted'}>
              {formatCurrency(balance)}
            </AppText>
          </Surface>

          <View style={styles.section}>
            <AppText variant="overline" tone="muted">
              Способ вывода
            </AppText>
            {methods.map((m) => (
              <MethodRow
                key={m.id}
                method={m}
                selected={method?.id === m.id}
                onSelect={() => {
                  haptics.tap();
                  setMethodId(m.id);
                }}
              />
            ))}
          </View>

          <View style={styles.section}>
            <AppText variant="overline" tone="muted">
              Сумма
            </AppText>
            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="numeric"
              placeholder={method ? `от ${method.minAmount} до ${method.maxAmount}` : '0'}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Сумма вывода"
            />

            {/* Быстрый выбор: чаще всего выводят всё или круглую сумму. */}
            <View style={styles.quickAmounts}>
              {quickAmounts(balance, method).map((value) => (
                <ScalePress
                  key={value}
                  onPress={() => {
                    haptics.tap();
                    setAmountText(String(value));
                  }}
                  accessibilityLabel={`Сумма ${value}`}
                >
                  <View style={styles.quickChip}>
                    <AppText variant="label" weight="700" tone="brand">
                      {formatCurrency(value)}
                    </AppText>
                  </View>
                </ScalePress>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <AppText variant="overline" tone="muted">
              Реквизиты
            </AppText>
            <TextInput
              style={styles.input}
              value={requisites}
              onChangeText={setRequisites}
              placeholder={method?.description ?? 'Номер карты или телефона'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              accessibilityLabel="Реквизиты для вывода"
            />
          </View>

          {amount > 0 && method && (
            <Surface level={0} style={[styles.preview, { backgroundColor: colors.surfaceSunken }]}>
              <PreviewRow label="Списывается" value={formatCurrency(amount)} />
              <PreviewRow
                label={`Комиссия ${method.commission}%`}
                value={`− ${formatCurrency(commission)}`}
              />
              <Divider />
              <PreviewRow label="На руки" value={formatCurrency(net)} strong />
            </Surface>
          )}

          {problem && (
            <View style={styles.problem}>
              <Ionicons name="information-circle-outline" size={iconTokens.sm} color={colors.warning} />
              <AppText variant="label" tone="warning" style={styles.flex}>
                {problem}
              </AppText>
            </View>
          )}

          <Button
            onPress={() => void submit()}
            size="lg"
            fullWidth
            disabled={!!problem || !method}
            loading={create.isPending}
          >
            Вывести деньги
          </Button>

          {(data?.requests?.length ?? 0) > 0 && (
            <View style={styles.section}>
              <AppText variant="overline" tone="muted">
                Мои заявки
              </AppText>
              {data!.requests.map((request) => (
                <RequestRow key={request.id} request={request} />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Что мешает отправить заявку — одной фразой для водителя. */
function validate(params: {
  amount: number;
  balance: number;
  method: PayoutMethod | null;
  requisites: string;
}): string | null {
  const { amount, balance, method, requisites } = params;
  if (!method) return 'Выберите способ вывода';
  if (amount <= 0) return 'Введите сумму';
  if (amount > balance) return `На балансе только ${formatCurrency(balance)}`;
  if (amount < method.minAmount) return `Минимальная сумма — ${formatCurrency(method.minAmount)}`;
  if (method.maxAmount > 0 && amount > method.maxAmount) {
    return `Максимальная сумма — ${formatCurrency(method.maxAmount)}`;
  }
  if (requisites.trim().length < 4) return 'Укажите реквизиты';
  return null;
}

/** Подсказки сумм: весь баланс и пара круглых значений ниже него. */
function quickAmounts(balance: number, method: PayoutMethod | null): number[] {
  if (balance <= 0) return [];
  const min = method?.minAmount ?? 0;
  const candidates = [Math.floor(balance), 5000, 3000, 1000];
  return [...new Set(candidates)]
    .filter((value) => value >= min && value <= balance)
    .slice(0, 4);
}

function MethodRow({
  method,
  selected,
  onSelect,
}: {
  method: PayoutMethod;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <ScalePress onPress={onSelect} accessibilityLabel={method.name}>
      <Surface
        level={1}
        style={[
          styles.method,
          selected && { borderWidth: 2, borderColor: colors.primary },
        ]}
      >
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={iconTokens.md}
          color={selected ? colors.primary : colors.textMuted}
        />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{method.name}</AppText>
          <AppText variant="caption" tone="muted">
            от {formatCurrency(method.minAmount)}
            {method.commission > 0 ? ` · комиссия ${method.commission}%` : ' · без комиссии'}
          </AppText>
        </View>
      </Surface>
    </ScalePress>
  );
}

function PreviewRow({
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
    <View style={styles.previewRow}>
      <AppText variant="body" tone={strong ? 'primary' : 'muted'}>
        {label}
      </AppText>
      <AppText variant={strong ? 'subheading' : 'body'} tone={strong ? 'success' : 'primary'}>
        {value}
      </AppText>
    </View>
  );
}

function RequestRow({ request }: { request: PayoutRequest }) {
  const styles = useThemedStyles(createStyles);
  const view = STATUS_VIEW[request.status] ?? { label: request.status, tone: 'neutral' as const };

  return (
    <Surface level={1} style={styles.request}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{formatCurrency(request.netAmount)}</AppText>
        <AppText variant="caption" tone="muted">
          {request.payoutMethod.name} · {formatDate(request.createdAt)}
        </AppText>
      </View>
      <Badge tone={view.tone}>{view.label}</Badge>
    </Surface>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
    balance: { alignItems: 'center', gap: spacing.xs },
    section: { gap: spacing.sm },
    input: {
      height: 52,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      fontSize: text.subheading.fontSize,
      color: t.colors.textPrimary,
      backgroundColor: t.colors.surface,
    },
    quickAmounts: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    quickChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: t.colors.primarySoft,
    },
    method: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    preview: { gap: spacing.sm },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    problem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    request: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  });
