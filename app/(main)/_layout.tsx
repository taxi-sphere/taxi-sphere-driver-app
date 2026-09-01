/**
 * @file: app/(main)/_layout.tsx
 * @description:
 *   Layout основного стека. Проверяет подключение к серверу.
 *   Если сервер недоступен — показывает экран "Нет подключения".
 * @dependencies: expo-router, connection.store, settings.store,
 *                @/lib/theme, @/components/ui
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 - tema)
 */

import { useEffect, useCallback, useState } from 'react';
import { View, TextInput, StyleSheet, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useConnectionStore } from '@/stores/connection.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthStore } from '@/stores/auth.store';
import { getApiUrl } from '@/lib/constants';
import { icon, radius, spacing, text, useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import { AppText, Button, Screen } from '@/components/ui';

export default function MainLayout() {
  const isServerReachable = useConnectionStore((s) => s.isServerReachable);
  const setServerReachable = useConnectionStore((s) => s.setServerReachable);
  const [checking, setChecking] = useState(false);

  const checkServer = useCallback(async () => {
    try {
      setChecking(true);
      // Используем /api/v1/geocode как health probe — /api/health может
      // блокироваться nginx/reverse-proxy, а /api/v1/* точно работает
      const url = `${getApiUrl()}/api/health`;
      console.log('[MainLayout] Checking server:', url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      console.log('[MainLayout] Server response:', res.status);
      setServerReachable(res.ok);
    } catch (err) {
      console.error('[MainLayout] Server check failed:', err);
      setServerReachable(false);
    } finally {
      setChecking(false);
    }
  }, [setServerReachable]);

  // Проверять каждые 15 секунд если нет подключения
  useEffect(() => {
    void checkServer();
    const interval = setInterval(() => {
      if (!useConnectionStore.getState().isServerReachable) {
        void checkServer();
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [checkServer]);

  if (!isServerReachable) {
    return <NoConnectionScreen onRetry={checkServer} checking={checking} />;
  }

  return <MainStack />;
}

/**
 * Стек основных экранов.
 *
 * Вынесен из `MainLayout`, чтобы `useTheme` не вызывался до проверки
 * доступности сервера: при недоступном сервере рендерится совсем другое
 * дерево, и хук в общей ветке нарушил бы порядок вызовов.
 */
function MainStack() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary, fontSize: text.heading.fontSize },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="order/[id]"
        options={{
          presentation: 'modal',
          headerShown: true,
          headerTitle: 'Детали заказа',
        }}
      />
      <Stack.Screen
        name="settings/index"
        options={{
          headerShown: true,
          headerTitle: 'Настройки',
        }}
      />
      <Stack.Screen
        name="balance/index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="payout/index"
        options={{
          headerShown: true,
          headerTitle: 'Вывод средств',
        }}
      />
    </Stack>
  );
}

/**
 * Экран «сервер недоступен».
 *
 * Здесь же — единственное место, где водитель может поменять адрес сервера,
 * не заходя в настройки: если сервер не отвечает, до настроек он и не
 * доберётся.
 */
function NoConnectionScreen({ onRetry, checking }: { onRetry: () => void; checking: boolean }) {
  const { serverUrl, setServerUrl } = useSettingsStore();
  const logout = useAuthStore((s) => s.logout);
  const [serverInput, setServerInput] = useState(serverUrl);
  const [showSettings, setShowSettings] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? '?';
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const handleSave = () => {
    const url = serverInput.trim().replace(/\/$/, '');
    setServerUrl(url);
    Alert.alert('Сохранено', 'Адрес сервера обновлён. Повторяю подключение...', [
      { text: 'OK', onPress: onRetry },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Выход', 'Выйти из аккаунта?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconWell}>
          <Ionicons name="cloud-offline-outline" size={icon.xxl} color={colors.textMuted} />
        </View>

        <AppText variant="heading" center style={styles.title}>
          Нет подключения к серверу
        </AppText>
        <AppText variant="body" tone="muted" center style={styles.subtitle}>
          Проверьте интернет-соединение или настройки сервера
        </AppText>

        <Button
          onPress={onRetry}
          loading={checking}
          icon="refresh"
          size="lg"
          style={styles.retryButton}
        >
          Повторить
        </Button>

        <Button onPress={handleLogout} variant="ghost" icon="log-out-outline" style={styles.logout}>
          Выйти из аккаунта
        </Button>

        <Button
          onPress={() => setShowSettings(!showSettings)}
          variant="ghost"
          size="sm"
          icon={showSettings ? 'chevron-up' : 'settings-outline'}
        >
          Настройки сервера
        </Button>

        {showSettings && (
          <View style={styles.settingsSection}>
            <AppText variant="caption" tone="muted" center>
              Текущий: {serverUrl || 'автоопределение'}
            </AppText>
            <TextInput
              style={styles.serverInput}
              value={serverInput}
              onChangeText={setServerInput}
              placeholder="https://taxitest1.appvault.pro"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Button onPress={handleSave} variant="secondary" fullWidth>
              Сохранить и подключиться
            </Button>
          </View>
        )}

        <AppText variant="caption" tone="muted" style={styles.versionText}>
          v{appVersion}
        </AppText>
      </View>
    </Screen>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xxxl,
      gap: spacing.sm,
    },
    iconWell: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surfaceSunken,
      marginBottom: spacing.lg,
    },
    title: { marginTop: spacing.xs },
    subtitle: { marginBottom: spacing.lg },
    retryButton: { minWidth: 220 },
    logout: { marginTop: spacing.xs },
    settingsSection: {
      width: '100%',
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    serverInput: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: text.body.fontSize,
      color: t.colors.textPrimary,
      backgroundColor: t.colors.surface,
    },
    versionText: {
      position: 'absolute',
      bottom: spacing.xl,
    },
  });
