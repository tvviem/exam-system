import { and, gt, isNotNull, isNull, lte, type SQL } from 'drizzle-orm';
import { invitations } from '../identity.schema';

export const INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'revoked'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** Q77: trạng thái suy ra, thứ tự ưu tiên accepted > revoked > expired > pending. */
export function invitationStatusOf(
  invitation: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InvitationStatus {
  if (invitation.acceptedAt) return 'accepted';
  if (invitation.revokedAt) return 'revoked';
  return invitation.expiresAt <= now ? 'expired' : 'pending';
}

/** Điều kiện SQL tương ứng với `invitationStatusOf`. */
export function invitationStatusCondition(status: InvitationStatus, now: Date): SQL | undefined {
  const { acceptedAt, revokedAt, expiresAt } = invitations;
  switch (status) {
    case 'accepted':
      return isNotNull(acceptedAt);
    case 'revoked':
      return and(isNull(acceptedAt), isNotNull(revokedAt));
    case 'expired':
      return and(isNull(acceptedAt), isNull(revokedAt), lte(expiresAt, now));
    case 'pending':
      return and(isNull(acceptedAt), isNull(revokedAt), gt(expiresAt, now));
  }
}
