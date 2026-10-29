import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { Actor } from '../../../common/actor';
import { pageSchema } from '../../../common/pagination';
import { AdminOnly, CurrentActor } from '../auth/auth.decorators';
import { INVITATION_STATUSES } from './invitation-status';
import { InvitationsService } from './invitations.service';

const listSchema = pageSchema.extend({ status: z.enum(INVITATION_STATUSES).optional() });

const createSchema = z
  .object({
    email: z.email().max(320),
    fullName: z.string().trim().min(1).max(200),
    unitId: z.uuid(),
  })
  .strict();

@AdminOnly()
@Controller('admin/invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.invitations.list(listSchema.parse(query ?? {}));
  }

  @Post()
  create(@Body() body: unknown, @CurrentActor() actor: Actor) {
    return this.invitations.create(actor, createSchema.parse(body ?? {}));
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.invitations.revoke(actor, id);
  }

  @Post(':id/regenerate')
  @HttpCode(200)
  regenerate(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.invitations.regenerate(actor, id);
  }
}
