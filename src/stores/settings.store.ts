/**
 * @file: src/stores/settings.store.ts
 * @description:
 *   Zustand store для пользовательских настроек водителя.
 *   Персистенция через AsyncStorage.
 * @dependencies: zustand, @react-native-async-storage/async-storage
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-10 (1.5.54 — звук на заказ в свободных, отдельно для предзаказа)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MapOrientation } from '@/lib/map-orientation';

type NavigatorApp = 'yandex' | '2gis' | 'google';
type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Какой сигнал играет на новый заказ.
 *
 * Три, а не десять: в машине с музыкой и открытым окном решает громкость,
 * а не тембр. Отличаться сигнал должен от ЧУЖИХ телефонов в потоке — для
 * этого хватает трёх непохожих.
 */
export type SoundVariant = 'classic' | 'double' | 'insistent';

/** Насколько громко играет сигнал относительно системной громкости. */
export type SoundVolume = 'low' | 'normal' | 'high';

/**
 * Сигнал о заказе, ПОЯВИВШЕМСЯ В СПИСКЕ свободных.
 *
 * Отдельный набор от `SoundVariant`, а не тот же самый, и это важно.
 * «Тебе предложили заказ, ответь за 20 секунд» и «в городе появился заказ,
 * посмотри при случае» — разные новости, и звучать они обязаны по-разному:
 * общий набор позволил бы выбрать один и тот же тембр обоим, и водитель
 * начал бы дёргаться на каждый чужой заказ.
 */
export type ListSoundTone = 'soft' | 'double' | 'bell';

interface SettingsState {
  serverUrl: string;
  /**
   * Звуковой сигнал о новом заказе.
   *
   * ИСТОРИЯ. Этот переключатель существовал с первой версии и НЕ ЧИТАЛСЯ
   * НИГДЕ: значение сохранялось, и на этом всё заканчивалось. Водитель
   * считал, что звук включён, а заказ приходил молча. В 1.5.52 его убрали
   * как ложное обещание, в 1.5.53 вернули уже рабочим — сигнал играет
   * `@/services/sound.service`.
   *
   * `voiceAlerts` (голосовые оповещения) удалён насовсем: он тоже не
   * читался, но за ним нет функции — только замысел.
   */
  soundEnabled: boolean;
  /**
   * Сигнал, когда диспетчер снял заказ.
   *
   * Отдельно от заказа: водитель едет на подачу и должен узнать об отмене
   * раньше, чем доедет, — но кому-то этот сигнал в потоке мешает.
   */
  soundOrderCanceled: boolean;
  /** Сигнал на сообщение диспетчера. */
  soundChatMessage: boolean;
  /**
   * Сигнал, когда в свободных появился обычный заказ.
   *
   * Не то же, что `soundEnabled`: тот звучит, когда заказ предложили ЛИЧНО
   * и надо отвечать сейчас. Этот — про список: заказ появился в городе,
   * взять его может кто угодно, включая этого водителя.
   */
  soundOrderAvailable: boolean;
  /** Сигнал, когда в свободных появился предзаказ. */
  soundOrderAvailableScheduled: boolean;
  /** Каким тембром звучит появление обычного заказа в списке. */
  soundToneAvailable: ListSoundTone;
  /** Каким тембром звучит появление предзаказа. */
  soundToneAvailableScheduled: ListSoundTone;
  soundVariant: SoundVariant;
  soundVolume: SoundVolume;
  vibrationEnabled: boolean;
  preferredNavigator: NavigatorApp;
  themeMode: ThemeMode;
  lastPhone: string;
  /**
   * v1.99.22+: opt-in на beta-канал обновлений приложения.
   * По умолчанию false — водитель получает только production-релизы.
   * Включается вручную в Settings → «Разработчику». При включении
   * `useAppUpdate` начинает опрашивать `?channel=beta` (с ближайшего
   * старта приложения).
   */
  betaChannel: boolean;
  /**
   * v1.5.19: не гасить экран, пока приложение открыто.
   *
   * По умолчанию ВКЛЮЧЕНО: водитель смотрит на маршрут и на карточку
   * заказа, а гаснущий каждые полминуты экран заставляет тыкать в телефон
   * за рулём. Выключатель оставлен для тех, кто работает с зарядкой в
   * дефиците — экран самый прожорливый потребитель в приложении.
   */
  keepScreenOn: boolean;
  /**
   * 1.5.51: ехать ли карте за машиной сама, без просьбы.
   *
   * По умолчанию ВКЛЮЧЕНО — так вело себя приложение с 1.5.45, и для
   * поездки это верно: водителю нужна дорога впереди, а не общий план.
   *
   * Выключатель нужен тем, кто держит телефон как обзорную карту и ведёт
   * машину по своей памяти: у них слежение отбирает карту каждый раз,
   * когда они её отодвинули. При выключенной настройке карта стоит там,
   * куда её поставили, а кнопка с прицелом включает слежение вручную —
   * то есть становится не «вернуть», а «вести».
   */
  autoFollowMap: boolean;
  /**
   * 1.5.42: как повёрнута карта заказа.
   *
   * `course` — по курсу, как в навигаторе: дорога впереди всегда вверху,
   * стрелка водителя смотрит вверх. `north` — север сверху, как было до
   * 1.5.42: удобнее для обзора обстановки, но требует держать в голове,
   * куда сейчас едешь.
   *
   * По умолчанию `course`: встроенная карта чаще нужна на ходу, а не для
   * разглядывания района.
   */
  mapOrientation: MapOrientation;

