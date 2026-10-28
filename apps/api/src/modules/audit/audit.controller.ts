import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { pageSchema } from '../../common/pagination';
import { AdminOnly } from '../identity/auth/auth.decorators';
import { AuditService } from './audit.service';

const listSchema = pageSchema.extend({
  actorId: z.uuid().optional(),
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.uuid().optional(),
});

@AdminOnly()
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.audit.list(listSchema.parse(query ?? {}));
  }
}
