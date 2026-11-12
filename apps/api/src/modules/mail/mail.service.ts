import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, gt, inArray, lt, lte, min, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CLOCK, type Clock } from '../../common/clock';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { JOB_QUEUE, type JobQueue } from '../../queue/job-queue';
import {
  CIRCUIT_OPEN_MS,
  DISPATCH_BUDGET_MS,
  DISPATCH_LOCK_KEY,
  DISPATCH_STUCK_MS,
  MAIL_LIMITS,
  MAX_ATTEMPTS,
  MAX_INLINE_WAIT_MS,
  STUCK_AFTER_MS,
} from './mail.config';
import {
  MAIL_BRAND,
  MAIL_PAUSE,
  MAIL_SECRETS,
  MAIL_TRANSPORT,
  type MailKind,
  type MailPause,
  MailSendError,
  type MailTransport,
  MESSAGE_BUILDER,
  type MessageBuilder,
} from './mail.ports';
import { emailOutbox } from './mail.schema';
import { type MailBrand, renderMail, renderTestMail } from './mail-templates';
import { type PlanLimits, planBatch } from './plan-batch';

export interface EnqueueMail {
  kind: MailKind;
  toEmail: string;
  lane: 'urgent' | 'bulk';
  userId?: string;
  requestedBy?: string;
  /** Dữ liệu không bí mật cho mẫu thư (không bao giờ là mã hay mật khẩu). */
  context?: Record<string, string>;
}

export type TestMailResult =
  | { status: 'sent' }
  | { status: 'not_configured' }
  | { status: 'invalid_address' }
  | { status: 'failed'; kind: MailSendError['kind']; message: string };

export interface MailRecord {
  id: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'rejected' | 'skipped';
  attemptCount: number;
  lastError: string | null;
}

