/**
 * @file: src/types/chat.ts
 * @description:
 *   Переписка водителя с диспетчерской.
 *   Форма приходит с `GET/POST /api/v1/driver/chat`.
 * @dependencies: нет
 * @created: 2026-09-09 (1.5.52)
 */

/** Кто написал сообщение. */
export type ChatAuthorRole = 'driver' | 'admin';

export interface ChatMessage {
  id: string;
  authorRole: ChatAuthorRole;
  message: string;
  /** Кто из диспетчеров ответил. У сообщений водителя пусто. */
  adminName: string | null;
  createdAt: string;
}

export interface ChatPage {
  /** В хронологическом порядке: новые внизу. */
  items: ChatMessage[];
  /** Есть ли что подгружать вверх. */
  hasMore: boolean;
  /** Сколько сообщений диспетчера пришло после последнего прочтения. */
  unreadCount: number;
}
