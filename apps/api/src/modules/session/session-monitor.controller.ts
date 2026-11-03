import { extendTimeSchema } from '@exam/shared';
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
}
