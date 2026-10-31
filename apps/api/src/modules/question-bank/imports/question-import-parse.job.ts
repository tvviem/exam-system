import { type QuestionType, searchTextOf } from '@exam/shared';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { JobRegistry } from '../../../queue/job-queue';
import { questionImportBatches, questionImportItems, questions } from '../question-bank.schema';
import {
  type ImportFileErrorCode,
  parseQuestionImportFile,
  QuestionImportFileError,
} from './question-import-file';

const INSERT_CHUNK = 500;

/** Job "question-import.parse": đọc file đã tải lên, kiểm tra từng dòng, đánh dấu nghi trùng (Q123, Q146). */
@Injectable()
export class QuestionImportParseJob implements OnModuleInit {
  private readonly logger = new Logger(QuestionImportParseJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('question-import.parse', ({ batchId }) => this.run(batchId));
  }

  async run(batchId: string): Promise<void> {
    const [batch] = await this.db
      .select()
      .from(questionImportBatches)
      .where(
        and(eq(questionImportBatches.id, batchId), eq(questionImportBatches.status, 'parsing')),
      );
    if (!batch?.uploadKey) return; // đã xử lý rồi (job chạy lại) hoặc không còn tồn tại

    try {
      const { rows } = await parseQuestionImportFile(await this.media.get(batch.uploadKey));
      const drafts = rows.map((row) => ({
        row,
        searchText: row.input ? searchTextOf({ ...row.input, topicId: batch.topicId }) : null,
      }));
      const existing = await this.existingBySearchText(
        batch.ownerId,
        batch.topicId,
        drafts.flatMap((d) => (d.searchText ? [d.searchText] : [])),
      );

      const firstRowOf = new Map<string, { type: QuestionType; row: number }>();
      const values = drafts.map(({ row, searchText }) => {
        const first = searchText ? (firstRowOf.get(searchText) ?? null) : null;
        if (searchText && first === null) {
          firstRowOf.set(searchText, { type: row.type, row: row.rowNumber });
        }
        const duplicateOfQuestionId = searchText ? (existing.get(searchText) ?? null) : null;
        return {
          batchId,
          type: row.type,
          rowNumber: row.rowNumber,
          payload: row.input,
          searchText,
          errorCode: row.error,
          duplicateOfQuestionId,
          duplicateOfRow: first?.row ?? null,
          duplicateOfType: first?.type ?? null,
          // Dòng hợp lệ chọn sẵn; nghi trùng để người dùng quyết định (Q146).
          selected: !row.error && duplicateOfQuestionId === null && first === null,
        };
      });

      await this.db.transaction(async (tx) => {
        // Khóa dòng: hai lần chạy song song (BullMQ giao lại job) thì lần sau thấy không còn `parsing` và thôi.
        const [current] = await tx
          .select({ id: questionImportBatches.id })
          .from(questionImportBatches)
          .where(
            and(eq(questionImportBatches.id, batchId), eq(questionImportBatches.status, 'parsing')),
          )
          .for('update');
        if (!current) return;
        for (let i = 0; i < values.length; i += INSERT_CHUNK) {
          await tx.insert(questionImportItems).values(values.slice(i, i + INSERT_CHUNK));
        }
        await tx
          .update(questionImportBatches)
          .set({ status: 'ready', rowCount: values.length, uploadKey: null })
          .where(eq(questionImportBatches.id, batchId));
      });
    } catch (error) {
      const code: ImportFileErrorCode | 'internal_error' =
        error instanceof QuestionImportFileError ? error.code : 'internal_error';
      if (code === 'internal_error') this.logger.error(`Đọc lô nhập ${batchId} lỗi`, error);
      // Lỗi gắn với một sheet thì ghi kèm tên sheet sau dấu hai chấm: `missing_columns:Chọn một`.
      const parseError =
        error instanceof QuestionImportFileError && error.sheet ? `${code}:${error.sheet}` : code;
      await this.db
        .update(questionImportBatches)
        .set({ status: 'parse_failed', parseError, uploadKey: null })
        .where(
          and(eq(questionImportBatches.id, batchId), eq(questionImportBatches.status, 'parsing')),
        );
    }
    // Chỉ xóa file khi trạng thái mới đã được ghi: nếu bước trên cũng lỗi thì file còn đó để dọn sau.
    await this.media.delete(batch.uploadKey);
  }

  /** `search_text` → id một Câu hỏi đã có trong Chủ đề đích với đúng nội dung đó. */
  private async existingBySearchText(ownerId: string, topicId: string, texts: string[]) {
    const found = new Map<string, string>();
    if (texts.length === 0) return found;
    const rows = await this.db
      .select({ id: questions.id, searchText: questions.searchText })
      .from(questions)
      .where(
        and(
          eq(questions.ownerId, ownerId),
          eq(questions.topicId, topicId),
          inArray(questions.searchText, [...new Set(texts)]),
        ),
      );
    for (const row of rows) if (!found.has(row.searchText)) found.set(row.searchText, row.id);
    return found;
  }
}
