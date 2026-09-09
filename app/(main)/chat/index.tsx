/**
 * @file: app/(main)/chat/index.tsx
 * @description:
 *   Переписка водителя с диспетчерской.
 *
 *   ЧЕГО НЕ ХВАТАЛО. Чат существовал только со стороны диспетчера: экран в
 *   админке, таблица в базе и отправка водителю через сокет — всё с марта.
 *   У водителя не было ни экрана, ни эндпоинта: диспетчер писал в пустоту,
 *   ответить было нечем. Единственной связью оставался звонок — в дороге
 *   это худший способ спросить «куда именно подъехать».
 *
 *   СПИСОК ПЕРЕВЁРНУТ (`inverted`). Свежее сообщение внизу, у большого
 *   пальца, и список открывается сразу на нём; подгрузка старых при этом
 *   становится обычным «доскроллил до конца», без ручного удержания
 *   позиции при вставке сверху.
 *
 * @dependencies:
 *   - @/hooks/useDriverChat
 *   - @/components/ui
 * @created: 2026-09-09 (1.5.52)
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDriverChat } from '@/hooks/useDriverChat';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useConnectionStore } from '@/stores/connection.store';
import { haptics } from '@/lib/haptics';
import { formatTime } from '@/lib/utils';
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
import { AppText, EmptyState, OfflineState, Screen, useNotify } from '@/components/ui';
import type { ChatMessage } from '@/types/chat';

/** Тот же предел, что на сервере: разойтись им нельзя. */
const MAX_LENGTH = 2000;

export default function ChatScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const notify = useNotify();
  const isNetworkOnline = useConnectionStore((s) => s.isNetworkOnline);

  const {
    messages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error,
    send,
    sending,
    markAllRead,
  } = useDriverChat();

  const [draft, setDraft] = useState('');

  /**
   * Открыл экран — значит прочитал.
   *
   * И при каждом новом сообщении, пока экран открыт: сообщение, которое
   * водитель видит своими глазами, непрочитанным быть не может, а бейдж в
   * меню иначе горел бы поверх открытой переписки.
   */
  useEffect(() => {
    markAllRead();
  }, [markAllRead, messages.length]);

  // Перевёрнутый список ждёт данные от свежих к старым.
  const inverted = useMemo(() => [...messages].reverse(), [messages]);

  const handleSend = async () => {
    const value = draft.trim();
    if (!value || sending) return;

    haptics.tap();
    // Поле очищаем СРАЗУ: ждать ответа сервера с зажатым текстом — значит
    // получить второе нажатие от водителя, который решил, что не попал.
    setDraft('');
    try {
      await send(value);
    } catch (err) {
      // Текст возвращаем в поле: он написан рукой, и терять его нельзя.
      setDraft(value);
      await notify(
        'Сообщение не отправлено',
        err instanceof Error ? err.message : 'Проверьте связь и попробуйте ещё раз',
      );
    }
  };

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Диспетчер' }} />

      {/* Отступ снизу — ИЗМЕРЕННАЯ высота клавиатуры, а не
        * `KeyboardAvoidingView`. Тот опирается на то, что система ужмёт
        * окно, а при edge-to-edge она этого не делает: поле ввода уезжало
        * под клавиатуру в обоих режимах, `height` и `undefined`
        * (проверено на эмуляторе). Пока клавиатуры нет — обычный отступ
        * под системную панель навигации. */}
      <View style={[styles.flex, { paddingBottom: keyboardHeight }]}>
        {!isNetworkOnline && messages.length === 0 ? (
          <OfflineState what="Переписка" />
        ) : isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : error ? (
          <EmptyState
            icon="alert-circle-outline"
            tone="danger"
            title="Не удалось загрузить переписку"
            description={error instanceof Error ? error.message : 'Попробуйте ещё раз'}
            action={{ label: 'Повторить', onPress: () => void refetch() }}
          />
        ) : messages.length === 0 ? (
          /* Пустое состояние — ВМЕСТО списка, а не внутри него.
           * Перевёрнутый список переворачивает и своё пустое состояние:
           * в `ListEmptyComponent` текст встал зеркально (проверено на
           * эмуляторе), а обратный `scaleY` пришлось бы держать в паре с
           * поведением платформы. */
          <EmptyState
            icon="chatbubbles-outline"
            title="Сообщений пока нет"
            description="Напишите диспетчеру — он ответит здесь же"
          />
        ) : (
          <FlatList
            data={inverted}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.listContent}
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            ListFooterComponent={
              isFetchingNextPage ? (
                <ActivityIndicator style={styles.loader} color={colors.primary} />
              ) : null
            }
          />
        )}

        {/* Под системную панель навигации отступ нужен, только пока
            клавиатуры нет: с ней панель и так перекрыта. */}
        <View
          style={[
            styles.composer,
            { paddingBottom: spacing.md + (keyboardHeight > 0 ? 0 : insets.bottom) },
          ]}
        >
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Сообщение диспетчеру"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_LENGTH}
            editable={!sending}
            accessibilityLabel="Текст сообщения"
          />
          <Pressable
            style={[
              styles.sendButton,
              { backgroundColor: canSend ? colors.primary : colors.surfaceSunken },
            ]}
            onPress={() => void handleSend()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Отправить"
            accessibilityState={{ disabled: !canSend }}
          >
            {sending ? (
              <ActivityIndicator color={colors.textInverse} size="small" />
            ) : (
              <Ionicons
                name="send"
                size={iconTokens.md}
                color={canSend ? colors.textInverse : colors.textMuted}
              />
            )}
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/*  Сообщение                                                                  */
/* -------------------------------------------------------------------------- */

function MessageBubble({ message }: { message: ChatMessage }) {
  const styles = useThemedStyles(createStyles);
  const mine = message.authorRole === 'driver';

  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {!mine && message.adminName ? (
          <AppText variant="caption" tone="muted" style={styles.author}>
            {message.adminName}
          </AppText>
        ) : null}
        <AppText variant="body" style={mine ? styles.textMine : undefined}>
          {message.message}
        </AppText>
        <AppText
          variant="caption"
          tone={mine ? undefined : 'muted'}
          style={[styles.time, mine ? styles.timeMine : undefined]}
        >
          {formatTime(message.createdAt)}
        </AppText>
      </View>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { padding: spacing.lg, gap: spacing.sm },
    loader: { marginVertical: spacing.lg },

    bubbleRow: { flexDirection: 'row' },
    rowMine: { justifyContent: 'flex-end' },
    rowTheirs: { justifyContent: 'flex-start' },
    bubble: {
      maxWidth: '82%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      gap: 2,
    },
    bubbleMine: { backgroundColor: t.colors.primary },
    bubbleTheirs: { backgroundColor: t.colors.surfaceSunken },
    textMine: { color: t.colors.textInverse },
    author: { marginBottom: 2 },
    time: { alignSelf: 'flex-end' },
    timeMine: { color: t.colors.textInverse, opacity: 0.75 },

    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    input: {
      flex: 1,
      minHeight: touch.min,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      fontSize: text.body.fontSize,
      color: t.colors.textPrimary,
      backgroundColor: t.colors.background,
    },
    sendButton: {
      width: touch.min,
      height: touch.min,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
