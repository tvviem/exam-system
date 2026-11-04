/**
 * Cổng "ai được vào phòng nào" của kênh đẩy: `realtime` hỏi, `session` và `attempt` trả lời, nên cổng Socket.IO không đọc
 * bảng của hai module đó.
 */
export const REALTIME_ACCESS = Symbol('REALTIME_ACCESS');

export interface RealtimeAccess {
  /** Người này là chủ của Phiên thi (được xem màn Theo dõi). */
  canMonitor(userId: string, sessionId: string): Promise<boolean>;
  /** Lượt này của chính người này, đang làm bài, và `deviceKey` là thiết bị đang gắn (ADR-0007). */
  canFollow(userId: string, attemptId: string, deviceKey: string | undefined): Promise<boolean>;
}
