import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import type { Actor } from '../../common/actor';
import { pageSchema } from '../../common/pagination';
import { CurrentActor, CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { SessionRosterService } from './session-roster.service';

const listSchema = pageSchema.extend({
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['name', 'code']).default('name'),
});
const searchSchema = z.object({ q: z.string().max(200).default('') });

const dryRun = { dryRun: z.boolean().default(false) };
// Đúng một cách chọn: theo người, theo Lớp, hoặc theo danh sách Mã định danh dán vào.
const addSchema = z.union([
  z.strictObject({ userIds: z.array(z.uuid()).min(1).max(500), ...dryRun }),
  z.strictObject({ classLabel: z.string().trim().min(1).max(100), ...dryRun }),
  z.strictObject({ codes: z.array(z.string().trim().min(1).max(100)).min(1).max(1000), ...dryRun }),
]);

const removeSchema = z.strictObject({ userIds: z.array(z.uuid()).min(1).max(500) });
const revokeSchema = z.strictObject({ reason: z.string().trim().max(500).optional() });
const pardonSchema = z.strictObject({ deviceId: z.uuid() });
const extraSchema = z.strictObject({ extraMinutes: z.number().int().min(0).max(600) });

@RequireTag('examiner')
@Controller('sessions/:sessionId/roster')
export class SessionRosterController {
  constructor(private readonly roster: SessionRosterService) {}

  @Get()
  list(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { page, pageSize, ...filter } = listSchema.parse(query);
    return this.roster.list(user.id, sessionId, filter, { page, pageSize });
  }

  @Get('search')
  search(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.roster.search(user.id, sessionId, searchSchema.parse(query).q);
  }

  @Post()
  @HttpCode(200)
  add(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { dryRun: preview, ...selector } = addSchema.parse(body ?? {});
    return this.roster.add(user.id, sessionId, selector, preview);
  }

  @Delete()
  remove(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.roster.remove(user.id, sessionId, removeSchema.parse(body ?? {}).userIds);
  }

  @Patch(':userId')
  setExtraMinutes(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.roster.setExtraMinutes(
      user.id,
      sessionId,
      userId,
      extraSchema.parse(body ?? {}).extraMinutes,
    );
  }

  @Post(':userId/revoke-device')
  @HttpCode(200)
  revokeDevice(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    const { reason } = revokeSchema.parse(body ?? {});
    return this.roster.revokeDevice(actor, sessionId, userId, reason || null);
  }

  @Post(':userId/pardon-device')
  @HttpCode(200)
  pardonDevice(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    const { deviceId } = pardonSchema.parse(body ?? {});
    return this.roster.pardonDevice(actor, sessionId, userId, deviceId);
  }

  @Post(':userId/reissue-password')
  @HttpCode(200)
  reissuePassword(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.roster.reissuePassword(actor, sessionId, userId);
  }
}
