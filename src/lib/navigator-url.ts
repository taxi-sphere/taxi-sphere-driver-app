/**
 * @file: src/lib/navigator-url.ts
 * @description:
 *   Ссылка, по которой внешний навигатор строит маршрут до точки.
 *
 *   ЗАЧЕМ ОТДЕЛЬНО (1.5.61). Ссылки жили внутри экрана заказа. После смены
 *   адреса водителю нужно открыть навигатор с новой точкой прямо с экрана
 *   поиска адреса, и вторая копия трёх ссылок разошлась бы с первой при
 *   первой же правке формата. Модуль чистый — без react-native, чтобы его
 *   проверяли тесты; само открытие — в `open-navigator.ts`.
 *
 * @dependencies: нет
 * @created: 2026-09-13 (1.5.61)
 */

/** Навигатор по умолчанию — тот же, что в настройках при первом запуске. */
const DEFAULT_NAVIGATOR = 'yandex';

const BUILDERS: Record<string, (lat: number, lng: number) => string> = {
  yandex: (lat, lng) => `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`,
  // У 2ГИС порядок обратный: сначала долгота.
  '2gis': (lat, lng) => `dgis://2gis.ru/routeSearch/rsType/car/to/${lng},${lat}`,
  google: (lat, lng) => `google.navigation:q=${lat},${lng}`,
};

/** Ссылка для выбранного навигатора. Неизвестный — как навигатор по умолчанию. */
export function navigatorUrl(app: string, lat: number, lng: number): string {
  const build = BUILDERS[app] ?? BUILDERS[DEFAULT_NAVIGATOR]!;
  return build(lat, lng);
}

/** Запасной путь, если навигатор не установлен: маршрут в браузере. */
export function navigatorWebUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
