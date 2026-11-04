import { type JoinAck, REALTIME_PATH } from '@exam/shared';

// Kênh đẩy Socket.IO phía trình duyệt (PR 4d-3, Q213): chỉ là phần tăng tốc. Tin đẩy không mang dữ liệu, chỉ báo "hãy hỏi
// lại"; mất kênh thì heartbeat và hỏi lại định kỳ vẫn giữ mọi thứ đúng. Thư viện nạp lười để không nằm trong gói JS đầu tiên
// (khu làm bài có ngân sách 40 KB) và chỉ có kết nối khi một màn thực sự cần (Theo dõi, làm bài); trang quản trị không mở.

/** Phần của socket mà module này dùng (để test bằng socket giả). */
export interface SocketLike {
  connected: boolean;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
  off(event: string, handler: (...args: unknown[]) => void): unknown;
  emit(event: string, payload: unknown, ack?: (reply: JoinAck) => void): unknown;
  disconnect(): unknown;
}

export interface RoomSubscription {
  /** Thông điệp vào phòng (`monitor:join`, `attempt:join`) và dữ liệu đi kèm. */
  join: string;
  payload: unknown;
  /** Sự kiện server đẩy xuống phòng này. */
  event: string;
  onEvent: () => void;
  /** Mỗi lần (nối lại) vào phòng xong, kể cả lần đầu: nơi gọi nên tải lại để bù tin có thể đã lỡ. */
  onConnected?: () => void;
  /** Đã vào phòng và kênh đang nối (true), hay chưa/đã đứt (false). */
  onLive?: (live: boolean) => void;
}

export function createRealtime(loadSocket: () => Promise<SocketLike>) {
  let socket: Promise<SocketLike> | undefined;
  let subscribers = 0;

  function acquire() {
    if (!socket) {
      const loading = loadSocket();
      // Nạp thư viện lỗi (mạng chập chờn): bỏ lời hứa hỏng để lần đăng ký sau thử nạp lại.
      loading.catch(() => {
        if (socket === loading) socket = undefined;
      });
      socket = loading;
    }
    subscribers++;
    return socket;
  }

  function release() {
    subscribers--;
    if (subscribers > 0 || !socket) return;
    const closing = socket;
    socket = undefined;
    closing.then(
      (s) => s.disconnect(),
      () => undefined,
    );
  }

  /** Đăng ký vào một phòng; trả hàm hủy. Nối lại tự vào phòng lại (phòng của Socket.IO mất khi đứt). */
  function subscribe(options: RoomSubscription): () => void {
    let disposed = false;
    let attached: SocketLike | undefined;
    const enter = (s: SocketLike) => {
      s.emit(options.join, options.payload, (reply) => {
        if (disposed) return;
        options.onLive?.(reply?.ok === true);
        // Báo SAU khi đã vào phòng: ảnh chụp tải sau thời điểm này không còn khoảng hở nào mà tin đẩy có thể lọt qua.
        options.onConnected?.();
      });
    };
    const onEvent = () => options.onEvent();
    const onDisconnect = () => options.onLive?.(false);
    const onConnect = () => attached && enter(attached);

    void acquire().then(
      (s) => {
        if (disposed) return;
        attached = s;
        s.on(options.event, onEvent);
        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);
        s.on('connect_error', onDisconnect);
        if (s.connected) enter(s);
      },
      () => options.onLive?.(false), // không nạp được thư viện: về hỏi lại như cũ
    );

    return () => {
      if (disposed) return;
      disposed = true;
      attached?.off(options.event, onEvent);
      attached?.off('connect', onConnect);
      attached?.off('disconnect', onDisconnect);
      attached?.off('connect_error', onDisconnect);
      release();
    };
  }

  return { subscribe };
}

export const realtime = createRealtime(async () => {
  const { io } = await import('socket.io-client');
  return io({
    path: REALTIME_PATH,
    // WebSocket trước (một lượt bắt tay), tự lùi về polling nếu mạng chặn.
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnectionDelayMax: 10_000,
  }) as unknown as SocketLike;
});
