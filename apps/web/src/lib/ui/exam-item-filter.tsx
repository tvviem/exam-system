import { useTranslation } from 'react-i18next';
import type { FilterResult, ItemFilter } from '../exam-filter';
import { Button, Card, SearchField, SelectField } from '.';

/**
 * Bộ lọc câu hỏi của Bộ đề đã phát hành (xem lại bộ đề): ô tìm theo nội dung hoặc tag (không phân biệt hoa thường và dấu), chọn một
 * tag trong các tag của Bộ đề, đếm số câu đang hiện và nút Xóa lọc. Lọc ngay trên máy.
 */
export function ExamItemFilter({
  filter,
  onChange,
  tags,
  result,
}: {
  filter: ItemFilter;
  onChange: (filter: ItemFilter) => void;
  tags: string[];
  result: FilterResult;
}) {
  const { t } = useTranslation();
  return (
    <Card id="exam-filter" className="flex scroll-mt-24 flex-col gap-3" data-testid="exam-filter">
      <h3 className="text-base font-semibold">{t('exam.filter.title')}</h3>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 sm:flex-1">
          <SearchField
            id="exam-filter-query"
            label={t('exam.filter.query')}
            value={filter.query}
            maxLength={200}
            onChange={(event) => onChange({ ...filter, query: event.target.value })}
          />
        </div>
        {tags.length > 0 && (
          <div className="sm:w-56">
            <SelectField
              id="exam-filter-tag"
              label={t('exam.filter.tag')}
              value={filter.tag}
              onChange={(event) => onChange({ ...filter, tag: event.target.value })}
            >
              <option value="">{t('exam.filter.allTags')}</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        {result.active && (
          <Button onClick={() => onChange({ query: '', tag: '' })}>{t('exam.filter.clear')}</Button>
        )}
      </div>
      <p className="min-h-5 text-sm text-fg-muted" aria-live="polite" data-testid="filter-status">
        {result.active
          ? t('exam.filter.showing', { shown: result.shown, total: result.total })
          : ''}
      </p>
    </Card>
  );
}
