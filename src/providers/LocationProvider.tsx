/**
 * @file: src/providers/LocationProvider.tsx
 * @description:
 *   Провайдер GPS-трекинга: запускает/останавливает GPS
 *   в зависимости от статуса водителя (offline → stop, online/on_order → start).
 *   Следит за изменением GPS-разрешений и состоянием GPS-модуля.
 * @dependencies: location.service, driver.store, connection.store, expo-location
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-08-31 (v1.5.15 — трекинг перезапускается при выдаче
 *   разрешения; gpsActive = факт подписки, а не «разрешение есть»)
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
  isForegroundTrackingActive,
  isTrackingBusy,
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

    // GPS-модуль выключен в системе — подписка бесполезна, гасим флаг явно.
    // Во всех остальных случаях `gpsActive` принадлежит location.service:
    // это факт живой подписки, а не «разрешение есть». Раньше здесь стояло
    // `enabled && perm === 'granted'`, и каждые 30 секунд индикатор
    // загорался зелёным даже когда подписки не было вовсе.
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) store.setGpsActive(false);
    // Пока идёт перезапуск трекинга (смена статуса водителя), промежуточное
    // «подписки нет» — не состояние, а шов между stop и start. Не трогаем
    // флаг: очередь выставит его сама, когда отработает последняя операция.
    else if (!isTrackingBusy()) store.setGpsActive(isForegroundTrackingActive());
  } catch {
    // Не блокируем UI
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const status = useDriverStore((s) => s.status);
  const gpsPermission = useConnectionStore((s) => s.gpsPermission);
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

  // Запуск/остановка трекинга по статусу И по разрешению.
  //
  // v1.5.15: разрешение обязано быть в зависимостях. Если водитель отказал
  // при первом запуске, а потом включил геолокацию в настройках Android и
  // вернулся в приложение, `checkGpsState` по AppState → active обновит
  // `gpsPermission`, и подписка оформится. До этой правки эффект зависел
  // только от статуса: приложение оставалось без подписки до перезапуска
  // или ручного переключения статуса, показывая при этом зелёный GPS.
  useEffect(() => {
    if (status === 'offline') {
      void stopForegroundTracking();
      void stopBackgroundTracking();
      return;
    }

    // Отказ — подписываться не на что. Ждём, пока разрешение появится:
    // как только `gpsPermission` станет 'granted', эффект перезапустится.
    // 'undetermined' пропускаем дальше — startForegroundTracking сам
    // покажет системный запрос.
    if (gpsPermission === 'denied') return;

    const isOnOrder = status === 'on_order';
    void startForegroundTracking(isOnOrder);
    void startBackgroundTracking(isOnOrder);

    return () => {
      void stopForegroundTracking();
      void stopBackgroundTracking();
    };
  }, [status, gpsPermission]);

  return <>{children}</>;
}
