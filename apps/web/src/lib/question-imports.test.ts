import { describe, expect, it } from 'vitest';
import {
  applySelectionToCounts,
  applySelectionToItems,
  type ImportCounts,
  type ImportItem,
  parseErrorOf,
} from './question-imports';

const item = (id: string, kind: ImportItem['kind'], selected: boolean): ImportItem => ({
  id,
  rowNumber: Number(id.replace('i', '')),
  kind,
  errorCode: kind === 'error' ? 'answer_mismatch' : null,
  duplicateOfQuestionId: null,
  duplicateOfRow: null,
  duplicateOfType: null,
  selected,
  outcome: 'pending',
  type: 'single_choice',
  stem: null,
  payload: null,
  defaultPoints: null,
  tags: null,
});

const counts: ImportCounts = {
  valid: 4,
  duplicate: 2,
  error: 1,
  selected: 5,
  selectedValid: 4,
  selectedDuplicate: 1,
};

describe('applySelectionToItems', () => {
  const items = [
    item('i2', 'valid', true),
    item('i3', 'duplicate', false),
    item('i4', 'error', false),
  ];

  it('theo id: chỉ đổi dòng được nêu', () => {
    const next = applySelectionToItems(items, { itemIds: ['i2'] }, false);
    expect(next.map((i) => i.selected)).toEqual([false, false, false]);
  });

  it('theo nhóm: đổi mọi dòng của nhóm đó, không đụng dòng lỗi', () => {
    expect(
      applySelectionToItems(items, { group: 'duplicate' }, true).map((i) => i.selected),
    ).toEqual([true, true, false]);
  });

  it('không chọn được dòng lỗi dù nêu id', () => {
    expect(applySelectionToItems(items, { itemIds: ['i4'] }, true)[2]?.selected).toBe(false);
  });
});

describe('applySelectionToCounts', () => {
  const items = [
    item('i2', 'valid', true),
    item('i3', 'duplicate', false),
    item('i4', 'error', false),
  ];

  it('theo id: cộng trừ theo loại của từng dòng thật sự đổi trạng thái', () => {
    expect(applySelectionToCounts(counts, items, { itemIds: ['i2', 'i3'] }, false)).toEqual({
      ...counts,
      selected: 4,
      selectedValid: 3,
    });
    expect(applySelectionToCounts(counts, items, { itemIds: ['i3'] }, true)).toEqual({
      ...counts,
      selected: 6,
      selectedDuplicate: 2,
    });
  });

  it('theo nhóm: đặt số đã chọn của nhóm bằng 0 hoặc bằng cả nhóm, kể cả dòng ở trang khác', () => {
    expect(applySelectionToCounts(counts, items, { group: 'valid' }, false)).toEqual({
      ...counts,
      selected: 1,
      selectedValid: 0,
    });
    expect(applySelectionToCounts(counts, items, { group: 'duplicate' }, true)).toEqual({
      ...counts,
      selected: 6,
      selectedDuplicate: 2,
    });
  });
});

describe('mã lỗi đọc file kèm tên sheet (Q156)', () => {
  it('tách mã và tên sheet ở dấu hai chấm đầu tiên', () => {
    expect(parseErrorOf('missing_columns:Chọn một')).toEqual({
      code: 'missing_columns',
      sheet: 'Chọn một',
    });
    expect(parseErrorOf('unknown_sheet:Câu hỏi: lớp 10')).toEqual({
      code: 'unknown_sheet',
      sheet: 'Câu hỏi: lớp 10',
    });
  });

  it('mã không kèm sheet và giá trị rỗng', () => {
    expect(parseErrorOf('empty_file')).toEqual({ code: 'empty_file', sheet: '' });
    expect(parseErrorOf(null)).toEqual({ code: 'internal_error', sheet: '' });
  });
});
