import { gradingDelegateSchema } from '@exam/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import type { Actor } from '../../common/actor';
import { AdminOnly, CurrentActor, RequireTag } from '../identity/auth/auth.decorators';
import { DelegationService } from './delegation.service';

const uuid = () => new ParseUUIDPipe();

/** Chủ Phiên thi cấp và thu hồi Ủy quyền chấm (Q307); người được Ủy quyền không vào đây (404). */
@RequireTag('examiner')
@Controller('sessions/:sessionId/grading-delegate')
export class OwnerDelegateController {
  constructor(private readonly delegation: DelegationService) {}

  @Get()
  current(@Param('sessionId', uuid()) sessionId: string, @CurrentActor() actor: Actor) {
    return this.delegation.current({ actor, admin: false }, sessionId);
  }

  @Get('candidates')
  candidates(
    @Param('sessionId', uuid()) sessionId: string,
    @Query('q') q: string | undefined,
    @CurrentActor() actor: Actor,
  ) {
    return this.delegation.candidates({ actor, admin: false }, sessionId, q ?? '');
  }

  @Put()
  grant(
    @Param('sessionId', uuid()) sessionId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    const { userId } = gradingDelegateSchema.parse(body ?? {});
    return this.delegation.grant({ actor, admin: false }, sessionId, userId);
  }

  @Delete()
  @HttpCode(200)
  revoke(@Param('sessionId', uuid()) sessionId: string, @CurrentActor() actor: Actor) {
    return this.delegation.revoke({ actor, admin: false }, sessionId);
  }
}

/** Quản trị viên tìm Phiên thi của mọi chủ và cấp/thu hồi Ủy quyền chấm thay (Q307). */
@AdminOnly()
@Controller('admin/sessions')
export class AdminDelegateController {
  constructor(private readonly delegation: DelegationService) {}

  @Get()
  search(@Query('q') q: string | undefined) {
    return this.delegation.searchSessions(q ?? '');
  }

  @Get(':sessionId/grading-delegate')
  current(@Param('sessionId', uuid()) sessionId: string, @CurrentActor() actor: Actor) {
    return this.delegation.current({ actor, admin: true }, sessionId);
  }

  @Get(':sessionId/grading-delegate/candidates')
  candidates(
    @Param('sessionId', uuid()) sessionId: string,
    @Query('q') q: string | undefined,
    @CurrentActor() actor: Actor,
  ) {
    return this.delegation.candidates({ actor, admin: true }, sessionId, q ?? '');
  }

  @Put(':sessionId/grading-delegate')
  grant(
    @Param('sessionId', uuid()) sessionId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    const { userId } = gradingDelegateSchema.parse(body ?? {});
    return this.delegation.grant({ actor, admin: true }, sessionId, userId);
  }

  @Delete(':sessionId/grading-delegate')
  @HttpCode(200)
  revoke(@Param('sessionId', uuid()) sessionId: string, @CurrentActor() actor: Actor) {
    return this.delegation.revoke({ actor, admin: true }, sessionId);
  }
}
