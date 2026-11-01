import { parseCodeList } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { KeyRound, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import {
  addToRoster,
  type RosterAddResult,
  type RosterItem,
  type RosterSelector,
  reissueRosterPassword,
  removeFromRoster,
  rosterQuery,
  rosterSearchQuery,
  type SessionSummary,
  setExtraMinutes,
} from '../sessions';
import { Button, Card, Dialog, ErrorMessage, PrimaryButton, SearchField } from '.';
import { EmptyState, ListSkeleton, Pagination, TemporaryPasswordDialog } from './admin';
import { RowMenu } from './row-menu';
import { StickyActionBar } from './sticky-action-bar';
import { useToast } from './toast';

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Danh sách dự thi của một Phiên thi (Q200): thêm theo người, theo Lớp, theo danh sách mã dán vào; bớt; phút cộng sẵn. */
export function SessionRoster({ session }: { session: SessionSummary }) {
  const { t } = useTranslation();
  const over = session.phase === 'closed' || session.phase === 'cancelled';
  return (
    <div className="flex flex-col gap-4">
      {over ? (
        <p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm">
          {t('session.roster.closedNote')}
        </p>
      ) : (
        <AddPanel sessionId={session.id} />
      )}
      <RosterList session={session} readOnly={over} />
    </div>
  );
}

function useRosterRefresh(sessionId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sessions', 'roster', sessionId] }),
      queryClient.invalidateQueries({ queryKey: ['sessions', 'roster-search', sessionId] }),
      queryClient.invalidateQueries({ queryKey: ['sessions', 'detail', sessionId] }),
      queryClient.invalidateQueries({ queryKey: ['sessions', 'list'] }),
    ]);
}