/**
 * Giao diện của module `mail` (ADR-0009): người gọi chỉ xếp thư; hạn mức, thử lại, dựng thư lúc gửi nằm bên trong.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Giờ bắt đầu lần chạy đang diễn ra của tiến trình này, hoặc null. Tự hết hạn để một lần gửi treo không chặn mãi. */
  private dispatchingSince: number | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
    @Inject(MESSAGE_BUILDER) private readonly builder: MessageBuilder,
    @Inject(MAIL_PAUSE) private readonly pause: MailPause,
    @Inject(MAIL_LIMITS) private readonly limits: PlanLimits,
    @Inject(MAIL_SECRETS) private readonly secrets: string[],
    @Inject(MAIL_BRAND) private readonly brand: MailBrand,
  ) {}

  async enqueue(mail: EnqueueMail): Promise<{ id: string }> {
    const [id] = await this.enqueueMany([mail]);
    return { id: id as string };
  }

  /**
   * Xếp thư trừ khi cùng người nhận đã có thư cùng loại trong `cooldownMs` gần đây (giới hạn gửi lại, Q375). Thư đã
   * lỗi hoặc bị từ chối không tính, để người ta gửi lại được. Khi bị chặn, trả giờ được phép gửi lại.
   */
  async enqueueWithCooldown(
    mail: EnqueueMail,
    options: { cooldownMs: number },
  ): Promise<{ queued: true; id: string } | { queued: false; allowedAt: Date }> {
    const now = this.clock.now();
    const key = `${mail.kind}:${mail.toEmail.toLowerCase()}`;
    const outcome = await this.db.transaction(async (tx) => {
      // Hai yêu cầu đồng thời cho cùng khóa phải nối đuôi nhau, nếu không cả hai cùng thấy "chưa có thư".
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      const [latest] = await tx
        .select({ createdAt: emailOutbox.createdAt })
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.kind, mail.kind),
            sql`lower(${emailOutbox.toEmail}) = ${mail.toEmail.toLowerCase()}`,
            inArray(emailOutbox.status, ['pending', 'sending', 'sent']),
            gt(emailOutbox.createdAt, new Date(now.getTime() - options.cooldownMs)),
          ),
        )
        .orderBy(desc(emailOutbox.createdAt))
        .limit(1);
      if (latest) {
        return {
          queued: false as const,
          allowedAt: new Date(latest.createdAt.getTime() + options.cooldownMs),
        };
      }
      const [row] = await this.insertRows(tx, [mail], now);
      return { queued: true as const, id: (row as { id: string }).id };
    });
    if (outcome.queued) await this.kick();
    return outcome;
  }

  /** Xếp cả lô trong một giao dịch và kích job gửi một lần (duyệt cả lớp, H-01). */
  async enqueueMany(mails: EnqueueMail[]): Promise<string[]> {
    if (mails.length === 0) return [];
    const rows = await this.insertRows(this.db, mails, this.clock.now());
    await this.kick();
    return rows.map((row) => row.id);
  }

  /**
   * Báo worker có thư mới. Thư đã nằm bền trong cơ sở dữ liệu nên nếu Redis hỏng thì chỉ chậm tới lần cron kế (mỗi
   * phút), không được làm hỏng luồng nghiệp vụ của người gọi (ví dụ trang Quên mật khẩu).
   */
  private async kick(): Promise<void> {
    try {
      await this.queue.enqueue('mail.dispatch', {});
    } catch (error) {
      this.logger.warn(`Không báo được worker, chờ cron mỗi phút: ${(error as Error).message}`);
    }
  }

  private insertRows(db: Database | Transaction, mails: EnqueueMail[], now: Date) {
    return db
      .insert(emailOutbox)
      .values(
        mails.map((mail) => ({
          kind: mail.kind,
          lane: mail.lane,
          toEmail: mail.toEmail,
          userId: mail.userId ?? null,
          requestedBy: mail.requestedBy ?? null,
          context: mail.context ?? null,
          nextAttemptAt: now,
          createdAt: now,
        })),
      )
      .returning({ id: emailOutbox.id });
  }

  /** Gửi thư thử tới `toEmail` qua vận chuyển đã cấu hình (không qua hàng đợi), để kiểm cấu hình trước production. */
  async sendTest(toEmail: string): Promise<TestMailResult> {
    if (!this.transport) return { status: 'not_configured' };
    if (!z.email().safeParse(toEmail).success) return { status: 'invalid_address' };
    try {
      await this.transport.send({
        to: toEmail,
        ...renderTestMail(this.brand, this.clock.now()),
      });
      return { status: 'sent' };
    } catch (error) {
      const kind = error instanceof MailSendError ? error.kind : 'temporary';
      const message = redactSecrets(
        error instanceof Error ? error.message : String(error),
        this.secrets,
      );
      return { status: 'failed', kind, message };
    }
  }

  /** Số thư theo trạng thái (chỉ đọc), cho màn hình theo dõi và cho test. */
  async counts(): Promise<Record<MailRecord['status'], number>> {
    const rows = await this.db
      .select({ status: emailOutbox.status, n: count() })
      .from(emailOutbox)
      .groupBy(emailOutbox.status);
    const result = { pending: 0, sending: 0, sent: 0, failed: 0, rejected: 0, skipped: 0 };
    for (const row of rows) result[row.status] = row.n;
    return result;
  }

  async get(id: string): Promise<MailRecord | null> {
    const [row] = await this.db
      .select({
        id: emailOutbox.id,
        status: emailOutbox.status,
        attemptCount: emailOutbox.attemptCount,
        lastError: emailOutbox.lastError,
      })
      .from(emailOutbox)
      .where(eq(emailOutbox.id, id));
    return row ?? null;
  }

  /**
   * Gửi các thư đến hạn theo hạn mức. Job `mail.dispatch` gọi hàm này. Mỗi tiến trình chỉ chạy một lần tại một thời
   * điểm và mỗi lần không quá `DISPATCH_BUDGET_MS`: gửi 300 thư cách nhau 6 giây mất 30 phút, một job chiếm chỗ của
   * worker lâu vậy sẽ làm các job khác (tự nộp bài quá hạn, chấm tự động) phải chờ. Hết hạn mà còn thư thì tự xếp
   * lần chạy kế vào cuối hàng đợi job, nhờ vậy job khác xen vào được.
   */
  async dispatch(): Promise<void> {
    const startedAt = this.clock.now().getTime();
    if (this.dispatchingSince !== null && startedAt - this.dispatchingSince < DISPATCH_STUCK_MS) {
      return;
    }
    this.dispatchingSince = startedAt;
    let continueLater = false;
    try {
      await this.recoverStuck();
      const firstSentAt: { value: Date | null | undefined } = { value: undefined };
      for (;;) {
        const now = this.clock.now();
        const claim = await this.claimNext(now, firstSentAt);
        if (claim.row) {
          await this.deliver(claim.row);
          firstSentAt.value ??= this.clock.now();
        } else {
          const wait = claim.wakeAt
            ? claim.wakeAt.getTime() - now.getTime()
            : Number.POSITIVE_INFINITY;
          if (wait > MAX_INLINE_WAIT_MS) return; // cron mỗi phút hoặc lần xếp thư kế tiếp sẽ đánh thức
          await this.pause(wait);
        }
        if (this.clock.now().getTime() - startedAt >= DISPATCH_BUDGET_MS) {
          continueLater = true;
          return;
        }
      }
    } finally {
      if (this.dispatchingSince === startedAt) this.dispatchingSince = null;
      // Xếp lần chạy kế sau khi đã nhả cờ, nếu không lần chạy kế thấy cờ còn bật và bỏ về ngay.
      if (continueLater) await this.kick();
    }
  }

  /** Thư kẹt ở "đang gửi" quá lâu (tiến trình chết giữa chừng): trả về hàng đợi, tính là một lần thử. */
  private async recoverStuck(): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - STUCK_AFTER_MS);
    await this.db
      .update(emailOutbox)
      .set({
        attemptCount: sql`${emailOutbox.attemptCount} + 1`,
        status: sql`CASE WHEN ${emailOutbox.attemptCount} + 1 >= ${MAX_ATTEMPTS} THEN 'failed'::mail_status ELSE 'pending'::mail_status END`,
        lockedAt: null,
        lastError: 'Tiến trình gửi bị gián đoạn giữa chừng',
      })
      .where(and(eq(emailOutbox.status, 'sending'), lt(emailOutbox.lockedAt, cutoff)));
  }

  /**
   * Chọn thư kế tiếp và đánh dấu "đang gửi" trong một giao dịch có khóa, để nhiều tiến trình cùng chạy không chọn
   * trùng thư và không vượt khoảng cách hay hạn mức. Thư đang gửi cũng tính vào hạn mức và khoảng cách.
   */
  private async claimNext(
    now: Date,
    firstSentAt: { value: Date | null | undefined },
  ): Promise<{ row: typeof emailOutbox.$inferSelect | null; wakeAt: Date | null }> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${DISPATCH_LOCK_KEY})`);
      const plan = await this.plan(tx, now, firstSentAt);
      if (!plan.send) return { row: null, wakeAt: plan.wakeAt };
      const [row] = await tx
        .update(emailOutbox)
        .set({ status: 'sending', lockedAt: now })
        .where(and(eq(emailOutbox.id, plan.send.id), eq(emailOutbox.status, 'pending')))
        .returning();
      return { row: row ?? null, wakeAt: null };
    });
  }

  /**
   * Chỉ đọc những thư có thể được chọn: thư cũ nhất đến hạn của mỗi cặp (làn, người xếp), và thư chờ thử lại sớm nhất
   * của mỗi làn (để biết giờ thức dậy). Hàng đợi 10.000 thư vẫn chỉ đọc vài dòng.
   */
  private async plan(
    db: Database | Transaction,
    now: Date,
    firstSentAt: { value: Date | null | undefined },
  ) {
    const pending = eq(emailOutbox.status, 'pending');
    const cutoff = new Date(now.getTime() - 86_400_000);
    // Tuần tự: `db` là một giao dịch (một kết nối), không chạy song song được trên cùng kết nối.
    const due = await db
      .selectDistinctOn([emailOutbox.lane, emailOutbox.requestedBy])
      .from(emailOutbox)
      .where(and(pending, lte(emailOutbox.nextAttemptAt, now)))
      .orderBy(emailOutbox.lane, emailOutbox.requestedBy, emailOutbox.createdAt, emailOutbox.id);
    const notDue = await db
      .selectDistinctOn([emailOutbox.lane])
      .from(emailOutbox)
      .where(and(pending, gt(emailOutbox.nextAttemptAt, now)))
      .orderBy(emailOutbox.lane, emailOutbox.nextAttemptAt);
    const sent = await db
      .select({
        sentAt: sql<Date>`coalesce(${emailOutbox.sentAt}, ${emailOutbox.lockedAt})`.mapWith(
          emailOutbox.sentAt,
        ),
        lane: emailOutbox.lane,
        requestedBy: emailOutbox.requestedBy,
      })
      .from(emailOutbox)
      .where(
        or(
          and(eq(emailOutbox.status, 'sent'), gt(emailOutbox.sentAt, cutoff)),
          eq(emailOutbox.status, 'sending'),
        ),
      );
    // Ngày gửi đầu tiên không đổi một khi đã có, nên chỉ hỏi một lần mỗi lần chạy.
    if (firstSentAt.value === undefined) {
      const [first] = await db.select({ at: min(emailOutbox.sentAt) }).from(emailOutbox);
      firstSentAt.value = first?.at ?? null;
    }
    return planBatch({
      queue: [...due, ...notDue],
      sent,
      now,
      limits: this.limits,
      firstSentAt: firstSentAt.value,
    });
  }

  /** `sent_at` là giờ nhận việc (lúc chọn thư trong giao dịch có khóa): căn cứ đúng cho khoảng cách và hạn mức. */
  private async deliver(row: typeof emailOutbox.$inferSelect): Promise<void> {
    if (!this.transport) {
      // Chế độ không gửi: không dựng thư (khỏi sinh mã vô ích), không gửi, không tính hạn mức.
      this.warnNotConfiguredOnce();
      await this.db
        .update(emailOutbox)
        .set({ status: 'skipped', lockedAt: null, lastError: 'Chưa cấu hình gửi thư' })
        .where(eq(emailOutbox.id, row.id));
      return;
    }
    if (await this.isRejectedAddress(row)) {
      await this.db
        .update(emailOutbox)
        .set({
          status: 'rejected',
          lockedAt: null,
          lastError: 'Địa chỉ đã bị từ chối cứng trước đó',
        })
        .where(eq(emailOutbox.id, row.id));
      return;
    }
    try {
      const content = await this.builder.build({
        kind: row.kind,
        toEmail: row.toEmail,
        userId: row.userId,
        requestedBy: row.requestedBy,
        context: row.context,
      });
      const message = renderMail(row.kind, content, this.brand);
      await this.transport.send({ to: row.toEmail, ...message });
    } catch (error) {
      await this.onSendFailure(row, error);
      return;
    }
    await this.db
      .update(emailOutbox)
      .set({ status: 'sent', sentAt: row.lockedAt ?? this.clock.now(), lockedAt: null })
      .where(eq(emailOutbox.id, row.id));
  }

  private warnedNotConfigured = false;

  private warnNotConfiguredOnce(): void {
    if (this.warnedNotConfigured) return;
    this.warnedNotConfigured = true;
    this.logger.warn('Chưa cấu hình SMTP: các thư được đánh dấu bỏ qua, không gửi đi');
  }

  /** Địa chỉ từng bị máy chủ thư từ chối cứng thì không gửi nữa, cũng không đốt hạn mức (Q382). */
  private async isRejectedAddress(row: typeof emailOutbox.$inferSelect): Promise<boolean> {
    const [hit] = await this.db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.status, 'rejected'),
          sql`lower(${emailOutbox.toEmail}) = ${row.toEmail.toLowerCase()}`,
          ne(emailOutbox.id, row.id),
        ),
      )
      .limit(1);
    return Boolean(hit);
  }

  private async onSendFailure(row: typeof emailOutbox.$inferSelect, error: unknown): Promise<void> {
    // Lỗi lạ (ví dụ bộ dựng thư hỏng) coi như tạm thời: có thử lại và có giới hạn, không lặp vô hạn.
    const kind = error instanceof MailSendError ? error.kind : 'temporary';
    const text = redactSecrets(
      error instanceof Error ? error.message : String(error),
      this.secrets,
    );
    const now = this.clock.now();
    const attempt = row.attemptCount + 1;

    if (kind === 'auth') {
      // Sai thông tin đăng nhập là lỗi cấu hình, không phải lỗi của người nhận: ngắt mạch, giữ nguyên hàng đợi.
      this.logger.error(
        `Máy chủ thư từ chối thông tin đăng nhập; tạm dừng gửi 15 phút: ${maskEmails(text)}`,
      );
      const reopenAt = new Date(now.getTime() + CIRCUIT_OPEN_MS);
      await this.db
        .update(emailOutbox)
        .set({ status: 'pending', lockedAt: null, nextAttemptAt: reopenAt, lastError: text })
        .where(
          or(
            eq(emailOutbox.id, row.id),
            and(eq(emailOutbox.status, 'pending'), lt(emailOutbox.nextAttemptAt, reopenAt)),
          ),
        );
      return;
    }
    if (kind === 'permanent') {
      await this.db
        .update(emailOutbox)
        .set({ status: 'rejected', lockedAt: null, attemptCount: attempt, lastError: text })
        .where(eq(emailOutbox.id, row.id));
      return;
    }
    if (attempt >= MAX_ATTEMPTS) {
      await this.db
        .update(emailOutbox)
        .set({ status: 'failed', lockedAt: null, attemptCount: attempt, lastError: text })
        .where(eq(emailOutbox.id, row.id));
      return;
    }
    // Lỗi tạm thời: thử lại sau 60 giây, gấp đôi mỗi lần, tối đa 1 giờ.
    const waitMs = Math.min(60_000 * 2 ** (attempt - 1), 3_600_000);
    await this.db
      .update(emailOutbox)
      .set({
        status: 'pending',
        lockedAt: null,
        attemptCount: attempt,
        nextAttemptAt: new Date(now.getTime() + waitMs),
        lastError: text,
      })
      .where(eq(emailOutbox.id, row.id));
  }
}

/** Thay mọi bí mật bằng `***` để thông báo lỗi ghi lại không làm lộ mật khẩu. */
function redactSecrets(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) if (secret) result = result.split(secret).join('***');
  return result;
}

/** Che địa chỉ email trong dòng log (m***@example.com): log không phải nơi lưu thông tin cá nhân. */
function maskEmails(text: string): string {
  return text.replace(/([\w.+-])[\w.+-]*@([\w-]+(?:\.[\w-]+)+)/g, '$1***@$2');
}
