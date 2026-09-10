/**
 * @file: src/types/news.ts
 * @description:
 *   Объявление службы в том виде, в каком его видит водитель.
 * @dependencies: нет
 * @created: 2026-09-10 (1.5.53)
 */

/** Зачем написано объявление — от этого зависит только метка на карточке. */
export type NewsCategory = 'news' | 'rule' | 'update' | 'promo';

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  category: NewsCategory;
  /** Закреплённые показываются первыми — так же, как в админке. */
  isPinned: boolean;
  createdAt: string;
}

export interface NewsPage {
  items: NewsArticle[];
  /** Сколько объявлений появилось после последнего открытия раздела. */
  unreadCount: number;
}
