/**
 * @file: src/hooks/useAppUpdate.ts
 * @description:
 *   Хук проверки обновлений приложения (v1.99.22+).
 *   При старте и раз в CHECK_INTERVAL_MS запрашивает backend, если
 *   есть новая версия — возвращает данные для UI (баннер / модалка).
 *
 *   Читает текущую версию из Constants.expoConfig.version (app.json).
 *
 *   Канал: пока фиксированно 'production'. Beta-канал будет добавлен
 *   второй итерацией (opt-in через настройки).
 * @dependencies:
 *   - expo-constants
 *   - @/api/app.api, @/lib/semver
 * @created: 2026-08-24
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { fetchLatestAppRelease, type DriverAppLatestPublicDTO } from '@/api/app.api';
import { compareSemver } from '@/lib/semver';

/** Как часто проверять в фоне (мс). 4 часа — компромисс: свежесть vs трафик. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Текущая версия приложения из app.json. Constants.expoConfig
 * читается runtime и работает и в dev, и в production build.
 */
function getCurrentAppVersion(): string {
  return (
    (Constants.expoConfig?.version as string | undefined) ??
    (Constants.manifest?.version as string | undefined) ??
    '0.0.0'
  );
}

export interface AppUpdateState {
  /** Текущая установленная версия. */
  currentVersion: string;
  /** Данные последней доступной версии, если проверка прошла. */
  latest: DriverAppLatestPublicDTO | null;
  /** true если latestVersion > currentVersion. */
  hasUpdate: boolean;
  /** true если сервер сказал isForced (min-required или явный флаг). */
  isForced: boolean;
  /** Идёт ли сейчас проверка (для UI-спиннера). */
  checking: boolean;
  /** Пользователь скрыл баннер этой сессии (только для non-forced). */
  dismissed: boolean;
  /** Форсировать перезапрос сейчас (кнопка «Проверить»). */
  refresh: () => Promise<void>;
  /** Скрыть баннер до следующего запуска приложения (только non-forced). */
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdateState {
  const currentVersion = getCurrentAppVersion();
  const [latest, setLatest] = useState<DriverAppLatestPublicDTO | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheckAtRef = useRef<number>(0);

  const check = useCallback(async () => {
    if (Platform.OS !== 'android') return; // на iOS APK-installer недоступен
    setChecking(true);
    try {
      const data = await fetchLatestAppRelease(currentVersion, 'production');
      setLatest(data);
      lastCheckAtRef.current = Date.now();
    } finally {
      setChecking(false);
    }
  }, [currentVersion]);

  // Первая проверка при монтировании
  useEffect(() => {
    void check();
  }, [check]);

  // Периодическая проверка + повторная проверка при возврате в foreground
  useEffect(() => {
    const interval = setInterval(() => {
      void check();
    }, CHECK_INTERVAL_MS);

    const onAppState = (state: AppStateStatus) => {
      if (state !== 'active') return;
      // Не давим сервер: проверяем не чаще чем раз в CHECK_INTERVAL/4
      const throttle = CHECK_INTERVAL_MS / 4;
      if (Date.now() - lastCheckAtRef.current > throttle) {
        void check();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [check]);

  const hasUpdate = Boolean(
    latest && compareSemver(latest.latestVersion, currentVersion) > 0,
  );
  const isForced = Boolean(latest?.isForced) && hasUpdate;

  return {
    currentVersion,
    latest,
    hasUpdate,
    isForced,
    checking,
    dismissed,
    refresh: check,
    dismiss: () => setDismissed(true),
  };
}
