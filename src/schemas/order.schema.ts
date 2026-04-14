/**
 * @file: src/schemas/order.schema.ts
 * @description:
 *   Zod-схемы для валидации ответов orders API.
 * @dependencies: zod
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { z } from 'zod';

const paymentMethodSchema = z.enum(['cash', 'card', 'bonus']).nullable();

const orderStopSchema = z.object({
  address: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  entrance: z.string().nullable(),
  note: z.string().nullable(),
});

export const availableOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  pickupAddress: z.string(),
  pickupLat: z.number().nullable(),
  pickupLng: z.number().nullable(),
  dropoffAddress: z.string().nullable(),
  dropoffLat: z.number().nullable(),
  dropoffLng: z.number().nullable(),
  estimatedPrice: z.number().nullable(),
  estimatedKm: z.number().nullable(),
  paymentMethod: paymentMethodSchema,
  comment: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  createdAt: z.string(),
  serviceName: z.string().nullable(),
  tariffName: z.string().nullable(),
  stopsCount: z.number(),
  distanceToPickup: z.number().nullable(),
});

const availableOrdersMetaSchema = z.object({
  effectiveRadius: z.number(),
  showOrdersWithoutGps: z.boolean(),
  hasGps: z.boolean(),
});

export const availableOrdersResponseSchema = z.object({
  items: z.array(availableOrderSchema),
  meta: availableOrdersMetaSchema.optional(),
});

export const currentOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  status: z.enum([
    'new',
    'searching',
    'assigned',
    'driver_arrived',
    'in_progress',
    'completed',
    'canceled',
  ]),
  clientPhone: z.string(),
  clientName: z.string().nullable(),
  pickupAddress: z.string(),
  pickupLat: z.number().nullable(),
  pickupLng: z.number().nullable(),
  pickupEntrance: z.string().nullable(),
  pickupNote: z.string().nullable(),
  dropoffAddress: z.string().nullable(),
  dropoffLat: z.number().nullable(),
  dropoffLng: z.number().nullable(),
  dropoffEntrance: z.string().nullable(),
  dropoffNote: z.string().nullable(),
  estimatedPrice: z.number().nullable(),
  estimatedKm: z.number().nullable(),
  estimatedMin: z.number().nullable(),
  paymentMethod: paymentMethodSchema,
  comment: z.string().nullable(),
  assignedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  serviceName: z.string().nullable(),
  tariffName: z.string().nullable(),
  // default([]) — защита от отсутствия поля в ответе сервера
  stops: z.array(orderStopSchema).default([]),
});

export const currentOrderResponseSchema = z.object({
  order: currentOrderSchema.nullable(),
});
