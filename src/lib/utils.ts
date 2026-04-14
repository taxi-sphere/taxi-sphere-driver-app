/**
 * @file: src/lib/utils.ts
 * @description:
 *   Утилиты форматирования: валюта, расстояние, время, телефон.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

/**
 * Форматировать сумму в рублях: «150 ₽»
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `${Math.round(amount)} ₽`;
}

/**
 * Форматировать расстояние в км: «2.3 км» или «450 м»
 */
export function formatDistance(km: number | null | undefined): string {
  if (km == null) return '—';
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(1)} км`;
}

/**
 * Форматировать длительность в минутах: «5 мин» или «1 ч 20 мин»
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} ч ${rest} мин` : `${h} ч`;
}

/**
 * Форматировать время из ISO-строки: «14:35»
 */
export function formatTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Форматировать дату из ISO-строки: «12 мар 2026»
 */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Маскировать телефон: «+7 900 *** ** 44»
 */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  const visible = phone.slice(0, 5);
  const last2 = phone.slice(-2);
  return `${visible} *** ** ${last2}`;
}

/**
 * Форматировать секунды в «MM:SS»
 */
export function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
