import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../queue/job-queue';
import { MailService } from './mail.service';
import { MailQuotaService } from './mail-quota.service';

// Mỗi phút: lưới an toàn nếu việc xếp job bị mất (Redis hỏng) hoặc có thư đến hạn thử lại. Thường thì `enqueue` kích ngay.
const DISPATCH_CRON = '* * * * *';

@Injectable()
export class MailDispatchJob implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly mail: MailService,
    private readonly quota: MailQuotaService,
  ) {}

  onModuleInit() {
    this.registry.register(
      'mail.dispatch',
      async () => {
        await this.mail.dispatch();
        await this.quota.checkBell(); // chuông quá 70 % hạn mức (D-38)
      },
      { cron: DISPATCH_CRON },
    );
  }
}
