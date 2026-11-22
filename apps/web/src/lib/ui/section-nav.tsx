import { ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '.';
import { RowMenu } from './row-menu';

/**
 * Chuyển nhanh giữa các Phần của Bộ đề đang soạn: nút trước/sau, nhãn "Phần 2/3" cho biết đang xem Phần nào (đổi theo vị trí
 * cuộn) và bấm nhãn để mở danh sách Phần (tên, số câu) rồi nhảy thẳng. Nằm trong thanh dính cạnh nút Lưu nên không thêm lớp
 * nào che nội dung câu hỏi.
 */
export function SectionNav({
  sections,
  current,
  onJump,
}: {
  sections: { key: string; name: string; count: number }[];
  /** Vị trí (từ 0) của Phần đang xem. */
  current: number;
  onJump: (key: string) => void;
}) {
  const { t } = useTranslation();
  const total = sections.length;
  const at = Math.min(Math.max(current, 0), total - 1);
  const go = (index: number) => {
    const target = sections[index];
    if (target) onJump(target.key);
  };
  return (
    <fieldset
      aria-label={t('exam.nav.label')}
      className="m-0 flex min-w-0 shrink-0 items-center gap-1 border-0 p-0"
    >
      <Button
        className="px-3"
        aria-label={t('exam.nav.prev')}
        title={t('exam.nav.prev')}
        disabled={at <= 0}
        onClick={() => go(at - 1)}
      >
        <ChevronLeft aria-hidden className="size-5" />
      </Button>
      <RowMenu
        label={t('exam.nav.openList', { n: at + 1, total })}
        width={320}
        trigger={
          <>
            {t('exam.nav.current', { n: at + 1, total })}
            <ChevronsUpDown aria-hidden className="size-4 text-fg-muted" />
          </>
        }
        items={sections.map((s, i) => ({
          label: s.name,
          hint: t('exam.nav.count', { count: s.count }),
          current: i === at,
          onSelect: () => onJump(s.key),
        }))}
      />
      <Button
        className="px-3"
        aria-label={t('exam.nav.next')}
        title={t('exam.nav.next')}
        disabled={at >= total - 1}
        onClick={() => go(at + 1)}
      >
        <ChevronRight aria-hidden className="size-5" />
      </Button>
    </fieldset>
  );
}
