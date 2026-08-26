/**
 * @file: src/components/DrawerMenu.tsx
 * @description:
 *   Боковое меню (drawer) — открывается по кнопке-гамбургеру.
 *   Содержит: аватар+ФИО, Заработок, Профиль, Настройки, Выход.
 *
 *   v1.5.5: кнопка «Закрыть приложение» переработана:
 *     • при активном заказе (`on_order`) — Alert-запрет с предложением
 *       перезагрузить приложение (Updates.reloadAsync). Раньше
 *       `BackHandler.exitApp()` убивал foreground-service GPS в самый
 *       неподходящий момент.
 *     • иначе — «Свернуть»: на Android через `moveTaskToBack` intent
 *       (Home category), на iOS показываем инструкцию (программное
 *       сворачивание запрещено Apple).
 * @dependencies: expo-router, auth.store, driver.api, expo-updates,
 *                expo-intent-launcher, driver.store
 * @created: 2026-03-18 06:00:00
 * @updated: 2026-08-26 (v1.5.5 — безопасное «Закрыть» + защита при on_order)
 */

import { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Pressable,
  BackHandler,
  PanResponder,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as IntentLauncher from 'expo-intent-launcher';
import { getProfile } from '@/api/driver.api';
import { useDriverStore } from '@/stores/driver.store';
import { driverLogger } from '@/services/logger.service';

const DRAWER_WIDTH = Dimensions.get('window').width * 0.78;

interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
}

export function DrawerMenu({ visible, onClose }: DrawerMenuProps) {
  const router = useRouter();
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
            overlayAnim.setValue(
              Math.max(0, 1 + gesture.dx / DRAWER_WIDTH),
            );
          }
        },
        onPanResponderRelease: (_evt, gesture) => {
          // Закрываем если свайп > 50px или скорость > 0.3
          const shouldClose =
            gesture.dx < -50 || gesture.vx < -0.3;
          if (shouldClose) {
            onClose();
          } else {
            // Возврат в открытое состояние
            Animated.parallel([
              Animated.timing(slideAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
              }),
              Animated.timing(overlayAnim, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }),
            ]).start();
          }
        },
      }),
    [onClose, slideAnim, overlayAnim],
  );

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, overlayAnim]);

  const navigate = (path: string) => {
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
      {/* Overlay */}
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer — поддерживает свайп влево для закрытия */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
      >
        {/* Шапка с аватаром */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile?.firstName?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={styles.fullName}>{fullName}</Text>
          {profile?.callSign && (
            <Text style={styles.callSign}>Позывной: {profile.callSign}</Text>
          )}
          {profile?.phone && (
            <Text style={styles.phone}>{profile.phone}</Text>
          )}
        </View>

        {/* Пункты меню */}
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
          <View style={styles.separator} />
          <MenuItem
            icon="close-outline"
            label="Свернуть приложение"
            onPress={handleExitApp}
            color="#6b7280"
          />
        </View>

        {/* Версия */}
        <Text style={styles.version}>Taxi Sphere Driver v{Constants.expoConfig?.version ?? '?'}</Text>
      </Animated.View>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.6}>
      <Ionicons name={icon} size={22} color={color ?? '#374151'} />
      <Text style={[styles.menuItemText, color ? { color } : undefined]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },

  header: {
    backgroundColor: '#4f46e5',
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  fullName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  callSign: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  phone: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },

  menuItems: {
    flex: 1,
    paddingTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  separator: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 20,
    marginVertical: 8,
  },

  version: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9ca3af',
    paddingBottom: 48,
  },
});
