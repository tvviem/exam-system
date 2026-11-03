import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { RealtimeGateway } from './realtime.gateway';

/** Cổng Socket.IO: chỉ có ở api (worker không nhận kết nối). Cổng quyền `REALTIME_ACCESS` do `RealtimeWiringModule` nối. */
@Module({ imports: [IdentityModule], providers: [RealtimeGateway] })
export class RealtimeModule {}
