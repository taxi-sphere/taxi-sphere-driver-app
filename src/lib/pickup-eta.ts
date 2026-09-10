/**
 * @file: src/lib/pickup-eta.ts
 * @description:
 *   Обратный отсчёт до времени подачи, которое водитель назвал сам.
 *
 *   ЗАЧЕМ. Принимая заказ, водитель выбирает «через сколько буду», и это
 *   время НАЗЫВАЮТ КЛИЕНТУ — служба звонит и говорит «машина через семь
 *   минут». Само приложение до 1.5.53 обещание не показывало: оно жило в
 *   модалке принятия и исчезало вместе с ней. Водитель ехал, не зная,
 *   опаздывает ли, а клиент — знал.
 *
 *   ПОЧЕМУ ОСТАТОК, А НЕ «ПРОШЛО N МИНУТ». Водителю нужно решение — гнать
 *   или нет, — а решение принимается по остатку. «Прошло 4 минуты» требует
 *   помнить обещание и вычитать в уме за рулём.
 *
 *   ПОРОГИ. Пять минут — это последний перекрёсток: успеть ещё можно, но
 *   пора перестать выбирать дорогу. Дальше идёт опоздание, и оно
 *   показывается честно, а не прячется: клиент всё равно уже ждёт, и
 *   молчащий экран только мешает водителю решить, звонить ли ему.
 *
 * @dependencies: нет (чистые функции)
 * @created: 2026-09-10 (1.5.53)
 */

/** Сколько минут до срока считаются «уже пора». */
export const SOON_THRESHOLD_SEC = 5 * 60;

export interface PickupEtaState {
  /** Секунд до обещанного времени. Отрицательное — опоздание. */
  remainingSec: number;
  /**
   * `ok` — время есть; `soon` — осталось меньше пяти минут;
   * `late` — срок прошёл.
   */
  level: 'ok' | 'soon' | 'late';
  /** Готовая подпись: «Подача 7 мин» или «Опоздание 3 мин». */
  label: string;
}

/** Минуты вверх: 61 секунда до срока — это ещё «2 мин», а не «1». */
function ceilMinutes(seconds: number): number {
  return Math.ceil(seconds / 60);
}

/**
 * Состояние отсчёта до подачи.
 *
 * `null` — показывать нечего: водитель не называл время (заказ взят без
 * выбора) либо сервер этих полей не отдаёт (сборка старше v1.100.9).
 * Именно `null`, а не нулевой отсчёт: «00:00» на экране означало бы, что
 * водитель опаздывает, хотя он ничего не обещал.
 *
 * @param confirmedAt когда обещание зафиксировано, ISO
 * @param etaMin      сколько минут обещано
 * @param now         текущий момент
 */
export function pickupEtaState(
  confirmedAt: string | null | undefined,
  etaMin: number | null | undefined,
  now: Date = new Date(),
): PickupEtaState | null {
  if (!confirmedAt || etaMin == null || etaMin <= 0) return null;

  const confirmed = new Date(confirmedAt).getTime();
  if (Number.isNaN(confirmed)) return null;

  const dueAt = confirmed + etaMin * 60_000;
  const remainingSec = Math.round((dueAt - now.getTime()) / 1000);

  if (remainingSec < 0) {
    const lateMin = Math.max(1, ceilMinutes(-remainingSec));
    return { remainingSec, level: 'late', label: `Опоздание ${lateMin} мин` };
  }

  const level = remainingSec <= SOON_THRESHOLD_SEC ? 'soon' : 'ok';
  /**
   * Меньше минуты — «Подача сейчас», а не «Подача 1 мин».
   *
   * Округление вверх дало бы «1 мин» и за пятьдесят секунд до срока, и за
   * пять: водитель ждал бы минуту, которой уже нет.
   */
  const label = remainingSec < 60 ? 'Подача сейчас' : `Подача ${ceilMinutes(remainingSec)} мин`;

  return { remainingSec, level, label };
}
