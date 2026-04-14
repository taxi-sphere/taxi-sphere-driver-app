/**
 * @file: src/api/news.api.ts
 * @description: API для новостей и правил.
 */

import { apiGet } from './client';

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  category: 'news' | 'rule' | 'update' | 'promo';
  isPinned: boolean;
  createdAt: string;
}

export async function getNews(): Promise<NewsArticle[]> {
  const res = await apiGet<{ data: NewsArticle[] }>('driver/news');
  return res.data;
}
