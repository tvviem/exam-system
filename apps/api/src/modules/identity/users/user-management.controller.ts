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
  Put,
  Query,
  Req,
} from '@nestjs/common';
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

const lockSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
const unlockSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

const createAdminSchema = z
  .object({
    username: z.string().trim().min(1).max(100),
    email: z.email().max(320).nullable().default(null),
    fullName: z.string().trim().min(1).max(200),
  })
  .strict();

const roleTagParam = z.enum(roleTagEnum.enumValues);

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

  @Post(':id/lock')
  @HttpCode(200)
  async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    const { reason } = lockSchema.parse(body ?? {});
    await this.users.lock(actorOf(user, req), id, reason);
    return this.users.detail(id);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  async unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    const { reason } = unlockSchema.parse(body ?? {});
    await this.users.unlock(actorOf(user, req), id, reason || null);
    return this.users.detail(id);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    await this.users.remove(actorOf(user, req), id);
    return this.users.detail(id);
  }

  @Put(':id/role-tags/:tag')
  async grantRoleTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tag') tag: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    await this.users.grantRoleTag(actorOf(user, req), id, roleTagParam.parse(tag));
    return this.users.detail(id);
  }

  @Delete(':id/role-tags/:tag')
  async revokeRoleTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tag') tag: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    await this.users.revokeRoleTag(actorOf(user, req), id, roleTagParam.parse(tag));
    return this.users.detail(id);
  }

  @Post(':id/temporary-password')
  @HttpCode(200)
  reissueTemporaryPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.reissueTemporaryPassword(actorOf(user, req), id);
  }
}

@AdminOnly()
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly users: UserManagementService) {}

  @Post()
  create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.createAdmin(actorOf(user, req), createAdminSchema.parse(body ?? {}));
  }
}
