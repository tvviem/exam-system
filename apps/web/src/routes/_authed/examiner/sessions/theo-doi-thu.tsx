// PROTOTYPE (Q207, Q252–Q254): màn Theo dõi gộp ba chế độ xem. Chạy bằng `pnpm dev`, đăng nhập tài khoản Người ra đề rồi mở
//   /examiner/sessions/theo-doi-thu?n=20|120|300   (n = số người giả; chế độ mặc định đổi theo n)
//   thêm &view=cards|table|grid để ép một chế độ.
// Route tĩnh này được ưu tiên hơn `$sessionId`, nên màn nằm trong khung ứng dụng thật. Dữ liệu giả, không gọi API.
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Breadcrumb } from '../../../../lib/ui/breadcrumb';
import {
  defaultViewFor,
  MonitorScreen,
  STEP_NOTE,
  type View,
} from '../../../../prototype/theo-doi/monitor';

const COUNTS = [20, 120, 300];
const VIEWS = ['cards', 'table', 'grid'];

export const Route = createFileRoute('/_authed/examiner/sessions/theo-doi-thu')({
  staticData: { wide: true },
  validateSearch: (search: Record<string, unknown>): { n?: number; view?: View } => {
    const n = Number(search.n);
    return {
      n: COUNTS.includes(n) ? n : undefined,
      view: VIEWS.includes(search.view as string) ? (search.view as View) : undefined,
    };
  },
  component: MonitorPrototype,
});

function MonitorPrototype() {
  const { n = 300, view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: 'Phiên thi', to: '/examiner/sessions' },
          { label: 'Kiểm tra giữa kỳ — Tin học đại cương (PROTOTYPE)' },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-fg-muted">
        <span>
          Prototype, dữ liệu giả<span className="hidden sm:inline">. {STEP_NOTE}</span>. Số người:
        </span>
        {COUNTS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={n === c}
            onClick={() => navigate({ search: { n: c }, replace: true })}
            className={`min-h-11 cursor-pointer rounded-md border px-3 font-semibold pointer-fine:min-h-8 ${
              n === c
                ? 'border-primary bg-primary-soft text-on-primary-soft'
                : 'border-border-strong bg-surface text-fg'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <MonitorScreen
        key={n}
        count={n}
        view={view ?? defaultViewFor(n)}
        onView={(next) => navigate({ search: { n, view: next }, replace: true })}
      />
    </div>
  );
}
