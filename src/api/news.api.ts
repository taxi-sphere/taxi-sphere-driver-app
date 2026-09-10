/**
 * @file: src/api/news.api.ts
 * @description:
 *   Объявления службы: новости, правила, акции, заметки об обновлениях.
 *   `GET /api/v1/driver/news`.
 *
 *   До 1.5.53 этот файл существовал, но его никто не вызывал: экрана для
 *   объявлений в приложении не было, и служба писала их в пустоту.
 * @dependencies: ./client, @/schemas/news.schema, @/types/news
 * @created: 2026-03-30
 * @updated: 2026-09-10 (1.5.53 — проверка схемы, счётчик непрочитанных)
 */

import { apiGet } from './client';
import { newsResponseSchema } from '@/schemas/news.schema';
import { driverLogger } from '@/services/logger.service';
import type { NewsPage } from '@/types/news';

export interface FetchNewsParams {
  /** Когда водитель последний раз открывал раздел — для счётчика. */
  since?: string | null;
}

export async function getNews(params: FetchNewsParams = {}): Promise<NewsPage> {
  const searchParams: Record<string, string> = {};
  if (params.since) searchParams.since = params.since;

  const res = await apiGet('driver/news', { searchParams });
  const parsed = newsResponseSchema.safeParse(res);

  if (!parsed.success) {
    driverLogger.error('Schema validation failed: news', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'news.api',
      action: 'parse_news',
      extra: { issues: parsed.error?.issues },
    });
    // Пустой список вместо исключения — то же решение, что в остальных
    // списках: одно сломанное объявление не повод показать экран ошибки.
    return { items: [], unreadCount: 0 };
  }

  return { items: parsed.data.data, unreadCount: parsed.data.unreadCount };
}
