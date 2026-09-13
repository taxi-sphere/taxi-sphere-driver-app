/**
 * @file: src/lib/navigator-url.test.ts
 * @description: Ссылки внешних навигаторов — те же, что были в экране заказа до 1.5.61.
 * @created: 2026-09-13 (1.5.61)
 */

import { describe, expect, it } from 'vitest';
import { navigatorUrl, navigatorWebUrl } from './navigator-url';

describe('navigatorUrl', () => {
  it('Яндекс.Навигатор', () => {
    expect(navigatorUrl('yandex', 56.1162, 94.5921)).toBe(
      'yandexnavi://build_route_on_map?lat_to=56.1162&lon_to=94.5921',
    );
  });

  it('2ГИС — долгота первой', () => {
    expect(navigatorUrl('2gis', 56.1162, 94.5921)).toBe(
      'dgis://2gis.ru/routeSearch/rsType/car/to/94.5921,56.1162',
    );
  });

  it('Google', () => {
    expect(navigatorUrl('google', 56.1162, 94.5921)).toBe('google.navigation:q=56.1162,94.5921');
  });

  it('неизвестный навигатор — как по умолчанию', () => {
    expect(navigatorUrl('waze', 1, 2)).toBe(navigatorUrl('yandex', 1, 2));
  });

  it('запасной путь в браузере', () => {
    expect(navigatorWebUrl(1, 2)).toBe('https://www.google.com/maps/dir/?api=1&destination=1,2');
  });
});
