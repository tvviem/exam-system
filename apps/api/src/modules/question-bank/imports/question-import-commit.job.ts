import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { JobRegistry } from '../../../queue/job-queue';
import { AuditService } from '../../audit/audit.service';
import {
  questionImportBatches,
  questionImportItems,
  questions,
  topics,
} from '../question-bank.schema';
import { questionColumnsOf } from '../question-columns';
import type { DraftQuestion } from './question-import-file';

const INSERT_CHUNK = 200;

/**
 * Job "question-import.commit": tạo Câu hỏi từ các dòng đã chọn của một lô, cả lô trong một giao dịch (Q146).
 * Chủ đề đích không còn dùng được (bị Lưu trữ giữa chừng) hoặc job lỗi thì lô trở lại `ready`, chưa tạo gì.
 */
@Injectable()
export class QuestionImportCommitJob implements OnModuleInit {
  private readonly logger = new Logger(QuestionImportCommitJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly registry: JobRegistry,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.registry.register('question-import.commit', (payload) =>
      this.run(payload.batchId, { id: payload.actorId, ip: payload.actorIp }),
    );
  }

  async run(batchId: string, actor: { id: string; ip: string | null }): Promise<void> {
    try {
      await this.db.transaction((tx) => this.commit(tx, batchId, actor));
    } catch (error) {
      this.logger.error(`Tạo Câu hỏi từ lô nhập ${batchId} lỗi`, error);
      await this.backToReady(batchId);
    }
  }

  private async commit(
    tx: Pick<Database, 'select' | 'insert' | 'update'>,
    batchId: string,
    actor: { id: string; ip: string | null },
  ) {
    // Khóa dòng: chạy lại job cho lô đã `committed` (hoặc không còn `committing`) thì không làm gì.
    const [batch] = await tx
      .select()
      .from(questionImportBatches)
      .where(
        and(eq(questionImportBatches.id, batchId), eq(questionImportBatches.status, 'committing')),
      )
      .for('update');
    if (!batch) return;

    const [topic] = await tx
      .select({ id: topics.id })
      .from(topics)
      .where(
        and(
          eq(topics.id, batch.topicId),
          eq(topics.ownerId, batch.ownerId),
          isNull(topics.archivedAt),
        ),
      );
    if (!topic) {
      await tx
        .update(questionImportBatches)
        .set({ status: 'ready', commitRequestedAt: null })
        .where(eq(questionImportBatches.id, batchId));
      return;
    }

    const chosen = await tx
      .select({ id: questionImportItems.id, payload: questionImportItems.payload })
      .from(questionImportItems)
      .where(
        and(
          eq(questionImportItems.batchId, batchId),
          eq(questionImportItems.selected, true),
          isNull(questionImportItems.errorCode),
        ),
      );
    const rows = chosen.map((item) =>
      questionColumnsOf({ ...(item.payload as unknown as DraftQuestion), topicId: batch.topicId }),
    );
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await tx
        .insert(questions)
        .values(rows.slice(i, i + INSERT_CHUNK).map((row) => ({ ownerId: batch.ownerId, ...row })));
    }

    // Dòng được chọn (và không lỗi) đã thành Câu hỏi; mọi dòng còn lại là bỏ qua.
    await tx
      .update(questionImportItems)
      .set({
        outcome: sql`case when ${questionImportItems.selected} and ${questionImportItems.errorCode} is null then 'created' else 'skipped' end::question_import_outcome`,
      })
      .where(eq(questionImportItems.batchId, batchId));
    await tx
      .update(questionImportBatches)
      .set({ status: 'committed', createdCount: rows.length, committedAt: this.clock.now() })
      .where(eq(questionImportBatches.id, batchId));
    await this.audit.record(
      {
        actor,
        action: 'question.import',
        entityType: 'question_import_batch',
        entityId: batchId,
        after: {
          topicId: batch.topicId,
          created: rows.length,
          skipped: (batch.rowCount ?? rows.length) - rows.length,
        },
      },
      tx,
    );
  }

  private async backToReady(batchId: string) {
    await this.db
      .update(questionImportBatches)
      .set({ status: 'ready', commitRequestedAt: null })
      .where(
        and(eq(questionImportBatches.id, batchId), eq(questionImportBatches.status, 'committing')),
      );
  }
}
