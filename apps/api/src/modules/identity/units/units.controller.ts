import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { actorOf } from '../users/user-management.controller';
import { UnitsService } from './units.service';

const unitSchema = z
  .object({
    code: z.string().trim().min(1).max(30),
    name: z.string().trim().min(1).max(200),
  })
  .strict();

@AdminOnly()
@Controller('admin/units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  list() {
    return this.units.list();
  }

  @Post()
  create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.units.create(actorOf(user, req), unitSchema.parse(body ?? {}));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.units.update(actorOf(user, req), id, unitSchema.partial().parse(body ?? {}));
  }
}
