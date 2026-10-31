import { normalizeForSearch } from '@exam/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ApiError, validationFailed } from '../../../common/api-error';
import type {
  OwnedContent,
  OwnedContentSummary,
  OwnedCounts,
  PreparedTransfer,
} from '../../../common/owned-content';
import { type Database, DB, type Transaction } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { variantKeyOf } from '../illustrations/illustration-keys';
import { importUploadKeyOf } from '../imports/question-import-keys';
import {
  illustrations,
  questionIllustrations,
  questionImportBatches,
  questions,
  topics,
} from '../question-bank.schema';
import { rewriteIllustrationIds } from './rewrite-illustration-ids';
import { transferredTopicName } from './transfer-naming';

type Db = Pick<Database, 'select'>;
type IllustrationRow = typeof illustrations.$inferSelect;

/** Cách xử lý một Hình minh họa của người cho khi các Câu hỏi dùng nó được chuyển (Q149). */
type Plan =
  | { kind: 'move' }
  | { kind: 'reuse'; targetId: string }
  | { kind: 'copy'; source: IllustrationRow };

interface Copy {
  newId: string;
  source: IllustrationRow;
  keys: string[];
}

/** Nội dung của Người ra đề trong Ngân hàng câu hỏi: Chủ đề, Câu hỏi, Hình minh họa. */
@Injectable()
export class QuestionBankOwnedContent implements OwnedContent {
  private readonly logger = new Logger(QuestionBankOwnedContent.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
  ) {}

  async summaryOf(
    userId: string,
    { topicIds }: { topicIds?: string[] } = {},
  ): Promise<OwnedContentSummary> {
    const rows = await this.db
      .select({
        id: topics.id,
        name: topics.name,
        archivedAt: topics.archivedAt,
        questionCount: sql<number>`count(distinct ${questions.id})::int`,
        illustrationCount: sql<number>`count(distinct ${questionIllustrations.illustrationId})::int`,
      })
      .from(topics)
      .leftJoin(questions, eq(questions.topicId, topics.id))
      .leftJoin(questionIllustrations, eq(questionIllustrations.questionId, questions.id))
      .where(eq(topics.ownerId, userId))
      .groupBy(topics.id)
      .orderBy(asc(topics.nameKey), asc(topics.id));
    const list = rows.map(({ archivedAt, ...row }) => ({ ...row, archived: archivedAt !== null }));

    const summary: OwnedContentSummary = {
      topics: list,
      totals: {
        topics: list.length,
        questions: sum(list.map((t) => t.questionCount)),
        illustrations: await this.distinctIllustrations(
          userId,
          list.map((t) => t.id),
        ),
      },
    };
    if (topicIds) {
      const chosen = list.filter((t) => topicIds.includes(t.id));
      summary.selected = {
        topics: chosen.length,
        questions: sum(chosen.map((t) => t.questionCount)),
        illustrations: await this.distinctIllustrations(
          userId,
          chosen.map((t) => t.id),
        ),
      };
    }
    return summary;
  }

