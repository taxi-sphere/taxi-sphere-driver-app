/**
 * @file: src/lib/open-navigator.ts
 * @description:
 *   Открыть внешний навигатор с маршрутом до точки — одно место на все
 *   экраны (1.5.61): экран заказа и экран смены адреса.
 * @dependencies: react-native (Linking), @/lib/navigator-url, @/lib/haptics
 * @created: 2026-09-13 (1.5.61)
 */

import { Linking } from 'react-native';
import { haptics } from '@/lib/haptics';
import { navigatorUrl, navigatorWebUrl } from '@/lib/navigator-url';

export function openInNavigator(app: string, lat: number, lng: number): void {
  haptics.tap();
  Linking.openURL(navigatorUrl(app, lat, lng)).catch(() => {
    // Навигатор не установлен — маршрут в браузере.
    void Linking.openURL(navigatorWebUrl(lat, lng));
  });
}
