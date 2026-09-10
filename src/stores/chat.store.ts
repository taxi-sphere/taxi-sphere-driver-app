/**
 * @file: src/stores/chat.store.ts
 * @description:
 *   Что водитель уже прочитал в переписке с диспетчерской.
 *   Правила и обоснование — в `@/stores/read-marker.store`, здесь только
 *   ключ хранилища: разделов с непрочитанным уже два, и одинаковую логику
 *   они делят, а не копируют.
 * @dependencies: @/stores/read-marker.store
 * @created: 2026-09-09 (1.5.52)
 * @updated: 2026-09-10 (1.5.53 — общая фабрика отметки прочтения)
 */

import { createReadMarkerStore } from '@/stores/read-marker.store';

export const useChatStore = createReadMarkerStore('ts-driver-chat');
