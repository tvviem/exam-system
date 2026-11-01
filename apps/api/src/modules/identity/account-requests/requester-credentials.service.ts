import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../../common/actor';
import { ApiError } from '../../../common/api-error';
import { NotificationsService } from '../../notifications/notifications.service';
import { accountRequestItems, accountRequests } from '../identity.schema';
import { UserManagementService } from '../users/user-management.service';

/**
 * Người ra đề cấp lại mật khẩu tạm cho Người dự thi trong Danh sách dự thi của mình (Q2 của 4a). Đây là chiếm quyền
 * tiềm tàng (đặt mật khẩu rồi đăng nhập bằng tài khoản của người khác), nên chỉ áp dụng cho đúng tình huống "làm mất
 * Phiếu tài khoản": tài khoản do chính Người ra đề này xin cấp, và chủ tài khoản chưa từng đổi mật khẩu tạm. Còn lại
 * nhờ Quản trị viên. Điều kiện kiểm trong cùng giao dịch với việc đặt mật khẩu.
 */
@Injectable()
export class RequesterCredentialsService {
  constructor(
    private readonly users: UserManagementService,
    private readonly notifications: NotificationsService,
  ) {}

  reissueTemporaryPassword(actor: Actor, candidateId: string, context: { sessionId: string }) {
    return this.users.reissueTemporaryPassword(actor, candidateId, {
      guard: async (tx, target) => {
        const [issued] = await tx
          .select({ id: accountRequestItems.id })
          .from(accountRequestItems)
          .innerJoin(accountRequests, eq(accountRequests.id, accountRequestItems.requestId))
          .where(
            and(
              eq(accountRequestItems.userId, candidateId),
              eq(accountRequestItems.outcome, 'created'),
              eq(accountRequests.requestedBy, actor.id),
            ),
          )
          .limit(1);
        if (!issued || target.isAdmin || target.status !== 'active' || !target.mustChangePassword) {
          throw new ApiError('INVALID_STATE', { reason: 'ASK_ADMIN' });
        }
      },
      onApplied: (tx) =>
        this.notifications.notify(
          {
            userIds: [candidateId],
            type: 'account.password_reissued',
            data: { sessionId: context.sessionId },
          },
          tx,
        ),
    });
  }
}
