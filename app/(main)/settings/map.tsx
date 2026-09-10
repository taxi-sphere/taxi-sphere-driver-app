/**
 * @file: app/(main)/settings/map.tsx
 * @description:
 *   Карта и навигация: разворот карты, слежение за машиной, внешний
 *   навигатор, поведение экрана.
 *
 *   «Не гасить экран» живёт здесь, а не в оформлении: водитель включает
 *   его ради карты — чтобы маршрут был виден, пока едешь.
 *
 * @dependencies: @/components/settings, @/stores/settings.store
 * @created: 2026-09-10 (1.5.53)
 */

import { View, Pressable, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '@/stores/settings.store';
import { haptics } from '@/lib/haptics';
import {
  icon as iconTokens,
  useTheme,
  useThemedStyles,
} from '@/lib/theme';
import { AppText, Divider, Screen } from '@/components/ui';
import {
  ChoiceRow,
  Section,
  SectionHint,
  SettingSwitch,
  createSettingsStyles,
} from '@/components/settings';

/**
 * Как повёрнута карта заказа.
 *
 * «Авто» здесь нет намеренно: разворачивать карту туда-сюда на каждой
 * остановке — верный способ сбить водителя с толку. Два честных режима,
 * между которыми он выбирает сам.
 */
const MAP_ORIENTATIONS = [
  { value: 'course', label: 'По курсу', icon: 'navigate-outline' },
  { value: 'north', label: 'Север сверху', icon: 'compass-outline' },
] as const;

const NAVIGATORS = [
  { value: 'yandex', label: 'Яндекс Навигатор' },
  { value: '2gis', label: '2ГИС' },
  { value: 'google', label: 'Google Maps' },
] as const;

export default function MapSettingsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createSettingsStyles);

  const {
    mapOrientation,
    setMapOrientation,
    autoFollowMap,
    setAutoFollowMap,
    keepScreenOn,
    setKeepScreenOn,
    preferredNavigator,
    setPreferredNavigator,
  } = useSettingsStore();

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Карта и навигация' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Разворот карты">
          <ChoiceRow
            options={MAP_ORIENTATIONS}
            value={mapOrientation}
            onChange={setMapOrientation}
          />
          <SectionHint>
            {mapOrientation === 'course'
              ? 'Карта разворачивается по движению: дорога впереди всегда вверху, стрелка смотрит вверх.'
              : 'Север всегда сверху. Стрелка показывает, куда вы едете.'}
          </SectionHint>
        </Section>

        <Section title="Слежение">
          <SettingSwitch
            label="Карта едет за машиной"
            hint="Включено — карта сама возвращается к машине, когда вы поехали дальше. Выключено — стоит там, куда вы её поставили, а кнопка с прицелом ведёт карту по нажатию."
            value={autoFollowMap}
            onValueChange={setAutoFollowMap}
          />
          {/* 1.5.45: без этой строки водитель не узнает ни того, что карту
            * можно отодвинуть, ни того, что она вернётся сама. Поведение
            * новое, кнопка возврата появляется только когда карта отпущена —
            * то есть увидеть её заранее нельзя.
            * 1.5.51: текст зависит от переключателя выше — иначе при
            * выключенном слежении подсказка обещала бы возврат, которого
            * больше не будет. */}
          <SectionHint>
            {autoFollowMap
              ? 'В заказе карта едет за машиной. Отодвиньте её пальцем — останется, как поставили, и вернётся к машине, когда поедете дальше. Кнопка со значком прицела возвращает сразу.'
              : 'Карта в заказе остаётся там, куда вы её поставили. Кнопка со значком прицела ведёт её за машиной, пока вы снова не отодвинете карту пальцем.'}
          </SectionHint>
        </Section>

        <Section title="Внешний навигатор">
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
                  name={preferredNavigator === nav.value ? 'radio-button-on' : 'radio-button-off'}
                  size={iconTokens.lg}
                  color={preferredNavigator === nav.value ? colors.primary : colors.textMuted}
                />
              </Pressable>
            </View>
          ))}
          <SectionHint>
            Кнопка «Навигатор» в заказе откроет выбранное приложение.
          </SectionHint>
        </Section>

        <Section title="Экран">
          <SettingSwitch
            label="Не гасить экран"
            hint="Пока приложение открыто, экран не уходит в сон. Выключите, если бережёте заряд."
            value={keepScreenOn}
            onValueChange={setKeepScreenOn}
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}
