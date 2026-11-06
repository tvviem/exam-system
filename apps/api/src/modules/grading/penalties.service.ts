import type { PenaltyRequest } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { VIOLATION_PENALTIES, type ViolationPenalties } from '../../common/violation-penalties';
import { type Database, DB } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { GradingAccessService } from './grading-access.service';

/** Mức xử lý Vi phạm (Q294): chọn đến lúc Công bố; sau đó chỉ qua Phúc khảo (5c, 5d chặn). */
@Injectable()
export class PenaltiesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(VIOLATION_PENALTIES) private readonly violations: ViolationPenalties,
    private readonly access: GradingAccessService,
    private readonly audit: AuditService,
  ) {}

  async set(actor: Actor, sessionId: string, violationId: string, request: PenaltyRequest) {
    await this.access.require(actor.id, sessionId);
    return this.db.transaction(async (tx) => {
      const [before] = (await this.violations.list(sessionId, tx)).filter(
        (v) => v.id === violationId,
      );
      if (!before) throw new ApiError('NOT_FOUND');
      const after = await this.violations.setPenalty(
        sessionId,
        violationId,
        request.type === 'percent'
          ? { type: 'percent', percent: request.percent }
          : { type: request.type },
        this.clock.now(),
        tx,
      );
      if (!after) throw new ApiError('NOT_FOUND');
      await this.audit.record(
        {
          actor,
          action: 'session.penalty_set',
          entityType: 'session',
          entityId: sessionId,
          before: { violationId, type: before.penaltyType, percent: before.penaltyPercent },
          after: { violationId, type: after.penaltyType, percent: after.penaltyPercent },
        },
        tx,
      );
      const { attemptId: _attemptId, ...visible } = after;
      return visible;
    });
  }
}
