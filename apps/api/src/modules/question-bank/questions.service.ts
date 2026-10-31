import { normalizeForSearch, plainTextOf, type QuestionInput } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { type Page, paginate } from '../../common/pagination';
import { type Database, DB } from '../../db/db.module';
import { IllustrationsService } from './illustrations/illustrations.service';
import { assertLatexValid } from './latex';
import { questions, topics } from './question-bank.schema';
import { questionColumnsOf } from './question-columns';
import { TopicsService } from './topics.service';

export interface QuestionFilter {
  topicId?: string;
  type?: QuestionInput['type'];
  tag?: string;
  q?: string;
}

const PREVIEW_CHARS = 160;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const fullColumns = {
  id: questions.id,
  topicId: questions.topicId,
  type: questions.type,
  stem: questions.stem,
  payload: questions.payload,
  defaultPoints: questions.defaultPoints,
  tags: questions.tags,
  searchText: questions.searchText,
  version: questions.version,
  createdAt: questions.createdAt,
  updatedAt: questions.updatedAt,
};

type FullRow = {
  [K in keyof typeof fullColumns]: (typeof fullColumns)[K]['_']['data'];
};

/** Trả cho client: điểm là số, `searchText` chỉ dùng nội bộ. */
const present = ({ searchText: _searchText, ...row }: FullRow) => ({
  ...row,
  defaultPoints: Number(row.defaultPoints),
});

/** Câu hỏi của Người ra đề. Mọi truy cập lọc theo `owner_id`; câu của người khác coi như không tồn tại. */
@Injectable()
export class QuestionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly topics: TopicsService,
    private readonly illustrations: IllustrationsService,
  ) {}

  async create(ownerId: string, input: QuestionInput) {
    assertLatexValid(input);
    await this.topics.requireUsable(ownerId, input.topicId);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(questions)
        .values({ ownerId, ...questionColumnsOf(input) })
        .returning(fullColumns);
      if (!row) throw new Error('Không tạo được Câu hỏi');
      await this.illustrations.syncUsage(tx, ownerId, row.id, input);
      return present(row);
    });
  }

  async get(ownerId: string, id: string) {
    return present(await this.load(ownerId, id));
  }

  private async load(ownerId: string, id: string) {
    const [row] = await this.db
      .select(fullColumns)
      .from(questions)
      .where(and(eq(questions.id, id), eq(questions.ownerId, ownerId)));
    if (!row) throw new ApiError('NOT_FOUND');
    return row;
  }

  /** Thay toàn bộ nội dung. `version` là bản client đang sửa; lệch thì CONFLICT (sửa từ hai nơi). */
  async update(ownerId: string, id: string, input: QuestionInput, version: number) {
    assertLatexValid(input);
    const current = await this.get(ownerId, id);
    if (input.topicId !== current.topicId) await this.topics.requireUsable(ownerId, input.topicId);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(questions)
        .set({ ...questionColumnsOf(input), version: sql`${questions.version} + 1` })
        .where(
          and(eq(questions.id, id), eq(questions.ownerId, ownerId), eq(questions.version, version)),
        )
        .returning(fullColumns);
      if (!row) throw new ApiError('CONFLICT', { field: 'version' });
      await this.illustrations.syncUsage(tx, ownerId, id, input);
      return present(row);
    });
  }

  async duplicate(ownerId: string, id: string) {
    const source = await this.load(ownerId, id);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(questions)
        .values({
          ownerId,
          topicId: source.topicId,
          type: source.type,
          stem: source.stem,
          payload: source.payload,
          defaultPoints: String(source.defaultPoints),
          tags: source.tags,
          searchText: source.searchText,
        })
        .returning(fullColumns);
      if (!row) throw new Error('Không nhân bản được Câu hỏi');
      await this.illustrations.copyUsage(tx, id, row.id);
      return present(row);
    });
  }

  async move(ownerId: string, ids: string[], topicId: string) {
    await this.topics.requireUsable(ownerId, topicId);
    return this.db.transaction(async (tx) => {
      const unique = [...new Set(ids)];
      const moved = await tx
        .update(questions)
        .set({ topicId, version: sql`${questions.version} + 1` })
        .where(and(inArray(questions.id, unique), eq(questions.ownerId, ownerId)))
        .returning({ id: questions.id });
      // Có id không thuộc về chủ: ném lỗi để giao dịch hoàn tác toàn bộ.
      if (moved.length !== unique.length) throw new ApiError('NOT_FOUND');
      return { moved: moved.length };
    });
  }

  async remove(ownerId: string, ids: string[]) {
    return this.db.transaction(async (tx) => {
      const unique = [...new Set(ids)];
      const deleted = await tx
        .delete(questions)
        .where(and(inArray(questions.id, unique), eq(questions.ownerId, ownerId)))
        .returning({ id: questions.id });
      if (deleted.length !== unique.length) throw new ApiError('NOT_FOUND');
      return { deleted: deleted.length };
    });
  }

  async list(ownerId: string, filter: QuestionFilter, page: Page) {
    const q = filter.q ? normalizeForSearch(filter.q) : '';
    const where = and(
      eq(questions.ownerId, ownerId),
      filter.topicId ? eq(questions.topicId, filter.topicId) : undefined,
      filter.type ? eq(questions.type, filter.type) : undefined,
      filter.tag ? sql`${questions.tags} @> ARRAY[${filter.tag}]::text[]` : undefined,
      q ? sql`${questions.searchText} LIKE ${`%${escapeLike(q)}%`}` : undefined,
    );
    const result = await paginate(
      page,
      () => this.db.select({ total: sql<number>`count(*)::int` }).from(questions).where(where),
      (limit, offset) =>
        this.db
          .select({
            id: questions.id,
            topicId: questions.topicId,
            topicName: topics.name,
            type: questions.type,
            stem: questions.stem,
            defaultPoints: questions.defaultPoints,
            tags: questions.tags,
            version: questions.version,
            updatedAt: questions.updatedAt,
          })
          .from(questions)
          .innerJoin(topics, eq(topics.id, questions.topicId))
          .where(where)
          .orderBy(desc(questions.updatedAt), desc(questions.id))
          .limit(limit)
          .offset(offset),
    );
    return {
      ...result,
      items: result.items.map(({ stem, defaultPoints, ...item }) => ({
        ...item,
        defaultPoints: Number(defaultPoints),
        preview: plainTextOf(stem).slice(0, PREVIEW_CHARS),
      })),
    };
  }
}
