/**
 * @file: src/components/ui/Screen.tsx
 * @description:
 *   Корневой контейнер экрана: фон по теме и, при необходимости, отступы
 *   от системных зон.
 *
 *   ЗАЧЕМ. Каждый экран начинался с `<View style={{flex:1,
 *   backgroundColor:'#f3f4f6'}}>` — семнадцать копий одного и того же
 *   светло-серого. Именно из-за них переключатель тёмной темы не давал
 *   никакого эффекта: даже если содержимое экрана перекрасить, подложка
 *   оставалась светлой.
 *
 * @dependencies: react-native-safe-area-context, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import type { ReactNode } from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useColors } from '@/lib/theme';

interface ScreenProps {
  children: ReactNode;
  /**
   * Края, которые нужно отступить от системных зон. Не указан — обычный
   * `View`: внутри вкладок отступы уже даёт layout, и второй SafeAreaView
   * добавил бы пустую полосу под шапкой.
   */
  edges?: readonly Edge[];
  /** Фон цвета карточки вместо фона экрана — для страниц-форм. */
  surface?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, edges, surface = false, style }: ScreenProps) {
  const colors = useColors();
  const base: ViewStyle = {
    flex: 1,
    backgroundColor: surface ? colors.surface : colors.background,
  };

  if (edges && edges.length > 0) {
    return (
      <SafeAreaView edges={edges} style={[base, style]}>
        {children}
      </SafeAreaView>
    );
  }

  return <View style={[base, style]}>{children}</View>;
}
