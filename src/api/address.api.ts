/**
 * @file: src/api/address.api.ts
 * @description:
 *   Поиск адреса для смены адреса в поездке — те же подсказки, что в пульте
 *   диспетчера (`GET /api/v1/driver/address-suggest`, сервер v1.100.15).
 * @dependencies: ./client, @/schemas/address.schema, @/types/address
 * @created: 2026-09-13 (1.5.61)
 */

import { apiGet } from './client';
import { addressSuggestResponseSchema } from '@/schemas/address.schema';
import { driverLogger } from '@/services/logger.service';
import type { AddressSuggestPage } from '@/types/address';

/** Сколько вариантов показывать: больше на экране телефона не читается. */
const SUGGEST_LIMIT = 8;

/**
 * Подсказки адреса.
 *
 * `localOnly` — только адресная книга службы, без внешнего поиска. Так
 * работает и пульт (v1.99.40): книга отвечает за десятки миллисекунд,
 * внешний поиск — за секунды. Экран шлёт оба запроса разом и показывает
 * книгу, не дожидаясь второго: на стенде 13.09.2026 один полный запрос шёл
 * 2,5–4,6 с, хотя нужный адрес был в книге.
 */
export async function suggestAddresses(
  query: string,
  { localOnly = false }: { localOnly?: boolean } = {},
): Promise<AddressSuggestPage> {
  const searchParams: Record<string, string> = { query, limit: String(SUGGEST_LIMIT) };
  if (localOnly) searchParams.only = 'local';

  const res = await apiGet('driver/address-suggest', { searchParams });
  const parsed = addressSuggestResponseSchema.safeParse(res);

  if (!parsed.success) {
    driverLogger.error('Schema validation failed: address suggest', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'address.api',
      action: 'parse_address_suggest',
      extra: { issues: parsed.error?.issues },
    });
    return { items: [], searchUnavailable: true };
  }

  return parsed.data;
}
