import { normalizeForSearch } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { mapUniqueToConflict, pgErrorOf } from '../../common/pg-error';
import { type Database, DB } from '../../db/db.module';
import { questions, topics } from './question-bank.schema';

export interface TopicInput {
  name: string;
  description?: string | null;
}

const UNIQUE_FIELDS = { topics_owner_name_unique: 'name' };
const FOREIGN_KEY_VIOLATION = '23503';

const columns = {
  id: topics.id,
  name: topics.name,
  description: topics.description,
  archivedAt: topics.archivedAt,
};

/** Chủ đề của Người ra đề: danh sách phẳng; chỉ chủ sở hữu thấy (Q112, Q113). */
@Injectable()
export class TopicsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(ownerId: string, includeArchived: boolean) {
    const rows = await this.db
      .select({ ...columns, questionCount: count(questions.id) })
      .from(topics)
      .leftJoin(questions, eq(questions.topicId, topics.id))
      .where(
        and(eq(topics.ownerId, ownerId), includeArchived ? undefined : isNull(topics.archivedAt)),
      )
      .groupBy(topics.id)
      .orderBy(asc(topics.nameKey));
    return rows;
  }

  create(ownerId: string, input: TopicInput) {
    return mapUniqueToConflict(UNIQUE_FIELDS, async () => {
      const [row] = await this.db
        .insert(topics)
        .values({
          ownerId,
          name: input.name,
          nameKey: normalizeForSearch(input.name),
          description: input.description ?? null,
        })
        .returning(columns);
      if (!row) throw new Error('Không tạo được Chủ đề');
      return row;
    });
  }

  update(ownerId: string, id: string, input: Partial<TopicInput>) {
    return mapUniqueToConflict(UNIQUE_FIELDS, async () => {
      const [row] = await this.db
        .update(topics)
        .set({
          ...(input.name === undefined
            ? {}
            : { name: input.name, nameKey: normalizeForSearch(input.name) }),
          ...(input.description === undefined ? {} : { description: input.description }),
        })
        .where(and(eq(topics.id, id), eq(topics.ownerId, ownerId)))
        .returning(columns);
      if (!row) throw new ApiError('NOT_FOUND');
      return row;
    });
  }

  async remove(ownerId: string, id: string) {
    await this.requireOwned(ownerId, id);
    const [counted] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(questions)
      .where(eq(questions.topicId, id));
    if (!counted || counted.total > 0)
      throw new ApiError('INVALID_STATE', { reason: 'TOPIC_NOT_EMPTY' });
    try {
      await this.db.delete(topics).where(eq(topics.id, id));
    } catch (error) {
      // Một Câu hỏi vừa được thêm vào giữa lúc kiểm tra và lúc xóa.
      if (pgErrorOf(error)?.code === FOREIGN_KEY_VIOLATION) {
        throw new ApiError('INVALID_STATE', { reason: 'TOPIC_NOT_EMPTY' });
      }
      throw error;
    }
  }

  async archive(ownerId: string, id: string) {
    const [row] = await this.db
      .update(topics)
      .set({ archivedAt: sql`coalesce(${topics.archivedAt}, now())` })
      .where(and(eq(topics.id, id), eq(topics.ownerId, ownerId)))
      .returning(columns);
    if (!row) throw new ApiError('NOT_FOUND');
    return row;
  }

  restore(ownerId: string, id: string) {
    return mapUniqueToConflict(UNIQUE_FIELDS, async () => {
      const [row] = await this.db
        .update(topics)
        .set({ archivedAt: null })
        .where(and(eq(topics.id, id), eq(topics.ownerId, ownerId)))
        .returning(columns);
      if (!row) throw new ApiError('NOT_FOUND');
      return row;
    });
  }

  /** Chủ đề của chủ này và chưa lưu trữ; ngược lại NOT_FOUND (không phải của chủ) hoặc INVALID_STATE (đã lưu trữ). */
  async requireUsable(ownerId: string, id: string): Promise<void> {
    const row = await this.requireOwned(ownerId, id);
    if (row.archivedAt) throw new ApiError('INVALID_STATE', { reason: 'TOPIC_ARCHIVED' });
  }

  private async requireOwned(ownerId: string, id: string) {
    const [row] = await this.db
      .select({ id: topics.id, archivedAt: topics.archivedAt })
      .from(topics)
      .where(and(eq(topics.id, id), eq(topics.ownerId, ownerId)));
    if (!row) throw new ApiError('NOT_FOUND');
    return row;
  }
}
