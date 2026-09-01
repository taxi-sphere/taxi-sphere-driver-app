/**
 * @file: app/(main)/(tabs)/counter.tsx
 * @description:
 *   Встречные заказы переехали на экран активного заказа (v1.5.17):
 *   встречный — это второй активный заказ того же водителя, и место ему
 *   рядом с первым, а не в отдельной вкладке.
 *
 *   Файл оставлен редиректом ради сохранившихся ссылок на маршрут.
 *
 * @dependencies: expo-router
 * @created: 2026-03-18 06:00:00
 * @updated: 2026-09-01 (v1.5.17 — редирект в «Заказ»)
 */

import { Redirect } from 'expo-router';

export default function CounterOrdersScreen() {
  return <Redirect href="/(main)/(tabs)/current" />;
}
