/**
 * @file: app/(main)/change-address.tsx
 * @description:
 *   Смена адреса в поездке: клиент назвал другую точку (1.5.61, сервер
 *   v1.100.15).
 *
 *   ЗАЧЕМ. Раньше водитель звонил диспетчеру и ждал, пока тот поправит
 *   заказ, — с клиентом в машине. Решение владельца 13.09.2026: водитель
 *   меняет адрес сам, сразу; диспетчеру приходит сообщение «было → стало»;
 *   итоговую цену по-прежнему считает счётчик.
 *
 *   АДРЕСА — КАК В ПУЛЬТЕ. Поиск идёт тем же сервисом, что у диспетчера:
 *   адресная книга службы, разбор подъезда («мира 21 п2»), свой город выше
 *   чужого. Строки для показа и строку, которая ляжет в заказ, собирает
 *   сервер — здесь их только показывают.
 *
 *   МАРШРУТ ПЕРЕСТРАИВАЕТСЯ САМ. Линия на карте заказа привязана к
 *   координатам текущей цели и перерисуется, как только придёт обновлённый
 *   заказ. Внешний навигатор про новую точку не узнает — поэтому после
 *   смены ТЕКУЩЕЙ цели экран предлагает открыть его заново.
 *
 * @dependencies:
 *   - @/api/address.api, @/api/orders.api
 *   - @/lib/route-edit, @/lib/open-navigator
 *   - @/hooks/useKeyboardHeight
 *   - @/components/ui
 * @created: 2026-09-13 (1.5.61)
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { suggestAddresses } from '@/api/address.api';
import { changeOrderAddress } from '@/api/orders.api';
import { activeOrdersQueryKey } from '@/hooks/useCurrentOrder';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { openInNavigator } from '@/lib/open-navigator';
import { parseRoutePointKey } from '@/lib/route-edit';
import { haptics } from '@/lib/haptics';
import { humanApiError, shortenStreetType, splitAddressEntrance } from '@/lib/utils';
import { driverLogger } from '@/services/logger.service';
import { useConnectionStore } from '@/stores/connection.store';
import { useSettingsStore } from '@/stores/settings.store';
import {
  icon as iconTokens,
  radius,
  spacing,
  text,
  touch,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';
import {
  AppText,
  Button,
  EmptyState,
  OfflineState,
  Screen,
  useDialog,
  useNotify,
} from '@/components/ui';
import type { AddressSuggestion } from '@/types/address';

/** С какой длины искать — как в пульте: короче подсказки бессмысленны. */
const MIN_QUERY_LENGTH = 3;

/**
 * Пауза после набора. Чуть длиннее, чем в пульте (200 мс): на мобильной
 * связи каждый лишний запрос заметен, а печатают в машине медленнее.
 */
const SEARCH_DEBOUNCE_MS = 300;

/** Колонка подъезда на сервере — десять символов. */
const ENTRANCE_MAX_LENGTH = 10;

type Params = {
  orderId?: string;
  point?: string;
  label?: string;
  address?: string;
  entrance?: string;
  /** '1' — это точка, куда водитель едет прямо сейчас. */
  current?: string;
};

