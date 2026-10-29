import { queryOptions } from '@tanstack/react-query';
import type { AcademicDegree, AcademicTitle } from './admin';
import { apiFetch } from './api';

/** Lời mời xem bằng link, dành cho người được mời (không cần đăng nhập). */
export interface InvitationPreview {
  email: string;
  fullName: string;
  unitName: string | null;
  accountExists: boolean;
}

export const invitationPreviewQuery = (token: string) =>
  queryOptions({
    queryKey: ['invitation', token],
    queryFn: () => apiFetch<InvitationPreview>(`/invitations/${token}`),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

export const acceptInvitation = (
  token: string,
  body: {
    password?: string;
    academicDegree: AcademicDegree | null;
    academicTitle: AcademicTitle | null;
  },
) =>
  apiFetch<{ ok: true; createdAccount: boolean }>(`/invitations/${token}/accept`, {
    method: 'POST',
    body,
  });
