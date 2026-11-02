import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FONT_SCALES, type Prefs } from '../take/prefs';
import { Dialog } from '.';

/** Bảng "Hiển thị" (nút Aa): cỡ chữ, kiểu chữ, giao diện sáng/tối. Chỉ đổi cách hiện, không đổi nội dung đề. */
export function TakePrefsDialog({
  open,
  onClose,
  prefs,
  onChange,
  children,
}: {
  open: boolean;
  onClose: () => void;
  prefs: Prefs;
  onChange: (change: Partial<Prefs>) => void;
  /** Công tắc giao diện sáng/tối của cả ứng dụng. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const choice =
    'inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium text-fg-muted has-checked:bg-primary-soft has-checked:text-on-primary-soft has-focus-visible:outline-2 has-focus-visible:outline-ring';
  return (
    <Dialog open={open} onClose={onClose} title={t('take.prefs.title')}>
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('take.prefs.fontSize')}</legend>
          <div className="flex rounded-lg border border-border p-0.5">
            {FONT_SCALES.map((scale) => (
              <label key={scale} className={choice}>
                <input
                  type="radio"
                  name="font-scale"
                  className="sr-only"
                  checked={prefs.fontScale === scale}
                  onChange={() => onChange({ fontScale: scale })}
                />
                {scale}%
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('take.prefs.typeface')}</legend>
          <div className="flex rounded-lg border border-border p-0.5">
            {([true, false] as const).map((serif) => (
              <label key={String(serif)} className={choice}>
                <input
                  type="radio"
                  name="typeface"
                  className="sr-only"
                  checked={prefs.serif === serif}
                  onChange={() => onChange({ serif })}
                />
                {t(serif ? 'take.prefs.serif' : 'take.prefs.sans')}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('theme.label')}</span>
          {children}
        </div>
      </div>
    </Dialog>
  );
}
