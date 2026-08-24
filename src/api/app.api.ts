/**
 * @file: src/api/app.api.ts
 * @description:
 *   Публичный API для проверки обновлений приложения. Без auth —
 *   вызывается при старте до логина.
 *   Соответствует backend endpoint `/api/v1/driver/app/latest`.
 * @dependencies: @/lib/constants
 * @created: 2026-08-24
 */

import { getApiBase } from '@/lib/constants';

export interface DriverAppLatestPublicDTO {
  latestVersion: string;
  minRequiredVersion: string | null;
  apkUrl: string;
  apkSizeBytes: number;
  apkSha256: string | null;
  changelog: string | null;
  isForced: boolean;
  publishedAt: string;
  channel: 'production' | 'beta';
}

/**
 * Запросить последнюю опубликованную версию приложения.
 * Без auth — endpoint публичный.
 *
 * @param currentVersion — semver текущей установленной версии,
 *   бэкенд использует для сравнения с minRequiredVersion (force-update).
 * @param channel — по умолчанию 'production'; при opt-in в настройках
 *   можно передать 'beta'.
 *
 * @returns null если релиз не найден (ни одной публикации в канале)
 *   или произошла сетевая ошибка. Приложение продолжает работу
 *   как обычно — обновления просто пропущены до следующего запроса.
 */
export async function fetchLatestAppRelease(
  currentVersion: string,
  channel: 'production' | 'beta' = 'production',
): Promise<DriverAppLatestPublicDTO | null> {
  try {
    const base = getApiBase().replace(/\/$/, '');
    const url = `${base}/driver/app/latest?channel=${encodeURIComponent(
      channel,
    )}&currentVersion=${encodeURIComponent(currentVersion)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      success?: boolean;
      data?: DriverAppLatestPublicDTO | null;
    };
    if (!body?.success) return null;
    return body.data ?? null;
  } catch {
    return null;
  }
}
