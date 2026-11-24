import { describe, expect, it } from 'vitest';
import { defaultPickerSection, pickerNeighbor, pickerPosition } from './picker-nav';

// Hộp "Thêm câu hỏi vào Bộ đề": duyệt "Chi tiết câu hỏi" bằng ‹ › trong trang đang xem, và Phần đích mặc định khi mở từ thanh dính.

describe('pickerNeighbor: câu kế hoặc câu trước trong danh sách của trang', () => {
  const ids = ['a', 'b', 'c'];
  it('đi tới và lùi một câu', () => {
    expect(pickerNeighbor(ids, 'a', 1)).toBe('b');
    expect(pickerNeighbor(ids, 'b', 1)).toBe('c');
    expect(pickerNeighbor(ids, 'c', -1)).toBe('b');
    expect(pickerNeighbor(ids, 'b', -1)).toBe('a');
  });
  it('không vượt biên: câu đầu không lùi được, câu cuối không tiến được (null)', () => {
    expect(pickerNeighbor(ids, 'a', -1)).toBeNull();
    expect(pickerNeighbor(ids, 'c', 1)).toBeNull();
  });
  it('câu không có trong danh sách (danh sách đổi sau khi mở) hay danh sách rỗng thì null', () => {
    expect(pickerNeighbor(ids, 'z', 1)).toBeNull();
    expect(pickerNeighbor([], 'a', 1)).toBeNull();
  });
});

describe('pickerPosition: "3/20"', () => {
  it('vị trí tính từ 1 và tổng số câu của trang', () => {
    expect(pickerPosition(['a', 'b', 'c'], 'b')).toEqual({ index: 2, total: 3 });
    expect(pickerPosition(['a'], 'a')).toEqual({ index: 1, total: 1 });
  });
  it('câu không có trong danh sách thì null', () => {
    expect(pickerPosition(['a', 'b'], 'z')).toBeNull();
    expect(pickerPosition([], 'a')).toBeNull();
  });
});

describe('defaultPickerSection: Phần đích mặc định khi mở từ thanh dính', () => {
  const sections = [{ key: 'p1' }, { key: 'p2' }, { key: 'p3' }];
  it('là Phần đang xem', () => {
    expect(defaultPickerSection(sections, 0)).toBe('p1');
    expect(defaultPickerSection(sections, 2)).toBe('p3');
  });
  it('Phần đang xem không còn (đã xóa Phần cuối) thì lấy Phần cuối còn lại; chỉ số âm thì Phần đầu', () => {
    expect(defaultPickerSection(sections, 7)).toBe('p3');
    expect(defaultPickerSection(sections, -1)).toBe('p1');
  });
  it('Bộ đề không có Phần nào thì null', () => {
    expect(defaultPickerSection([], 0)).toBeNull();
  });
});
