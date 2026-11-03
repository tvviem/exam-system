import type { Transaction } from '../db/db.module';

/**
 * Cổng "Lượt làm bài của Phiên thi" (Q228): `session` cần biết ai đã có Lượt, đóng các Lượt khi Hủy Phiên thi và thao
 * tác thiết bị của Người ra đề, nhưng không đọc bảng của `attempt`. `attempt` cài đặt, nối ở `AttemptPortsWiringModule`.
 */
export const SESSION_ATTEMPTS = Symbol('SESSION_ATTEMPTS');

export type SubmitReason =
  | 'candidate'
  | 'timeout'
  | 'examiner'
  | 'disqualified'
  | 'account_locked'
  | 'session_cancelled';

export interface ExamDeviceSummary {
  userId: string;
  deviceId: string;
  status: 'active' | 'revoked';
  ip: string | null;
  userAgent: string | null;
  boundAt: Date;
  revokedAt: Date | null;
}

export interface ExtendTimeInput {
  sessionId: string;
  /** Các Lượt được chọn; `null` là mọi Lượt đang làm của Phiên thi. */
  attemptIds: string[] | null;
  minutes: number;
  reason: string;
  /** Mã lô do giao diện sinh: gửi lại cùng mã thì không cộng lần nữa (Q262). */
  batchId: string;
  by: string;
  now: Date;
}

export interface ExtendTimeResult {
  /** Số Lượt đã được cộng giờ. */
  extended: number;
  /** Số Lượt được chọn nhưng đã nộp nên bị bỏ qua. */
  skipped: number;
  /** Mã lô này đã được xử lý trước đó; lần này không đổi gì (và `skipped` của lần đầu không được giữ lại). */
  replayed: boolean;
  /** Id các Lượt vừa được cộng giờ, cho nhật ký thao tác. */
  attemptIds: string[];
}

export interface ForceSubmitInput {
  sessionId: string;
  /** Các Lượt được chọn; `null` là mọi Lượt đang làm của Phiên thi. */
  attemptIds: string[] | null;
  now: Date;
}

export interface ForceSubmitResult {
  closed: number;
  /** Số Lượt được chọn nhưng đã nộp từ trước. */
  skipped: number;
  /** Id các Lượt vừa bị nộp, cho nhật ký thao tác. */
  closedIds: string[];
}

export interface ViolationInput {
  sessionId: string;
  attemptId: string;
  action: 'warning' | 'disqualify';
  reason: string;
  by: string;
  now: Date;
}

/** Lượt mới nhất của một người trong Phiên thi, kèm số liệu cho màn Theo dõi (PR 4d). */
export interface MonitorAttempt {
  attemptId: string;
  attemptNo: number;
  status: 'in_progress' | 'submitted';
  submitReason: SubmitReason | null;
  startedAt: Date;
  deadline: Date;
  submittedAt: Date | null;
  /** Số câu đã trả lời (bỏ trả lời và trả lời rỗng không tính). */
  answered: number;
  /** Số lần rời màn hình làm bài. */
  hiddenCount: number;
  /** Số lần bị Cảnh cáo. */
  warnings: number;
  /** Lần gần nhất báo còn làm bài; `null` nếu chưa có nhịp nào. */
  lastSeenAt: Date | null;
}

export interface SessionAttempts {
  /** Phiên thi đã có Lượt làm bài nào chưa (kể cả đã nộp). */
  hasAttempts(sessionId: string, executor?: Transaction): Promise<boolean>;
  /** Số Lượt của từng người trong Phiên thi (người chưa có Lượt vắng). */
  attemptCounts(sessionId: string): Promise<Map<string, number>>;
  /** Nộp mọi Lượt đang làm của Phiên thi với `reason`; trả số Lượt đã đóng. */
  closeAll(tx: Transaction, sessionId: string, reason: SubmitReason): Promise<number>;
  /** Thiết bị của từng người trong Phiên thi (người chưa gắn thiết bị vắng). */
  devicesOf(sessionId: string): Promise<Map<string, ExamDeviceSummary[]>>;
  /** Thu hồi thiết bị đang gắn của người này. Trả `false` nếu người này chưa có thiết bị đang gắn. */
  revokeDevice(
    tx: Transaction,
    input: { sessionId: string; userId: string; by: string; reason: string | null; now: Date },
  ): Promise<boolean>;
  /** Cho thiết bị đã thu hồi vào lại (thu hồi thiết bị đang gắn khác nếu có). Trả `false` nếu không có dòng đó. */
  pardonDevice(
    tx: Transaction,
    input: { sessionId: string; userId: string; deviceId: string; by: string; now: Date },
  ): Promise<boolean>;
  /**
   * Cộng giờ (Q254, Q256, Q262): kéo dài hạn các Lượt đang làm và ghi nhật ký, một dòng mỗi Lượt. Ném `NOT_FOUND` nếu một
   * Lượt được chọn không thuộc Phiên thi, `INVALID_STATE` (`EXTENSION_LIMIT`) nếu có Lượt vượt trần tổng giờ cộng thêm.
   */
  extendTime(tx: Transaction, input: ExtendTimeInput): Promise<ExtendTimeResult>;
  /**
   * Buộc nộp (Q254): nộp các Lượt đang làm được chọn với lý do `examiner`, giữ Câu trả lời. Ném `NOT_FOUND` nếu một Lượt
   * được chọn không thuộc Phiên thi. Làm lại không đổi gì thêm.
   */
  forceSubmit(tx: Transaction, input: ForceSubmitInput): Promise<ForceSubmitResult>;
  /**
   * Ghi Vi phạm của một Lượt đang làm (Q259); Đình chỉ nộp Lượt ngay với lý do `disqualified`. Ném `NOT_FOUND` nếu Lượt
   * không thuộc Phiên thi, `INVALID_STATE` (`ATTEMPT_CLOSED`) nếu Lượt đã nộp. Trả id Vi phạm và người bị ghi.
   */
  recordViolation(tx: Transaction, input: ViolationInput): Promise<{ id: string; userId: string }>;
  /** Lượt mới nhất của từng người trong Phiên thi và tổng số câu của Bộ đề (màn Theo dõi). */
  monitorAttempts(
    sessionId: string,
    examId: string,
  ): Promise<{ totalItems: number; byUser: Map<string, MonitorAttempt> }>;
}
