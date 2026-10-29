import { questionInputSchema, questionTypeSchema } from '@exam/shared';
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
import { QuestionsService } from './questions.service';

const listSchema = pageSchema.extend({
  topicId: z.uuid().optional(),
  type: questionTypeSchema.optional(),
  tag: z.string().trim().max(30).optional(),
  q: z.string().trim().max(200).optional(),
});
const versionSchema = z.object({ version: z.number().int().min(1) });
const idsSchema = z.array(z.uuid()).min(1).max(200);
const moveSchema = z.strictObject({ ids: idsSchema, topicId: z.uuid() });
const deleteSchema = z.strictObject({ ids: idsSchema });

@RequireTag('examiner')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { page, pageSize, ...filter } = listSchema.parse(query);
    return this.questions.list(user.id, filter, { page, pageSize });
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.create(user.id, questionInputSchema.parse(body));
  }

  // Hai đường dẫn tĩnh đặt trước các đường dẫn có :id.
  @Post('move')
  @HttpCode(200)
  move(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { ids, topicId } = moveSchema.parse(body ?? {});
    return this.questions.move(user.id, ids, topicId);
  }

  @Post('delete')
  @HttpCode(200)
  removeMany(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.remove(user.id, deleteSchema.parse(body ?? {}).ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.get(user.id, id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { version, ...input } = { ...versionSchema.parse(body), ...(body as object) };
    return this.questions.update(user.id, id, questionInputSchema.parse(input), version);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.questions.remove(user.id, [id]);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.duplicate(user.id, id);
  }
}
