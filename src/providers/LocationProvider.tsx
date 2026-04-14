/**
 * @file: src/providers/LocationProvider.tsx
 * @description:
 *   Провайдер GPS-трекинга: запускает/останавливает GPS
 *   в зависимости от статуса водителя (offline → stop, online/on_order → start).
 *   Следит за изменением GPS-разрешений и состоянием GPS-модуля.
 * @dependencies: location.service, driver.store, connection.store, expo-location
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-04-13 18:00:00
 */

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { useDriverStore } from '@/stores/driver.store';
import { useConnectionStore } from '@/stores/connection.store';
import {
  startForegroundTracking,
  stopForegroundTracking,
  startBackgroundTracking,
  stopBackgroundTracking,
  flushOfflineQueue,
} from '@/services/location.service';

/** Проверить GPS-разрешения и состояние модуля, обновить store */
async function checkGpsState(): Promise<void> {
  try {
    const { status: perm } = await Location.getForegroundPermissionsAsync();
    const store = useConnectionStore.getState();

    if (perm === 'undetermined') {
      // Первый запуск — запрашиваем разрешение
      const req = await Location.requestForegroundPermissionsAsync();
      store.setGpsPermission(req.status === 'granted' ? 'granted' : 'denied');
    } else {
      store.setGpsPermission(perm === 'granted' ? 'granted' : 'denied');
    }

    const enabled = await Location.hasServicesEnabledAsync();
    const currentPerm = useConnectionStore.getState().gpsPermission;
    store.setGpsActive(enabled && currentPerm === 'granted');
  } catch {
    // Не блокируем UI
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const status = useDriverStore((s) => s.status);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Проверяем GPS при монтировании
  useEffect(() => {
    void checkGpsState();
    // Flush offline queue если остались точки от прошлой сессии
    void flushOfflineQueue();
  }, []);

  // Слушаем AppState — перепроверяем GPS при возврате из фона
  // (пользователь мог включить/выключить GPS в настройках)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        void checkGpsState();
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  // Периодическая проверка GPS-модуля (пользователь может выключить GPS)
  useEffect(() => {
    const interval = setInterval(() => {
      void checkGpsState();
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  // Запуск/остановка трекинга по статусу
  useEffect(() => {
    if (status === 'offline') {
      void stopForegroundTracking();
      void stopBackgroundTracking();
      return;
    }

    const isOnOrder = status === 'on_order';
    void startForegroundTracking(isOnOrder);
    void startBackgroundTracking(isOnOrder);

    return () => {
      void stopForegroundTracking();
      void stopBackgroundTracking();
    };
  }, [status]);

  return <>{children}</>;
}
