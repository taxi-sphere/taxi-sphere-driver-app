/**
 * @file: src/services/token.service.ts
 * @description:
 *   CRUD для JWT-токенов через expo-secure-store.
 *   Безопасное хранение: Keychain (iOS) / EncryptedSharedPreferences (Android).
 * @dependencies: expo-secure-store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'ts_access_token';
const REFRESH_TOKEN_KEY = 'ts_refresh_token';
const USER_KEY = 'ts_user';

/* -------------------------------------------------------------------------- */
/*  Access Token                                                               */
/* -------------------------------------------------------------------------- */

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function setAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function deleteAccessToken(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

/* -------------------------------------------------------------------------- */
/*  Refresh Token                                                              */
/* -------------------------------------------------------------------------- */

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function deleteRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

/* -------------------------------------------------------------------------- */
/*  User data (JSON)                                                           */
/* -------------------------------------------------------------------------- */

export async function getStoredUser<T>(): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setStoredUser<T>(user: T): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function deleteStoredUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

/* -------------------------------------------------------------------------- */
/*  Очистка всех токенов (logout)                                              */
/* -------------------------------------------------------------------------- */

export async function clearAllTokens(): Promise<void> {
  await Promise.all([
    deleteAccessToken(),
    deleteRefreshToken(),
    deleteStoredUser(),
  ]);
}
