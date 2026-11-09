import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import { ADMIN_DIRECTORY, type AdminDirectory } from '../../common/admin-directory';
import { CLOCK, type Clock } from '../../common/clock';
import { type Page, paginate } from '../../common/pagination';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { NotificationsService } from '../notifications/notifications.service';
import { backupRuns } from './backup.schema';

/** Kết quả sao lưu giữ từng này tháng (Q366), cùng mức với lịch sử đăng nhập. */
export const RETENTION_MONTHS = 12;
/** Bản đêm cũ hơn mức này thì báo (Q323, Q363). */
export const STALE_AFTER_HOURS = 26;
/** Ứng dụng phải chạy liên tục ít nhất từng này mới được báo "quá cũ": đủ để `catchup` chạy bù xong (Q363). */
export const MIN_UPTIME_SECONDS = 30 * 60;
/** Loại việc của dump đêm: căn cứ của chuông "quá 26 giờ". */
export const NIGHTLY_KIND = 'dump-nightly';

export interface BackupRunItem {
  id: string;
  kind: string;
  status: 'ok' | 'failed';
  finishedAt: Date;
  seconds: number | null;
  bytes: number | null;
  detail: string | null;
}

const runColumns = {
  id: backupRuns.id,
  kind: backupRuns.kind,
  status: backupRuns.status,
  finishedAt: backupRuns.finishedAt,
  seconds: backupRuns.seconds,
  bytes: backupRuns.bytes,
  detail: backupRuns.detail,
};

@Injectable()
export class BackupService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ADMIN_DIRECTORY) private readonly admins: AdminDirectory,
    private readonly notifications: NotificationsService,
  ) {}

  /** Mỗi loại việc một dòng mới nhất. */
  private latestPerKind(): Promise<BackupRunItem[]> {
    return this.db
      .selectDistinctOn([backupRuns.kind], runColumns)
      .from(backupRuns)
      .orderBy(backupRuns.kind, desc(backupRuns.finishedAt), desc(backupRuns.id));
  }

  private async latestOk(kind: string): Promise<BackupRunItem | null> {
    const [row] = await this.db
      .select(runColumns)
      .from(backupRuns)
      .where(and(eq(backupRuns.kind, kind), eq(backupRuns.status, 'ok')))
      .orderBy(desc(backupRuns.finishedAt), desc(backupRuns.id))
      .limit(1);
    return row ?? null;
  }

  /** Ba ô tóm tắt và các vấn đề chưa xử lý (Q365). */
  async summary() {
    const [nightly, base, latest] = await Promise.all([
      this.latestOk(NIGHTLY_KIND),
      this.latestOk('basebackup'),
      this.latestPerKind(),
    ]);
    return {
      nightly,
      base,
      restoreTest: latest.find((r) => r.kind === 'restore-test') ?? null,
      // Vấn đề chưa xử lý: loại việc mà dòng mới nhất là lỗi (có dòng thành công hoặc phục hồi sau đó thì hết).
      issues: latest.filter((r) => r.status === 'failed'),
    };
  }

  /** Lần chạy gần đây, mới nhất trước (Q365). */
  list({ page, pageSize }: Page) {
    return paginate(
      { page, pageSize },
      () => this.db.select({ total: count() }).from(backupRuns),
      (limit, offset) =>
        this.db
          .select(runColumns)
          .from(backupRuns)
          .orderBy(desc(backupRuns.finishedAt), desc(backupRuns.id))
          .limit(limit)
          .offset(offset),
    );
  }

  /**
   * Báo chuông cho mọi Quản trị viên đang hoạt động (Q363, Q364). Chạy mỗi 30 phút trong worker.
   * - Việc nào có dòng mới nhất là lỗi thì báo `backup.failed` (một chuông chưa đọc mỗi loại việc); có dòng ok sau đó thì tắt.
   * - Bản đêm thành công mới nhất cũ hơn 26 giờ VÀ ứng dụng đã chạy ít nhất 30 phút thì báo `backup.stale`; có bản mới thì tắt.
   *   Chưa có dòng nào trong bảng (script chưa báo) thì không báo; chưa có bản đêm ok nào thì tính từ dòng đầu tiên.
   */
  async check(uptimeSeconds: number): Promise<void> {
    const userIds = await this.admins.activeAdminIds();
    if (userIds.length === 0) return;
    const latest = await this.latestPerKind();
    if (latest.length === 0) return;
    const now = this.clock.now();
    // Bản đêm THÀNH CÔNG gần nhất (không phải dòng mới nhất của loại này: dòng mới nhất có thể là lỗi).
    const nightly = await this.latestOk(NIGHTLY_KIND);
    const reference =
      nightly?.finishedAt ?? new Date(Math.min(...latest.map((r) => r.finishedAt.getTime())));
    const ageHours = (now.getTime() - reference.getTime()) / 3_600_000;

    await this.db.transaction(async (tx: Transaction) => {
      for (const run of latest) {
        if (run.status === 'failed') {
          await this.notifications.upsertUnreadKeyed(
            {
              userIds,
              type: 'backup.failed',
              keyField: 'kind',
              key: run.kind,
              data: { detail: run.detail ?? '' },
            },
            tx,
          );
        } else {
          await this.notifications.clearUnreadKeyed(
            { userIds, type: 'backup.failed', keyField: 'kind', key: run.kind },
            tx,
          );
        }
      }
      if (ageHours <= STALE_AFTER_HOURS) {
        await this.notifications.clearUnreadKeyed(
          { userIds, type: 'backup.stale', keyField: 'kind', key: NIGHTLY_KIND },
          tx,
        );
      } else if (uptimeSeconds >= MIN_UPTIME_SECONDS) {
        await this.notifications.upsertUnreadKeyed(
          {
            userIds,
            type: 'backup.stale',
            keyField: 'kind',
            key: NIGHTLY_KIND,
            data: { hours: Math.floor(ageHours) },
          },
          tx,
        );
      }
    });
  }

  /**
   * Xóa kết quả quá 12 tháng (Q366). Chạy cùng job `backup.check` (không đặt trong `maintenance.cleanup` của identity để module
   * identity không phải import bảng của backup, xem architecture.test.ts). Sổ gốc ở máy (backup-runs.jsonl) không bị đụng.
   */
  async purgeOld(): Promise<void> {
    const cutoff = this.clock.now();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
    await this.db.delete(backupRuns).where(lt(backupRuns.finishedAt, cutoff));
  }
}
