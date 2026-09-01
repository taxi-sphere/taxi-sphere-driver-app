/**
 * @file: src/components/DrawerMenu.tsx
 * @description:
 *   Боковое меню — открывается по кнопке-гамбургеру.
 *   Содержит: карточку водителя, разделы (Заработок, История, Профиль,
 *   Настройки) и сворачивание приложения.
 *
 *   v1.5.5: кнопка «Закрыть приложение» переработана:
 *     • при активном заказе (`on_order`) — Alert-запрет с предложением
 *       перезагрузить приложение (Updates.reloadAsync). Раньше
 *       `BackHandler.exitApp()` убивал foreground-service GPS в самый
 *       неподходящий момент.
 *     • иначе — «Свернуть»: на Android через `moveTaskToBack` intent
 *       (Home category), на iOS показываем инструкцию (программное
 *       сворачивание запрещено Apple).
 *
 *   v1.5.17: редизайн. Шапка стала градиентной карточкой с отступом от
 *   системной зоны (было `paddingTop: 56` на глаз — на телефонах с
 *   вырезом имя заезжало под чёлку). Пункты меню доведены до 56px: прежние
 *   строки в 14px вертикального отступа давали зону нажатия около 44px,
 *   и в них промахивались на ходу.
 *
 * @dependencies: expo-router, auth.store, driver.api, expo-updates,
 *                expo-intent-launcher, driver.store, @/lib/theme,
 *                @/lib/haptics, @/components/ui
 * @created: 2026-03-18 06:00:00
 * @updated: 2026-09-01 (v1.5.17 — редизайн, тема, зоны нажатия)
 */

import { useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  Pressable,
  BackHandler,
  PanResponder,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as IntentLauncher from 'expo-intent-launcher';
import { getProfile } from '@/api/driver.api';
import { useDriverStore } from '@/stores/driver.store';
import { driverLogger } from '@/services/logger.service';
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
import { AppText, Divider, Gradient } from '@/components/ui';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.82, 340);

/** Порог свайпа, после которого меню закрывается. */
const CLOSE_DISTANCE = 50;
const CLOSE_VELOCITY = 0.3;

interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
}

