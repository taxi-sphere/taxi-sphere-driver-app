/**
 * @file: src/hooks/useDriverStatus.ts
 * @description:
 *   Hook для переключения статуса водителя с синхронизацией с сервером.
 *   Оптимистичное обновление UI + откат при ошибке.
 *   Три состояния: offline / online / busy.
 * @dependencies: driver.api, driver.store, react-query
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-04-13 18:00:00
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDriverStore } from '@/stores/driver.store';
import { setStatus as apiSetStatus } from '@/api/driver.api';
import type { DriverStatus } from '@/types/driver';
import { useNotify } from '@/components/ui';

export function useDriverStatus() {
  const notify = useNotify();
  const { status, setStatus } = useDriverStore();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newStatus: Exclude<DriverStatus, 'on_order'>) => apiSetStatus(newStatus),
    // Оптимистичное обновление — UI меняется сразу
    onMutate: (newStatus) => {
      const previousStatus = useDriverStore.getState().status;
      setStatus(newStatus);
      return { previousStatus };
    },
    onSuccess: (data) => {
      // Подтверждаем статус из ответа сервера
      if (data?.status) {
        setStatus(data.status as DriverStatus);
      }
      void queryClient.invalidateQueries({ queryKey: ['driver', 'profile'] });
    },
    onError: (error: unknown, _variables, context) => {
      // Откатываем на предыдущий статус
      if (context?.previousStatus) {
        setStatus(context.previousStatus);
      }
      const msg = error instanceof Error ? error.message : 'Ошибка соединения с сервером';
      void notify('Не удалось сменить статус', msg);
    },
    retry: 2,
    retryDelay: 1000,
  });

  /** Переключение Свободен ↔ Занят. Любой иной статус → Свободен. */
  const toggleBusy = () => {
    if (mutation.isPending) return;
    const next = status === 'online' ? 'busy' : 'online';
    mutation.mutate(next);
  };

  /** Алиас для обратной совместимости (использовался для offline-переключения). */
  const toggleOnline = toggleBusy;

  return {
    status,
    toggleOnline,
    toggleBusy,
    setStatusTo: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
