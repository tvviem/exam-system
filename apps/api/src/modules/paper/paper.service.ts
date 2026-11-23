import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { EFFECTIVE_CONTENT, type EffectiveContentProvider } from '../../common/effective-content';
import { EXAM_CATALOG, type ExamCatalog } from '../../common/exam-catalog';
import {
  EXAM_CONTENT,
  type ExamContentData,
  type ExamContentProvider,
} from '../../common/exam-content';
import { EXAMINER_DIRECTORY, type ExaminerDirectory } from '../../common/examiner-directory';
import { fileSlug } from '../../common/file-slug';
import { ILLUSTRATION_FILES, type IllustrationFiles } from '../../common/illustration-files';
import { SESSION_INFO, type SessionInfoProvider } from '../../common/session-info';
import { AuditService } from '../audit/audit.service';
import { buildAnswerDocument } from './paper-answer-document';
import { toAnswerSpec } from './paper-answer-spec';
import { buildPaperDocument, type PaperImage } from './paper-document';
import { type PaperRequest, type SessionTimes, toPaperSpec } from './paper-spec';
import { restrictToVariant } from './paper-variant';

/** Cạnh dài mong muốn của biến thể ảnh khi xuất (đủ nét cho in A4; mục 5.3 của thiết kế). */
const PREFERRED_SIDE = 960;

/** Biến thể nhỏ nhất đủ nét; ảnh nhỏ không có biến thể lớn thì lấy biến thể lớn nhất có. */
const pickVariantSide = (variants: number[]): number | undefined =>
  [...variants].sort((a, b) => a - b).find((side) => side >= PREFERRED_SIDE) ??
  [...variants].sort((a, b) => b - a)[0];

/** Từ Phiên thi (có thể nêu số thứ tự Mã đề cần xuất) hoặc từ Bộ đề. */
export type ExportSource = { sessionId: string; variant?: number } | { examId: string };
export type ExportRequest = PaperRequest & { unit?: string };

export interface ExportedPaper {
  bytes: Uint8Array;
  filename: string;
  warnings: string[];
}

@Injectable()
export class PaperService {
  constructor(
    @Inject(EXAM_CONTENT) private readonly exams: ExamContentProvider,
    @Inject(EXAM_CATALOG) private readonly catalog: ExamCatalog,
    @Inject(EFFECTIVE_CONTENT) private readonly effective: EffectiveContentProvider,
    @Inject(SESSION_INFO) private readonly sessions: SessionInfoProvider,
    @Inject(EXAMINER_DIRECTORY) private readonly examiners: ExaminerDirectory,
    @Inject(ILLUSTRATION_FILES) private readonly illustrations: IllustrationFiles,
    private readonly audit: AuditService,
  ) {}

  /**
   * Xuất tệp Đề thi (không có đáp án). Chỉ chủ Bộ đề (hay chủ Phiên thi) xuất được (Q410); người khác nhận NOT_FOUND để không lộ
   * Bộ đề có tồn tại. Bộ đề nháp chưa có bản chụp thì từ chối. Không lưu tệp ở server.
   */
  async exportExam(
    actor: Actor,
    source: ExportSource,
    request: ExportRequest,
  ): Promise<ExportedPaper> {
    const { examId, session } = await this.resolve(actor, source);
    const full = await this.exams.contentOf(examId);
    if (!full) throw new ApiError('INVALID_STATE', { reason: 'EXAM_NOT_PUBLISHED' });
    const { content, examCode } = await this.forVariant(full, source, request);

    const unitName = await this.unitNameFor(actor, request);
    const spec = toPaperSpec({ content, session, unitName, request: { ...request, examCode } });
    spec.images = await this.imagesOf(content);

    const { bytes, warnings } = await buildPaperDocument(spec);
    await this.record(actor, 'paper.export', 'exam', examId, source, warnings.length);
    return { bytes, filename: `de-thi-${fileSlug(content.title, 'bo-de')}.docx`, warnings };
  }

  /**
   * Xuất tệp Đáp án và thang điểm: đáp án hiệu lực (đã tính Đính chính), điểm từng câu, hướng dẫn chấm tự luận. Cùng quyền như tệp
   * Đề (chỉ chủ) và nhật ký riêng; việc xác nhận "tệp chứa đáp án" do lược đồ yêu cầu bắt buộc (`confirm: true`) ở điểm vào.
   */
  async exportAnswers(
    actor: Actor,
    source: ExportSource,
    request: ExportRequest,
  ): Promise<ExportedPaper> {
    const { examId, session } = await this.resolve(actor, source);
    const effective = await this.effective.of(examId);
    if (!effective) throw new ApiError('INVALID_STATE', { reason: 'EXAM_NOT_PUBLISHED' });
    const { content, examCode } = await this.forVariant(effective.content, source, request);

    const unitName = await this.unitNameFor(actor, request);
    const spec = toAnswerSpec({
      ...effective,
      content,
      session,
      unitName,
      request: { ...request, examCode },
    });
    const { bytes, warnings } = await buildAnswerDocument(spec);
    await this.record(actor, 'paper.export.answers', 'answers', examId, source, warnings.length);
    return {
      bytes,
      filename: `dap-an-${fileSlug(effective.content.title, 'bo-de')}.docx`,
      warnings,
    };
  }

