/**
 * @file: src/services/trip-meter.service.ts
 * @description:
 *   Счётчик поездки: копит пробег из потока GPS и отдаёт его серверу.
 *
 *   ЗАЧЕМ ЗДЕСЬ, А НЕ В ЭКРАНЕ ЗАКАЗА. Пробег обязан считаться и когда
 *   водитель ушёл на другую вкладку, и когда экран погас: он везёт клиента
 *   всю поездку, а не только пока смотрит в карточку. Поэтому счётчик
 *   питается из того же потока точек, что и отправка позиции на сервер, —
 *   `location.service` зовёт `feedPoint` и на переднем плане, и в фоне.
 *
 *   ПОЧЕМУ СОСТОЯНИЕ ПЕРЕЖИВАЕТ ПЕРЕЗАПУСК. Приложение выгружает система,
 *   особенно на дешёвых телефонах с включённой экономией. Потеряй счётчик
 *   накопленное — водитель довёз бы клиента, а в чеке оказался бы пробег с
 *   середины поездки. Состояние лежит в AsyncStorage под ключом заказа, и
 *   сервер всё равно берёт БОЛЬШЕЕ из своего и присланного: даже полная
 *   потеря локального состояния не откручивает счётчик назад.
 *
 *   ПОЧЕМУ ДЕНЬГИ СЧИТАЕТ НЕ ЗДЕСЬ. Тариф на телефоне подставной, и сумма,
 *   посчитанная тут, разошлась бы с той, что спишется у клиента. Отсюда
 *   уходят только метры и секунды; рубли приходят обратно с сервера.
 *
 * @dependencies: @/lib/trip-odometer, @/api/orders.api, @react-native-async-storage
 * @created: 2026-09-09 (1.5.46)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  accumulate,
  emptyOdometer,
  readingOf,
  shouldPush,
  type OdometerPoint,
  type OdometerState,
} from '@/lib/trip-odometer';
import { sendMeter } from '@/api/orders.api';
import { driverLogger } from '@/services/logger.service';
import { onLocationPoint } from './location.service';
import type { LocationPoint } from '@/types/location';

const STORAGE_PREFIX = 'trip-meter:';

/** Заказ, по которому сейчас идёт счёт. `null` — считать нечего. */
let activeOrderId: string | null = null;
let state: OdometerState = emptyOdometer();
/** Что и когда в последний раз ушло на сервер — по нему решается следующая отправка. */
let sent: { distanceM: number; atMs: number } | null = null;
/** Отправка идёт прямо сейчас: параллельные запросы одного и того же не нужны. */
let pushing = false;

const keyOf = (orderId: string) => `${STORAGE_PREFIX}${orderId}`;

/**
 * Переключить счётчик на заказ.
 *
 * Зовётся с экрана текущего заказа при каждой смене заказа, включая
 * переключение между своим и встречным. Повторный вызов с тем же id ничего
 * не делает — иначе каждый перерисованный экран сбрасывал бы накопленное.
 */
export async function setMeterOrder(orderId: string | null): Promise<void> {
  if (orderId === activeOrderId) return;

  activeOrderId = orderId;
  sent = null;
  state = emptyOdometer();
  if (!orderId) return;

  try {
    const raw = await AsyncStorage.getItem(keyOf(orderId));
    // Пока читали с диска, заказ мог смениться: водитель переключился на
    // встречный, диспетчер снял заказ. Без этой проверки накопленное от
    // ПРОШЛОГО заказа легло бы в новый — и клиент заплатил бы за чужой
    // пробег.
    if (activeOrderId !== orderId) return;
    if (raw) {
      const saved = JSON.parse(raw) as Partial<OdometerState>;
      state = {
        distanceM: Number(saved.distanceM) || 0,
        movingSec: Number(saved.movingSec) || 0,
        // Последнюю точку НЕ восстанавливаем: между выгрузкой и запуском
        // машина могла уехать куда угодно, и этот отрезок пробегом не был бы
        // измерен — он был бы выдуман.
        last: null,
      };
    }
  } catch (err) {
    driverLogger.warn('Счётчик: не удалось прочитать сохранённое', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Текущие показания — для экрана, пока сервер не прислал свои. */
export function meterReading(): { distanceM: number; movingSec: number } {
  return readingOf(state);
}

/**
 * Очередная точка GPS.
 *
 * Синхронная и дешёвая: её зовут из обработчика позиции, который на
 * секундном потоке не должен ничего ждать. Запись на диск и отправка —
 * fire-and-forget.
 */
export function feedPoint(point: OdometerPoint): void {
  if (!activeOrderId) return;

  const next = accumulate(state, point);
  if (next === state) return;
  state = next;

  const orderId = activeOrderId;
  void AsyncStorage.setItem(
    keyOf(orderId),
    JSON.stringify({ distanceM: state.distanceM, movingSec: state.movingSec }),
  ).catch(() => {
    // Диск переполнен или недоступен — счёт продолжится в памяти, а сервер
    // и так хранит последние присланные показания.
  });

  if (shouldPush(state, sent, point.at)) void push(orderId);
}

async function push(orderId: string): Promise<void> {
  if (pushing) return;
  pushing = true;
  try {
    const reading = readingOf(state);
    await sendMeter(orderId, reading);
    sent = { distanceM: reading.distanceM, atMs: Date.now() };
  } catch (err) {
    // Сеть пропала — не страшно: показания накопленные, следующая удачная
    // отправка догонит разом. Поэтому и не заводим очередь.
    driverLogger.warn('Счётчик: показания не ушли', {
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    pushing = false;
  }
}

/**
 * Подписать счётчик на поток точек GPS.
 *
 * Зовётся ОДИН раз при старте приложения. Подписка, а не прямой вызов из
 * `location.service`: та служба — низкоуровневый источник точек, и знание о
 * счётчике ей ни к чему. Практическая цена обратного направления известна:
 * импорт счётчика оттуда тянет слой API и весь react-native, и тесты службы
 * перестают собираться.
 *
 * Точка приводится к виду одометра здесь же: у него время в миллисекундах,
 * а в потоке лежит ISO-строка.
 */
export function installMeterFeed(): () => void {
  return onLocationPoint((point: LocationPoint) => {
    feedPoint({
      latitude: point.lat,
      longitude: point.lng,
      at: point.recordedAt ? Date.parse(point.recordedAt) : Date.now(),
      // Паспортная погрешность обязана дойти до одометра: по ней он
      // отличает спутниковый фикс от положения по вышкам, из-за которого
      // водитель «прыгает» на сотни метров.
      accuracy: point.accuracy,
    });
  });
}

/**
 * Дослать показания и убрать сохранённое: заказ закончился.
 *
 * Порядок важен — сначала отправка, потом очистка: иначе последние метры
 * пропали бы вместе с записью.
 */
export async function finishMeter(orderId: string): Promise<void> {
  try {
    const reading = readingOf(state);
    if (reading.distanceM > 0 || reading.movingSec > 0) {
      await sendMeter(orderId, reading);
    }
  } catch {
    // Не ушло — сервер посчитает по тому, что успел получить.
  }
  try {
    await AsyncStorage.removeItem(keyOf(orderId));
  } catch {
    // Ключ останется до следующего заказа с тем же id, которого не будет.
  }
  if (activeOrderId === orderId) {
    activeOrderId = null;
    state = emptyOdometer();
    sent = null;
  }
}
