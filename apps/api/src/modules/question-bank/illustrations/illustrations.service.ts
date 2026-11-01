import { createHash } from 'node:crypto';
import { imageNodesOf, type QuestionInput, richTextFieldsOf } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ApiError, validationFailed } from '../../../common/api-error';
import { EXAM_USAGE, type ExamUsage } from '../../../common/exam-usage';
import { type Page, paginate } from '../../../common/pagination';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { JOB_QUEUE, type JobQueue } from '../../../queue/job-queue';
import { illustrations, questionIllustrations } from '../question-bank.schema';
import { uploadKeyOf, variantKeyOf } from './illustration-keys';
import { MAX_ILLUSTRATION_UPLOAD_BYTES, sniffImage } from './image-processing';

type Row = typeof illustrations.$inferSelect;
type Db = Pick<Database, 'select' | 'insert' | 'delete'>;

const isForeignKeyViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23503';

const present = (row: Row, inUse: boolean) => ({
  id: row.id,
  status: row.status,
  failureReason: row.failureReason,
  width: row.width,
  height: row.height,
  variants: row.variants,
  bytes: row.bytes,
  inUse,
  createdAt: row.createdAt,
});

/** Hình minh họa của Người ra đề. Mọi truy cập lọc theo `owner_id`; ảnh của người khác coi như không tồn tại. */
@Injectable()
export class IllustrationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(ENV) private readonly env: Env,
    @Inject(EXAM_USAGE) private readonly examUsage: ExamUsage,
  ) {}

  /** Nhận ảnh, đẩy vào hàng đợi xử lý. Tải trùng nội dung thì trả lại ảnh có sẵn (Q139). */
  async upload(ownerId: string, content: Buffer) {
    if (content.length === 0) throw validationFailed('file', 'required');
    if (content.length > MAX_ILLUSTRATION_UPLOAD_BYTES) {
      throw validationFailed('file', 'image_too_large');
    }
    if (!sniffImage(content)) throw validationFailed('file', 'unsupported_type');

    const sha256 = createHash('sha256').update(content).digest('hex');
    const [existing] = await this.db
      .select()
      .from(illustrations)
      .where(and(eq(illustrations.ownerId, ownerId), eq(illustrations.sha256, sha256)));
    if (existing && existing.status !== 'failed') {
      return { ...present(existing, await this.isUsed(this.db, existing.id)), reused: true };
    }
    await this.assertWithinQuota(ownerId);

    const id = existing?.id ?? uuidv7();
    // Ghi file tạm trước khi có dòng trong cơ sở dữ liệu: job chỉ chạy khi file đã nằm sẵn trong MediaStore.
    await this.media.put(uploadKeyOf(id), content);
    let row: Row | undefined;
    try {
      if (existing) {
        [row] = await this.db
          .update(illustrations)
          .set({ status: 'processing', failureReason: null, bytes: content.length })
          .where(eq(illustrations.id, id))
          .returning();
      } else {
        // Hai lần tải cùng một ảnh gần như đồng thời (bấm đúp, thử lại trên mạng yếu): chỉ một lần được tạo,
        // lần còn lại dùng lại ảnh đó.
        [row] = await this.db
          .insert(illustrations)
          .values({ id, ownerId, sha256, status: 'processing', bytes: content.length })
          .onConflictDoNothing()
          .returning();
        if (!row) {
          await this.media.delete(uploadKeyOf(id));
          const [winner] = await this.db
            .select()
            .from(illustrations)
            .where(and(eq(illustrations.ownerId, ownerId), eq(illustrations.sha256, sha256)));
          if (!winner) throw new Error('Không lưu được Hình minh họa');
          return { ...present(winner, await this.isUsed(this.db, winner.id)), reused: true };
        }
      }
      await this.queue.enqueue('illustration.process', { illustrationId: id });
    } catch (error) {
      await this.media.delete(uploadKeyOf(id));
      if (existing) {
        // Trả ảnh lỗi về trạng thái cũ để lần tải sau xử lý lại được, thay vì kẹt ở "đang xử lý".
        await this.db
          .update(illustrations)
          .set({ status: 'failed', failureReason: existing.failureReason, bytes: 0 })
          .where(eq(illustrations.id, id));
      } else {
        await this.db.delete(illustrations).where(eq(illustrations.id, id));
      }
      throw error;
    }
    if (!row) throw new Error('Không lưu được Hình minh họa');
    return { ...present(row, false), reused: false };
  }

  async get(ownerId: string, id: string) {
    const row = await this.load(ownerId, id);
    return present(row, await this.isUsed(this.db, id));
  }

  async list(ownerId: string, page: Page) {
    const where = eq(illustrations.ownerId, ownerId);
    const result = await paginate(
      page,
      () => this.db.select({ total: sql<number>`count(*)::int` }).from(illustrations).where(where),
      (limit, offset) =>
        this.db
          .select({
            illustration: illustrations,
            inUse: sql<boolean>`exists (select 1 from ${questionIllustrations} where ${questionIllustrations.illustrationId} = ${illustrations.id})`,
          })
          .from(illustrations)
          .where(where)
          .orderBy(desc(illustrations.createdAt), desc(illustrations.id))
          .limit(limit)
          .offset(offset),
    );
    const inExams = await this.examUsage.usedIllustrations(
      result.items.map(({ illustration }) => illustration.id),
    );
    return {
      ...result,
      items: result.items.map(({ illustration, inUse }) =>
        present(illustration, inUse || inExams.has(illustration.id)),
      ),
    };
  }

  /** Chỉ xóa được ảnh chưa Câu hỏi nào dùng. */
  async remove(ownerId: string, id: string) {
    await this.load(ownerId, id);
    let variants: number[];
    try {
      variants = await this.db.transaction(async (tx) => {
        if (await this.isUsed(tx, id)) {
          throw new ApiError('INVALID_STATE', { reason: 'ILLUSTRATION_IN_USE' });
        }
        // Lấy danh sách biến thể từ chính dòng vừa xóa: job có thể vừa xử lý xong sau lúc đọc ở trên.
        const [deleted] = await tx
          .delete(illustrations)
          .where(eq(illustrations.id, id))
          .returning({ variants: illustrations.variants });
        return deleted?.variants ?? [];
      });
    } catch (error) {
      // Có Câu hỏi gắn ảnh này ngay lúc xóa: khóa ngoại chặn lại.
      if (isForeignKeyViolation(error)) {
        throw new ApiError('INVALID_STATE', { reason: 'ILLUSTRATION_IN_USE' });
      }
      throw error;
    }
    await this.media.delete(uploadKeyOf(id));
    for (const side of variants) await this.media.delete(variantKeyOf(id, side));
    return { id };
  }

  /**
   * Khóa file của biến thể lớn nhất không vượt quá `side` (ảnh nhỏ hơn thì được chính nó).
   * Xem được ảnh: chủ ảnh, hoặc chủ một Bộ đề đã Phát hành dùng ảnh đó (Q176).
   */
  async variantKey(userId: string, id: string, side: number): Promise<string> {
    const [found] = await this.db.select().from(illustrations).where(eq(illustrations.id, id));
    if (!found) throw new ApiError('NOT_FOUND');
    if (found.ownerId !== userId && !(await this.examUsage.canViewIllustration(userId, id))) {
      throw new ApiError('NOT_FOUND');
    }
    if (found.status !== 'ready') throw new ApiError('NOT_FOUND');
    const fit =
      found.variants.filter((v) => v <= side).sort((a, b) => b - a)[0] ?? found.variants[0];
    if (fit === undefined) throw new ApiError('NOT_FOUND');
    return variantKeyOf(id, fit);
  }

  /**
   * Gọi trong giao dịch lưu Câu hỏi: mọi ảnh phải là ảnh sẵn sàng của chính chủ, rồi ghi lại Câu hỏi đang dùng ảnh nào.
   * Lỗi trả `VALIDATION_FAILED` với `image_unavailable` ở từng trường có ảnh không dùng được.
   */
  async syncUsage(tx: Db, ownerId: string, questionId: string, input: QuestionInput) {
    const fields = richTextFieldsOf(input).map((field) => ({
      path: field.path,
      ids: imageNodesOf(field.doc).map((node) => node.illustrationId),
    }));
    const wanted = [...new Set(fields.flatMap((field) => field.ids))];
    const usable = new Set<string>();
    if (wanted.length > 0) {
      const rows = await tx
        .select({ id: illustrations.id })
        .from(illustrations)
        .where(
          and(
            inArray(illustrations.id, wanted),
            eq(illustrations.ownerId, ownerId),
            eq(illustrations.status, 'ready'),
          ),
        );
      for (const row of rows) usable.add(row.id);
    }
    const issues = fields
      .filter((field) => field.ids.some((id) => !usable.has(id)))
      .map((field) => ({ path: field.path, code: 'image_unavailable' }));
    if (issues.length > 0) throw new ApiError('VALIDATION_FAILED', { issues });

    await tx.delete(questionIllustrations).where(eq(questionIllustrations.questionId, questionId));
    if (wanted.length > 0) {
      try {
        await tx
          .insert(questionIllustrations)
          .values(wanted.map((illustrationId) => ({ questionId, illustrationId })));
      } catch (error) {
        // Ảnh vừa bị xóa giữa lúc kiểm tra và lúc ghi: báo như ảnh không dùng được thay vì lỗi máy chủ.
        if (!isForeignKeyViolation(error)) throw error;
        throw new ApiError('VALIDATION_FAILED', {
          issues: fields
            .filter((field) => field.ids.length > 0)
            .map((field) => ({ path: field.path, code: 'image_unavailable' })),
        });
      }
    }
  }

  /** Nhân bản Câu hỏi: bản sao dùng cùng các ảnh. */
  async copyUsage(tx: Db, fromQuestionId: string, toQuestionId: string) {
    const rows = await tx
      .select({ illustrationId: questionIllustrations.illustrationId })
      .from(questionIllustrations)
      .where(eq(questionIllustrations.questionId, fromQuestionId));
    if (rows.length > 0) {
      await tx
        .insert(questionIllustrations)
        .values(
          rows.map((row) => ({ questionId: toQuestionId, illustrationId: row.illustrationId })),
        );
    }
  }

  private async load(ownerId: string, id: string): Promise<Row> {
    const [row] = await this.db
      .select()
      .from(illustrations)
      .where(and(eq(illustrations.id, id), eq(illustrations.ownerId, ownerId)));
    if (!row) throw new ApiError('NOT_FOUND');
    return row;
  }

  private async isUsed(db: Pick<Database, 'select'>, id: string): Promise<boolean> {
    const [row] = await db
      .select({ one: sql<number>`1` })
      .from(questionIllustrations)
      .where(eq(questionIllustrations.illustrationId, id))
      .limit(1);
    if (row !== undefined) return true;
    return (await this.examUsage.usedIllustrations([id])).has(id);
  }

  /** Đã chiếm đủ hạn mức thì không nhận thêm; một ảnh có thể vượt nhẹ (Q139). */
  private async assertWithinQuota(ownerId: string) {
    const [row] = await this.db
      .select({ used: sql<number>`coalesce(sum(${illustrations.bytes}), 0)::bigint` })
      .from(illustrations)
      .where(eq(illustrations.ownerId, ownerId));
    if (Number(row?.used ?? 0) >= this.env.ILLUSTRATION_QUOTA_BYTES) {
      throw validationFailed('file', 'quota_exceeded');
    }
  }
}
