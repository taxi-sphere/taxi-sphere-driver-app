/**
 * @file: src/stores/read-marker.store.ts
 * @description:
 *   Отметка «что водитель уже видел» — общая для разделов, где бывает
 *   непрочитанное: переписка с диспетчером, объявления службы.
 *
 *   ПОЧЕМУ ОТМЕТКА ЖИВЁТ НА ТЕЛЕФОНЕ. Прочтение — факт про ЭТОТ телефон и
 *   никому больше не нужен: диспетчеру не показывают «водитель прочитал»,
 *   второго устройства у водителя нет. Колонка в базе означала бы миграцию
 *   и запись на каждое открытие экрана ради значения, которое читает
 *   только сам владелец. Сервер при этом считает непрочитанные сам — по
 *   присланной отметке (`since`): счёт остаётся там, где лежат записи, а
 *   память о прочтении — на телефоне.
 *
 *   ПОЧЕМУ ФАБРИКА, А НЕ ДВА ПОХОЖИХ ФАЙЛА. Разделов уже два, и правила у
 *   них одинаковые до буквы. Две копии разъехались бы на первой же правке
 *   — ровно так в этом проекте разъезжались namespace'ы сокета
 *   (v1.99.52).
 *
 *   Переустановка приложения обнуляет отметку: водитель один раз увидит
 *   бейдж на старых записях, откроет раздел — и бейдж погаснет.
 *
 * @dependencies: zustand, @react-native-async-storage/async-storage
 * @created: 2026-09-10 (1.5.53)
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ReadMarkerState {
  /**
   * Когда водитель последний раз открывал раздел, ISO.
   *
   * `null` — не открывал ни разу. Тогда сервер счётчик не считает вовсе и
   * бейдж не загорается: подсвечивать всю прошлую переписку или все
   * объявления при первом запуске бессмысленно.
   */
  lastReadAt: string | null;
  /**
   * Сколько записей появилось после `lastReadAt`.
   *
   * Хранится здесь, а не только в кэше запросов: бейдж в меню должен
   * гореть и до того, как экран раздела смонтирован хоть раз.
   */
  unreadCount: number;

  /** Отметить раздел прочитанным по это мгновение. */
  markRead: (at?: Date) => void;
  setUnreadCount: (count: number) => void;
  /** Пришло что-то новое, пока раздел закрыт. */
  noteIncoming: () => void;
}

/**
 * Завести хранилище отметки для раздела.
 *
 * `storageKey` должен быть уникальным: под ним состояние ложится в
 * AsyncStorage и переживает перезапуск.
 */
export function createReadMarkerStore(
  storageKey: string,
): UseBoundStore<StoreApi<ReadMarkerState>> {
  return create<ReadMarkerState>()(
    persist(
      (set) => ({
        lastReadAt: null,
        unreadCount: 0,

        markRead: (at = new Date()) =>
          set({ lastReadAt: at.toISOString(), unreadCount: 0 }),
        setUnreadCount: (unreadCount) => set({ unreadCount }),
        noteIncoming: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => AsyncStorage),
        // Счётчик не переживает перезапуск: он пересчитывается сервером по
        // `lastReadAt` при первом же запросе, а сохранённое число рисковало
        // бы разойтись с действительностью.
        partialize: (s) => ({ lastReadAt: s.lastReadAt }),
      },
    ),
  );
}
