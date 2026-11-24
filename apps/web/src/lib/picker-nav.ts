// Hộp "Thêm câu hỏi vào Bộ đề": duyệt "Chi tiết câu hỏi" bằng ‹ › trong trang đang xem, và Phần đích mặc định khi mở từ thanh dính.

/** Câu kế (`delta` 1) hoặc câu trước (`delta` -1) trong danh sách của trang; `null` ở biên hay khi câu không còn trong danh sách. */
export function pickerNeighbor(
  ids: readonly string[],
  currentId: string,
  delta: 1 | -1,
): string | null {
  const index = ids.indexOf(currentId);
  if (index < 0) return null;
  return ids[index + delta] ?? null;
}

/** Vị trí của câu trong danh sách (tính từ 1) và tổng số câu, để hiện "3/20"; `null` nếu câu không có trong danh sách. */
export function pickerPosition(
  ids: readonly string[],
  currentId: string,
): { index: number; total: number } | null {
  const index = ids.indexOf(currentId);
  return index < 0 ? null : { index: index + 1, total: ids.length };
}

/**
 * Phần đích mặc định khi bấm "Thêm câu hỏi" ở thanh dính: Phần đang xem. Phần đó không còn (đã xóa) thì lấy Phần gần nhất còn lại
 * (cuối nếu chỉ số quá lớn, đầu nếu âm); Bộ đề không có Phần nào thì `null`.
 */
export function defaultPickerSection(
  sections: readonly { key: string }[],
  viewingIndex: number,
): string | null {
  if (sections.length === 0) return null;
  const index = Math.min(Math.max(viewingIndex, 0), sections.length - 1);
  return (sections[index] as { key: string }).key;
}
