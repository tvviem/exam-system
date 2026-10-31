import type { QuestionInput, QuestionType } from '@exam/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';
import { queryString } from './query-string';

// Nhập Câu hỏi từ Excel (docs/plan/slice-2.md, Q123, Q145–Q147).

export type ImportStatus = 'parsing' | 'parse_failed' | 'ready' | 'committing' | 'committed';
export type ImportKind = 'valid' | 'duplicate' | 'error';
export type ImportGroup = 'valid' | 'duplicate';

export interface ImportCounts {
  valid: number;
  duplicate: number;
  error: number;
  selected: number;
  selectedValid: number;
  selectedDuplicate: number;
}

export interface ImportBatchListItem {
  id: string;
  status: ImportStatus;
  originalFilename: string;
  topicId: string;
  topicName: string;
  rowCount: number | null;
  createdCount: number | null;
  createdAt: string;
  committedAt: string | null;
}

export interface ImportBatch {
  id: string;
  status: ImportStatus;
  parseError: string | null;
  originalFilename: string;
  topic: { id: string; name: string };
  rowCount: number | null;
  createdCount: number | null;
  createdAt: string;
  committedAt: string | null;
  expiresAt: string;
  counts: ImportCounts;
  /** Số dòng theo Loại câu hỏi; chỉ gồm Loại có dòng. */
  types: Partial<Record<QuestionType, number>>;
}

export interface ImportItem {
  id: string;
  /** Loại câu hỏi, do sheet quyết định; có cả ở dòng lỗi. */
  type: QuestionType;
  /** Số dòng trong sheet của Loại này, không phải trong cả file. */
  rowNumber: number;
  kind: ImportKind;
  errorCode: string | null;
  duplicateOfQuestionId: string | null;
  duplicateOfRow: number | null;
  duplicateOfType: QuestionType | null;
  selected: boolean;
  outcome: 'pending' | 'created' | 'skipped';
  /** Nội dung đã đổi từ dòng Excel; null khi dòng lỗi. */
  stem: QuestionInput['stem'] | null;
  payload: QuestionInput['payload'] | null;
  defaultPoints: number | null;
  tags: string[] | null;
}

export const IMPORT_TEMPLATE_URL = '/api/question-imports/template';
export const IMPORT_EXAMPLE_URL = '/api/question-imports/example';

/** `missing_columns:Chọn một` → mã lỗi và tên sheet gây lỗi (rỗng nếu lỗi không gắn với sheet). */
export function parseErrorOf(value: string | null): { code: string; sheet: string } {
  if (!value) return { code: 'internal_error', sheet: '' };
  const at = value.indexOf(':');
  return at < 0
    ? { code: value, sheet: '' }
    : { code: value.slice(0, at), sheet: value.slice(at + 1) };
}

export const importBatchesQuery = (page?: number) =>
  queryOptions({
    queryKey: ['question-imports', 'list', page],
    queryFn: () =>
      apiFetch<PageResult<ImportBatchListItem>>(`/question-imports${queryString({ page })}`),
    placeholderData: keepPreviousData,
  });

/** Đang đọc file hoặc đang tạo Câu hỏi thì hỏi lại mỗi giây. */
export const importBatchQuery = (id: string) =>
  queryOptions({
    queryKey: ['question-imports', 'detail', id],
    queryFn: () => apiFetch<ImportBatch>(`/question-imports/${id}`),
    refetchInterval: (query) =>
      ['parsing', 'committing'].includes(query.state.data?.status ?? '') ? 1000 : false,
  });

export const importItemsQuery = (
  id: string,
  params: { kind?: ImportKind; type?: QuestionType; page?: number },
  refreshKey: string,
) =>
  queryOptions({
    queryKey: ['question-imports', 'items', id, params, refreshKey],
    queryFn: () =>
      apiFetch<PageResult<ImportItem>>(`/question-imports/${id}/items${queryString(params)}`),
    placeholderData: keepPreviousData,
  });

/** `topicId` đứng trước `file`: server đọc file theo luồng nên chỉ thấy các trường đứng trước nó. */
export function uploadQuestionImport(topicId: string, file: File) {
  const form = new FormData();
  form.append('topicId', topicId);
  form.append('file', file);
  return apiFetch<{ id: string; status: ImportStatus }>('/question-imports', {
    method: 'POST',
    body: form,
  });
}

export const selectImportItems = (
  id: string,
  selection: { itemIds: string[] } | { group: ImportGroup },
  selected: boolean,
) =>
  apiFetch<{ counts: ImportCounts }>(`/question-imports/${id}/items`, {
    method: 'PATCH',
    body: { ...selection, selected },
  });

export const cancelImport = (id: string) =>
  apiFetch<void>(`/question-imports/${id}`, { method: 'DELETE' });

export const commitImport = (id: string) =>
  apiFetch<{ id: string; status: ImportStatus }>(`/question-imports/${id}/commit`, {
    method: 'POST',
  });

export type ImportSelection = { itemIds: string[] } | { group: ImportGroup };

const touches = (item: ImportItem, selection: ImportSelection) =>
  item.kind !== 'error' &&
  ('group' in selection ? item.kind === selection.group : selection.itemIds.includes(item.id));

/** Cập nhật ngay trên màn hình trước khi server trả lời; server vẫn là nguồn đúng (Q146). */
export const applySelectionToItems = (
  items: ImportItem[],
  selection: ImportSelection,
  on: boolean,
): ImportItem[] =>
  items.map((item) => (touches(item, selection) ? { ...item, selected: on } : item));

/**
 * Số dòng đã chọn sau khi đổi. Theo nhóm thì tính từ tổng của nhóm (kể cả dòng ở trang khác);
 * theo id thì chỉ dòng đang nạp và thật sự đổi trạng thái mới làm đổi số.
 */
export function applySelectionToCounts(
  counts: ImportCounts,
  loaded: ImportItem[],
  selection: ImportSelection,
  on: boolean,
): ImportCounts {
  if ('group' in selection) {
    const key = selection.group === 'valid' ? 'selectedValid' : 'selectedDuplicate';
    const next = on ? counts[selection.group] : 0;
    return { ...counts, [key]: next, selected: counts.selected - counts[key] + next };
  }
  const next = { ...counts };
  for (const item of loaded) {
    if (!touches(item, selection) || item.selected === on) continue;
    const delta = on ? 1 : -1;
    next.selected += delta;
    if (item.kind === 'valid') next.selectedValid += delta;
    else next.selectedDuplicate += delta;
  }
  return next;
}
