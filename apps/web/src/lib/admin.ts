import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { RoleTag } from './auth';

export type UserStatus = 'active' | 'locked' | 'removed';
export type Gender = 'male' | 'female' | 'other';
export type AcademicDegree = 'bachelor' | 'engineer' | 'master' | 'doctor' | 'doctor_of_science';
export type AcademicTitle = 'associate_professor' | 'professor';

export const ACADEMIC_DEGREES: AcademicDegree[] = [
  'bachelor',
  'engineer',
  'master',
  'doctor',
  'doctor_of_science',
];
export const ACADEMIC_TITLES: AcademicTitle[] = ['associate_professor', 'professor'];
export const GENDERS: Gender[] = ['male', 'female', 'other'];
export const ROLE_TAGS: RoleTag[] = ['examiner', 'candidate'];

export interface PageResult<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface UserListItem {
  id: string;
  fullName: string;
  username: string | null;
  email: string | null;
  code: string | null;
  classLabel: string | null;
  isAdmin: boolean;
  roleTags: RoleTag[];
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserDetail extends UserListItem {
  dateOfBirth: string | null;
  gender: Gender | null;
  lockedAt: string | null;
  lockedReason: string | null;
  removedAt: string | null;
  mustChangePassword: boolean;
  passwordExpiresAt: string | null;
  examinerProfile: {
    academicDegree: AcademicDegree | null;
    academicTitle: AcademicTitle | null;
    unitId: string | null;
    unitName: string | null;
  } | null;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
}

export interface LoginEvent {
  id: string;
  userId: string | null;
  userName: string | null;
  identifierTried: string;
  success: boolean;
  failureReason: string | null;
  ip: string | null;
  userAgent: string | null;
  at: string;
}

export interface AuditLog {
  id: number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  at: string;
}

export interface TemporaryPassword {
  temporaryPassword: string;
  passwordExpiresAt: string;
}

/** Bỏ tham số rỗng để URL gọn và khóa cache ổn định. */
function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export interface UserListParams {
  q?: string;
  status?: UserStatus;
  roleTag?: RoleTag;
  page?: number;
}

export const usersQuery = (params: UserListParams) =>
  queryOptions({
    queryKey: ['admin', 'users', params],
    queryFn: () => apiFetch<PageResult<UserListItem>>(`/admin/users${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });

export const userQuery = (id: string) =>
  queryOptions({
    queryKey: ['admin', 'users', id],
    queryFn: () => apiFetch<UserDetail>(`/admin/users/${id}`),
  });

export const unitsQuery = queryOptions({
  queryKey: ['admin', 'units'],
  queryFn: () => apiFetch<Unit[]>('/admin/units'),
});

export interface LoginEventParams {
  userId?: string;
  success?: 'true' | 'false';
  page?: number;
}

export const loginEventsQuery = (params: LoginEventParams) =>
  queryOptions({
    queryKey: ['admin', 'login-events', params],
    queryFn: () =>
      apiFetch<PageResult<LoginEvent>>(`/admin/login-events${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });

export interface AuditLogParams {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  page?: number;
}

export const auditLogsQuery = (params: AuditLogParams) =>
  queryOptions({
    queryKey: ['admin', 'audit-logs', params],
    queryFn: () => apiFetch<PageResult<AuditLog>>(`/admin/audit-logs${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });

export type UserUpdate = Partial<
  Pick<
    UserDetail,
    'fullName' | 'username' | 'email' | 'code' | 'classLabel' | 'dateOfBirth' | 'gender'
  >
> & {
  examinerProfile?: Partial<{
    academicDegree: AcademicDegree | null;
    academicTitle: AcademicTitle | null;
    unitId: string | null;
  }>;
};

export const updateUser = (id: string, body: UserUpdate) =>
  apiFetch<UserDetail>(`/admin/users/${id}`, { method: 'PATCH', body });

export const lockUser = (id: string, reason: string) =>
  apiFetch<UserDetail>(`/admin/users/${id}/lock`, { method: 'POST', body: { reason } });

export const unlockUser = (id: string, reason: string) =>
  apiFetch<UserDetail>(`/admin/users/${id}/unlock`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });

export const removeUser = (id: string) =>
  apiFetch<UserDetail>(`/admin/users/${id}`, { method: 'DELETE' });

export const setRoleTag = (id: string, tag: RoleTag, granted: boolean) =>
  apiFetch<UserDetail>(`/admin/users/${id}/role-tags/${tag}`, {
    method: granted ? 'PUT' : 'DELETE',
  });

export const reissueTemporaryPassword = (id: string) =>
  apiFetch<TemporaryPassword>(`/admin/users/${id}/temporary-password`, { method: 'POST' });

export const createAdmin = (body: { username: string; email: string | null; fullName: string }) =>
  apiFetch<TemporaryPassword & { id: string }>('/admin/admins', { method: 'POST', body });

export const createUnit = (body: { code: string; name: string }) =>
  apiFetch<Unit>('/admin/units', { method: 'POST', body });

export const updateUnit = (id: string, body: { code: string; name: string }) =>
  apiFetch<Unit>(`/admin/units/${id}`, { method: 'PATCH', body });

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
export const INVITATION_STATUSES: InvitationStatus[] = [
  'pending',
  'accepted',
  'expired',
  'revoked',
];

export interface Invitation {
  id: string;
  email: string;
  fullName: string;
  unitId: string;
  unitName: string;
  invitedByName: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

/** Trả về từ tạo / Tạo lại link: `token` chỉ có đúng lần này. */
export interface InvitationLink {
  id: string;
  email: string;
  fullName: string;
  status: InvitationStatus;
  expiresAt: string;
  token: string;
}

export interface InvitationParams {
  status?: InvitationStatus;
  page?: number;
}

export const invitationsQuery = (params: InvitationParams) =>
  queryOptions({
    queryKey: ['admin', 'invitations', params],
    queryFn: () =>
      apiFetch<PageResult<Invitation>>(`/admin/invitations${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });

export const createInvitation = (body: { email: string; fullName: string; unitId: string }) =>
  apiFetch<InvitationLink>('/admin/invitations', { method: 'POST', body });

export const revokeInvitation = (id: string) =>
  apiFetch<Invitation>(`/admin/invitations/${id}/revoke`, { method: 'POST' });

export const regenerateInvitation = (id: string) =>
  apiFetch<InvitationLink>(`/admin/invitations/${id}/regenerate`, { method: 'POST' });

/** Link gửi cho người được mời; dựng từ địa chỉ trang đang mở nên đúng ở cả dev lẫn production. */
export const invitationUrl = (token: string) => `${window.location.origin}/invite/${token}`;
