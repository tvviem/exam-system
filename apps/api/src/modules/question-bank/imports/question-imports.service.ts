import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Actor } from '../../../common/actor';
import { ApiError, validationFailed } from '../../../common/api-error';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Page, paginate } from '../../../common/pagination';
import { MAX_UPLOAD_BYTES, sniffUpload } from '../../../common/spreadsheet';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { JOB_QUEUE, type JobQueue } from '../../../queue/job-queue';
import { questionImportBatches, questionImportItems, topics } from '../question-bank.schema';
import { TopicsService } from '../topics.service';

const FILENAME_MAX = 255;
/** Lô sống 30 ngày để xem lại (Q146). */
export const IMPORT_RETENTION_DAYS = 30;
const MAX_SELECTION_IDS = 500;

export type ImportKind = 'valid' | 'duplicate' | 'error';

export interface ItemSelection {
  itemIds?: string[];
  group?: 'valid' | 'duplicate';
  selected: boolean;
}

// Loại của một dòng, suy ra từ các cột: lỗi → 'error'; có dấu hiệu trùng → 'duplicate'; còn lại 'valid'.
const hasError = isNotNull(questionImportItems.errorCode);
const isDuplicate = or(
  isNotNull(questionImportItems.duplicateOfQuestionId),
  isNotNull(questionImportItems.duplicateOfRow),
);
const kindSql = sql<ImportKind>`case
  when ${hasError} then 'error'
  when ${isDuplicate} then 'duplicate'
  else 'valid' end`;

const kindCondition = (kind: ImportKind): SQL | undefined =>
  kind === 'error'
    ? hasError
    : kind === 'duplicate'
      ? and(isNull(questionImportItems.errorCode), isDuplicate)
      : and(
          isNull(questionImportItems.errorCode),
          isNull(questionImportItems.duplicateOfQuestionId),
          isNull(questionImportItems.duplicateOfRow),
        );

