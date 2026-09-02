/**
 * @file: src/lib/gps-state.ts
 * @description:
 *   Что приложение говорит серверу про своё GPS (1.5.22).
 *
 *   ЗАЧЕМ РАЗЛИЧАТЬ. Диспетчеру мало «без GPS»: запрет геолокации чинится
 *   звонком водителю, а отсутствие сигнала в тоннеле не чинится ничем и
 *   пройдёт само. Раньше оба случая выглядели на карте одинаково, и оператор
 *   не знал, звонить ему или ждать.
 *
 * @dependencies: нет (чистая функция)
 * @created: 2026-09-02 (1.5.22)
 */

/** Совпадает с enum GpsState на сервере. */
export type GpsState = 'unknown' | 'granted' | 'denied' | 'no_signal';

export type GpsPermission = 'undetermined' | 'granted' | 'denied';

/**
 * Свести разрешение и факт получения точек к одному состоянию.
 *
 * `gpsActive` — идут ли точки прямо сейчас. Разрешение есть, а точек нет —
 * это и есть «нет сигнала»: паркинг, тоннель, плотная застройка.
 */
export function resolveGpsState(permission: GpsPermission, gpsActive: boolean): GpsState {
  if (permission === 'denied') return 'denied';
  if (permission === 'undetermined') return 'unknown';
  return gpsActive ? 'granted' : 'no_signal';
}
