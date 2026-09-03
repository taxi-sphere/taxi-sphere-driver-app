/**
 * @file: app/(main)/settings/index.tsx
 * @description:
 *   Экран настроек: звук, вибрация, голосовые оповещения,
 *   выбор навигатора, версия приложения.
 *
 *   v1.5.7: развёрнутый диалог «Проверить обновления» — показывает
 *   текущую и новую версию, changelog, размер APK, две кнопки
 *   Отмена / Обновить (последняя сразу запускает downloadAndInstallApk
 *   без ухода на другой экран). Раньше был минимальный alert без действий.
 *
 * @dependencies:
 *   - settings.store
 *   - useAppUpdate
 *   - apk-installer (downloadAndInstallApk)
 *   v1.5.17: экран переведён на тему и общие компоненты. Отдельная ирония
 *   прежней версии: именно здесь стоял переключатель тёмной темы — и сам
 *   этот экран на неё не реагировал, как и остальные шестнадцать.
 *
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — тема, крупные строки, общие компоненты)
 */

import { useState } from 'react';
import {
  View,
  Switch,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSettingsStore } from '@/stores/settings.store';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useUpdateRequestStore } from '@/stores/update-request.store';
import { haptics } from '@/lib/haptics';
import { usableChangelog } from '@/lib/utils';
import {
  icon as iconTokens,
  radius,
  spacing,
  text,
  touch,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';
import { AppText, Button, Divider, Screen, Surface , useConfirm, useNotify } from '@/components/ui';


type NavigatorApp = 'yandex' | '2gis' | 'google';

const NAVIGATORS: { value: NavigatorApp; label: string }[] = [
  { value: 'yandex', label: 'Яндекс Навигатор' },
  { value: '2gis', label: '2ГИС' },
  { value: 'google', label: 'Google Maps' },
];

/** Варианты темы — подпись и значок для каждого. */
const THEME_MODES = [
  { value: 'system', label: 'Авто', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Светлая', icon: 'sunny-outline' },
  { value: 'dark', label: 'Тёмная', icon: 'moon-outline' },
] as const;

export default function SettingsScreen() {
  const confirm = useConfirm();
  const notify = useNotify();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
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
  const requestUpdate = useUpdateRequestStore((st) => st.request);

  const [serverInput, setServerInput] = useState(serverUrl);

  const handleBetaToggle = async (next: boolean) => {
    if (next) {
      // Explicit opt-in — предупреждаем о риске
      const ok = await confirm({
        title: 'Включить beta-канал?',
        message:
          'Beta-версии могут содержать нестабильные функции и баги. ' +
          'Обычно они выпускаются на несколько дней раньше основных релизов ' +
          'для проверки. Если что-то сломается — выключите этот переключатель ' +
          'и переустановите основную (production) версию через админку.',
        confirmLabel: 'Включить',
        variant: 'danger',
      });
      if (ok) {
        setBetaChannel(true);
        // Немедленно перезапросить последнюю версию в новом канале
        void refresh();
      }
    } else {
      setBetaChannel(false);
      void refresh();
    }
  };

  const handleCheckNow = async () => {
    await refresh();
    if (hasUpdate && latest) {
      // v1.5.7: развёрнутый диалог со сравнением версий, changelog'ом и
      // двумя кнопками. Раньше был минимальный alert без действий —
      // приходилось закрывать настройки и жать «Обновить» в баннере.
      const currentVersion = Constants.expoConfig?.version ?? '—';
      const sizeMb = latest.apkSizeBytes
        ? Math.round(latest.apkSizeBytes / 1024 / 1024)
        : null;
      const parts = [
        `Текущая версия: ${currentVersion}`,
        `Новая версия: ${latest.latestVersion}`,
        sizeMb ? `Размер: ~${sizeMb} МБ` : null,
        // Ссылку на GitHub вместо описания водителю не показываем — см.
        // usableChangelog.
        usableChangelog(latest.changelog)
          ? `\nЧто нового:\n${usableChangelog(latest.changelog)}`
          : null,
      ].filter(Boolean);
      const ok = await confirm({
        title: 'Доступно обновление',
        message: parts.join('\n'),
        confirmLabel: 'Обновить',
      });
      if (ok) {
        // v1.5.11: делегируем скачивание AppUpdateNotifier'у — он смонтирован
        // в корневом layout и показывает модалку с прогрессом. Раньше здесь
        // вызывался downloadAndInstallApk напрямую, без колбэка прогресса:
        // водитель жал «Обновить», и 100 МБ качались вслепую.
        requestUpdate(latest);
      }
    } else {
      await notify('Обновлений нет', 'У вас последняя версия.');
    }
  };

  const handleSaveServer = () => {
    const url = serverInput.trim().replace(/\/$/, '');
    setServerUrl(url);
    void notify('Сохранено', url ? `Сервер: ${url}` : 'Используется автоопределение');
  };

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Уведомления">
          <SettingSwitch label="Звук" value={soundEnabled} onValueChange={setSoundEnabled} />
          <Divider />
          <SettingSwitch
            label="Вибрация"
            hint="Подтверждение нажатий и сигнал о новом заказе"
            value={vibrationEnabled}
            onValueChange={setVibrationEnabled}
          />
          <Divider />
          <SettingSwitch
            label="Голосовые оповещения"
            value={voiceAlerts}
            onValueChange={setVoiceAlerts}
          />
        </Section>

        <Section title="Тема оформления">
          <View style={styles.themeRow}>
            {THEME_MODES.map((mode) => {
              const active = themeMode === mode.value;
              return (
                <Pressable
                  key={mode.value}
                  style={[
                    styles.themeButton,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primarySoft : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    haptics.tap();
                    setThemeMode(mode.value);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Тема: ${mode.label}`}
                >
                  <Ionicons
                    name={mode.icon}
                    size={iconTokens.md}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <AppText
                    variant="label"
                    weight={active ? '700' : '500'}
                    tone={active ? 'brand' : 'muted'}
                  >
                    {mode.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Навигатор">
          {NAVIGATORS.map((nav, index) => (
            <View key={nav.value}>
              {index > 0 && <Divider />}
              <Pressable
                style={styles.row}
                onPress={() => {
                  haptics.tap();
                  setPreferredNavigator(nav.value);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: preferredNavigator === nav.value }}
                accessibilityLabel={nav.label}
              >
                <AppText variant="body">{nav.label}</AppText>
                <Ionicons
                  name={
                    preferredNavigator === nav.value ? 'radio-button-on' : 'radio-button-off'
                  }
                  size={iconTokens.lg}
                  color={preferredNavigator === nav.value ? colors.primary : colors.textMuted}
                />
              </Pressable>
            </View>
          ))}
        </Section>

        <Section title="Сервер">
          <View style={styles.serverBlock}>
            <AppText variant="label" tone="muted">
              Адрес сервера — оставьте пустым для автоопределения
            </AppText>
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
            <Button onPress={handleSaveServer} variant="secondary" fullWidth>
              Сохранить
            </Button>
          </View>
        </Section>

        <Section title="О приложении">
          <InfoRow label="Версия" value={Constants.expoConfig?.version ?? '?'} />
          <Divider />
          <InfoRow label="Канал обновлений" value={channel === 'beta' ? 'Beta' : 'Production'} />
          <Divider />
          <Pressable
            style={styles.row}
            onPress={() => void handleCheckNow()}
            disabled={checking}
            accessibilityRole="button"
            accessibilityLabel="Проверить обновления"
          >
            <AppText variant="body" tone="brand">
              {checking ? 'Проверяю…' : 'Проверить обновления'}
            </AppText>
            {checking ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={iconTokens.md} color={colors.primary} />
            )}
          </Pressable>
        </Section>

        <Section title="Разработчику">
          <SettingSwitch
            label="Beta-канал обновлений"
            hint="Предварительные версии раньше остальных. Могут быть нестабильны."
            value={betaChannel}
            onValueChange={handleBetaToggle}
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}

/* ─── Вспомогательные компоненты ──────────────────────────────────────── */

/** Заголовок раздела плюс карточка с его содержимым. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.section}>
      <AppText variant="overline" tone="muted" style={styles.sectionTitle}>
        {title}
      </AppText>
      <Surface level={1} padded={false} style={styles.card}>
        {children}
      </Surface>
    </View>
  );
}

function SettingSwitch({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText variant="body">{label}</AppText>
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          // Вибрация до записи в стор: иначе выключение «Вибрации» само
          // себя и заглушит, и подтверждения нажатия водитель не получит.
          haptics.tap();
          onValueChange(next);
        }}
        trackColor={{ false: colors.borderStrong, true: colors.primarySoft }}
        thumbColor={value ? colors.primary : colors.surface}
        accessibilityLabel={label}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row}>
      <AppText variant="body" tone="secondary">
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

/* ─── Стили ─────────────────────────────────────────────────────────── */

const createStyles = (t: Theme) =>
  StyleSheet.create({
    content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl + spacing.lg },
    section: { gap: spacing.sm },
    sectionTitle: { paddingHorizontal: spacing.xs },
    card: { overflow: 'hidden' },
    // Минимум 56: строки настроек жмут пальцем, а не курсором.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      minHeight: touch.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    rowText: { flex: 1, gap: 2 },

    themeRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
    themeButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
      minHeight: touch.primary,
    },

    serverBlock: { padding: spacing.lg, gap: spacing.md },
    input: {
      height: 52,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      fontSize: text.body.fontSize,
      color: t.colors.textPrimary,
      backgroundColor: t.colors.surfaceSunken,
    },
  });
