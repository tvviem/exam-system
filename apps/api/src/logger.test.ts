import { describe, expect, it } from 'vitest';
import { redactInvitationToken } from './logger';

describe('redactInvitationToken', () => {
  it('che token Lời mời trong đường dẫn, giữ phần còn lại', () => {
    const token = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123_-';
    expect(redactInvitationToken(`/api/invitations/${token}`)).toBe('/api/invitations/[redacted]');
    expect(redactInvitationToken(`/api/invitations/${token}/accept?x=1`)).toBe(
      '/api/invitations/[redacted]/accept?x=1',
    );
  });

  it('không đụng tới đường dẫn khác', () => {
    expect(redactInvitationToken('/api/admin/invitations/0198-id/revoke')).toBe(
      '/api/admin/invitations/0198-id/revoke',
    );
    expect(redactInvitationToken('/api/health')).toBe('/api/health');
  });
});
