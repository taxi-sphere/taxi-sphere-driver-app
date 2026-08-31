/**
 * @file: src/hooks/useDriverProfile.ts
 * @description:
 *   Профиль водителя с сервера + восстановление его СТАТУСА в локальный
 *   стор при старте приложения.
 *
 *   ЗАЧЕМ. `useDriverStore.status` начинается с `'offline'`, а на сервере
 *   статус живёт постоянно. Восстанавливать его при запуске было некому:
 *   статус меняли только логин, кнопка в шапке и мёртвый `useCurrentOrder`.
 *   Поэтому после КАЖДОГО перезапуска приложения водитель локально был
 *   «offline», `LocationProvider` останавливал трекинг, и координаты не
 *   уходили вовсе — пока водитель не нажмёт кнопку статуса. На сервере он
 *   при этом оставался `online`, и диспетчер видел живого водителя, от
 *   которого не приходит ни одной точки.
 *
 *   Кнопка в шапке не показывает «offline» отдельным видом (она красит
 *   себя как «занят»), так что заметить это в интерфейсе было нечем.
 *
 *   Восстанавливаем ОДИН раз за сессию: дальше статусом владеет кнопка, у
 *   которой оптимистичное обновление. Иначе ответ профиля, прилетевший в
 *   момент переключения, откатывал бы выбор водителя.
 *
 * @dependencies: @tanstack/react-query, driver.api, driver.store
 * @created: 2026-08-31 (v1.5.15)
 */

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProfile } from '@/api/driver.api';
import { useDriverStore } from '@/stores/driver.store';

/** Профиль водителя. Один запрос на всё приложение (общий queryKey). */
export function useDriverProfile() {
  const setStatus = useDriverStore((s) => s.setStatus);
  const restoredRef = useRef(false);

  const query = useQuery({
    queryKey: ['driver', 'profile'],
    queryFn: getProfile,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const serverStatus = query.data?.status;

  useEffect(() => {
    if (restoredRef.current || !serverStatus) return;
    restoredRef.current = true;

    // 'on_order' выставляется по текущему заказу и локально важнее: не
    // сбрасываем водителя с заказа в 'online' из-за отставшего профиля.
    const local = useDriverStore.getState().status;
    if (local === 'on_order' || local === serverStatus) return;

    setStatus(serverStatus);
  }, [serverStatus, setStatus]);

  return query;
}
