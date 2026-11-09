import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../queue/job-queue';
import { BackupService } from './backup.service';

// Mỗi 30 phút (Q363). Quy tắc nằm ở BackupService.check.
const CHECK_CRON = '*/30 * * * *';

/** Hàm cho biết ứng dụng đã chạy bao lâu (giây); tách ra để thử với đồng hồ giả. */
export const UPTIME_SECONDS = Symbol('UPTIME_SECONDS');

@Injectable()
export class BackupCheckJob implements OnModuleInit {
  private readonly logger = new Logger(BackupCheckJob.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly backup: BackupService,
    @Inject(UPTIME_SECONDS) private readonly uptimeSeconds: () => number,
  ) {}

  onModuleInit() {
    this.registry.register('backup.check', () => this.run(), { cron: CHECK_CRON });
  }

  async run(): Promise<void> {
    // Mỗi bước độc lập: một bước lỗi chỉ ghi log, lần sau (30 phút) thử lại; không làm hỏng worker.
    try {
      await this.backup.check(this.uptimeSeconds());
    } catch (error) {
      this.logger.error('Kiểm tra sao lưu lỗi', error);
    }
    try {
      await this.backup.purgeOld();
    } catch (error) {
      this.logger.error('Dọn kết quả sao lưu cũ lỗi', error);
    }
  }
}
