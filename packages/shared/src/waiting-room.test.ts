import { describe, expect, it } from 'vitest';
import {
  canEnterWaitingRoom,
  WAITING_OFFLINE_MS,
  WAITING_PING_MS,
  WAITING_ROOM_WINDOW_MS,
  waitingRoomOpensAt,
  waitingStateOf,
} from './waiting-room.js';

const at = (iso: string) => new Date(iso);
const opensAt = at('2026-11-02T09:00:00Z');

describe('Phòng chờ: cửa sổ vào chờ (Q284)', () => {
  it('mở 30 phút trước giờ mở Phiên thi', () => {
    expect(WAITING_ROOM_WINDOW_MS).toBe(30 * 60_000);
    expect(waitingRoomOpensAt(opensAt).toISOString()).toBe('2026-11-02T08:30:00.000Z');
  });

  it('chỉ vào được khi Phiên thi sắp mở và đã trong cửa sổ; ranh giới đúng 30 phút vẫn vào được', () => {
    expect(canEnterWaitingRoom('upcoming', opensAt, at('2026-11-02T08:29:59.999Z'))).toBe(false);
    expect(canEnterWaitingRoom('upcoming', opensAt, at('2026-11-02T08:30:00Z'))).toBe(true);
    expect(canEnterWaitingRoom('upcoming', opensAt, at('2026-11-02T08:59:59Z'))).toBe(true);
  });

  it('Phiên thi đã mở, đã đóng hay đã Hủy thì không phải việc của Phòng chờ', () => {
    for (const phase of ['open', 'entry_closed', 'closed', 'cancelled'] as const) {
      expect(canEnterWaitingRoom(phase, opensAt, at('2026-11-02T08:45:00Z'))).toBe(false);
    }
  });
});

describe('waitingStateOf: trạng thái của người đã nhập mã nhưng chưa làm bài', () => {
  const now = at('2026-11-02T08:50:00Z');

  it('nhịp 15 giây; mất nhịp quá 45 giây là mất kết nối', () => {
    expect(WAITING_PING_MS).toBe(15_000);
    expect(WAITING_OFFLINE_MS).toBe(45_000);
  });

  it('chưa nhập mã (không có thiết bị) là none dù có nhịp cũ', () => {
    expect(waitingStateOf({ joined: false, lastSeenAt: now, now })).toBe('none');
  });

  it('đã nhập mã: nhịp mới là online; quá 45 giây hay chưa có nhịp là offline', () => {
    expect(waitingStateOf({ joined: true, lastSeenAt: at('2026-11-02T08:49:30Z'), now })).toBe(
      'online',
    );
    expect(waitingStateOf({ joined: true, lastSeenAt: at('2026-11-02T08:49:15Z'), now })).toBe(
      'online',
    ); // đúng 45 giây
    expect(waitingStateOf({ joined: true, lastSeenAt: at('2026-11-02T08:49:14.999Z'), now })).toBe(
      'offline',
    );
    expect(waitingStateOf({ joined: true, lastSeenAt: null, now })).toBe('offline');
  });
});
