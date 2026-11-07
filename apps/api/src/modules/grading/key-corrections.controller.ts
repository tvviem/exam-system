import { keyCorrectionPreviewSchema, keyCorrectionSchema } from '@exam/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { Actor } from '../../common/actor';
import { CurrentActor, CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { KeyCorrectionsService } from './key-corrections.service';

const uuid = () => new ParseUUIDPipe();

/** Đính chính đáp án: chỉ chủ Bộ đề; người khác nhận 404. */
@RequireTag('examiner')
@Controller('exams/:examId')
export class KeyCorrectionsController {
  constructor(private readonly corrections: KeyCorrectionsService) {}

  @Get('key-correction-items')
  items(@Param('examId', uuid()) examId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.corrections.items(user.id, examId);
  }

  @Get('items/:itemId/key-corrections')
  history(
    @Param('examId', uuid()) examId: string,
    @Param('itemId', uuid()) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.corrections.history(user.id, examId, itemId);
  }

  @Post('items/:itemId/key-correction/preview')
  @HttpCode(200)
  preview(
    @Param('examId', uuid()) examId: string,
    @Param('itemId', uuid()) itemId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.corrections.preview(
      user.id,
      examId,
      itemId,
      keyCorrectionPreviewSchema.parse(body ?? {}),
    );
  }

  @Post('items/:itemId/key-correction')
  @HttpCode(202)
  create(
    @Param('examId', uuid()) examId: string,
    @Param('itemId', uuid()) itemId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.corrections.create(actor, examId, itemId, keyCorrectionSchema.parse(body ?? {}));
  }

  @Get('key-corrections/:correctionId')
  progress(
    @Param('examId', uuid()) examId: string,
    @Param('correctionId', uuid()) correctionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.corrections.progress(user.id, examId, correctionId);
  }

  @Post('key-corrections/:correctionId/retry')
  @HttpCode(202)
  retry(
    @Param('examId', uuid()) examId: string,
    @Param('correctionId', uuid()) correctionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.corrections.retry(user.id, examId, correctionId);
  }
}
