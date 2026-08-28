/**
 * @file: src/lib/map-availability.ts
 * @description:
 *   Доступна ли ВСТРОЕННАЯ карта в текущей сборке.
 *
 *   ЗАЧЕМ (v1.5.9): `react-native-maps` с PROVIDER_GOOGLE не может
 *   инициализироваться без ключа Google Maps, и падает НАТИВНО — такой краш
 *   не ловится ни try/catch, ни React ErrorBoundary, приложение просто
 *   закрывается. Так и происходило при открытии вкладки «Текущий»: ключ в
 *   проекте не задан (в app.json нет `android.config.googleMaps.apiKey`,
 *   в манифесте APK нет `com.google.android.geo.API_KEY`), а карта —
 *   единственное место, где он нужен.
 *
 *   Единственный надёжный способ пережить отсутствие ключа — НЕ РЕНДЕРИТЬ
 *   MapView вовсе. Поэтому наличие ключа проверяется здесь, до монтирования
 *   карты, а не отлавливается после.
 *
 *   ВАЖНО: встроенная карта в приложении водителя — вспомогательная. Маршрут
 *   строится во внешнем навигаторе (Яндекс.Навигатор / 2ГИС / Google), он
 *   выбирается в настройках и работает без каких-либо ключей. Поэтому без
 *   карты приложение остаётся полностью рабочим: адрес, клиент, кнопки
 *   статусов и навигация на месте.
 *
 *   Ключ читается из конфигурации сборки (expo-constants), а не из настроек
 *   на сервере, потому что нативный слой Google Maps забирает его из
 *   AndroidManifest при инициализации — подменить в рантайме невозможно.
 *   Как только ключ пропишут в app.json и пересоберут APK, карта включится
 *   сама, без правок кода.
 *
 * @dependencies: expo-constants
 * @created: 2026-08-28 (v1.5.9)
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Есть ли в сборке ключ Google Maps для текущей платформы.
 *
 * Android: `expo.android.config.googleMaps.apiKey`
 * iOS:     `expo.ios.config.googleMapsApiKey`
 */
export function isEmbeddedMapAvailable(): boolean {
  const cfg = Constants.expoConfig;
  if (!cfg) return false;

  if (Platform.OS === 'android') {
    return nonEmpty(cfg.android?.config?.googleMaps?.apiKey);
  }
  if (Platform.OS === 'ios') {
    return nonEmpty(cfg.ios?.config?.googleMapsApiKey);
  }
  return false;
}

/** Причина, по которой карта скрыта — для подсказки в интерфейсе. */
export const EMBEDDED_MAP_UNAVAILABLE_HINT =
  'Карта не настроена. Маршрут можно построить в навигаторе.';
