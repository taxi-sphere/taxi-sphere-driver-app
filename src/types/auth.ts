/**
 * @file: src/types/auth.ts
 * @description:
 *   Типы авторизации: ответы API, пользователь, токены.
 *   Контракт совпадает с /api/v1/auth/* на backend.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

/** Роль пользователя */
export type UserRole = 'client' | 'driver' | 'admin';

/** Минимальный профиль из JWT */
export interface AuthUser {
  id: string;
  role: UserRole;
  phone: string;
}

/** Пара токенов */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Ответ POST /auth/login */
export interface AuthResponse {
  success: true;
  data: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  };
}

/** Ответ POST /auth/refresh */
export interface RefreshResponse {
  success: true;
  data: {
    accessToken: string;
    refreshToken: string;
  };
}

/** Запрос POST /auth/login */
export interface LoginRequest {
  phone: string;
  password: string;
  deviceInfo?: string;
}
