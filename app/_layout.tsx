/**
 * @file: app/_layout.tsx
 * @description:
 *   Корневой layout приложения: провайдеры, splash screen, status bar,
 *   ErrorBoundary для крэшей React-дерева и глобальный JS-обработчик
 *   через ErrorUtils.setGlobalHandler для ошибок вне React.
 * @dependencies: AppProviders, expo-splash-screen, expo-status-bar,
 *                @/services/logger.service, @/components/RootErrorBoundary
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-04-14 00:00:00
 */

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AppProviders } from '@/providers/AppProviders';
import { useAuthStore } from '@/stores/auth.store';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
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
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
        </Stack>
      </AppProviders>
    </RootErrorBoundary>
  );
}
