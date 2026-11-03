// PROTOTYPE (Q207) — Phương án C: ngoại lệ trước. Đầu trang chỉ có người cần chú ý (kèm lý do và nút xử lý ngay trên thẻ);
// dưới là bức tranh chung (thanh trạng thái + biểu đồ tiến độ để bắt người "im lặng") và danh sách đầy đủ thu gọn.
import { Eye, ShieldOff, Smartphone, Turtle, WifiOff } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Badge, Button } from '../../lib/ui';
import { useToast } from '../../lib/ui/toast';
import { type Person, type Reason, reasonsOf, remainingOf, TOTAL_QUESTIONS } from './room';
import {
  countsOf,
  ProgressBar,
  Remaining,
  STATE_META,
  StateBadge,
  SummaryBar,
  type VariantProps,
} from './shared';

const REASON: Record<Reason, (p: Person) => ReactNode> = {
  disconnected: () => (
    <Badge tone="warning" icon={<WifiOff aria-hidden className="size-3.5" />}>
      Mất kết nối
    </Badge>
  ),
  hidden: (p) => (
    <Badge tone="danger" icon={<Eye aria-hidden className="size-3.5" />}>
      Rời màn hình {p.hiddenCount} lần
    </Badge>
  ),
  device: (p) =>
    p.device === 'revoked' ? (
      <Badge tone="danger" icon={<ShieldOff aria-hidden className="size-3.5" />}>
        Thiết bị bị thu hồi
      </Badge>
    ) : (
      <Badge tone="warning" icon={<Smartphone aria-hidden className="size-3.5" />}>
        Thiết bị mới
      </Badge>
    ),
  slow: (p) => (
    <Badge tone="warning" icon={<Turtle aria-hidden className="size-3.5" />}>
      Chậm: {p.answered}/{TOTAL_QUESTIONS} câu
    </Badge>
  ),
};

const WEIGHT: Record<Reason, number> = { device: 4, hidden: 3, disconnected: 2, slow: 1 };

export function VariantC({ people, simNow, actions, open }: VariantProps) {
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(9);
  const counts = useMemo(() => countsOf(people), [people]);

  const flagged = useMemo(
    () =>
      people
        .filter((p) => p.state !== 'submitted' && p.state !== 'suspended')
        .map((p) => ({ p, reasons: reasonsOf(p, simNow) }))
        .filter((x) => x.reasons.length > 0)
        .sort(
          (a, b) =>
            b.reasons.reduce((s, r) => s + WEIGHT[r], 0) -
              a.reasons.reduce((s, r) => s + WEIGHT[r], 0) ||
            (remainingOf(a.p, simNow) ?? 1e9) - (remainingOf(b.p, simNow) ?? 1e9),
        ),
    [people, simNow],
  );

  // Biểu đồ tiến độ của người đang làm: người ở cột thấp trong khi thời gian đã trôi nhiều là người im lặng cần xem.
  const buckets = useMemo(() => {
    const out = Array.from({ length: 8 }, (_, i) => ({ from: i * 5, n: 0 }));
    for (const p of people) {
      if (p.state === 'working' || p.state === 'disconnected') {
        const bucket = out[Math.min(7, Math.floor((p.answered / TOTAL_QUESTIONS) * 8))];
        if (bucket) bucket.n++;
      }
    }
    return out;
  }, [people]);
  const peak = Math.max(1, ...buckets.map((b) => b.n));

  return (
    <div className="flex flex-col gap-5">
      <SummaryBar counts={counts} total={people.length} />

      <section aria-labelledby="attention" className="flex flex-col gap-3">
        <h2 id="attention" className="text-lg font-semibold">
          Cần chú ý <span className="tabular-nums text-fg-muted">({flagged.length})</span>
        </h2>
        {flagged.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-fg-muted">
            Không có ai cần chú ý lúc này.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {flagged.slice(0, limit).map(({ p, reasons }) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-fg-muted">
                      {p.code} · {p.className}
                    </p>
                  </div>
                  <Remaining person={p} simNow={simNow} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {reasons.map((r) => (
                    <span key={r}>{REASON[r](p)}</span>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => {
                      actions.extend([p.id], 5);
                      toast('Đã cộng 5 phút (giả lập)');
                    }}
                  >
                    +5 phút
                  </Button>
                  <Button variant="primary" onClick={() => open(p.id)}>
                    Xử lý
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {flagged.length > limit && (
          <Button onClick={() => setLimit((n) => n + 9)}>
            Xem thêm {Math.min(9, flagged.length - limit)} người
          </Button>
        )}
      </section>

      <section
        aria-labelledby="overview"
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
      >
        <h2 id="overview" className="text-lg font-semibold">
          Cả phòng
        </h2>
        <div
          className="flex h-4 overflow-hidden rounded-full bg-border"
          role="img"
          aria-label="Tỷ lệ trạng thái của cả phòng"
        >
          {(
            [
              ['submitted', counts.submitted, 'bg-success'],
              ['working', counts.working, 'bg-primary'],
              ['disconnected', counts.disconnected, 'bg-warning'],
            ] as const
          ).map(([k, n, color]) => (
            <span
              key={k}
              className={color}
              style={{ width: `${(n / people.length) * 100}%` }}
              title={`${STATE_META[k].label}: ${n}`}
            />
          ))}
        </div>
        <div>
          <p className="mb-1 text-sm text-fg-muted">
            Số câu đã làm của người đang làm (mỗi cột 5 câu)
          </p>
          <div
            className="flex h-24 items-end gap-1"
            role="img"
            aria-label="Phân bố tiến độ làm bài"
          >
            {buckets.map(({ from, n }) => (
              <div key={from} className="flex flex-1 flex-col items-center justify-end gap-0.5">
                <span className="text-[11px] tabular-nums text-fg-muted">{n}</span>
                <span
                  className="w-full rounded-t bg-primary"
                  style={{ height: `${(n / peak) * 100}%`, minHeight: 2 }}
                />
                <span className="text-[11px] text-fg-muted">{from}+</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Cả danh sách" className="rounded-xl border border-border bg-surface">
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
          className="flex min-h-12 w-full cursor-pointer items-center justify-between px-4 text-left font-semibold"
        >
          Cả danh sách ({people.length})
          <span className="text-sm font-normal text-fg-muted">{showAll ? 'Thu gọn' : 'Mở ra'}</span>
        </button>
        {showAll && (
          <ul className="grid border-t border-border sm:grid-cols-2 2xl:grid-cols-3">
            {people.map((p) => (
              <li key={p.id} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => open(p.id)}
                  className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 px-4 text-left hover:bg-bg"
                >
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <ProgressBar value={p.answered} />
                    <StateBadge state={p.state} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
