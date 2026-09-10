/**
 * @file: src/stores/news.store.ts
 * @description:
 *   Что водитель уже видел в объявлениях службы.
 *   Правила и обоснование — в `@/stores/read-marker.store`.
 * @dependencies: @/stores/read-marker.store
 * @created: 2026-09-10 (1.5.53)
 */

import { createReadMarkerStore } from '@/stores/read-marker.store';

export const useNewsStore = createReadMarkerStore('ts-driver-news');
