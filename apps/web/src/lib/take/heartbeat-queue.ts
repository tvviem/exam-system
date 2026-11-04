// Hàng đợi heartbeat phía trình duyệt (Q213, Q257): gom sự kiện rời màn hình, mất mạng để gửi theo nhịp 15 giây, giữ
// mốc `since` cho thông báo mới và bỏ trùng thông báo (server cho hai nhịp liền nhau chồng lên nhau 5 giây).

export type HeartbeatEventType = 'tab_hidden' | 'tab_visible' | 'went_offline' | 'back_online';

export interface HeartbeatEvent {
  /** Mã UUID do trình duyệt sinh: server bỏ trùng khi một nhịp bị gửi lại. */
  id: string;
  type: HeartbeatEventType;
}

export type Notice =
  | { id: string; kind: 'time_extended'; minutes: number; reason: string; at: string }
  | { id: string; kind: 'warning'; reason: string; at: string };

export interface HeartbeatReply {
  status: 'in_progress' | 'submitted';
  /** Chỉ có khi còn đang làm. */
  deadline?: string;
  serverNow: string;
  cursor: string;
  deviceOk: boolean;
  notices: Notice[];
  submitReason?: string | null;
}

export interface HeartbeatBody {
  events: HeartbeatEvent[];
  since: string;
}

export interface HeartbeatState {
  pending: HeartbeatEvent[];
  cursor: string;
  /** Mã các thông báo đã hiện, giữ vài chục mã gần nhất. */
  shown: string[];
}

/** Server nhận tối đa 20 sự kiện một nhịp. */
export const BATCH_SIZE = 20;
/** Mất mạng lâu thì giữ các sự kiện mới nhất, không để hàng đợi phình vô hạn. */
export const MAX_PENDING_EVENTS = 100;
const MAX_SHOWN = 50;

export const emptyBeats = (cursor: string): HeartbeatState => ({ pending: [], cursor, shown: [] });

export function recordEvent(
  state: HeartbeatState,
  type: HeartbeatEventType,
  id: string,
): HeartbeatState {
  return { ...state, pending: [...state.pending, { id, type }].slice(-MAX_PENDING_EVENTS) };
}

/** Nội dung nhịp kế tiếp và mã các sự kiện đi kèm (để `ackBeat` bỏ đúng chúng khi gửi thành công). */
export function nextBeat(state: HeartbeatState): { body: HeartbeatBody; sentIds: string[] } {
  const events = state.pending.slice(0, BATCH_SIZE);
  return { body: { events, since: state.cursor }, sentIds: events.map((event) => event.id) };
}

/** Nhịp gửi thành công: bỏ các sự kiện đã gửi, nhận mốc mới và trả các thông báo chưa hiện. */
export function ackBeat(
  state: HeartbeatState,
  sentIds: string[],
  reply: HeartbeatReply,
): { state: HeartbeatState; fresh: Notice[] } {
  const sent = new Set(sentIds);
  const seen = new Set(state.shown);
  const fresh = reply.notices.filter((notice) => !seen.has(notice.id));
  return {
    fresh,
    state: {
      pending: state.pending.filter((event) => !sent.has(event.id)),
      cursor: reply.cursor,
      shown: [...state.shown, ...fresh.map((notice) => notice.id)].slice(-MAX_SHOWN),
    },
  };
}