export default function ChangeAddressScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const askDialog = useDialog();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isNetworkOnline = useConnectionStore((s) => s.isNetworkOnline);
  const preferredNavigator = useSettingsStore((s) => s.preferredNavigator);

  const orderId = params.orderId ?? '';
  const point = parseRoutePointKey(params.point);
  const label = params.label || 'Адрес';
  const isCurrentTarget = params.current === '1';

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<AddressSuggestion | null>(null);
  const [entrance, setEntrance] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const canSearch = debounced.length >= MIN_QUERY_LENGTH;
  /**
   * Два запроса разом, как в пульте: адресная книга службы отвечает сразу,
   * полный ответ (книга + внешний поиск) — когда придёт. Показываем
   * полный, пока его нет — книгу. Ждать внешний поиск ради адреса, который
   * уже лежит в книге, водителю незачем.
   */
  const bookSuggestions = useQuery({
    queryKey: ['address-suggest', 'local', debounced],
    queryFn: () => suggestAddresses(debounced, { localOnly: true }),
    enabled: canSearch && isNetworkOnline,
    staleTime: 60_000,
    retry: 1,
  });
  const suggestions = useQuery({
    queryKey: ['address-suggest', 'full', debounced],
    queryFn: () => suggestAddresses(debounced),
    enabled: canSearch && isNetworkOnline,
    staleTime: 60_000,
    retry: 1,
  });

  const change = useMutation({
    mutationFn: (suggestion: AddressSuggestion) => {
      if (!point) throw new Error('Не выбрана точка маршрута');
      return changeOrderAddress(orderId, {
        point,
        suggestion: {
          name: suggestion.name,
          address: suggestion.address,
          city: suggestion.city,
          region: suggestion.region,
          lat: suggestion.lat,
          lng: suggestion.lng,
        },
        entrance: entrance.trim(),
      });
    },
  });

  const currentAddress = params.address
    ? shortenStreetType(splitAddressEntrance(params.address, params.entrance).address)
    : null;

  const pick = (item: AddressSuggestion) => {
    haptics.tap();
    setPicked(item);
    // Подъезд — как подставил бы пульт; водитель может поправить.
    setEntrance(item.entrance);
  };

  const submit = async () => {
    if (!picked || change.isPending) return;
    haptics.confirm();
    try {
      const result = await change.mutateAsync(picked);
      haptics.success();
      void queryClient.invalidateQueries({ queryKey: activeOrdersQueryKey });
      driverLogger.info('route_address_changed', {
        screen: 'change-address',
        action: 'change_address',
        extra: { orderId, point: params.point, source: picked.source },
      });

      // Навигатор — только для точки, куда едем сейчас: открыть его на
      // дальнюю точку значило бы проехать мимо ближней.
      if (isCurrentTarget) {
        const choice = await askDialog({
          title: 'Адрес изменён',
          message: `${label}: ${picked.title}. Диспетчер получил сообщение.`,
          actions: [{ label: 'Открыть навигатор', icon: 'navigate' }],
          cancelLabel: 'Готово',
        });
        router.back();
        if (choice === 0) openInNavigator(preferredNavigator, result.lat, result.lng);
      } else {
        await notify('Адрес изменён', `${label}: ${picked.title}. Диспетчер получил сообщение.`);
        router.back();
      }
    } catch (error) {
      haptics.reject();
      const message = error instanceof Error ? error.message : '';
      driverLogger.warn('Смена адреса не принята сервером', {
        stack: message,
        screen: 'change-address',
        action: 'change_address',
        extra: { orderId, point: params.point },
      });
      // Отказ по существу («точка уже пройдена», «диспетчер изменил
      // маршрут») — заказ на экране устарел: обновляем его в любом случае.
      void queryClient.invalidateQueries({ queryKey: activeOrdersQueryKey });
      await notify(
        'Адрес не изменён',
        humanApiError(message, 'Сервер не ответил. Проверьте связь и попробуйте ещё раз.'),
      );
    }
  };

  if (!orderId || !point) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ headerShown: true, headerTitle: 'Новый адрес' }} />
        <EmptyState
          icon="alert-circle-outline"
          tone="danger"
          title="Не удалось открыть смену адреса"
          description="Вернитесь к заказу и попробуйте ещё раз"
          action={{ label: 'К заказу', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const bookItems = bookSuggestions.data?.items ?? [];
  const items = suggestions.data?.items ?? bookItems;
  // Внешний поиск ещё идёт, а книга уже ответила пустым — крутим, а не
  // говорим «ничего не нашлось» раньше времени.
  const stillSearching = suggestions.isLoading && bookItems.length === 0;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, headerTitle: `Новый адрес · ${label}` }} />

      {/* Отступ снизу — измеренная клавиатура, а не KeyboardAvoidingView:
          при edge-to-edge тот не срабатывает (см. шапку useKeyboardHeight). */}
      <View style={[styles.flex, { paddingBottom: keyboardHeight }]}>
        <View style={styles.searchBlock}>
          <AppText variant="caption" tone="muted">
            {currentAddress ? `Сейчас: ${currentAddress}` : 'Адрес пока не указан'}
          </AppText>
          <View style={styles.inputRow}>
            <Ionicons name="search" size={iconTokens.sm} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                if (picked) setPicked(null);
              }}
              placeholder="Улица и дом"
              placeholderTextColor={colors.textMuted}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Поиск нового адреса"
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => {
                  setQuery('');
                  setPicked(null);
                }}
                hitSlop={spacing.sm}
                accessibilityRole="button"
                accessibilityLabel="Очистить"
              >
                <Ionicons name="close-circle" size={iconTokens.md} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.flex}>
          {!isNetworkOnline ? (
            <OfflineState what="Поиск адреса" />
          ) : !canSearch ? (
            <EmptyState
              icon="search-outline"
              title="Куда едем?"
              description="Введите улицу и номер дома. Подъезд можно дописать сразу: «мира 21 п2»."
            />
          ) : stillSearching ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : suggestions.error && items.length === 0 ? (
            <EmptyState
              icon="alert-circle-outline"
              tone="danger"
              title="Поиск не ответил"
              description="Проверьте связь и попробуйте ещё раз"
              action={{ label: 'Повторить', onPress: () => void suggestions.refetch() }}
            />
          ) : items.length === 0 ? (
            suggestions.data?.searchUnavailable ? (
              <EmptyState
                icon="cloud-offline-outline"
                tone="warning"
                title="Поиск адреса сейчас не работает"
                description="Позвоните диспетчеру — он сменит адрес из пульта."
              />
            ) : (
              <EmptyState
                icon="location-outline"
                title="Ничего не нашлось"
                description="Проверьте название улицы и номер дома"
              />
            )
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item, index) => `${index}:${item.address}`}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <SuggestionRow
                  item={item}
                  selected={picked === item}
                  onPress={() => pick(item)}
                />
              )}
            />
          )}
        </View>

        {picked ? (
          <View
            style={[
              styles.confirm,
              { paddingBottom: spacing.md + (keyboardHeight > 0 ? 0 : insets.bottom) },
            ]}
          >
            <View style={styles.confirmRow}>
              <View style={styles.flex}>
                <AppText variant="overline" tone="muted">
                  Новый адрес · {label}
                </AppText>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {picked.title}
                </AppText>
              </View>
              <View style={styles.entranceBox}>
                <AppText variant="caption" tone="muted">
                  Подъезд
                </AppText>
                <TextInput
                  style={styles.entranceInput}
                  value={entrance}
                  onChangeText={setEntrance}
                  maxLength={ENTRANCE_MAX_LENGTH}
                  placeholder="—"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Подъезд"
                />
              </View>
            </View>
            <Button
              size="lg"
              fullWidth
              icon="checkmark"
              loading={change.isPending}
              onPress={() => void submit()}
            >
              Сменить адрес
            </Button>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function SuggestionRow({
  item,
  selected,
  onPress,
}: {
  item: AddressSuggestion;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  // Адресная книга службы — отдельным значком: это адреса, которые
  // диспетчер завёл сам, им доверяют больше, чем внешнему поиску.
  const fromBook = item.source === 'local';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, selected ? { backgroundColor: colors.primarySoft } : null]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[item.title, item.secondary, item.subtitle].filter(Boolean).join(', ')}
    >
      <Ionicons
        name={fromBook ? 'bookmark' : 'location-outline'}
        size={iconTokens.md}
        color={selected ? colors.primary : colors.textMuted}
      />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </AppText>
        {item.secondary ? (
          <AppText variant="body" tone="secondary" numberOfLines={1}>
            {item.secondary}
          </AppText>
        ) : null}
        {item.subtitle ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {item.subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    searchBlock: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
      backgroundColor: t.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: touch.min,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radius.lg,
      backgroundColor: t.colors.background,
    },
    input: {
      flex: 1,
      paddingVertical: spacing.sm,
      fontSize: text.body.fontSize,
      color: t.colors.textPrimary,
    },

    listContent: { paddingVertical: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: touch.min + spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },

    confirm: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.md,
      backgroundColor: t.colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
    },
    confirmRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
    entranceBox: { width: 88, gap: 2 },
    entranceInput: {
      minHeight: touch.min,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      fontSize: text.body.fontSize,
      color: t.colors.textPrimary,
      backgroundColor: t.colors.background,
      textAlign: 'center',
    },
  });
