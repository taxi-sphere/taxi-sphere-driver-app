/**
 * @file: app/(main)/settings/about.tsx
 * @description:
 *   О приложении: версия, сборка, к какому серверу подключено.
 *
 *   ЗАЧЕМ ЭТО ВОДИТЕЛЮ. Не ему — диспетчеру и наладчику: первый вопрос при
 *   разборе жалобы «какая у вас версия и какой сервер». Экран собирает
 *   ответы в одном месте, чтобы водитель зачитал их по телефону, а не
 *   искал по настройкам.
 *
 * @dependencies: @/components/settings, expo-constants
 * @created: 2026-09-10 (1.5.53)
 */

import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import Constants from 'expo-constants';
import { useSettingsStore } from '@/stores/settings.store';
import { getApiUrl } from '@/lib/constants';
import { useThemedStyles } from '@/lib/theme';
import { Divider, Screen } from '@/components/ui';
import {
  InfoRow,
  Section,
  SectionHint,
  createSettingsStyles,
} from '@/components/settings';

export default function AboutSettingsScreen() {
  const styles = useThemedStyles(createSettingsStyles);
  const serverUrl = useSettingsStore((s) => s.serverUrl);

  const version = Constants.expoConfig?.version ?? '?';
  const androidBuild = Constants.expoConfig?.android?.versionCode;
  const server = (serverUrl || getApiUrl() || '').replace(/^https?:\/\//, '') || '—';

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'О приложении' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Приложение">
          <InfoRow label="Версия" value={version} />
          <Divider />
          <InfoRow label="Сборка" value={androidBuild != null ? String(androidBuild) : '—'} />
          <Divider />
          <InfoRow label="Сервер" value={server} />
          <SectionHint>
            Эти три строки — первое, о чём спросит диспетчер, если что-то пошло не
            так.
          </SectionHint>
        </Section>
      </ScrollView>
    </Screen>
  );
}
