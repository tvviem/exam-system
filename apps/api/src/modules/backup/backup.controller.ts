import { Controller, Get, Query } from '@nestjs/common';
import { pageSchema } from '../../common/pagination';
import { AdminOnly } from '../identity/auth/auth.decorators';
import { BackupService } from './backup.service';

/** Màn hình "Sao lưu" chỉ đọc cho Quản trị viên (Q365). Không có đường ghi nào: script sao lưu ghi bảng, không phải ứng dụng. */
@AdminOnly()
@Controller('admin/backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get()
  async get(@Query() query: unknown) {
    const [summary, runs] = await Promise.all([
      this.backup.summary(),
      this.backup.list(pageSchema.parse(query ?? {})),
    ]);
    return { summary, runs };
  }
}
