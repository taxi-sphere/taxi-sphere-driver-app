/**
 * @file: src/api/auth.api.ts
 * @description:
 *   API-вызовы аутентификации: вход по телефону+паролю, refresh, logout.
 * @dependencies: ky, schemas/auth.schema
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-16 14:00:00
 */

import ky, { HTTPError, TimeoutError } from 'ky';
import { getApiBase, API_TIMEOUT_MS } from '@/lib/constants';
import { api } from './client';
import { authResponseSchema } from '@/schemas/auth.schema';
import type { AuthResponse } from '@/types/auth';

/**
 * Вход по телефону и паролю.
 * Не требует авторизации. При любой ошибке бросает Error с ЧИТАЕМЫМ
 * сообщением — чтобы на экране пользователь видел реальную причину
 * (network / timeout / 401 / 500), а не абстрактное «Неверный пароль».
 */
export async function login(
  phone: string,
  password: string,
  deviceInfo?: string,
): Promise<AuthResponse> {
  let res: unknown;

  try {
    res = await ky
      .post(`${getApiBase()}/auth/login`, {
        json: { phone, password, deviceInfo },
        timeout: API_TIMEOUT_MS,
      })
      .json();
  } catch (err) {
    // 1) Сервер ответил HTTP-ошибкой (4xx/5xx) — достаём текст из тела
    if (err instanceof HTTPError) {
      let serverMessage: string | undefined;
      try {
        const body = (await err.response.clone().json()) as { error?: string; message?: string };
        serverMessage = body?.error ?? body?.message;
      } catch {
        /* тело не JSON — пусто */
      }
      if (serverMessage) throw new Error(serverMessage);
      throw new Error(`Ошибка сервера: HTTP ${err.response.status}`);
    }

    // 2) Таймаут
    if (err instanceof TimeoutError) {
      throw new Error('Превышено время ожидания ответа сервера');
    }

    // 3) Сеть/DNS/неверный URL — TypeError from fetch.
    //    Полный URL в сообщение НЕ выводим (водителю он не нужен,
    //    а лишний шум/утечка деталей инфраструктуры).
    if (err instanceof TypeError) {
      throw new Error(
        'Не удалось связаться с сервером. Проверьте подключение к интернету.',
      );
    }

    // 4) Что-то иное
    throw new Error(
      err instanceof Error ? err.message : 'Непредвиденная ошибка входа',
    );
  }

  // Сервер ответил 200, но форма ответа отличается от ожидаемой
  const parsed = authResponseSchema.safeParse(res);
  if (!parsed.success) {
    throw new Error(
      'Сервер вернул некорректный ответ. Обратитесь в поддержку.',
    );
  }
  return parsed.data;
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
