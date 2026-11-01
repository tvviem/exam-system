import type { SessionPhase } from '@exam/shared';

/** Màu nhãn trạng thái của Phiên thi (Q202). */
export const PHASE_TONE = {
  upcoming: 'primary',
  open: 'success',
  entry_closed: 'warning',
  closed: 'neutral',
  cancelled: 'danger',
} as const satisfies Record<SessionPhase, string>;
