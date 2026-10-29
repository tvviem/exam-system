import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { pageSchema } from '../../../common/pagination';
import { AuditService } from '../../audit/audit.service';
import { AdminOnly } from '../auth/auth.decorators';
import { UsersRepository } from '../users.repository';

const listSchema = pageSchema.extend({
  actorId: z.uuid().optional(),
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.uuid().optional(),
});

/** Nhật ký thao tác (Q67): đọc qua AuditService, gắn tên người thực hiện từ bảng của identity. */
@AdminOnly()
@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(
    private readonly audit: AuditService,
    private readonly users: UsersRepository,
  ) {}

  @Get()
  async list(@Query() query: unknown) {
    const result = await this.audit.list(listSchema.parse(query ?? {}));
    const names = await this.users.fullNamesOf(
      result.items.flatMap((i) => (i.actorId ? [i.actorId] : [])),
    );
    return {
      ...result,
      items: result.items.map((i) => ({
        ...i,
        actorName: i.actorId ? (names.get(i.actorId) ?? null) : null,
      })),
    };
  }
}