  setServerUrl: (url: string) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setSoundOrderCanceled: (enabled: boolean) => void;
  setSoundChatMessage: (enabled: boolean) => void;
  setSoundOrderAvailable: (enabled: boolean) => void;
  setSoundOrderAvailableScheduled: (enabled: boolean) => void;
  setSoundToneAvailable: (tone: ListSoundTone) => void;
  setSoundToneAvailableScheduled: (tone: ListSoundTone) => void;
  setSoundVariant: (variant: SoundVariant) => void;
  setSoundVolume: (volume: SoundVolume) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setPreferredNavigator: (nav: NavigatorApp) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLastPhone: (phone: string) => void;
  setBetaChannel: (enabled: boolean) => void;
  setKeepScreenOn: (enabled: boolean) => void;
  setAutoFollowMap: (enabled: boolean) => void;
  setMapOrientation: (orientation: MapOrientation) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: '',
      soundEnabled: true,
      soundOrderCanceled: true,
      soundChatMessage: true,
      soundOrderAvailable: true,
      // Предзаказ по умолчанию МОЛЧИТ: он не срочный — его берут, когда
      // планируют смену, а не бросая руль. Кому нужно, включает сам.
      soundOrderAvailableScheduled: false,
      soundToneAvailable: 'double',
      // Другой тембр по умолчанию, чем у обычного заказа: если водитель
      // включит оба, он должен различать их не глядя.
      soundToneAvailableScheduled: 'bell',
      soundVariant: 'classic',
      soundVolume: 'normal',
      vibrationEnabled: true,
      preferredNavigator: 'yandex',
      themeMode: 'system',
      lastPhone: '',
      betaChannel: false,
      keepScreenOn: true,
      autoFollowMap: true,
      mapOrientation: 'course',

      setServerUrl: (serverUrl) => set({ serverUrl }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setSoundOrderCanceled: (soundOrderCanceled) => set({ soundOrderCanceled }),
      setSoundChatMessage: (soundChatMessage) => set({ soundChatMessage }),
      setSoundOrderAvailable: (soundOrderAvailable) => set({ soundOrderAvailable }),
      setSoundOrderAvailableScheduled: (soundOrderAvailableScheduled) =>
        set({ soundOrderAvailableScheduled }),
      setSoundToneAvailable: (soundToneAvailable) => set({ soundToneAvailable }),
      setSoundToneAvailableScheduled: (soundToneAvailableScheduled) =>
        set({ soundToneAvailableScheduled }),
      setSoundVariant: (soundVariant) => set({ soundVariant }),
      setSoundVolume: (soundVolume) => set({ soundVolume }),
      setVibrationEnabled: (vibrationEnabled) => set({ vibrationEnabled }),
      setPreferredNavigator: (preferredNavigator) =>
        set({ preferredNavigator }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setLastPhone: (lastPhone) => set({ lastPhone }),
      setBetaChannel: (betaChannel) => set({ betaChannel }),
      setKeepScreenOn: (keepScreenOn) => set({ keepScreenOn }),
      setAutoFollowMap: (autoFollowMap) => set({ autoFollowMap }),
      setMapOrientation: (mapOrientation) => set({ mapOrientation }),
    }),
    {
      name: 'ts-driver-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
