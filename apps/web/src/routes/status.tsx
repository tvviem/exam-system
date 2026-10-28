import { type HealthResponse, healthResponseSchema } from '@exam/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/status')({
  component: StatusPage,
});

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  // 503 vẫn có body hợp lệ, cho biết thành phần nào đang lỗi.
  return healthResponseSchema.parse(await res.json());
}

function StatusPage() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold">{t('health.heading')}</h1>
        <p data-testid="health-status" className="mt-2">
          {health.isPending
            ? t('health.checking')
            : health.isError
              ? t('health.unreachable')
              : t(`health.${health.data.status}`)}
        </p>
        {health.data && (
          <ul className="mt-2 text-sm text-slate-600">
            <li>PostgreSQL: {t(`health.${health.data.checks.postgres}`)}</li>
            <li>Redis: {t(`health.${health.data.checks.redis}`)}</li>
          </ul>
        )}
      </section>
    </main>
  );
}
