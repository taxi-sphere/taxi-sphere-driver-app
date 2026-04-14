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
import * as authApi from '@/api/auth.api';
import * as tokenService from '@/services/token.service';
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
