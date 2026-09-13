/**
 * @file: src/hooks/useRoutePanel.ts
 * @description:
 *   Состояние ряда выбора пути: раскрыт ли он, что водитель нажал и когда
 *   ряд прячется сам (1.5.64).
 *
 *   ЗАЧЕМ НЕ ВНУТРИ `RouteChoiceBar`. До 1.5.64 состояние жило в самой
 *   панели, а панель рисуется, только пока есть из чего выбирать. Стоило
 *   списку вариантов на миг опустеть — панель пересоздавалась, и ряд
 *   возвращался свёрнутым посреди выбора (жалоба владельца 14.09.2026:
 *   «быстрее» → «другой путь» → «быстрее», и кнопки скрылись). На уровне
 *   карты состояние переживает пересоздание панели.
 *
 *   Правила — что значит нажатие и когда прятать — в `@/lib/route-panel`,
 *   там же тесты. Здесь только хранение и таймер.
 *
 * @dependencies: react, @/lib/route-panel, @/lib/route-choice (тип точки)
 * @created: 2026-09-14 (1.5.64)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isRoutePanelAutohideArmed,
  routePanelAction,
  routePanelKey,
  ROUTE_PANEL_AUTOHIDE_MS,
  type RoutePanelAction,
  type RoutePanelTarget,
} from '@/lib/route-panel';
import type { RoutePoint } from '@/lib/route-choice';

export interface RoutePanelControls {
  /** Ряд раскрыт. */
  open: boolean;
  /** Ключ кнопки, которую водитель нажал последней с момента раскрытия. */
  lastTapped: string | null;
  openPanel: () => void;
  close: () => void;
  /**
   * Учесть нажатие и сказать, что из него следует. Свернуть ряд — дело
   * хука; выбрать путь или убрать линию — дело вызывающего.
   */
  tap: (target: RoutePanelTarget) => RoutePanelAction;
}

/**
 * @param position где машина сейчас — от неё считается «поехал»
 */
export function useRoutePanel(position: RoutePoint | null): RoutePanelControls {
  const [open, setOpen] = useState(false);

  /**
   * Что водитель нажал сам с момента раскрытия ряда.
   *
   * Сбрасывается при каждом открытии: «повторное нажатие» считается внутри
   * одного раскрытия, иначе кнопка, нажатая десять минут назад, свернула бы
   * ряд сразу после следующего открытия.
   */
  const [lastTapped, setLastTapped] = useState<string | null>(null);

  /**
   * Где машина была при последнем нажатии или при раскрытии ряда.
   *
   * Позиция в момент нажатия читается из ссылки, а не из замыкания: колбэки
   * не должны пересоздаваться на каждом фиксе GPS.
   */
  const [since, setSince] = useState<RoutePoint | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  const openPanel = useCallback(() => {
    setLastTapped(null);
    setSince(positionRef.current);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const tap = useCallback(
    (target: RoutePanelTarget): RoutePanelAction => {
      const action = routePanelAction(target, lastTapped);
      if (action === 'collapse') {
        setOpen(false);
        return action;
      }
      // Запоминаем ДО действия: выбор пути перестраивает маршрут, и к тому
      // моменту, как ответ придёт, нажатие должно быть уже учтено.
      setLastTapped(routePanelKey(target));
      setSince(positionRef.current);
      return action;
    },
    [lastTapped],
  );

  /**
   * При раскрытии позиции ещё не было (GPS не успел) — берём первую
   * известную, иначе отсчёт не начался бы никогда.
   */
  useEffect(() => {
    if (open && since == null && position != null) setSince(position);
  }, [open, since, position]);

  const armed = open && isRoutePanelAutohideArmed(since, position);

  /**
   * Спрятать ряд, когда машина поехала, а водитель ряд больше не трогает.
   *
   * Зависимость от `since` — это сброс отсчёта: нажатие ставит новое место,
   * машина снова «стоит», и таймер снят до следующих `ROUTE_PANEL_MOVE_M`.
   * От самой позиции эффект не зависит: иначе каждый фикс в пути заводил бы
   * таймер заново, и ряд не спрятался бы никогда.
   */
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setOpen(false), ROUTE_PANEL_AUTOHIDE_MS);
    return () => clearTimeout(timer);
  }, [armed, since]);

  return { open, lastTapped, openPanel, close, tap };
}
