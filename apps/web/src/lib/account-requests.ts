import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';
import { queryString } from './query-string';

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

export type MatchStatus = 'new' | 'exact' | 'name_mismatch' | 'restore' | 'blocked';
export const MATCH_STATUSES: MatchStatus[] = [
  'new',
  'exact',
  'name_mismatch',
  'restore',
  'blocked',
];

export type ItemOutcome = 'pending' | 'created' | 'tag_added' | 'restored' | 'skipped' | 'rejected';

/** Tài khoản có sẵn mà một dòng khớp, để Quản trị viên đối chiếu (docs/plan/yeu-cau-nhieu-giang-vien-thiet-ke.md mục 4). */
export interface MatchedAccount {
  id: string;
  fullName: string;
  code: string | null;
  email: string | null;
  classLabel: string | null;
  status: 'active' | 'locked' | 'removed';
  isAdmin: boolean;
  removedAt: string | null;
  removedByName: string | null;
  roleTags: string[];
  matchedBy: 'code' | 'email' | 'code_email' | null;
}

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
  /** Số dòng sẽ được duyệt bởi "duyệt các dòng hợp lệ". */
  pendingValid: number;
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
  /** Chỉ Quản trị viên nhận (bảng đối chiếu); Người ra đề luôn `null`. */
  matchedUser: MatchedAccount | null;
}

export interface AccountRequestParams {
  status?: AccountRequestStatus;
  page?: number;
}

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
    refetchInterval: (query) =>
      ['parsing', 'approving'].includes(query.state.data?.status ?? '') ? 2000 : false,
  });

export interface AccountRequestItemParams {
  matchStatus?: MatchStatus;
  page?: number;
}

/** `refreshKey` (trạng thái yêu cầu) đổi thì danh sách dòng được tải lại, ví dụ khi vừa đọc xong file. */
export const accountRequestItemsQuery = (
  id: string,
  params: AccountRequestItemParams,
  refreshKey?: string,
) =>
  queryOptions({
    queryKey: ['account-requests', 'items', id, params, refreshKey],
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

export interface ApprovalSelection {
  allValid?: boolean;
  approveItemIds?: string[];
  rejectItemIds?: string[];
}

export const approveAccountRequest = (id: string, selection: ApprovalSelection) =>
  apiFetch<AccountRequestDetail>(`/account-requests/${id}/approve`, {
    method: 'POST',
    body: selection,
  });
