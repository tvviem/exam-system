import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pageSchema } from '../../../common/pagination';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { academicDegreeEnum, academicTitleEnum, genderEnum, roleTagEnum } from '../identity.schema';
import { type Actor, UserManagementService } from './user-management.service';

const listSchema = pageSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'locked', 'removed']).optional(),
  roleTag: z.enum(roleTagEnum.enumValues).optional(),
});

/** Chuỗi rỗng sau khi cắt khoảng trắng được hiểu là bỏ trống (null). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const updateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    username: optionalText(100),
    email: z.email().max(320).nullable().optional(),
    code: optionalText(50),
    classLabel: optionalText(50),
    dateOfBirth: z.iso.date().nullable().optional(),
    gender: z.enum(genderEnum.enumValues).nullable().optional(),
    examinerProfile: z
      .object({
        academicDegree: z.enum(academicDegreeEnum.enumValues).nullable().optional(),
        academicTitle: z.enum(academicTitleEnum.enumValues).nullable().optional(),
        unitId: z.uuid().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const actorOf = (user: AuthenticatedUser, req: FastifyRequest): Actor => ({
  id: user.id,
  ip: req.ip ?? null,
});

@AdminOnly()
@Controller('admin/users')
export class UserManagementController {
  constructor(private readonly users: UserManagementService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.users.list(listSchema.parse(query ?? {}));
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.detail(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    await this.users.update(actorOf(user, req), id, updateSchema.parse(body ?? {}));
    return this.users.detail(id);
  }
}
