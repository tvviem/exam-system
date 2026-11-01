import {
  EXAM_TITLE_MAX,
  imageNodesOf,
  POINTS_MAX,
  POINTS_MIN,
  POINTS_STEP,
  questionInputSchema,
  richTextFieldsOf,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { type Database, DB } from '../../db/db.module';
import { illustrations, questions } from '../question-bank/question-bank.schema';
import { examItemIllustrations, examItems, examSections, exams } from './exam.schema';

type Db = Pick<Database, 'select'>;

export type PublishProblemCode =
  | 'title_missing'
  | 'empty_exam'
  | 'empty_section'
  | 'question_archived'
  | 'question_invalid'
  | 'illustration_not_ready'
  | 'points_invalid';

/** Một vấn đề chặn Phát hành (Q171); `questionId`/`sectionId` để giao diện dẫn tới đúng chỗ. */
export interface PublishProblem {
  code: PublishProblemCode;
  questionId?: string;
  sectionId?: string;
}

/** Bản chụp một câu lúc Phát hành (Q172, ADR-0005). Điểm nằm ở `exam_items.points`, không lặp ở đây. */
export type ItemSnapshot = {
  questionId: string;
  questionVersion: number;
  type: string;
  stem: unknown;
  payload: unknown;
  illustrations: { id: string; width: number | null; height: number | null; variants: number[] }[];
};

const pointsValid = (points: number) =>
  Number.isFinite(points) &&
  points >= POINTS_MIN &&
  points <= POINTS_MAX &&
  Math.abs(points / POINTS_STEP - Math.round(points / POINTS_STEP)) < 1e-9;

/** Phát hành, Nhân bản, Lưu trữ và Khôi phục Bộ đề (Q171–Q173, Q177, Q179). */
@Injectable()
export class ExamLifecycleService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Chỉ để hiện cho người dùng; `publish` chạy lại cùng phép kiểm trong giao dịch có khóa (Q171). */
  async publishCheck(ownerId: string, id: string) {
    const [exam] = await this.db
      .select({ status: exams.status })
      .from(exams)
      .where(and(eq(exams.id, id), eq(exams.ownerId, ownerId)));
    if (!exam) throw new ApiError('NOT_FOUND');
    if (exam.status !== 'draft') throw new ApiError('INVALID_STATE', { reason: 'EXAM_NOT_DRAFT' });
    const { problems } = await this.inspect(this.db, id);
    return { problems };
  }

  async publish(ownerId: string, id: string, version: number) {
    await this.db.transaction(async (tx) => {
      const [exam] = await tx
        .select({ status: exams.status, version: exams.version })
        .from(exams)
        .where(and(eq(exams.id, id), eq(exams.ownerId, ownerId)))
        .for('update');
      if (!exam) throw new ApiError('NOT_FOUND');
      if (exam.status !== 'draft')
        throw new ApiError('INVALID_STATE', { reason: 'EXAM_NOT_DRAFT' });
      if (exam.version !== version) throw new ApiError('CONFLICT', { field: 'version' });

      // Khóa chia sẻ các Câu hỏi: không ai sửa câu giữa lúc kiểm tra và lúc chụp.
      const { problems, snapshots } = await this.inspect(tx, id, true);
      if (problems.length > 0) {
        throw new ApiError('INVALID_STATE', { reason: 'PUBLISH_BLOCKED', problems });
      }
      for (const [itemId, snapshot] of snapshots) {
        await tx.update(examItems).set({ snapshot }).where(eq(examItems.id, itemId));
        const ids = snapshot.illustrations.map((i) => i.id);
        if (ids.length > 0) {
          await tx
            .insert(examItemIllustrations)
            .values(ids.map((illustrationId) => ({ examItemId: itemId, illustrationId })));
        }
      }
      await tx
        .update(exams)
        .set({ status: 'published', publishedAt: sql`now()` })
        .where(eq(exams.id, id));
    });
    return { id };
  }

  /** Nháp mới cùng chủ, câu lấy theo bản hiện tại của ngân hàng (Q177). */
  async duplicate(ownerId: string, id: string) {
    const copyId = await this.db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(exams)
        .where(and(eq(exams.id, id), eq(exams.ownerId, ownerId)));
      if (!source) throw new ApiError('NOT_FOUND');
      const [copy] = await tx
        .insert(exams)
        .values({
          ownerId,
          title: `${source.title} (bản sao)`.slice(0, EXAM_TITLE_MAX),
          instructions: source.instructions,
        })
        .returning({ id: exams.id });
      if (!copy) throw new Error('Không nhân bản được Bộ đề');
      const sections = await tx
        .select()
        .from(examSections)
        .where(eq(examSections.examId, id))
        .orderBy(asc(examSections.sort));
      const items = await tx
        .select()
        .from(examItems)
        .where(eq(examItems.examId, id))
        .orderBy(asc(examItems.sort));
      for (const section of sections) {
        const [created] = await tx
          .insert(examSections)
          .values({
            examId: copy.id,
            title: section.title,
            instructions: section.instructions,
            sort: section.sort,
          })
          .returning({ id: examSections.id });
        if (!created) throw new Error('Không nhân bản được Phần');
        const own = items.filter((item) => item.sectionId === section.id);
        if (own.length > 0) {
          await tx.insert(examItems).values(
            own.map((item) => ({
              examId: copy.id,
              sectionId: created.id,
              questionId: item.questionId,
              points: item.points,
              sort: item.sort,
            })),
          );
        }
      }
      return copy.id;
    });
    return { id: copyId };
  }

  /** published → archived (Q179); nháp không Lưu trữ. */
  archive(ownerId: string, id: string) {
    return this.transition(ownerId, id, 'published', 'archived');
  }

  /** archived → published. */
  restore(ownerId: string, id: string) {
    return this.transition(ownerId, id, 'archived', 'published');
  }

  private async transition(
    ownerId: string,
    id: string,
    from: 'published' | 'archived',
    to: 'published' | 'archived',
  ) {
    await this.db.transaction(async (tx) => {
      const [exam] = await tx
        .select({ status: exams.status })
        .from(exams)
        .where(and(eq(exams.id, id), eq(exams.ownerId, ownerId)))
        .for('update');
      if (!exam) throw new ApiError('NOT_FOUND');
      if (exam.status !== from)
        throw new ApiError('INVALID_STATE', { reason: 'EXAM_WRONG_STATUS' });
      await tx
        .update(exams)
        .set({ status: to, archivedAt: to === 'archived' ? sql`now()` : null })
        .where(eq(exams.id, id));
    });
    return { id };
  }

  /** Mọi vấn đề chặn Phát hành, kèm bản chụp từng câu (dùng khi không có vấn đề nào). */
  private async inspect(db: Db, examId: string, lock = false) {
    const [exam] = await db.select().from(exams).where(eq(exams.id, examId));
    if (!exam) throw new ApiError('NOT_FOUND');
    const sections = await db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, examId))
      .orderBy(asc(examSections.sort));
    const itemQuery = db
      .select({
        itemId: examItems.id,
        sectionId: examItems.sectionId,
        points: examItems.points,
        question: questions,
      })
      .from(examItems)
      .innerJoin(questions, eq(questions.id, examItems.questionId))
      .where(eq(examItems.examId, examId))
      .orderBy(asc(examItems.sort));
    const items = await (lock ? itemQuery.for('share', { of: questions }) : itemQuery);

    const imageIdsOf = (q: typeof questions.$inferSelect) =>
      richTextFieldsOf({ type: q.type, stem: q.stem, payload: q.payload } as Parameters<
        typeof richTextFieldsOf
      >[0]).flatMap((field) => imageNodesOf(field.doc).map((node) => node.illustrationId));
    const wanted = [...new Set(items.flatMap((item) => imageIdsOf(item.question)))];
    const images = new Map(
      (wanted.length === 0
        ? []
        : await db.select().from(illustrations).where(inArray(illustrations.id, wanted))
      ).map((row) => [row.id, row]),
    );

    const problems: PublishProblem[] = [];
    const snapshots = new Map<string, ItemSnapshot>();
    if (exam.title.trim() === '') problems.push({ code: 'title_missing' });
    if (items.length === 0) problems.push({ code: 'empty_exam' });
    else {
      for (const section of sections) {
        if (!items.some((item) => item.sectionId === section.id)) {
          problems.push({ code: 'empty_section', sectionId: section.id });
        }
      }
    }
    for (const { itemId, sectionId, points, question: q } of items) {
      const at = { questionId: q.id, sectionId };
      if (q.archivedAt !== null) problems.push({ code: 'question_archived', ...at });
      if (!pointsValid(Number(points))) problems.push({ code: 'points_invalid', ...at });
      const parsed = questionInputSchema.safeParse({
        type: q.type,
        topicId: q.topicId,
        stem: q.stem,
        defaultPoints: Number(q.defaultPoints),
        tags: q.tags,
        payload: q.payload,
      });
      if (!parsed.success) problems.push({ code: 'question_invalid', ...at });
      const used = imageIdsOf(q);
      if (used.some((imageId) => images.get(imageId)?.status !== 'ready')) {
        problems.push({ code: 'illustration_not_ready', ...at });
      }
      snapshots.set(itemId, {
        questionId: q.id,
        questionVersion: q.version,
        type: q.type,
        stem: q.stem,
        payload: q.payload,
        illustrations: [...new Set(used)].flatMap((imageId) => {
          const row = images.get(imageId);
          return row
            ? [{ id: row.id, width: row.width, height: row.height, variants: row.variants }]
            : [];
        }),
      });
    }
    return { problems, snapshots };
  }
}
