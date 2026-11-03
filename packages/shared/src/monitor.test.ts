import { describe, expect, it } from 'vitest';
import {
  type AttentionInput,
  attentionReasonsOf,
  deviceStateOf,
  extendTimeSchema,
  extensionScopeOf,
  extensionWithinCap,
  forceSubmitSchema,
  HEARTBEAT_EVENTS_MAX,
  heartbeatSchema,
  isDisconnected,
  monitorStateOf,
  violationSchema,
} from './monitor.js';

const at = (iso: string) => new Date(iso);

// Một Lượt đang làm bình thường: bắt đầu 01:00, hạn 01:45, bây giờ 01:10 (chưa đến 25% thời gian), vừa có heartbeat.
const calm: AttentionInput = {
  inProgress: true,
  startedAt: at('2026-12-01T01:00:00Z'),
  deadline: at('2026-12-01T01:45:00Z'),
  now: at('2026-12-01T01:10:00Z'),
  lastSeenAt: at('2026-12-01T01:09:55Z'),
  hiddenCount: 0,
  device: 'ok',
  answeredFraction: 0,
};

describe('attentionReasonsOf: dấu hiệu Cần chú ý (Q252, Q261)', () => {
  it('Lượt làm bình thường thì không có dấu hiệu nào', () => {
    expect(attentionReasonsOf(calm)).toEqual([]);
  });

  it('mất kết nối khi quá 45 giây không có heartbeat; đúng 45 giây thì chưa', () => {
    expect(attentionReasonsOf({ ...calm, lastSeenAt: at('2026-12-01T01:09:15Z') })).toEqual([]);
    expect(attentionReasonsOf({ ...calm, lastSeenAt: at('2026-12-01T01:09:14.999Z') })).toEqual([
      'disconnected',
    ]);
  });

  it('chưa có heartbeat nào thì tính từ lúc bắt đầu, không báo mất kết nối ngay khi vừa vào', () => {
    const justStarted = { ...calm, lastSeenAt: null, now: at('2026-12-01T01:00:20Z') };
    expect(attentionReasonsOf(justStarted)).toEqual([]);
    expect(attentionReasonsOf({ ...justStarted, now: at('2026-12-01T01:00:46Z') })).toEqual([
      'disconnected',
    ]);
  });

  it('rời màn hình từ 3 lần trở lên thì báo; 2 lần thì chưa', () => {
    expect(attentionReasonsOf({ ...calm, hiddenCount: 2 })).toEqual([]);
    expect(attentionReasonsOf({ ...calm, hiddenCount: 3 })).toEqual(['hidden']);
  });

  it('thiết bị mới hoặc bị Thu hồi thì báo; thiết bị bình thường thì không', () => {
    expect(attentionReasonsOf({ ...calm, device: 'new' })).toEqual(['device']);
    expect(attentionReasonsOf({ ...calm, device: 'revoked' })).toEqual(['device']);
    expect(attentionReasonsOf({ ...calm, device: 'none' })).toEqual([]);
  });

  it('làm chậm: qua 25% thời gian mà tỉ lệ đã trả lời thấp hơn tỉ lệ thời gian trôi quá 30 điểm phần trăm', () => {
    // Hạn 45 phút. Qua 30 phút = 66,7% thời gian; ngưỡng là 36,7% câu đã trả lời.
    const late = {
      ...calm,
      now: at('2026-12-01T01:30:00Z'),
      lastSeenAt: at('2026-12-01T01:29:55Z'),
    };
    expect(attentionReasonsOf({ ...late, answeredFraction: 0.36 })).toEqual(['slow']);
    expect(attentionReasonsOf({ ...late, answeredFraction: 0.37 })).toEqual([]);
  });

  it('chưa qua 25% thời gian thì chưa xét làm chậm dù chưa trả lời câu nào', () => {
    // 11 phút / 45 phút = 24,4%.
    const early = {
      ...calm,
      now: at('2026-12-01T01:11:00Z'),
      lastSeenAt: at('2026-12-01T01:10:55Z'),
    };
    expect(attentionReasonsOf({ ...early, answeredFraction: 0 })).toEqual([]);
  });

  it('Cộng giờ làm hạn dài ra nên cùng tiến độ thì bớt bị coi là chậm', () => {
    const late = {
      ...calm,
      now: at('2026-12-01T01:30:00Z'),
      lastSeenAt: at('2026-12-01T01:29:55Z'),
      answeredFraction: 0.36,
    };
    expect(attentionReasonsOf(late)).toEqual(['slow']);
    // Cộng 45 phút: 30 / 90 = 33,3% thời gian, ngưỡng chỉ còn 3,3% câu đã trả lời.
    expect(attentionReasonsOf({ ...late, deadline: at('2026-12-01T02:30:00Z') })).toEqual([]);
  });

  it('Lượt không còn đang làm thì không có dấu hiệu nào', () => {
    const done = { ...calm, inProgress: false, hiddenCount: 5, device: 'revoked' as const };
    expect(attentionReasonsOf({ ...done, lastSeenAt: at('2026-12-01T00:00:00Z') })).toEqual([]);
  });

  it('nhiều dấu hiệu cùng lúc được trả theo thứ tự cố định', () => {
    const all = {
      ...calm,
      now: at('2026-12-01T01:30:00Z'),
      lastSeenAt: at('2026-12-01T01:00:00Z'),
      hiddenCount: 4,
      device: 'new' as const,
    };
    expect(attentionReasonsOf(all)).toEqual(['disconnected', 'hidden', 'device', 'slow']);
  });
});

