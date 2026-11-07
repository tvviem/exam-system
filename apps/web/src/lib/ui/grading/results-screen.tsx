import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { EyeOff, Pencil, UserCog } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../errors';
import { formatDateTime } from '../../format';
import {
  type ItemStat,
  itemStatsQuery,
  type PenaltyInput,
  type PersonDetail,
  personQuery,
  type ResultRow,
  resultsQuery,
  setBlind,
  setPenalty,
  type ViolationItem,
  violationsQuery,
} from '../../grading';
import { Badge, Button, buttonClass, Card, Dialog, ErrorMessage, SearchField } from '..';
import { EmptyState, ListSkeleton } from '../admin';
import { Chip, ChipGroup } from '../chips';
import { type Column, DataList } from '../data-list';
import { Tabs } from '../tabs';
import { useToast } from '../toast';
import { DelegateDialog } from './delegate-dialog';

// Màn Kết quả của một Phiên thi (docs/plan/slice-5.md, PR 5b): bảng người, Thống kê câu, Vi phạm kèm Mức xử lý, chi tiết từng
// người, Chấm ẩn tên và Ủy quyền chấm. Dùng cho chủ Phiên thi (tab) và người được Ủy quyền (đường dẫn riêng).

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('vi-VN', { maximumFractionDigits: digits });

type Filter = 'all' | 'waiting' | 'none';

