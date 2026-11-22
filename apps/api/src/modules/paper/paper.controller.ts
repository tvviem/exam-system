import { paperAnswersRequestSchema, paperExportRequestSchema } from '@exam/shared';
import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Actor } from '../../common/actor';
import { CurrentActor, RequireTag } from '../identity/auth/auth.decorators';
import { type ExportedPaper, PaperService } from './paper.service';

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Số cảnh báo tối đa gửi kèm ở header (đủ để giao diện hiện, không làm header quá lớn). */
const MAX_WARNINGS = 20;

/** Xuất Đề thi ra .docx (docs/plan/xuat-bo-de-thiet-ke.md mục 4 và 7); chỉ Người ra đề. */
@RequireTag('examiner')
@Controller('paper')
export class PaperController {
  constructor(private readonly paper: PaperService) {}

  // Xuất tệp không tạo gì ở server nên trả 200 (không phải 201 mặc định của POST).
  @Post('exam')
  @HttpCode(HttpStatus.OK)
  async exportExam(
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { sessionId, examId, variant, ...request } = paperExportRequestSchema.parse(body);
    const source = sessionId ? { sessionId, variant } : { examId: examId as string };
    return send(reply, await this.paper.exportExam(actor, source, request));
  }

  /** Tệp Đáp án và thang điểm: `confirm: true` bắt buộc vì tệp chứa Đáp án đúng. */
  @Post('answers')
  @HttpCode(HttpStatus.OK)
  async exportAnswers(
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const {
      sessionId,
      examId,
      variant,
      confirm: _confirm,
      ...request
    } = paperAnswersRequestSchema.parse(body);
    const source = sessionId ? { sessionId, variant } : { examId: examId as string };
    return send(reply, await this.paper.exportAnswers(actor, source, request));
  }
}

/** Đặt header tải tệp và cảnh báo (tối đa 20 mục), trả byte của tệp. */
function send(reply: FastifyReply, file: ExportedPaper): Buffer {
  const shown = file.warnings.slice(0, MAX_WARNINGS);
  if (file.warnings.length > shown.length) {
    shown.push(`và ${file.warnings.length - shown.length} cảnh báo khác`);
  }
  reply
    .header('content-type', DOCX_CONTENT_TYPE)
    .header('content-disposition', `attachment; filename="${file.filename}"`)
    .header('x-paper-warnings', encodeURIComponent(JSON.stringify(shown)))
    .header('cache-control', 'no-store');
  return Buffer.from(file.bytes);
}
