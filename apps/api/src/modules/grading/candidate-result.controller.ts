import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { CandidateResultService } from './candidate-result.service';

/** Kết quả của chính Người dự thi sau Công bố (PR 5c): người ngoài Danh sách nhận 404, chưa Công bố nhận 409 `NOT_RELEASED`. */
@RequireTag('candidate')
@Controller('take/sessions/:sessionId/result')
export class CandidateResultController {
  constructor(private readonly results: CandidateResultService) {}

  @Get()
  result(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.results.result(user.id, sessionId);
  }
}
