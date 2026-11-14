/** Người thực hiện thao tác hỗ trợ (Gửi lại, Sửa email, Liên kết hỗ trợ). */
export interface SupportActor {
  id: string;
  isAdmin: boolean;
  roleTags: readonly string[];
}

/** Tài khoản được hỗ trợ. `pending`: Chờ kích hoạt (chưa có mật khẩu). */
export interface SupportTarget {
  isAdmin: boolean;
  removed: boolean;
  locked: boolean;
  pending: boolean;
}

/** Quan hệ giữa Người ra đề và tài khoản (Q384): người tạo Yêu cầu đã tạo tài khoản, hoặc có người đó trong Danh sách dự thi. */
export interface SupportRelation {
  createdByActor: boolean;
  inActiveRosterOfActor: boolean;
}

export type SupportDenial =
  | 'target_removed'
  | 'target_locked'
  | 'not_pending'
  | 'target_admin'
  | 'no_relation'
  | 'not_allowed_role';

export type SupportDecision = { allowed: true } | { allowed: false; reason: SupportDenial };

/**
 * Ai được hỗ trợ kích hoạt cho ai (ADR-0009 Q374, Q377, Q384). Hàm thuần để kiểm bằng bảng kịch bản:
 * - không ai hỗ trợ tài khoản đã Xóa hoặc Bị Khóa;
 * - Quản trị viên hỗ trợ mọi tài khoản còn lại;
 * - Người ra đề chỉ hỗ trợ tài khoản Chờ kích hoạt (không phải Quản trị viên) mà mình có quan hệ.
 */
export function canSupport(
  actor: SupportActor,
  target: SupportTarget,
  relation: SupportRelation,
): SupportDecision {
  if (target.removed) return { allowed: false, reason: 'target_removed' };
  if (target.locked) return { allowed: false, reason: 'target_locked' };
  if (actor.isAdmin) return { allowed: true };
  if (!actor.roleTags.includes('examiner')) return { allowed: false, reason: 'not_allowed_role' };
  if (target.isAdmin) return { allowed: false, reason: 'target_admin' };
  if (!target.pending) return { allowed: false, reason: 'not_pending' };
  if (!relation.createdByActor && !relation.inActiveRosterOfActor) {
    return { allowed: false, reason: 'no_relation' };
  }
  return { allowed: true };
}
