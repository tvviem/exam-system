// PROTOTYPE (Q110, Q290–Q293): màn Chấm Câu tự luận, ba phương án. Chạy bằng `pnpm dev`, đăng nhập tài khoản Người ra đề rồi mở
//   /examiner/sessions/cham-thu?variant=A|B|C   (phím ← → đổi phương án; mọi dữ liệu giả, không gọi API)
// Route tĩnh này được ưu tiên hơn `$sessionId`, nên màn nằm trong khung ứng dụng thật.
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Breadcrumb } from '../../../../lib/ui/breadcrumb';
import { ENTRIES } from '../../../../prototype/cham-bai/data';
import { PrototypeSwitcher, useGrading } from '../../../../prototype/cham-bai/grading';
import { VARIANTS } from '../../../../prototype/cham-bai/variants';

type Key = 'A' | 'B' | 'C';

export const Route = createFileRoute('/_authed/examiner/sessions/cham-thu')({
  staticData: { wide: true },
  validateSearch: (search: Record<string, unknown>): { variant?: Key } => ({
    variant: ['A', 'B', 'C'].includes(search.variant as string)
      ? (search.variant as Key)
      : undefined,
  }),
  component: GradingPrototype,
});

function GradingPrototype() {
  const { variant = 'A' } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const g = useGrading(ENTRIES);
  const active = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0];
  const Active = active.Component;
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: 'Phiên thi', to: '/examiner/sessions' },
          { label: 'Kiểm tra giữa kỳ — Chấm câu 4 (PROTOTYPE)' },
        ]}
      />
      <p className="rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-fg-muted">
        Prototype, dữ liệu giả: 36 bài, đã chấm sẵn 3 bài. Đổi phương án bằng thanh dưới màn hình
        hoặc phím ← →. Thử cả màn máy tính và điện thoại.
      </p>
      <Active g={g} />
      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={active.key}
        onChange={(key) => navigate({ search: { variant: key as Key }, replace: true })}
      />
    </div>
  );
}
