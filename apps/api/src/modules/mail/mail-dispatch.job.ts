import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../queue/job-queue';
import { MailService } from './mail.service';

// Mỗi phút: lưới an toàn nếu việc xếp job bị mất (Redis hỏng) hoặc có thư đến hạn thử lại. Thường thì `enqueue` kích ngay.
const DISPATCH_CRON = '* * * * *';

@Injectable()
export class MailDispatchJob implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    this.registry.register('mail.dispatch', () => this.mail.dispatch(), { cron: DISPATCH_CRON });
  }
}
