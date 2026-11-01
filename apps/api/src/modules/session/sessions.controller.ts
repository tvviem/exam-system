import { SESSION_PHASES, sessionSettingsSchema, sessionUpdateSchema } from '@exam/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { pageSchema } from '../../common/pagination';
import { CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { SessionLifecycleService } from './session-lifecycle.service';
import { SessionsService } from './sessions.service';

const listSchema = pageSchema.extend({
  phase: z.enum(SESSION_PHASES).optional(),
  q: z.string().trim().max(200).optional(),
});
const cancelSchema = z.strictObject({ reason: z.string().trim().max(500).optional() });
const suggestSchema = z.object({
  opensAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
  closesAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
});

@RequireTag('examiner')
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly lifecycle: SessionLifecycleService,
  ) {}

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.create(user.id, sessionSettingsSchema.parse(body));
  }

  @Get()
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { page, pageSize, ...filter } = listSchema.parse(query);
    return this.sessions.list(user.id, filter, { page, pageSize });
  }

  // Khai báo trước ':id' để 'access-code-suggestion' không bị coi là id.
  @Get('access-code-suggestion')
  suggest(@Query() query: unknown) {
    const { opensAt, closesAt } = suggestSchema.parse(query);
    return this.sessions.suggestAccessCode(opensAt, closesAt);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.get(user.id, id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessions.update(user.id, id, sessionUpdateSchema.parse(body));
  }

  @Post(':id/duplicate')
  duplicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.duplicate(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lifecycle.cancel(user.id, id, cancelSchema.parse(body ?? {}).reason);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.lifecycle.remove(user.id, id);
  }
}
