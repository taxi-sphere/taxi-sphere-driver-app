/**
 * @file: src/services/location.service.test.ts
 * @description:
 *   Тесты доставки ФОНОВЫХ GPS-точек.
 *
 *   ЗАЧЕМ. До v1.5.14 фоновая задача отправляла точки только REST-батчем:
 *   `socketService.emitLocation` вызывался лишь в foreground-подписке. Из-за
 *   этого стоило водителю погасить экран — и карта диспетчера получала его
 *   раз в 5–10 секунд, маркер шагал. В админке это выглядело как красный
 *   бейдж «Канал водителей: 0 из N» при полностью исправном сервере.
 *
 *   Тест закрывает именно это: точка обязана уйти ОБОИМИ каналами, и
 *   поломка сокета не должна мешать очереди — только она ведёт точку в
 *   историю и в `lastSeenAt`.
 *
 * @dependencies: vitest, @/services/location.service
 * @created: 2026-08-31 (v1.5.14)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* --- Нативное окружение, которого в node нет ------------------------------ */

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4, BestForNavigation: 6 },
  watchPositionAsync: vi.fn(),
  startLocationUpdatesAsync: vi.fn(),
  stopLocationUpdatesAsync: vi.fn(),
  hasStartedLocationUpdatesAsync: vi.fn(async () => false),
  requestForegroundPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
}));

vi.mock('expo-task-manager', () => ({ defineTask: vi.fn() }));

// Через @/lib/constants сюда тянется expo-constants, а с ним — весь
// react-native, который rolldown не разбирает (Flow-синтаксис).
vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: undefined, extra: {} } },
}));

/* --- Соседние сервисы ----------------------------------------------------- */

const emitLocation = vi.fn();
vi.mock('@/services/socket.service', () => ({
  socketService: {
    emitLocation: (...args: unknown[]) => emitLocation(...args),
  },
}));

const sendLocation = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/api/driver.api', () => ({
  sendLocation: (...args: unknown[]) => sendLocation(...args),
}));

const enqueue = vi.fn();
const dequeue = vi.fn();
const markSent = vi.fn();
vi.mock('@/stores/location.store', () => ({
  useLocationStore: {
    getState: () => ({ enqueue, dequeue, markSent, pendingPoints: [] }),
  },
}));

vi.mock('@/stores/connection.store', () => ({
  useConnectionStore: {
    getState: () => ({ setGpsActive: vi.fn(), setGpsPermission: vi.fn() }),
  },
}));

// Импорт ниже фабрик намеренно. `vi.mock` поднимается наверх, но сами
// фабрики исполняются при импорте модуля — а они читают объявленные выше
// `emitLocation`, `enqueue` и прочие. Подними импорт к началу файла, и они
// окажутся в TDZ.
// eslint-disable-next-line import/first
import { handleBackgroundLocations, toLocationPoints } from './location.service';

/** Точка в том виде, в каком её приносит expo-location. */
function rawPoint(lat: number, lng: number, timestamp: number) {
  return {
    coords: { latitude: lat, longitude: lng, speed: 12, heading: 90 },
    timestamp,
  };
}

beforeEach(() => {
  emitLocation.mockReset();
  enqueue.mockReset();
  sendLocation.mockReset();
});

describe('toLocationPoints', () => {
  it('приводит фоновую точку к формату сервера', () => {
    const [p] = toLocationPoints([rawPoint(56.1, 94.5, 1_756_000_000_000)]);

    expect(p).toEqual({
      lat: 56.1,
      lng: 94.5,
      speed: 12,
      heading: 90,
      recordedAt: new Date(1_756_000_000_000).toISOString(),
    });
  });

  it('пустые speed/heading отдаёт как undefined, а не как null', () => {
    const [p] = toLocationPoints([
      { coords: { latitude: 1, longitude: 2, speed: null, heading: null }, timestamp: 0 },
    ]);

    // null не пройдёт zod-схему на сервере (там .optional(), не .nullable()).
    expect(p!.speed).toBeUndefined();
    expect(p!.heading).toBeUndefined();
  });
});

describe('handleBackgroundLocations', () => {
  it('шлёт точки и сокетом, и в очередь', () => {
    const points = toLocationPoints([
      rawPoint(56.1, 94.5, 1_756_000_000_000),
      rawPoint(56.2, 94.6, 1_756_000_005_000),
    ]);

    handleBackgroundLocations(points);

    expect(emitLocation).toHaveBeenCalledTimes(2);
    expect(emitLocation).toHaveBeenNthCalledWith(1, points[0]);
    expect(emitLocation).toHaveBeenNthCalledWith(2, points[1]);
    expect(enqueue).toHaveBeenCalledWith(points);
  });

  it('сохраняет точки в очередь, даже если сокет упал', () => {
    emitLocation.mockImplementation(() => {
      throw new Error('socket closed');
    });
    const points = toLocationPoints([rawPoint(56.1, 94.5, 1_756_000_000_000)]);

    expect(() => handleBackgroundLocations(points)).not.toThrow();
    expect(enqueue).toHaveBeenCalledWith(points);
  });

  it('на пустом списке не трогает ни сокет, ни очередь', () => {
    handleBackgroundLocations([]);

    expect(emitLocation).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('отдаёт точке момент съёмки — по нему сервер отличает эхо батча', () => {
    const points = toLocationPoints([rawPoint(56.1, 94.5, 1_756_000_000_000)]);

    handleBackgroundLocations(points);

    const sent = emitLocation.mock.calls[0]![0] as { recordedAt?: string };
    expect(sent.recordedAt).toBe(new Date(1_756_000_000_000).toISOString());
  });
});
