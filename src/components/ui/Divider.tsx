/**
 * @file: src/components/ui/Divider.tsx
 * @description: Разделительная линия по теме — горизонтальная или вертикальная.
 * @dependencies: react-native, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import { View, type ViewStyle, type StyleProp } from 'react-native';
import { useColors } from '@/lib/theme';

interface DividerProps {
  vertical?: boolean;
  /** Длина поперёк линии: высота для вертикальной, отступы для горизонтальной. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function Divider({ vertical = false, size, style }: DividerProps) {
  const colors = useColors();

  return (
    <View
      style={[
        vertical
          ? { width: 1, height: size ?? 16, backgroundColor: colors.border }
          : { height: 1, backgroundColor: colors.border, marginVertical: size ?? 0 },
        style,
      ]}
    />
  );
}
