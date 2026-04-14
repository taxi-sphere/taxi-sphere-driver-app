/**
 * @file: src/stores/location.store.ts
 * @description:
 *   Zustand store для offline-очереди GPS-точек.
 *   Точки, которые не удалось отправить, сохраняются в AsyncStorage.
 * @dependencies: zustand, @react-native-async-storage/async-storage
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationPoint } from '@/types/location';
import { LOCATION_QUEUE_MAX } from '@/lib/constants';

interface LocationQueueState {
  pendingPoints: LocationPoint[];
  lastSentAt: string | null;

  /** Добавить точки в очередь */
  enqueue: (points: LocationPoint[]) => void;

  /** Удалить первые N точек из очереди (после успешной отправки) */
  dequeue: (count: number) => void;

  /** Пометить время последней отправки */
  markSent: () => void;

  /** Полная очистка */
  clear: () => void;
}

export const useLocationStore = create<LocationQueueState>()(
  persist(
    (set, get) => ({
      pendingPoints: [],
      lastSentAt: null,

      enqueue: (points) => {
        const current = get().pendingPoints;
        const combined = [...current, ...points];
        // Ограничиваем размер очереди — отбрасываем старые
        const trimmed =
          combined.length > LOCATION_QUEUE_MAX
            ? combined.slice(combined.length - LOCATION_QUEUE_MAX)
            : combined;
        set({ pendingPoints: trimmed });
      },

      dequeue: (count) => {
        set((state) => ({
          pendingPoints: state.pendingPoints.slice(count),
        }));
      },

      markSent: () => {
        set({ lastSentAt: new Date().toISOString() });
      },

      clear: () => {
        set({ pendingPoints: [], lastSentAt: null });
      },
    }),
    {
      name: 'ts-location-queue',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
