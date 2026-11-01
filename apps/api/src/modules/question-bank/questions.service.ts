import { normalizeForSearch, plainTextOf, type QuestionInput } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { EXAM_USAGE, type ExamRef, type ExamUsage } from '../../common/exam-usage';
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
  /** Mặc định ẩn câu đã Lưu trữ; `true` chỉ hiện câu đã Lưu trữ (Q174). */
  archived?: boolean;
}

const PREVIEW_CHARS = 160;

/** `INVALID_STATE` nêu các Bộ đề nháp đang giữ Câu hỏi (Q166). */
const questionInExam = (exams: ExamRef[]) =>
  new ApiError('INVALID_STATE', {
    reason: 'QUESTION_IN_EXAM',
    exams: [...new Map(exams.map((exam) => [exam.id, exam])).values()],
  });

/** Câu có trong Bộ đề đã Phát hành hoặc Lưu trữ: chỉ Lưu trữ được (Q174). */
const questionInPublishedExam = (publishedCount: number) =>
  new ApiError('INVALID_STATE', { reason: 'QUESTION_IN_PUBLISHED_EXAM', publishedCount });

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
  archivedAt: questions.archivedAt,
};

type FullRow = Pick<typeof questions.$inferSelect, keyof typeof fullColumns>;

const NO_USAGE = { draftExams: [], publishedCount: 0 };

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
    @Inject(EXAM_USAGE) private readonly examUsage: ExamUsage,
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
      return { ...present(row), usage: NO_USAGE };
    });
  }

  /** Kèm `usage` để trình soạn báo "đang dùng ở đâu" (Q175); chỉ báo, không chặn sửa. */
  async get(ownerId: string, id: string) {
    const row = await this.load(ownerId, id);
    const usage = (await this.examUsage.usageOf(ownerId, [id])).get(id);
    return { ...present(row), usage: usage ?? NO_USAGE };
  }

  /** Lưu trữ: ẩn khỏi danh sách và bảng chọn câu của Bộ đề, không xóa (Q174). Làm lại không sao. */
  async archive(ownerId: string, ids: string[]) {
    return this.setArchived(ownerId, ids, sql`now()`);
  }

  async restore(ownerId: string, ids: string[]) {
    return this.setArchived(ownerId, ids, null);
  }

  private async setArchived(ownerId: string, ids: string[], value: ReturnType<typeof sql> | null) {
    const unique = [...new Set(ids)];
    return this.db.transaction(async (tx) => {
      const changed = await tx
        .update(questions)
        .set({ archivedAt: value })
        .where(and(inArray(questions.id, unique), eq(questions.ownerId, ownerId)))
        .returning({ id: questions.id });
      if (changed.length !== unique.length) throw new ApiError('NOT_FOUND');
      return { updated: changed.length };
    });
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
      return {
        ...present(row),
        usage: (await this.examUsage.usageOf(ownerId, [id])).get(id) ?? NO_USAGE,
      };
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
      return { ...present(row), usage: NO_USAGE };
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
    const unique = [...new Set(ids)];
    // Câu còn nằm trong Bộ đề nháp thì không xóa (Q166): nêu tên các Bộ đề để người dùng biết gỡ ở đâu.
    const usage = await this.examUsage.usageOf(ownerId, unique);
    const drafts = [...usage.values()].flatMap((entry) => entry.draftExams);
    if (drafts.length > 0) throw questionInExam(drafts);
    // Đã nằm trong Bộ đề Phát hành hoặc Lưu trữ: bản chụp cần câu gốc còn đó, nên chỉ Lưu trữ (Q174).
    const published = [...usage.values()].reduce((sum, entry) => sum + entry.publishedCount, 0);
    if (published > 0) throw questionInPublishedExam(published);
    try {
      return await this.db.transaction(async (tx) => {
        const deleted = await tx
          .delete(questions)
          .where(and(inArray(questions.id, unique), eq(questions.ownerId, ownerId)))
          .returning({ id: questions.id });
        if (deleted.length !== unique.length) throw new ApiError('NOT_FOUND');
        return { deleted: deleted.length };
      });
    } catch (error) {
      // Câu vừa được thêm vào một Bộ đề nháp giữa lúc kiểm tra và lúc xóa: khóa ngoại RESTRICT từ chối.
      if ((error as { cause?: { code?: string } }).cause?.code === '23503') {
        throw questionInExam([]);
      }
      throw error;
    }
  }

  async list(ownerId: string, filter: QuestionFilter, page: Page) {
    const q = filter.q ? normalizeForSearch(filter.q) : '';
    const where = and(
      eq(questions.ownerId, ownerId),
      filter.topicId ? eq(questions.topicId, filter.topicId) : undefined,
      filter.type ? eq(questions.type, filter.type) : undefined,
      filter.tag ? sql`${questions.tags} @> ARRAY[${filter.tag}]::text[]` : undefined,
      q ? sql`${questions.searchText} LIKE ${`%${escapeLike(q)}%`}` : undefined,
      filter.archived ? isNotNull(questions.archivedAt) : isNull(questions.archivedAt),
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
            archivedAt: questions.archivedAt,
          })
          .from(questions)
          .innerJoin(topics, eq(topics.id, questions.topicId))
          .where(where)
          .orderBy(desc(questions.updatedAt), desc(questions.id))
          .limit(limit)
          .offset(offset),
    );
    const usage = await this.examUsage.usageOf(
      ownerId,
      result.items.map((item) => item.id),
    );
    return {
      ...result,
      items: result.items.map(({ stem, defaultPoints, ...item }) => ({
        ...item,
        defaultPoints: Number(defaultPoints),
        preview: plainTextOf(stem).slice(0, PREVIEW_CHARS),
        usage: {
          draftCount: usage.get(item.id)?.draftExams.length ?? 0,
          publishedCount: usage.get(item.id)?.publishedCount ?? 0,
        },
      })),
    };
  }
}
