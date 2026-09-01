/**
 * @file: src/components/ui/index.ts
 * @description:
 *   Дизайн-система приложения водителя — единая точка импорта.
 *
 *   ПРАВИЛО. Экран собирается из этих деталей. Если нужного элемента нет —
 *   он добавляется сюда, а не рисуется локальным `StyleSheet` в экране. До
 *   v1.5.17 набор существовал, но не импортировался НИ ОДНИМ экраном:
 *   каждый рисовал свои кнопки и карточки заново, и они разошлись все.
 *
 * @created: 2026-01-24 12:00:00
 * @updated: 2026-09-01 (v1.5.17)
 */

export { Screen } from './Screen';
export { AppText, type AppTextProps, type TextTone } from './Text';
export { Surface, Card } from './Surface';
export { Button, IconButton, type ButtonVariant, type ButtonSize } from './Button';
export { Badge, type BadgeTone } from './Badge';
export { BottomSheet } from './BottomSheet';
export { Divider } from './Divider';
export { Gradient, type GradientDirection } from './Gradient';
export { EmptyState } from './EmptyState';
export { RoutePoints, type RoutePoint } from './RoutePoints';
export { Segmented, type SegmentOption } from './Segmented';
export { Skeleton, OrderCardSkeleton, EarningsSkeleton } from './Skeleton';
export {
  FadeIn,
  SlideUp,
  PulseButton,
  ScalePress,
  StaggerItem,
  ReanimatedFadeIn,
  FadeInDown,
  FadeInUp,
  SlideInDown,
  SlideInUp,
  LinearTransition,
} from './Animated';
