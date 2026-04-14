/**
 * @file: src/types/driver.ts
 * @description:
 *   Типы профиля водителя.
 *   Контракт совпадает с GET /api/v1/driver/profile на backend.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

/** Статус водителя */
export type DriverStatus = 'offline' | 'online' | 'busy' | 'on_order';

/** Полный профиль водителя (ответ GET /driver/profile) */
export interface DriverProfile {
  id: string;
  phone: string;
  status: DriverStatus;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  callSign: string | null;
  additionalPhone: string | null;
  city: string | null;
  balance: number;
  rating: number;
  activity: number;
  totalTrips: number;
  totalEarnings: number;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  vehicleYear: number | null;
  vehicleType: string | null;
  photoUrl: string | null;
  lastLocationLat: number | null;
  lastLocationLng: number | null;
  lastSeenAt: string | null;
}

/** Поля, которые водитель может обновить через PATCH /driver/profile */
export interface DriverProfileUpdate {
  additionalPhone?: string | null;
  city?: string;
  photoUrl?: string | null;
}
