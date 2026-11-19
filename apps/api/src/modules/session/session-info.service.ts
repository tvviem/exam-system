import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { SessionInfoProvider } from '../../common/session-info';
import { type Database, DB } from '../../db/db.module';
import { sessions } from './session.schema';

/** Cài đặt cổng `SESSION_INFO` (xuất đề). */
@Injectable()
export class SessionInfoService implements SessionInfoProvider {
  constructor(@Inject(DB) private readonly db: Database) {}

  async info(sessionId: string) {
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        examId: sessions.examId,
        ownerId: sessions.ownerId,
        opensAt: sessions.opensAt,
        closesAt: sessions.closesAt,
        durationMinutes: sessions.durationMinutes,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    return row ?? null;
  }
}
