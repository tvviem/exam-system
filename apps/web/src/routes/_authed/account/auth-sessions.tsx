import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type AuthSession, authSessionsQuery, revokeAuthSession } from '../../../lib/auth';

export const Route = createFileRoute('/_authed/account/auth-sessions')({
  loader: ({ context }) => context.queryClient.ensureQueryData(authSessionsQuery),
  component: AuthSessionsPage,
});

const timeFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

function deviceName(session: AuthSession, fallback: string): string {
  const ua = session.userAgent ?? '';
  const os = /Android|iPhone|iPad|Windows|Mac OS|Linux/.exec(ua)?.[0];
  const browser = /Edg|Firefox|Chrome|Safari/.exec(ua)?.[0];
  return [browser === 'Edg' ? 'Edge' : browser, os].filter(Boolean).join(' · ') || fallback;
}

function AuthSessionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: sessions } = useSuspenseQuery(authSessionsQuery);
  const revoke = useMutation({
    mutationFn: revokeAuthSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authSessionsQuery.queryKey }),
  });

  return (
    <section>
      <h1 className="text-lg font-semibold">{t('authSessions.heading')}</h1>
      <p className="mt-1 text-slate-600">{t('authSessions.intro')}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {sessions.map((s) => (
          <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-medium">
              {deviceName(s, t('authSessions.unknownDevice'))}
              {s.current && (
                <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                  {t('authSessions.current')}
                </span>
              )}
            </p>
            <p className="text-sm text-slate-600">
              {s.ip} ·{' '}
              {t('authSessions.started', { time: timeFormat.format(new Date(s.createdAt)) })} ·{' '}
              {t('authSessions.lastSeen', { time: timeFormat.format(new Date(s.lastSeenAt)) })}
            </p>
            {!s.current && (
              <button
                type="button"
                className="mt-2 min-h-12 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                onClick={() => revoke.mutate(s.id)}
              >
                {t('authSessions.revoke')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
