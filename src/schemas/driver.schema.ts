/**
 * @file: src/schemas/driver.schema.ts
 * @description:
 *   Zod-схемы для валидации ответов driver API.
 * @dependencies: zod
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { z } from 'zod';

export const driverProfileSchema = z.object({
  id: z.string(),
  phone: z.string(),
  status: z.enum(['offline', 'online', 'busy', 'on_order']),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  middleName: z.string().nullable(),
  callSign: z.string().nullable(),
  additionalPhone: z.string().nullable(),
  city: z.string().nullable(),
  balance: z.number(),
  rating: z.number(),
  activity: z.number(),
  totalTrips: z.number(),
  totalEarnings: z.number(),
  vehicleBrand: z.string().nullable(),
  vehicleModel: z.string().nullable(),
  vehicleColor: z.string().nullable(),
  vehiclePlate: z.string().nullable(),
  vehicleYear: z.number().nullable(),
  vehicleType: z.string().nullable(),
  photoUrl: z.string().nullable(),
  lastLocationLat: z.number().nullable(),
  lastLocationLng: z.number().nullable(),
  lastSeenAt: z.string().nullable(),
});
