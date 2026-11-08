import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type AuditLog, type AuditLogParams, auditLogsQuery } from '../../../lib/admin';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { ErrorMessage, SelectField } from '../../../lib/ui';
import { EmptyState, FilterChip, ListSkeleton, Pagination } from '../../../lib/ui/admin';

// Hành động đã có ở lát cắt 1 và 6 (ops.*, do exam-ctl.sh ghi khi deploy); thêm vào đây (và vi.json) khi có hành động mới.
const ACTIONS = [
  'user.update',
  'user.lock',
  'user.unlock',
  'user.remove',
  'user.role-tag.grant',
  'user.role-tag.revoke',
  'user.temporary-password.reissue',
  'admin.create',
  'unit.create',
  'unit.update',
  'cli.bootstrap-admin',
  'cli.recover-admin',
  'ops.deploy',
  'ops.deploy-failed',
];

const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

export const Route = createFileRoute('/_authed/admin/audit-logs')({
  validateSearch: (search: Record<string, unknown>): AuditLogParams => ({
    actorId: str(search.actorId),
    action: str(search.action),
    entityType: str(search.entityType),
    entityId: str(search.entityId),
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const logs = useQuery(auditLogsQuery(search));
  const clear = (patch: Partial<AuditLogParams>) =>
    navigate({ search: (s) => ({ ...s, ...patch, page: undefined }) });
  const actorName = logs.data?.items.find((l) => l.actorId === search.actorId)?.actorName;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('admin.auditLogs.heading')}</h1>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-80">
          <SelectField
            id="filter-action"
            label={t('admin.auditLogs.action')}
            value={search.action ?? ''}
            onChange={(e) =>
              navigate({
                search: (s) => ({ ...s, action: e.target.value || undefined, page: undefined }),
              })
            }
          >
            <option value="">{t('admin.auditLogs.allActions')}</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`auditAction.${a}`)}
              </option>
            ))}
          </SelectField>
        </div>
        {search.actorId && (
          <FilterChip
            label={t('admin.auditLogs.filteredActor', {
              name: actorName ?? t('admin.loginEvents.thisUser'),
            })}
            onClear={() => clear({ actorId: undefined })}
          />
        )}
        {search.entityId && (
          <FilterChip
            label={t('admin.auditLogs.filteredEntity', { name: t('admin.auditLogs.thisEntity') })}
            onClear={() => clear({ entityId: undefined })}
          />
        )}
      </div>
      {logs.isPending ? (
        <ListSkeleton />
      ) : logs.isError ? (
        <ErrorMessage>{errorMessage(t, logs.error)}</ErrorMessage>
      ) : logs.data.items.length === 0 ? (
        <EmptyState>{t('admin.auditLogs.empty')}</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {logs.data.items.map((log) => (
              <AuditLogRow key={log.id} log={log} />
            ))}
          </ul>
          <Pagination
            page={logs.data.page}
            pageSize={logs.data.pageSize}
            total={logs.data.total}
            onPage={(page) => navigate({ search: (s) => ({ ...s, page }) })}
          />
        </>
      )}
    </section>
  );
}

const show = (value: unknown) =>
  value === null || value === undefined
    ? '∅'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

function AuditLogRow({ log }: { log: AuditLog }) {
  const { t } = useTranslation();
  const keys = [...new Set([...Object.keys(log.before ?? {}), ...Object.keys(log.after ?? {})])];
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <p className="font-medium">{t(`auditAction.${log.action}`, { defaultValue: log.action })}</p>
      <p className="text-sm text-fg-muted tabular-nums">
        {formatDateTime(log.at)} ·{' '}
        {log.actorId ? (
          <Link
            from={Route.fullPath}
            search={(s) => ({ ...s, actorId: log.actorId ?? undefined, page: undefined })}
            aria-label={t('admin.auditLogs.filterByActor', { name: log.actorName })}
            className="text-primary hover:underline"
          >
            {log.actorName}
          </Link>
        ) : (
          t('admin.auditLogs.system')
        )}
        {log.ip ? ` · ${log.ip}` : ''}
      </p>
      {keys.length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          {keys.map((key) => (
            <div key={key} className="contents">
              <dt className="text-fg-muted">{key}</dt>
              <dd className="break-all">
                {log.before && key in log.before && (
                  <>
                    <span className="text-fg-muted line-through">{show(log.before[key])}</span>
                    {' → '}
                  </>
                )}
                {show(log.after?.[key])}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
