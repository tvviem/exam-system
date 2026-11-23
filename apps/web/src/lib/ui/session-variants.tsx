import { VARIANT_COUNT_MAX } from '@exam/shared';
import { useTranslation } from 'react-i18next';
import { type DrawScope, variantCountOf } from '../session-variants';
import { TextField } from '.';

const OPTIONS: DrawScope[] = ['shared', 'per_candidate'];

/**
 * Cách ra đề của Phiên thi (docs/plan/ma-de-phien-thi-thiet-ke.md; Q463, Q478, Q479): dùng chung các Mã đề (rút một lần cho cả
 * Phiên thi, hệ thống tự chia Người dự thi vào các Mã đề) hoặc mỗi người một đề (rút riêng khi vào thi, như trước). Khóa khi đã có
 * Lượt làm bài đầu tiên.
 */
export function SessionVariantsBlock({
  scope,
  count,
  locked,
  onChange,
}: {
  scope: DrawScope;
  /** Chuỗi đang gõ ở ô "Số Mã đề". */
  count: string;
  locked: boolean;
  onChange: (change: { drawScope?: DrawScope; variantCount?: string }) => void;
}) {
  const { t } = useTranslation();
  const countState = variantCountOf(count);
  return (
    <fieldset
      data-testid="session-variants"
      disabled={locked}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4"
    >
      <legend className="px-1 text-base font-semibold">{t('session.variants.title')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option}
            className={`flex min-h-16 items-start gap-3 rounded-xl border p-3 ${
              locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
            } ${
              scope === option
                ? 'border-primary bg-primary-soft text-on-primary-soft'
                : 'border-border bg-surface'
            }`}
          >
            <input
              type="radio"
              name="session-draw-scope"
              className="mt-1 size-5"
              checked={scope === option}
              onChange={() => onChange({ drawScope: option })}
            />
            <span className="flex flex-col">
              <span className="font-medium">{t(`session.variants.scope.${option}`)}</span>
              <span className="text-sm text-fg-muted">
                {t(`session.variants.scopeHint.${option}`)}
              </span>
            </span>
          </label>
        ))}
      </div>

      {scope === 'shared' && (
        <TextField
          id="session-variant-count"
          type="number"
          inputMode="numeric"
          label={t('session.variants.count')}
          hint={t('session.variants.countHint', { max: VARIANT_COUNT_MAX })}
          error={
            countState.valid
              ? undefined
              : t('session.invalid.variantCount', { max: VARIANT_COUNT_MAX })
          }
          min={1}
          max={VARIANT_COUNT_MAX}
          value={count}
          onChange={(event) => onChange({ variantCount: event.target.value })}
          className="w-28"
        />
      )}

      <p className="text-sm text-fg-muted">
        {t(locked ? 'session.variants.locked' : 'session.variants.codeNote')}
      </p>
    </fieldset>
  );
}
