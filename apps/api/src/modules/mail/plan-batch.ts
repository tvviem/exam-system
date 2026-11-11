export type MailLane = 'urgent' | 'bulk';

export interface QueuedMail {
  id: string;
  lane: MailLane;
  /** Người ra đề (hoặc Quản trị viên) đã xếp thư; null là hệ thống tự xếp. Căn cứ xoay vòng công bằng (Q375). */
  requestedBy: string | null;
  createdAt: Date;
  /** Chưa được gửi trước giờ này (đang chờ thử lại). */
  nextAttemptAt: Date;
}

export interface SentMail {
  sentAt: Date;
  lane: MailLane;
  requestedBy: string | null;
}

export interface PlanLimits {
  /** Tổng số thư trong 24 giờ trượt (400). */
  total: number;
  /** Trần thư hàng loạt trong 24 giờ trượt (300), đã trừ phần dự trữ cho thư khẩn. */
  bulk: number;
  /** Khoảng cách tối thiểu giữa hai thư (6 giây). */
  minGapMs: number;
  /** Trần thư hàng loạt các ngày warm-up đầu (50, 100, 150, 200, 300); rỗng là không warm-up (Q382). */
  warmupBulk: number[];
}

export interface PlanInput<T extends QueuedMail = QueuedMail> {
  /** Các thư đang chờ gửi. */
  queue: T[];
  /** Các thư đã gửi gần đây (chỉ cần trong 24 giờ qua; hàm tự lọc). */
  sent: SentMail[];
  now: Date;
  limits: PlanLimits;
  /** Lúc gửi thành công thư đầu tiên của hệ thống; rỗng là chưa gửi bao giờ (ngày warm-up thứ 1). */
  firstSentAt?: Date | null;
}

export interface Plan<T extends QueuedMail = QueuedMail> {
  /** Thư gửi ngay bây giờ, hoặc null. */
  send: T | null;
  /** Khi không gửi được thư nào: giờ sớm nhất đáng thử lại; null nếu hàng đợi rỗng. */
  wakeAt: Date | null;
}

const DAY_MS = 24 * 3_600_000;
/** Việt Nam là UTC+7 quanh năm, không có giờ mùa hè. */
const VN_OFFSET_MS = 7 * 3_600_000;

/** Số thứ tự ngày lịch giờ Việt Nam của một thời điểm. */
const vnDayIndex = (ms: number) => Math.floor((ms + VN_OFFSET_MS) / DAY_MS);

/**
 * Giờ sớm nhất mà cửa sổ trượt 24 giờ còn chỗ: `limit` thư gửi gần nhất đang chiếm chỗ thì phải chờ thư thứ
 * (số đã gửi - limit + 1) từ cũ nhất hết hạn. `windowSentAt` đã sắp xếp tăng dần.
 */
function roomAt(windowSentAt: number[], limit: number, now: number): number {
  if (windowSentAt.length < limit) return now;
  return (windowSentAt[windowSentAt.length - limit] as number) + DAY_MS;
}

/** Chọn thư kế tiếp theo hạn mức; hàm thuần, không chạm cơ sở dữ liệu hay mạng. */
export function planBatch<T extends QueuedMail>(input: PlanInput<T>): Plan<T> {
  const now = input.now.getTime();
  const recent = input.sent.filter((mail) => mail.sentAt.getTime() > now - DAY_MS);
  const allTimes = recent.map((mail) => mail.sentAt.getTime()).sort((a, b) => a - b);
  const bulkTimes = recent
    .filter((mail) => mail.lane === 'bulk')
    .map((mail) => mail.sentAt.getTime())
    .sort((a, b) => a - b);
  const totalRoom = roomAt(allTimes, input.limits.total, now);
  const warmupDay = input.firstSentAt
    ? vnDayIndex(now) - vnDayIndex(input.firstSentAt.getTime()) + 1
    : 1;
  const warmupCap = input.limits.warmupBulk[warmupDay - 1];
  const bulkCap = Math.min(input.limits.bulk, warmupCap ?? input.limits.bulk);
  let bulkRoom = roomAt(bulkTimes, bulkCap, now);
  // Trần warm-up tăng khi sang ngày lịch mới: thư hoãn có thể thức dậy sớm hơn lúc cửa sổ trượt có chỗ.
  if (warmupCap !== undefined && bulkRoom > now) {
    bulkRoom = Math.min(bulkRoom, (vnDayIndex(now) + 1) * DAY_MS - VN_OFFSET_MS);
  }

  const gapRoom =
    allTimes.length > 0 ? (allTimes[allTimes.length - 1] as number) + input.limits.minGapMs : now;

  // Người được phục vụ lâu nhất đi trước (chưa được phục vụ lần nào thì đi đầu): xoay vòng giữa những người xếp thư.
  const lastServed = new Map<string, number>();
  for (const mail of recent) {
    const key = mail.requestedBy ?? '';
    lastServed.set(
      key,
      Math.max(lastServed.get(key) ?? Number.NEGATIVE_INFINITY, mail.sentAt.getTime()),
    );
  }
  const servedAt = (mail: QueuedMail) =>
    lastServed.get(mail.requestedBy ?? '') ?? Number.NEGATIVE_INFINITY;

  const candidates = input.queue
    .map((mail) => ({
      mail,
      eligibleAt: Math.max(
        mail.nextAttemptAt.getTime(),
        totalRoom,
        gapRoom,
        mail.lane === 'bulk' ? bulkRoom : 0,
      ),
    }))
    .sort(
      (a, b) =>
        Number(b.mail.lane === 'urgent') - Number(a.mail.lane === 'urgent') ||
        compare(servedAt(a.mail), servedAt(b.mail)) ||
        a.mail.createdAt.getTime() - b.mail.createdAt.getTime() ||
        compare(a.mail.id, b.mail.id),
    );

  const ready = candidates.find((c) => c.eligibleAt <= now);
  if (ready) return { send: ready.mail, wakeAt: null };
  if (candidates.length === 0) return { send: null, wakeAt: null };
  return { send: null, wakeAt: new Date(Math.min(...candidates.map((c) => c.eligibleAt))) };
}

/** So sánh dùng được cho sort, kể cả với vô cực (phép trừ cho NaN). */
function compare<T extends number | string>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
