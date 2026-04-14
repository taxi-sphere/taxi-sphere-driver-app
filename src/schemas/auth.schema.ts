/**
 * @file: src/schemas/auth.schema.ts
 * @description:
 *   Zod-схемы для валидации ответов auth API.
 * @dependencies: zod
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-13 14:00:00
 */

import { z } from 'zod';

export const authUserSchema = z.object({
  id: z.string(),
  role: z.enum(['client', 'driver', 'admin']),
  phone: z.string(),
});

export const authResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: authUserSchema,
  }),
});

export const refreshResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
});
