import type { Transaction } from '../db/db.module';

/**
 * Cổng "người dùng bị vô hiệu hóa" (Q218): `identity` báo Khóa đăng nhập hoặc Xóa người dùng cho những bên cần xử lý
 * việc đang dở (nộp Lượt làm bài đang làm), nhưng không import `attempt`. `attempt` cài đặt, nối ở
 * `AttemptPortsWiringModule`. Chạy trong giao dịch của `identity` nên hoặc cả hai cùng xảy ra, hoặc không.
 */
export const USER_DEACTIVATION_HOOKS = Symbol('USER_DEACTIVATION_HOOKS');

export interface UserDeactivationHooks {
  onDeactivated(tx: Transaction, userId: string): Promise<void>;
}
