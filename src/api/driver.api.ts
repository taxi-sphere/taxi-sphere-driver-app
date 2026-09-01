/**
 * @file: src/api/driver.api.ts
 * @description:
 *   API-вызовы профиля водителя: получение, обновление, статус, геолокация.
 * @dependencies: api/client, schemas/driver.schema
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { apiGet, apiPatch, apiPost } from './client';
import { driverProfileSchema } from '@/schemas/driver.schema';
import type { DriverProfile, DriverProfileUpdate, DriverStatus } from '@/types/driver';
import type { LocationBatch, LocationResponse } from '@/types/location';

/** Получить профиль водителя */
export async function getProfile(): Promise<DriverProfile> {
  const res = await apiGet<DriverProfile>('driver/profile');
  return driverProfileSchema.parse(res);
}

/** Обновить профиль водителя */
export async function updateProfile(
  data: DriverProfileUpdate,
): Promise<DriverProfile> {
  const res = await apiPatch<DriverProfile>('driver/profile', data);
  return driverProfileSchema.parse(res);
}

/** Установить статус водителя (online/offline/busy) */
export async function setStatus(
  status: Exclude<DriverStatus, 'on_order'>,
): Promise<{ status: string }> {
  return apiPost<{ status: string }>('driver/status', { status });
}

/**
 * Брать ли новые заказы (сервер v1.99.69).
 *
 * ОТДЕЛЬНО ОТ СТАТУСА намеренно: статус описывает смену и на заказе не
 * меняется, а «больше пока не предлагайте» водитель говорит как раз во
 * время поездки — это про готовность взять встречный. Эндпоинт тот же,
 * поле другое.
 */
export async function setAcceptingOrders(
  accepting: boolean,
): Promise<{ status: string; acceptingOrders: boolean }> {
  return apiPost<{ status: string; acceptingOrders: boolean }>('driver/status', {
    acceptingOrders: accepting,
  });
}

/** Отправить батч GPS-точек */
export async function sendLocation(
  batch: LocationBatch,
): Promise<LocationResponse> {
  return apiPost<LocationResponse>('driver/location', batch);
}

/** Сохранить push-токен на сервере */
export async function savePushToken(pushToken: string): Promise<void> {
  await apiPost<{ success: boolean }>('driver/push-token', { pushToken });
}
