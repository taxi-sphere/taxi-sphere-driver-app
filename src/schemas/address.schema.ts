/**
 * @file: src/schemas/address.schema.ts
 * @description:
 *   Проверка ответа подсказок адресов (`GET /api/v1/driver/address-suggest`).
 * @dependencies: zod
 * @created: 2026-09-13 (1.5.61)
 */

import { z } from 'zod';

const text = z.string().nullish().transform((v) => v ?? '');
const optionalText = z.string().nullish().transform((v) => v ?? null);

export const addressSuggestionSchema = z.object({
  name: text,
  address: z.string(),
  city: text,
  region: text,
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  source: optionalText,
  title: z.string(),
  secondary: optionalText,
  subtitle: optionalText,
  entrance: text,
});

export const addressSuggestResponseSchema = z.object({
  items: z.array(addressSuggestionSchema),
  searchUnavailable: z.boolean().nullish().transform((v) => v ?? false),
});
