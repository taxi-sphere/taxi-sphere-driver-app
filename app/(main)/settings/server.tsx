/**
 * @file: app/(main)/settings/server.tsx
 * @description:
 *   Сервер и обновления: адрес сервера, проверка обновлений, beta-канал.
 *
 *   Адрес сервера — настройка для наладки, а не для водителя, поэтому она
 *   спрятана в раздел и снабжена предупреждением: неверный адрес отрезает
 *   приложение от службы целиком.
 *
 * @dependencies:
 *   - @/hooks/useAppUpdate
 *   - @/stores/update-request.store
 *   - @/components/settings
 * @created: 2026-09-10 (1.5.53)
 */

import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSettingsStore } from '@/stores/settings.store';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useUpdateRequestStore } from '@/stores/update-request.store';
import { usableChangelog } from '@/lib/utils';
import { icon as iconTokens, useTheme, useThemedStyles } from '@/lib/theme';
import {
  AppText,
  Button,
  Divider,
  Screen,
  useConfirm,
  useNotify,
} from '@/components/ui';
import {
  InfoRow,
  Section,
  SectionHint,
  SettingSwitch,
  createSettingsStyles,
} from '@/components/settings';

export default function ServerSettingsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createSettingsStyles);
  const confirm = useConfirm();
  const notify = useNotify();

  const { serverUrl, setServerUrl, betaChannel, setBetaChannel } = useSettingsStore();
  const { channel, latest, hasUpdate, checking, refresh } = useAppUpdate();
  const requestUpdate = useUpdateRequestStore((st) => st.request);

  const [serverInput, setServerInput] = useState(serverUrl);

  const handleSaveServer = () => {
    const url = serverInput.trim().replace(/\/$/, '');
    setServerUrl(url);
    void notify('Сохранено', url ? `Сервер: ${url}` : 'Используется автоопределение');
  };

  const handleBetaToggle = async (next: boolean) => {
    if (next) {
      // Явное согласие: бета может быть нестабильной, и водитель должен
      // понимать, на что соглашается.
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
        // Скачивание ведёт AppUpdateNotifier — он смонтирован в корневом
        // layout и показывает модалку с прогрессом.
        requestUpdate(latest);
      }
    } else {
      await notify('Обновлений нет', 'У вас последняя версия.');
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Сервер и обновления' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Обновления">
          <InfoRow label="Версия" value={Constants.expoConfig?.version ?? '?'} />
          <Divider />
          <InfoRow label="Канал" value={channel === 'beta' ? 'Beta' : 'Основной'} />
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
          <Divider />
          <SettingSwitch
            label="Beta-канал"
            hint="Предварительные версии раньше остальных. Могут быть нестабильны."
            value={betaChannel}
            onValueChange={(next) => void handleBetaToggle(next)}
          />
        </Section>

        <Section title="Адрес сервера">
          <View style={styles.serverBlock}>
            <TextInput
              style={styles.input}
              value={serverInput}
              onChangeText={setServerInput}
              placeholder="Автоопределение"
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
          <SectionHint>
            Меняйте только по указанию службы: с неверным адресом приложение
            перестанет получать заказы. Пустое поле — адрес определяется сам.
          </SectionHint>
        </Section>
      </ScrollView>
    </Screen>
  );
}
