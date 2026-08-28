/**
 * @file: src/lib/map-availability.ts
 * @description:
 *   Доступна ли ВСТРОЕННАЯ карта в текущей сборке.
 *
 *   ЗАЧЕМ (v1.5.9): `react-native-maps` с PROVIDER_GOOGLE не может
 *   инициализироваться без ключа Google Maps, и падает НАТИВНО — такой краш
 *   не ловится ни try/catch, ни React ErrorBoundary, приложение просто
 *   закрывается. Так и происходило при открытии вкладки «Текущий»: ключа в
 *   сборке не было, а карта — единственное место, где он нужен.
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
 *   ── Почему проверяется флаг, а не сам ключ (исправлено в v1.5.11) ─────────
 *   До v1.5.11 здесь читался `expoConfig.android.config.googleMaps.apiKey`.
 *   Это не работает НИ ПРИ КАКОМ ключе: expo-constants вшивает в APK
 *   ПУБЛИЧНЫЙ конфиг (`getConfig(..., { isPublicConfig: true })`), а тот
 *   вырезает `android.config` и `ios.config` — ровно потому, что там лежат
 *   ключи. Проверено на этом проекте: `expo config --type public` отдаёт
 *   android без поля `config`, `--type prebuild` — с ним. Дефект был латентным
 *   ровно до момента, когда ключ появился: проверка вернула бы false, и карта
 *   осталась бы скрытой при полностью рабочей сборке.
 *
 *   Поэтому app.config.js кладёт рядом с ключом публичный булев признак
 *   `extra.embeddedMapAvailable`, и спрашиваем мы его. Сам ключ в рантайме
 *   не нужен: нативный слой Google Maps берёт его из AndroidManifest.
 *
 * @dependencies: expo-constants, app.config.js
 * @created: 2026-08-28 (v1.5.9)
 * @updated: 2026-08-28 (v1.5.11)
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** Форма флага, который выставляет app.config.js при наличии ключа. */
interface EmbeddedMapFlag {
  android?: boolean;
  ios?: boolean;
}

/**
 * Есть ли в сборке ключ карт для текущей платформы.
 * Источник — `expo.extra.embeddedMapAvailable`, см. app.config.js.
 */
export function isEmbeddedMapAvailable(): boolean {
  const extra = Constants.expoConfig?.extra as
    | { embeddedMapAvailable?: EmbeddedMapFlag }
    | undefined;

  const flag = extra?.embeddedMapAvailable;
  if (!flag) return false;

  if (Platform.OS === 'android') return flag.android === true;
  if (Platform.OS === 'ios') return flag.ios === true;
  return false;
}

/** Причина, по которой карта скрыта — для подсказки в интерфейсе. */
export const EMBEDDED_MAP_UNAVAILABLE_HINT =
  'Карта не настроена. Маршрут можно построить в навигаторе.';
