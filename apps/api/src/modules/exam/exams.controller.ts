import { examContentSchema } from '@exam/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { pageSchema } from '../../common/pagination';
import { CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { examStatusEnum } from './exam.schema';
import { ExamLifecycleService } from './exam-lifecycle.service';
import { ExamsService } from './exams.service';

const titleSchema = examContentSchema.shape.title;
const createSchema = z.strictObject({ title: titleSchema });
const publishSchema = z.strictObject({ version: z.number().int().min(1) });
const previewSchema = z.strictObject({
  showScoringRules: z.enum(['true', 'false']).optional(),
});
const listSchema = pageSchema.extend({
  status: z.enum(examStatusEnum.enumValues).optional(),
  q: z.string().trim().max(200).optional(),
});

@RequireTag('examiner')
@Controller('exams')
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly lifecycle: ExamLifecycleService,
  ) {}

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.create(user.id, createSchema.parse(body ?? {}).title);
  }

  @Get()
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { page, pageSize, ...filter } = listSchema.parse(query);
    return this.exams.list(user.id, filter, { page, pageSize });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.get(user.id, id);
  }

  @Get(':id/publish-check')
  publishCheck(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.publishCheck(user.id, id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lifecycle.publish(user.id, id, publishSchema.parse(body ?? {}).version);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.duplicate(user.id, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.archive(user.id, id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.restore(user.id, id);
  }

  @Get(':id/preview')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { showScoringRules } = previewSchema.parse(query);
    return this.exams.preview(user.id, id, { showScoringRules: showScoringRules === 'true' });
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.update(user.id, id, examContentSchema.parse(body));
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.exams.remove(user.id, id);
  }
}
