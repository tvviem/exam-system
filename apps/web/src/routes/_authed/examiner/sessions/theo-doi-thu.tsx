// PROTOTYPE (Q207): ba phương án màn Theo dõi, chuyển bằng ?variant=A|B|C hoặc phím ← →. Chạy bằng `pnpm dev`,
// đăng nhập tài khoản Người ra đề rồi mở /examiner/sessions/theo-doi-thu. Dữ liệu giả, không gọi API.
// Route tĩnh này được ưu tiên hơn `$sessionId`, và nằm trong khung ứng dụng thật (đầu trang, thanh bên, thanh tab).
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Pause, Play } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button } from '../../../../lib/ui';
import { Breadcrumb } from '../../../../lib/ui/breadcrumb';
import { PageHeader } from '../../../../lib/ui/page-header';
import { RowMenu } from '../../../../lib/ui/row-menu';
import { useToast } from '../../../../lib/ui/toast';
import { clock, DURATION_SECONDS, SIM_STEP, useRoom } from '../../../../prototype/theo-doi/room';
import { PersonPanel, VariantSwitcher } from '../../../../prototype/theo-doi/shared';
import { VariantA } from '../../../../prototype/theo-doi/variant-a';
import { VariantB } from '../../../../prototype/theo-doi/variant-b';
import { VariantC } from '../../../../prototype/theo-doi/variant-c';

const VARIANTS = [
  { key: 'A', name: 'Bảng dày đặc' },
  { key: 'B', name: 'Lưới ghế' },
  { key: 'C', name: 'Ngoại lệ trước' },
];

export const Route = createFileRoute('/_authed/examiner/sessions/theo-doi-thu')({
  staticData: { wide: true },
  validateSearch: (search: Record<string, unknown>): { variant?: string } => ({
    variant:
      typeof search.variant === 'string' && 'ABC'.includes(search.variant)
        ? search.variant
        : undefined,
  }),
  component: MonitorPrototype,
});

function MonitorPrototype() {
  const { variant = 'A' } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const toast = useToast();
  const room = useRoom();
  const [selected, setSelected] = useState<number | null>(null);
  const person = room.people.find((p) => p.id === selected);
  const props = {
    people: room.people,
    simNow: room.simNow,
    actions: room.actions,
    open: setSelected,
    selectedId: selected,
  };
  const all = room.people.map((p) => p.id);

  return (
    <div className={`flex flex-col gap-4 ${selected !== null ? 'lg:pr-96' : ''}`}>
      <Breadcrumb
        items={[
          { label: 'Phiên thi', to: '/examiner/sessions' },
          { label: 'Kiểm tra giữa kỳ — Tin học đại cương (PROTOTYPE)' },
        ]}
      />
      <PageHeader
        title="Theo dõi phòng thi"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">Đang mở</Badge>
            <Badge tone="neutral">
              Giờ phòng thi {clock(room.simNow)} / {clock(DURATION_SECONDS)}
            </Badge>
            <Button
              onClick={() => room.setPaused(!room.paused)}
              aria-label={room.paused ? 'Tiếp tục mô phỏng' : 'Tạm dừng mô phỏng'}
            >
              {room.paused ? (
                <Play aria-hidden className="size-4" />
              ) : (
                <Pause aria-hidden className="size-4" />
              )}
              {room.paused ? 'Tiếp tục' : 'Tạm dừng'}
            </Button>
            <RowMenu
              label="Thao tác cả phòng"
              items={[
                {
                  label: 'Cộng giờ cả phòng +5 phút',
                  onSelect: () => {
                    room.actions.extend(all, 5);
                    toast('Đã cộng 5 phút cho mọi người đang làm (giả lập)');
                  },
                },
                {
                  label: room.entryClosed ? 'Mở lại cửa vào thi' : 'Đóng cửa vào thi',
                  onSelect: () => {
                    room.setEntryClosed(!room.entryClosed);
                    toast(
                      room.entryClosed
                        ? 'Đã mở lại cửa vào thi (giả lập)'
                        : 'Đã đóng cửa vào thi (giả lập)',
                    );
                  },
                },
                {
                  label: 'Buộc nộp cả phòng',
                  danger: true,
                  onSelect: () => {
                    room.actions.forceSubmit(all);
                    toast('Đã Buộc nộp cả phòng (giả lập)');
                  },
                },
              ]}
            />
          </div>
        }
      />
      <p className="text-sm text-fg-muted">
        Dữ liệu giả {room.people.length} người, cập nhật mỗi 2 giây (1 nhịp = {SIM_STEP} giây trong
        phòng thi).
        {room.entryClosed && ' Cửa vào thi đang đóng.'}
      </p>

      {variant === 'A' && <VariantA {...props} />}
      {variant === 'B' && <VariantB {...props} />}
      {variant === 'C' && <VariantC {...props} />}

      <PersonPanel
        person={person}
        simNow={room.simNow}
        actions={room.actions}
        onClose={() => setSelected(null)}
      />
      <VariantSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) => navigate({ search: { variant: key }, replace: true })}
      />
    </div>
  );
}
