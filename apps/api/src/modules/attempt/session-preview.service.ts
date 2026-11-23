import { randomInt, randomUUID } from 'node:crypto';
import {
  effectiveDrawPercents,
  itemIdsBySectionOf,
  layoutInputForVariant,
  layoutOf,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error';
import {
  drawTotalsOfContent,
  EXAM_CONTENT,
  type ExamContentProvider,
} from '../../common/exam-content';
import { SESSION_ENTRY, type SessionEntry } from '../../common/session-entry';
import { buildAttemptSections, layoutInputOf } from './attempt-view';

/**
 * Xem thử qua Phiên thi (Q220, Q245): chủ Phiên thi đi qua đề đúng như Người dự thi thấy (cùng `candidateViewOf`, nên
 * không có Đáp án đúng), theo thiết lập trộn của Phiên thi. Không tạo Lượt làm bài, không gắn thiết bị, không ghi gì.
 */
@Injectable()
export class SessionPreviewService {
  constructor(
    @Inject(SESSION_ENTRY) private readonly entry: SessionEntry,
    @Inject(EXAM_CONTENT) private readonly content: ExamContentProvider,
  ) {}

  /**
   * Bộ câu của từng Mã đề cho chủ Phiên thi (tab Đề): câu theo Phần, số câu, tổng điểm. Mỗi câu chỉ gồm mã, loại, điểm và đề bài,
   * không có phương án hay Đáp án đúng. Phiên thi mỗi người một đề không có Mã đề nên trả danh sách rỗng.
   */
  async variants(userId: string, sessionId: string) {
    const gate = await this.entry.gateForOwner(sessionId, userId);
    if (!gate) throw new ApiError('NOT_FOUND');
    const variants = gate.drawScope === 'shared' ? await this.entry.variantsOf(sessionId) : [];
    if (variants.length === 0) return { variants: [] };
    const content = await this.content.contentOf(gate.examId);
    if (!content) throw new ApiError('NOT_FOUND');
    return {
      variants: variants.map((variant) => {
        const chosen = new Set(variant.itemIds);
        const sections = content.sections.map((section) => ({
          sectionId: section.id,
          title: section.title,
          items: section.items
            .filter((item) => chosen.has(item.itemId))
            .map((item) => ({
              itemId: item.itemId,
              type: item.snapshot.type,
              points: item.points,
              stem: item.snapshot.stem,
            })),
        }));
        const items = sections.flatMap((section) => section.items);
        return {
          id: variant.variantId,
          number: variant.number,
          label: variant.label,
          itemCount: items.length,
          totalPoints: Math.round(items.reduce((sum, item) => sum + item.points * 100, 0)) / 100,
          sections,
        };
      }),
    };
  }

  /**
   * Xem thử một lượt. Phiên thi dùng chung Mã đề: đúng bộ câu của Mã đề `variantNumber` (không nêu thì Mã đề đầu); mỗi người một
   * đề: một lượt rút mẫu, và nêu `variantNumber` là sai (404).
   */
  async preview(userId: string, sessionId: string, variantNumber?: number) {
    const gate = await this.entry.gateForOwner(sessionId, userId);
    if (!gate) throw new ApiError('NOT_FOUND'); // không phải chủ thì không biết Phiên thi có tồn tại
    const content = await this.content.contentOf(gate.examId);
    if (!content) throw new ApiError('NOT_FOUND');
    // Rút câu (Q438): Xem thử là MỘT lượt rút mẫu của một người ngẫu nhiên, nên mỗi lần mở ra một bộ câu khác (Bộ đề đủ thì như cũ).
    const overrides = await this.entry.drawOverridesOf(sessionId);
    const percents = effectiveDrawPercents(
      content.sections,
      Object.fromEntries(content.sections.map((section) => [section.id, section.drawPercent])),
      overrides,
    );
    if (variantNumber !== undefined && gate.drawScope !== 'shared') throw new ApiError('NOT_FOUND');
    let variant = null;
    if (gate.drawScope === 'shared') {
      const variants = await this.entry.variantsOf(sessionId);
      variant = variants.find((v) => v.number === (variantNumber ?? 1)) ?? null;
      if (variantNumber !== undefined && !variant) throw new ApiError('NOT_FOUND');
    }
    const input = layoutInputOf(content);
    const seed = randomInt(0, 2 ** 48 - 1);
    const layout = variant
      ? layoutOf(
          seed,
          layoutInputForVariant(input, itemIdsBySectionOf(input, new Set(variant.itemIds))),
          gate,
        )
      : layoutOf(seed, input, gate, { sessionId, userId: randomUUID(), percents });
    const total = content.sections.reduce((n, section) => n + section.items.length, 0);
    const variantTotals = variant
      ? (await this.entry.variantTotalsOfMany([{ sessionId, examId: gate.examId }])).get(sessionId)
      : null;
    const { count } = drawTotalsOfContent(content, overrides, variantTotals);
    return {
      status: 'preview' as const,
      session: { id: gate.sessionId, title: gate.title },
      exam: { title: content.title, instructions: content.instructions },
      durationMinutes: gate.durationMinutes,
      /** Có rút câu thì cho biết bộ mẫu gồm bao nhiêu câu trong tổng số; không thì `null`. */
      draw: count < total ? { count, total } : null,
      /** Dùng chung Mã đề: Mã đề đang xem thử; mỗi người một đề thì `null`. */
      variant: variant ? { number: variant.number, label: variant.label } : null,
      mediaBase: `/api/sessions/${gate.sessionId}/try-media`,
      sections: buildAttemptSections({
        content,
        layout,
        responses: new Map(),
        showScoringRules: gate.showScoringRules,
      }),
    };
  }
}
