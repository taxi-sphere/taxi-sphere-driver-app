/**
 * @file: src/components/AppUpdateNotifier.tsx
 * @description:
 *   Уведомления об обновлении приложения (v1.99.22+).
 *   Один компонент, три состояния:
 *     1. isForced → полноэкранная блокирующая модалка (нельзя закрыть)
 *     2. hasUpdate && !dismissed → компактный баннер сверху
 *     3. процесс скачивания APK → модалка с прогрессом
 *
 *   Работает только на Android (APK-installer нельзя вызвать на iOS —
 *   iOS-приложения обновляются только через App Store).
 * @dependencies:
 *   - @/hooks/useAppUpdate
 *   - @/services/apk-installer
 *   - expo-file-system, expo-intent-launcher (для installer)
 * @created: 2026-08-24
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { downloadAndInstallApk, type DownloadProgress } from '@/services/apk-installer';

// ─── Хелперы ─────────────────────────────────────────────────────────────────

function formatMb(bytes: number): string {
  if (!bytes) return '';
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

// ─── Компонент ──────────────────────────────────────────────────────────────

export function AppUpdateNotifier() {
  const insets = useSafeAreaInsets();
  const { currentVersion, latest, hasUpdate, isForced, dismissed, dismiss } = useAppUpdate();
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = useCallback(async () => {
    if (!latest) return;
    setDownloading(true);
    setError(null);
    setProgress({ bytesReceived: 0, bytesTotal: latest.apkSizeBytes, percent: 0 });

    const result = await downloadAndInstallApk(
      latest.apkUrl,
      latest.latestVersion,
      (p) => setProgress(p),
    );

    setDownloading(false);
    setProgress(null);

    if (!result.ok) {
      setError(result.error ?? 'Не удалось запустить установщик');
    }
    // При успехе управление перехватила система (installer),
    // после установки Android перезапустит приложение сам.
  }, [latest]);

  // На iOS ничего не показываем — там обновления только через App Store
  if (Platform.OS !== 'android') return null;
  if (!hasUpdate || !latest) return null;

  // ── Процесс скачивания (перекрывает всё) ──────────────────────────────
  if (downloading || error) {
    return (
      <Modal transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons
              name={error ? 'alert-circle' : 'cloud-download-outline'}
              size={48}
              color={error ? '#dc2626' : '#4f46e5'}
              style={{ alignSelf: 'center', marginBottom: 12 }}
            />
            {error ? (
              <>
                <Text style={styles.modalTitle}>Ошибка обновления</Text>
                <Text style={styles.modalText}>{error}</Text>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary, { marginTop: 12 }]}
                  onPress={() => setError(null)}
                >
                  <Text style={styles.btnPrimaryText}>Закрыть</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Скачивание обновления</Text>
                <Text style={styles.modalText}>
                  Версия {latest.latestVersion} · {formatMb(latest.apkSizeBytes)}
                </Text>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${progress?.percent ?? 0}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {progress?.percent ?? 0}%
                  {progress && progress.bytesTotal > 0 && (
                    <>
                      {' · '}
                      {formatMb(progress.bytesReceived)} из{' '}
                      {formatMb(progress.bytesTotal)}
                    </>
                  )}
                </Text>
                <ActivityIndicator
                  size="small"
                  color="#4f46e5"
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // ── Force-update: блокирующая модалка ──────────────────────────────────
  if (isForced) {
    return (
      <Modal transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons
              name="warning"
              size={48}
              color="#dc2626"
              style={{ alignSelf: 'center', marginBottom: 12 }}
            />
            <Text style={styles.modalTitle}>Требуется обновление</Text>
            <Text style={styles.modalText}>
              Текущая версия {currentVersion} больше не поддерживается.
              Обновитесь до {latest.latestVersion} чтобы продолжить работу.
            </Text>
            {latest.changelog ? (
              <Text style={styles.changelog} numberOfLines={6}>
                {latest.changelog}
              </Text>
            ) : null}
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, { marginTop: 16 }]}
              onPress={() => void handleUpdate()}
            >
              <Ionicons name="download" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>
                Обновить ({formatMb(latest.apkSizeBytes)})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost, { marginTop: 8 }]}
              onPress={() => void Linking.openURL(latest.apkUrl)}
            >
              <Text style={styles.btnGhostText}>Открыть в браузере</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Non-forced: компактный баннер сверху ──────────────────────────────
  if (dismissed) return null;

  return (
    // v1.5.10: paddingTop с учётом системной строки. Баннер рендерится
    // поверх всего экрана, и без отступа он налезал на часы, значки сети и
    // батареи — текст «Обновление доступно» читался поверх статус-бара.
    <View style={[styles.banner, { paddingTop: insets.top + 8 }]}>
      <Ionicons name="cloud-download-outline" size={18} color="#4f46e5" />
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerTitle}>
          Обновление {latest.latestVersion} доступно
        </Text>
        <Text style={styles.bannerSubtitle}>
          Текущая: {currentVersion} · {formatMb(latest.apkSizeBytes)}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.btn, styles.btnPrimary, styles.btnCompact]}
        onPress={() => void handleUpdate()}
      >
        <Text style={styles.btnPrimaryText}>Обновить</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={dismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={20} color="#6b7280" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#eef2ff',
    borderBottomWidth: 1,
    borderBottomColor: '#c7d2fe',
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e1b4b',
  },
  bannerSubtitle: {
    fontSize: 11,
    color: '#4338ca',
    marginTop: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 13,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 18,
  },
  changelog: {
    marginTop: 12,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  progressBar: {
    marginTop: 12,
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4f46e5',
  },
  progressText: {
    marginTop: 6,
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnPrimary: {
    backgroundColor: '#4f46e5',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnGhostText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '500',
  },
});
