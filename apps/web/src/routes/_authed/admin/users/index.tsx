import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, ListFilter, ShieldPlus } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createAdmin,
  ROLE_TAGS,
  type TemporaryPassword,
  type UserListItem,
  type UserListParams,
  type UserStatus,
  usersQuery,
} from '../../../../lib/admin';
import type { RoleTag } from '../../../../lib/auth';
import { errorMessage } from '../../../../lib/errors';
import {
  Badge,
  Button,
  Dialog,
  ErrorMessage,
  PrimaryButton,
  SearchField,
  SelectField,
  TextField,
} from '../../../../lib/ui';
import {
  EmptyState,
  ListSkeleton,
  Pagination,
  StatusBadge,
  TemporaryPasswordDialog,
} from '../../../../lib/ui/admin';

const STATUSES: UserStatus[] = ['active', 'locked', 'removed'];

export const Route = createFileRoute('/_authed/admin/users/')({
  validateSearch: (search: Record<string, unknown>): UserListParams => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    status: STATUSES.includes(search.status as UserStatus)
      ? (search.status as UserStatus)
      : undefined,
    roleTag: ROLE_TAGS.includes(search.roleTag as RoleTag)
      ? (search.roleTag as RoleTag)
      : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: UsersPage,
});

function UsersPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const users = useQuery(usersQuery(search));
  const [q, setQ] = useState(search.q ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [password, setPassword] = useState<(TemporaryPassword & { title: string }) | null>(null);

  // Tìm khi ngừng gõ 300 ms; thay URL thay vì thêm lịch sử để nút Quay lại không đi qua từng chữ.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((search.q ?? '') !== q.trim()) {
        void navigate({
          search: (s) => ({ ...s, q: q.trim() || undefined, page: undefined }),
          replace: true,
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, search.q, navigate]);

  const setFilter = (patch: Partial<UserListParams>) =>
    navigate({ search: (s) => ({ ...s, ...patch, page: undefined }) });
  const activeFilters = [search.status, search.roleTag].filter(Boolean).length;

  const filters = (
    <>
      <SelectField
        id="filter-status"
        label={t('admin.users.filterStatus')}
        value={search.status ?? ''}
        onChange={(e) => setFilter({ status: (e.target.value || undefined) as UserStatus })}
      >
        <option value="">{t('admin.users.statusNotRemoved')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`userStatus.${s}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="filter-role-tag"
        label={t('admin.users.filterRoleTag')}
        value={search.roleTag ?? ''}
        onChange={(e) => setFilter({ roleTag: (e.target.value || undefined) as RoleTag })}
      >
        <option value="">{t('admin.users.allRoleTags')}</option>
        {ROLE_TAGS.map((tag) => (
          <option key={tag} value={tag}>
            {t(`roleTag.${tag}`)}
          </option>
        ))}
      </SelectField>
    </>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('admin.users.heading')}</h1>
        <Button onClick={() => setCreatingAdmin(true)}>
          <ShieldPlus aria-hidden className="size-5" />
          {t('admin.users.createAdmin')}
        </Button>
      </div>

      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-bg px-4 py-2 md:flex-row md:items-end">
        <div className="flex-1">
          <SearchField
            id="user-search"
            label={t('admin.users.search')}
            placeholder={t('admin.users.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="hidden gap-3 md:flex md:w-96">{filters}</div>
        <Button className="md:hidden" onClick={() => setFiltersOpen(true)}>
          <ListFilter aria-hidden className="size-5" />
          {t('admin.users.filters', { count: activeFilters })}
        </Button>
      </div>

      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('admin.users.filtersTitle')}
      >
        {filters}
        <PrimaryButton onClick={() => setFiltersOpen(false)}>{t('common.done')}</PrimaryButton>
      </Dialog>

      {users.isPending ? (
        <ListSkeleton />
      ) : users.isError ? (
        <ErrorMessage>{errorMessage(t, users.error)}</ErrorMessage>
      ) : users.data.items.length === 0 ? (
        <EmptyState>{t('admin.users.empty')}</EmptyState>
      ) : (
        <>
          <UserCards items={users.data.items} />
          <UserTable items={users.data.items} />
          <Pagination
            page={users.data.page}
            pageSize={users.data.pageSize}
            total={users.data.total}
            onPage={(page) => navigate({ search: (s) => ({ ...s, page }) })}
          />
        </>
      )}

      <CreateAdminDialog
        open={creatingAdmin}
        onClose={() => setCreatingAdmin(false)}
        onCreated={(result) => {
          setCreatingAdmin(false);
          setPassword({ ...result, title: t('admin.users.adminCreated') });
        }}
      />
      <TemporaryPasswordDialog value={password} onClose={() => setPassword(null)} />
    </section>
  );
}

function RoleTags({ user }: { user: UserListItem }) {
  const { t } = useTranslation();
  if (user.isAdmin) return <Badge tone="primary">{t('roleTag.admin')}</Badge>;
  return (
    <>
      {user.roleTags.map((tag) => (
        <Badge key={tag}>{t(`roleTag.${tag}`)}</Badge>
      ))}
    </>
  );
}

const identityLine = (user: UserListItem) =>
  [user.code, user.username, user.email].filter(Boolean).join(' · ');

function UserCards({ items }: { items: UserListItem[] }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((user) => (
        <li key={user.id}>
          <Link
            to="/admin/users/$userId"
            params={{ userId: user.id }}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-border-strong"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{user.fullName}</p>
              <p className="truncate text-sm text-fg-muted">{identityLine(user)}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <StatusBadge status={user.status} />
                <RoleTags user={user} />
              </div>
            </div>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-fg-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function UserTable({ items }: { items: UserListItem[] }) {
  const { t } = useTranslation();
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-fg-muted">
          <tr>
            <th className="px-4 py-3 font-medium">{t('admin.users.fullName')}</th>
            <th className="px-4 py-3 font-medium">{t('admin.users.identity')}</th>
            <th className="px-4 py-3 font-medium">{t('admin.users.classLabel')}</th>
            <th className="px-4 py-3 font-medium">{t('admin.users.roleTags')}</th>
            <th className="px-4 py-3 font-medium">{t('admin.users.status')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((user) => (
            <tr key={user.id} className="border-b border-border last:border-0 hover:bg-bg">
              <td className="px-4 py-3">
                <Link
                  to="/admin/users/$userId"
                  params={{ userId: user.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {user.fullName}
                </Link>
              </td>
              <td className="px-4 py-3 text-fg-muted">{identityLine(user)}</td>
              <td className="px-4 py-3 text-fg-muted">{user.classLabel}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  <RoleTags user={user} />
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={user.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Chỉ định Quản trị viên = tạo tài khoản Quản trị viên riêng (Q23, Q70). */
function CreateAdminDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: TemporaryPassword) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ username: '', email: '', fullName: '' });
  const mutation = useMutation({
    mutationFn: () =>
      createAdmin({
        username: form.username.trim(),
        email: form.email.trim() || null,
        fullName: form.fullName.trim(),
      }),
    onSuccess: async (result) => {
      setForm({ username: '', email: '', fullName: '' });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      onCreated(result);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <Dialog open={open} onClose={onClose} title={t('admin.users.createAdmin')}>
      <p className="text-sm text-fg-muted">{t('admin.users.createAdminIntro')}</p>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <TextField
          id="admin-full-name"
          label={t('admin.users.fullName')}
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <TextField
          id="admin-username"
          label={t('admin.users.username')}
          autoCapitalize="none"
          required
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <TextField
          id="admin-email"
          label={t('admin.users.emailOptional')}
          type="email"
          hint={t('admin.users.adminEmailHint')}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
        <PrimaryButton type="submit" disabled={mutation.isPending}>
          {t('admin.users.createAdminSubmit')}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}
