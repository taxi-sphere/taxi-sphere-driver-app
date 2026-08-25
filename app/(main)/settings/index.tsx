/**
 * @file: app/(main)/settings/index.tsx
 * @description:
 *   Экран настроек: звук, вибрация, голосовые оповещения,
 *   выбор навигатора, версия приложения.
 * @dependencies: settings.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useState } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSettingsStore } from '@/stores/settings.store';
import { useAppUpdate } from '@/hooks/useAppUpdate';

type NavigatorApp = 'yandex' | '2gis' | 'google';

const NAVIGATORS: { value: NavigatorApp; label: string }[] = [
  { value: 'yandex', label: 'Яндекс Навигатор' },
  { value: '2gis', label: '2ГИС' },
  { value: 'google', label: 'Google Maps' },
];

export default function SettingsScreen() {
  const {
    serverUrl,
    soundEnabled,
    vibrationEnabled,
    voiceAlerts,
    preferredNavigator,
    themeMode,
    betaChannel,
    setServerUrl,
    setSoundEnabled,
    setVibrationEnabled,
    setVoiceAlerts,
    setPreferredNavigator,
    setThemeMode,
    setBetaChannel,
  } = useSettingsStore();

  const { channel, latest, hasUpdate, checking, refresh } = useAppUpdate();

  const [serverInput, setServerInput] = useState(serverUrl);

  const handleBetaToggle = (next: boolean) => {
    if (next) {
      // Explicit opt-in — предупреждаем о риске
      Alert.alert(
        'Включить beta-канал?',
        'Beta-версии могут содержать нестабильные функции и баги. ' +
          'Обычно они выпускаются на несколько дней раньше основных релизов ' +
          'для проверки. Если что-то сломается — выключите этот переключатель ' +
          'и переустановите основную (production) версию через админку.',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Включить',
            style: 'destructive',
            onPress: () => {
              setBetaChannel(true);
              // Немедленно перезапросить последнюю версию в новом канале
              void refresh();
            },
          },
        ],
      );
    } else {
      setBetaChannel(false);
      void refresh();
    }
  };

  const handleCheckNow = async () => {
    await refresh();
    if (hasUpdate && latest) {
      Alert.alert('Доступна новая версия', `Версия ${latest.latestVersion}`);
    } else {
      Alert.alert('Обновлений нет', 'У вас последняя версия');
    }
  };

  const handleSaveServer = () => {
    const url = serverInput.trim().replace(/\/$/, '');
    setServerUrl(url);
    Alert.alert('Сохранено', url ? `Сервер: ${url}` : 'Используется автоопределение', [{ text: 'OK' }]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Уведомления */}
        <Text style={styles.sectionTitle}>Уведомления</Text>
        <View style={styles.card}>
          <SettingSwitch
            label="Звук"
            value={soundEnabled}
            onValueChange={setSoundEnabled}
          />
          <View style={styles.separator} />
          <SettingSwitch
            label="Вибрация"
            value={vibrationEnabled}
            onValueChange={setVibrationEnabled}
          />
          <View style={styles.separator} />
          <SettingSwitch
            label="Голосовые оповещения"
            value={voiceAlerts}
            onValueChange={setVoiceAlerts}
          />
        </View>

        {/* Тема оформления */}
        <Text style={styles.sectionTitle}>Тема оформления</Text>
        <View style={styles.card}>
          <View style={styles.themeRow}>
            {(['system', 'light', 'dark'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.themeButton,
                  { borderColor: themeMode === mode ? '#4f46e5' : '#d1d5db' },
                  themeMode === mode && { backgroundColor: '#eef2ff' },
                ]}
                onPress={() => setThemeMode(mode)}
              >
                <Ionicons
                  name={mode === 'system' ? 'phone-portrait-outline' : mode === 'light' ? 'sunny-outline' : 'moon-outline'}
                  size={18}
                  color={themeMode === mode ? '#4f46e5' : '#9ca3af'}
                />
                <Text style={[styles.themeText, { color: themeMode === mode ? '#4f46e5' : '#9ca3af' }]}>
                  {mode === 'system' ? 'Авто' : mode === 'light' ? 'Светлая' : 'Тёмная'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Навигатор */}
        <Text style={styles.sectionTitle}>Навигатор</Text>
        <View style={styles.card}>
          {NAVIGATORS.map((nav, idx) => (
            <View key={nav.value}>
              {idx > 0 && <View style={styles.separator} />}
              <TouchableOpacity
                style={styles.radioRow}
                onPress={() => setPreferredNavigator(nav.value)}
              >
                <Text style={styles.radioLabel}>{nav.label}</Text>
                <View
                  style={[
                    styles.radioOuter,
                    preferredNavigator === nav.value && styles.radioOuterActive,
                  ]}
                >
                  {preferredNavigator === nav.value && (
                    <View style={styles.radioInner} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Сервер */}
        <Text style={styles.sectionTitle}>Сервер</Text>
        <View style={styles.card}>
          <View style={styles.serverRow}>
            <Text style={styles.serverHint}>
              Адрес сервера (оставьте пустым для автоопределения)
            </Text>
            <TextInput
              style={styles.serverInput}
              value={serverInput}
              onChangeText={setServerInput}
              placeholder="https://taxitest.appvault.pro:3001"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity style={styles.serverSaveBtn} onPress={handleSaveServer}>
              <Text style={styles.serverSaveBtnText}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* О приложении */}
        <Text style={styles.sectionTitle}>О приложении</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Версия</Text>
            <Text style={styles.infoValue}>{Constants.expoConfig?.version ?? '?'}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Канал обновлений</Text>
            <Text style={styles.infoValue}>
              {channel === 'beta' ? 'Beta' : 'Production'}
            </Text>
          </View>
          <View style={styles.separator} />
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => void handleCheckNow()}
            disabled={checking}
          >
            <Text style={styles.infoLabel}>
              {checking ? 'Проверка...' : 'Проверить обновления'}
            </Text>
            {checking ? (
              <ActivityIndicator size="small" color="#4f46e5" />
            ) : (
              <Ionicons name="refresh" size={18} color="#4f46e5" />
            )}
          </TouchableOpacity>
        </View>

        {/* Разработчику */}
        <Text style={styles.sectionTitle}>Разработчику</Text>
        <View style={styles.card}>
          <SettingSwitch
            label="Beta-канал обновлений"
            value={betaChannel}
            onValueChange={handleBetaToggle}
          />
        </View>
        <Text style={styles.hint}>
          Включив beta-канал, вы будете получать предварительные версии
          приложения раньше остальных. Могут быть нестабильны.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Вспомогательные компоненты ──────────────────────────────────────── */

function SettingSwitch({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#d1d5db', true: '#a5b4fc' }}
        thumbColor={value ? '#4f46e5' : '#f4f3f4'}
      />
    </View>
  );
}

/* ─── Стили ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    padding: 16,
    gap: 8,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginHorizontal: 14,
  },

  // Theme
  themeRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 14,
  },
  themeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  themeText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Switch
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  switchLabel: {
    fontSize: 15,
    color: '#374151',
  },

  // Radio
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  radioLabel: {
    fontSize: 15,
    color: '#374151',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterActive: {
    borderColor: '#4f46e5',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4f46e5',
  },

  // Server
  serverRow: {
    padding: 14,
    gap: 8,
  },
  serverHint: {
    fontSize: 12,
    color: '#9ca3af',
  },
  serverInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#374151',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  serverSaveBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  serverSaveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  infoLabel: {
    fontSize: 15,
    color: '#374151',
  },
  infoValue: {
    fontSize: 14,
    color: '#9ca3af',
  },

  // Hint (под секцией разработчика)
  hint: {
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 15,
    paddingHorizontal: 4,
    marginTop: 4,
  },
});
