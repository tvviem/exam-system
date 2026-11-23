import {
  extendTimeSchema,
  forceSubmitSchema,
  VARIANT_COUNT_MAX,
  violationSchema,
} from '@exam/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { Actor } from '../../common/actor';
import { CurrentActor, CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { SessionMonitorService } from './session-monitor.service';

const monitorQuerySchema = z.object({
  /** Chỉ hiện người của Mã đề này (số thứ tự). */
  variant: z.coerce.number().int().min(1).max(VARIANT_COUNT_MAX).optional(),
});

/** Theo dõi và thao tác lúc Phiên thi đang diễn ra (PR 4d); chỉ chủ Phiên thi, người khác nhận 404. */
@RequireTag('examiner')
@Controller('sessions/:sessionId')
export class SessionMonitorController {
  constructor(private readonly monitor: SessionMonitorService) {}

  @Get('monitor')
  monitorOf(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.monitor.monitor(user.id, sessionId, monitorQuerySchema.parse(query).variant);
  }

  @Post('extend-time')
  @HttpCode(200)
  extendTime(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.monitor.extendTime(actor, sessionId, extendTimeSchema.parse(body ?? {}));
  }

  @Post('force-submit')
  @HttpCode(200)
  forceSubmit(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.monitor.forceSubmit(actor, sessionId, forceSubmitSchema.parse(body ?? {}));
  }

  @Post('attempts/:attemptId/undo-force-submit')
  @HttpCode(200)
  undoOne(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.monitor.undoForceSubmit(actor, sessionId, attemptId);
  }

  /** Hoàn tác mọi Lượt bị Buộc nộp trong 10 phút qua (Q278). */
  @Post('undo-force-submit')
  @HttpCode(200)
  undoBatch(@Param('sessionId', ParseUUIDPipe) sessionId: string, @CurrentActor() actor: Actor) {
    return this.monitor.undoForceSubmit(actor, sessionId, null);
  }

  @Post('attempts/:attemptId/violations')
  recordViolation(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.monitor.recordViolation(
      actor,
      sessionId,
      attemptId,
      violationSchema.parse(body ?? {}),
    );
  }

  @Post('close-entry')
  @HttpCode(200)
  closeEntry(@Param('sessionId', ParseUUIDPipe) sessionId: string, @CurrentActor() actor: Actor) {
    return this.monitor.closeEntry(actor, sessionId);
  }

  @Post('reopen-entry')
  @HttpCode(200)
  reopenEntry(@Param('sessionId', ParseUUIDPipe) sessionId: string, @CurrentActor() actor: Actor) {
    return this.monitor.reopenEntry(actor, sessionId);
  }
}
