/**
 * @file: src/api/client.ts
 * @description:
 *   Центральный HTTP-клиент на базе ky.
 *   Автоматический Bearer-токен, token refresh при 401, retry при 5xx.
 *   Mutex для предотвращения параллельных refresh-запросов.
 * @dependencies: ky, auth.store, token.service
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import ky, { HTTPError, type KyInstance, type Options } from 'ky';
import { getApiBase, API_TIMEOUT_MS, API_RETRY_COUNT } from '@/lib/constants';
import { useAuthStore } from '@/stores/auth.store';
import { driverLogger } from '@/services/logger.service';
import * as tokenService from '@/services/token.service';

/* -------------------------------------------------------------------------- */
/*  Refresh mutex                                                              */
/* -------------------------------------------------------------------------- */

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = await tokenService.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await ky
      .post(`${getApiBase()}/auth/refresh`, {
        json: { refreshToken },
        timeout: API_TIMEOUT_MS,
      })
      .json<{
        success: boolean;
        data: { accessToken: string; refreshToken: string };
      }>();

    if (res.success && res.data) {
      await useAuthStore
        .getState()
        .updateAccessToken(res.data.accessToken, res.data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function refreshTokens(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/* -------------------------------------------------------------------------- */
/*  API-клиент                                                                 */
/* -------------------------------------------------------------------------- */

export const api: KyInstance = ky.create({
  // prefixUrl НЕ задаём: он вычисляется один раз при импорте модуля,
  // когда Zustand persist ещё не восстановил serverUrl из AsyncStorage.
  // Базовый URL подставляется динамически в apiGet/apiPost/apiPatch.
  timeout: API_TIMEOUT_MS,
  retry: {
    limit: API_RETRY_COUNT,
    statusCodes: [500, 502, 503, 504],
    backoffLimit: 5000,
  },
  hooks: {
    beforeRequest: [
      (request) => {
        const { accessToken } = useAuthStore.getState();
        if (accessToken) {
          request.headers.set('Authorization', `Bearer ${accessToken}`);
        }
      },
    ],
    afterResponse: [
      async (request, _options, response) => {
        if (response.status !== 401) return response;

        // Попытка refresh
        const success = await refreshTokens();
        if (!success) {
          // Refresh не удался — logout
          await useAuthStore.getState().logout();
          return response;
        }

        // Повтор исходного запроса с новым токеном
        const { accessToken } = useAuthStore.getState();
        if (accessToken) {
          request.headers.set('Authorization', `Bearer ${accessToken}`);
        }
        return ky(request);
      },
    ],
    beforeError: [
      async (error: HTTPError) => {
        const { request, response } = error;

        // Пытаемся вытащить человеческий текст из тела ответа { error: '...' }
        let serverMessage: string | undefined;
        try {
          const data = (await response.clone().json()) as
            | { error?: string; message?: string }
            | null;
          serverMessage = data?.error ?? data?.message;
        } catch {
          // тело не JSON — оставляем стандартное сообщение
        }

        if (serverMessage) {
          error.message = serverMessage;
        }

        // Логируем все 4xx/5xx (кроме 401 — там идёт refresh-flow) в админский лог
        if (response.status !== 401) {
          try {
            const url = new URL(request.url);
            driverLogger.error(`HTTP ${response.status}: ${url.pathname}`, {
              action: `api:${request.method}:${url.pathname}`,
              extra: {
                method: request.method,
                path: url.pathname,
                status: response.status,
                serverMessage: serverMessage ?? null,
              },
            });
          } catch {
            // неверный URL — не должно случаться, но не мешаем основному потоку
          }
        }

        return error;
      },
    ],
  },
});

/* -------------------------------------------------------------------------- */
/*  Хелперы для типизированных запросов                                        */
/* -------------------------------------------------------------------------- */

/** Собирает абсолютный URL из актуального базового URL (читается каждый запрос). */
function buildUrl(path: string): string {
  const base = getApiBase().replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Логирование сетевых ошибок (timeout, offline, DNS failure).
 * HTTPError уже логируется в beforeError хуке выше.
 */
function logNetworkError(method: string, path: string, err: unknown): void {
  if (err instanceof HTTPError) return; // уже залогировано в beforeError
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : 'UnknownError';
  driverLogger.error(`Network error: ${method} ${path} — ${message}`, {
    action: `network:${method}:${path}`,
    extra: { method, path, errorName: name },
  });
}

/** GET-запрос с типизированным ответом */
export async function apiGet<T>(
  path: string,
  options?: Options,
): Promise<T> {
  try {
    return await api.get(buildUrl(path), options).json<T>();
  } catch (err) {
    logNetworkError('GET', path, err);
    throw err;
  }
}

/** POST-запрос с типизированным ответом */
export async function apiPost<T>(
  path: string,
  json?: unknown,
  options?: Options,
): Promise<T> {
  try {
    return await api.post(buildUrl(path), { json, ...options }).json<T>();
  } catch (err) {
    logNetworkError('POST', path, err);
    throw err;
  }
}

/** PATCH-запрос с типизированным ответом */
export async function apiPatch<T>(
  path: string,
  json?: unknown,
  options?: Options,
): Promise<T> {
  try {
    return await api.patch(buildUrl(path), { json, ...options }).json<T>();
  } catch (err) {
    logNetworkError('PATCH', path, err);
    throw err;
  }
}
