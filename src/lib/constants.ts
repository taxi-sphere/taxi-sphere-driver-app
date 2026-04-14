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
 * Socket.IO работает на том же порту что и API (встроен в Next.js сервер).
 * Водитель вводит один URL — всё работает автоматически.
 */
export function getSocketUrl(): string {
  return getApiUrl();
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

/** Интервал отправки батча геоточек — online (мс) */
export const LOCATION_SEND_INTERVAL_ONLINE_MS = 10_000;

/** Интервал отправки батча геоточек — on_order (мс) */
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
