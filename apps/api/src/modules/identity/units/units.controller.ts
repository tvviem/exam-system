import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import type { Actor } from '../../../common/actor';
import { AdminOnly, CurrentActor } from '../auth/auth.decorators';
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
  create(@Body() body: unknown, @CurrentActor() actor: Actor) {
    return this.units.create(actor, unitSchema.parse(body ?? {}));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.units.update(actor, id, unitSchema.partial().parse(body ?? {}));
  }
}
