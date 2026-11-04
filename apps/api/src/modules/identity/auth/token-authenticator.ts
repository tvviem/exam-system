import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../users.repository';
import { AuthSessionStore } from './auth-session-store';

/**
 * Người dùng của một mã phiên đăng nhập (cookie `exam_sid`): hợp lệ khi phiên còn hạn và người đó chưa Khóa, chưa Xóa.
 * Dùng chung cho AuthGuard (REST) và cổng Socket.IO (lúc bắt tay), để cả hai cùng một luật.
 */
@Injectable()
export class TokenAuthenticator {
  constructor(
    private readonly authSessions: AuthSessionStore,
    private readonly usersRepo: UsersRepository,
  ) {}

  async authenticate(token: string | undefined) {
    const session = token ? await this.authSessions.resolve(token) : null;
    if (!token || !session) return null;
    const row = await this.usersRepo.findById(session.userId);
    // Phiên của người đã Khóa hoặc Xóa bị thu hồi ngay khi phát hiện.
    if (!row || row.removedAt || row.status === 'locked') {
      await this.authSessions.revokeToken(token, row?.removedAt ? 'user_removed' : 'user_locked');
      return null;
    }
    const user = await this.usersRepo.toAuthenticated(row);
    return { user, authSessionId: session.authSessionId, token };
  }
}
