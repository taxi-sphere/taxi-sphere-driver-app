/**
 * @file: src/components/ui/EmptyState.tsx
 * @description:
 *   Пустой экран: иконка, заголовок, пояснение и необязательное действие.
 *
 *   ЗАЧЕМ. Ровно эта раскладка была написана заново в шести местах —
 *   «Нет доступных заказов», «Нет активного заказа», «Вы оффлайн»,
 *   «Ошибка загрузки», плюс две вкладки-заглушки. Отступы и размеры в них
 *   разошлись все шесть раз.
 *
 * @dependencies: react-native, @expo/vector-icons, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import { View, type ViewStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { icon as iconTokens, spacing, useTheme } from '@/lib/theme';
import { AppText } from './Text';
import { Button } from './Button';
import { FadeIn } from './Animated';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface EmptyStateProps {
  icon: IoniconName;
  title: string;
  description?: string;
  /** Смысловой оттенок: обычная пустота, предупреждение или ошибка. */
  tone?: 'neutral' | 'warning' | 'danger';
  action?: { label: string; onPress: () => void; loading?: boolean };
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon,
  title,
  description,
  tone = 'neutral',
  action,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();

  const iconColor =
    tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.textMuted;

  return (
    <FadeIn style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl }, style]}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            tone === 'danger'
              ? colors.dangerSoft
              : tone === 'warning'
                ? colors.warningSoft
                : colors.surfaceSunken,
          marginBottom: spacing.xl,
        }}
      >
        <Ionicons name={icon} size={iconTokens.xxl} color={iconColor} />
      </View>

      <AppText variant="heading" center>
        {title}
      </AppText>

      {description ? (
        <AppText variant="body" tone="muted" center style={{ marginTop: spacing.sm }}>
          {description}
        </AppText>
      ) : null}

      {action ? (
        <Button
          onPress={action.onPress}
          loading={action.loading}
          size="md"
          style={{ marginTop: spacing.xl, minWidth: 200 }}
        >
          {action.label}
        </Button>
      ) : null}
    </FadeIn>
  );
}
