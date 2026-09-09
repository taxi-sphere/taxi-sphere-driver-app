/**
 * @file: src/services/socket.service.test.ts
 * @description:
 *   Тесты реестра подписок Socket.IO.
 *
 *   ЗАЧЕМ ИМЕННО ОНИ. Дефект, ради которого реестр появился, был МОЛЧАЛИВЫМ:
 *   `this.socket?.on(...)` при ещё не созданном сокете не делает ничего, но
 *   возвращает функцию отписки, будто подписка удалась. Ни типы, ни линт, ни
 *   логи этого не показывают — приложение просто не получает событий и живёт
 *   на опросе. Именно так «мгновенная» отмена заказа доходила до водителя за
 *   10–30 секунд.
 *
 *   Поэтому здесь проверяется не «подписка вызывает socket.on», а внешнее
 *   поведение: доходит ли событие до подписчика в каждом порядке действий,
 *   какой бывает в жизни — подписка до подключения, переподключение с новым
 *   сокетом, отписка.
 *
 * @dependencies: vitest, @/services/socket.service
 * @created: 2026-09-09 (1.5.49)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* --- Поддельный сокет ----------------------------------------------------- */

/**
 * Минимальный двойник Socket.IO: помнит слушателей и умеет «принять»
 * событие. Настоящий клиент сюда тянуть незачем — проверяется наша логика
 * реестра, а не его.
 */
class FakeSocket {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  connected = false;
  disconnectCalls = 0;

  on(event: string, cb: (...args: unknown[]) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(cb);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, cb: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(cb);
    return this;
  }

  removeAllListeners() {
    this.listeners.clear();
    return this;
  }

  disconnect() {
    this.disconnectCalls += 1;
    this.connected = false;
    return this;
  }

  connect() {
    this.connected = true;
    return this;
  }

  /** Пришло событие с сервера. */
  emitFromServer(event: string, payload?: unknown) {
    for (const cb of this.listeners.get(event) ?? []) cb(payload);
  }
}

/** Сокеты в порядке создания: каждый `connect()` делает новый. */
const created: FakeSocket[] = [];

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new FakeSocket();
    created.push(socket);
    return socket;
  },
}));

vi.mock('@/lib/constants', () => ({
  getSocketUrl: () => 'http://localhost:3020',
}));

vi.mock('@/stores/connection.store', () => ({
  useConnectionStore: { getState: () => ({ setSocketStatus: vi.fn() }) },
}));

vi.mock('@/services/logger.service', () => ({
  driverLogger: { setRealtime: vi.fn() },
}));

// Импорт ПОСЛЕ моков — иначе служба успеет схватить настоящий
// socket.io-client на этапе загрузки модуля.
// eslint-disable-next-line import/first
import { socketService } from '@/services/socket.service';

const lastSocket = () => created[created.length - 1]!;

beforeEach(() => {
  socketService.disconnect();
  created.length = 0;
});

describe('подписка до подключения', () => {
  it('событие доходит, хотя подписались раньше, чем появился сокет', () => {
    // Ровно порядок из SocketProvider: подписки ставятся синхронно, а
    // connect() вызывается позже, после ответа с конфигом сервера. До 1.5.49
    // подписка в этом случае терялась молча, и НИ ОДНО событие не доходило.
    const seen = vi.fn();
    socketService.onOrderCanceled(seen);

    socketService.connect('token');
    lastSocket().emitFromServer('order:canceled', { orderId: 'o1', reason: 'клиент' });

    expect(seen).toHaveBeenCalledWith({ orderId: 'o1', reason: 'клиент' });
  });

  it('подписчиков может быть несколько на одно событие', () => {
    // Отмену слушают и провайдер (сброс кэша), и OrderCanceledWatcher (диалог).
    const a = vi.fn();
    const b = vi.fn();
    socketService.onOrderCanceled(a);
    socketService.onOrderCanceled(b);

    socketService.connect('token');
    lastSocket().emitFromServer('order:canceled', { orderId: 'o1' });

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});

describe('переподключение', () => {
  it('подписки переезжают на новый сокет', () => {
    // `connect()` создаёт НОВЫЙ объект сокета (после обновления токена,
    // например). Компоненты об этом не знают: их эффекты давно отработали, и
    // повторно подписаться некому.
    const seen = vi.fn();
    socketService.connect('token-1');
    socketService.onOrderNew(seen);

    socketService.connect('token-2');
    expect(created).toHaveLength(2);

    lastSocket().emitFromServer('order:new', { id: 'o2' });
    expect(seen).toHaveBeenCalledWith({ id: 'o2' });
  });

  it('старый сокет после переподключения больше никого не будит', () => {
    const seen = vi.fn();
    socketService.connect('token-1');
    socketService.onOrderNew(seen);
    const old = lastSocket();

    socketService.connect('token-2');
    old.emitFromServer('order:new', { id: 'ghost' });

    expect(seen).not.toHaveBeenCalled();
  });
});

describe('отписка', () => {
  it('после отписки событие не доходит', () => {
    const seen = vi.fn();
    const unsubscribe = socketService.onOrderStatus(seen);
    socketService.connect('token');

    unsubscribe();
    lastSocket().emitFromServer('order:status', { orderId: 'o1' });

    expect(seen).not.toHaveBeenCalled();
  });

  it('отписка не воскресает при переподключении', () => {
    // Компонент размонтирован — его колбэк обязан исчезнуть из реестра
    // насовсем, иначе он вернётся на следующем же сокете и станет утечкой.
    const seen = vi.fn();
    const unsubscribe = socketService.onOrderStatus(seen);
    socketService.connect('token-1');
    unsubscribe();

    socketService.connect('token-2');
    lastSocket().emitFromServer('order:status', { orderId: 'o1' });

    expect(seen).not.toHaveBeenCalled();
  });

  it('отписка одного подписчика не трогает остальных', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = socketService.onBalanceChanged(a);
    socketService.onBalanceChanged(b);
    socketService.connect('token');

    unsubA();
    lastSocket().emitFromServer('balance:changed', { amount: 100 });

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });
});

describe('служебные события', () => {
  it('onConnected срабатывает на каждом подключении, включая первое', () => {
    // На этом держится перечитывание данных после обрыва: события, ушедшие
    // в пустоту, Socket.IO не переигрывает.
    const seen = vi.fn();
    socketService.onConnected(seen);

    socketService.connect('token');
    lastSocket().emitFromServer('connect');
    expect(seen).toHaveBeenCalledTimes(1);

    socketService.connect('token-2');
    lastSocket().emitFromServer('connect');
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('onConnectError доходит до подписчика', () => {
    // До 1.5.49 обработчик вешался через getSocket()?.on(...) до создания
    // сокета, поэтому обновление протухшего токена не срабатывало ни разу.
    const seen = vi.fn();
    socketService.onConnectError(seen);

    socketService.connect('token');
    const err = new Error('Unauthorized');
    lastSocket().emitFromServer('connect_error', err);

    expect(seen).toHaveBeenCalledWith(err);
  });
});
