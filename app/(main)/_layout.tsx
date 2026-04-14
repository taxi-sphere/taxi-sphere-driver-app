/**
 * @file: app/(main)/_layout.tsx
 * @description:
 *   Layout основного стека. Проверяет подключение к серверу.
 *   Если сервер недоступен — показывает экран "Нет подключения".
 * @dependencies: expo-router, connection.store, settings.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-04-02 04:00:00
 */

import { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useConnectionStore } from '@/stores/connection.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthStore } from '@/stores/auth.store';
import { getApiUrl } from '@/lib/constants';

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

  return (
    <Stack screenOptions={{ headerShown: false }}>
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
    </Stack>
  );
}

function NoConnectionScreen({ onRetry, checking }: { onRetry: () => void; checking: boolean }) {
  const { serverUrl, setServerUrl } = useSettingsStore();
  const logout = useAuthStore((s) => s.logout);
  const [serverInput, setServerInput] = useState(serverUrl);
  const [showSettings, setShowSettings] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? '?';

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
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="cloud-offline-outline" size={64} color="#d1d5db" />
        <Text style={styles.title}>Нет подключения к серверу</Text>
        <Text style={styles.subtitle}>
          Проверьте интернет-соединение или настройки сервера
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="refresh" size={18} color="#ffffff" />
              <Text style={styles.retryText}>Повторить</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Выход из аккаунта */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsToggle}
          onPress={() => setShowSettings(!showSettings)}
        >
          <Ionicons name="settings-outline" size={16} color="#6b7280" />
          <Text style={styles.settingsToggleText}>Настройки сервера</Text>
        </TouchableOpacity>

        {showSettings && (
          <View style={styles.settingsSection}>
            <Text style={styles.settingsHint}>
              Текущий: {serverUrl || 'автоопределение'}
            </Text>
            <TextInput
              style={styles.serverInput}
              value={serverInput}
              onChangeText={setServerInput}
              placeholder="https://taxitest.appvault.pro"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Сохранить и подключиться</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Версия приложения */}
        <Text style={styles.versionText}>v{appVersion}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 32,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  settingsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    padding: 8,
  },
  settingsToggleText: {
    fontSize: 14,
    color: '#6b7280',
  },
  settingsSection: {
    width: '100%',
    marginTop: 12,
    gap: 8,
  },
  settingsHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
  serverInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#374151',
    backgroundColor: '#ffffff',
  },
  saveButton: {
    backgroundColor: '#6b7280',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 24,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ef4444',
  },
  versionText: {
    position: 'absolute',
    bottom: 20,
    fontSize: 12,
    color: '#d1d5db',
  },
});
