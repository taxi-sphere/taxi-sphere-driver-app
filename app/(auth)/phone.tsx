/**
 * @file: app/(auth)/phone.tsx
 * @description:
 *   Экран входа: телефон + пароль.
 *   Единственный экран авторизации для водительского приложения.
 *
 *   v1.5.12: номер нормализуется перед отправкой. Бэкенд ищет пользователя
 *   ТОЧНЫМ совпадением строки (`where: { phone }` в /api/v1/auth/login, без
 *   нормализации на своей стороне), а его zod-схема пропускает и
 *   «79230189196» — то есть запрос уходит и возвращается «Неверный номер или
 *   пароль» при верном пароле. Свои же десять цифр отсекались ещё раньше,
 *   на клиенте, проверкой длины. Теперь принимается любой из привычных
 *   вариантов (10 цифр, через 8, через +7, вставка из контактов), а на сервер
 *   всегда уходит «+7XXXXXXXXXX».
 *
 *   Форматирование по мере ввода сознательно НЕ делается — см. комментарий
 *   у самого поля.
 *   v1.5.17: экран переделан. Это первое, что видит водитель, и выглядел
 *   он как форма из технического задания: белый лист, чёрный заголовок
 *   «Taxi Sphere» обычным текстом, два поля. Теперь сверху фирменный блок с
 *   градиентом и знаком, форма — карточкой на подложке, поля крупные.
 *   Логика входа и разбор номера не менялись.
 *
 * @dependencies: useAuth, expo-router, @/lib/utils, @/lib/theme, @/components/ui
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — редизайн)
 */

import { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useLogin } from '@/hooks/useAuth';
import { useSettingsStore } from '@/stores/settings.store';
import { formatPhoneInput, isPhoneComplete, normalizePhone } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import {
  icon as iconTokens,
  radius,
  spacing,
  text,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';
import { AppText, Button, FadeIn, Gradient, Screen, Surface , useNotify } from '@/components/ui';


export default function LoginScreen() {
  const notify = useNotify();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { serverUrl, setServerUrl, lastPhone } = useSettingsStore();
  const [phone, setPhone] = useState(() => formatPhoneInput(lastPhone));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const login = useLogin();
  const [serverInput, setServerInput] = useState(serverUrl);

  const handleLogin = () => {
    if (!isPhoneComplete(phone)) {
      void notify(
        'Проверьте номер',
        'Нужны все 10 цифр номера после +7. Например: +7 923 018 91 96',
      );
      return;
    }
    if (!password.trim()) {
      void notify('Введите пароль', 'Пароль выдаёт администратор службы.');
      return;
    }

    login.mutate(
      { phone: normalizePhone(phone), password },
      {
        onError: (err) => {
          const message =
            err instanceof Error ? err.message : 'Неверный телефон или пароль';
          void notify('Не удалось войти', message);
        },
      },
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <FadeIn>
            <Gradient radius={radius.xxl} style={styles.hero}>
              <View style={styles.mark}>
                <Ionicons name="car-sport" size={iconTokens.xl} color="#ffffff" />
              </View>
              <AppText variant="title" style={styles.heroTitle}>
                Taxi Sphere
              </AppText>
              <AppText variant="label" style={styles.heroSubtitle}>
                Приложение водителя
              </AppText>
            </Gradient>
          </FadeIn>

          <FadeIn delay={90}>
            <Surface level={1} style={styles.form}>
              <View style={styles.field}>
                <AppText variant="label" tone="secondary">
                  Номер телефона
                </AppText>
                <TextInput
                  style={styles.input}
                  value={phone}
                  // Во время набора значение НЕ переформатируется.
                  //
                  // Пробовали маску (v1.5.12, проверено на эмуляторе): контролируемое
                  // поле на Android не переносит курсор в конец при смене value —
                  // он остаётся на прежнем смещении, и каждый следующий символ
                  // вставляется в середину. Набор «9 2 3 0 1» с паузами по две
                  // секунды давал «+7 013 279 79 6». Группировка цифр — косметика,
                  // а ломала она главное, поэтому её здесь нет: поле ведёт себя
                  // нативно, а номер приводится к единому виду при отправке.
                  onChangeText={setPhone}
                  placeholder="+7 900 000 00 00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  maxLength={20}
                  autoFocus
                  editable={!login.isPending}
                  accessibilityLabel="Номер телефона"
                />
              </View>

              <View style={styles.field}>
                <AppText variant="label" tone="secondary">
                  Пароль
                </AppText>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Введите пароль"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!login.isPending}
                    onSubmitEditing={handleLogin}
                    returnKeyType="go"
                    accessibilityLabel="Пароль"
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={spacing.sm}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={iconTokens.lg}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>

              <Button
                onPress={() => {
                  haptics.tap();
                  handleLogin();
                }}
                size="lg"
                fullWidth
                loading={login.isPending}
              >
                Войти
              </Button>

              <AppText variant="caption" tone="muted" center>
                Пароль выдаётся администратором службы
              </AppText>
            </Surface>
          </FadeIn>

          <FadeIn delay={180} style={styles.footer}>
            <Button
              onPress={() => setShowServerSettings(!showServerSettings)}
              variant="ghost"
              size="sm"
              icon={showServerSettings ? 'chevron-up' : 'settings-outline'}
            >
              Настройки сервера
            </Button>

            {showServerSettings && (
              <Surface level={1} style={styles.serverSection}>
                <TextInput
                  style={styles.input}
                  value={serverInput}
                  onChangeText={setServerInput}
                  placeholder="https://taxitest1.appvault.pro"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  accessibilityLabel="Адрес сервера"
                />
                <Button
                  onPress={() => {
                    const url = serverInput.trim().replace(/\/$/, '');
                    setServerUrl(url);
                    void notify('Сохранено', url || 'Автоопределение');
                  }}
                  variant="secondary"
                  fullWidth
                >
                  Сохранить
                </Button>
              </Surface>
            )}

            <AppText variant="caption" tone="muted" center>
              v{Constants.expoConfig?.version ?? '?'}
            </AppText>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.xl,
    },

    hero: {
      alignItems: 'center',
      paddingVertical: spacing.xxxl,
      paddingHorizontal: spacing.xl,
      gap: spacing.xs,
    },
    mark: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.32)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    // Поверх градиента — белый при любой теме.
    heroTitle: { color: '#ffffff' },
    heroSubtitle: { color: 'rgba(255, 255, 255, 0.8)' },

    form: { gap: spacing.lg },
    field: { gap: spacing.sm },
    input: {
      height: 54,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      fontSize: text.subheading.fontSize,
      color: t.colors.textPrimary,
      backgroundColor: t.colors.surfaceSunken,
    },
    passwordRow: { justifyContent: 'center' },
    // Место под кнопку-глаз, чтобы текст пароля под неё не заезжал.
    passwordInput: { paddingRight: 52 },
    eyeButton: {
      position: 'absolute',
      right: spacing.md,
      height: 44,
      width: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },

    footer: { gap: spacing.md, alignItems: 'center' },
    serverSection: { width: '100%', gap: spacing.md },
  });
