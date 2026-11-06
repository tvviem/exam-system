import { blindGradingSchema, penaltySchema, saveGradeSchema } from '@exam/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import type { Actor } from '../../common/actor';
import { CurrentActor, CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { DelegationService } from './delegation.service';
import { ManualGradingService } from './manual-grading.service';
import { PenaltiesService } from './penalties.service';
import { ResultsService } from './results.service';

const uuid = () => new ParseUUIDPipe();

/** Chấm tay, Kết quả và Mức xử lý của một Phiên thi (PR 5b): chủ Phiên thi hoặc người được Ủy quyền, người khác nhận 404. */
@RequireTag('examiner')
@Controller()
export class GradingController {
  constructor(
    private readonly manual: ManualGradingService,
    private readonly results: ResultsService,
    private readonly penalties: PenaltiesService,
    private readonly delegation: DelegationService,
  ) {}

  @Get('grading/delegated-sessions')
  delegated(@CurrentUser() user: AuthenticatedUser) {
    return this.delegation.delegatedTo(user.id);
  }

  @Get('sessions/:sessionId/grading/items')
  items(@Param('sessionId', uuid()) sessionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.manual.items(user.id, sessionId);
  }

  @Get('sessions/:sessionId/grading/items/:itemId/queue')
  queue(
    @Param('sessionId', uuid()) sessionId: string,
    @Param('itemId', uuid()) itemId: string,
    @Query('filter') filter: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.manual.queue(user.id, sessionId, itemId, filter === 'all' ? 'all' : 'pending');
  }

  @Get('sessions/:sessionId/grading/items/:itemId/attempts/:attemptId')
  entry(
    @Param('sessionId', uuid()) sessionId: string,
    @Param('itemId', uuid()) itemId: string,
    @Param('attemptId', uuid()) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.manual.entry(user.id, sessionId, itemId, attemptId);
  }

  @Put('sessions/:sessionId/grading/attempts/:attemptId/items/:itemId')
  save(
    @Param('sessionId', uuid()) sessionId: string,
    @Param('attemptId', uuid()) attemptId: string,
    @Param('itemId', uuid()) itemId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.manual.save(actor, sessionId, attemptId, itemId, saveGradeSchema.parse(body ?? {}));
  }

  @Get('sessions/:sessionId/grading/blind')
  blind(@Param('sessionId', uuid()) sessionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.manual.getBlind(user.id, sessionId);
  }

  @Put('sessions/:sessionId/grading/blind')
  setBlind(
    @Param('sessionId', uuid()) sessionId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.manual.setBlind(actor, sessionId, blindGradingSchema.parse(body ?? {}).blind);
  }

  @Get('sessions/:sessionId/results')
  resultsOf(@Param('sessionId', uuid()) sessionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.results.results(user.id, sessionId);
  }

  @Get('sessions/:sessionId/results/item-stats')
  itemStats(@Param('sessionId', uuid()) sessionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.results.itemStats(user.id, sessionId);
  }

  @Get('sessions/:sessionId/results/people/:userId')
  person(
    @Param('sessionId', uuid()) sessionId: string,
    @Param('userId', uuid()) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.results.person(user.id, sessionId, userId);
  }

  @Get('sessions/:sessionId/violations')
  violations(
    @Param('sessionId', uuid()) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.results.violationList(user.id, sessionId);
  }

  @Put('sessions/:sessionId/violations/:violationId/penalty')
  setPenalty(
    @Param('sessionId', uuid()) sessionId: string,
    @Param('violationId', uuid()) violationId: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.penalties.set(actor, sessionId, violationId, penaltySchema.parse(body ?? {}));
  }
}
