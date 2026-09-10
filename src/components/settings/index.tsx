/**
 * @file: src/components/settings/index.tsx
 * @description:
 *   Строительные части экранов настроек: заголовок раздела, строка с
 *   переключателем, строка-значение, строка-переход и ряд кнопок выбора.
 *
 *   ЗАЧЕМ ОБЩИЙ ФАЙЛ. Настройки разъехались по шести экранам (1.5.53), и
 *   до этого все части жили внутри одного — скопировать их шесть раз
 *   значило бы получить шесть слегка разных настроек на вид. Здесь они
 *   одни на всех, вместе со стилями.
 *
 * @dependencies: @/components/ui, @/lib/theme, @/lib/haptics
 * @created: 2026-09-10 (1.5.53)
 */

import { View, Switch, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/lib/haptics';
import {
  icon as iconTokens,
  radius,
  spacing,
  touch,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';
import { AppText, Surface } from '@/components/ui';

/** Заголовок раздела плюс карточка с его содержимым. */
export function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(createSettingsStyles);

  return (
    <View style={styles.section}>
      {title ? (
        <AppText variant="overline" tone="muted" style={styles.sectionTitle}>
          {title}
        </AppText>
      ) : null}
      <Surface level={1} padded={false} style={styles.card}>
        {children}
      </Surface>
    </View>
  );
}

export function SettingSwitch({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createSettingsStyles);

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText variant="body">{label}</AppText>
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          // Вибрация до записи в стор: иначе выключение «Вибрации» само
          // себя и заглушит, и подтверждения нажатия водитель не получит.
          haptics.tap();
          onValueChange(next);
        }}
        trackColor={{ false: colors.borderStrong, true: colors.primarySoft }}
        thumbColor={value ? colors.primary : colors.surface}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createSettingsStyles);

  return (
    <View style={styles.row}>
      <AppText variant="body" tone="secondary">
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

/**
 * Строка-переход в раздел настроек.
 *
 * Подпись под названием — не украшение: по списку из шести слов
 * («Уведомления», «Карта», «Сервер») водитель гадает, где искать нужное.
 * Перечисление того, что внутри, отвечает на это без открывания.
 */
export function SettingLink({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createSettingsStyles);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.surfaceSunken },
      ]}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.linkIcon, { backgroundColor: colors.surfaceSunken }]}>
        <Ionicons name={icon} size={iconTokens.md} color={colors.textPrimary} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="body">{label}</AppText>
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={iconTokens.sm} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * Ряд взаимоисключающих кнопок — «выбери одно из двух-трёх».
 *
 * Не выпадающий список: вариантов мало, а список требует двух нажатий и
 * закрывает экран. Кнопки видно все сразу, и выбранный читается цветом.
 */
export function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createSettingsStyles);

  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[
              styles.choiceButton,
              {
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primarySoft : 'transparent',
              },
            ]}
            onPress={() => {
              haptics.tap();
              onChange(option.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={iconTokens.md}
                color={active ? colors.primary : colors.textSecondary}
              />
            ) : null}
            {/* Одна строка и сжатие кегля: длинная подпись иначе рвётся
                посередине слова — «Настойчив ый» (проверено на эмуляторе). */}
            <AppText
              variant="label"
              weight={active ? '700' : '500'}
              style={{ color: active ? colors.primary : colors.textSecondary }}
              center
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Пояснение под содержимым карточки — словами, что даёт выбор. */
export function SectionHint({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(createSettingsStyles);

  return (
    <AppText variant="caption" tone="muted" style={styles.sectionHint}>
      {children}
    </AppText>
  );
}

export const createSettingsStyles = (t: Theme) =>
  StyleSheet.create({
    content: {
      padding: spacing.lg,
      gap: spacing.lg,
      paddingBottom: spacing.xxxl + spacing.lg,
    },
    section: { gap: spacing.sm },
    sectionTitle: { paddingHorizontal: spacing.xs },
    card: { overflow: 'hidden' },
    // Минимум 56: строки настроек жмут пальцем, а не курсором.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      minHeight: touch.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    rowText: { flex: 1, gap: 2 },
    linkIcon: {
      width: 38,
      height: 38,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    choiceRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
    choiceButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1.5,
      minHeight: touch.primary,
    },
    sectionHint: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    serverBlock: { padding: spacing.lg, gap: spacing.md },
    input: {
      height: 52,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      fontSize: 17,
      color: t.colors.textPrimary,
      backgroundColor: t.colors.surfaceSunken,
    },
  });
