/**
 * @file: src/api/chat.api.ts
 * @description:
 *   Переписка с диспетчерской: чтение ленты и отправка сообщения.
 *   `GET/POST /api/v1/driver/chat`.
 * @dependencies: ./client, @/schemas/chat.schema, @/types/chat
 * @created: 2026-09-09 (1.5.52)
 */

import { apiGet, apiPost } from './client';
import { chatPageSchema, chatSendResponseSchema } from '@/schemas/chat.schema';
import { driverLogger } from '@/services/logger.service';
import { humanApiError } from '@/lib/utils';
import type { ChatMessage, ChatPage } from '@/types/chat';

export interface FetchChatParams {
  limit?: number;
  /** Подгрузка вверх: время самого старого показанного сообщения. */
  before?: string | null;
  /** Когда водитель последний раз открывал чат — для счётчика непрочитанных. */
  since?: string | null;
}

export async function fetchChat(params: FetchChatParams = {}): Promise<ChatPage> {
  const searchParams: Record<string, string> = {};
  if (params.limit) searchParams.limit = String(params.limit);
  if (params.before) searchParams.before = params.before;
  if (params.since) searchParams.since = params.since;

  const res = await apiGet('driver/chat', { searchParams });
  const parsed = chatPageSchema.safeParse(res);

  if (!parsed.success) {
    driverLogger.error('Schema validation failed: chat', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'chat.api',
      action: 'parse_chat',
      extra: { issues: parsed.error?.issues },
    });
    return { items: [], hasMore: false, unreadCount: 0 };
  }

  return parsed.data;
}

/**
 * Отправить сообщение диспетчеру.
 *
 * Здесь ошибка НЕ проглатывается, в отличие от чтения: водитель обязан
 * узнать, что сообщение не ушло, — иначе он будет ждать ответа на вопрос,
 * которого никто не видел.
 */
export async function sendChatMessage(message: string): Promise<ChatMessage> {
  let res: unknown;
  try {
    res = await apiPost('driver/chat', { message });
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Ошибка соединения';
    driverLogger.error('Не удалось отправить сообщение диспетчеру', {
      stack: text,
      screen: 'chat.api',
      action: 'send_message',
    });
    throw new Error(
      humanApiError(text, 'Сообщение не ушло. Проверьте связь и попробуйте ещё раз.'),
    );
  }

  const parsed = chatSendResponseSchema.safeParse(res);
  if (!parsed.success) {
    driverLogger.error('Schema validation failed: chat send', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'chat.api',
      action: 'parse_send_response',
      extra: { issues: parsed.error?.issues },
    });
    throw new Error('Сервер ответил неожиданно. Сообщение могло не дойти.');
  }

  return parsed.data.item;
}
