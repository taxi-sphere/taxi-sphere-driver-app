/**
 * @file: app/(main)/settings/notifications.tsx
 * @description:
 *   Уведомления и звук: какие события звучат, каким сигналом и как громко.
 *
 *   СИГНАЛ МОЖНО ПОСЛУШАТЬ ПРЯМО ЗДЕСЬ. Иначе первый раз водитель услышит
 *   его в дороге, вместе с заказом, и не будет знать, чего ждать: громко
 *   ли, узнаваемо ли, не перепутает ли с чужим телефоном. Проверить звук в
 *   настройках — обычное дело для любого будильника.
 *
 *   ВЫБОР СИГНАЛА ЕСТЬ ТОЛЬКО У ЗАКАЗА. Его слушают весь день. Отмена и
 *   сообщение звучат своим тембром всегда: два сигнала, которые путают
 *   между собой, хуже одного.
 *
 * @dependencies: @/components/settings, @/services/sound.service
 * @created: 2026-09-10 (1.5.53)
 */

import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import {
  useSettingsStore,
  type SoundVariant,
  type SoundVolume,
} from '@/stores/settings.store';
import { playSound } from '@/services/sound.service';
import { useThemedStyles } from '@/lib/theme';
import { Divider, Screen } from '@/components/ui';
import {
  ChoiceRow,
  Section,
  SectionHint,
  SettingSwitch,
  createSettingsStyles,
} from '@/components/settings';

const VARIANTS: readonly { value: SoundVariant; label: string }[] = [
  { value: 'classic', label: 'Обычный' },
  { value: 'double', label: 'Двойной' },
  { value: 'insistent', label: 'Резкий' },
];

const VOLUMES: readonly { value: SoundVolume; label: string }[] = [
  { value: 'low', label: 'Тише' },
  { value: 'normal', label: 'Обычно' },
  { value: 'high', label: 'Громче' },
];

export default function NotificationSettingsScreen() {
  const styles = useThemedStyles(createSettingsStyles);

  const {
    soundEnabled,
    soundOrderCanceled,
    soundChatMessage,
    soundVariant,
    soundVolume,
    vibrationEnabled,
    setSoundEnabled,
    setSoundOrderCanceled,
    setSoundChatMessage,
    setSoundVariant,
    setSoundVolume,
    setVibrationEnabled,
  } = useSettingsStore();

  /** Включили сигнал — сразу его и проигрываем, чтобы было слышно, какой. */
  const toggleWithPreview =
    (setter: (v: boolean) => void, event: Parameters<typeof playSound>[0]) =>
    (next: boolean) => {
      setter(next);
      if (next) void playSound(event, { force: true });
    };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Уведомления и звук' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Что звучит">
          <SettingSwitch
            label="Новый заказ"
            hint="Слышен и при выключенном звонке, музыку приглушает на секунду"
            value={soundEnabled}
            onValueChange={toggleWithPreview(setSoundEnabled, 'new-order')}
          />
          <Divider />
          <SettingSwitch
            label="Заказ отменили"
            hint="Чтобы не ехать на подачу зря"
            value={soundOrderCanceled}
            onValueChange={toggleWithPreview(setSoundOrderCanceled, 'order-canceled')}
          />
          <Divider />
          <SettingSwitch
            label="Сообщение диспетчера"
            hint="Короткий тихий сигнал"
            value={soundChatMessage}
            onValueChange={toggleWithPreview(setSoundChatMessage, 'chat-message')}
          />
        </Section>

        <Section title="Сигнал нового заказа">
          <ChoiceRow
            options={VARIANTS}
            value={soundVariant}
            onChange={(value) => {
              setSoundVariant(value);
              // Слушаем выбранный вариант сразу — ради этого выбор и есть.
              void playSound('new-order', { force: true, variant: value });
            }}
          />
          <SectionHint>
            Нажмите вариант, чтобы послушать. «Резкий» длиннее и настойчивее —
            для шумной машины.
          </SectionHint>
        </Section>

        <Section title="Громкость сигналов">
          <ChoiceRow
            options={VOLUMES}
            value={soundVolume}
            onChange={(value) => {
              setSoundVolume(value);
              void playSound('new-order', { force: true });
            }}
          />
          <SectionHint>
            Считается от громкости телефона: если он на минимуме, «Громче» его не
            перекричит.
          </SectionHint>
        </Section>

        <Section title="Вибрация">
          <SettingSwitch
            label="Вибрация"
            hint="Подтверждение нажатий и сигнал о новом заказе"
            value={vibrationEnabled}
            onValueChange={setVibrationEnabled}
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}
