/**
 * @file: src/services/location.service.ts
 * @description:
 *   GPS-трекинг: foreground + background через expo-location / expo-task-manager.
 *   Батчевая отправка на сервер, offline-очередь.
 * @dependencies: expo-location, expo-task-manager, driver.api, location.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { sendLocation } from '@/api/driver.api';
import { useLocationStore } from '@/stores/location.store';
import { useConnectionStore } from '@/stores/connection.store';
import type { LocationPoint } from '@/types/location';
import {
  BACKGROUND_LOCATION_TASK,
  LOCATION_BATCH_MAX,
  LOCATION_SEND_INTERVAL_ONLINE_MS,
  LOCATION_SEND_INTERVAL_ON_ORDER_MS,
  GPS_FOREGROUND_ONLINE,
  GPS_FOREGROUND_ON_ORDER,
  GPS_BACKGROUND_ONLINE,
  GPS_BACKGROUND_ON_ORDER,
} from '@/lib/constants';

/* -------------------------------------------------------------------------- */
/*  Буфер точек для батчевой отправки                                          */
/* -------------------------------------------------------------------------- */

let pointsBuffer: LocationPoint[] = [];
let sendTimer: ReturnType<typeof setInterval> | null = null;
let foregroundSubscription: Location.LocationSubscription | null = null;
let isFlushing = false;

/** Добавить точку в буфер, отправить если полный */
function bufferPoint(point: LocationPoint): void {
  pointsBuffer.push(point);
  if (pointsBuffer.length >= LOCATION_BATCH_MAX) {
    void flushBuffer();
  }
}

/** Отправить все точки из буфера на сервер (с локом от параллельных вызовов) */
async function flushBuffer(): Promise<void> {
  if (isFlushing || pointsBuffer.length === 0) return;
  isFlushing = true;

  const batch = pointsBuffer.slice(0, LOCATION_BATCH_MAX);
  pointsBuffer = pointsBuffer.slice(LOCATION_BATCH_MAX);

  try {
    await sendLocation({ points: batch });
    useLocationStore.getState().markSent();
  } catch (err) {
    console.warn('[Location] flush error, queuing offline:', err instanceof Error ? err.message : 'unknown');
    useLocationStore.getState().enqueue(batch);
  } finally {
    isFlushing = false;
  }
}

/** Отправить точки из offline-очереди (итеративно, максимум 10 батчей) */
export async function flushOfflineQueue(): Promise<void> {
  const MAX_ITERATIONS = 10;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { pendingPoints, dequeue, markSent } = useLocationStore.getState();
    if (pendingPoints.length === 0) break;

    const batch = pendingPoints.slice(0, LOCATION_BATCH_MAX);
    try {
      await sendLocation({ points: batch });
      dequeue(batch.length);
      markSent();
    } catch {
      // Сеть недоступна — прекращаем попытки
      break;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Foreground tracking                                                        */
/* -------------------------------------------------------------------------- */

export async function startForegroundTracking(
  isOnOrder: boolean,
): Promise<void> {
  await stopForegroundTracking();

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    useConnectionStore.getState().setGpsPermission('denied');
    return;
  }
  useConnectionStore.getState().setGpsPermission('granted');

  const params = isOnOrder ? GPS_FOREGROUND_ON_ORDER : GPS_FOREGROUND_ONLINE;
  const accuracy = isOnOrder
    ? Location.Accuracy.BestForNavigation
    : Location.Accuracy.High;

  foregroundSubscription = await Location.watchPositionAsync(
    {
      accuracy,
      timeInterval: params.timeInterval,
      distanceInterval: params.distanceInterval,
    },
    (location) => {
      bufferPoint({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        speed: location.coords.speed ?? undefined,
        heading: location.coords.heading ?? undefined,
        recordedAt: new Date(location.timestamp).toISOString(),
      });
    },
  );

  useConnectionStore.getState().setGpsActive(true);

  // Таймер батчевой отправки
  const interval = isOnOrder
    ? LOCATION_SEND_INTERVAL_ON_ORDER_MS
    : LOCATION_SEND_INTERVAL_ONLINE_MS;
  sendTimer = setInterval(() => {
    void flushBuffer();
  }, interval);
}

export async function stopForegroundTracking(): Promise<void> {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
  if (sendTimer) {
    clearInterval(sendTimer);
    sendTimer = null;
  }
  // Отправить оставшиеся точки
  await flushBuffer();
  useConnectionStore.getState().setGpsActive(false);
}

/* -------------------------------------------------------------------------- */
/*  Background tracking                                                        */
/* -------------------------------------------------------------------------- */

export async function startBackgroundTracking(
  isOnOrder: boolean,
): Promise<void> {
  const { status: bgStatus } =
    await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') return;

  const params = isOnOrder
    ? GPS_BACKGROUND_ON_ORDER
    : GPS_BACKGROUND_ONLINE;
  const accuracy = isOnOrder
    ? Location.Accuracy.High
    : Location.Accuracy.Balanced;

  const isStarted = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  );
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy,
    timeInterval: params.timeInterval,
    distanceInterval: params.distanceInterval,
    deferredUpdatesInterval: params.timeInterval,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Taxi Sphere',
      notificationBody: isOnOrder
        ? 'Выполняется заказ'
        : 'Вы на линии',
      notificationColor: '#4f46e5',
    },
  });
}

export async function stopBackgroundTracking(): Promise<void> {
  const isStarted = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  ).catch(() => false);
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

/* -------------------------------------------------------------------------- */
/*  Background task definition                                                 */
/* -------------------------------------------------------------------------- */

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;

  const typedData = data as {
    locations?: {
      coords: {
        latitude: number;
        longitude: number;
        speed: number | null;
        heading: number | null;
      };
      timestamp: number;
    }[];
  };

  if (typedData.locations) {
    const points: LocationPoint[] = typedData.locations.map((loc) => ({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      speed: loc.coords.speed ?? undefined,
      heading: loc.coords.heading ?? undefined,
      recordedAt: new Date(loc.timestamp).toISOString(),
    }));

    // Добавляем в очередь (background context — нет доступа к foreground буферу)
    useLocationStore.getState().enqueue(points);

    // Пытаемся отправить
    void flushOfflineQueue();
  }
});
