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
} from '@nestjs/common';
import { z } from 'zod';
import type { Actor } from '../../../common/actor';
import { pageSchema } from '../../../common/pagination';
import { AdminOnly, CurrentActor } from '../auth/auth.decorators';
import { academicDegreeEnum, academicTitleEnum, genderEnum, roleTagEnum } from '../identity.schema';
import { USER_STATUSES, UserManagementService } from './user-management.service';

const listSchema = pageSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(USER_STATUSES).optional(),
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

const topicIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length, 'Chủ đề trùng');
const transferSchema = z.strictObject({ topicIds: topicIdsSchema, recipientId: z.uuid() });
// `?topicIds=a,b,c`: số liệu đúng cho các Chủ đề đang chọn (ảnh dùng chung chỉ đếm một lần).
const contentQuerySchema = z.object({
  topicIds: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',') : undefined))
    .pipe(z.array(z.uuid()).max(500).optional()),
  // `?recipientId=`: cho hộp xác nhận Xóa biết người nhận đang có tên trong Danh sách của Phiên thi nào (Q263).
  recipientId: z.uuid().optional(),
});
const removeQuerySchema = z.object({ recipientId: z.uuid().optional() });
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
    @CurrentActor() actor: Actor,
  ) {
    await this.users.update(actor, id, updateSchema.parse(body ?? {}));
    return this.users.detail(id);
  }

  @Post(':id/lock')
  @HttpCode(200)
  async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    const { reason } = lockSchema.parse(body ?? {});
    await this.users.lock(actor, id, reason);
    return this.users.detail(id);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  async unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    const { reason } = unlockSchema.parse(body ?? {});
    await this.users.unlock(actor, id, reason || null);
    return this.users.detail(id);
  }

  @Get(':id/content')
  content(@Param('id', ParseUUIDPipe) id: string, @Query() query: unknown) {
    const { topicIds, recipientId } = contentQuerySchema.parse(query ?? {});
    return this.users.contentOf(id, topicIds, recipientId);
  }

  @Post(':id/transfer')
  @HttpCode(200)
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.users.transfer(actor, id, transferSchema.parse(body ?? {}));
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @CurrentActor() actor: Actor,
  ) {
    const { recipientId } = removeQuerySchema.parse(query ?? {});
    await this.users.remove(actor, id, recipientId);
    return this.users.detail(id);
  }

  @Put(':id/role-tags/:tag')
  async grantRoleTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tag') tag: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.users.grantRoleTag(actor, id, roleTagParam.parse(tag));
    return this.users.detail(id);
  }

  @Delete(':id/role-tags/:tag')
  async revokeRoleTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tag') tag: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.users.revokeRoleTag(actor, id, roleTagParam.parse(tag));
    return this.users.detail(id);
  }

  @Post(':id/temporary-password')
  @HttpCode(200)
  reissueTemporaryPassword(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.users.reissueTemporaryPassword(actor, id);
  }
}

@AdminOnly()
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly users: UserManagementService) {}

  @Post()
  create(@Body() body: unknown, @CurrentActor() actor: Actor) {
    return this.users.createAdmin(actor, createAdminSchema.parse(body ?? {}));
  }
}
