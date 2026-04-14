/**
 * @file: src/stores/driver.store.ts
 * @description:
 *   Zustand store для статуса водителя.
 *   Синхронизируется с сервером через POST /driver/status.
 * @dependencies: zustand
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { create } from 'zustand';
import type { DriverStatus } from '@/types/driver';

interface DriverState {
  status: DriverStatus;
  setStatus: (status: DriverStatus) => void;
}

export const useDriverStore = create<DriverState>((set) => ({
  status: 'offline',
  setStatus: (status) => set({ status }),
}));
