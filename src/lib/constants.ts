/**
 * @file: src/lib/constants.ts
 * @description:
 *   Константы приложения: URL серверов, интервалы, лимиты.
 *   Значения считываются из переменных окружения EXPO_PUBLIC_*.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

/**
 * Автоопределение хоста: на эмуляторе 10.0.2.2, на реальном устройстве — IP Metro.
 * Expo заполняет manifest.debuggerHost = "192.168.x.x:8081".
 */
import Constants from 'expo-constants';

function getServerHost(): string {
  // Пробуем получить IP из Expo manifest (IP компьютера в сети)
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== '127.0.0.1') return host;
  }
  // Fallback: manifest2 для Expo Go
  try {
    const extra = (Constants as Record<string, unknown>).manifest2;
    const debuggerHost =
      ((extra as Record<string, unknown>)?.extra as Record<string, unknown>)
        ?.expoGo as Record<string, unknown> | undefined;
    const host = (debuggerHost?.debuggerHost as string)?.split(':')[0];
    if (host && host !== '127.0.0.1') return host;
  } catch { /* ignore */ }
  return '10.0.2.2'; // fallback для эмулятора
}

const HOST = getServerHost();
const DEFAULT_API_PORT = '3003';
const DEFAULT_SOCKET_PORT = '3004';

/** URL API сервера по умолчанию (используется если не задан в настройках) */
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? `http://${HOST}:${DEFAULT_API_PORT}`;

/** URL Socket.IO по умолчанию */
export const DEFAULT_SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ?? `http://${HOST}:${DEFAULT_SOCKET_PORT}`;

/**
 * Получить текущий API URL (из настроек или дефолтный).
 * Вызывается динамически — настройки могут поменяться в рантайме.
 */
export function getApiUrl(): string {
  try {
    // Ленивый импорт чтобы избежать циклических зависимостей
    const { useSettingsStore } = require('@/stores/settings.store');
    const serverUrl = useSettingsStore.getState().serverUrl;
    if (serverUrl) return serverUrl.replace(/\/$/, '');
  } catch { /* ignore — store ещё не инициализирован */ }
  return DEFAULT_API_URL;
}

/** Базовый путь API */
export function getApiBase(): string {
  return `${getApiUrl()}/api/v1`;
}

/**
 * URL Socket.IO сервера.
 *
 * Порт сокет-сервера задаётся в .env на стороне бэкенда (SOCKET_PORT)
 * и может быть любым. Клиент узнаёт его автоматически через
 * GET /api/v1/config при запуске — результат кэшируется в _cachedSocketUrl.
 *
 * Переопределить можно через EXPO_PUBLIC_SOCKET_URL при билде.
 */

let _cachedSocketUrl: string | null = null;

/** Сбросить кэш (при смене сервера в настройках). */
export function resetSocketUrlCache(): void {
  _cachedSocketUrl = null;
}

/**
 * Получить socket URL. Если кэш пуст — вернёт API URL как временный fallback.
 * Реальный socket URL загружается через fetchServerConfig() при старте.
 */
export function getSocketUrl(): string {
  const envOverride = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (envOverride) return envOverride.replace(/\/$/, '');
  if (_cachedSocketUrl) return _cachedSocketUrl;
  return getApiUrl();
}

/**
 * Загрузить конфигурацию с сервера (socket URL и др.).
 * Вызывается один раз при запуске / после логина.
 */
export async function fetchServerConfig(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const url = `${getApiUrl()}/api/v1/config`;
    console.log('[Config] fetching:', url);
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return;
    const data = (await res.json()) as { socketUrl?: string };
    if (data.socketUrl) {
      _cachedSocketUrl = data.socketUrl.replace(/\/$/, '');
      console.log('[Config] socketUrl:', _cachedSocketUrl);
    }
  } catch (err) {
    console.log('[Config] failed:', err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

// Обратная совместимость — статические значения для начальной загрузки
export const API_URL = DEFAULT_API_URL;
export const API_BASE = `${DEFAULT_API_URL}/api/v1`;
export const SOCKET_URL = DEFAULT_SOCKET_URL;

/* -------------------------------------------------------------------------- */
/*  Таймауты и интервалы                                                       */
/* -------------------------------------------------------------------------- */

/** Таймаут HTTP-запросов (мс) */
export const API_TIMEOUT_MS = 15_000;

/** Максимум повторов при 5xx */
export const API_RETRY_COUNT = 3;

/** Интервал polling доступных заказов (мс) */
export const ORDERS_POLL_INTERVAL_MS = 10_000;

/**
 * Интервал REST-батча с геоточками.
 * Выполняет две роли:
 *   1) fallback когда Socket.IO не подключён (тогда это основной
 *      источник обновления карты диспетчера — должно быть часто)
 *   2) сохранение истории в driver_location_history
 *
 * На APK с рабочим Socket.IO живые координаты идут мгновенно через
 * socket, этот батч только дополняет историю. Для APK без socket
 * (или при разрывах) — это главный канал, поэтому держим частым.
 */
export const LOCATION_SEND_INTERVAL_ONLINE_MS = 10_000;
export const LOCATION_SEND_INTERVAL_ON_ORDER_MS = 5_000;

/** Максимум точек в одном батче */
export const LOCATION_BATCH_MAX = 50;

/** Максимум точек в offline-очереди */
export const LOCATION_QUEUE_MAX = 500;

/** Время автозакрытия предложения заказа (мс) */
export const ORDER_OFFER_TIMEOUT_MS = 30_000;

/** Задержка перед редиректом после завершения заказа (мс) */
export const ORDER_COMPLETE_REDIRECT_MS = 5_000;

/* -------------------------------------------------------------------------- */
/*  GPS-параметры                                                              */
/* -------------------------------------------------------------------------- */

/** Foreground GPS — online */
export const GPS_FOREGROUND_ONLINE = {
  timeInterval: 5_000,
  distanceInterval: 20,
} as const;

/** Foreground GPS — on_order */
export const GPS_FOREGROUND_ON_ORDER = {
  timeInterval: 3_000,
  distanceInterval: 10,
} as const;

/** Background GPS — online */
export const GPS_BACKGROUND_ONLINE = {
  timeInterval: 15_000,
  distanceInterval: 50,
} as const;

/** Background GPS — on_order */
export const GPS_BACKGROUND_ON_ORDER = {
  timeInterval: 5_000,
  distanceInterval: 15,
} as const;

/** Название фоновой задачи для expo-task-manager */
export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';
