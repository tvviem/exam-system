import { createHash } from 'node:crypto';
import { imageNodesOf, type QuestionInput, richTextFieldsOf } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ApiError, validationFailed } from '../../../common/api-error';
import { type Page, paginate } from '../../../common/pagination';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { JOB_QUEUE, type JobQueue } from '../../../queue/job-queue';
import { illustrations, questionIllustrations } from '../question-bank.schema';
import { MAX_ILLUSTRATION_UPLOAD_BYTES, sniffImage } from './image-processing';

export const uploadKeyOf = (id: string) => `tmp/illustrations/${id}`;
export const variantKeyOf = (id: string, side: number) => `illustrations/${id}/${side}.webp`;

type Row = typeof illustrations.$inferSelect;
type Db = Pick<Database, 'select' | 'insert' | 'delete'>;

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
  ) {}

  /** Nhận ảnh, đẩy vào hàng đợi xử lý. Tải trùng nội dung thì trả lại ảnh có sẵn (Q139). */
  async upload(ownerId: string, content: Buffer) {
    if (content.length === 0) throw validationFailed('file', 'required');
    if (content.length > MAX_ILLUSTRATION_UPLOAD_BYTES) {
      throw validationFailed('file', 'file_too_large');
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
      [row] = existing
        ? await this.db
            .update(illustrations)
            .set({ status: 'processing', failureReason: null, bytes: content.length })
            .where(eq(illustrations.id, id))
            .returning()
        : await this.db
            .insert(illustrations)
            .values({ id, ownerId, sha256, status: 'processing', bytes: content.length })
            .returning();
      await this.queue.enqueue('illustration.process', { illustrationId: id });
    } catch (error) {
      await this.media.delete(uploadKeyOf(id));
      if (!existing) await this.db.delete(illustrations).where(eq(illustrations.id, id));
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
    return {
      ...result,
      items: result.items.map(({ illustration, inUse }) => present(illustration, inUse)),
    };
  }

  /** Chỉ xóa được ảnh chưa Câu hỏi nào dùng. */
  async remove(ownerId: string, id: string) {
    const row = await this.load(ownerId, id);
    try {
      await this.db.transaction(async (tx) => {
        if (await this.isUsed(tx, id)) {
          throw new ApiError('INVALID_STATE', { reason: 'ILLUSTRATION_IN_USE' });
        }
        await tx.delete(illustrations).where(eq(illustrations.id, id));
      });
    } catch (error) {
      // Có Câu hỏi gắn ảnh này ngay lúc xóa: khóa ngoại chặn lại.
      if ((error as { cause?: { code?: string } }).cause?.code === '23503') {
        throw new ApiError('INVALID_STATE', { reason: 'ILLUSTRATION_IN_USE' });
      }
      throw error;
    }
    await this.media.delete(uploadKeyOf(id));
    for (const side of row.variants) await this.media.delete(variantKeyOf(id, side));
    return { id };
  }

  /** Khóa file của biến thể lớn nhất không vượt quá `side` (ảnh nhỏ hơn thì được chính nó). */
  async variantKey(ownerId: string, id: string, side: number): Promise<string> {
    const row = await this.load(ownerId, id);
    if (row.status !== 'ready') throw new ApiError('NOT_FOUND');
    const fit = row.variants.filter((v) => v <= side).sort((a, b) => b - a)[0] ?? row.variants[0];
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
      await tx
        .insert(questionIllustrations)
        .values(wanted.map((illustrationId) => ({ questionId, illustrationId })));
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
    return row !== undefined;
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
