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
 *   v1.5.11: скачивание может быть запущено и из Настроек — они кладут релиз
 *   в update-request.store, а весь процесс и его UI остаются здесь, в одном
 *   владельце загрузки.
 * @dependencies:
 *   - @/hooks/useAppUpdate
 *   - @/stores/update-request.store
 *   - @/api/app.api (тип DriverAppLatestPublicDTO)
 *   - @/services/apk-installer
 *   - expo-file-system, expo-intent-launcher (для installer)
 *   - react-native-safe-area-context (отступ баннера под статус-бар)
 * @created: 2026-08-24
 * @updated: 2026-08-28 (v1.5.11)
 */

import { useCallback, useEffect, useState } from 'react';
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
import { useUpdateRequestStore } from '@/stores/update-request.store';
import type { DriverAppLatestPublicDTO } from '@/api/app.api';
import { downloadAndInstallApk, type DownloadProgress } from '@/services/apk-installer';
import {
  icon as iconTokens,
  radius,
  spacing,
  text,
  touch,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';

// ─── Хелперы ─────────────────────────────────────────────────────────────────

function formatMb(bytes: number): string {
  if (!bytes) return '';
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

// ─── Компонент ──────────────────────────────────────────────────────────────

export function AppUpdateNotifier() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { currentVersion, latest, hasUpdate, isForced, dismissed, dismiss } = useAppUpdate();
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Релиз, который скачивается прямо сейчас. Отдельно от `latest`, потому что
   * скачивание может быть запущено из Настроек — а у них своя копия
   * `useAppUpdate` (состояние в локальном useState, не общее). Модалка
   * прогресса должна показывать ту версию, которую реально качает.
   */
  const [activeRelease, setActiveRelease] = useState<DriverAppLatestPublicDTO | null>(null);

  const handleUpdate = useCallback(async (release: DriverAppLatestPublicDTO) => {
    setActiveRelease(release);
    setDownloading(true);
    setError(null);
    setProgress({ bytesReceived: 0, bytesTotal: release.apkSizeBytes, percent: 0 });

    const result = await downloadAndInstallApk(
      release.apkUrl,
      release.latestVersion,
      (p) => setProgress(p),
    );

    setDownloading(false);
    setProgress(null);

    if (!result.ok) {
      setError(result.error ?? 'Не удалось запустить установщик');
    }
    // При успехе управление перехватила система (installer),
    // после установки Android перезапустит приложение сам.
  }, []);

  // v1.5.11: запуск скачивания из Настроек. Настройки кладут в стор РЕЛИЗ
  // (не флаг), а весь процесс — включая модалку с прогрессом — ведётся здесь,
  // чтобы не копировать загрузку и её UI во второй экран.
  const requestedRelease = useUpdateRequestStore((s) => s.requested);
  const clearUpdateRequest = useUpdateRequestStore((s) => s.clear);

  useEffect(() => {
    if (!requestedRelease) return;
    // Запрос гасим всегда, иначе после окончания текущей загрузки эффект
    // перезапустится на том же значении и скачает второй раз.
    clearUpdateRequest();
    if (downloading) return;
    void handleUpdate(requestedRelease);
  }, [requestedRelease, clearUpdateRequest, downloading, handleUpdate]);

  // На iOS ничего не показываем — там обновления только через App Store
  if (Platform.OS !== 'android') return null;

  // ── Процесс скачивания (перекрывает всё) ──────────────────────────────
  // Проверяется ДО hasUpdate намеренно: скачивание могли запустить из
  // Настроек, а у них своя копия useAppUpdate — здесь `latest` в этот момент
  // может быть ещё пустым, и при обратном порядке модалка прогресса просто не
  // отрисовалась бы (водитель жмёт «Обновить» и не видит ничего).
  if (downloading || error) {
    return (
      <Modal transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons
              name={error ? 'alert-circle' : 'cloud-download-outline'}
              size={48}
              color={error ? colors.danger : colors.primary}
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
                  Версия {activeRelease?.latestVersion ?? ''} ·{' '}
                  {formatMb(activeRelease?.apkSizeBytes ?? 0)}
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
                  color={colors.primary}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // Дальше — UI, которому нужны данные о доступном обновлении.
  if (!hasUpdate || !latest) return null;

  // ── Force-update: блокирующая модалка ──────────────────────────────────
  if (isForced) {
    return (
      <Modal transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons
              name="warning"
              size={48}
              color={colors.danger}
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
              onPress={() => void handleUpdate(latest)}
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
      <Ionicons name="cloud-download-outline" size={iconTokens.md} color={colors.primary} />
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
        onPress={() => void handleUpdate(latest)}
      >
        <Text style={styles.btnPrimaryText}>Обновить</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={dismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={iconTokens.md} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

/**
 * Стили баннера и модалки обновления.
 *
 * v1.5.17: были жёстко светлыми. Баннер обновления показывается поверх
 * ЛЮБОГО экрана, в том числе поверх карты в тёмной теме, — и светлая
 * полоса сверху выглядела чужой наклейкой.
 */
const createStyles = (t: Theme) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: t.colors.primarySoft,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    bannerTitle: { ...text.label, fontWeight: '700', color: t.colors.textPrimary },
    bannerSubtitle: { ...text.caption, color: t.colors.primary, marginTop: 1 },

    modalBackdrop: {
      flex: 1,
      backgroundColor: t.colors.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xxl,
    },
    modalCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: t.colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      borderWidth: t.isDark ? 1 : 0,
      borderColor: t.colors.border,
    },
    modalTitle: {
      ...text.heading,
      color: t.colors.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    modalText: { ...text.body, color: t.colors.textSecondary, textAlign: 'center' },
    changelog: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.sm,
      backgroundColor: t.colors.surfaceSunken,
      ...text.label,
      color: t.colors.textSecondary,
    },
    progressBar: {
      marginTop: spacing.md,
      height: 8,
      backgroundColor: t.colors.surfaceSunken,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: t.colors.primary },
    progressText: {
      marginTop: spacing.xs,
      ...text.caption,
      color: t.colors.textMuted,
      textAlign: 'center',
    },

    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      minHeight: touch.min,
    },
    btnCompact: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 0 },
    btnPrimary: { backgroundColor: t.colors.primary },
    btnPrimaryText: { ...text.label, fontWeight: '700', color: t.colors.textInverse },
    btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.colors.border },
    btnGhostText: { ...text.label, color: t.colors.textSecondary },
  });