/** Lô nhập Câu hỏi từ Excel của Người ra đề (Q123, Q146). Mọi truy cập lọc theo `owner_id`. */
@Injectable()
export class QuestionImportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly topics: TopicsService,
  ) {}

  /** Lưu file vào MediaStore, tạo lô `parsing` rồi xếp job đọc file. */
  async create(
    ownerId: string,
    upload: { topicId: string | null; filename: string; content: Buffer },
  ) {
    if (!upload.topicId) throw validationFailed('topicId', 'topic_required');
    if (upload.content.length > MAX_UPLOAD_BYTES) throw validationFailed('file', 'file_too_large');
    if (!sniffUpload(upload.content)) throw validationFailed('file', 'unsupported_file');
    await this.topics.requireUsable(ownerId, upload.topicId);

    const id = uuidv7();
    const uploadKey = `uploads/question-imports/${id}`;
    const now = this.clock.now();
    await this.media.put(uploadKey, upload.content);
    try {
      await this.db.insert(questionImportBatches).values({
        id,
        ownerId,
        topicId: upload.topicId,
        originalFilename: path.basename(upload.filename).slice(0, FILENAME_MAX) || 'cau-hoi',
        uploadKey,
        status: 'parsing',
        createdAt: now,
        expiresAt: new Date(now.getTime() + IMPORT_RETENTION_DAYS * 86_400_000),
      });
    } catch (error) {
      await this.media.delete(uploadKey);
      throw error;
    }
    try {
      await this.queue.enqueue('question-import.parse', { batchId: id });
    } catch (error) {
      // Không xếp được job (Redis hỏng): đừng để lô kẹt ở "đang đọc" mãi mãi.
      await this.db
        .update(questionImportBatches)
        .set({ status: 'parse_failed', parseError: 'internal_error', uploadKey: null })
        .where(eq(questionImportBatches.id, id));
      await this.media.delete(uploadKey);
      throw error;
    }
    return { id, status: 'parsing' as const };
  }

  list(ownerId: string, page: Page) {
    const where = eq(questionImportBatches.ownerId, ownerId);
    return paginate(
      page,
      () => this.db.select({ total: count() }).from(questionImportBatches).where(where),
      (limit, offset) =>
        this.db
          .select({
            id: questionImportBatches.id,
            status: questionImportBatches.status,
            originalFilename: questionImportBatches.originalFilename,
            topicId: questionImportBatches.topicId,
            topicName: topics.name,
            rowCount: questionImportBatches.rowCount,
            createdCount: questionImportBatches.createdCount,
            createdAt: questionImportBatches.createdAt,
            committedAt: questionImportBatches.committedAt,
          })
          .from(questionImportBatches)
          .innerJoin(topics, eq(topics.id, questionImportBatches.topicId))
          .where(where)
          .orderBy(desc(questionImportBatches.createdAt), desc(questionImportBatches.id))
          .limit(limit)
          .offset(offset),
    );
  }

  async detail(ownerId: string, id: string) {
    const [batch] = await this.db
      .select({
        id: questionImportBatches.id,
        status: questionImportBatches.status,
        parseError: questionImportBatches.parseError,
        originalFilename: questionImportBatches.originalFilename,
        topicId: topics.id,
        topicName: topics.name,
        rowCount: questionImportBatches.rowCount,
        createdCount: questionImportBatches.createdCount,
        createdAt: questionImportBatches.createdAt,
        committedAt: questionImportBatches.committedAt,
        expiresAt: questionImportBatches.expiresAt,
      })
      .from(questionImportBatches)
      .innerJoin(topics, eq(topics.id, questionImportBatches.topicId))
      .where(and(eq(questionImportBatches.id, id), eq(questionImportBatches.ownerId, ownerId)));
    if (!batch) throw new ApiError('NOT_FOUND');
    const { topicId, topicName, ...rest } = batch;
    return { ...rest, topic: { id: topicId, name: topicName }, counts: await this.countsOf(id) };
  }

  async items(ownerId: string, id: string, { page, pageSize, kind }: Page & { kind?: ImportKind }) {
    await this.requireOwned(ownerId, id);
    const where = and(eq(questionImportItems.batchId, id), kind ? kindCondition(kind) : undefined);
    return paginate(
      { page, pageSize },
      () => this.db.select({ total: count() }).from(questionImportItems).where(where),
      async (limit, offset) => {
        const rows = await this.db
          .select({
            id: questionImportItems.id,
            rowNumber: questionImportItems.rowNumber,
            kind: kindSql,
            errorCode: questionImportItems.errorCode,
            duplicateOfQuestionId: questionImportItems.duplicateOfQuestionId,
            duplicateOfRow: questionImportItems.duplicateOfRow,
            selected: questionImportItems.selected,
            outcome: questionImportItems.outcome,
            draft: questionImportItems.payload,
          })
          .from(questionImportItems)
          .where(where)
          .orderBy(asc(questionImportItems.rowNumber))
          .limit(limit)
          .offset(offset);
        return rows.map(({ draft, ...row }) => ({
          ...row,
          type: draft?.type ?? null,
          stem: draft?.stem ?? null,
          payload: draft?.payload ?? null,
          defaultPoints: draft?.defaultPoints ?? null,
          tags: draft?.tags ?? null,
        }));
      },
    );
  }

  /** Bật hoặc tắt chọn cho các dòng nêu bằng id, hoặc cho cả nhóm hợp lệ / nghi trùng. Dòng lỗi không chọn được. */
  async select(ownerId: string, id: string, selection: ItemSelection) {
    await this.db.transaction(async (tx) => {
      const batch = await this.lockOwned(tx, ownerId, id);
      if (batch.status !== 'ready')
        throw new ApiError('INVALID_STATE', { reason: 'BATCH_NOT_READY' });
      const inBatch = eq(questionImportItems.batchId, id);

      if (selection.group) {
        await tx
          .update(questionImportItems)
          .set({ selected: selection.selected })
          .where(and(inBatch, kindCondition(selection.group)));
        return;
      }
      const ids = [...new Set(selection.itemIds ?? [])];
      if (ids.length === 0 || ids.length > MAX_SELECTION_IDS) {
        throw validationFailed('itemIds', 'invalid');
      }
      const found = await tx
        .select({ id: questionImportItems.id, errorCode: questionImportItems.errorCode })
        .from(questionImportItems)
        .where(and(inBatch, inArray(questionImportItems.id, ids)));
      if (found.length !== ids.length) throw validationFailed('itemIds', 'unknown_item');
      if (selection.selected && found.some((item) => item.errorCode)) {
        throw validationFailed('itemIds', 'item_has_error');
      }
      await tx
        .update(questionImportItems)
        .set({ selected: selection.selected })
        .where(and(inBatch, inArray(questionImportItems.id, ids)));
    });
    return { counts: await this.countsOf(id) };
  }

  /** `ready → committing` đúng một lần, rồi xếp job tạo Câu hỏi. Lần gọi sau nhận INVALID_STATE. */
  async commit(actor: Actor, id: string) {
    await this.db.transaction(async (tx) => {
      const batch = await this.lockOwned(tx, actor.id, id);
      if (batch.status !== 'ready')
        throw new ApiError('INVALID_STATE', { reason: 'BATCH_NOT_READY' });
      await this.topics.requireUsable(actor.id, batch.topicId);
      const [{ chosen } = { chosen: 0 }] = await tx
        .select({ chosen: count() })
        .from(questionImportItems)
        .where(
          and(
            eq(questionImportItems.batchId, id),
            eq(questionImportItems.selected, true),
            isNull(questionImportItems.errorCode),
          ),
        );
      if (chosen === 0) throw validationFailed('itemIds', 'nothing_to_import');
      await tx
        .update(questionImportBatches)
        .set({ status: 'committing', commitRequestedAt: this.clock.now() })
        .where(eq(questionImportBatches.id, id));
    });
    try {
      await this.queue.enqueue('question-import.commit', {
        batchId: id,
        actorId: actor.id,
        actorIp: actor.ip,
      });
    } catch (error) {
      await this.db
        .update(questionImportBatches)
        .set({ status: 'ready', commitRequestedAt: null })
        .where(eq(questionImportBatches.id, id));
      throw error;
    }
    return { id, status: 'committing' as const };
  }

  private async countsOf(id: string) {
    const [row] = await this.db
      .select({
        valid: sql<number>`count(*) filter (where ${kindCondition('valid')})::int`,
        duplicate: sql<number>`count(*) filter (where ${kindCondition('duplicate')})::int`,
        error: sql<number>`count(*) filter (where ${hasError})::int`,
        selected: sql<number>`count(*) filter (where ${questionImportItems.selected})::int`,
        // Để giao diện hiện ô chọn nhóm ở trạng thái chọn một phần.
        selectedValid: sql<number>`count(*) filter (where ${questionImportItems.selected} and ${kindCondition('valid')})::int`,
        selectedDuplicate: sql<number>`count(*) filter (where ${questionImportItems.selected} and ${kindCondition('duplicate')})::int`,
      })
      .from(questionImportItems)
      .where(eq(questionImportItems.batchId, id));
    return (
      row ?? {
        valid: 0,
        duplicate: 0,
        error: 0,
        selected: 0,
        selectedValid: 0,
        selectedDuplicate: 0,
      }
    );
  }

  private async requireOwned(ownerId: string, id: string) {
    const [batch] = await this.db
      .select({ id: questionImportBatches.id })
      .from(questionImportBatches)
      .where(and(eq(questionImportBatches.id, id), eq(questionImportBatches.ownerId, ownerId)));
    if (!batch) throw new ApiError('NOT_FOUND');
  }

  /** Khóa dòng lô của chủ này để `select` và `commit` không chạy chồng lên nhau. */
  private async lockOwned(tx: Pick<Database, 'select'>, ownerId: string, id: string) {
    const [batch] = await tx
      .select({ status: questionImportBatches.status, topicId: questionImportBatches.topicId })
      .from(questionImportBatches)
      .where(and(eq(questionImportBatches.id, id), eq(questionImportBatches.ownerId, ownerId)))
      .for('update');
    if (!batch) throw new ApiError('NOT_FOUND');
    return batch;
  }
}
