/**
 * @file: app/(main)/settings/appearance.tsx
 * @description:
 *   Оформление: светлая, тёмная или как в телефоне.
 * @dependencies: @/components/settings, @/stores/settings.store
 * @created: 2026-09-10 (1.5.53)
 */

import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { useSettingsStore } from '@/stores/settings.store';
import { useThemedStyles } from '@/lib/theme';
import { Screen } from '@/components/ui';
import {
  ChoiceRow,
  Section,
  SectionHint,
  createSettingsStyles,
} from '@/components/settings';

const THEME_MODES = [
  { value: 'system', label: 'Как в телефоне', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Светлая', icon: 'sunny-outline' },
  { value: 'dark', label: 'Тёмная', icon: 'moon-outline' },
] as const;

export default function AppearanceSettingsScreen() {
  const styles = useThemedStyles(createSettingsStyles);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Оформление' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Тема">
          <ChoiceRow options={THEME_MODES} value={themeMode} onChange={setThemeMode} />
          <SectionHint>
            Ночью тёмная тема не слепит, а днём на солнце светлая читается лучше.
            «Как в телефоне» переключает вместе с системной.
          </SectionHint>
        </Section>
      </ScrollView>
    </Screen>
  );
}
