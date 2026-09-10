/**
 * @file: src/services/sound.service.ts
 * @description:
 *   Звуковые сигналы приложения: новый заказ, отмена заказа, сообщение
 *   диспетчера.
 *
 *   ЗАЧЕМ. Водитель за рулём на экран не смотрит, а вибрацию в кармане на
 *   ходу не различает: телефон в держателе, машина трясётся. Заказ висит
 *   секунды, отмена означает, что он едет зря, а сообщение диспетчера
 *   обычно требует ответа сейчас, а не через полчаса.
 *
 *   ЧТО ЗВУЧИТ, А ЧТО НЕТ. Три события, и все три — про действие. Ни
 *   изменение баланса, ни правка адреса звука не получают: сигнал, который
 *   раздаётся часто и ничего не требует, водитель через день выключает
 *   целиком — вместе с теми тремя, ради которых он и нужен.
 *
 *   ВЫБОР СИГНАЛА — ТОЛЬКО ДЛЯ ЗАКАЗА. Его слушают весь день, и он должен
 *   отличаться от чужих телефонов в потоке. Отмена и сообщение звучат
 *   всегда одинаково: своим тембром, чтобы их не путали с заказом.
 *
 *   ГРОМКОСТЬ ВАЖНЕЕ ТЕМБРА. В машине с музыкой и открытым окном решает
 *   именно она, поэтому громкость вынесена в настройки, а мелодий сделано
 *   ровно три, а не десять.
 *
 *   ПОЧЕМУ НЕ СМЕШИВАЕМСЯ С МУЗЫКОЙ, А ПРИГЛУШАЕМ ЕЁ. `duckOthers`
 *   опускает громкость чужого звука на время сигнала и возвращает обратно.
 *   Полная остановка чужого воспроизведения отняла бы у водителя музыку
 *   или навигатор на весь сеанс — за секундный сигнал это слишком дорого.
 *
 *   ИГРОКИ ЖИВУТ ПО ОДНОМУ НА ФАЙЛ. Создание игрока читает и декодирует
 *   файл; делать это в момент, когда заказ уже показан, значит опоздать с
 *   сигналом. Игрок заводится лениво при первом сигнале и дальше только
 *   перематывается в начало.
 *
 *   ВЕРСИИ ЗАКРЕПЛЕНЫ ТОЧНО, без «~», и это не перестраховка.
 *   `expo-audio` тянет за собой `expo-asset`, а тот в реестре ушёл далеко
 *   вперёд: npm поставил в корень `expo-asset@57.0.16` — пакет ИЗ ДРУГОЙ
 *   мажорной ветки SDK, собранный против `expo-modules-core` 57.x.
 *   Автолинковка Expo берёт нативный модуль из корня, и приложение падало
 *   при СТАРТЕ, ещё до первого экрана: `NoClassDefFoundError:
 *   expo/modules/kotlin/types/AnyTypeCache` в `AssetModule`. Сборка при
 *   этом проходила успешно — расхождение видно только на устройстве
 *   (проверено на эмуляторе 10.09.2026). Поэтому `expo-asset` закреплён на
 *   55.0.8 — ровно той версии, что лежит внутри `expo`, — а `expo-audio`
 *   на 55.0.15, под тот же `expo-modules-core`. Поднимать их можно только
 *   вместе с `expo` и только с проверкой ЗАПУСКА на устройстве.
 *
 * @dependencies: expo-audio, @/stores/settings.store
 * @created: 2026-09-10 (1.5.53)
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import {
  useSettingsStore,
  type SoundVariant,
  type SoundVolume,
} from '@/stores/settings.store';
import { driverLogger } from '@/services/logger.service';

/** Что именно звучит. */
export type SoundEvent = 'new-order' | 'order-canceled' | 'chat-message';

/**
 * Файлы сигналов.
 *
 * `require` вычисляется сборщиком статически, поэтому пути перечислены
 * буквально: собрать имя файла из переменной нельзя — в сборку попадёт
 * пустота, и сигнала не будет вовсе.
 */
const SOURCES = {
  'new-order:classic': require('../../assets/sounds/new-order.wav'),
  'new-order:double': require('../../assets/sounds/new-order-double.wav'),
  'new-order:insistent': require('../../assets/sounds/new-order-insistent.wav'),
  'order-canceled': require('../../assets/sounds/order-canceled.wav'),
  'chat-message': require('../../assets/sounds/chat-message.wav'),
} as const;

type SourceKey = keyof typeof SOURCES;

/**
 * Громкость словами → доля от системной.
 *
 * «Тихо» — не шёпот: сигнал, который не слышно в машине, бесполезен, а
 * ниже сорока процентов он теряется в шуме шин.
 */
const VOLUME: Record<SoundVolume, number> = {
  low: 0.4,
  normal: 0.7,
  high: 1,
};

const players = new Map<SourceKey, AudioPlayer>();
let audioModeReady = false;

/**
 * Режим звука: играем даже когда телефон в беззвучном режиме.
 *
 * `playsInSilentMode` обязателен: водители часто держат телефон с
 * выключенным звонком, чтобы личные звонки не мешали работе, — а сигнал о
 * заказе к личным не относится.
 */
async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'duckOthers',
  });
  audioModeReady = true;
}

/** Какой файл соответствует событию с учётом выбранного варианта. */
function sourceKeyFor(event: SoundEvent, variant: SoundVariant): SourceKey {
  if (event === 'new-order') return `new-order:${variant}` as SourceKey;
  return event;
}

/** Включён ли звук для этого события в настройках. */
function isEnabled(event: SoundEvent): boolean {
  const s = useSettingsStore.getState();
  if (event === 'new-order') return s.soundEnabled;
  if (event === 'order-canceled') return s.soundOrderCanceled;
  return s.soundChatMessage;
}

/**
 * Проиграть сигнал.
 *
 * Молчит, если водитель выключил этот сигнал в настройках. Ошибки не
 * пробрасывает и наружу не показывает: беззвучный сигнал — неприятность, а
 * упавший экран входящего заказа — потерянный заказ.
 *
 * `force` обходит проверку настройки — им пользуется экран настроек,
 * чтобы дать послушать сигнал до включения.
 */
export async function playSound(
  event: SoundEvent,
  options: { force?: boolean; variant?: SoundVariant } = {},
): Promise<void> {
  const state = useSettingsStore.getState();
  if (!options.force && !isEnabled(event)) return;

  try {
    await ensureAudioMode();

    const key = sourceKeyFor(event, options.variant ?? state.soundVariant);
    let player = players.get(key);
    if (!player) {
      player = createAudioPlayer(SOURCES[key]);
      players.set(key, player);
    }

    player.volume = VOLUME[state.soundVolume] ?? VOLUME.normal;
    // Перемотка в начало нужна на каждый повторный сигнал: доигравший
    // игрок стоит в конце дорожки и второй раз молчит.
    void player.seekTo(0);
    player.play();
  } catch (error) {
    driverLogger.error('Не удалось проиграть сигнал', {
      stack: error instanceof Error ? error.message : String(error),
      screen: 'sound.service',
      action: `play_${event}`,
    });
  }
}

/** Короткая форма для самого частого сигнала. */
export function playNewOrderSound(): Promise<void> {
  return playSound('new-order');
}

/**
 * Освободить игроков.
 *
 * Зовётся при выходе из аккаунта: держать декодированные дорожки в памяти
 * до конца жизни процесса незачем, а следующий сигнал заведёт игрока
 * заново.
 */
export function releaseSounds(): void {
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      // Игрок мог быть уже освобождён системой — это не ошибка.
    }
  }
  players.clear();
}
