/**
 * @file: src/services/logger.service.ts
 * @description:
 *   Сервис клиентского логирования: собирает ошибки/события в очередь,
 *   отправляет батчами на сервер (POST /api/v1/driver/logs) с автоматическим
 *   повтором и offline-очередью в AsyncStorage.
 *
 *   Два режима:
 *     - batch (default) — flush раз в FLUSH_INTERVAL_MS или при заполнении очереди
 *     - realtime — flush сразу после каждого события (активируется по команде
 *       с сервера через Socket.IO событие driver:logs:mode)
 *
 *   Используется:
 *     - RootErrorBoundary — ловит крэши React-дерева
 *     - ErrorUtils.setGlobalHandler — ловит JS-ошибки вне React
 *     - вручную в критичных местах: useOrderActions, socket.service и т.п.
 * @dependencies:
 *   - ky (HTTP-клиент, уже настроен в api/client.ts)
 *   - @react-native-async-storage/async-storage
 *   - expo-constants, react-native (Platform, DeviceInfo)
 * @created: 2026-04-14 00:00:00
 * @updated: 2026-04-14 00:00:00
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import ky from 'ky';
import { getApiBase, API_TIMEOUT_MS } from '@/lib/constants';
import { useAuthStore } from '@/stores/auth.store';

const QUEUE_STORAGE_KEY = 'ts-driver-log-queue';
const FLUSH_INTERVAL_MS = 10_000; // батч раз в 10 секунд
const MAX_QUEUE_SIZE = 500; // переполнение → старые удаляются
const MAX_BATCH_SIZE = 50; // сколько отправлять за раз

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  timestamp: string; // ISO
  level: LogLevel;
  message: string;
  stack?: string | null;
  screen?: string | null;
  action?: string | null;
  appVersion?: string | null;
  platform?: string | null;
  deviceInfo?: string | null;
  extra?: Record<string, unknown> | null;
}

class DriverLogger {
  private queue: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isSending = false;
  private realtime = false;
  private initialized = false;

  /** Инициализация: загружает offline-очередь и запускает периодический flush */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LogEntry[];
        if (Array.isArray(parsed)) {
          this.queue = parsed.slice(-MAX_QUEUE_SIZE);
        }
      }
    } catch {
      // Повреждённая очередь — игнорируем, начинаем с чистой
    }

    this.startTimer();
  }

  /** Включение/выключение realtime-режима (команда с сервера) */
  setRealtime(enabled: boolean): void {
    this.realtime = enabled;
    if (enabled) {
      // Немедленный flush после включения
      void this.flush();
    }
  }

  /** Основной метод логирования */
  log(level: LogLevel, message: string, context?: Partial<LogEntry>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: String(message).slice(0, 2000),
      stack: context?.stack ?? null,
      screen: context?.screen ?? null,
      action: context?.action ?? null,
      appVersion: Constants.expoConfig?.version ?? null,
      platform: Platform.OS,
      deviceInfo: `${Platform.OS} ${Platform.Version}`,
      extra: context?.extra ?? null,
    };

    this.queue.push(entry);
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }

    void this.persistQueue();

    if (this.realtime || level === 'error') {
      // ошибки флашим сразу, даже вне realtime-режима
      void this.flush();
    }
  }

  /** Удобные обёртки */
  error(message: string, context?: Partial<LogEntry>): void {
    this.log('error', message, context);
  }
  warn(message: string, context?: Partial<LogEntry>): void {
    this.log('warn', message, context);
  }
  info(message: string, context?: Partial<LogEntry>): void {
    this.log('info', message, context);
  }
  debug(message: string, context?: Partial<LogEntry>): void {
    this.log('debug', message, context);
  }

  /** Отправка накопленных событий на сервер */
  async flush(): Promise<void> {
    if (this.isSending || this.queue.length === 0) return;

    const { accessToken } = useAuthStore.getState();
    if (!accessToken) return; // нет авторизации — откладываем до логина

    this.isSending = true;
    const batch = this.queue.slice(0, MAX_BATCH_SIZE);

    try {
      await ky.post(`${getApiBase()}/driver/logs`, {
        json: { entries: batch },
        timeout: API_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Успех — убираем отправленное из очереди
      this.queue = this.queue.slice(batch.length);
      await this.persistQueue();
    } catch {
      // Сеть/ошибка — оставляем в очереди, попытка на следующем тике
    } finally {
      this.isSending = false;
    }
  }

  private startTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      // Игнорируем — лог сохранится только в памяти, пока жив процесс
    }
  }
}

export const driverLogger = new DriverLogger();
