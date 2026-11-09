import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupCheckJob, UPTIME_SECONDS } from './backup-check.job';

@Module({
  imports: [NotificationsModule],
  controllers: [BackupController],
  providers: [
    BackupService,
    BackupCheckJob,
    { provide: UPTIME_SECONDS, useValue: () => process.uptime() },
  ],
  exports: [BackupService],
})
export class BackupModule {}
