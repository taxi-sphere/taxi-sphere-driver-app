/**
 * @file: src/services/location.service.ts
 * @description:
 *   GPS-трекинг: foreground + background через expo-location / expo-task-manager.
 *   Батчевая отправка на сервер, offline-очередь.
 * @dependencies: expo-location, expo-task-manager, driver.api, location.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-08-31 (v1.5.15 — очередь запусков/остановок трекинга,
 *   честный признак живой подписки)
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { sendLocation } from '@/api/driver.api';
import { socketService } from '@/services/socket.service';
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

/**
 * Идёт ли ПРЯМО СЕЙЧАС подписка на координаты.
 *
 * Единственный честный ответ на вопрос «работает ли GPS», и потому
 * единственный источник для `gpsActive` в сторе. До v1.5.15 индикатор в
 * шапке считался как «службы геолокации включены И разрешение выдано» —
 * это не одно и то же: приложение может иметь разрешение и не быть
 * подписанным (так и было, когда разрешение выдавали уже после старта).
 * Водитель видел зелёный значок и не отправлял ни одной точки, а диспетчер
 * видел его «без GPS».
 */
export function isForegroundTrackingActive(): boolean {
  return foregroundSubscription !== null;
}

/** Привести `gpsActive` в сторе к фактическому состоянию подписки. */
function syncGpsActiveFlag(): void {
  useConnectionStore.getState().setGpsActive(isForegroundTrackingActive());
}

/* -------------------------------------------------------------------------- */
/*  Очередь запусков/остановок                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Все запуски и остановки трекинга идут ОДНОЙ цепочкой, строго по порядку
 * вызова.
 *
 * ЗАЧЕМ. Эффект `LocationProvider` перезапускается при смене статуса или
 * разрешения: React сначала выполняет cleanup (две остановки), сразу за ним
 * тело эффекта (два запуска) — и всё это асинхронно, без ожидания. Без
 * очереди «поздняя» остановка договаривала уже ПОСЛЕ нового запуска и гасила
 * его: `stopLocationUpdatesAsync` снимал только что поставленную фоновую
 * задачу. Снаружи это выглядело так — водитель свернул приложение, и точки
 * прекращались, хотя трекинг «запущен». Поймано на эмуляторе: после холодного
 * старта передний план работал, а с погашенным экраном поток обрывался.
 *
 * Ошибка одного шага не рвёт цепочку — иначе одна неудачная остановка
 * заблокировала бы все последующие запуски.
 */
let trackingChain: Promise<unknown> = Promise.resolve();

function serializeTracking<T>(task: () => Promise<T>): Promise<T> {
  const next = trackingChain.then(task, task);
  trackingChain = next.catch(() => undefined);
  return next;
}

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

async function startForegroundTrackingImpl(
  isOnOrder: boolean,
): Promise<void> {
  await stopForegroundTrackingImpl();

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
      const point: LocationPoint = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        speed: location.coords.speed ?? undefined,
        heading: location.coords.heading ?? undefined,
        recordedAt: new Date(location.timestamp).toISOString(),
      };
      // Живая отправка через Socket.IO — для мгновенного появления
      // на карте в админке. REST-батч параллельно копит для истории.
      socketService.emitLocation(point);
      bufferPoint(point);
    },
  );

  syncGpsActiveFlag();

  // Таймер батчевой отправки
  const interval = isOnOrder
    ? LOCATION_SEND_INTERVAL_ON_ORDER_MS
    : LOCATION_SEND_INTERVAL_ONLINE_MS;
  sendTimer = setInterval(() => {
    void flushBuffer();
  }, interval);
}

async function stopForegroundTrackingImpl(): Promise<void> {
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
  // Не `false`, а фактическое состояние: остановка и следующий запуск могут
  // наложиться (эффект провайдера перезапускается при смене статуса или
  // разрешения), и «поздний» stop не должен гасить индикатор уже живой
  // подписки.
  syncGpsActiveFlag();
}

/* -------------------------------------------------------------------------- */
/*  Background tracking                                                        */
/* -------------------------------------------------------------------------- */

async function startBackgroundTrackingImpl(
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

async function stopBackgroundTrackingImpl(): Promise<void> {
  const isStarted = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  ).catch(() => false);
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

/* -------------------------------------------------------------------------- */
/*  Публичные обёртки — только через очередь (см. serializeTracking)           */
/* -------------------------------------------------------------------------- */

export function startForegroundTracking(isOnOrder: boolean): Promise<void> {
  return serializeTracking(() => startForegroundTrackingImpl(isOnOrder));
}

export function stopForegroundTracking(): Promise<void> {
  return serializeTracking(() => stopForegroundTrackingImpl());
}

export function startBackgroundTracking(isOnOrder: boolean): Promise<void> {
  return serializeTracking(() => startBackgroundTrackingImpl(isOnOrder));
}

export function stopBackgroundTracking(): Promise<void> {
  return serializeTracking(() => stopBackgroundTrackingImpl());
}

/* -------------------------------------------------------------------------- */
/*  Background task definition                                                 */
/* -------------------------------------------------------------------------- */

/** Сырая точка, какой её приносит expo-location в фоновую задачу. */
export interface RawBackgroundLocation {
  coords: {
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
  };
  timestamp: number;
}

/** Приводит фоновые точки expo-location к формату, который ждёт сервер. */
export function toLocationPoints(locations: RawBackgroundLocation[]): LocationPoint[] {
  return locations.map((loc) => ({
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    speed: loc.coords.speed ?? undefined,
    heading: loc.coords.heading ?? undefined,
    recordedAt: new Date(loc.timestamp).toISOString(),
  }));
}

/**
 * Что делать с точками, которые принесла ФОНОВАЯ задача.
 *
 * ДВА КАНАЛА, ОБА НУЖНЫ.
 *   1) Сокет — чтобы точка появилась на карте диспетчера сразу. До v1.5.14
 *      фоновые точки уходили ТОЛЬКО батчем, и стоило водителю погасить
 *      экран (обычный режим работы — телефон в держателе или в кармане),
 *      как маркер на карте начинал шагать раз в 5–10 секунд. Процесс в
 *      фоне жив — его держит foreground-service самого GPS-трекинга, —
 *      поэтому сокет чаще всего тоже жив. Если Android его всё же усыпил,
 *      `emitLocation` молча ничего не сделает, и останется батч, как было.
 *   2) Очередь + REST — путь точки в `driver_location_history` и в
 *      `lastSeenAt`. Сокет в БД историю не пишет, поэтому этот шаг
 *      обязан отработать при любом исходе первого.
 *
 * Вынесено из тела задачи отдельной функцией, чтобы это поведение можно
 * было проверить тестом: сама `TaskManager.defineTask` исполняется только
 * внутри нативного рантайма.
 */
export function handleBackgroundLocations(points: LocationPoint[]): void {
  if (points.length === 0) return;

  for (const point of points) {
    try {
      socketService.emitLocation(point);
    } catch (err) {
      // Одна ошибка сокета означает, что не пройдут и остальные точки.
      // Прерываемся и идём к очереди — она важнее.
      console.warn(
        '[Location] socket emit failed:',
        err instanceof Error ? err.message : 'unknown',
      );
      break;
    }
  }

  // background context — доступа к foreground-буферу нет, поэтому очередь.
  useLocationStore.getState().enqueue(points);
  void flushOfflineQueue();
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;

  const typedData = data as { locations?: RawBackgroundLocation[] };
  if (!typedData.locations) return;

  handleBackgroundLocations(toLocationPoints(typedData.locations));
});
