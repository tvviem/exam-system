import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { TopicsService } from './topics.service';

const name = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(100));
const description = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null)
  .nullable();

const createSchema = z.strictObject({ name, description: description.optional() });
const updateSchema = z.strictObject({ name: name.optional(), description: description.optional() });
const listSchema = z.object({ includeArchived: z.enum(['true', 'false']).default('false') });

@RequireTag('examiner')
@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { includeArchived } = listSchema.parse(query);
    return this.topics.list(user.id, includeArchived === 'true');
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.topics.create(user.id, createSchema.parse(body ?? {}));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.topics.update(user.id, id, updateSchema.parse(body ?? {}));
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.topics.remove(user.id, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.topics.archive(user.id, id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.topics.restore(user.id, id);
  }
}
