import { createHash, randomBytes } from 'node:crypto';

/** Token Lời mời (Q78): 32 byte ngẫu nhiên; DB chỉ lưu SHA-256, nên lộ DB không lộ link. */
export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export const hashInvitationToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
