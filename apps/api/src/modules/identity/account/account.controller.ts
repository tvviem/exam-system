import { Body, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import type { Actor } from '../../../common/actor';
import { ApiError } from '../../../common/api-error';
import { CurrentActor, CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { academicDegreeEnum, academicTitleEnum, genderEnum } from '../identity.schema';
import { AccountService, editableFieldsOf } from './account.service';

const changesSchema = z.strictObject({
  fullName: z.string().trim().min(1).max(200),
  dateOfBirth: z.iso.date().nullable(),
  gender: z.enum(genderEnum.enumValues).nullable(),
  academicDegree: z.enum(academicDegreeEnum.enumValues).nullable(),
  academicTitle: z.enum(academicTitleEnum.enumValues).nullable(),
});

@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.account.get(user);
  }

  @Patch()
  update(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentActor() actor: Actor,
  ) {
    const input = (body ?? {}) as Record<string, unknown>;
    // Trường không thuộc quyền tự sửa của vai trò này (kể cả trường lạ) bị từ chối, nêu rõ từng trường.
    const editable: string[] = editableFieldsOf(user);
    const forbidden = Object.keys(input).filter((key) => !editable.includes(key));
    if (forbidden.length > 0) {
      throw new ApiError('VALIDATION_FAILED', {
        issues: forbidden.map((path) => ({ path, code: 'not_editable' })),
      });
    }
    return this.account.update(user, actor, changesSchema.partial().parse(input));
  }
}
