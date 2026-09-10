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
 *   ВЫБОР СИГНАЛА ЕСТЬ У ЗАКАЗА И У СПИСКА. Их слушают весь день. Отмена и
 *   сообщение звучат своим тембром всегда: два сигнала, которые путают
 *   между собой, хуже одного.
 *
 *   ЗАКАЗ В СПИСКЕ — ОТДЕЛЬНО ОТ ЛИЧНОГО ПРЕДЛОЖЕНИЯ (1.5.54). «Вам
 *   предложили заказ, ответьте за двадцать секунд» и «в городе появился
 *   заказ» требуют разного, и звучать обязаны по-разному. Предзаказ по
 *   умолчанию молчит: его берут, когда планируют смену, а не бросая руль.
 *
 * @dependencies: @/components/settings, @/services/sound.service
 * @created: 2026-09-10 (1.5.53)
 * @updated: 2026-09-10 (1.5.54 — сигналы о заказе и предзаказе в свободных)
 */

import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import {
  useSettingsStore,
  type ListSoundTone,
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

/**
 * Тембры сигнала о заказе в СПИСКЕ — свой набор, не пересекающийся с
 * сигналом о личном предложении: «ответь за двадцать секунд» и «посмотри
 * при случае» водитель обязан различать не глядя.
 */
const LIST_TONES: readonly { value: ListSoundTone; label: string }[] = [
  { value: 'soft', label: 'Мягкий' },
  { value: 'double', label: 'Двойной' },
  { value: 'bell', label: 'Звонкий' },
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
    soundOrderAvailable,
    soundOrderAvailableScheduled,
    soundToneAvailable,
    soundToneAvailableScheduled,
    soundVariant,
    soundVolume,
    vibrationEnabled,
    setSoundEnabled,
    setSoundOrderCanceled,
    setSoundChatMessage,
    setSoundOrderAvailable,
    setSoundOrderAvailableScheduled,
    setSoundToneAvailable,
    setSoundToneAvailableScheduled,
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
            label="Заказ предложили вам"
            hint="Слышен и при выключенном звонке, музыку приглушает на секунду"
            value={soundEnabled}
            onValueChange={toggleWithPreview(setSoundEnabled, 'new-order')}
          />
          <Divider />
          <SettingSwitch
            label="Заказ появился в свободных"
            hint="Взять может кто угодно — сигнал тише и короче"
            value={soundOrderAvailable}
            onValueChange={toggleWithPreview(setSoundOrderAvailable, 'order-available')}
          />
          <Divider />
          <SettingSwitch
            label="Предзаказ появился в свободных"
            hint="Поездка на будущее: время подачи указано в карточке"
            value={soundOrderAvailableScheduled}
            onValueChange={toggleWithPreview(
              setSoundOrderAvailableScheduled,
              'order-available-scheduled',
            )}
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

        <Section title="Сигнал заказа в свободных">
          <ChoiceRow
            options={LIST_TONES}
            value={soundToneAvailable}
            onChange={(value) => {
              setSoundToneAvailable(value);
              void playSound('order-available', { force: true, tone: value });
            }}
          />
          <SectionHint>
            Нажмите вариант, чтобы послушать. Этот сигнал звучит, когда заказ
            появился в списке — взять его может кто угодно.
          </SectionHint>
        </Section>

        <Section title="Сигнал предзаказа в свободных">
          <ChoiceRow
            options={LIST_TONES}
            value={soundToneAvailableScheduled}
            onChange={(value) => {
              setSoundToneAvailableScheduled(value);
              void playSound('order-available-scheduled', { force: true, tone: value });
            }}
          />
          <SectionHint>
            Стоит выбрать не тот же, что у обычного заказа: тогда по звуку
            понятно, ехать сейчас или заказ на будущее.
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