  /**
   * Phiên thi dùng chung Mã đề: tệp chỉ gồm câu của Mã đề (và ô Mã đề điền sẵn nhãn của Mã đề, trừ khi Người ra đề nhập tay).
   * Một Mã đề thì không cần nêu số; nhiều Mã đề mà không nêu thì từ chối. Phiên thi mỗi người một đề hay xuất từ Bộ đề: không đổi.
   */
  private async forVariant(
    content: ExamContentData,
    source: ExportSource,
    request: ExportRequest,
  ): Promise<{ content: ExamContentData; examCode: string | undefined }> {
    if (!('sessionId' in source)) return { content, examCode: request.examCode };
    const variants = await this.sessions.variantsOf(source.sessionId);
    if (variants.length === 0) {
      if (source.variant !== undefined)
        throw new ApiError('INVALID_STATE', { reason: 'NOT_SHARED' });
      return { content, examCode: request.examCode };
    }
    if (source.variant === undefined && variants.length > 1) {
      throw new ApiError('VALIDATION_FAILED', {
        issues: [{ path: 'variant', code: 'variant_required' }],
      });
    }
    const variant = variants.find((v) => v.number === (source.variant ?? 1));
    if (!variant) throw new ApiError('NOT_FOUND');
    return {
      content: restrictToVariant(content, new Set(variant.itemIds)),
      examCode: request.examCode ?? variant.label,
    };
  }

  private async unitNameFor(actor: Actor, request: ExportRequest): Promise<string | null> {
    return request.unit?.trim() || (await this.examiners.unitNameOf(actor.id));
  }

  /** Nhật ký: chỉ ghi đã xuất gì (ai, Bộ đề, Phiên thi, loại tệp, số cảnh báo), không ghi nội dung. */
  private async record(
    actor: Actor,
    action: string,
    kind: 'exam' | 'answers',
    examId: string,
    source: ExportSource,
    warnings: number,
  ): Promise<void> {
    await this.audit.record({
      actor,
      action,
      entityType: 'exam',
      entityId: examId,
      after: {
        kind,
        sessionId: 'sessionId' in source ? source.sessionId : null,
        ...('sessionId' in source && source.variant !== undefined
          ? { variant: source.variant }
          : {}),
        warnings,
      },
    });
  }

  private async resolve(
    actor: Actor,
    source: ExportSource,
  ): Promise<{ examId: string; session: SessionTimes | null }> {
    if ('sessionId' in source) {
      const session = await this.sessions.info(source.sessionId);
      if (!session || session.ownerId !== actor.id) throw new ApiError('NOT_FOUND');
      return { examId: session.examId, session };
    }
    // `statusOwnedBy` biết cả Bộ đề nháp của chính người này (ownerOf chỉ biết Bộ đề đã Phát hành): nháp qua được bước này rồi
    // bị chặn ở `contentOf` (chưa có bản chụp), người khác hay Bộ đề không có thì NOT_FOUND.
    const status = await this.catalog.statusOwnedBy(actor.id, source.examId);
    if (status === null) throw new ApiError('NOT_FOUND');
    return { examId: source.examId, session: null };
  }

  /** Byte các hình nằm trong bản chụp của Bộ đề (chỉ những hình đó). Hình không đọc được thì để trống: tệp có chỗ giữ và cảnh báo. */
  private async imagesOf(content: ExamContentData): Promise<Map<string, PaperImage>> {
    const sides = new Map<string, number[]>();
    for (const section of content.sections) {
      for (const item of section.items) {
        for (const illustration of item.snapshot.illustrations) {
          sides.set(illustration.id, illustration.variants);
        }
      }
    }
    const images = new Map<string, PaperImage>();
    for (const [id, variants] of sides) {
      const side = pickVariantSide(variants);
      if (side === undefined) continue;
      const bytes = await this.illustrations.variant(id, side);
      if (!bytes) continue;
      const meta = await sharp(bytes).metadata();
      if (meta.width && meta.height)
        images.set(id, { bytes, widthPx: meta.width, heightPx: meta.height });
    }
    return images;
  }
}
