/**
 * @file: src/stores/offer.store.ts
 * @description:
 *   Предложение заказа, которое приложение сейчас держит (1.5.59).
 *
 *   ЗАЧЕМ ОБЩЕЕ ХРАНИЛИЩЕ, А НЕ СОСТОЯНИЕ ОКНА. О предложении должны знать
 *   трое: `OrderOfferWatcher` показывает окно; `SocketProvider` не звенит
 *   второй раз о заказе, который уже предложен (сервер шлёт следом `order:new`
 *   для старых сборок); экраны со своим окном «взять заказ» закрывают его,
 *   чтобы два окна не легли друг на друга. Решение, какое предложение
 *   держать, — чистая функция `nextActiveOffer`.
 *
 * @dependencies: zustand, @/lib/order-offer, @/types/socket-events
 * @created: 2026-09-13 (1.5.59)
 */

import { create } from 'zustand';
import { nextActiveOffer, type ActiveOffer } from '@/lib/order-offer';
import type { OrderOfferEvent } from '@/types/socket-events';

interface OfferState {
  current: ActiveOffer | null;
  /**
   * Принять пришедшее предложение к рассмотрению.
   * @returns стало ли оно текущим (иначе — опоздало или окно занято)
   */
  receive: (event: OrderOfferEvent, nowMs: number) => boolean;
  /** Снять предложение: ответили, истекло, заказ забрали. */
  clear: (orderId: string) => void;
}

export const useOfferStore = create<OfferState>((set, get) => ({
  current: null,
  receive: (event, nowMs) => {
    const next = nextActiveOffer(get().current, event, nowMs);
    set({ current: next });
    return next?.event === event;
  },
  // По идентификатору, а не «снять что есть»: ответ на старое предложение
  // может прийти, когда на экране уже новое, и не должен его закрыть.
  clear: (orderId) => {
    if (get().current?.event.orderId === orderId) set({ current: null });
  },
}));
