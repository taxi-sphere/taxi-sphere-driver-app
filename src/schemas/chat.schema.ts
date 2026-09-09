/**
 * @file: src/schemas/chat.schema.ts
 * @description:
 *   Проверка ответов переписки с диспетчерской.
 * @dependencies: zod
 * @created: 2026-09-09 (1.5.52)
 */

import { z } from 'zod';

export const chatMessageSchema = z.object({
  id: z.string(),
  authorRole: z.enum(['driver', 'admin']),
  message: z.string(),
  adminName: z.string().nullish().default(null),
  createdAt: z.string(),
});

export const chatPageSchema = z.object({
  items: z.array(chatMessageSchema),
  hasMore: z.boolean().nullish().transform((v) => v ?? false),
  // Счётчик непрочитанных сервер считает только когда приложение прислало
  // отметку последнего прочтения. Не прислало — ноль, а не «неизвестно»:
  // бейдж с вопросительным знаком водителю ничего не говорит.
  unreadCount: z.number().nullish().transform((v) => v ?? 0),
});

export const chatSendResponseSchema = z.object({
  item: chatMessageSchema,
});
