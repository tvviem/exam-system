import type { SessionPhase } from '@exam/shared';

/** Nhãn thêm khi kết quả đã Công bố hoặc Chốt (Q299): thay cho nhãn trạng thái thời gian vì đó là thông tin chính lúc này. */
export const releaseLabelKey = (session: { resultReleased: boolean; resultFinalized: boolean }) =>
  session.resultFinalized
    ? 'session.phase.finalized'
    : session.resultReleased
      ? 'session.phase.released'
      : null;

/** Màu nhãn trạng thái của Phiên thi (Q202). */
export const PHASE_TONE = {
  upcoming: 'primary',
  open: 'success',
  entry_closed: 'warning',
  closed: 'neutral',
  cancelled: 'danger',
} as const satisfies Record<SessionPhase, string>;