  async prepareTransfer({
    fromId,
    toId,
    topicIds,
  }: {
    fromId: string;
    toId: string;
    topicIds: string[] | 'all';
  }): Promise<PreparedTransfer> {
    const owned = await this.db
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.ownerId, fromId));
    const ownedIds = new Set(owned.map((t) => t.id));
    const ids = topicIds === 'all' ? [...ownedIds] : topicIds;
    if (ids.some((id) => !ownedIds.has(id))) throw validationFailed('topicIds', 'unknown_topic');

    // Sao chép file làm trước giao dịch (không giữ khóa dòng trong lúc ghi file); lỗi thì dọn phần đã chép.
    const plans = await this.planOf(this.db, fromId, toId, ids);
    const copies = new Map<string, Copy>();
    const written: string[] = [];
    try {
      for (const [oldId, plan] of plans) {
        if (plan.kind !== 'copy') continue;
        const copy: Copy = { newId: uuidv7(), source: plan.source, keys: [] };
        for (const side of plan.source.variants) {
          const key = variantKeyOf(copy.newId, side);
          await this.media.put(key, await this.media.get(variantKeyOf(oldId, side)));
          copy.keys.push(key);
          written.push(key);
        }
        copies.set(oldId, copy);
      }
    } catch (error) {
      await this.deleteFiles(written);
      throw error;
    }
    return new Prepared(this, { fromId, toId, ids, all: topicIds === 'all' }, copies);
  }

  /** Số Hình minh họa khác nhau mà các Câu hỏi trong các Chủ đề này dùng. */
  private async distinctIllustrations(userId: string, topicIds: string[]): Promise<number> {
    if (topicIds.length === 0) return 0;
    const [row] = await this.db
      .select({ n: sql<number>`count(distinct ${questionIllustrations.illustrationId})::int` })
      .from(questions)
      .innerJoin(questionIllustrations, eq(questionIllustrations.questionId, questions.id))
      .where(and(eq(questions.ownerId, userId), inArray(questions.topicId, topicIds)));
    return row?.n ?? 0;
  }

  /**
   * Phân loại từng ảnh mà các Câu hỏi đang chuyển dùng (Q149): đổi chủ khi chỉ các câu đó dùng và người nhận chưa có
   * ảnh cùng SHA-256; dùng ảnh sẵn sàng của người nhận nếu có; còn lại (ảnh dùng chung với câu ở lại) thì sao chép.
   */
  async planOf(
    db: Db,
    fromId: string,
    toId: string,
    topicIds: string[],
  ): Promise<Map<string, Plan>> {
    const plans = new Map<string, Plan>();
    if (topicIds.length === 0) return plans;
    const uses = await db
      .select({
        illustration: illustrations,
        moving: sql<boolean>`${inArray(questions.topicId, topicIds)}`,
      })
      .from(questions)
      .innerJoin(questionIllustrations, eq(questionIllustrations.questionId, questions.id))
      .innerJoin(illustrations, eq(illustrations.id, questionIllustrations.illustrationId))
      .where(eq(questions.ownerId, fromId));

    const shared = new Set<string>();
    const movingImages = new Map<string, IllustrationRow>();
    for (const { illustration, moving } of uses) {
      if (moving) movingImages.set(illustration.id, illustration);
      else shared.add(illustration.id);
    }
    if (movingImages.size === 0) return plans;

    const theirs = await db
      .select()
      .from(illustrations)
      .where(
        and(
          eq(illustrations.ownerId, toId),
          inArray(illustrations.sha256, [
            ...new Set([...movingImages.values()].map((i) => i.sha256)),
          ]),
        ),
      );
    const bySha = new Map(theirs.map((i) => [i.sha256, i]));

    for (const [id, image] of movingImages) {
      const existing = bySha.get(image.sha256);
      if (existing) {
        // Ràng buộc UNIQUE(owner_id, sha256): chỉ dùng được ảnh sẵn sàng; ảnh đang xử lý hoặc lỗi thì đợi người nhận xử lý.
        if (existing.status !== 'ready') {
          throw new ApiError('CONFLICT', { reason: 'RECIPIENT_ILLUSTRATION_NOT_READY' });
        }
        plans.set(id, { kind: 'reuse', targetId: existing.id });
      } else if (!shared.has(id)) {
        plans.set(id, { kind: 'move' });
      } else {
        if (image.status !== 'ready') {
          throw new ApiError('CONFLICT', { reason: 'ILLUSTRATION_NOT_READY' });
        }
        plans.set(id, { kind: 'copy', source: image });
      }
    }
    return plans;
  }

  async deleteFiles(keys: string[]) {
    for (const key of keys) {
      await this.media.delete(key).catch((error) => {
        this.logger.warn(`Không xóa được file ${key}: ${error}`);
      });
    }
  }
}

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);

/** Phần trong giao dịch của một lần Chuyển giao; xem `OwnedContent.prepareTransfer`. */
class Prepared implements PreparedTransfer {
  private used = new Set<string>();
  private uploadKeys: string[] = [];

  constructor(
    private readonly owner: QuestionBankOwnedContent,
    private readonly request: { fromId: string; toId: string; ids: string[]; all: boolean },
    private readonly copies: Map<string, Copy>,
  ) {}

  async apply(tx: Transaction, donorName: string): Promise<OwnedCounts> {
    const { fromId, toId, all } = this.request;
    // Khóa các Chủ đề đang chuyển. Xóa người dùng chuyển "toàn bộ": lấy lại danh sách trong giao dịch để không sót
    // Chủ đề vừa tạo sau lúc chuẩn bị.
    const rows = await tx
      .select({ id: topics.id, name: topics.name, archivedAt: topics.archivedAt })
      .from(topics)
      .where(
        all
          ? eq(topics.ownerId, fromId)
          : and(eq(topics.ownerId, fromId), inArray(topics.id, this.request.ids)),
      )
      .orderBy(asc(topics.nameKey), asc(topics.id))
      .for('update');
    if (!all && rows.length !== this.request.ids.length) {
      throw new ApiError('CONFLICT', { reason: 'CONTENT_CHANGED' });
    }
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return { topics: 0, questions: 0, illustrations: 0 };

    const plans = await this.owner.planOf(tx, fromId, toId, ids);
    for (const [oldId, plan] of plans) {
      // Ảnh mới phải chép từ trước giao dịch; nếu nội dung người cho vừa đổi thì bảo thử lại thay vì chép trong giao dịch.
      if (plan.kind === 'copy' && !this.copies.has(oldId)) {
        throw new ApiError('CONFLICT', { reason: 'CONTENT_CHANGED' });
      }
    }

    await this.moveTopics(tx, rows, donorName);
    // Lô nhập gắn với Chủ đề của người cho: xóa (chỉ có nghĩa với chủ cũ); file tạm của lô đang đọc dọn sau khi xong.
    const batches = await tx
      .delete(questionImportBatches)
      .where(inArray(questionImportBatches.topicId, ids))
      .returning({ id: questionImportBatches.id, uploadKey: questionImportBatches.uploadKey });
    this.uploadKeys = batches.map((b) => b.uploadKey ?? importUploadKeyOf(b.id));

    const moved = await tx
      .update(questions)
      .set({ ownerId: toId })
      .where(inArray(questions.topicId, ids))
      .returning({ id: questions.id });

    await this.moveIllustrations(tx, plans, ids);
    return { topics: ids.length, questions: moved.length, illustrations: plans.size };
  }

