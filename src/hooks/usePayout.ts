/**
 * @file: src/hooks/usePayout.ts
 * @description:
 *   Вывод средств: данные о способах и заявках + создание новой заявки.
 *
 *   ЗАЧЕМ ЗАВЕДЕН В v1.5.17. Эндпоинты `/api/v1/driver/payout` (GET и POST)
 *   существовали на сервере и были полностью реализованы, а в приложении
 *   кнопка «Вывести» вызывала пустой `TODO`. Водитель не мог забрать
 *   собственные деньги — для приложения, которому он доверяет заработок,
 *   это дороже любого дефекта вёрстки.
 *
 * @dependencies: payout.api, react-query
 * @created: 2026-09-01 (v1.5.17)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPayoutRequest, getPayoutData } from '@/api/payout.api';

export const payoutQueryKey = ['driver', 'payout'] as const;

export function usePayoutData() {
  return useQuery({
    queryKey: payoutQueryKey,
    queryFn: getPayoutData,
    staleTime: 30_000,
  });
}

export function useCreatePayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPayoutRequest,
    onSuccess: () => {
      // Обновляем и заявки, и профиль: баланс уменьшился на выведенную сумму.
      void queryClient.invalidateQueries({ queryKey: payoutQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['driver', 'profile'] });
    },
  });
}
