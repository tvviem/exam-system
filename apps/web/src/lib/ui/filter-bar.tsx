import { ListFilter } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, PrimaryButton } from '.';

/**
 * Thanh tìm và lọc (docs/ui-design.md mục 7): từ 768 px các bộ lọc nằm cùng hàng với ô tìm; điện thoại
 * chỉ có ô tìm và nút "Lọc (n)" mở bottom sheet.
 */
export function FilterBar({
  search,
  filters,
  activeCount,
  wide = false,
  contained = false,
}: {
  search: ReactNode;
  filters: ReactNode;
  /** Số bộ lọc đang áp dụng, hiện trên nút "Lọc (n)". */
  activeCount: number;
  /** Từ ba bộ lọc trở lên thì chừa rộng hơn. */
  wide?: boolean;
  /** Nằm trong một cột của lưới (không tràn ra lề trang): bỏ lề âm để không đè lên cột bên cạnh. */
  contained?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        data-testid="filter-bar"
        className={`sticky top-(--app-header-h) z-10 flex flex-col gap-3 bg-bg py-2 md:flex-row md:items-end ${
          contained ? '' : '-mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8'
        }`}
      >
        <div className="flex-1">{search}</div>
        <div className={`hidden gap-3 md:flex ${wide ? 'md:w-[34rem]' : 'md:w-96'}`}>{filters}</div>
        <Button className="md:hidden" onClick={() => setOpen(true)}>
          <ListFilter aria-hidden className="size-5" />
          {t('filter.open', { count: activeCount })}
        </Button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('filter.title')}>
        {filters}
        <PrimaryButton onClick={() => setOpen(false)}>{t('common.done')}</PrimaryButton>
      </Dialog>
    </>
  );
}