  async finish(committed: boolean): Promise<void> {
    const unused = [...this.copies].flatMap(([oldId, copy]) =>
      committed && this.used.has(oldId) ? [] : copy.keys,
    );
    await this.owner.deleteFiles(committed ? [...unused, ...this.uploadKeys] : unused);
  }

  /** Đổi chủ Chủ đề; Chủ đề chưa Lưu trữ trùng tên với Chủ đề chưa Lưu trữ của người nhận thì đổi tên (Q148). */
  private async moveTopics(
    tx: Transaction,
    rows: { id: string; name: string; archivedAt: Date | null }[],
    donorName: string,
  ) {
    const taken = new Set(
      (
        await tx
          .select({ nameKey: topics.nameKey })
          .from(topics)
          .where(and(eq(topics.ownerId, this.request.toId), sql`${topics.archivedAt} IS NULL`))
      ).map((r) => r.nameKey),
    );
    for (const row of rows) {
      if (row.archivedAt) {
        await tx.update(topics).set({ ownerId: this.request.toId }).where(eq(topics.id, row.id));
        continue;
      }
      const name = transferredTopicName(row.name, donorName, taken);
      const nameKey = normalizeForSearch(name);
      taken.add(nameKey);
      await tx
        .update(topics)
        .set({ ownerId: this.request.toId, name, nameKey })
        .where(eq(topics.id, row.id));
    }
  }

  private async moveIllustrations(tx: Transaction, plans: Map<string, Plan>, topicIds: string[]) {
    const mapping = new Map<string, string>();
    const toMove: string[] = [];
    for (const [oldId, plan] of plans) {
      if (plan.kind === 'move') toMove.push(oldId);
      else if (plan.kind === 'reuse') mapping.set(oldId, plan.targetId);
      else {
        const copy = this.copies.get(oldId) as Copy;
        const { source } = copy;
        await tx.insert(illustrations).values({
          id: copy.newId,
          ownerId: this.request.toId,
          sha256: source.sha256,
          status: 'ready',
          width: source.width,
          height: source.height,
          variants: source.variants,
          bytes: source.bytes,
        });
        mapping.set(oldId, copy.newId);
        this.used.add(oldId);
      }
    }
    if (toMove.length > 0) {
      await tx
        .update(illustrations)
        .set({ ownerId: this.request.toId })
        .where(inArray(illustrations.id, toMove));
    }
    if (mapping.size === 0) return;

    // Các câu đã chuyển đang dùng ảnh đổi id: viết lại nội dung, cập nhật bảng dùng ảnh và tăng version.
    const affected = await tx
      .select({
        id: questions.id,
        stem: questions.stem,
        payload: questions.payload,
        version: questions.version,
        used: questionIllustrations.illustrationId,
      })
      .from(questions)
      .innerJoin(questionIllustrations, eq(questionIllustrations.questionId, questions.id))
      .where(
        and(
          inArray(questions.topicId, topicIds),
          inArray(questionIllustrations.illustrationId, [...mapping.keys()]),
        ),
      );
    const done = new Set<string>();
    for (const row of affected) {
      if (!done.has(row.id)) {
        done.add(row.id);
        const stem = rewriteIllustrationIds(row.stem, mapping).value;
        const payload = rewriteIllustrationIds(row.payload, mapping).value;
        await tx
          .update(questions)
          .set({ stem, payload, version: row.version + 1 })
          .where(eq(questions.id, row.id));
      }
      await tx
        .delete(questionIllustrations)
        .where(
          and(
            eq(questionIllustrations.questionId, row.id),
            eq(questionIllustrations.illustrationId, row.used),
          ),
        );
      await tx
        .insert(questionIllustrations)
        .values({ questionId: row.id, illustrationId: mapping.get(row.used) as string })
        .onConflictDoNothing();
    }
  }
}
