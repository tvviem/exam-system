// PROTOTYPE (Q207) — Phương án A: bảng dày đặc. Một dòng mỗi người, hàng ổn định (xếp theo tên gọi, không nhảy theo trạng thái),
// thanh tóm tắt đồng thời là bộ lọc. Dưới 768 px dùng thẻ (DataList có sẵn của hệ thống).
import { Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SearchField } from '../../lib/ui';
import { DataList } from '../../lib/ui/data-list';
import type { Person } from './room';
import {
  type Counts,
  countsOf,
  DeviceBadge,
  ProgressBar,
  Remaining,
  StateBadge,
  SummaryBar,
  type VariantProps,
} from './shared';

const MATCH: Record<keyof Counts, (p: Person) => boolean> = {
  working: (p) => p.state === 'working',
  submitted: (p) => p.state === 'submitted',
  disconnected: (p) => p.state === 'disconnected',
  not_started: (p) => p.state === 'not_started',
  violations: (p) => p.warnings > 0 || p.state === 'suspended',
};

const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();

export function VariantA({ people, simNow, open, selectedId }: VariantProps) {
  const [filter, setFilter] = useState<keyof Counts | null>(null);
  const [query, setQuery] = useState('');
  const counts = useMemo(() => countsOf(people), [people]);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return people.filter(
      (p) => (!filter || MATCH[filter](p)) && (!q || fold(`${p.name} ${p.code}`).includes(q)),
    );
  }, [people, filter, query]);

  const nameCell = (p: Person) => (
    <button
      type="button"
      onClick={() => open(p.id)}
      className={`flex min-h-12 w-full cursor-pointer flex-col items-start justify-center text-left pointer-fine:min-h-9 ${
        selectedId === p.id ? 'font-semibold text-primary' : ''
      }`}
    >
      <span>{p.name}</span>
      <span className="text-xs text-fg-muted">
        {p.code} · {p.className}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <SummaryBar
        counts={counts}
        total={people.length}
        active={filter}
        onPick={(key) => setFilter((cur) => (cur === key ? null : key))}
      />
      <div className="max-w-md">
        <SearchField
          id="monitor-search"
          label="Tìm người dự thi"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {shown.length} / {people.length} người
      </p>
      <DataList
        items={shown}
        rowKey={(p) => p.id}
        columns={[
          { key: 'name', header: 'Họ tên', cell: nameCell },
          { key: 'state', header: 'Trạng thái', cell: (p) => <StateBadge state={p.state} /> },
          {
            key: 'answered',
            header: 'Đã trả lời',
            cell: (p) => <ProgressBar value={p.answered} />,
          },
          { key: 'left', header: 'Còn lại', cell: (p) => <Remaining person={p} simNow={simNow} /> },
          {
            key: 'hidden',
            header: 'Rời màn hình',
            from: 'lg',
            cell: (p) => (
              <span
                className={`inline-flex items-center gap-1 tabular-nums ${p.hiddenCount >= 3 ? 'font-semibold text-danger' : ''}`}
              >
                <Eye aria-hidden className="size-4" />
                {p.hiddenCount}
              </span>
            ),
          },
          {
            key: 'device',
            header: 'Thiết bị',
            from: 'lg',
            cell: (p) =>
              p.device === 'ok' ? (
                <span className="text-fg-muted">{p.deviceLabel}</span>
              ) : (
                <DeviceBadge device={p.device} />
              ),
          },
        ]}
        card={(p) => (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-2">
            <div className="flex items-start justify-between gap-2">
              {nameCell(p)}
              <StateBadge state={p.state} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-sm">
              <ProgressBar value={p.answered} />
              <Remaining person={p} simNow={simNow} />
              {p.hiddenCount >= 3 && (
                <span className="inline-flex items-center gap-1 font-semibold text-danger">
                  <Eye aria-hidden className="size-4" />
                  {p.hiddenCount} lần
                </span>
              )}
              <DeviceBadge device={p.device} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
