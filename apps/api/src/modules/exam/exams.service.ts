import {
  type CandidateSource,
  candidateViewOf,
  type ExamContent,
  examLayoutProblems,
  normalizeForSearch,
  plainTextOf,
  textDoc,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { type Page, paginate } from '../../common/pagination';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { questions, topics } from '../question-bank/question-bank.schema';
import { examItems, examSections, exams } from './exam.schema';

const PREVIEW_CHARS = 160;
const isForeignKeyViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23503';
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

type Db = Pick<Database, 'select'>;
type ExamStatus = (typeof exams.$inferSelect)['status'];
type Issue = { path: string; code: string };

/** `VALIDATION_FAILED` với nhiều lỗi một lần, để giao diện chỉ ra mọi chỗ sai trong một lần lưu. */
const invalid = (issues: Issue[]) => new ApiError('VALIDATION_FAILED', { issues });

/** Bộ đề của Người ra đề (Q160–Q163). Mọi truy cập lọc theo `owner_id`; của người khác coi như không tồn tại. */
@Injectable()
export class ExamsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Tạo Bộ đề nháp với đúng một Phần mặc định không tiêu đề (Q161). */
  async create(ownerId: string, title: string) {
    const id = await this.db.transaction(async (tx) => {
      const [exam] = await tx
        .insert(exams)
        .values({ ownerId, title, instructions: textDoc('') })
        .returning({ id: exams.id });
      if (!exam) throw new Error('Không tạo được Bộ đề');
      await tx
        .insert(examSections)
        .values({ examId: exam.id, title: null, instructions: textDoc(''), sort: 0 });
      return exam.id;
    });
    return this.detail(this.db, ownerId, id);
  }

  async list(ownerId: string, filter: { status?: ExamStatus; q?: string }, page: Page) {
    const q = filter.q ? normalizeForSearch(filter.q) : '';
    const where = and(
      eq(exams.ownerId, ownerId),
      // Mặc định chỉ Nháp và Đã phát hành (Q180); Đã lưu trữ phải chọn.
      filter.status
        ? eq(exams.status, filter.status)
        : inArray(exams.status, ['draft', 'published']),
      q ? sql`unaccent(lower(${exams.title})) LIKE ${`%${escapeLike(q)}%`}` : undefined,
    );
    const result = await paginate(
      page,
      () => this.db.select({ total: sql<number>`count(*)::int` }).from(exams).where(where),
      (limit, offset) =>
        this.db
          .select({
            id: exams.id,
            title: exams.title,
            status: exams.status,
            publishedAt: exams.publishedAt,
            updatedAt: exams.updatedAt,
            // Viết tên bảng đầy đủ: drizzle bỏ tiền tố bảng trong truy vấn một bảng, "id" sẽ chỉ nhầm sang exam_items.
            itemCount: sql<number>`(select count(*)::int from exam_items where exam_items.exam_id = exams.id)`,
            totalPoints: sql<string>`(select coalesce(sum(exam_items.points), 0) from exam_items where exam_items.exam_id = exams.id)`,
          })
          .from(exams)
          .where(where)
          .orderBy(desc(exams.updatedAt), desc(exams.id))
          .limit(limit)
          .offset(offset),
    );
    return {
      ...result,
      items: result.items.map((row) => ({ ...row, totalPoints: Number(row.totalPoints) })),
    };
  }

  get(ownerId: string, id: string) {
    return this.detail(this.db, ownerId, id);
  }

  /**
   * Lưu cả tài liệu của Bộ đề nháp trong một giao dịch (Q163): thay Phần và các câu, giữ id của Phần đã có.
   * `version` lệch là CONFLICT; một lỗi bất kỳ thì không đổi gì.
   */
  async update(ownerId: string, id: string, content: ExamContent) {
    await this.db.transaction(async (tx) => {
      const exam = await this.lockDraft(tx, ownerId, id);
      if (exam.version !== content.version) throw new ApiError('CONFLICT', { field: 'version' });

      const issues: Issue[] = examLayoutProblems(content).map(({ code, path }) => ({ path, code }));
      issues.push(...(await this.referenceProblems(tx, ownerId, id, content)));
      if (issues.length > 0) throw invalid(issues);

      try {
        await this.replaceLayout(tx, id, content);
      } catch (error) {
        // Câu bị xóa đúng giữa lúc kiểm tra và lúc ghi: khóa ngoại từ chối, báo như câu không còn thay vì lỗi 500.
        if (isForeignKeyViolation(error))
          throw invalid([{ path: 'sections', code: 'unknown_question' }]);
        throw error;
      }
    });
    return this.detail(this.db, ownerId, id);
  }

  /** Thay Phần và câu của Bộ đề nháp bằng nội dung mới, giữ id của Phần đã có. */
  private async replaceLayout(tx: Transaction, id: string, content: ExamContent) {
    await tx.delete(examItems).where(eq(examItems.examId, id));
    const keep = content.sections.flatMap((s) => (s.id ? [s.id] : []));
    await tx.delete(examSections).where(
      and(
        eq(examSections.examId, id),
        keep.length > 0
          ? sql`${examSections.id} NOT IN (${sql.join(
              keep.map((k) => sql`${k}`),
              sql`, `,
            )})`
          : undefined,
      ),
    );

    for (const [sort, section] of content.sections.entries()) {
      const values = { title: section.title || null, instructions: section.instructions, sort };
      let sectionId = section.id;
      if (sectionId) {
        await tx.update(examSections).set(values).where(eq(examSections.id, sectionId));
      } else {
        const [row] = await tx
          .insert(examSections)
          .values({ examId: id, ...values })
          .returning({ id: examSections.id });
        sectionId = row?.id;
      }
      if (!sectionId) throw new Error('Không lưu được Phần');
      if (section.items.length > 0) {
        await tx.insert(examItems).values(
          section.items.map((item, position) => ({
            examId: id,
            sectionId: sectionId as string,
            questionId: item.questionId,
            points: String(item.points),
            sort: position,
          })),
        );
      }
    }
    await tx
      .update(exams)
      .set({
        title: content.title,
        instructions: content.instructions,
        version: sql`${exams.version} + 1`,
      })
      .where(eq(exams.id, id));
  }

  /** Xóa hẳn Bộ đề nháp; Phần và các dòng đi theo (CASCADE). */
  async remove(ownerId: string, id: string) {
    await this.db.transaction(async (tx) => {
      await this.lockDraft(tx, ownerId, id);
      await tx.delete(exams).where(eq(exams.id, id));
    });
  }

  /** Khóa dòng Bộ đề của chủ này; Bộ đề không còn là nháp thì `INVALID_STATE` (Q160). */
  private async lockDraft(tx: Transaction, ownerId: string, id: string) {
    const [exam] = await tx
      .select({ status: exams.status, version: exams.version })
      .from(exams)
      .where(and(eq(exams.id, id), eq(exams.ownerId, ownerId)))
      .for('update');
    if (!exam) throw new ApiError('NOT_FOUND');
    if (exam.status !== 'draft') throw new ApiError('INVALID_STATE', { reason: 'EXAM_NOT_DRAFT' });
    return exam;
  }

  /**
   * Câu hỏi phải của chính người này; câu đã Lưu trữ chỉ được giữ nếu đã có trong Bộ đề, không thêm mới (Q162, Q166).
   * Phần nêu id phải thuộc Bộ đề này.
   */
  private async referenceProblems(
    tx: Transaction,
    ownerId: string,
    examId: string,
    content: ExamContent,
  ): Promise<Issue[]> {
    const issues: Issue[] = [];
    const wanted = content.sections.flatMap((s) => s.items.map((i) => i.questionId));
    const [found, current, currentSections] = await Promise.all([
      wanted.length === 0
        ? []
        : tx
            .select({ id: questions.id, archivedAt: questions.archivedAt })
            .from(questions)
            .where(and(eq(questions.ownerId, ownerId), inArray(questions.id, wanted))),
      tx
        .select({ questionId: examItems.questionId })
        .from(examItems)
        .where(eq(examItems.examId, examId)),
      tx.select({ id: examSections.id }).from(examSections).where(eq(examSections.examId, examId)),
    ]);
    const byId = new Map(found.map((q) => [q.id, q]));
    const already = new Set(current.map((i) => i.questionId));
    const sectionIds = new Set(currentSections.map((s) => s.id));

    content.sections.forEach((section, s) => {
      if (section.id && !sectionIds.has(section.id)) {
        issues.push({ path: `sections.${s}.id`, code: 'unknown_section' });
      }
      section.items.forEach((item, i) => {
        const path = `sections.${s}.items.${i}.questionId`;
        const question = byId.get(item.questionId);
        if (!question) issues.push({ path, code: 'unknown_question' });
        else if (question.archivedAt && !already.has(item.questionId)) {
          issues.push({ path, code: 'question_archived' });
        }
      });
    });
    return issues;
  }

  /**
   * Xem thử (Q169, Q170): nội dung như Người dự thi thấy, do server làm sạch bằng `candidateViewOf`.
   * Bộ đề nháp lấy nội dung hiện tại của Câu hỏi.
   */
  async preview(ownerId: string, id: string, options: { showScoringRules: boolean }) {
    const [exam] = await this.db
      .select()
      .from(exams)
      .where(and(eq(exams.id, id), eq(exams.ownerId, ownerId)));
    if (!exam) throw new ApiError('NOT_FOUND');
    const [sections, items] = await Promise.all([
      this.db
        .select()
        .from(examSections)
        .where(eq(examSections.examId, id))
        .orderBy(asc(examSections.sort)),
      this.db
        .select({
          sectionId: examItems.sectionId,
          questionId: examItems.questionId,
          points: examItems.points,
          type: questions.type,
          stem: questions.stem,
          payload: questions.payload,
        })
        .from(examItems)
        .innerJoin(questions, eq(questions.id, examItems.questionId))
        .where(eq(examItems.examId, id))
        .orderBy(asc(examItems.sort)),
    ]);
    let number = 0;
    const ordered = sections.map((section) => ({
      id: section.id,
      title: section.title,
      instructions: section.instructions,
      items: items
        .filter((item) => item.sectionId === section.id)
        .map((item) => ({
          number: ++number,
          questionId: item.questionId,
          points: Number(item.points),
          question: candidateViewOf(
            { type: item.type, stem: item.stem, payload: item.payload } as CandidateSource,
            options,
          ),
        })),
    }));
    const units = items.reduce((sum, item) => sum + Math.round(Number(item.points) * 100), 0);
    return {
      id: exam.id,
      title: exam.title,
      instructions: exam.instructions,
      status: exam.status,
      showScoringRules: options.showScoringRules,
      sections: ordered,
      totals: { items: items.length, points: units / 100 },
    };
  }

  private async detail(db: Db, ownerId: string, id: string) {
    const [exam] = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, id), eq(exams.ownerId, ownerId)));
    if (!exam) throw new ApiError('NOT_FOUND');
    const [sections, items] = await Promise.all([
      db
        .select()
        .from(examSections)
        .where(eq(examSections.examId, id))
        .orderBy(asc(examSections.sort)),
      db
        .select({
          sectionId: examItems.sectionId,
          questionId: examItems.questionId,
          points: examItems.points,
          type: questions.type,
          stem: questions.stem,
          topicName: topics.name,
          tags: questions.tags,
          defaultPoints: questions.defaultPoints,
          archivedAt: questions.archivedAt,
        })
        .from(examItems)
        .innerJoin(questions, eq(questions.id, examItems.questionId))
        .innerJoin(topics, eq(topics.id, questions.topicId))
        .where(eq(examItems.examId, id))
        .orderBy(asc(examItems.sort)),
    ]);
    const totalUnits = items.reduce((sum, item) => sum + Math.round(Number(item.points) * 100), 0);
    return {
      id: exam.id,
      title: exam.title,
      instructions: exam.instructions,
      status: exam.status,
      version: exam.version,
      publishedAt: exam.publishedAt,
      updatedAt: exam.updatedAt,
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        instructions: section.instructions,
        items: items
          .filter((item) => item.sectionId === section.id)
          .map((item) => ({
            questionId: item.questionId,
            points: Number(item.points),
            question: {
              type: item.type,
              preview: plainTextOf(item.stem).slice(0, PREVIEW_CHARS),
              topicName: item.topicName,
              tags: item.tags,
              defaultPoints: Number(item.defaultPoints),
              archived: item.archivedAt !== null,
            },
          })),
      })),
      totals: { items: items.length, points: totalUnits / 100 },
    };
  }
}
