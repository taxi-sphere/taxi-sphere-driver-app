/**
 * @file: src/hooks/useLocationTracking.ts
 * @description:
 *   Hook для мониторинга состояния GPS-трекинга.
 *   Используется в UI для отображения статуса GPS.
 * @dependencies: connection.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useConnectionStore } from '@/stores/connection.store';

export function useLocationTracking() {
  const gpsPermission = useConnectionStore((s) => s.gpsPermission);
  const gpsActive = useConnectionStore((s) => s.gpsActive);

  return {
    gpsPermission,
    gpsActive,
    isTracking: gpsActive && gpsPermission === 'granted',
  };
}
