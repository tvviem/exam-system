import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Actor } from '../../common/actor';
import { CurrentActor, RequireTag } from '../identity/auth/auth.decorators';
import { PaperService } from './paper.service';

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Số cảnh báo tối đa gửi kèm ở header (đủ để giao diện hiện, không làm header quá lớn). */
const MAX_WARNINGS = 20;

const text = (max: number) => z.string().trim().min(1).max(max);
const bool = z.boolean().optional();

const exportSchema = z
  .strictObject({
    sessionId: z.uuid().optional(),
    examId: z.uuid().optional(),
    course: text(150),
    title: text(100).optional(),
    examCode: text(50).optional(),
    unit: text(150).optional(),
    preset: z.enum(['school', 'compact']).optional(),
    blocks: z.strictObject({ nationalHeader: bool, candidateFields: bool, grid: bool }).optional(),
  })
  .refine((body) => (body.sessionId === undefined) !== (body.examId === undefined), {
    message: 'Chọn đúng một trong sessionId hoặc examId',
  });

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
    const { sessionId, examId, ...request } = exportSchema.parse(body);
    const source = sessionId ? { sessionId } : { examId: examId as string };
    const { bytes, filename, warnings } = await this.paper.exportExam(actor, source, request);
    const shown = warnings.slice(0, MAX_WARNINGS);
    if (warnings.length > shown.length)
      shown.push(`và ${warnings.length - shown.length} cảnh báo khác`);
    reply
      .header('content-type', DOCX_CONTENT_TYPE)
      .header('content-disposition', `attachment; filename="${filename}"`)
      .header('x-paper-warnings', encodeURIComponent(JSON.stringify(shown)))
      .header('cache-control', 'no-store');
    return Buffer.from(bytes);
  }
}
