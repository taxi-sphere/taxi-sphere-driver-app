/**
 * @file: src/hooks/useAuth.ts
 * @description:
 *   Hook авторизации: вход по телефону+паролю, logout.
 * @dependencies: auth.api, auth.store, token.service
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-13 14:00:00
 */

import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useDriverStore } from '@/stores/driver.store';
import * as authApi from '@/api/auth.api';
import * as driverApi from '@/api/driver.api';
import * as tokenService from '@/services/token.service';
import { driverLogger } from '@/services/logger.service';
import { fetchServerConfig } from '@/lib/constants';
import { Platform } from 'react-native';

/** Вход по телефону и паролю */
export function useLogin() {
  const { setTokens, setLoading } = useAuthStore();
  const setLastPhone = useSettingsStore((s) => s.setLastPhone);

  return useMutation({
    mutationFn: ({
      phone,
      password,
    }: {
      phone: string;
      password: string;
    }) => {
      const deviceInfo = `${Platform.OS} ${Platform.Version}`;
      return authApi.login(phone, password, deviceInfo);
    },
    onMutate: () => setLoading(true),
    onSuccess: async (data, variables) => {
      await setTokens(
        data.data.accessToken,
        data.data.refreshToken,
        data.data.user,
      );
      setLastPhone(variables.phone);

      // Загрузить конфигурацию сервера (socket URL и пр.) ДО того как
      // SocketProvider попытается подключиться.
      await fetchServerConfig();

      // После логина ставим «Занят» по умолчанию — чтобы водителю не прилетел
      // заказ, пока он не нажал «Свободен» вручную.
      try {
        await driverApi.setStatus('busy');
        useDriverStore.getState().setStatus('busy');
      } catch (err) {
        driverLogger.warn('Не удалось установить начальный статус busy после логина', {
          action: 'auth:login:set-default-status',
          extra: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    },
    onSettled: () => setLoading(false),
  });
}

/** Выход из системы */
export function useLogout() {
  const { logout } = useAuthStore();

  return useMutation({
    mutationFn: async () => {
      const refreshToken = await tokenService.getRefreshToken();
      await authApi.logout(refreshToken ?? undefined);
      await logout();
    },
  });
}
