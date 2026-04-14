/**
 * @file: src/components/DrawerMenu.tsx
 * @description:
 *   Боковое меню (drawer) — открывается по кнопке-гамбургеру.
 *   Содержит: аватар+ФИО, Заработок, Профиль, Настройки, Выход.
 * @dependencies: expo-router, auth.store, driver.api
 * @created: 2026-03-18 06:00:00
 * @updated: 2026-03-18 06:00:00
 */

import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Pressable,
  BackHandler,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { getProfile } from '@/api/driver.api';

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

  const handleExitApp = () => {
    onClose();
    setTimeout(() => BackHandler.exitApp(), 300);
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

      {/* Drawer */}
      <Animated.View
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
            label="Закрыть приложение"
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
