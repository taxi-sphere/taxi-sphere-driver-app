/**
 * @file: src/hooks/useKeepScreenOn.ts
 * @description:
 *   Не давать экрану гаснуть, пока приложение открыто.
 *
 *   ЗАЧЕМ. Водитель смотрит на карту и на карточку заказа, а экран уходит в
 *   сон через полминуты — и за рулём приходится тыкать в телефон, чтобы
 *   увидеть, куда ехать.
 *
 *   ПОЧЕМУ ЭТО ПОЯВИЛОСЬ ТОЛЬКО В 1.5.42. Настройка `keepScreenOn` лежала в
 *   сторе с v1.5.19, пакет `expo-keep-awake` стоял в зависимостях — и ни
 *   одной строчки, которая бы это применяла, и ни одного переключателя в
 *   интерфейсе. Настройка хранилась и не делала ничего; ровно та же болезнь,
 *   что была у настроек гео-зон.
 *
 *   Блокировка снимается при выключении настройки и при размонтировании —
 *   иначе экран остался бы гореть после выхода из рабочей части приложения.
 *
 * @dependencies: expo-keep-awake, @/stores/settings.store
 * @created: 2026-09-08 (1.5.42)
 */

import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSettingsStore } from '@/stores/settings.store';

/**
 * Тег блокировки. Свой, а не общий: с тегом снятие не трогает чужие
 * блокировки, которые может ставить сам Expo.
 */
const TAG = 'ts-driver-screen';

export function useKeepScreenOn(): void {
  const enabled = useSettingsStore((s) => s.keepScreenOn);

  useEffect(() => {
    if (!enabled) return;

    // Промах здесь не должен ронять экран: не удержали подсветку — обидно,
    // но работать приложению не мешает.
    void activateKeepAwakeAsync(TAG).catch(() => {});

    return () => {
      try {
        deactivateKeepAwake(TAG);
      } catch {
        // Блокировки могло не быть — снимать нечего.
      }
    };
  }, [enabled]);
}
