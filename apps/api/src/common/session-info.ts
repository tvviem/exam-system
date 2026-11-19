/**
 * Cổng "thông tin Phiên thi để xuất đề" (docs/plan/xuat-bo-de-thiet-ke.md mục 6): `paper` cần biết chủ, Bộ đề và thời gian của một
 * Phiên thi mà không đọc bảng của `session`. `session` cài đặt, nối ở `PaperPortsWiringModule`.
 */
export const SESSION_INFO = Symbol('SESSION_INFO');

export interface SessionPaperInfo {
  sessionId: string;
  examId: string;
  ownerId: string;
  opensAt: Date;
  closesAt: Date;
  durationMinutes: number;
}

export interface SessionInfoProvider {
  /** Phiên thi này (của bất kỳ chủ nào), hoặc `null` nếu không có. */
  info(sessionId: string): Promise<SessionPaperInfo | null>;
}
