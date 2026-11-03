/**
 * Cổng "ảnh cho Người dự thi" (Q219): `question-bank` phục vụ file ảnh nhưng không biết Lượt làm bài; nó hỏi cổng này
 * người dùng có được xem ảnh không. `attempt` cài đặt, nối ở `AttemptPortsWiringModule`.
 */
export const CANDIDATE_MEDIA = Symbol('CANDIDATE_MEDIA');

export interface CandidateMedia {
  /**
   * Được xem khi Lượt `attemptId` là của người này, đang làm (chưa quá hạn cộng ân hạn), đúng thiết bị đã gắn, và ảnh
   * nằm trong Bộ đề của Phiên thi.
   */
  canView(
    userId: string,
    deviceKey: string | undefined,
    attemptId: string,
    illustrationId: string,
  ): Promise<boolean>;
  /** Xem thử (Q245): chủ Phiên thi xem được ảnh nằm trong Bộ đề của Phiên thi đó, ở mọi trạng thái của Phiên thi. */
  canPreview(userId: string, sessionId: string, illustrationId: string): Promise<boolean>;
}
