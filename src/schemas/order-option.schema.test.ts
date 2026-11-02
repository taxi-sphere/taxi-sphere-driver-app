/**
 * @file: src/schemas/order-option.schema.test.ts
 * @description: Опция заказа у водителя: параметры («details») доходят до карточки, старый сервер без поля и скрытое название не ломают разбор.
 */
import { describe, expect, it } from 'vitest';
import { orderOptionSchema } from './order.schema';

describe('orderOptionSchema', () => {
  it('параметры опции сохраняются, а не отбрасываются схемой', () => {
    const parsed = orderOptionSchema.parse({ id: 'o1', name: 'Детское кресло', details: 'Ребёнок 1: 3 · Ребёнок 2: 7' });
    expect(parsed.details).toBe('Ребёнок 1: 3 · Ребёнок 2: 7');
  });

  it('старый сервер без поля и скрытое название (null) принимаются', () => {
    expect(orderOptionSchema.parse({ id: 'o1', name: 'Багаж' }).details).toBeUndefined();
    expect(orderOptionSchema.parse({ id: 'o2', name: 'Дополнительная опция', details: null }).details).toBeNull();
  });

  it('без названия опция не принимается', () => {
    expect(orderOptionSchema.safeParse({ id: 'o1' }).success).toBe(false);
  });
});
