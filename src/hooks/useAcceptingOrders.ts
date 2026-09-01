/**
 * @file: src/hooks/useAcceptingOrders.ts
 * @description:
 *   Переключатель «беру / не беру новые заказы» (сервер v1.99.69).
 *
 *   ЗАЧЕМ ОТДЕЛЬНО ОТ `useDriverStatus`. Статус описывает СМЕНУ (свободен /
 *   занят / не на линии) и во время заказа не меняется — сервер его на
 *   заказе не примет. А сказать «больше пока не предлагайте» водителю нужно
 *   как раз в поездке: это про готовность взять встречный, а не про смену.
 *   Поля разные, эндпоинт один.
 *
 *   Состояние берётся из профиля (react-query), а не из локального стора:
 *   после перезапуска приложения переключатель обязан показывать то, что
 *   реально стоит на сервере.
 *
 * @dependencies: driver.api, useDriverProfile, react-query
 * @created: 2026-09-02 (1.5.19)
 */

import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setAcceptingOrders } from '@/api/driver.api';
import { useDriverProfile } from '@/hooks/useDriverProfile';
import type { DriverProfile } from '@/types/driver';

const PROFILE_KEY = ['driver', 'profile'];

export function useAcceptingOrders() {
  const { data: profile } = useDriverProfile();
  const queryClient = useQueryClient();

  const accepting = profile?.acceptingOrders ?? true;

  const mutation = useMutation({
    mutationFn: (next: boolean) => setAcceptingOrders(next),

    // Оптимистично: переключатель должен отзываться сразу, связь у водителя
    // бывает медленной. При ошибке откатываем.
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: PROFILE_KEY });
      const previous = queryClient.getQueryData<DriverProfile>(PROFILE_KEY);
      if (previous) {
        queryClient.setQueryData<DriverProfile>(PROFILE_KEY, {
          ...previous,
          acceptingOrders: next,
        });
      }
      return { previous };
    },

    onError: (error: unknown, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PROFILE_KEY, context.previous);
      }
      Alert.alert(
        'Не удалось изменить',
        error instanceof Error ? error.message : 'Ошибка соединения с сервером',
      );
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
      // Список свободных заказов зависит от флага: сервер отдаёт по нему
      // либо всё, либо только горящие.
      void queryClient.invalidateQueries({ queryKey: ['orders', 'available'] });
    },

    retry: 2,
    retryDelay: 1000,
  });

  return {
    /** Берёт ли водитель новые заказы прямо сейчас. */
    accepting,
    isPending: mutation.isPending,
    toggle: () => {
      if (mutation.isPending) return;
      mutation.mutate(!accepting);
    },
  };
}
