/**
 * @file: app/_layout.tsx
 * @description:
 *   Корневой layout приложения: провайдеры, splash screen, status bar,
 *   ErrorBoundary для крэшей React-дерева и глобальный JS-обработчик
 *   через ErrorUtils.setGlobalHandler для ошибок вне React.
 *
 *   v1.5.5: `useKeepAwake()` не даёт экрану гаснуть, пока приложение
 *   в foreground. Работает **всегда**, без привязки к статусу — по
 *   явному решению: диспетчеру и водителю важнее непрерывный обзор
 *   заказов/карты, чем экономия батареи (батарея сядет быстрее, но
 *   у водителей в такси всегда есть зарядка в машине).
 *   Требует пермишн WAKE_LOCK (уже есть в app.json).
 * @dependencies: AppProviders, expo-splash-screen, expo-status-bar,
 *                expo-keep-awake,
 *                @/services/logger.service, @/components/RootErrorBoundary
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-08-26 (v1.5.5 — useKeepAwake, экран не гаснет)
 */

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useKeepAwake } from 'expo-keep-awake';
import { AppProviders } from '@/providers/AppProviders';
import { useAuthStore } from '@/stores/auth.store';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
import { AppUpdateNotifier } from '@/components/AppUpdateNotifier';
import { driverLogger } from '@/services/logger.service';

// Не скрывать splash до готовности
SplashScreen.preventAutoHideAsync();

// Инициализация логгера и перехват глобальных JS-ошибок делается один раз
let globalHandlerInstalled = false;
function installGlobalErrorHandler() {
  if (globalHandlerInstalled) return;
  globalHandlerInstalled = true;

  void driverLogger.init();

  // ErrorUtils — RN API, типов нет, но существует в runtime
  const errorUtils = (globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (err: Error, isFatal: boolean) => void;
      setGlobalHandler?: (handler: (err: Error, isFatal: boolean) => void) => void;
    };
  }).ErrorUtils;

  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((err, isFatal) => {
      driverLogger.error(err?.message ?? 'Unknown JS error', {
        stack: err?.stack ?? null,
        screen: 'global',
        action: isFatal ? 'fatal_js_error' : 'js_error',
      });
      void driverLogger.flush();
      previous?.(err, isFatal);
    });
  }

  // Unhandled promise rejections — ловим через polyfill, доступный в RN/Hermes
  const g = globalThis as unknown as {
    onunhandledrejection?: ((event: { reason?: unknown }) => void) | null;
  };
  g.onunhandledrejection = (event) => {
    const reason = event?.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? 'Unknown rejection');
    const stack = reason instanceof Error ? reason.stack : null;
    driverLogger.error(`Unhandled rejection: ${message}`, {
      stack,
      screen: 'global',
      action: 'unhandled_rejection',
    });
  };
}

installGlobalErrorHandler();

export default function RootLayout() {
  // v1.5.5: держим экран включённым всё время, пока приложение открыто.
  // Возможные аргументы «а как же батарея» — сознательно отклонены:
  //   • водитель на смене видит карту и заказы, гаснущий экран мешает;
  //   • в машине почти всегда есть зарядка (12V/USB);
  //   • foreground-service GPS всё равно уже жжёт батарею.
  // Если появится жалоба на разряд — сделать селективно по `useDriverStatus`
  // (deactivate когда 'offline').
  useKeepAwake();

  const isReady = useAuthStore((s) => s.isReady);

  useEffect(() => {
    console.log('[RootLayout] isReady:', isReady);
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  return (
    <RootErrorBoundary>
      <AppProviders>
        <StatusBar style="dark" />
        <AppUpdateNotifier />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
        </Stack>
      </AppProviders>
    </RootErrorBoundary>
  );
}
