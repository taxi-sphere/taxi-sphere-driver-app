/**
 * @file: app/(main)/news/index.tsx
 * @description:
 *   Объявления службы: новости, правила смены, акции, заметки об
 *   обновлениях.
 *
 *   ЧЕГО НЕ ХВАТАЛО. Раздел был построен на две трети: админка умеет
 *   писать и публиковать объявления, сервер их отдаёт, в приложении даже
 *   лежал готовый api-клиент — и ни один экран его не вызывал. Служба
 *   писала объявления в пустоту с марта.
 *
 *   ДЛИННЫЙ ТЕКСТ СВЁРНУТ. Правила смены бывают на страницу, и десять
 *   таких карточек подряд превращают список в стену. Свёрнуто три строки,
 *   нажатие раскрывает.
 *
 * @dependencies:
 *   - @/hooks/useNews
 *   - @/components/ui
 * @created: 2026-09-10 (1.5.53)
 */

import { useEffect, useState } from 'react';
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
import { useNews } from '@/hooks/useNews';
import { useConnectionStore } from '@/stores/connection.store';
import { haptics } from '@/lib/haptics';
import { formatDate } from '@/lib/utils';
import {
  icon as iconTokens,
  radius,
  spacing,
  useTheme,
  useThemedStyles,
  type Theme,
  type ThemeColors,
} from '@/lib/theme';
import { AppText, EmptyState, OfflineState, Screen } from '@/components/ui';
import type { NewsArticle, NewsCategory } from '@/types/news';

/** Сколько строк текста видно в свёрнутой карточке. */
const COLLAPSED_LINES = 3;

/** Метка категории: значок, подпись и роль цвета из палитры. */
const CATEGORY: Record<
  NewsCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap; tone: keyof ThemeColors }
> = {
  news: { label: 'Новость', icon: 'megaphone-outline', tone: 'info' },
  rule: { label: 'Правило', icon: 'document-text-outline', tone: 'warning' },
  update: { label: 'Обновление', icon: 'cloud-download-outline', tone: 'primary' },
  promo: { label: 'Акция', icon: 'gift-outline', tone: 'success' },
};

export default function NewsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isNetworkOnline = useConnectionStore((s) => s.isNetworkOnline);
  const { items, isLoading, isFetching, refetch, error, markAllRead } = useNews();
  const [openId, setOpenId] = useState<string | null>(null);

  /**
   * Открыл раздел — значит увидел. Отмечаем и при появлении новых
   * объявлений, пока экран открыт: бейдж в меню не должен гореть поверх
   * того, что водитель читает прямо сейчас.
   */
  useEffect(() => {
    markAllRead();
  }, [markAllRead, items.length]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Объявления' }} />

      {!isNetworkOnline && items.length === 0 ? (
        <OfflineState what="Объявления" />
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
          data={items}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <ArticleCard
              article={item}
              expanded={openId === item.id}
              onToggle={() => {
                haptics.tap();
                setOpenId((id) => (id === item.id ? null : item.id));
              }}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="megaphone-outline"
              title="Объявлений пока нет"
              description="Здесь появятся новости службы, правила и акции"
            />
          }
        />
      )}
    </Screen>
  );
}

function ArticleCard({
  article,
  expanded,
  onToggle,
}: {
  article: NewsArticle;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const meta = CATEGORY[article.category] ?? CATEGORY.news;
  const accent = colors[meta.tone];
  /** Не поместился ли текст в свёрнутую карточку — меряется при раскладке. */
  const [clipped, setClipped] = useState(false);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceSunken }]}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      accessibilityState={{ expanded }}
    >
      <View style={styles.cardHead}>
        <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
          <Ionicons name={meta.icon} size={iconTokens.md} color={accent} />
        </View>

        <View style={styles.cardHeadText}>
          <View style={styles.metaRow}>
            <AppText variant="caption" style={{ color: accent }} weight="700">
              {meta.label.toUpperCase()}
            </AppText>
            {article.isPinned ? (
              <Ionicons name="pin" size={iconTokens.sm} color={colors.textMuted} />
            ) : null}
            <AppText variant="caption" tone="muted">
              {formatDate(article.createdAt)}
            </AppText>
          </View>
          <AppText variant="bodyStrong">{article.title}</AppText>
        </View>
      </View>

      <AppText
        variant="body"
        tone="secondary"
        numberOfLines={expanded ? undefined : COLLAPSED_LINES}
        style={styles.content}
        /**
         * Обрезан ли текст — МЕРЯЕМ, а не угадываем по длине.
         *
         * Первая версия показывала «Читать полностью» при длине больше
         * 140 символов, и на эмуляторе объявление в 124 символа заняло
         * все три строки, обрезалось — а ссылки не получило: прочесть
         * его было нельзя вовсе. Число символов не говорит о числе строк:
         * решают ширина карточки, кегль и переносы.
         *
         * `onTextLayout` при заданном `numberOfLines` отдаёт ровно
         * столько строк, сколько поместилось. Их предел и означает, что
         * текст, возможно, продолжается.
         */
        onTextLayout={
          expanded
            ? undefined
            : (e) => setClipped(e.nativeEvent.lines.length >= COLLAPSED_LINES)
        }
      >
        {article.content}
      </AppText>

      {!expanded && clipped ? (
        <AppText variant="label" style={{ color: colors.primary }}>
          Читать полностью
        </AppText>
      ) : null}
    </Pressable>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    cardHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardHeadText: { flex: 1, gap: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    content: { lineHeight: 22 },
  });
