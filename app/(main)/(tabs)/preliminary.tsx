/**
 * @file: app/(main)/(tabs)/preliminary.tsx
 * @description:
 *   Вкладка «Предзаказы» — заказы, которые водитель УЖЕ взял на будущее.
 *
 *   ПОЧЕМУ СНОВА ОТДЕЛЬНАЯ ВКЛАДКА. В v1.5.17 её убрали в «Заказы» вторым
 *   режимом, и это была ошибка: в одном переключателе оказались две разные
 *   вещи. «Свободные» — это чужие заказы, которые можно взять; «Предзаказы» —
 *   уже свои. Из-за этого нажатие на свой предзаказ открывало окно «Принять
 *   заказ?» и упиралось в отказ сервера. Вкладка стоит места в нижней полосе
 *   и НЕ стоит ни пикселя на экранах: полоса там в любом случае.
 *
 *   ЧТО ЗДЕСЬ НЕТ. Нет модалки принятия и таймера — принимать нечего, заказ
 *   уже за водителем. Нет расстояния до подачи: когда придёт время ехать,
 *   водитель будет в другой точке города.
 *
 *   ПОДТВЕРЖДЕНИЕ ВИДНО ЗДЕСЬ. Сервер за N минут до подачи просит
 *   подтвердить, что водитель поедет, и ждёт несколько минут. Сокет-событие
 *   может не дойти — приложение было закрыто, телефон спал. Тогда
 *   единственный шанс увидеть требование — этот список.
 *
 * @dependencies: useScheduledOrders, confirmScheduledOrder, OrderCard,
 *                @/components/ui
 * @created: 2026-09-03 (v1.5.24)
 */

import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useScheduledOrders } from '@/hooks/useScheduledOrders';
import { confirmScheduledOrder } from '@/api/orders.api';
import { OrderCard } from '@/components/order/OrderCard';
import {
  AppText,
  Button,
  EmptyState,
  OrderCardSkeleton,
  Screen,
  StaggerItem,
  Surface,
  useNotify,
} from '@/components/ui';
import { spacing, useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import { haptics } from '@/lib/haptics';
import type { AvailableOrder } from '@/types/order';

export default function PreliminaryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useScheduledOrders();
  const orders = data ?? [];

  /** Какой заказ сейчас подтверждаем — чтобы гасить только его кнопку. */
  const [confirming, setConfirming] = useState<string | null>(null);

  /**
   * Заказы, по которым сервер ждёт подтверждения прямо сейчас.
   *
   * Признак приходит с сервера (v1.99.76): запрос отправлен, а ответа ещё
   * нет. На сервере старше поля просто не будет — и блок не появится, что
   * верно: там и подтверждений не бывает.
   */
  const awaiting = orders.filter((o) => o.confirmationRequestedAt && !o.confirmedAt);

  const handleConfirm = useCallback(
    async (order: AvailableOrder) => {
      haptics.tap();
      setConfirming(order.id);
      const result = await confirmScheduledOrder(order.id);
      setConfirming(null);

      if (!result.ok) {
        await notify(
          result.reason === 'expired' ? 'Заказ уже передан' : 'Не удалось подтвердить',
          result.reason === 'expired'
            ? `Предзаказ № ${order.orderNumber} ушёл другому водителю — время на подтверждение вышло.`
            : result.message,
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['orders', 'scheduled'] });
    },
    [notify, queryClient],
  );

  const openDetails = useCallback(
    (order: AvailableOrder) => {
      router.push(`/(main)/order/${order.id}` as never);
    },
    [router],
  );

  return (
    <Screen>
      {/* Требование подтверждения — над списком: это единственное здесь,
          что имеет срок и стоит заказа, если пропустить. */}
      {awaiting.map((order) => (
        <Surface
          key={order.id}
          level={1}
          style={[styles.awaiting, { borderColor: colors.warning }]}
        >
          <AppText variant="labelStrong" tone="warning">
            Подтвердите предзаказ № {order.orderNumber}
          </AppText>
          <AppText variant="caption" tone="secondary" style={styles.awaitingText}>
            {order.pickupAddress}
          </AppText>
          <AppText variant="caption" tone="muted" style={styles.awaitingText}>
            Без подтверждения заказ передадут другому водителю.
          </AppText>
          <Button
            onPress={() => void handleConfirm(order)}
            size="md"
            fullWidth
            loading={confirming === order.id}
            icon="checkmark-circle-outline"
            style={styles.awaitingButton}
          >
            Подтверждаю
          </Button>
        </Surface>
      ))}

      {error ? (
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Не удалось загрузить"
          description="Проверьте связь и попробуйте ещё раз"
          action={{ label: 'Повторить', onPress: () => void refetch() }}
        />
      ) : isLoading && orders.length === 0 ? (
        <View style={styles.list}>
          <OrderCardSkeleton />
          <OrderCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, orders.length === 0 && styles.listEmpty]}
          renderItem={({ item, index }) => (
            <StaggerItem index={index}>
              <OrderCard order={item} onPress={openDetails} scheduled />
            </StaggerItem>
          )}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="time-outline"
              title="Предзаказов нет"
              description="Заказы, назначенные вам на определённое время, появятся здесь"
            />
          }
        />
      )}
    </Screen>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    list: { padding: spacing.lg, gap: spacing.md },
    listEmpty: { flexGrow: 1, justifyContent: 'center' },
    awaiting: {
      margin: spacing.lg,
      marginBottom: 0,
      borderWidth: 1,
      gap: spacing.xs,
      backgroundColor: t.colors.warningSoft,
    },
    awaitingText: { marginTop: 0 },
    awaitingButton: { marginTop: spacing.sm },
  });
