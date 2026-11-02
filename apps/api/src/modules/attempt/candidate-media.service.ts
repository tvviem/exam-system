import { ATTEMPT_GRACE_SECONDS } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CandidateMedia } from '../../common/candidate-media';
import { CLOCK, type Clock } from '../../common/clock';
import { EXAM_CONTENT, type ExamContentProvider } from '../../common/exam-content';
import { SESSION_ENTRY, type SessionEntry } from '../../common/session-entry';
import { type Database, DB } from '../../db/db.module';
import { attempts, sessionDevices } from './attempt.schema';
import { hashDeviceKey } from './device-key';

/** Cài đặt cổng `CANDIDATE_MEDIA` (Q219) cho `question-bank`. */
@Injectable()
export class CandidateMediaService implements CandidateMedia {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SESSION_ENTRY) private readonly entry: SessionEntry,
    @Inject(EXAM_CONTENT) private readonly content: ExamContentProvider,
  ) {}

  async canView(
    userId: string,
    deviceKey: string | undefined,
    attemptId: string,
    illustrationId: string,
  ): Promise<boolean> {
    if (!deviceKey) return false;
    const [attempt] = await this.db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)));
    if (attempt?.status !== 'in_progress') return false;
    if (this.clock.now().getTime() > attempt.deadline.getTime() + ATTEMPT_GRACE_SECONDS * 1000) {
      return false;
    }
    const [device] = await this.db
      .select({ id: sessionDevices.id })
      .from(sessionDevices)
      .where(
        and(
          eq(sessionDevices.sessionId, attempt.sessionId),
          eq(sessionDevices.userId, userId),
          eq(sessionDevices.deviceHash, hashDeviceKey(deviceKey)),
          eq(sessionDevices.status, 'active'),
        ),
      );
    if (!device) return false;
    const gate = await this.entry.gateFor(attempt.sessionId, userId);
    return gate !== null && (await this.content.hasIllustration(gate.examId, illustrationId));
  }
}
