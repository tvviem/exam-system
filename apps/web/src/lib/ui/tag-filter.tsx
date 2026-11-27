import { describeTagFilter, TAG_FILTER_MAX, type TagMatch } from '@exam/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OTHER_TAGS_SHOWN, type TagCount, tagFacets } from '../tag-facets';
import { Button, fieldClass } from '.';

/** Dòng "Đang lọc: …" nói bằng lời điều kiện đang áp dụng; chỉ cần khi chọn từ hai tag. */
export function TagFilterSummary({ tags, match }: { tags: string[]; match: TagMatch }) {
  const { t } = useTranslation();
  if (tags.length < 2) return null;
  return (
    <p className="text-sm text-fg-muted wrap-anywhere">
      {t('tagFilter.filtering', { description: describeTagFilter(tags, match) })}
    </p>
  );
}

/**
 * Chọn nhiều tag (docs/plan/loc-nhieu-tag-thiet-ke.md mục 3): danh sách tag đang có kèm số câu, gom theo loại, tìm không
 * dấu; từ hai tag thì chọn được cách khớp.
 */
export function TagFilter({
  counts,
  selected,
  match,
  onChange,
}: {
  /** `undefined` khi đang tải. */
  counts: readonly TagCount[] | undefined;
  selected: string[];
  match: TagMatch;
  onChange: (selected: string[], match: TagMatch) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const groups = counts ? tagFacets(counts, selected, query, expanded) : [];
  const searching = query.trim() !== '';
  const full = selected.length >= TAG_FILTER_MAX;
  const toggle = (tag: string) =>
    onChange(
      selected.includes(tag) ? selected.filter((other) => other !== tag) : [...selected, tag],
      match,
    );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-search`} className="text-sm font-medium text-fg">
          {t('tagFilter.label')}
        </label>
        <input
          id={`${id}-search`}
          type="search"
          className={fieldClass}
          aria-label={t('tagFilter.search')}
          placeholder={t('tagFilter.searchPlaceholder')}
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {selected.length > 1 && (
        <fieldset className="flex min-w-0 flex-wrap gap-x-4">
          <legend className="sr-only">{t('tagFilter.match')}</legend>
          {(['all', 'any'] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-center gap-2 text-sm pointer-fine:min-h-8"
            >
              <input
                type="radio"
                name={`${id}-match`}
                className="size-4"
                checked={match === value}
                onChange={() => onChange(selected, value)}
              />
              {t(value === 'all' ? 'tagFilter.matchAll' : 'tagFilter.matchAny')}
            </label>
          ))}
        </fieldset>
      )}

      {full && (
        <p className="text-sm text-warning">{t('tagFilter.full', { count: TAG_FILTER_MAX })}</p>
      )}

      {groups.map((group) => {
        // Chỉ có nhóm "khác" thì không cần tiêu đề.
        const heading = group.kind ?? (groups.length > 1 ? t('tagFilter.other') : null);
        return (
          <fieldset key={group.kind ?? ''} className="flex min-w-0 flex-col">
            <legend
              className={heading ? 'pb-1 text-xs font-semibold text-fg-muted uppercase' : 'sr-only'}
            >
              {heading ?? t('tagFilter.label')}
            </legend>
            {group.items.map((item) => (
              <label
                key={item.tag}
                className="flex min-h-12 cursor-pointer select-none items-center gap-3 rounded-md px-1 text-sm hover:bg-primary-soft pointer-fine:min-h-8"
              >
                <input
                  type="checkbox"
                  className="size-5 shrink-0"
                  aria-label={t('tagFilter.option', { tag: item.tag, count: item.count })}
                  checked={item.selected}
                  disabled={!item.selected && full}
                  onChange={() => toggle(item.tag)}
                />
                <span
                  className={`min-w-0 flex-1 wrap-anywhere ${item.selected ? 'font-semibold' : ''}`}
                >
                  {item.tag}
                </span>
                <span className="shrink-0 text-fg-muted tabular-nums">{item.count}</span>
              </label>
            ))}
            {group.kind === null && !searching && (group.hidden > 0 || expanded) && (
              <Button
                variant="ghost"
                className="self-start"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded && group.items.length > OTHER_TAGS_SHOWN
                  ? t('tagFilter.less')
                  : t('tagFilter.more', { count: group.hidden })}
              </Button>
            )}
          </fieldset>
        );
      })}

      {counts && groups.length === 0 && (
        <p className="text-sm text-fg-muted">
          {t(searching ? 'tagFilter.none' : 'tagFilter.empty')}
        </p>
      )}
    </div>
  );
}
