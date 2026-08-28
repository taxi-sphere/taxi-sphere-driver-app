/**
 * @file: src/stores/update-request.store.ts
 * @description:
 *   Передача «запустить скачивание обновления» между экранами.
 *
 *   ЗАЧЕМ (v1.5.11): обновление запускается из двух мест — из баннера сверху
 *   и из Настроек → «Проверить обновления». Баннер живёт в
 *   `AppUpdateNotifier` (смонтирован в корневом app/_layout.tsx) и показывает
 *   модалку с прогрессом скачивания. Настройки же вызывали
 *   `downloadAndInstallApk` напрямую, без колбэка прогресса и без UI —
 *   водитель жал «Обновить», и ~100 МБ качались вслепую.
 *
 *   Вместо копирования модалки во второй экран Настройки кладут сюда релиз,
 *   а `AppUpdateNotifier` — единственный владелец процесса скачивания — его
 *   подхватывает и показывает свой обычный UI. Один поток загрузки на
 *   приложение, одна разметка прогресса.
 *
 *   ПОЧЕМУ ЗДЕСЬ ВЕСЬ РЕЛИЗ, А НЕ ПРОСТО ФЛАГ: `useAppUpdate` хранит `latest`
 *   в локальном `useState`, поэтому у каждого вызывающего компонента СВОЯ
 *   копия. Настройки могут знать про обновление, а нотификатор — ещё нет
 *   (проверка не завершилась, запрос упал по сети). С голым флагом такой
 *   запрос молча терялся: нотификатору нечего было скачивать, и нажатие
 *   «Обновить» не давало ничего. Передавая релиз целиком, инициатор
 *   отвечает за данные, а нотификатор — только за процесс.
 *
 * @dependencies: zustand, @/api/app.api
 * @created: 2026-08-28 (v1.5.11)
 */

import { create } from 'zustand';
import type { DriverAppLatestPublicDTO } from '@/api/app.api';

interface UpdateRequestState {
  /** Релиз, скачивание которого запросил другой экран. null — запроса нет. */
  requested: DriverAppLatestPublicDTO | null;
  /** Попросить `AppUpdateNotifier` скачать и установить этот релиз. */
  request: (release: DriverAppLatestPublicDTO) => void;
  /** Сбросить запрос — вызывает тот, кто его обработал. */
  clear: () => void;
}

export const useUpdateRequestStore = create<UpdateRequestState>((set) => ({
  requested: null,
  request: (release) => set({ requested: release }),
  clear: () => set({ requested: null }),
}));