export function DrawerMenu({ visible, onClose }: DrawerMenuProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const { data: profile } = useQuery({
    queryKey: ['driver', 'profile'],
    queryFn: getProfile,
    staleTime: 5 * 60_000,
  });

  // Жест закрытия свайпом влево. Подхватываем горизонтальный swipe
  // (dx < 0) минимум на 50px ИЛИ с быстрой скоростью — и закрываем.
  // Пока жест идёт, drawer интерактивно следует за пальцем для
  // естественного ощущения (но не правее своей начальной позиции).
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) => {
          // Реагируем только на выраженные горизонтальные жесты влево
          return gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
        },
        onPanResponderMove: (_evt, gesture) => {
          if (gesture.dx < 0) {
            slideAnim.setValue(Math.max(gesture.dx, -DRAWER_WIDTH));
            // затеняем оверлей пропорционально
            overlayAnim.setValue(Math.max(0, 1 + gesture.dx / DRAWER_WIDTH));
          }
        },
        onPanResponderRelease: (_evt, gesture) => {
          const shouldClose = gesture.dx < -CLOSE_DISTANCE || gesture.vx < -CLOSE_VELOCITY;
          if (shouldClose) {
            onClose();
            return;
          }
          // Возврат в открытое состояние — пружиной, а не линейно: палец
          // отпустили, и панель должна «дотянуться» сама.
          Animated.parallel([
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              damping: 20,
              stiffness: 200,
            }),
            Animated.timing(overlayAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
          ]).start();
        },
      }),
    [onClose, slideAnim, overlayAnim],
  );

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 180,
        }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, overlayAnim]);

  const navigate = (path: string) => {
    haptics.tap();
    onClose();
    setTimeout(() => router.push(path as never), 300);
  };

  /**
   * v1.5.5: безопасное «Закрыть приложение».
   *   • Активный заказ (on_order) — блокируем закрытие, предлагаем
   *     перезагрузить приложение (Updates.reloadAsync). Реализация
   *     завершения заказа остаётся у водителя.
   *   • Иначе — сворачиваем в фон:
   *       Android: `IntentLauncher.startActivityAsync` с ACTION_MAIN +
   *         CATEGORY_HOME — приложение уходит на домашний экран (как по
   *         кнопке Home). Foreground-сервис GPS продолжает работать.
   *       iOS: Apple запрещает программное сворачивание. Показываем
   *         инструкцию — «нажмите Home / свайпните снизу».
   */
  const handleExitApp = () => {
    const driverStatus = useDriverStore.getState().status;

    if (driverStatus === 'on_order') {
      haptics.reject();
      Alert.alert(
        'Нельзя закрыть на заказе',
        'У вас активный заказ. Завершите или отмените его, либо перезагрузите приложение (данные заказа сохранятся).',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Перезагрузить',
            style: 'destructive',
            onPress: async () => {
              try {
                await Updates.reloadAsync();
              } catch (e) {
                void driverLogger.error('Updates.reloadAsync failed', {
                  screen: 'drawer',
                  action: 'reload_failed',
                  message: e instanceof Error ? e.message : String(e),
                });
                Alert.alert('Ошибка', 'Не удалось перезагрузить приложение.');
              }
            },
          },
        ],
      );
      return;
    }

    onClose();

    if (Platform.OS === 'android') {
      setTimeout(() => {
        IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
          category: 'android.intent.category.HOME',
          flags: 268435456, // FLAG_ACTIVITY_NEW_TASK — требуется для intent из root activity
        }).catch((e) => {
          void driverLogger.error('Home intent failed, fallback to exitApp', {
            screen: 'drawer',
            action: 'move_to_back_failed',
            message: e instanceof Error ? e.message : String(e),
          });
          BackHandler.exitApp();
        });
      }, 300);
    } else {
      Alert.alert(
        'Как свернуть приложение',
        'На iOS программное сворачивание запрещено. Нажмите кнопку Home (или свайпните снизу вверх).',
        [{ text: 'Понятно' }],
      );
    }
  };

  const fullName = profile
    ? [profile.lastName, profile.firstName].filter(Boolean).join(' ') || 'Водитель'
    : 'Водитель';

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer — поддерживает свайп влево для закрытия */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
      >
        <Gradient style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
          <View style={styles.avatar}>
            <AppText variant="title" style={{ color: '#ffffff' }}>
              {profile?.firstName?.[0]?.toUpperCase() ?? '?'}
            </AppText>
          </View>

          <AppText variant="heading" style={styles.onGradient} numberOfLines={1}>
            {fullName}
          </AppText>

          <View style={styles.headerMeta}>
            {profile?.callSign ? (
              <View style={styles.callSignChip}>
                <AppText variant="caption" style={styles.onGradient} weight="700">
                  {profile.callSign}
                </AppText>
              </View>
            ) : null}
            {profile?.phone ? (
              <AppText variant="label" style={styles.onGradientMuted}>
                {profile.phone}
              </AppText>
            ) : null}
          </View>
        </Gradient>

        <View style={styles.menuItems}>
          <MenuItem
            icon="wallet-outline"
            label="Заработок"
            onPress={() => navigate('/(main)/(tabs)/earnings')}
          />
          <MenuItem
            icon="receipt-outline"
            label="История операций"
            onPress={() => navigate('/(main)/balance')}
          />
          <MenuItem
            icon="person-outline"
            label="Профиль"
            onPress={() => navigate('/(main)/(tabs)/profile')}
          />
          <MenuItem
            icon="settings-outline"
            label="Настройки"
            onPress={() => navigate('/(main)/settings')}
          />

          <Divider style={styles.separator} />

          <MenuItem
            icon="contract-outline"
            label="Свернуть приложение"
            onPress={handleExitApp}
            tint={colors.textMuted}
            showChevron={false}
          />
        </View>

        <AppText variant="caption" tone="muted" center style={styles.version}>
          Taxi Sphere Driver v{Constants.expoConfig?.version ?? '?'}
        </AppText>
      </Animated.View>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  tint,
  showChevron = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tint?: string;
  showChevron?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = tint ?? colors.textPrimary;

  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSunken }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.menuIcon, { backgroundColor: colors.surfaceSunken }]}>
        <Ionicons name={icon} size={iconTokens.md} color={color} />
      </View>
      <AppText variant="body" style={{ color, flex: 1 }}>
        {label}
      </AppText>
      {showChevron && (
        <Ionicons name="chevron-forward" size={iconTokens.sm} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.colors.scrim,
    },
    drawer: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: DRAWER_WIDTH,
      backgroundColor: t.colors.surface,
      shadowColor: t.colors.shadow,
      shadowOffset: { width: 4, height: 0 },
      shadowOpacity: t.isDark ? 0.5 : 0.15,
      shadowRadius: 16,
      elevation: 16,
    },

    header: {
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.xl,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.35)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    // Текст поверх градиента всегда белый: под ним бренд-цвет, а не
    // поверхность темы, и `textPrimary` тёмной темы на нём читался бы плохо.
    onGradient: { color: '#ffffff' },
    onGradientMuted: { color: 'rgba(255, 255, 255, 0.75)' },
    headerMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    callSignChip: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
    },

    menuItems: {
      flex: 1,
      paddingTop: spacing.sm,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: touch.primary,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    menuIcon: {
      width: 38,
      height: 38,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    separator: {
      marginHorizontal: spacing.lg,
      marginVertical: spacing.sm,
    },

    version: {
      paddingBottom: spacing.xxxl + spacing.lg,
    },
  });
