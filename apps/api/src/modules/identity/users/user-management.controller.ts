import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly } from '../auth/auth.decorators';
import { UserManagementService } from './user-management.service';

// Q67: mặc định 20, tối đa 100.
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@AdminOnly()
@Controller('admin/users')
export class UserManagementController {
  constructor(private readonly users: UserManagementService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.users.list(pageSchema.parse(query ?? {}));
  }
}
