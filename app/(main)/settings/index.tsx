/**
 * @file: app/(main)/settings/index.tsx
 * @description:
 *   Настройки: список разделов.
 *
 *   ПОЧЕМУ РАЗДЕЛЫ, А НЕ ОДИН ДЛИННЫЙ ЭКРАН (1.5.53). Настроек стало
 *   двадцать, и на одном экране они занимали четыре прокрутки: чтобы
 *   поменять громкость сигнала, водитель пролистывал тему, карту и
 *   навигатор. Сворачиваемые секции здесь не помогают — на телефоне они
 *   добавляют по нажатию к каждому поиску, а закрытая секция ничем не
 *   отличается от отсутствующей.
 *
 *   Разделы устроены как в системных настройках телефона, и это главное их
 *   достоинство: водителю не нужно учиться. Подпись под названием
 *   перечисляет, что внутри, — иначе по словам «Уведомления» и «Сервер»
 *   приходится угадывать.
 *
 * @dependencies:
 *   - @/components/settings
 *   - expo-router
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-10 (1.5.53 — настройки разбиты на разделы)
 */

import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useSettingsStore } from '@/stores/settings.store';
import { useThemedStyles } from '@/lib/theme';
import { Screen } from '@/components/ui';
import { Section, SettingLink, createSettingsStyles } from '@/components/settings';

export default function SettingsScreen() {
  const styles = useThemedStyles(createSettingsStyles);
  const router = useRouter();

  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const vibrationEnabled = useSettingsStore((s) => s.vibrationEnabled);
  const mapOrientation = useSettingsStore((s) => s.mapOrientation);
  const preferredNavigator = useSettingsStore((s) => s.preferredNavigator);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const serverUrl = useSettingsStore((s) => s.serverUrl);

  /**
   * Подписи показывают ТЕКУЩЕЕ состояние, а не список возможностей.
   *
   * «Звук включён · вибрация включена» отвечает на вопрос, ради которого
   * водитель и открыл настройки, — не заходя в раздел.
   */
  const soundSummary = [
    soundEnabled ? 'звук включён' : 'звук выключен',
    vibrationEnabled ? 'вибрация включена' : 'вибрация выключена',
  ].join(' · ');

  const mapSummary = [
    mapOrientation === 'course' ? 'по курсу' : 'север сверху',
    NAVIGATOR_LABELS[preferredNavigator] ?? 'навигатор не выбран',
  ].join(' · ');

  const themeSummary =
    themeMode === 'system' ? 'как в телефоне' : themeMode === 'dark' ? 'тёмная' : 'светлая';

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section>
          <SettingLink
            icon="notifications-outline"
            label="Уведомления и звук"
            hint={soundSummary}
            onPress={() => router.push('/(main)/settings/notifications')}
          />
          <SettingLink
            icon="map-outline"
            label="Карта и навигация"
            hint={mapSummary}
            onPress={() => router.push('/(main)/settings/map')}
          />
          <SettingLink
            icon="color-palette-outline"
            label="Оформление"
            hint={themeSummary}
            onPress={() => router.push('/(main)/settings/appearance')}
          />
        </Section>

        <Section>
          <SettingLink
            icon="server-outline"
            label="Сервер и обновления"
            hint={serverUrl ? serverUrl.replace(/^https?:\/\//, '') : 'автоопределение'}
            onPress={() => router.push('/(main)/settings/server')}
          />
          <SettingLink
            icon="information-circle-outline"
            label="О приложении"
            hint={`Версия ${Constants.expoConfig?.version ?? '?'}`}
            onPress={() => router.push('/(main)/settings/about')}
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}

const NAVIGATOR_LABELS: Record<string, string> = {
  yandex: 'Яндекс Навигатор',
  '2gis': '2ГИС',
  google: 'Google Maps',
};
