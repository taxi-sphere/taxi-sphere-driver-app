/**
 * @file: src/components/TopBar.tsx
 * @description:
 *   Верхняя панель приложения — общая для всех вкладок.
 *   Содержит: гамбургер, кнопка Занят/Готов, GPS-статус, индикатор связи,
 *   строка баланса/рейтинга/поездок.
 * @created: 2026-03-18 07:00:00
 * @updated: 2026-03-18 07:00:00
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useDriverStatus } from '@/hooks/useDriverStatus';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useConnectionStore } from '@/stores/connection.store';
import { getProfile } from '@/api/driver.api';

interface TopBarProps {
  onMenuPress: () => void;
}

export function TopBar({ onMenuPress }: TopBarProps) {
  const router = useRouter();
  const { status, toggleBusy, isUpdating } = useDriverStatus();
  const { isTracking } = useLocationTracking();
  const socketStatus = useConnectionStore((s) => s.socketStatus);
  const isConnected = socketStatus === 'connected';

  const { data: profile } = useQuery({
    queryKey: ['driver', 'profile'],
    queryFn: getProfile,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <View style={styles.wrapper}>
      {/* Строка 1: гамбургер | кнопка | GPS | связь */}
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={onMenuPress}
          style={styles.hamburger}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="menu" size={26} color="#374151" />
        </TouchableOpacity>

        {isConnected && (
          <TouchableOpacity
            style={[
              styles.statusBtn,
              status === 'online' ? styles.statusBtnOnline : styles.statusBtnBusy,
            ]}
            onPress={toggleBusy}
            disabled={isUpdating}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              status === 'online' ? 'Свободен, принимаю заказы' : 'Занят, не принимаю заказы'
            }
            accessibilityHint="Нажмите для переключения статуса"
          >
            <Text style={styles.statusBtnLabel}>
              {isUpdating ? '...' : status === 'online' ? 'СВОБОДЕН' : 'ЗАНЯТ'}
            </Text>
          </TouchableOpacity>
        )}

        {!isConnected && (
          <View style={[styles.statusBtn, styles.statusBtnOffline]}>
            <Text style={styles.statusBtnLabel}>НЕТ СВЯЗИ</Text>
          </View>
        )}

        <View style={styles.indicators}>
          <View style={styles.indicatorItem}>
            <Ionicons
              name={isTracking ? 'navigate' : 'navigate-outline'}
              size={16}
              color={isTracking ? '#22c55e' : '#ef4444'}
            />
            <Text
              style={[
                styles.indicatorText,
                isTracking ? styles.indicatorOk : styles.indicatorBad,
              ]}
            >
              GPS
            </Text>
          </View>
          <View
            style={[
              styles.connDot,
              isConnected ? styles.connDotOk : styles.connDotBad,
            ]}
          />
        </View>
      </View>

      {/* Строка 2: баланс | рейтинг | поездки */}
      {profile && (
        <View style={styles.infoRow}>
          <TouchableOpacity
            style={styles.infoItem}
            onPress={() => router.push('/(main)/balance' as never)}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="wallet-outline" size={14} color="#6b7280" />
            <Text style={styles.infoText}>
              {Math.round(profile.balance ?? 0)} ₽
            </Text>
          </TouchableOpacity>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Ionicons name="star" size={14} color="#f59e0b" />
            <Text style={styles.infoText}>
              {(profile.rating ?? 0).toFixed(1)}
            </Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Ionicons name="car-outline" size={14} color="#6b7280" />
            <Text style={styles.infoText}>
              {profile.totalTrips ?? 0} поездок
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  hamburger: {
    padding: 4,
  },
  statusBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  statusBtnBusy: {
    backgroundColor: '#f59e0b',
  },
  statusBtnOnline: {
    backgroundColor: '#22c55e',
  },
  statusBtnOffline: {
    backgroundColor: '#6b7280',
  },
  statusBtnOnOrder: {
    backgroundColor: '#4f46e5',
  },
  statusBtnLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  indicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  indicatorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  indicatorText: {
    fontSize: 11,
    fontWeight: '600',
  },
  indicatorOk: {
    color: '#22c55e',
  },
  indicatorBad: {
    color: '#ef4444',
  },
  connDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connDotOk: {
    backgroundColor: '#22c55e',
  },
  connDotBad: {
    backgroundColor: '#ef4444',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    paddingVertical: 5,
    paddingHorizontal: 16,
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  infoDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#d1d5db',
  },
});
