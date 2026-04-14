/**
 * @file: src/api/auth.api.ts
 * @description:
 *   API-вызовы аутентификации: вход по телефону+паролю, refresh, logout.
 * @dependencies: ky, schemas/auth.schema
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-16 14:00:00
 */

import ky, { HTTPError } from 'ky';
import { getApiBase, API_TIMEOUT_MS } from '@/lib/constants';
import { api } from './client';
import { authResponseSchema } from '@/schemas/auth.schema';
import type { AuthResponse } from '@/types/auth';

/**
 * Вход по телефону и паролю.
 * Не требует авторизации.
 */
export async function login(
  phone: string,
  password: string,
  deviceInfo?: string,
): Promise<AuthResponse> {
  try {
    const res = await ky
      .post(`${getApiBase()}/auth/login`, {
        json: { phone, password, deviceInfo },
        timeout: API_TIMEOUT_MS,
      })
      .json();
    return authResponseSchema.parse(res);
  } catch (err) {
    if (err instanceof HTTPError) {
      try {
        const body = await err.response.json() as { error?: string };
        if (body?.error) throw new Error(body.error);
      } catch (e) {
        if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
      }
    }
    throw new Error('Неверный телефон или пароль');
  }
}

/**
 * Выйти из системы (отозвать токены).
 * Требует авторизации.
 */
export async function logout(refreshToken?: string): Promise<void> {
  try {
    await api.post('auth/logout', {
      json: refreshToken ? { refreshToken } : undefined,
    });
  } catch {
    // Игнорируем ошибки при logout — токены всё равно удаляем локально
  }
}
