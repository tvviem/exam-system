import { extendTimeSchema, forceSubmitSchema, violationSchema } from '@exam/shared';
import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { Actor } from '../../common/actor';
import { CurrentActor, RequireTag } from '../identity/auth/auth.decorators';
import { SessionMonitorService } from './session-monitor.service';

/** Theo dõi và thao tác lúc Phiên thi đang diễn ra (PR 4d); chỉ chủ Phiên thi, người khác nhận 404. */
@RequireTag('examiner')
@Controller('sessions/:sessionId')
export class SessionMonitorController {
  constructor(private readonly monitor: SessionMonitorService) {}

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