const batchId = '6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const attemptId = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';

describe('extendTimeSchema: yêu cầu Cộng giờ (Q254, Q256, Q262)', () => {
  const one = { attemptIds: [attemptId], minutes: 15, reason: 'Mất điện', batchId };

  it('nhận một Lượt, một nhóm hoặc cả phòng', () => {
    expect(extendTimeSchema.safeParse(one).success).toBe(true);
    expect(extendTimeSchema.safeParse({ ...one, attemptIds: [attemptId, batchId] }).success).toBe(
      true,
    );
    expect(
      extendTimeSchema.safeParse({ scope: 'all', minutes: 15, reason: 'Mất mạng', batchId })
        .success,
    ).toBe(true);
  });

  it('phải chọn đúng một cách: danh sách Lượt hoặc cả phòng, không cả hai, không thiếu', () => {
    const { attemptIds: _drop, ...none } = one;
    expect(extendTimeSchema.safeParse(none).success).toBe(false);
    expect(extendTimeSchema.safeParse({ ...one, scope: 'all' }).success).toBe(false);
    expect(extendTimeSchema.safeParse({ ...one, attemptIds: [] }).success).toBe(false);
  });

  it('số phút nguyên từ 1 đến 180', () => {
    for (const minutes of [0, -5, 181, 7.5]) {
      expect(extendTimeSchema.safeParse({ ...one, minutes }).success).toBe(false);
    }
    for (const minutes of [1, 180]) {
      expect(extendTimeSchema.safeParse({ ...one, minutes }).success).toBe(true);
    }
  });

  it('lý do bắt buộc, cắt khoảng trắng hai đầu, tối đa 200 ký tự', () => {
    expect(extendTimeSchema.safeParse({ ...one, reason: '   ' }).success).toBe(false);
    expect(extendTimeSchema.safeParse({ ...one, reason: 'x'.repeat(201) }).success).toBe(false);
    expect(extendTimeSchema.parse({ ...one, reason: '  Mất điện  ' }).reason).toBe('Mất điện');
  });

  it('mã lô phải là UUID', () => {
    expect(extendTimeSchema.safeParse({ ...one, batchId: 'abc' }).success).toBe(false);
  });
});

describe('extensionWithinCap (Q256)', () => {
  it('tổng phần cộng thêm của một Lượt không quá 600 phút', () => {
    expect(extensionWithinCap(585, 15)).toBe(true);
    expect(extensionWithinCap(586, 15)).toBe(false);
    expect(extensionWithinCap(600, 1)).toBe(false);
  });
});

describe('violationSchema: Cảnh cáo và Đình chỉ (Q259)', () => {
  it('nhận hai hành động, bắt buộc lý do, tối đa 500 ký tự', () => {
    expect(violationSchema.safeParse({ action: 'warning', reason: 'Nhìn bài bạn' }).success).toBe(
      true,
    );
    expect(
      violationSchema.safeParse({ action: 'disqualify', reason: 'Dùng tài liệu' }).success,
    ).toBe(true);
    expect(violationSchema.safeParse({ action: 'warning', reason: '' }).success).toBe(false);
    expect(violationSchema.safeParse({ action: 'warning', reason: 'x'.repeat(501) }).success).toBe(
      false,
    );
    expect(violationSchema.safeParse({ action: 'ban', reason: 'x' }).success).toBe(false);
  });
});

describe('extensionScopeOf: phạm vi ghi vào nhật ký Cộng giờ (Q254)', () => {
  it('một Lượt là one, nhiều Lượt là group, cả phòng là all', () => {
    expect(extensionScopeOf(['a'])).toBe('one');
    expect(extensionScopeOf(['a', 'b'])).toBe('group');
    expect(extensionScopeOf(null)).toBe('all');
  });
});

describe('forceSubmitSchema: yêu cầu Buộc nộp (Q254)', () => {
  it('nhận một Lượt, một nhóm hoặc cả phòng; phải chọn đúng một cách', () => {
    expect(forceSubmitSchema.safeParse({ attemptIds: [attemptId] }).success).toBe(true);
    expect(forceSubmitSchema.safeParse({ scope: 'all' }).success).toBe(true);
    expect(forceSubmitSchema.safeParse({}).success).toBe(false);
    expect(forceSubmitSchema.safeParse({ attemptIds: [attemptId], scope: 'all' }).success).toBe(
      false,
    );
    expect(forceSubmitSchema.safeParse({ attemptIds: [] }).success).toBe(false);
    expect(forceSubmitSchema.safeParse({ attemptIds: ['abc'] }).success).toBe(false);
  });
});

