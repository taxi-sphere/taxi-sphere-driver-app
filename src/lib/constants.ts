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

/**
 * Запущено ли приложение под Metro (dev-сборка).
 *
 * `hostUri` заполняет dev-сервер, в релизном APK его нет. Признак нужен,
 * чтобы зашитый в сборку прод-адрес НЕ перебивал локальный сервер
 * разработчика: под Metro по-прежнему используется IP машины с Metro.
 */
const IS_METRO_BUILD = Boolean(Constants.expoConfig?.hostUri);

/**
 * Адрес сервера, зашитый в сборку (app.json → `expo.extra.defaultApiUrl`).
 *
 * ЗАЧЕМ (v1.5.13): до этого адрес в APK не зашивался вовсе —
 * `EXPO_PUBLIC_API_URL` в `.env` закомментирован, в CI-workflow его нет, и
 * `https://taxitest1.appvault.pro` встречался только как `placeholder` полей
 * ввода. Значит после чистой установки приложение стучалось в
 * `http://10.0.2.2:3003`, и водитель был обязан сам раскрыть свёрнутый блок
 * «Настройки сервера» на экране входа и вписать адрес руками — барьер на
 * первом же экране для человека, который просто установил приложение.
 *
 * Значение не секретное (это публичный домен сервиса), поэтому лежит прямо
 * в app.json: не нужно ни env-обвязки, ни CI-секрета, и оно одинаково во
 * всех путях сборки. Переопределяется при сборке через `EXPO_PUBLIC_API_URL`,
 * а водителем — через поле «Настройки сервера», которое имеет приоритет над
 * этим значением (см. `getApiUrl`).
 */
function bakedUrl(key: 'defaultApiUrl' | 'defaultSocketUrl'): string | null {
  const extra = Constants.expoConfig?.extra as
    | Record<string, unknown>
    | undefined;
  const value = extra?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/$/, '');
  return trimmed || null;
}

/** URL API сервера по умолчанию (используется если не задан в настройках) */
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (IS_METRO_BUILD ? null : bakedUrl('defaultApiUrl')) ??
  `http://${HOST}:${DEFAULT_API_PORT}`;

/** URL Socket.IO по умолчанию */
export const DEFAULT_SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ??
  (IS_METRO_BUILD
    ? null
    : bakedUrl('defaultSocketUrl') ?? bakedUrl('defaultApiUrl')) ??
  `http://${HOST}:${DEFAULT_SOCKET_PORT}`;

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

/**
 * ЕДИНЫЙ профиль GPS — один на все состояния водителя (v1.5.16).
 *
 * ЗАЧЕМ ОДИН, А НЕ ЧЕТЫРЕ. До v1.5.16 профилей было четыре: foreground/
 * background × свободен/на заказе, с интервалами 3, 5, 5 и 15 секунд и
 * тремя разными классами точности. Худший из них — background + свободен
 * (15 с, порог 50 м, точность Balanced) — доставался САМОМУ ЧАСТОМУ
 * состоянию: водитель ждёт заказ с погашенным экраном. Именно его
 * диспетчер видит на карте почти всё время, и именно оттуда шли рывки:
 *
 *   - Balanced в expo-location — «точность порядка ста метров»: позиция
 *     берётся по вышкам и Wi-Fi, GPS может не включаться вовсе. Машина
 *     прыгает на десятки метров, стоя на месте. Буфер на карте выравнивает
 *     ВРЕМЯ прихода точек и такие прыжки сгладить не может в принципе.
 *   - Порог смещения 50 м означает, что точка не придёт, пока машина не
 *     проехала эти 50 м. В пробке на 5 км/ч это полминуты молчания, а
 *     потом скачок.
 *
 * Один профиль вместо четырёх даёт ещё и предсказуемость: карта ведёт себя
 * одинаково во всех состояниях, отставание маркера постоянное (~7 с), и
 * подбирать компромисс «батарея против плавности» нужно в одном месте, а
 * не в четырёх.
 *
 * ЦЕНА — батарея: в фоне GPS теперь работает так же, как при открытом
 * приложении. У водителей на смене телефон обычно на зарядке в держателе.
 */
export const GPS_TRACKING = {
  timeInterval: 5_000,
  /**
   * v1.5.21: 5 м вместо 15.
   *
   * ЗАЧЕМ. Фильтр по расстоянию делал КАДЕНС НЕРАВНОМЕРНЫМ на малой скорости:
   * при 60 км/ч 15 м проезжаются за 0.9 с и частоту задаёт время (ровно 5 с),
   * при 10 км/ч — за 5.4 с, при 5 км/ч — за 11 с. Буфер отрисовки на карте
   * подстраивается под наблюдаемый интервал скользящим средним, и такие
   * скачки 5 → 11 → 5 с он отследить не успевает: маркер то отстаёт, то
   * догоняет. При 5 м время задаёт частоту уже с 3.6 км/ч — то есть на любой
   * скорости, на которой машина реально едет.
   *
   * ПОЧЕМУ НЕ 0. Ноль означал бы поток фиксов и у СТОЯЩЕЙ машины — а она,
   * стоя на месте, шумит в пределах своей погрешности. Пять метров этот шум
   * отсекают, и припаркованный водитель по-прежнему не шлёт ничего.
   */
  distanceInterval: 5,
} as const;

/**
 * Как часто приложение подаёт признак жизни, мс (1.5.22).
 *
 * Сервер считает приложение мёртвым после трёх пропусков подряд (90 с) —
 * меньший запас давал бы мигание на карте при обычной потере пакета в
 * мобильной сети. Тридцать секунд — это 120 запросов за час на водителя,
 * пренебрежимо и по трафику, и по батарее.
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Название фоновой задачи для expo-task-manager */
export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';
