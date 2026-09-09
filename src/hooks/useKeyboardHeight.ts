/**
 * @file: src/hooks/useKeyboardHeight.ts
 * @description:
 *   Высота экранной клавиатуры, когда она открыта, и ноль, когда закрыта.
 *
 *   ЗАЧЕМ, ЕСЛИ ЕСТЬ `KeyboardAvoidingView`. Он опирается на то, что
 *   система сама ужмёт окно (`adjustResize` в манифесте) либо посчитает
 *   отступ по своим замерам. При edge-to-edge — а это поведение Android по
 *   умолчанию в новых версиях — окно под клавиатуру НЕ ужимается, и на
 *   экране переписки поле ввода уезжало под клавиатуру: водитель печатал
 *   вслепую (проверено на эмуляторе 09.09.2026, оба режима `height` и
 *   `undefined`).
 *
 *   Замер самой клавиатуры от этого не зависит: событие приносит её
 *   высоту в тех же координатах, в которых рисуется экран.
 *
 * @dependencies: react-native
 * @created: 2026-09-09 (1.5.52)
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    /**
     * На iOS слушаем `Will`, на Android — `Did`.
     *
     * iOS сообщает о клавиатуре ДО анимации, и содержимое едет вместе с
     * ней. У Android события `Will` нет вовсе — там приходит только
     * `Did`, уже по факту.
     */
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