function AddPanel({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const refresh = useRosterRefresh(sessionId);
  const [text, setText] = useState('');
  const [pasting, setPasting] = useState(false);
  const q = useDebounced(text.trim());
  const found = useQuery(rosterSearchQuery(sessionId, q));
  const add = useMutation({
    mutationFn: (selector: RosterSelector) => addToRoster(sessionId, selector),
    onSuccess: async (result) => {
      await refresh();
      toast(
        result.added > 0
          ? t('session.roster.addedToast', { count: result.added })
          : t('session.roster.nothingAdded'),
      );
    },
    onError: (error) => toast(errorMessage(t, error), 'error'),
  });

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t('session.roster.addTitle')}</h2>
      <SearchField
        id="roster-add-search"
        label={t('session.roster.addSearch')}
        hint={t('session.roster.addSearchHint')}
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
      />
      {found.data && (
        <div className="flex flex-col gap-2">
          {found.data.classes.map((cls) => (
            <Button
              key={cls.label}
              disabled={add.isPending}
              onClick={() => add.mutate({ classLabel: cls.label })}
            >
              {t('session.roster.addClass', { label: cls.label, count: cls.count })}
            </Button>
          ))}
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {found.data.users.map((user) => (
              <li key={user.userId} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block break-words font-medium">{user.fullName}</span>
                  <span className="block text-sm text-fg-muted">
                    {[user.code, user.classLabel].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {user.inRoster ? (
                  <span className="text-sm text-fg-muted">{t('session.roster.inRoster')}</span>
                ) : (
                  <Button
                    aria-label={t('session.roster.addAria', { name: user.fullName })}
                    disabled={add.isPending}
                    onClick={() => add.mutate({ userIds: [user.userId] })}
                  >
                    {t('session.roster.add')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {found.data.users.length === 0 && found.data.classes.length === 0 && (
            <p className="text-sm text-fg-muted">{t('session.roster.noMatch')}</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setPasting(true)}>{t('session.roster.paste')}</Button>
        <Link to="/examiner/account-requests" className="text-sm text-primary underline">
          {t('session.roster.noAccount')}
        </Link>
      </div>
      <PasteDialog
        open={pasting}
        sessionId={sessionId}
        onClose={() => setPasting(false)}
        onAdded={refresh}
      />
    </Card>
  );
}

/** Dán nhiều Mã định danh: xem kết quả khớp trước (dryRun) rồi mới thêm. */
function PasteDialog({
  open,
  sessionId,
  onClose,
  onAdded,
}: {
  open: boolean;
  sessionId: string;
  onClose: () => void;
  onAdded: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [text, setText] = useState('');
  const [result, setResult] = useState<RosterAddResult | null>(null);
  const codes = parseCodeList(text);
  const change = (value: string) => {
    setText(value);
    setResult(null); // đổi danh sách thì kết quả kiểm tra cũ không còn đúng
  };
  const check = useMutation({
    mutationFn: () => addToRoster(sessionId, { codes }, true),
    onSuccess: setResult,
  });
  const confirm = useMutation({
    mutationFn: () => addToRoster(sessionId, { codes }, false),
    onSuccess: async (done) => {
      await onAdded();
      toast(t('session.roster.addedToast', { count: done.added }));
      setText('');
      setResult(null);
      onClose();
    },
  });
  const error = check.error ?? confirm.error;
  return (
    <Dialog open={open} onClose={onClose} title={t('session.roster.paste')}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="roster-paste" className="text-sm font-medium">
            {t('session.roster.pasteLabel')}
          </label>
          <textarea
            id="roster-paste"
            rows={6}
            value={text}
            spellCheck={false}
            className="w-full rounded-lg border border-border-strong bg-surface p-3 font-mono text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
            onChange={(e) => change(e.target.value)}
          />
          <p className="text-sm text-fg-muted">{t('session.roster.pasteHint')}</p>
        </div>
        {result && (
          <div role="status" className="flex flex-col gap-1 rounded-lg bg-surface p-3 text-sm">
            <p>
              {t('session.roster.pasteResult', {
                added: result.added,
                alreadyIn: result.alreadyIn,
              })}
            </p>
            {result.notFound.length > 0 && (
              <p className="text-warning">
                {t('session.roster.pasteNotFound', {
                  count: result.notFound.length,
                  codes: result.notFound.join(', '),
                })}
              </p>
            )}
            {result.ineligible.length > 0 && (
              <p className="text-warning">
                {t('session.roster.pasteIneligible', {
                  count: result.ineligible.length,
                  reasons: [
                    ...new Set(
                      result.ineligible.map((i) => t(`session.roster.ineligible.${i.reason}`)),
                    ),
                  ].join(', '),
                })}
              </p>
            )}
          </div>
        )}
        <ErrorMessage>{error && errorMessage(t, error)}</ErrorMessage>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {result && result.added > 0 ? (
            <PrimaryButton disabled={confirm.isPending} onClick={() => confirm.mutate()}>
              {t('session.roster.pasteConfirm', { count: result.added })}
            </PrimaryButton>
          ) : (
            <PrimaryButton
              disabled={codes.length === 0 || check.isPending}
              onClick={() => check.mutate()}
            >
              {check.isPending ? t('session.roster.pasteChecking') : t('session.roster.pasteCheck')}
            </PrimaryButton>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function RosterList({ session, readOnly }: { session: SessionSummary; readOnly: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const refresh = useRosterRefresh(session.id);
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reissuing, setReissuing] = useState<RosterItem | null>(null);
  const [password, setPassword] = useState<{
    temporaryPassword: string;
    passwordExpiresAt: string;
    title: string;
  } | null>(null);
  const q = useDebounced(text.trim());
  // biome-ignore lint/correctness/useExhaustiveDependencies: về trang 1 khi đổi từ khóa
  useEffect(() => setPage(1), [q]);
  const roster = useQuery(rosterQuery(session.id, { q: q || undefined, page }));
  const items = roster.data?.items ?? [];
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const remove = useMutation({
    mutationFn: (userIds: string[]) => removeFromRoster(session.id, userIds),
    onSuccess: async (result) => {
      setSelected(new Set());
      await refresh();
      toast(t('session.roster.removedToast', { count: result.removed }));
    },
    onError: (error) => toast(errorMessage(t, error), 'error'),
  });
  const reissue = useMutation({
    mutationFn: (user: RosterItem) => reissueRosterPassword(session.id, user.userId),
    onSuccess: (result, user) => {
      setReissuing(null);
      setPassword({ ...result, title: t('session.roster.reissueTitle', { name: user.fullName }) });
    },
    onError: (error) => {
      setReissuing(null);
      toast(errorMessage(t, error), 'error');
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-semibold">
          {t('session.roster.title')}{' '}
          <span className="font-normal text-fg-muted">
            ({t('session.roster.count', { count: session.rosterCount })})
          </span>
        </h2>
        <div className="w-full sm:w-72">
          <SearchField
            id="roster-search"
            label={t('session.roster.search')}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </div>

      {roster.isPending ? (
        <ListSkeleton rows={4} />
      ) : roster.isError ? (
        <ErrorMessage>{errorMessage(t, roster.error)}</ErrorMessage>
      ) : items.length === 0 ? (
        <EmptyState>{q ? t('session.roster.noMatch') : t('session.roster.empty')}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {items.map((user) => (
              <li key={user.userId} className="flex flex-wrap items-center gap-3 p-3">
                {!readOnly && (
                  <input
                    type="checkbox"
                    className="size-5"
                    aria-label={t('session.roster.select', { name: user.fullName })}
                    checked={selected.has(user.userId)}
                    onChange={() => toggle(user.userId)}
                  />
                )}
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block break-words font-medium">{user.fullName}</span>
                  <span className="block text-sm text-fg-muted">
                    {[user.code, user.classLabel].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <ExtraMinutes
                  sessionId={session.id}
                  user={user}
                  disabled={readOnly}
                  onSaved={() => refresh()}
                />
                {!readOnly && (
                  <RowMenu
                    label={t('session.roster.rowActions', { name: user.fullName })}
                    items={[
                      {
                        label: t('session.roster.remove'),
                        icon: <UserMinus aria-hidden className="size-4" />,
                        danger: true,
                        onSelect: () => remove.mutate([user.userId]),
                      },
                      {
                        label: t('session.roster.reissue'),
                        icon: <KeyRound aria-hidden className="size-4" />,
                        onSelect: () => setReissuing(user),
                      },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
          <Pagination
            page={roster.data.page}
            pageSize={roster.data.pageSize}
            total={roster.data.total}
            onPage={setPage}
          />
        </>
      )}

      {selected.size > 0 && (
        <StickyActionBar align="end">
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate([...selected])}
          >
            {t('session.roster.removeSelected', { count: selected.size })}
          </Button>
        </StickyActionBar>
      )}

      <Dialog
        open={reissuing !== null}
        onClose={() => setReissuing(null)}
        title={t('session.roster.reissueConfirmTitle', { name: reissuing?.fullName ?? '' })}
      >
        <p className="text-sm text-fg-muted">{t('session.roster.reissueConfirmBody')}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => setReissuing(null)}>{t('common.cancel')}</Button>
          <PrimaryButton
            disabled={reissue.isPending}
            onClick={() => reissuing && reissue.mutate(reissuing)}
          >
            {t('session.roster.reissueConfirm')}
          </PrimaryButton>
        </div>
      </Dialog>
      <TemporaryPasswordDialog value={password} onClose={() => setPassword(null)} />
    </div>
  );
}

/** Phút cộng sẵn của một người: lưu khi rời ô hoặc nhấn Enter, ô sai thì trả về giá trị cũ. */
function ExtraMinutes({
  sessionId,
  user,
  disabled,
  onSaved,
}: {
  sessionId: string;
  user: RosterItem;
  disabled: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [value, setValue] = useState(String(user.extraMinutes));
  useEffect(() => setValue(String(user.extraMinutes)), [user.extraMinutes]);
  const save = useMutation({
    mutationFn: (minutes: number) => setExtraMinutes(sessionId, user.userId, minutes),
    onSuccess: onSaved,
    onError: (error) => {
      setValue(String(user.extraMinutes));
      toast(errorMessage(t, error), 'error');
    },
  });
  const commit = () => {
    const minutes = Number(value);
    if (value.trim() === '' || !Number.isInteger(minutes) || minutes < 0 || minutes > 600) {
      setValue(String(user.extraMinutes));
      return;
    }
    if (minutes !== user.extraMinutes) save.mutate(minutes);
  };
  return (
    <label className="flex items-center gap-2 text-sm text-fg-muted">
      <span>{t('session.roster.extra')}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={600}
        aria-label={t('session.roster.extraAria', { name: user.fullName })}
        title={t('session.roster.extraHint')}
        value={value}
        disabled={disabled}
        className="h-12 w-20 rounded-lg border border-border-strong bg-surface px-2 text-base text-fg pointer-fine:h-10"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </label>
  );
}
