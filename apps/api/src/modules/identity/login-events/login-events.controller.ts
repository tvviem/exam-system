import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { pageSchema } from '../../../common/pagination';
import { AdminOnly } from '../auth/auth.decorators';
import { LoginEventsService } from './login-events.service';

const listSchema = pageSchema.extend({
  userId: z.uuid().optional(),
  success: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

@AdminOnly()
@Controller('admin/login-events')
export class LoginEventsController {
  constructor(private readonly loginEvents: LoginEventsService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.loginEvents.list(listSchema.parse(query ?? {}));
  }
}
