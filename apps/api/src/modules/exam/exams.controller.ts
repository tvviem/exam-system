import { examContentSchema } from '@exam/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
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
import { ExamsService } from './exams.service';

const titleSchema = examContentSchema.shape.title;
const createSchema = z.strictObject({ title: titleSchema });
const listSchema = pageSchema.extend({
  status: z.enum(examStatusEnum.enumValues).optional(),
  q: z.string().trim().max(200).optional(),
});

@RequireTag('examiner')
@Controller('exams')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

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
