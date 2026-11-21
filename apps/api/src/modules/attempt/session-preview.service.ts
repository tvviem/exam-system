import { randomInt, randomUUID } from 'node:crypto';
import { effectiveDrawPercents, layoutOf } from '@exam/shared';
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

  async preview(userId: string, sessionId: string) {
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
    const layout = layoutOf(randomInt(0, 2 ** 48 - 1), layoutInputOf(content), gate, {
      sessionId,
      userId: randomUUID(),
      percents,
    });
    const total = content.sections.reduce((n, section) => n + section.items.length, 0);
    const { count } = drawTotalsOfContent(content, overrides);
    return {
      status: 'preview' as const,
      session: { id: gate.sessionId, title: gate.title },
      exam: { title: content.title, instructions: content.instructions },
      durationMinutes: gate.durationMinutes,
      /** Có rút câu thì cho biết bộ mẫu gồm bao nhiêu câu trong tổng số; không thì `null`. */
      draw: count < total ? { count, total } : null,
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
