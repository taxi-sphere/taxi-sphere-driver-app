/**
 * @file: src/components/ScheduledConfirmationWatcher.tsx
 * @description:
 *   Подтверждение предзаказа: спрашиваем водителя, когда сервер попросил.
 *
 *   ЗАЧЕМ. Сервер за N минут до подачи спрашивает водителя, поедет ли он на
 *   предзаказ, и ждёт ответа несколько минут. Не дождался — возвращает заказ
 *   в общий пул и ищет другого. До 1.5.23 приложение не слушало это событие
 *   и не вызывало `confirm-scheduled` НИ РАЗУ: подтвердить было физически
 *   нечем, и всякий предзаказ у водителя, которого спросили, уходил другому.
 *   Держалось это только на том, что подтверждение выключено в стратегии по
 *   умолчанию — то есть было миной, а не работающей функцией.
 *
 *   ПОЧЕМУ ОТДЕЛЬНЫЙ КОМПОНЕНТ, А НЕ ЭКРАН. Спросить нужно там, где водитель
 *   находится сейчас: он может быть в списке заказов, в поездке или в
 *   «Деньгах». Компонент висит в корне и рисует только диалог.
 *
 *   СОКЕТ — НЕ ЕДИНСТВЕННЫЙ ПУТЬ. Событие не дойдёт, если приложение было
 *   закрыто, телефон спал или пропала сеть. Поэтому то же требование видно и
 *   в списке предзаказов (`confirmationRequestedAt` в ответе сервера) — этот
 *   компонент закрывает быстрый случай, список закрывает пропущенный.
 *
 * @dependencies: socket.service, orders.api, @/components/ui (диалог),
 *                react-query
 * @created: 2026-09-02 (v1.5.23)
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketService } from '@/services/socket.service';
import { confirmScheduledOrder } from '@/api/orders.api';
import { activeOrdersQueryKey } from '@/hooks/useCurrentOrder';
import { useDialog, useNotify } from '@/components/ui';
import { haptics } from '@/lib/haptics';

/** Во сколько минут укладывается ответ — из события сервера. */
function formatGrace(minutes: number): string {
  if (minutes <= 1) return 'минуту';
  if (minutes < 5) return `${minutes} минуты`;
  return `${minutes} минут`;
}

export function ScheduledConfirmationWatcher() {
  const ask = useDialog();
  const notify = useNotify();
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribeRequired = socketService.onConfirmationRequired(async (event) => {
      // Вибрация до диалога: телефон часто лежит в держателе экраном к
      // водителю, но смотрит он на дорогу.
      haptics.tap();

      const choice = await ask({
        title: `Предзаказ № ${event.orderNumber}`,
        message:
          `${event.pickupAddress}\n\n` +
          `Подтвердите, что поедете. Ответ нужен в течение ${formatGrace(event.graceMin)} — ` +
          'иначе заказ передадут другому водителю.',
        actions: [{ label: 'Подтверждаю', icon: 'checkmark-circle-outline' }],
        cancelLabel: 'Позже',
      });

      if (choice !== 0) return;

      const result = await confirmScheduledOrder(event.orderId);

      if (result.ok) {
        await queryClient.invalidateQueries({ queryKey: ['orders', 'scheduled'] });
        return;
      }

      if (result.reason === 'expired') {
        await notify(
          'Заказ уже передан',
          `Предзаказ № ${event.orderNumber} ушёл другому водителю — время на подтверждение вышло.`,
        );
      } else {
        await notify('Не удалось подтвердить', result.message);
      }

      await queryClient.invalidateQueries({ queryKey: ['orders', 'scheduled'] });
    });

    const unsubscribeReassigned = socketService.onOrderReassigned(async (event) => {
      haptics.tap();

      // Списки обновляем ДО сообщения: пока водитель читает, экран под ним
      // уже приведён в порядок, и заказа там не будет.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders', 'scheduled'] }),
        queryClient.invalidateQueries({ queryKey: activeOrdersQueryKey }),
      ]);

      await notify(
        `Заказ № ${event.orderNumber} передан другому`,
        event.reason || 'Подтверждение не пришло вовремя.',
      );
    });

    return () => {
      unsubscribeRequired();
      unsubscribeReassigned();
    };
  }, [ask, notify, queryClient]);

  return null;
}
