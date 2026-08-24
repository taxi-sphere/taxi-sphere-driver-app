/**
 * @file: src/services/apk-installer.ts
 * @description:
 *   Скачивание APK во внутреннее хранилище приложения и запуск
 *   системного installer через Android intent (VIEW + FileProvider URI).
 *
 *   Использует legacy-API expo-file-system: он проще для случая
 *   «одноразовый download с progress + getContentUriAsync», чем
 *   новый File/Paths API. Разница только в API-поверхности —
 *   поведение одинаково.
 *
 *   Только Android: iOS не поддерживает установку не через App Store,
 *   попытка вызвать installer молча вернёт ошибку. Проверяем Platform.
 * @dependencies:
 *   - expo-file-system (нужен npx expo install)
 *   - expo-intent-launcher (нужен npx expo install)
 * @created: 2026-08-24
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

export interface DownloadProgress {
  bytesReceived: number;
  bytesTotal: number;
  percent: number;
}

export interface InstallResult {
  ok: boolean;
  error?: string;
}

/**
 * Скачивает APK по URL в кеш приложения. Прогресс через callback.
 * Возвращает локальный file:// URI (не используется напрямую для
 * инсталляции — см. installDownloadedApk).
 */
export async function downloadApk(
  apkUrl: string,
  version: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('APK-installer доступен только на Android');
  }

  const fileName = `driver-${version}.apk`;
  const targetUri = `${FileSystem.cacheDirectory}${fileName}`;

  // Удаляем предыдущую загрузку той же версии, если была
  const info = await FileSystem.getInfoAsync(targetUri);
  if (info.exists) {
    await FileSystem.deleteAsync(targetUri, { idempotent: true });
  }

  const dl = FileSystem.createDownloadResumable(
    apkUrl,
    targetUri,
    {},
    (event) => {
      if (!onProgress) return;
      const total = event.totalBytesExpectedToWrite || 0;
      const received = event.totalBytesWritten || 0;
      onProgress({
        bytesReceived: received,
        bytesTotal: total,
        percent: total > 0 ? Math.round((received / total) * 100) : 0,
      });
    },
  );

  const result = await dl.downloadAsync();
  if (!result?.uri) {
    throw new Error('Не удалось скачать APK');
  }
  return result.uri;
}

/**
 * Запускает системный установщик Android для скачанного APK.
 * Использует FileProvider content:// URI — file:// deprecated с Android 7+
 * и вызывает FileUriExposedException.
 *
 * После этого шага контроль отдаётся системе — пользователь видит
 * диалог «Установить приложение», принимает / отказывается.
 * Приложение может быть завершено системой во время установки.
 */
export async function installDownloadedApk(fileUri: string): Promise<InstallResult> {
  if (Platform.OS !== 'android') {
    return { ok: false, error: 'Только Android' };
  }
  try {
    // FileProvider content:// URI — обязательно для Android 7+
    const contentUri = await FileSystem.getContentUriAsync(fileUri);

    await IntentLauncher.startActivityAsync(
      'android.intent.action.VIEW',
      {
        data: contentUri,
        type: 'application/vnd.android.package-archive',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      },
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Convenience: скачать + сразу запустить installer.
 * Возвращает ошибку — вызывающая сторона показывает toast.
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  version: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<InstallResult> {
  try {
    const localUri = await downloadApk(apkUrl, version, onProgress);
    return await installDownloadedApk(localUri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