describe('heartbeatSchema: nhịp báo còn làm bài (Q213)', () => {
  const event = { id: batchId, type: 'tab_hidden' };

  it('nhận danh sách sự kiện rỗng hoặc thiếu, và mốc since tùy chọn', () => {
    expect(heartbeatSchema.parse({})).toEqual({ events: [] });
    expect(
      heartbeatSchema.safeParse({ events: [event], since: '2026-12-01T01:10:00.000Z' }).success,
    ).toBe(true);
  });

  it('sự kiện có mã UUID và một trong bốn loại', () => {
    for (const type of ['tab_hidden', 'tab_visible', 'went_offline', 'back_online']) {
      expect(heartbeatSchema.safeParse({ events: [{ id: attemptId, type }] }).success).toBe(true);
    }
    expect(
      heartbeatSchema.safeParse({ events: [{ id: attemptId, type: 'device_rejected' }] }).success,
    ).toBe(false);
    expect(heartbeatSchema.safeParse({ events: [{ id: 'abc', type: 'tab_hidden' }] }).success).toBe(
      false,
    );
  });

  it('tối đa 20 sự kiện một nhịp; since phải là giờ hợp lệ', () => {
    const many = Array.from({ length: HEARTBEAT_EVENTS_MAX + 1 }, () => event);
    expect(HEARTBEAT_EVENTS_MAX).toBe(20);
    expect(heartbeatSchema.safeParse({ events: many }).success).toBe(false);
    expect(heartbeatSchema.safeParse({ since: 'hôm qua' }).success).toBe(false);
  });
});

describe('isDisconnected (Q261)', () => {
  const started = at('2026-12-01T01:00:00Z');

  it('quá 45 giây kể từ nhịp cuối thì mất kết nối; chưa có nhịp thì tính từ lúc bắt đầu', () => {
    expect(isDisconnected(at('2026-12-01T01:09:15Z'), started, at('2026-12-01T01:10:00Z'))).toBe(
      false,
    );
    expect(isDisconnected(at('2026-12-01T01:09:14Z'), started, at('2026-12-01T01:10:00Z'))).toBe(
      true,
    );
    expect(isDisconnected(null, started, at('2026-12-01T01:00:45Z'))).toBe(false);
    expect(isDisconnected(null, started, at('2026-12-01T01:00:46Z'))).toBe(true);
  });
});

describe('deviceStateOf: thiết bị của một người so với Lượt (Q252)', () => {
  const startedAt = at('2026-12-01T01:10:00Z');
  const active = (boundAt: string) => ({ status: 'active' as const, boundAt: at(boundAt) });
  const revoked = (boundAt: string) => ({ status: 'revoked' as const, boundAt: at(boundAt) });

  it('chưa có thiết bị nào thì none', () => {
    expect(deviceStateOf([], startedAt)).toBe('none');
  });

  it('thiết bị gắn trước khi bắt đầu thì ok', () => {
    expect(deviceStateOf([active('2026-12-01T01:05:00Z')], startedAt)).toBe('ok');
    expect(deviceStateOf([active('2026-12-01T01:05:00Z')], null)).toBe('ok');
  });

  it('chỉ còn thiết bị đã Thu hồi thì revoked', () => {
    expect(deviceStateOf([revoked('2026-12-01T01:05:00Z')], startedAt)).toBe('revoked');
  });

  it('thiết bị đang gắn mà gắn sau khi bắt đầu (sau Thu hồi) thì new', () => {
    const list = [revoked('2026-12-01T01:05:00Z'), active('2026-12-01T01:30:00Z')];
    expect(deviceStateOf(list, startedAt)).toBe('new');
  });
});

describe('monitorStateOf: trạng thái một người trên màn Theo dõi (Q252)', () => {
  const started = at('2026-12-01T01:00:00Z');
  const now = at('2026-12-01T01:10:00Z');
  const working = {
    status: 'in_progress' as const,
    submitReason: null,
    startedAt: started,
    lastSeenAt: at('2026-12-01T01:09:55Z'),
  };

  it('chưa có Lượt thì chưa vào', () => {
    expect(monitorStateOf(null, now)).toBe('not_started');
  });

  it('đang làm: còn nhịp là working, quá 45 giây không nhịp là disconnected', () => {
    expect(monitorStateOf(working, now)).toBe('working');
    expect(monitorStateOf({ ...working, lastSeenAt: at('2026-12-01T01:09:00Z') }, now)).toBe(
      'disconnected',
    );
  });

  it('đã nộp: nộp bình thường hay bị Buộc nộp là submitted, bị Đình chỉ là suspended', () => {
    for (const submitReason of [
      'candidate',
      'timeout',
      'examiner',
      'account_locked',
      'session_cancelled',
    ]) {
      expect(monitorStateOf({ ...working, status: 'submitted', submitReason }, now)).toBe(
        'submitted',
      );
    }
    expect(
      monitorStateOf({ ...working, status: 'submitted', submitReason: 'disqualified' }, now),
    ).toBe('suspended');
  });
});
