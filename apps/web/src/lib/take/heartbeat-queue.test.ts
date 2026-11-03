import { describe, expect, it } from 'vitest';
import {
  ackBeat,
  emptyBeats,
  type HeartbeatReply,
  MAX_PENDING_EVENTS,
  type Notice,
  nextBeat,
  recordEvent,
} from './heartbeat-queue';

const reply = (over: Partial<HeartbeatReply> = {}): HeartbeatReply => ({
  status: 'in_progress',
  deadline: '2026-12-01T01:55:00.000Z',
  serverNow: '2026-12-01T01:10:00.000Z',
  cursor: '2026-12-01T01:09:55.000Z',
  deviceOk: true,
  notices: [],
  ...over,
});
const extended = (id: string): Notice => ({
  id,
  kind: 'time_extended',
  minutes: 15,
  reason: 'Mất điện',
  at: '2026-12-01T01:09:00.000Z',
});

describe('hàng đợi heartbeat (Q213, Q257)', () => {
  it('nhịp đầu mang mốc since là giờ server của lúc mở Lượt và chưa có sự kiện nào', () => {
    const { body } = nextBeat(emptyBeats('2026-12-01T01:00:00.000Z'));
    expect(body).toEqual({ events: [], since: '2026-12-01T01:00:00.000Z' });
  });

  it('ghi sự kiện theo thứ tự và gửi tối đa 20 sự kiện cũ nhất một nhịp', () => {
    let state = emptyBeats('t0');
    for (let i = 0; i < 25; i++) state = recordEvent(state, 'tab_hidden', `e${i}`);
    const { body, sentIds } = nextBeat(state);
    expect(body.events.map((e) => e.id)).toEqual(Array.from({ length: 20 }, (_, i) => `e${i}`));
    expect(sentIds).toEqual(body.events.map((e) => e.id));
  });

  it('gửi thành công thì bỏ đúng những sự kiện đã gửi, sự kiện ghi trong lúc gửi vẫn còn', () => {
    let state = recordEvent(emptyBeats('t0'), 'tab_hidden', 'a');
    const { sentIds } = nextBeat(state);
    state = recordEvent(state, 'tab_visible', 'b'); // xảy ra khi nhịp đang bay
    const acked = ackBeat(state, sentIds, reply());
    expect(acked.state.pending.map((e) => e.id)).toEqual(['b']);
  });

  it('gửi lỗi (không gọi ackBeat) thì giữ nguyên sự kiện để gửi lại cùng mã', () => {
    const state = recordEvent(emptyBeats('t0'), 'went_offline', 'a');
    const first = nextBeat(state);
    const again = nextBeat(state);
    expect(again.body).toEqual(first.body);
  });

  it('mất mạng lâu không làm hàng đợi phình vô hạn: giữ các sự kiện mới nhất', () => {
    let state = emptyBeats('t0');
    for (let i = 0; i < MAX_PENDING_EVENTS + 10; i++)
      state = recordEvent(state, 'tab_hidden', `e${i}`);
    expect(state.pending).toHaveLength(MAX_PENDING_EVENTS);
    expect(state.pending[0]?.id).toBe('e10');
  });

  it('cập nhật mốc cursor cho nhịp sau', () => {
    const { state } = ackBeat(emptyBeats('t0'), [], reply({ cursor: 'c1' }));
    expect(nextBeat(state).body.since).toBe('c1');
  });

  it('thông báo chỉ hiện một lần dù server lặp lại ở các nhịp liền nhau (khoảng chồng 5 giây)', () => {
    const first = ackBeat(emptyBeats('t0'), [], reply({ notices: [extended('n1')] }));
    expect(first.fresh.map((n) => n.id)).toEqual(['n1']);
    const second = ackBeat(first.state, [], reply({ notices: [extended('n1'), extended('n2')] }));
    expect(second.fresh.map((n) => n.id)).toEqual(['n2']);
    const third = ackBeat(second.state, [], reply({ notices: [extended('n2')] }));
    expect(third.fresh).toEqual([]);
  });

  it('nhịp trả về đã nộp hoặc thiết bị không hợp lệ không đổi hàng đợi sự kiện', () => {
    const state = recordEvent(emptyBeats('t0'), 'tab_hidden', 'a');
    const { sentIds } = nextBeat(state);
    expect(ackBeat(state, sentIds, reply({ deviceOk: false })).state.pending).toEqual([]);
  });
});
