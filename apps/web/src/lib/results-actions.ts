// Màn Kết quả của Người ra đề: nút nào là việc nên làm tiếp (docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md, U3).
// Chỉ MỘT nút được nhấn mạnh; các nút còn lại là nút phụ.

export type ResultsAction = 'grade' | 'release' | 'appeals';

export function primaryResultsAction(state: {
  pendingEssays: number;
  released: boolean;
  appealsOpen: number;
}): ResultsAction | null {
  if (state.released) return state.appealsOpen > 0 ? 'appeals' : null;
  return state.pendingEssays > 0 ? 'grade' : 'release';
}
