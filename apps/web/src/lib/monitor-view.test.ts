import { describe, expect, it } from 'vitest';
import {
  countsOf,
  defaultViewFor,
  foldText,
  type MonitorPerson,
  matchesFilter,
  remainingSecondsAt,
} from './monitor-view';

const person = (over: Partial<MonitorPerson> = {}): MonitorPerson => ({
  userId: 'u1',
  code: 'SV001',
  fullName: 'Nguyễn Văn An',
  classLabel: 'K65-A',
  state: 'working',
  attemptId: 'a1',
  attemptNo: 1,
  startedAt: '2026-12-01T01:00:00.000Z',
  deadline: '2026-12-01T01:45:00.000Z',
  submittedAt: null,
  submitReason: null,
  undoUntil: null,
  answered: 5,
  hiddenCount: 0,
  warnings: 0,
  device: 'ok',
  revokedDeviceId: null,
  reasons: [],
  ...over,
});

describe('chế độ xem mặc định theo số người (Q253)', () => {
  it('đến 30 người là Thẻ, đến 150 là Bảng, trên đó là Lưới', () => {
    expect([0, 30].map(defaultViewFor)).toEqual(['cards', 'cards']);
    expect([31, 150].map(defaultViewFor)).toEqual(['table', 'table']);
    expect([151, 500].map(defaultViewFor)).toEqual(['grid', 'grid']);
  });
});

describe('giờ còn lại tính từ giờ server và thời gian đã trôi trên máy (Q242)', () => {
  const deadline = '2026-12-01T01:45:00.000Z';
  const serverNow = '2026-12-01T01:40:00.000Z';

  it('trừ đi thời gian đã trôi kể từ lúc nhận ảnh chụp', () => {
    expect(remainingSecondsAt(deadline, serverNow, 0)).toBe(300);
    expect(remainingSecondsAt(deadline, serverNow, 61_000)).toBe(239);
  });

  it('không âm; chưa có hạn thì null', () => {
    expect(remainingSecondsAt(deadline, serverNow, 10 * 60_000)).toBe(0);
    expect(remainingSecondsAt(null, serverNow, 0)).toBeNull();
  });
});

describe('bộ lọc và đếm', () => {
  const people = [
    person({ userId: '1' }),
    person({ userId: '2', state: 'disconnected', reasons: ['disconnected'] }),
    person({ userId: '3', state: 'submitted', reasons: [] }),
    person({ userId: '4', state: 'not_started', attemptId: null }),
    person({ userId: '5', state: 'suspended', warnings: 1 }),
    person({ userId: '6', warnings: 2 }),
  ];

  it('đếm theo trạng thái; Vi phạm gồm người bị Cảnh cáo hoặc Đình chỉ', () => {
    expect(countsOf(people)).toEqual({
      working: 2,
      submitted: 1,
      disconnected: 1,
      not_started: 1,
      violations: 2,
    });
  });

  it('Cần chú ý chỉ tính người đang làm có dấu hiệu', () => {
    const attention = people.filter((p) => matchesFilter(p, 'attention'));
    expect(attention.map((p) => p.userId)).toEqual(['2']);
    expect(matchesFilter(person({ state: 'submitted', reasons: ['hidden'] }), 'attention')).toBe(
      false,
    );
  });

  it('lọc theo từng ô trạng thái', () => {
    expect(people.filter((p) => matchesFilter(p, 'violations')).map((p) => p.userId)).toEqual([
      '5',
      '6',
    ]);
    expect(people.filter((p) => matchesFilter(p, 'not_started')).map((p) => p.userId)).toEqual([
      '4',
    ]);
  });
});

describe('foldText: tìm không phân biệt dấu và hoa thường', () => {
  it('bỏ dấu, đổi đ thành d', () => {
    expect(foldText('Đặng Thị Nguyệt')).toBe('dang thi nguyet');
    expect(foldText('SV001')).toBe('sv001');
  });
});
