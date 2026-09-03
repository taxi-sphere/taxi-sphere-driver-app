/**
 * @file: app/(main)/(tabs)/profile.tsx
 * @description:
 *   Профиль водителя: аватар, ФИО, баланс, рейтинг звёздами, авто,
 *   настройки (навигатор, тема, звук), кнопка выхода.
 *   Анимированные карточки, тёмная тема.
 * @dependencies: driver.api, useAuth, useDriverStatus, useTheme
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-29 16:00:00
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getProfile } from '@/api/driver.api';
import { useLogout } from '@/hooks/useAuth';
import { useDriverStatus } from '@/hooks/useDriverStatus';
import { formatCurrency } from '@/lib/utils';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { FadeIn, Gradient, ScalePress , useConfirm } from '@/components/ui';
import { radius } from '@/lib/theme';


export default function ProfileScreen() {
  const confirm = useConfirm();
  const router = useRouter();
  const { colors } = useTheme();
  const { status } = useDriverStatus();
  const logout = useLogout();

  const {
    data: profile,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['driver', 'profile'],
    queryFn: getProfile,
    staleTime: 5 * 60_000,
  });

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Выйти из приложения?',
      message: 'Придётся войти заново по номеру телефона и паролю.',
      confirmLabel: 'Выйти',
      variant: 'danger',
    });
    if (ok) logout.mutate();
  };

  const fullName = profile
    ? [profile.lastName, profile.firstName, profile.middleName].filter(Boolean).join(' ') || 'Водитель'
    : 'Водитель';

  const vehicleInfo = profile
    ? [profile.vehicleBrand, profile.vehicleModel, profile.vehicleYear].filter(Boolean).join(' ') || null
    : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={colors.primary} />
        }
      >
        {/* Аватар и ФИО */}
        <FadeIn delay={0}>
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{profile?.firstName?.[0]?.toUpperCase() ?? '?'}</Text>
            </View>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
            ) : (
              <Text style={[styles.fullName, { color: colors.textPrimary }]}>{fullName}</Text>
            )}
            {profile?.callSign && (
              <Text style={[styles.callSign, { color: colors.textMuted }]}>Позывной: {profile.callSign}</Text>
            )}
            {profile?.phone && (
              <Text style={[styles.phone, { color: colors.textMuted }]}>{profile.phone}</Text>
            )}
          </View>
        </FadeIn>

        {/* Статистика */}
        {profile && (
          <FadeIn delay={100}>
            {/* Градиент вместо плоской заливки: карточка со статистикой —
                единственный акцентный блок экрана, и он должен выглядеть
                намеренно, а не как прямоугольник бренд-цвета. */}
            <Gradient radius={radius.lg} style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statValueWhite}>{formatCurrency(profile.balance)}</Text>
                <Text style={styles.statLabelWhite}>Баланс</Text>
              </View>
              <View style={styles.statDividerWhite} />
              <View style={styles.statItem}>
                <View style={styles.ratingRow}>
                  <Text style={styles.statValueWhite}>{profile.rating.toFixed(1)}</Text>
                  <Ionicons name="star" size={14} color="#fbbf24" style={{ marginLeft: 3 }} />
                </View>
                <Text style={styles.statLabelWhite}>Рейтинг</Text>
              </View>
              <View style={styles.statDividerWhite} />
              <View style={styles.statItem}>
                <Text style={styles.statValueWhite}>{profile.totalTrips}</Text>
                <Text style={styles.statLabelWhite}>Поездки</Text>
              </View>
            </Gradient>
          </FadeIn>
        )}

        {/* Статус и Активность */}
        <FadeIn delay={200}>
          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <InfoRow
              label="Статус"
              value={status === 'online' ? 'На линии' : status === 'on_order' ? 'На заказе' : status === 'busy' ? 'Занят' : 'Оффлайн'}
              valueColor={status === 'online' ? colors.success : status === 'on_order' ? colors.warning : colors.textMuted}
              colors={colors}
            />
            {profile?.activity != null && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Активность</Text>
                <View style={styles.activityRow}>
                  <View style={[styles.activityBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.activityFill, { width: `${profile.activity}%`, backgroundColor: profile.activity >= 70 ? colors.success : colors.warning }]} />
                  </View>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{profile.activity}%</Text>
                </View>
              </View>
            )}
            {profile?.city && <InfoRow label="Город" value={profile.city} colors={colors} />}
          </View>
        </FadeIn>

        {/* Автомобиль */}
        {vehicleInfo && (
          <FadeIn delay={300}>
            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
                <Ionicons name="car-outline" size={14} color={colors.textSecondary} /> Автомобиль
              </Text>
              <InfoRow label="Марка/модель" value={vehicleInfo} colors={colors} />
              {profile?.vehicleColor && <InfoRow label="Цвет" value={profile.vehicleColor} colors={colors} />}
              {profile?.vehiclePlate && <InfoRow label="Гос. номер" value={profile.vehiclePlate} colors={colors} />}
            </View>
          </FadeIn>
        )}

        {/* Настройки */}
        <FadeIn delay={400}>
          <ScalePress onPress={() => router.push('/(main)/settings')}>
            <View style={[styles.actionRow, { backgroundColor: colors.surface }]}>
              <View style={styles.actionLeft}>
                <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.actionText, { color: colors.textSecondary }]}>Настройки</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </ScalePress>
        </FadeIn>

        {/* Выход */}
        <FadeIn delay={500}>
          <ScalePress onPress={handleLogout} disabled={logout.isPending}>
            <View style={[styles.logoutButton, { borderColor: colors.danger + '40' }]}>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={[styles.logoutText, { color: colors.danger }]}>
                {logout.isPending ? 'Выход...' : 'Выйти из аккаунта'}
              </Text>
            </View>
          </ScalePress>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Вспомогательные ──────────────────────────────────────────────── */

function InfoRow({ label, value, valueColor, colors }: {
  label: string;
  value: string;
  valueColor?: string;
  // v1.5.9: было Record<string, string> — ThemeColors это интерфейс без
  // index-signature, поэтому TypeScript отвергал передачу colors.
  colors: ThemeColors;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor || colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

/* ─── Стили ─────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  profileHeader: { alignItems: 'center', paddingVertical: 8 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#ffffff' },
  fullName: { fontSize: 22, fontWeight: '700' },
  callSign: { fontSize: 13, marginTop: 4 },
  phone: { fontSize: 13, marginTop: 2 },

  statsCard: {
    borderRadius: 16, padding: 18,
    flexDirection: 'row', alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValueWhite: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  statLabelWhite: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  statDividerWhite: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },

  infoCard: { borderRadius: 12, padding: 14, gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 14, fontWeight: '600' },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityBar: { width: 80, height: 6, borderRadius: 3, overflow: 'hidden' },
  activityFill: { height: '100%', borderRadius: 3 },

  actionRow: {
    borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionText: { fontSize: 15 },

  logoutButton: {
    borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, backgroundColor: 'transparent',
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
});
