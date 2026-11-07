import { createAppealSchema, extendAppealPeriodSchema, resolveAppealSchema } from '@exam/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { Actor } from '../../common/actor';
import { CurrentActor, CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { AppealsService } from './appeals.service';
import { CandidateAppealsService } from './candidate-appeals.service';
import { ReleaseService } from './release.service';

const uuid = () => new ParseUUIDPipe();

/** Người dự thi gửi và xem Phúc khảo của mình (PR 5d-1); người ngoài Danh sách nhận 404, chưa Công bố nhận 409 `NOT_RELEASED`. */
@RequireTag('candidate')
@Controller('take/sessions/:sessionId/appeals')
export class CandidateAppealsController {
  constructor(private readonly appeals: CandidateAppealsService) {}

  @Post()
  create(
    @Param('sessionId', uuid()) sessionId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.appeals.create(actor, sessionId, createAppealSchema.parse(body ?? {}));
  }

  @Get()
  mine(@Param('sessionId', uuid()) sessionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appeals.mine(user.id, sessionId);
  }
}

/** Người ra đề (chủ Phiên thi hoặc người được Ủy quyền) xem, xử lý Phúc khảo và gia hạn Thời hạn phúc khảo; người khác nhận 404. */
@RequireTag('examiner')
@Controller('sessions/:sessionId')
export class AppealsController {
  constructor(
    private readonly appeals: AppealsService,
    private readonly releases: ReleaseService,
  ) {}

  @Get('appeals')
  list(
    @Param('sessionId', uuid()) sessionId: string,
    @Query('status') status: string | undefined,
    @Query('no') no: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const wanted = Number(no);
    return this.appeals.list(user.id, sessionId, {
      status: status === 'open' || status === 'resolved' ? status : undefined,
      no: Number.isInteger(wanted) && wanted >= 1 ? wanted : undefined,
    });
  }

  @Get('appeals/:appealId')
  detail(
    @Param('sessionId', uuid()) sessionId: string,
    @Param('appealId', uuid()) appealId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appeals.detail(user.id, sessionId, appealId);
  }

  @Post('appeals/:appealId/resolve')
  @HttpCode(200)
  resolve(
    @Param('sessionId', uuid()) sessionId: string,
    @Param('appealId', uuid()) appealId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.appeals.resolve(actor, sessionId, appealId, resolveAppealSchema.parse(body ?? {}));
  }

  @Post('appeal-period/extend')
  @HttpCode(200)
  extend(
    @Param('sessionId', uuid()) sessionId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.releases.extendAppealPeriod(
      actor,
      sessionId,
      extendAppealPeriodSchema.parse(body ?? {}),
    );
  }
}
