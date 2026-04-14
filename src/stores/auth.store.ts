/**
 * @file: src/stores/auth.store.ts
 * @description:
 *   Zustand store для аутентификации: токены, пользователь, состояние.
 *   Токены хранятся в SecureStore (не AsyncStorage).
 * @dependencies: zustand, token.service
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { create } from 'zustand';
import type { AuthUser } from '@/types/auth';
import * as tokenService from '@/services/token.service';

interface AuthState {
  /** Текущий пользователь */
  user: AuthUser | null;
  /** Access-токен (в памяти, для быстрого доступа без async) */
  accessToken: string | null;
  /** Флаг: начальная загрузка токенов завершена */
  isReady: boolean;
  /** Флаг: идёт загрузка (отправка кода, верификация) */
  isLoading: boolean;

  /** Вычисляемое свойство */
  isAuthenticated: () => boolean;

  /** Инициализация: загрузить токены из SecureStore */
  hydrate: () => Promise<void>;

  /** Сохранить токены после логина */
  setTokens: (accessToken: string, refreshToken: string, user: AuthUser) => Promise<void>;

  /** Обновить access-токен (после refresh) */
  updateAccessToken: (accessToken: string, refreshToken: string) => Promise<void>;

  /** Очистить всё (logout) */
  logout: () => Promise<void>;

  /** Установить loading */
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isReady: false,
  isLoading: false,

  isAuthenticated: () => get().accessToken !== null && get().user !== null,

  hydrate: async () => {
    try {
      console.log('[AuthStore] hydrate: start');

      // Таймаут 3с — SecureStore может зависать в Expo Go
      const timeout = new Promise<[null, null]>((resolve) =>
        setTimeout(() => {
          console.warn('[AuthStore] hydrate: timeout');
          resolve([null, null]);
        }, 3000),
      );

      const [accessToken, user] = await Promise.race([
        Promise.all([
          tokenService.getAccessToken(),
          tokenService.getStoredUser<AuthUser>(),
        ]),
        timeout,
      ]);

      console.log('[AuthStore] hydrate: done', { hasToken: !!accessToken, hasUser: !!user });
      set({ accessToken, user, isReady: true });
    } catch (e) {
      console.warn('[AuthStore] hydrate error:', e);
      set({ isReady: true });
    }
  },

  setTokens: async (accessToken, refreshToken, user) => {
    await Promise.all([
      tokenService.setAccessToken(accessToken),
      tokenService.setRefreshToken(refreshToken),
      tokenService.setStoredUser(user),
    ]);
    set({ accessToken, user });
  },

  updateAccessToken: async (accessToken, refreshToken) => {
    await Promise.all([
      tokenService.setAccessToken(accessToken),
      tokenService.setRefreshToken(refreshToken),
    ]);
    set({ accessToken });
  },

  logout: async () => {
    await tokenService.clearAllTokens();
    set({ accessToken: null, user: null });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
