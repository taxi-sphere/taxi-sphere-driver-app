/**
 * @file: src/schemas/news.schema.ts
 * @description:
 *   Проверка ответа с объявлениями службы.
 *
 *   Категория `catch`-ится в `news`: в справочнике на сервере её могут
 *   пополнить, и незнакомое значение не повод выбросить всё объявление —
 *   текст читается одинаково при любой метке.
 * @dependencies: zod
 * @created: 2026-09-10 (1.5.53)
 */

import { z } from 'zod';

export const newsCategorySchema = z
  .enum(['news', 'rule', 'update', 'promo'])
  .catch('news');

export const newsArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  category: newsCategorySchema,
  isPinned: z.boolean().nullish().transform((v) => v ?? false),
  createdAt: z.string(),
});

export const newsResponseSchema = z.object({
  data: z.array(newsArticleSchema),
  // Сервер старше v1.100.9 счётчика не отдаёт — ноль честнее ошибки.
  unreadCount: z.number().nullish().transform((v) => v ?? 0),
});
