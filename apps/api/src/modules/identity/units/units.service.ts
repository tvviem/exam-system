import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Actor } from '../../../common/actor';
import { ApiError } from '../../../common/api-error';
import { mapUniqueToConflict } from '../../../common/pg-error';
import { type Database, DB } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import { units } from '../identity.schema';

export interface UnitInput {
  code: string;
  name: string;
}

const UNIQUE_FIELDS = { units_code_unique: 'code' };

/** Đơn vị: Quản trị viên thêm, sửa, xem danh sách. Chưa có xóa. */
@Injectable()
export class UnitsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db
      .select({ id: units.id, code: units.code, name: units.name })
      .from(units)
      .orderBy(asc(units.code));
  }

  async create(actor: Actor, input: UnitInput) {
    return mapUniqueToConflict(UNIQUE_FIELDS, () =>
      this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(units)
          .values(input)
          .returning({ id: units.id, code: units.code, name: units.name });
        if (!row) throw new Error('Không tạo được Đơn vị');
        await this.audit.record(
          { actor, action: 'unit.create', entityType: 'unit', entityId: row.id, after: input },
          tx,
        );
        return row;
      }),
    );
  }

  async update(actor: Actor, id: string, input: Partial<UnitInput>) {
    const [unit] = await this.db.select().from(units).where(eq(units.id, id));
    if (!unit) throw new ApiError('NOT_FOUND');
    const changed = (Object.keys(input) as (keyof UnitInput)[]).filter((k) => input[k] !== unit[k]);
    if (changed.length > 0) {
      await mapUniqueToConflict(UNIQUE_FIELDS, () =>
        this.db.transaction(async (tx) => {
          await tx.update(units).set(input).where(eq(units.id, id));
          await this.audit.record(
            {
              actor,
              action: 'unit.update',
              entityType: 'unit',
              entityId: id,
              before: Object.fromEntries(changed.map((k) => [k, unit[k]])),
              after: Object.fromEntries(changed.map((k) => [k, input[k]])),
            },
            tx,
          );
        }),
      );
    }
    return { id, code: input.code ?? unit.code, name: input.name ?? unit.name };
  }
}
