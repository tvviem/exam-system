import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import { formatDateTime } from '../format';
import { PHASE_TONE } from '../session-phase';
import { joinSession, type TakeSession, takeSessionsQuery } from '../take';
import {
  type EntryAction,
  entryActionOf,
  groupOf,
  normalizeCode,
  type SessionGroup,
} from '../take/entry';
import { Badge, Button, buttonClass, Card, PrimaryButton, TextField } from '.';

// "Phiên thi của tôi" và ô nhập Mã vào thi (Q206, Q239).

const CODE_FIELD = 'join-code';

/** Ô nhập Mã vào thi: tự viết hoa, bỏ khoảng trắng và gạch nối; mã đúng thì sang màn xác nhận. */
export function JoinForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const join = useMutation({
    mutationFn: () => joinSession(code),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: takeSessionsQuery.queryKey });
      if (result.attemptId) {
        await navigate({
          to: '/take/attempts/$attemptId',
          params: { attemptId: result.attemptId },
        });
      } else {
        await navigate({
          to: '/take/sessions/$sessionId',
          params: { sessionId: result.sessionId },
        });
      }
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code) join.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <TextField
        id={CODE_FIELD}
        label={t('take.join.label')}
        hint={t('take.join.hint')}
        value={code}
        onChange={(event) => {
          join.reset();
          setCode(normalizeCode(event.target.value));
        }}
        error={join.isError ? errorMessage(t, join.error) : undefined}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={32}
        enterKeyHint="go"
        className="h-14 w-full rounded-lg border border-border-strong bg-surface px-3 font-mono text-xl tracking-widest text-fg uppercase outline-none focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-danger"
      />
      <PrimaryButton type="submit" loading={join.isPending} disabled={!code}>
        {join.isPending ? t('take.join.joining') : t('take.join.submit')}
      </PrimaryButton>
    </form>
  );
}

const GROUPS: SessionGroup[] = ['waiting', 'open', 'upcoming', 'finished'];

export function TakeSessionList({ items }: { items: TakeSession[] }) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <p className="text-fg-muted">{t('take.list.empty')}</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((group) => {
        const rows = items.filter((item) => groupOf(item) === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{t(`take.list.${group}`)}</h2>
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <li key={row.sessionId}>
                  <SessionCard row={row} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function SessionCard({ row }: { row: TakeSession }) {
  const { t } = useTranslation();
  const action = entryActionOf(row);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{row.title}</h3>
          <p className="text-sm text-fg-muted break-words">{row.examTitle}</p>
        </div>
        <Badge tone={PHASE_TONE[row.phase]}>{t(`session.phase.${row.phase}`)}</Badge>
      </div>
      <p className="text-sm text-fg-muted">
        {formatDateTime(row.opensAt)} – {formatDateTime(row.closesAt)} ·{' '}
        {t('take.session.minutes', { count: row.durationMinutes })} ·{' '}
        {t('take.session.questionCount', { count: row.questionCount })}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ActionNote action={action} row={row} />
        <ActionButton action={action} row={row} />
      </div>
    </Card>
  );
}

function ActionNote({ action, row }: { action: EntryAction; row: TakeSession }) {
  const { t } = useTranslation();
  switch (action) {
    case 'finished':
      return (
        <p className="text-sm font-medium text-success">
          {t('take.list.attemptsDone', { used: row.attemptsUsed, max: row.maxAttempts })}
        </p>
      );
    case 'revoked':
      return <p className="text-sm text-danger">{t('take.list.revoked')}</p>;
    case 'waiting':
      return (
        <p className="text-sm text-fg-muted">
          {t('take.list.waitingNote', { time: formatDateTime(row.opensAt) })}
        </p>
      );
    case 'wait':
      return (
        <p className="text-sm text-fg-muted">
          {t('take.list.notOpen', { time: formatDateTime(row.opensAt) })}
        </p>
      );
    case 'closed':
      return (
        <p className="text-sm text-fg-muted">
          {t(`take.list.closed.${row.phase}`, { defaultValue: '' })}
        </p>
      );
    case 'enter-code':
      return (
        <p className="text-sm text-fg-muted">
          {row.phase === 'upcoming'
            ? t('take.list.needCodeEarly', { time: formatDateTime(row.opensAt) })
            : t('take.list.needCode')}
        </p>
      );
    default:
      return (
        <p className="text-sm text-fg-muted">
          {t('take.list.attemptsUsed', { used: row.attemptsUsed, max: row.maxAttempts })}
        </p>
      );
  }
}

function ActionButton({ action, row }: { action: EntryAction; row: TakeSession }) {
  const { t } = useTranslation();
  if (action === 'start') {
    return (
      <Link
        to="/take/sessions/$sessionId"
        params={{ sessionId: row.sessionId }}
        className={buttonClass('primary')}
      >
        {t('take.list.start')}
      </Link>
    );
  }
  if (action === 'waiting') {
    return (
      <Link
        to="/take/sessions/$sessionId"
        params={{ sessionId: row.sessionId }}
        className={buttonClass('primary')}
      >
        {t('take.list.goWaiting')}
      </Link>
    );
  }
  if (action === 'resume' && row.inProgressAttemptId) {
    return (
      <Link
        to="/take/attempts/$attemptId"
        params={{ attemptId: row.inProgressAttemptId }}
        className={buttonClass('primary')}
      >
        {t('take.list.resume')}
      </Link>
    );
  }
  if (action === 'enter-code') {
    return (
      <Button
        onClick={() => {
          const field = document.getElementById(CODE_FIELD);
          field?.scrollIntoView({ block: 'center' });
          field?.focus();
        }}
      >
        {t('take.list.enterCode')}
      </Button>
    );
  }
  return null;
}
