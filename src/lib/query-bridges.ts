/**
 * @file: src/lib/query-bridges.ts
 * @description:
 *   Связывает React Query с системными событиями React Native.
 *
 *   ЗАЧЕМ ЭТОТ ФАЙЛ ВООБЩЕ ПОЯВИЛСЯ. В `query-client.ts` стоят
 *   `refetchOnReconnect: true` и `refetchOnWindowFocus: true`, и выглядят
 *   они как работающие настройки. В браузере они такими и были бы: там
 *   React Query сам слушает `online`/`offline` и `visibilitychange`. В
 *   React Native таких событий НЕТ — библиотека узнаёт о сети и о выходе
 *   приложения на передний план только через `onlineManager` и
 *   `focusManager`, а их надо связать с системой руками. Не связали —
 *   обе настройки не делают ничего, молча.
 *
 *   ЧЕМ ЭТО ОБОРАЧИВАЛОСЬ. Пропала связь на минуту — экраны остались с
 *   ошибкой до тех пор, пока водитель сам не нажмёт «Повторить». За рулём
 *   он этого не сделает: он решит, что приложение не работает. Плюс запросы
 *   уходили в пустоту, пока сети нет, и журнал в админке забивался
 *   `Network request failed` вместо одной записи «связи нет» — ровно то,
 *   что мы разбирали 07.09.2026 по логам водителя.
 *
 *   ЧТО ДАЁТ. Вернулась сеть — все экраны обновляются сами. Сети нет —
 *   запросы ждут, а не молотят впустую. Приложение вернулось из фона —
 *   данные обновляются, а не показывают позавчерашний заказ.
 *
 * @dependencies: @tanstack/react-query, @react-native-community/netinfo,
 *                react-native (AppState)
 * @created: 2026-09-07 (1.5.38)
 */

import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

/**
 * Считать ли текущее состояние сети «онлайн».
 *
 * `isInternetReachable` строже, чем `isConnected`: Wi-Fi без интернета —
 * подключение есть, толку нет. Но проба доходчивости выполняется не сразу
 * и до её первого результата равна `null`, поэтому НЕИЗВЕСТНОСТЬ трактуем
 * как «онлайн»: иначе на старте приложения все запросы встанут в очередь
 * и водитель увидит пустые экраны на ровном месте.
 */
function isOnline(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

let installed = false;

/**
 * Подключить мосты. Идемпотентно: повторный вызов ничего не делает.
 *
 * Отписки нет намеренно — мосты живут столько же, сколько процесс
 * приложения, и снимать их некому и незачем.
 */
export function installQueryBridges(): void {
  if (installed) return;
  installed = true;

  onlineManager.setEventListener((setOnline) => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(isOnline(state));
    });
    return unsubscribe;
  });

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      handleFocus(status === 'active');
    });
    return () => subscription.remove();
  });
}
