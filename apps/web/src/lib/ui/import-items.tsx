import { plainTextOf } from '@exam/shared';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportItem } from '../question-imports';
import { Badge, Button, Dialog } from '.';
import { DataList } from './data-list';
import { QuestionView, type QuestionViewData } from './question-view';

/** Câu hỏi đã đổi từ dòng Excel, để xem trước đúng như sẽ lưu; null với dòng lỗi. */
const viewOf = (item: ImportItem): QuestionViewData | null =>
  item.type && item.stem && item.payload && item.defaultPoints !== null
    ? ({
        type: item.type,
        stem: item.stem,
        payload: item.payload,
        defaultPoints: item.defaultPoints,
      } as QuestionViewData)
    : null;

function Status({ item }: { item: ImportItem }) {
  const { t } = useTranslation();
  if (item.outcome !== 'pending') {
    return item.outcome === 'created' ? (
      <Badge tone="success">{t('questionImport.outcome.created')}</Badge>
    ) : (
      <Badge>{t('questionImport.outcome.skipped')}</Badge>
    );
  }
  if (item.kind === 'error') {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge tone="danger">{t('questionImport.kind.error')}</Badge>
        <span className="text-sm text-danger">
          {t(`questionImport.rowError.${item.errorCode}`, {
            defaultValue: t('questionImport.rowError.invalid_content'),
          })}
        </span>
      </div>
    );
  }
  if (item.kind === 'duplicate') {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge tone="warning">{t('questionImport.kind.duplicate')}</Badge>
        <span className="text-sm text-fg-muted">
          {item.duplicateOfQuestionId
            ? t('questionImport.duplicateExisting')
            : t('questionImport.duplicateRow', { n: item.duplicateOfRow })}
        </span>
      </div>
    );
  }
  return <Badge tone="success">{t('questionImport.kind.valid')}</Badge>;
}

/** Danh sách dòng xem trước: thẻ dưới 768 px, bảng từ 768 px (docs/ui-design.md mục 10–11). */
export function ImportItems({
  items,
  selectable,
  pending,
  onToggle,
}: {
  items: ImportItem[];
  /** Chỉ lúc lô `ready`; sau khi tạo hoặc khi đang tạo thì chỉ xem. */
  selectable: boolean;
  pending: boolean;
  onToggle: (item: ImportItem) => void;
}) {
  const { t } = useTranslation();
  const [viewing, setViewing] = useState<ImportItem | null>(null);
  const viewing_ = viewing ? viewOf(viewing) : null;

  const checkbox = (item: ImportItem) =>
    item.kind === 'error' ? (
      <span className="inline-block size-12 pointer-fine:size-9" />
    ) : (
      <label className="inline-flex size-12 cursor-pointer items-center justify-center pointer-fine:size-9">
        <input
          type="checkbox"
          className="size-5"
          checked={item.selected}
          disabled={pending}
          aria-label={t('questionImport.selectRow', { n: item.rowNumber })}
          onChange={() => onToggle(item)}
        />
      </label>
    );

  const preview = (item: ImportItem) => (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="line-clamp-2 break-words">
        {item.stem ? plainTextOf(item.stem) : t('questionImport.noContent')}
      </span>
      {item.type && (
        <span className="text-sm text-fg-muted">
          {t(`questionType.${item.type}`)} ·{' '}
          {t('questionBank.points', { points: item.defaultPoints })}
        </span>
      )}
    </div>
  );

  const viewButton = (item: ImportItem, labelClass = 'hidden lg:inline') =>
    viewOf(item) ? (
      <Button
        onClick={() => setViewing(item)}
        aria-label={t('questionImport.viewRow', { n: item.rowNumber })}
      >
        <Eye aria-hidden className="size-5" />
        <span className={labelClass}>{t('questionImport.view')}</span>
      </Button>
    ) : null;

  return (
    <>
      <DataList
        items={items}
        rowKey={(item) => item.id}
        selectionHeader={<span className="sr-only">{t('questionImport.select')}</span>}
        selectionCell={selectable ? checkbox : undefined}
        columns={[
          {
            key: 'row',
            header: t('questionImport.rowHeader'),
            cell: (item) => <span className="tabular-nums">{item.rowNumber}</span>,
            className: 'w-16',
          },
          { key: 'content', header: t('questionImport.contentHeader'), cell: preview },
          {
            key: 'status',
            header: t('questionImport.statusHeader'),
            cell: (item) => <Status item={item} />,
          },
          {
            key: 'view',
            header: <span className="sr-only">{t('questionImport.view')}</span>,
            cell: viewButton,
          },
        ]}
        card={(item) => (
          <div
            className={`flex gap-2 rounded-xl border bg-surface p-3 ${item.selected && selectable ? 'border-primary' : 'border-border'}`}
          >
            {selectable && <div className="-ml-1 -mt-1 shrink-0">{checkbox(item)}</div>}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="text-sm text-fg-muted">
                {t('questionImport.row', { n: item.rowNumber })}
              </span>
              {preview(item)}
              <Status item={item} />
              {viewButton(item, '')}
            </div>
          </div>
        )}
      />
      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={t('questionImport.row', { n: viewing?.rowNumber })}
      >
        {viewing_ && <QuestionView question={viewing_} showAnswer />}
      </Dialog>
    </>
  );
}
