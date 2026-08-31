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
 *   v1.5.16: сюда же — параметры самой съёмки. Профилей было четыре, и
 *   худший (фон + свободен: 15 с, порог 50 м, точность Balanced) доставался
 *   самому частому состоянию водителя. Теперь профиль один, и тесты ниже
 *   стерегут именно это: разъедутся параметры снова — узнаем из теста, а не
 *   из жалобы на дёргающиеся машины.
 *
 * @dependencies: vitest, @/services/location.service
 * @created: 2026-08-31 (v1.5.14)
 * @updated: 2026-09-01 (v1.5.16 — единый профиль съёмки GPS)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* --- Нативное окружение, которого в node нет ------------------------------ */

/** Подписка, которую возвращает watchPositionAsync. */
const removeSubscription = vi.fn();
const watchPositionAsync = vi.fn(async (..._args: unknown[]) => ({
  remove: removeSubscription,
}));

const startLocationUpdatesAsync = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4, BestForNavigation: 6 },
  watchPositionAsync: (...args: unknown[]) => watchPositionAsync(...args),
  startLocationUpdatesAsync: (...args: unknown[]) => startLocationUpdatesAsync(...args),
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

const setGpsActive = vi.fn();
vi.mock('@/stores/connection.store', () => ({
  useConnectionStore: {
    getState: () => ({ setGpsActive, setGpsPermission: vi.fn() }),
  },
}));

// Импорт ниже фабрик намеренно. `vi.mock` поднимается наверх, но сами
// фабрики исполняются при импорте модуля — а они читают объявленные выше
// `emitLocation`, `enqueue` и прочие. Подними импорт к началу файла, и они
// окажутся в TDZ.
// eslint-disable-next-line import/first
import {
  handleBackgroundLocations,
  toLocationPoints,
  isForegroundTrackingActive,
  startForegroundTracking,
  stopForegroundTracking,
  startBackgroundTracking,
} from './location.service';

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
  setGpsActive.mockReset();
  removeSubscription.mockReset();
  watchPositionAsync.mockClear();
  startLocationUpdatesAsync.mockClear();
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

/* -------------------------------------------------------------------------- */
/*  Признак живой подписки                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `gpsActive` в сторе — это индикатор в шапке приложения. До v1.5.15 он
 * считался как «службы включены И разрешение выдано», то есть загорался
 * зелёным и тогда, когда подписки не было вовсе: водитель видел, что всё в
 * порядке, а на сервер не уходило ни одной точки. Теперь единственный
 * источник — факт подписки, и эти тесты его фиксируют.
 */
describe('isForegroundTrackingActive', () => {
  it('до запуска трекинга — false', () => {
    expect(isForegroundTrackingActive()).toBe(false);
  });

  it('после запуска — true, и флаг в сторе выставлен по нему', async () => {
    await startForegroundTracking(false);

    expect(isForegroundTrackingActive()).toBe(true);
    expect(setGpsActive).toHaveBeenLastCalledWith(true);
  });

  it('после остановки — false, подписка снята', async () => {
    await startForegroundTracking(false);
    await stopForegroundTracking();

    expect(isForegroundTrackingActive()).toBe(false);
    expect(removeSubscription).toHaveBeenCalled();
    expect(setGpsActive).toHaveBeenLastCalledWith(false);
  });

  it('повторный запуск снимает прежнюю подписку и оставляет ровно одну', async () => {
    await startForegroundTracking(false);
    await startForegroundTracking(true);

    expect(removeSubscription).toHaveBeenCalledTimes(1);
    expect(watchPositionAsync).toHaveBeenCalledTimes(2);
    expect(isForegroundTrackingActive()).toBe(true);
  });

  /**
   * Гонка из боя: эффект провайдера перезапускается, React делает cleanup
   * (stop) и тут же тело (start), ничего не дожидаясь. Без очереди «поздний»
   * stop договаривал после start и гасил только что запущенный трекинг —
   * водитель со свёрнутым приложением переставал слать координаты.
   */
  it('stop, вызванный перед start без await, не гасит новый трекинг', async () => {
    await startForegroundTracking(false);

    const stopping = stopForegroundTracking();
    const starting = startForegroundTracking(true);
    await Promise.all([stopping, starting]);

    expect(isForegroundTrackingActive()).toBe(true);
    expect(setGpsActive).toHaveBeenLastCalledWith(true);
  });

  /**
   * Пользовательская жалоба на v1.5.15: при переключении «Свободен ↔ Занят»
   * значок GPS на секунду загорался красным. Перезапуск трекинга — это
   * stop → start подряд, и промежуточное «подписки нет» не состояние, а шов
   * между операциями. Индикатор не должен его видеть ВООБЩЕ.
   */
  it('при перезапуске индикатор ни разу не гаснет', async () => {
    await startForegroundTracking(false);
    setGpsActive.mockClear();

    // Ровно то, что делает эффект провайдера при смене статуса.
    const ops = [
      stopForegroundTracking(),
      startForegroundTracking(true),
    ];
    await Promise.all(ops);

    const values = setGpsActive.mock.calls.map((c) => c[0]);
    expect(values).not.toContain(false);
    expect(isForegroundTrackingActive()).toBe(true);
  });

  it('одиночная остановка индикатор всё-таки гасит', async () => {
    await startForegroundTracking(false);
    setGpsActive.mockClear();

    await stopForegroundTracking();

    expect(setGpsActive).toHaveBeenLastCalledWith(false);
  });
});

describe('единый профиль съёмки GPS (v1.5.16)', () => {
  /** Параметры, с которыми реально позвали expo-location. */
  const foregroundArgs = () => watchPositionAsync.mock.calls[0]![0] as Record<string, number>;
  const backgroundArgs = () => startLocationUpdatesAsync.mock.calls[0]![1] as Record<string, number>;

  it('на экране параметры не зависят от того, на заказе водитель или нет', async () => {
    await startForegroundTracking(false);
    const free = foregroundArgs();
    await stopForegroundTracking();
    watchPositionAsync.mockClear();

    await startForegroundTracking(true);
    expect(foregroundArgs()).toEqual(free);
    await stopForegroundTracking();
  });

  it('в фоне параметры те же, что и на экране', async () => {
    await startForegroundTracking(false);
    const { accuracy, timeInterval, distanceInterval } = foregroundArgs();
    await stopForegroundTracking();

    await startBackgroundTracking(false);
    const bg = backgroundArgs();
    expect(bg.accuracy).toBe(accuracy);
    expect(bg.timeInterval).toBe(timeInterval);
    expect(bg.distanceInterval).toBe(distanceInterval);
  });

  it('точность в фоне НЕ Balanced', async () => {
    // Balanced — «порядка ста метров», позиция по вышкам и Wi-Fi. Машина
    // прыгала на карте, стоя на месте, и буфер на карте это не лечит.
    await startBackgroundTracking(false);
    expect(backgroundArgs().accuracy).not.toBe(3);
    expect(backgroundArgs().accuracy).toBe(4);
  });

  it('порог смещения не больше 15 м', async () => {
    // Порог 50 м = точка не придёт, пока машина не проехала эти 50 м. В
    // пробке на 5 км/ч это полминуты тишины, а потом скачок маркера.
    await startBackgroundTracking(false);
    expect(backgroundArgs().distanceInterval).toBeLessThanOrEqual(15);
  });

  it('в фоне отложенная доставка выключена', async () => {
    // Иначе Android копит точки и отдаёт пачкой: несколько разом, потом тишина.
    await startBackgroundTracking(false);
    expect(backgroundArgs().deferredUpdatesInterval).toBe(0);
  });
});
