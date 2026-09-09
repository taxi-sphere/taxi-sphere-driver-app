/**
 * @file: src/stores/chat.store.ts
 * @description:
 *   Что водитель уже прочитал в переписке с диспетчерской.
 *
 *   ПОЧЕМУ ОТМЕТКА ЖИВЁТ НА ТЕЛЕФОНЕ, А НЕ В БАЗЕ. Прочтение — это факт про
 *   ЭТОТ телефон и никому больше не нужен: диспетчеру не показывают
 *   «водитель прочитал», а второго устройства у водителя нет. Колонка в
 *   базе означала бы миграцию и запись на каждое открытие экрана ради
 *   значения, которое читает только сам владелец. Сервер при этом считает
 *   непрочитанные сам — по присланной отметке (`since`): счёт остаётся на
 *   сервере, где лежат сообщения, а память о прочтении — на телефоне.
 *
 *   Переустановка приложения обнулит отметку, и водитель один раз увидит
 *   бейдж на старой переписке. Цена невелика: он откроет чат, и бейдж
 *   погаснет.
 *
 * @dependencies: zustand, @react-native-async-storage/async-storage
 * @created: 2026-09-09 (1.5.52)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ChatState {
  /**
   * Когда водитель последний раз видел переписку, ISO.
   *
   * `null` — не открывал ни разу. Тогда сервер счётчик не считает вовсе, и
   * бейдж не загорается: подсвечивать всю историю переписки при первом
   * запуске бессмысленно.
   */
  lastReadAt: string | null;
  /**
   * Сколько сообщений диспетчера пришло после `lastReadAt`.
   *
   * Хранится здесь, а не только в кэше запросов: бейдж в меню должен
   * гореть и до того, как экран чата смонтирован хоть раз.
   */
  unreadCount: number;

  /** Отметить переписку прочитанной по это мгновение. */
  markRead: (at?: Date) => void;
  setUnreadCount: (count: number) => void;
  /** Пришло сообщение, пока экран чата закрыт. */
  noteIncoming: () => void;
}

export const useChatStore = create<ChatState>()(
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
      name: 'ts-driver-chat',
      storage: createJSONStorage(() => AsyncStorage),
      // Счётчик не переживает перезапуск: он пересчитывается сервером по
      // `lastReadAt` при первом же запросе, а сохранённое число рисковало
      // бы разойтись с действительностью.
      partialize: (s) => ({ lastReadAt: s.lastReadAt }),
    },
  ),
);
