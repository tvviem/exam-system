import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';

export type AccountRequestStatus =
  | 'parsing'
  | 'parse_failed'
  | 'pending'
  | 'approving'
  | 'approved'
  | 'partially_approved'
  | 'rejected';
export const ACCOUNT_REQUEST_STATUSES: AccountRequestStatus[] = [
  'parsing',
  'parse_failed',
  'pending',
  'approving',
  'approved',
  'partially_approved',
  'rejected',
];

export type MatchStatus = 'new' | 'exact' | 'name_mismatch' | 'blocked';
export const MATCH_STATUSES: MatchStatus[] = ['new', 'exact', 'name_mismatch', 'blocked'];

export type ItemOutcome = 'pending' | 'created' | 'tag_added' | 'skipped' | 'rejected';

export interface AccountRequestListItem {
  id: string;
  status: AccountRequestStatus;
  parseError: string | null;
  originalFilename: string;
  rowCount: number | null;
  requesterName: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AccountRequestDetail {
  id: string;
  status: AccountRequestStatus;
  parseError: string | null;
  note: string | null;
  originalFilename: string;
  rowCount: number | null;
  requestedById: string;
  requesterName: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  counts: Record<MatchStatus, number>;
}

export interface AccountRequestItem {
  id: string;
  rowNumber: number;
  fullName: string | null;
  code: string | null;
  email: string | null;
  classLabel: string | null;
  dateOfBirth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  matchStatus: MatchStatus;
  outcome: ItemOutcome;
  outcomeNote: string | null;
  matchedUser: { id: string; fullName: string } | null;
}

export interface AccountRequestParams {
  status?: AccountRequestStatus;
  page?: number;
}

const queryString = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const accountRequestsQuery = (params: AccountRequestParams) =>
  queryOptions({
    queryKey: ['account-requests', 'list', params],
    queryFn: () =>
      apiFetch<PageResult<AccountRequestListItem>>(
        `/account-requests${queryString({ ...params })}`,
      ),
    placeholderData: keepPreviousData,
  });

/** Đang đọc file thì hỏi lại mỗi 2 giây (Q89). */
export const accountRequestQuery = (id: string) =>
  queryOptions({
    queryKey: ['account-requests', 'detail', id],
    queryFn: () => apiFetch<AccountRequestDetail>(`/account-requests/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'parsing' ? 2000 : false),
  });

export interface AccountRequestItemParams {
  matchStatus?: MatchStatus;
  page?: number;
}

export const accountRequestItemsQuery = (
  id: string,
  params: AccountRequestItemParams,
  status?: string,
) =>
  queryOptions({
    queryKey: ['account-requests', 'items', id, params, status],
    queryFn: () =>
      apiFetch<PageResult<AccountRequestItem>>(
        `/account-requests/${id}/items${queryString({ ...params })}`,
      ),
    placeholderData: keepPreviousData,
  });

/** `note` đứng trước `file`: server đọc file theo luồng nên chỉ thấy các trường đứng trước nó. */
export function uploadAccountRequest(file: File, note: string) {
  const form = new FormData();
  if (note.trim()) form.append('note', note.trim());
  form.append('file', file);
  return apiFetch<{ id: string; status: AccountRequestStatus }>('/account-requests', {
    method: 'POST',
    body: form,
  });
}

export const rejectAccountRequest = (id: string, note: string) =>
  apiFetch<AccountRequestDetail>(`/account-requests/${id}/reject`, {
    method: 'POST',
    body: note.trim() ? { note: note.trim() } : {},
  });

export const TEMPLATE_URL = '/api/account-requests/template';