export function ResultsScreen({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const results = useQuery(resultsQuery(sessionId));
  const [tab, setTab] = useState('people');
  const [delegating, setDelegating] = useState(false);
  const blind = useMutation({
    mutationFn: (next: boolean) => setBlind(sessionId, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grading', sessionId] }),
    onError: (error) => toast(errorMessage(t, error), 'error'),
  });
  if (results.isPending) return <ListSkeleton rows={5} />;
  if (results.isError) return <ErrorMessage>{errorMessage(t, results.error)}</ErrorMessage>;
  const data = results.data;
  const { status } = data;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{data.session.title}</h2>
            <p className="text-sm text-fg-muted">
              {t('grading.results.meta', {
                date: formatDateTime(data.session.opensAt),
                minutes: data.session.durationMinutes,
                items: data.session.totalItems,
              })}
            </p>
          </div>
          {data.role === 'delegate' && (
            <Badge tone="warning">{t('grading.results.delegateRole')}</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/examiner/sessions/$sessionId/grading"
            params={{ sessionId }}
            className={buttonClass(status.pendingEssays > 0 ? 'primary' : 'secondary')}
          >
            <Pencil aria-hidden className="size-4" />
            {t('grading.results.grade')}
            {status.pendingEssays > 0 && ` (${status.pendingEssays})`}
          </Link>
          <button
            type="button"
            aria-pressed={data.blind}
            disabled={blind.isPending}
            onClick={() => blind.mutate(!data.blind)}
            className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium pointer-fine:min-h-9"
          >
            <EyeOff aria-hidden className="size-4" />
            {t(data.blind ? 'grading.blindOn' : 'grading.blindOff')}
          </button>
          {data.role === 'owner' && (
            <Button onClick={() => setDelegating(true)}>
              <UserCog aria-hidden className="size-4" />
              {t('grading.delegate.open')}
            </Button>
          )}
        </div>
        {status.essayHidden && (
          <p
            role="status"
            className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-on-primary-soft"
          >
            {t('grading.results.hidden')}
          </p>
        )}
        {status.violationsUndecided > 0 && (
          <p className="text-sm text-fg-muted">
            {t('grading.results.undecided', { count: status.violationsUndecided })}
          </p>
        )}
      </Card>
      <Tabs
        label={t('grading.results.tabs')}
        value={tab}
        onChange={setTab}
        items={[
          {
            id: 'people',
            label: t('grading.results.people'),
            content: <PeopleList sessionId={sessionId} rows={data.people} />,
          },
          {
            id: 'stats',
            label: t('grading.results.stats'),
            content: tab === 'stats' ? <StatsPanel sessionId={sessionId} /> : null,
          },
          {
            id: 'violations',
            label: t('grading.results.violations', { count: status.violationsUndecided }),
            content: tab === 'violations' ? <ViolationsPanel sessionId={sessionId} /> : null,
          },
        ]}
      />
      {data.role === 'owner' && (
        <DelegateDialog
          sessionId={sessionId}
          open={delegating}
          onClose={() => setDelegating(false)}
        />
      )}
    </div>
  );
}

function PeopleList({ sessionId, rows }: { sessionId: string; rows: ResultRow[] }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'waiting' && row.state !== 'waiting_essay' && row.state !== 'hidden')
        return false;
      if (filter === 'none' && row.state !== 'no_attempt') return false;
      return (
        !needle ||
        row.fullName.toLowerCase().includes(needle) ||
        (row.code ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, q, filter]);
  const columns: Column<ResultRow>[] = [
    { key: 'code', header: t('grading.col.code'), cell: (r) => r.code ?? '—' },
    {
      key: 'name',
      header: t('grading.col.name'),
      cell: (r) => (
        <button
          type="button"
          onClick={() => setOpenId(r.userId)}
          className="cursor-pointer text-left font-medium underline-offset-2 hover:underline"
        >
          {r.fullName}
          {r.classLabel && (
            <span className="block text-sm font-normal text-fg-muted">{r.classLabel}</span>
          )}
        </button>
      ),
    },
    { key: 'attempts', header: t('grading.col.attempts'), cell: (r) => r.attemptCount, from: 'lg' },
    {
      key: 'raw',
      header: t('grading.col.raw'),
      cell: (r) => scoreText(r, 'raw'),
      className: 'text-right tabular-nums',
    },
    {
      key: 'scaled',
      header: t('grading.col.scaled'),
      cell: (r) => scoreText(r, 'scaled'),
      className: 'text-right tabular-nums',
    },
    { key: 'note', header: t('grading.col.note'), cell: (r) => <Notes row={r} /> },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-end">
        <SearchField
          id="results-search"
          label={t('grading.results.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ChipGroup label={t('grading.results.filter')}>
          {(['all', 'waiting', 'none'] as const).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {t(`grading.filters.${f}`)}
            </Chip>
          ))}
        </ChipGroup>
      </div>
      {shown.length === 0 ? (
        <EmptyState>{t('grading.results.empty')}</EmptyState>
      ) : (
        <DataList
          items={shown}
          rowKey={(r) => r.userId}
          columns={columns}
          card={(r) => (
            <Card className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setOpenId(r.userId)}
                className="cursor-pointer text-left font-semibold"
              >
                {r.fullName}
              </button>
              <p className="text-sm text-fg-muted">
                {[r.code, r.classLabel].filter(Boolean).join(' · ')}
              </p>
              <p className="tabular-nums">
                {t('grading.results.cardScore', {
                  raw: scoreText(r, 'raw'),
                  max: fmt(r.maxScore),
                  scaled: scoreText(r, 'scaled'),
                })}
              </p>
              <Notes row={r} />
            </Card>
          )}
        />
      )}
      {openId && (
        <PersonDialog sessionId={sessionId} userId={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function scoreText(row: ResultRow, which: 'raw' | 'scaled') {
  if (row.state === 'no_attempt') return '—';
  if (row.voided) return which === 'raw' ? '0' : '0';
  const value = which === 'raw' ? row.rawScore : row.scaledScore;
  return fmt(value, which === 'scaled' ? 1 : 2);
}

function Notes({ row }: { row: ResultRow }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1">
      {row.state === 'no_attempt' && <Badge>{t('grading.note.none')}</Badge>}
      {row.state === 'waiting_essay' && (
        <Badge tone="warning">{t('grading.note.waiting', { count: row.pendingEssays ?? 0 })}</Badge>
      )}
      {row.essayHidden && <Badge tone="primary">{t('grading.note.hidden')}</Badge>}
      {row.voided && <Badge tone="danger">{t('grading.note.void')}</Badge>}
      {!row.voided && row.penaltyPercent > 0 && (
        <Badge tone="danger">
          {t('grading.note.penalty', { percent: fmt(row.penaltyPercent) })}
        </Badge>
      )}
    </span>
  );
}

function PersonDialog({
  sessionId,
  userId,
  onClose,
}: {
  sessionId: string;
  userId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const person = useQuery(personQuery(sessionId, userId));
  const data: PersonDetail | undefined = person.data;
  return (
    <Dialog
      open
      onClose={onClose}
      title={
        data
          ? `${data.person.fullName}${data.person.code ? ` · ${data.person.code}` : ''}`
          : t('grading.results.person')
      }
    >
      {person.isPending && <ListSkeleton rows={4} />}
      {person.isError && <ErrorMessage>{errorMessage(t, person.error)}</ErrorMessage>}
      {data?.essayHidden && (
        <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
          {t('grading.results.hidden')}
        </p>
      )}
      {data?.attempts.length === 0 && (
        <p className="text-sm text-fg-muted">{t('grading.note.none')}</p>
      )}
      {data?.attempts.map((attempt) => (
        <section key={attempt.attemptNo} className="flex flex-col gap-1">
          {data.attempts.length > 1 && (
            <h3 className="text-sm font-semibold">
              {t('grading.person.attempt', { no: attempt.attemptNo })}
            </h3>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {attempt.items.map((item) => (
              <li key={item.itemId} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{t('grading.person.item', { no: item.no })}</span>
                  {item.seenAs !== null && (
                    <span className="ml-1 text-sm text-fg-muted">
                      {t('grading.person.seenAs', { no: item.seenAs })}
                    </span>
                  )}
                  <span className="block text-sm text-fg-muted">
                    {t(`grading.type.${item.type}`)}
                  </span>
                  {item.feedback && <span className="block text-sm">{item.feedback}</span>}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {item.verdict === 'hidden' ? (
                    <Badge tone="primary">{t('grading.note.hidden')}</Badge>
                  ) : (
                    <>
                      {fmt(item.score)}/{fmt(item.points)}
                      <span className="block text-sm text-fg-muted">
                        {t(`grading.verdict.${item.verdict}`)}
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {data && data.violations.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{t('grading.person.violations')}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {data.violations.map((v) => (
              <li key={v.id}>
                {t(`grading.violation.${v.action}`)}: {v.reason} · {penaltyText(t, v)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button onClick={onClose}>{t('common.close')}</Button>
    </Dialog>
  );
}

type T = ReturnType<typeof useTranslation>['t'];
const penaltyText = (
  t: T,
  v: Pick<ViolationItem, 'penaltyType' | 'penaltyPercent' | 'penaltyDecidedAt'>,
) =>
  v.penaltyDecidedAt === null
    ? t('grading.penalty.undecided')
    : v.penaltyType === 'void'
      ? t('grading.penalty.void')
      : v.penaltyType === 'percent'
        ? t('grading.penalty.percent', { percent: fmt(v.penaltyPercent) })
        : t('grading.penalty.none');

function StatsPanel({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const stats = useQuery(itemStatsQuery(sessionId));
  const [hardFirst, setHardFirst] = useState(false);
  if (stats.isPending) return <ListSkeleton rows={4} />;
  if (stats.isError) return <ErrorMessage>{errorMessage(t, stats.error)}</ErrorMessage>;
  const items = [...stats.data.items].sort((a, b) =>
    hardFirst ? (a.correctRate ?? 101) - (b.correctRate ?? 101) : a.no - b.no,
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t('grading.stats.hint')}</p>
      <div>
        <Chip active={hardFirst} onClick={() => setHardFirst((v) => !v)}>
          {t('grading.stats.hardFirst')}
        </Chip>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <StatRow key={item.itemId} item={item} />
        ))}
      </ul>
    </div>
  );
}

function StatRow({ item }: { item: ItemStat }) {
  const { t } = useTranslation();
  const total = item.correct + item.partial + item.wrong + item.blank + item.pending;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const low = item.type !== 'essay' && item.correctRate !== null && item.correctRate < 30;
  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {t('grading.person.item', { no: item.no })}{' '}
          <span className="text-sm font-normal text-fg-muted">
            {t(`grading.type.${item.type}`)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm tabular-nums">
          {low && <Badge tone="warning">{t('grading.stats.suspect')}</Badge>}
          {item.correctRate === null
            ? '—'
            : t('grading.stats.rate', { rate: fmt(item.correctRate, 1) })}
        </span>
      </div>
      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={t('grading.stats.bar')}
      >
        <div className="bg-success" style={{ width: `${pct(item.correct)}%` }} />
        <div className="bg-warning" style={{ width: `${pct(item.partial)}%` }} />
        <div className="bg-danger" style={{ width: `${pct(item.wrong)}%` }} />
        <div className="bg-fg-muted/40" style={{ width: `${pct(item.blank)}%` }} />
      </div>
      <p className="mt-1 text-sm text-fg-muted tabular-nums">
        {t('grading.stats.counts', {
          correct: item.correct,
          partial: item.partial,
          wrong: item.wrong,
          blank: item.blank,
          pending: item.pending,
        })}
      </p>
    </li>
  );
}

function ViolationsPanel({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const violations = useQuery(violationsQuery(sessionId));
  if (violations.isPending) return <ListSkeleton rows={3} />;
  if (violations.isError) return <ErrorMessage>{errorMessage(t, violations.error)}</ErrorMessage>;
  if (violations.data.items.length === 0)
    return <EmptyState>{t('grading.violations.empty')}</EmptyState>;
  return (
    <ul className="flex flex-col gap-3">
      {violations.data.items.map((v) => (
        <ViolationRow key={v.id} sessionId={sessionId} violation={v} />
      ))}
    </ul>
  );
}

function ViolationRow({ sessionId, violation }: { sessionId: string; violation: ViolationItem }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState(
    violation.penaltyType === 'percent' ? String(violation.penaltyPercent ?? '') : '10',
  );
  const save = useMutation({
    mutationFn: (penalty: PenaltyInput) => setPenalty(sessionId, violation.id, penalty),
    onSuccess: () => {
      toast(t('grading.penalty.saved'));
      void queryClient.invalidateQueries({ queryKey: ['grading', sessionId] });
    },
    onError: (error) => toast(errorMessage(t, error), 'error'),
  });
  const decided = violation.penaltyDecidedAt !== null;
  const percentValue = Number(percent.replace(',', '.'));
  const percentOk = Number.isFinite(percentValue) && percentValue >= 1 && percentValue <= 100;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {violation.fullName ?? '—'}
          {violation.code ? ` · ${violation.code}` : ''}
        </span>
        <Badge tone={violation.action === 'disqualify' ? 'danger' : 'warning'}>
          {t(`grading.violation.${violation.action}`)}
        </Badge>
      </div>
      <p className="text-sm">
        {violation.reason}{' '}
        <span className="text-fg-muted">· {formatDateTime(violation.recordedAt)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-fg-muted">
          {decided ? penaltyText(t, violation) : t('grading.penalty.undecided')}
        </span>
        <Button
          disabled={save.isPending || (decided && violation.penaltyType === 'none')}
          onClick={() => save.mutate({ type: 'none' })}
        >
          {t('grading.penalty.setNone')}
        </Button>
        <Button
          variant="danger-ghost"
          disabled={save.isPending || violation.penaltyType === 'void'}
          onClick={() => save.mutate({ type: 'void' })}
        >
          {t('grading.penalty.setVoid')}
        </Button>
        <span className="flex items-center gap-1">
          <input
            aria-label={t('grading.penalty.percentLabel')}
            inputMode="decimal"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            aria-invalid={!percentOk}
            className="h-11 w-20 rounded-lg border border-border-strong bg-surface px-2 text-center tabular-nums outline-none focus:border-primary aria-invalid:border-danger pointer-fine:h-9"
          />
          <span className="text-sm">%</span>
          <Button
            disabled={save.isPending || !percentOk}
            onClick={() => save.mutate({ type: 'percent', percent: percentValue })}
          >
            {t('grading.penalty.setPercent')}
          </Button>
        </span>
      </div>
    </li>
  );
}
