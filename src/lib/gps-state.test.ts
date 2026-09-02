/**
 * @file: src/lib/gps-state.test.ts
 * @description:
 *   Тесты состояния GPS, которое приложение сообщает серверу (1.5.22).
 *
 *   ЗАЧЕМ. От этого значения зависит подпись, которую видит диспетчер, и его
 *   решение: звонить водителю или ждать. Спутать «запретил геолокацию» с
 *   «нет сигнала» — значит послать оператора звонить туда, где всё в порядке,
 *   или наоборот молча ждать того, кто никогда не появится.
 *
 * @dependencies: vitest, ./gps-state
 * @created: 2026-09-02 (1.5.22)
 */

import { describe, it, expect } from 'vitest';
import { resolveGpsState } from './gps-state';

describe('resolveGpsState', () => {
  it('точки идут — всё в порядке', () => {
    expect(resolveGpsState('granted', true)).toBe('granted');
  });

  it('разрешение есть, точек нет — нет сигнала', () => {
    // Паркинг, тоннель, плотная застройка. Пройдёт само, звонить незачем.
    expect(resolveGpsState('granted', false)).toBe('no_signal');
  });

  it('водитель запретил геолокацию — так и говорим', () => {
    // Это чинится только разговором, и оператор должен знать.
    expect(resolveGpsState('denied', false)).toBe('denied');
    expect(resolveGpsState('denied', true)).toBe('denied');
  });

  it('разрешение ещё не спрашивали — состояние неизвестно', () => {
    expect(resolveGpsState('undetermined', false)).toBe('unknown');
  });

  it('запрет важнее факта наличия точек', () => {
    // Точки могли остаться от прошлой подписки; разрешения уже нет.
    expect(resolveGpsState('denied', true)).toBe('denied');
  });
});
