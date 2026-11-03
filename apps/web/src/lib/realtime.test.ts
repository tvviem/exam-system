import { describe, expect, it, vi } from 'vitest';
import { createRealtime, type SocketLike } from './realtime';

// Socket giả: ghi lại thông điệp gửi đi, cho phép test "server" trả lời ack và đẩy tin.
class FakeSocket implements SocketLike {
  connected = false;
  disconnected = 0;
  sent: { event: string; payload: unknown }[] = [];
  ok = true;
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  on(event: string, handler: (...args: unknown[]) => void) {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
  }
  off(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.get(event)?.delete(handler);
  }
  emit(event: string, payload: unknown, ack?: (reply: { ok: boolean }) => void) {
    this.sent.push({ event, payload });
    ack?.({ ok: this.ok });
  }
  disconnect() {
    this.disconnected++;
    this.connected = false;
  }
  // phía "server"
  fire(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
  connect() {
    this.connected = true;
    this.fire('connect');
  }
  drop() {
    this.connected = false;
    this.fire('disconnect');
  }
}

const setup = () => {
  const socket = new FakeSocket();
  const realtime = createRealtime(async () => socket);
  return { socket, realtime };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createRealtime', () => {
  it('vào phòng khi kết nối xong và báo live khi server nhận', async () => {
    const { socket, realtime } = setup();
    const live = vi.fn();
    realtime.subscribe({
      join: 'monitor:join',
      payload: { sessionId: 's1' },
      event: 'monitor.changed',
      onEvent: vi.fn(),
      onLive: live,
    });
    await tick();
    expect(socket.sent).toEqual([]); // chưa nối thì chưa gửi
    socket.connect();
    expect(socket.sent).toEqual([{ event: 'monitor:join', payload: { sessionId: 's1' } }]);
    expect(live).toHaveBeenLastCalledWith(true);
  });

  it('server từ chối vào phòng thì không coi là live', async () => {
    const { socket, realtime } = setup();
    socket.ok = false;
    const live = vi.fn();
    realtime.subscribe({
      join: 'monitor:join',
      payload: {},
      event: 'e',
      onEvent: vi.fn(),
      onLive: live,
    });
    await tick();
    socket.connect();
    expect(live).toHaveBeenLastCalledWith(false);
  });

  it('chuyển tin của đúng sự kiện cho người đăng ký', async () => {
    const { socket, realtime } = setup();
    const onEvent = vi.fn();
    realtime.subscribe({ join: 'j', payload: {}, event: 'monitor.changed', onEvent });
    await tick();
    socket.connect();
    socket.fire('monitor.changed');
    socket.fire('khac');
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('nối lại thì vào phòng lại và báo để tải lại; mất kết nối thì không còn live', async () => {
    const { socket, realtime } = setup();
    const live = vi.fn();
    const onConnected = vi.fn();
    realtime.subscribe({
      join: 'j',
      payload: { a: 1 },
      event: 'e',
      onEvent: vi.fn(),
      onLive: live,
      onConnected,
    });
    await tick();
    socket.connect();
    socket.drop();
    expect(live).toHaveBeenLastCalledWith(false);
    socket.connect();
    expect(socket.sent).toHaveLength(2);
    expect(onConnected).toHaveBeenCalledTimes(2);
    expect(live).toHaveBeenLastCalledWith(true);
  });

  it('onConnected chỉ gọi sau khi server nhận vào phòng (ack), để ảnh chụp tải sau đó không lọt tin', async () => {
    const { socket, realtime } = setup();
    const order: string[] = [];
    const emit = socket.emit.bind(socket);
    socket.emit = (event, payload, ack) => {
      order.push('join');
      emit(event, payload, ack);
    };
    realtime.subscribe({ join: 'j', payload: {}, event: 'e', onEvent: vi.fn(), onConnected: () => order.push('reload') });
    await tick();
    socket.connect();
    expect(order).toEqual(['join', 'reload']);
  });

  it('nạp thư viện lỗi thì lần đăng ký sau thử nạp lại và không có lỗi chưa bắt', async () => {
    let attempts = 0;
    const socket = new FakeSocket();
    const realtime = createRealtime(async () => {
      attempts++;
      if (attempts === 1) throw new Error('mạng đứt');
      return socket;
    });
    const live = vi.fn();
    const first = realtime.subscribe({ join: 'j', payload: {}, event: 'e', onEvent: vi.fn(), onLive: live });
    await tick();
    expect(live).toHaveBeenLastCalledWith(false);
    first();
    await tick();
    realtime.subscribe({ join: 'j', payload: {}, event: 'e', onEvent: vi.fn(), onLive: live });
    await tick();
    socket.connect();
    expect(attempts).toBe(2);
    expect(live).toHaveBeenLastCalledWith(true);
  });

  it('hủy đăng ký thì không nhận tin nữa; người cuối hủy thì đóng kết nối', async () => {
    const { socket, realtime } = setup();
    const a = vi.fn();
    const b = vi.fn();
    const stopA = realtime.subscribe({ join: 'j', payload: {}, event: 'e', onEvent: a });
    const stopB = realtime.subscribe({ join: 'j', payload: {}, event: 'e', onEvent: b });
    await tick();
    socket.connect();
    stopA();
    socket.fire('e');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(socket.disconnected).toBe(0);
    stopB();
    await tick();
    expect(socket.disconnected).toBe(1);
  });

  it('hủy trước khi nạp xong thì không gửi gì và đóng kết nối', async () => {
    const { socket, realtime } = setup();
    const stop = realtime.subscribe({ join: 'j', payload: {}, event: 'e', onEvent: vi.fn() });
    stop();
    await tick();
    socket.connect();
    expect(socket.sent).toEqual([]);
    expect(socket.disconnected).toBe(1);
  });
});
