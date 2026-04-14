/**
 * @file: src/services/notification.service.ts
 * @description:
 *   Регистрация push-уведомлений через Expo Notifications.
 *   Настройка каналов, получение push-токена.
 *   В Expo Go push-уведомления недоступны (SDK 53+), функции gracefully деградируют.
 * @dependencies: expo-notifications, expo-constants
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-13 12:00:00
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

/** Настроить обработчик уведомлений */
export function configureNotifications(): void {
  if (isExpoGo) {
    console.log('[Notifications] Push notifications disabled in Expo Go');
    return;
  }

  try {
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.warn('[Notifications] Failed to configure:', e);
  }
}

/** Запросить разрешения и получить Expo Push Token */
export async function registerForPushNotifications(): Promise<string | null> {
  if (isExpoGo) {
    console.log('[Notifications] Push tokens unavailable in Expo Go');
    return null;
  }

  try {
    const Notifications = require('expo-notifications');

    // Настройка Android-канала
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Заказы',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Отправить токен на сервер
    if (token) {
      try {
        const { savePushToken } = await import('../api/driver.api');
        await savePushToken(token);
      } catch {
        // Не критично — попробуем при следующем запуске
      }
    }

    return token;
  } catch {
    return null;
  }
}

/**
 * Показать локальное уведомление (когда приложение в фоне и пришло Socket.IO событие).
 */
export async function showLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (isExpoGo) return;

  try {
    const Notifications = require('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: 'default',
        channelId: 'orders',
      },
      trigger: null, // немедленно
    });
  } catch {
    // ignore
  }
}
