/**
 * Cổng "báo cho kênh đẩy" (PR 4d-3): các module nghiệp vụ báo có thay đổi, không biết gì về Socket.IO. Cài đặt đẩy qua
 * Redis nên cả api lẫn worker báo được. Gọi **sau khi giao dịch đã xác nhận** (nếu không trình duyệt hỏi lại sẽ thấy dữ
 * liệu cũ). Không bao giờ ném lỗi và không chờ: Redis hỏng thì chỉ mất tin đẩy, hệ thống vẫn đúng nhờ heartbeat và hỏi
 * lại (ADR-0002).
 */
export const REALTIME_NOTIFIER = Symbol('REALTIME_NOTIFIER');

export interface RealtimeNotifier {
  /** Phiên thi có thay đổi: báo màn Theo dõi của Người ra đề (gộp tối đa một tin mỗi 2 giây). */
  sessionChanged(sessionId: string): void;
  /** Các Lượt vừa bị tác động (Cộng giờ, Buộc nộp, Cảnh cáo, Thu hồi): báo Người dự thi gửi heartbeat ngay. */
  attemptNudge(attemptIds: readonly string[]): void;
  /** Một thao tác của Người ra đề tác động tới các Lượt này: báo Người dự thi và cả màn Theo dõi của Phiên thi. */
  affected(sessionId: string, attemptIds: readonly string[]): void;
}
