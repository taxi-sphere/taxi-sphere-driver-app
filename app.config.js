/**
 * @file: app.config.js
 * @description:
 *   Динамическая надстройка над статическим app.json (Expo читает app.json и
 *   передаёт его сюда как `config`).
 *
 *   ЗАЧЕМ (v1.5.11): подставить ключ Google Maps для Android. Держать его в
 *   app.json нельзя: репозиторий публичный, GitHub secret-scanning распознаёт
 *   строки вида `AIzaSy…` и блокирует push, а боты снимают такие ключи с
 *   публичных репозиториев в первые минуты.
 *
 *   Ключ берётся в этом порядке:
 *     1. process.env.GOOGLE_MAPS_ANDROID_API_KEY — так его передают CI
 *        (GitHub Actions secret) и EAS (environment variable);
 *     2. файл .env.local — так он лежит на машине разработчика
 *        (.env.local в .gitignore, в отличие от .env, который в репозитории).
 *
 *   .env.local разбирается здесь явно, а не через автозагрузку Expo CLI,
 *   потому что поведение отличается между инструментами: EAS CLI .env-файлы
 *   при вычислении app config не читает вовсе (документировано), а у Expo CLI
 *   момент загрузки относительно app.config.js зависит от версии. Явное
 *   чтение даёт одинаковый результат во всех трёх путях сборки.
 *
 *   ── Почему кроме ключа выставляется ФЛАГ в extra ───────────────────────────
 *   Ключ уходит в `android.config.googleMaps.apiKey`, откуда prebuild пишет
 *   его в AndroidManifest (com.google.android.geo.API_KEY) — это то, что
 *   читает нативный слой Google Maps.
 *
 *   Но в рантайме этого ключа НЕ ВИДНО: expo-constants вшивает в APK
 *   ПУБЛИЧНЫЙ конфиг (`getConfig(..., { isPublicConfig: true })`, см.
 *   node_modules/expo-constants/scripts/build/getAppConfig.js), а публичный
 *   конфиг вырезает `android.config` и `ios.config` — ровно потому, что там
 *   лежат ключи. Проверено: `expo config --type public` отдаёт android без
 *   поля `config`, `--type prebuild` — с ним.
 *
 *   Поэтому `isEmbeddedMapAvailable()` не может спросить про сам ключ и
 *   спрашивает про этот флаг. `extra` в публичном конфиге сохраняется, а
 *   булев признак «в сборке есть ключ» ничего не раскрывает.
 *
 *   Без ключа конфиг возвращается как есть, флаг не выставляется, и
 *   приложение остаётся рабочим: встроенная карта не монтируется, маршрут
 *   строится во внешнем навигаторе (см. src/lib/map-availability.ts).
 *
 * @dependencies: app.json, .env.local, src/lib/map-availability.ts
 * @created: 2026-08-28 (v1.5.11)
 */

const fs = require('fs');
const path = require('path');

const ENV_VAR = 'GOOGLE_MAPS_ANDROID_API_KEY';

/** Достаёт одну переменную из .env.local. Пусто, если файла или строки нет. */
function readFromEnvLocal(name) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
  } catch {
    return '';
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1 || trimmed.slice(0, eq).trim() !== name) continue;

    return trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return '';
}

function resolveGoogleMapsKey() {
  const fromProcess = process.env[ENV_VAR];
  if (typeof fromProcess === 'string' && fromProcess.trim()) {
    return fromProcess.trim();
  }
  return readFromEnvLocal(ENV_VAR);
}

module.exports = ({ config }) => {
  const apiKey = resolveGoogleMapsKey();

  if (!apiKey) {
    console.warn(
      `[app.config] ${ENV_VAR} не задан — встроенная карта в сборке будет отключена.`,
    );
    return config;
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: { apiKey },
      },
    },
    extra: {
      ...config.extra,
      // Публичный признак наличия ключа — см. блок в шапке файла.
      embeddedMapAvailable: { android: true, ios: false },
    },
  };
};
