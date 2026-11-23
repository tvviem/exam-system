import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Dices, Download, Eye } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import {
  redrawVariants,
  type SessionSummary,
  type SessionVariantView,
  sessionVariantsQuery,
} from '../sessions';
import { Badge, Button, buttonClass, Card, Dialog, ErrorMessage } from '.';
import { PaperExportDialog } from './paper-export-dialog';
import { RichTextView } from './rich-text-view';
import { useToast } from './toast';

const fmt = (n: number) => String(n).replace('.', ',');

/**
 * Tab "Đề" của Phiên thi dùng chung Mã đề (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4.4): bộ câu của từng Mã đề theo Phần, "Rút
 * lại", Xem thử và Xuất Word đúng Mã đề. Bộ câu chỉ có đề bài, không có phương án hay Đáp án đúng. Rút lại khóa khi đã có Lượt.
 */
export function SessionVariantsTab({ session }: { session: SessionSummary }) {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const variants = useQuery(sessionVariantsQuery(session.id));
  const [picked, setPicked] = useState(1);
  const [confirm, setConfirm] = useState<'one' | 'all' | null>(null);
  const [exporting, setExporting] = useState(false);

  const redraw = useMutation({
    mutationFn: (number?: number) => redrawVariants(session.id, number),
    onSuccess: async () => {
      setConfirm(null);
      toast(t('session.variants.redrawDone'));
      await Promise.all([
        client.invalidateQueries({ queryKey: ['sessions', 'variants', session.id] }),
        client.invalidateQueries({ queryKey: ['sessions', 'detail', session.id] }),
      ]);
    },
  });

  if (variants.isPending) {
    return (
      <p role="status" className="text-fg-muted">
        {t('session.variants.loading')}
      </p>
    );
  }
  if (variants.isError) return <ErrorMessage>{errorMessage(t, variants.error)}</ErrorMessage>;

  const list = variants.data.variants;
  const current: SessionVariantView | undefined =
    list.find((variant) => variant.number === picked) ?? list[0];
  if (!current) return <p className="text-fg-muted">{t('session.variants.none')}</p>;
  const many = list.length > 1;
  const locked = session.drawLocked === true;
  const name = (title: string | null, index: number) =>
    title?.trim() || t('exam.untitled', { n: index + 1 });

  return (
    <div className="flex flex-col gap-4" data-testid="variants-tab">
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">{t('session.variants.intro')}</p>
        {many && (
          <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
            <legend className="sr-only">{t('session.variants.pick')}</legend>
            {list.map((variant) => (
              <label key={variant.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="session-variant"
                  className="peer sr-only"
                  checked={variant.number === current.number}
                  onChange={() => setPicked(variant.number)}
                />
                <span className="inline-flex min-h-12 items-center rounded-lg border border-border bg-surface px-4 text-base peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:font-medium peer-checked:text-on-primary-soft peer-focus-visible:ring-2 peer-focus-visible:ring-ring pointer-fine:min-h-9">
                  {variant.label}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone="neutral">{current.label}</Badge>
          <span data-testid="variant-summary" className="text-sm">
            {t('session.variants.summary', {
              count: current.itemCount,
              points: fmt(current.totalPoints),
            })}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/examiner/sessions/$sessionId/try"
            params={{ sessionId: session.id }}
            search={{ variant: current.number }}
            className={buttonClass('secondary')}
          >
            <Eye aria-hidden className="size-5" />
            {t('session.variants.preview')}
          </Link>
          <Button onClick={() => setExporting(true)}>
            <Download aria-hidden className="size-5" />
            {t('session.variants.export')}
          </Button>
          <Button disabled={locked} onClick={() => setConfirm('one')}>
            <Dices aria-hidden className="size-5" />
            {t('session.variants.redraw')}
          </Button>
          {many && (
            <Button disabled={locked} onClick={() => setConfirm('all')}>
              {t('session.variants.redrawAll')}
            </Button>
          )}
        </div>
        {locked && (
          <p data-testid="variants-locked" className="text-sm text-fg-muted">
            {t('session.variants.redrawLocked')}
          </p>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        {current.sections.map((section, index) => (
          <Card key={section.sectionId} className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">
              {name(section.title, index)}{' '}
              <span className="text-sm font-normal text-fg-muted">
                {t('session.variants.sectionCount', { count: section.items.length })}
              </span>
            </h3>
            {section.items.length === 0 ? (
              <p className="text-sm text-fg-muted">{t('session.variants.sectionEmpty')}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {section.items.map((item, itemIndex) => (
                  <li
                    key={item.itemId}
                    data-testid="variant-item"
                    className="flex min-w-0 gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0"
                  >
                    <span className="w-8 shrink-0 text-right text-sm tabular-nums text-fg-muted">
                      {itemIndex + 1}.
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <RichTextView doc={item.stem} className="wrap-anywhere" />
                      <span className="text-xs text-fg-muted">
                        {t(`questionType.${item.type}`)} ·{' '}
                        {t('session.variants.points', { points: fmt(item.points) })}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ))}
      </div>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={t(
          confirm === 'all' ? 'session.variants.redrawAllTitle' : 'session.variants.redrawTitle',
          {
            label: current.label,
          },
        )}
      >
        <p className="text-sm text-fg-muted">{t('session.variants.redrawBody')}</p>
        <ErrorMessage>{redraw.isError && errorMessage(t, redraw.error)}</ErrorMessage>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            disabled={redraw.isPending}
            onClick={() => redraw.mutate(confirm === 'all' ? undefined : current.number)}
          >
            {t('session.variants.redrawConfirm')}
          </Button>
        </div>
      </Dialog>

      <PaperExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        source={{ sessionId: session.id, variant: current.number }}
        title={`${session.title} · ${current.label}`}
      />
    </div>
  );
}
