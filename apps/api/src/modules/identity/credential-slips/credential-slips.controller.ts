import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Actor } from '../../../common/actor';
import { ApiError } from '../../../common/api-error';
import { canViewAccountRequests } from '../account-requests/account-requests.service';
import { CurrentActor, CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CredentialSlipsService, type SlipFormat } from './credential-slips.service';

@Controller('credential-slips')
export class CredentialSlipsController {
  constructor(private readonly slips: CredentialSlipsService) {}

  @Get(':id/pdf')
  pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.send(id, 'pdf', user, actor, reply);
  }

  @Get(':id/xlsx')
  xlsx(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.send(id, 'xlsx', user, actor, reply);
  }

  private async send(
    id: string,
    format: SlipFormat,
    user: AuthenticatedUser,
    actor: Actor,
    reply: FastifyReply,
  ) {
    if (!canViewAccountRequests(user)) throw new ApiError('FORBIDDEN');
    const { content, contentType, date } = await this.slips.download(user, actor, id, format);
    reply
      .header('content-type', contentType)
      .header('content-disposition', `attachment; filename="phieu-tai-khoan-${date}.${format}"`)
      .header('cache-control', 'no-store');
    return content;
  }
}
