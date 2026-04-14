/**
 * @file: src/stores/connection.store.ts
 * @description:
 *   Zustand store для состояния подключений: сеть, socket, GPS.
 * @dependencies: zustand
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { create } from 'zustand';

type SocketStatus = 'disconnected' | 'connecting' | 'connected';

interface ConnectionState {
  isNetworkOnline: boolean;
  isServerReachable: boolean;
  socketStatus: SocketStatus;
  gpsPermission: 'undetermined' | 'granted' | 'denied';
  gpsActive: boolean;

  setNetworkOnline: (online: boolean) => void;
  setServerReachable: (reachable: boolean) => void;
  setSocketStatus: (status: SocketStatus) => void;
  setGpsPermission: (perm: 'undetermined' | 'granted' | 'denied') => void;
  setGpsActive: (active: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isNetworkOnline: true,
  isServerReachable: true,
  socketStatus: 'disconnected',
  gpsPermission: 'undetermined',
  gpsActive: false,

  setNetworkOnline: (isNetworkOnline) => set({ isNetworkOnline }),
  setServerReachable: (isServerReachable) => set({ isServerReachable }),
  setSocketStatus: (socketStatus) => set({ socketStatus }),
  setGpsPermission: (gpsPermission) => set({ gpsPermission }),
  setGpsActive: (gpsActive) => set({ gpsActive }),
}));
