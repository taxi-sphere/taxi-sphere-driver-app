/**
 * @file: app/(main)/(tabs)/preliminary.tsx
 * @description:
 *   Предзаказы переехали в «Заказы» — вторым режимом того же экрана
 *   (v1.5.17). Отдельная вкладка занимала одно из четырёх мест главной
 *   навигации и почти всегда пустовала.
 *
 *   Файл оставлен редиректом: маршрут мог сохраниться в истории навигации
 *   и в уведомлениях, разосланных прежними версиями приложения.
 *
 * @dependencies: expo-router
 * @created: 2026-03-18 06:00:00
 * @updated: 2026-09-01 (v1.5.17 — редирект в «Заказы»)
 */

import { Redirect } from 'expo-router';

export default function PreliminaryScreen() {
  return <Redirect href="/(main)/(tabs)/orders" />;
}
