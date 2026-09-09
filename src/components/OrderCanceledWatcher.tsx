/**
 * @file: src/components/OrderCanceledWatcher.tsx
 * @description:
 *   Водителю говорят, что заказ отменили, — а не забирают его молча.
 *
 *   ЗАЧЕМ. До 1.5.46 отмена показывалась ТОЛЬКО когда приложение свёрнуто:
 *   в `SocketProvider` уведомление стоит под условием
 *   `AppState.currentState !== 'active'`. У водителя с открытым экраном заказ
 *   просто исчезал — без слова о том, что произошло и почему. Хуже всего это
 *   выглядит на подаче: машина едет по адресу, который больше никому не
 *   нужен, а на экране вдруг «свободных заказов нет».
 *
 *   ПОЧЕМУ ДИАЛОГ, А НЕ ПЛАШКА. Отмена — это конец работы, которую водитель
 *   уже начал: он развернётся, поедет в другую сторону, потеряет подачу.
 *   Такое требует явного «понял», иначе плашка уедет за три секунды мимо
 *   человека, который смотрит на дорогу, а не в телефон.
 *
 *   ПОЧЕМУ ОТДЕЛЬНЫЙ КОМПОНЕНТ, А НЕ ПРАВКА В SocketProvider. Диалоги живут
 *   в `ConfirmDialogProvider`, а он в дереве ВНУТРИ `SocketProvider` —
 *   позвать `useNotify` оттуда нельзя. Ровно по той же причине отдельным
 *   компонентом сделан `ScheduledConfirmationWatcher`; здесь тот же приём.
 *   Разделение получается честным: провайдер отвечает за кэш и фоновые
 *   уведомления, этот компонент — за разговор с водителем.
 *
 * @dependencies: socket.service, @/components/ui (диалог), @/lib/haptics
 * @created: 2026-09-08 (1.5.46)
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { socketService } from '@/services/socket.service';
import { useNotify } from '@/components/ui';
import { haptics } from '@/lib/haptics';

export function OrderCanceledWatcher() {
  const notify = useNotify();

  /**
   * Заказы, о которых уже сказали.
   *
   * Сервер шлёт отмену дважды: адресно снятому водителю и широковещательно
   * всем — чтобы заказ пропал из общего списка. Без этой памяти водитель,
   * у которого заказ забрали, получил бы два одинаковых окна подряд.
   */
  const announcedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = socketService.onOrderCanceled((data) => {
      const orderId = data?.orderId;
      // Широковещательное событие приходит без причины — это «уберите из
      // списка», а не «у вас забрали заказ». Разговор заводим только когда
      // сервер объяснил, что случилось.
      const reason = data?.reason?.trim();
      if (!reason) return;
      if (orderId) {
        if (announcedRef.current.has(orderId)) return;
        announcedRef.current.add(orderId);
      }

      // Свёрнутое приложение уже получило системное уведомление от
      // `SocketProvider`; диалог поверх него был бы вторым сообщением об
      // одном и том же.
      if (AppState.currentState !== 'active') return;

      haptics.stop();
      void notify('Заказ отменён', reason);
    });

    return unsubscribe;
  }, [notify]);

  return null;
}
