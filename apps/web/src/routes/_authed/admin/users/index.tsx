import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, ShieldPlus } from 'lucide-react';
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
import { DataList } from '../../../../lib/ui/data-list';
import { FilterBar } from '../../../../lib/ui/filter-bar';

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

      <FilterBar
        activeCount={activeFilters}
        filters={filters}
        search={
          <SearchField
            id="user-search"
            label={t('admin.users.search')}
            placeholder={t('admin.users.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      />

      {users.isPending ? (
        <ListSkeleton />
      ) : users.isError ? (
        <ErrorMessage>{errorMessage(t, users.error)}</ErrorMessage>
      ) : users.data.items.length === 0 ? (
        <EmptyState>{t('admin.users.empty')}</EmptyState>
      ) : (
        <>
          <UserList items={users.data.items} />
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

/** Mã, tên đăng nhập, email; bỏ tên đăng nhập khi chỉ lặp lại mã hoặc email (hay gặp ở tài khoản Người dự thi). */
const identityLine = (user: UserListItem) => {
  const lower = (value: string | null) => value?.toLowerCase() ?? null;
  const username =
    lower(user.username) === lower(user.code) || lower(user.username) === lower(user.email)
      ? null
      : user.username;
  return [user.code, username, user.email].filter(Boolean).join(' · ');
};

function UserList({ items }: { items: UserListItem[] }) {
  const { t } = useTranslation();
  return (
    <DataList
      items={items}
      rowKey={(user) => user.id}
      columns={[
        {
          key: 'name',
          header: t('admin.users.fullName'),
          cell: (user) => (
            <>
              <Link
                to="/admin/users/$userId"
                params={{ userId: user.id }}
                className="font-medium text-primary hover:underline"
              >
                {user.fullName}
              </Link>
              {/* 768–1023 px: cột Mã và Lớp ẩn đi, gộp thành một dòng phụ dưới tên */}
              <p className="mt-0.5 text-fg-muted lg:hidden">
                {[identityLine(user), user.classLabel].filter(Boolean).join(' · ')}
              </p>
            </>
          ),
        },
        {
          key: 'identity',
          header: t('admin.users.identity'),
          from: 'lg',
          className: 'text-fg-muted',
          cell: identityLine,
        },
        {
          key: 'class',
          header: t('admin.users.classLabel'),
          from: 'lg',
          className: 'text-fg-muted',
          cell: (user) => user.classLabel,
        },
        {
          key: 'tags',
          header: t('admin.users.roleTags'),
          cell: (user) => (
            <div className="flex flex-wrap gap-1">
              <RoleTags user={user} />
            </div>
          ),
        },
        {
          key: 'status',
          header: t('admin.users.status'),
          cell: (user) => <StatusBadge status={user.status} />,
        },
      ]}
      card={(user) => (
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
      )}
    />
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
