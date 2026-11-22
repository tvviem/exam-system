import { randomInt } from 'node:crypto';
import {
  type DrawScope,
  drawVariantItems,
  effectiveDrawPercents,
  VARIANT_COUNT_MAX,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { asc, count, eq, inArray } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { EXAM_CATALOG, type ExamCatalog } from '../../common/exam-catalog';
import type { Database, Transaction } from '../../db/db.module';
import { sessionVariantItems, sessionVariants } from './session.schema';

type Db = Pick<Database, 'select'>;

/** Nhãn mặc định của Mã đề thứ `number` (Q462); Người ra đề sửa được ở lát sau. */
export const variantLabelOf = (number: number) => `Đề ${number}`;

/**
 * Mã đề của Phiên thi (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4): rút bộ câu của từng Mã đề theo tỷ lệ hiệu lực của từng Phần,
 * lưu vào `session_variant_items` (xem thử, xuất và vào thi đọc cùng danh sách này). Chỉ làm được khi Phiên thi chưa có Lượt làm
 * bài (trigger `session_variants_guard`; bên gọi báo lỗi rõ trước).
 */
@Injectable()
export class SessionVariantsService {
  constructor(@Inject(EXAM_CATALOG) private readonly exams: ExamCatalog) {}

  /** Mã đề của Phiên thi theo thứ tự, kèm số câu. Phiên thi `per_candidate` không có Mã đề. */
  async listOf(db: Db, sessionId: string) {
    return db
      .select({
        id: sessionVariants.id,
        number: sessionVariants.number,
        label: sessionVariants.label,
        itemCount: count(sessionVariantItems.itemId),
      })
      .from(sessionVariants)
      .leftJoin(sessionVariantItems, eq(sessionVariantItems.variantId, sessionVariants.id))
      .where(eq(sessionVariants.sessionId, sessionId))
      .groupBy(sessionVariants.id)
      .orderBy(asc(sessionVariants.number));
  }

  /**
   * Đưa Mã đề về đúng cấu hình: `per_candidate` thì gỡ hết; `shared` thì đủ `variantCount` Mã đề (thêm Mã đề mới với hạt giống
   * ngẫu nhiên, bớt từ số lớn nhất, **giữ hạt giống** của các Mã đề còn lại) rồi rút lại bộ câu của từng Mã đề theo tỷ lệ hiệu lực.
   * Cùng hạt giống mà tăng tỷ lệ thì chỉ thêm câu. Các Mã đề phải cùng tổng điểm (Q469): lệch thì `variant_points_uneven`.
   */
  async sync(
    tx: Transaction,
    input: {
      sessionId: string;
      examId: string;
      scope: DrawScope;
      variantCount: number;
      overrides: ReadonlyMap<string, number>;
    },
  ): Promise<void> {
    const { sessionId } = input;
    if (input.scope === 'per_candidate') {
      await tx.delete(sessionVariants).where(eq(sessionVariants.sessionId, sessionId));
      return;
    }
    const wanted = Math.min(Math.max(input.variantCount, 1), VARIANT_COUNT_MAX);
    const sections = await this.exams.drawSectionsOf(input.examId, tx);
    const percents = effectiveDrawPercents(
      sections,
      Object.fromEntries(sections.map((section) => [section.id, section.defaultPercent])),
      Object.fromEntries(input.overrides),
    );

    const existing = await tx
      .select()
      .from(sessionVariants)
      .where(eq(sessionVariants.sessionId, sessionId))
      .orderBy(asc(sessionVariants.number));
    const surplus = existing.filter((variant) => variant.number > wanted).map((v) => v.id);
    if (surplus.length > 0) {
      await tx.delete(sessionVariants).where(inArray(sessionVariants.id, surplus));
    }
    const rows = existing.filter((variant) => variant.number <= wanted);
    for (let number = 1; number <= wanted; number++) {
      if (rows.some((row) => row.number === number)) continue;
      const [created] = await tx
        .insert(sessionVariants)
        .values({
          sessionId,
          number,
          label: variantLabelOf(number),
          drawSeed: randomInt(0, 2 ** 48 - 1),
        })
        .returning();
      if (!created) throw new Error('Không tạo được Mã đề');
      rows.push(created);
    }

    const pointsOf = new Map(
      sections.flatMap((section) =>
        section.itemIds.map((itemId, i) => [itemId, section.points[i] as number] as const),
      ),
    );
    const totals: number[] = [];
    for (const variant of rows.sort((a, b) => a.number - b.number)) {
      const drawn = drawVariantItems(
        sections.map((section) => ({ sectionId: section.id, itemIds: section.itemIds })),
        percents,
        variant.drawSeed,
      );
      const itemIds = Object.values(drawn).flat();
      await tx.delete(sessionVariantItems).where(eq(sessionVariantItems.variantId, variant.id));
      if (itemIds.length > 0) {
        await tx
          .insert(sessionVariantItems)
          .values(itemIds.map((itemId) => ({ variantId: variant.id, itemId })));
      }
      totals.push(
        itemIds.reduce((sum, itemId) => sum + Math.round((pointsOf.get(itemId) ?? 0) * 100), 0),
      );
    }
    if (totals.some((total) => total !== totals[0])) {
      throw new ApiError('VALIDATION_FAILED', {
        issues: [{ path: 'sectionDraws', code: 'variant_points_uneven' }],
      });
    }
  }

  /** Số câu và điểm tối đa (đơn vị 0,01) mỗi Người dự thi nhận ở Phiên thi `shared`; `null` nếu không có Mã đề. */
  async totalsOf(
    db: Db,
    sessionId: string,
    examId: string,
  ): Promise<{ count: number; maxCenti: number } | null> {
    const [first] = await db
      .select({ id: sessionVariants.id })
      .from(sessionVariants)
      .where(eq(sessionVariants.sessionId, sessionId))
      .orderBy(asc(sessionVariants.number))
      .limit(1);
    if (!first) return null;
    const items = await db
      .select({ itemId: sessionVariantItems.itemId })
      .from(sessionVariantItems)
      .where(eq(sessionVariantItems.variantId, first.id));
    const sections = await this.exams.drawSectionsOf(examId);
    const pointsOf = new Map(
      sections.flatMap((section) =>
        section.itemIds.map((itemId, i) => [itemId, section.points[i] as number] as const),
      ),
    );
    return {
      count: items.length,
      maxCenti: items.reduce(
        (sum, item) => sum + Math.round((pointsOf.get(item.itemId) ?? 0) * 100),
        0,
      ),
    };
  }
}
