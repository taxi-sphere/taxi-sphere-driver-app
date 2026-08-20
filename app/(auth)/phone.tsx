/**
 * @file: app/(auth)/phone.tsx
 * @description:
 *   Экран входа: телефон + пароль.
 *   Единственный экран авторизации для водительского приложения.
 * @dependencies: useAuth, expo-router
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-13 14:00:00
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useLogin } from '@/hooks/useAuth';
import { useSettingsStore } from '@/stores/settings.store';

export default function LoginScreen() {
  const { serverUrl, setServerUrl, lastPhone } = useSettingsStore();
  const [phone, setPhone] = useState(lastPhone || '+7');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const login = useLogin();
  const [serverInput, setServerInput] = useState(serverUrl);

  const handleLogin = () => {
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 11) {
      Alert.alert('Ошибка', 'Введите корректный номер телефона');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Ошибка', 'Введите пароль');
      return;
    }

    login.mutate(
      { phone: cleaned, password },
      {
        onError: (err) => {
          const message =
            err instanceof Error ? err.message : 'Неверный телефон или пароль';
          Alert.alert('Ошибка входа', message);
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Taxi Sphere</Text>
          <Text style={styles.subtitle}>Приложение водителя</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Номер телефона</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+7 900 000 00 00"
            keyboardType="phone-pad"
            maxLength={20}
            autoFocus
            editable={!login.isPending}
          />

          <Text style={styles.label}>Пароль</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Введите пароль"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!login.isPending}
              onSubmitEditing={handleLogin}
              returnKeyType="go"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color="#9ca3af"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, login.isPending && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={login.isPending}
            activeOpacity={0.8}
          >
            {login.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Войти</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Пароль выдаётся администратором службы
        </Text>

        {/* Настройки сервера */}
        <TouchableOpacity
          style={styles.serverToggle}
          onPress={() => setShowServerSettings(!showServerSettings)}
        >
          <Ionicons name="settings-outline" size={14} color="#9ca3af" />
          <Text style={styles.serverToggleText}>Настройки сервера</Text>
          <Ionicons name={showServerSettings ? 'chevron-up' : 'chevron-down'} size={14} color="#9ca3af" />
        </TouchableOpacity>

        {showServerSettings && (
          <View style={styles.serverSection}>
            <TextInput
              style={styles.serverInput}
              value={serverInput}
              onChangeText={setServerInput}
              placeholder="http://192.168.1.100:3003"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity
              style={styles.serverSaveBtn}
              onPress={() => {
                const url = serverInput.trim().replace(/\/$/, '');
                setServerUrl(url);
                Alert.alert('Сохранено', url || 'Автоопределение');
              }}
            >
              <Text style={styles.serverSaveBtnText}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Версия приложения */}
        <Text style={styles.versionText}>v{Constants.expoConfig?.version ?? '?'}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#111827',
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 24,
  },
  serverToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    padding: 8,
  },
  serverToggleText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  serverSection: {
    gap: 8,
    marginTop: 4,
  },
  serverInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#374151',
    backgroundColor: '#f9fafb',
  },
  serverSaveBtn: {
    backgroundColor: '#6b7280',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  serverSaveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    color: '#d1d5db',
    fontSize: 12,
    marginTop: 32,
  },
});
