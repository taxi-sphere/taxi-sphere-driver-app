/**
 * @file: src/types/api.ts
 * @description:
 *   Общие типы для API: обёртки ответов, ошибки, пагинация.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

/** Успешный ответ API */
export interface ApiSuccess<T> {
  success: true;
  data?: T;
  message?: string;
}

/** Ошибка API */
export interface ApiError {
  error: string;
  fieldErrors?: Record<string, string[]>;
  status?: number;
}

/** Пагинированный ответ */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
