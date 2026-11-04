import type { MonitorPerson } from './monitor';

export type { MonitorPerson } from './monitor';

// Hàm thuần của màn Theo dõi: chế độ xem mặc định, giờ còn lại, lọc và đếm (Q252, Q253).

export type MonitorView = 'cards' | 'table' | 'grid';

/** Q253: chế độ mặc định theo số người trong Danh sách dự thi. */
export const defaultViewFor = (count: number): MonitorView =>
  count <= 30 ? 'cards' : count <= 150 ? 'table' : 'grid';

/**
 * Giây còn lại đến `deadline`, tính từ giờ server lúc nhận ảnh chụp cộng thời gian đã trôi trên máy (đồng hồ đơn điệu),
 * nên đổi giờ máy cũng không làm lệch. `null` nếu chưa có hạn.
 */
export function remainingSecondsAt(
  deadline: string | null,
  serverNow: string,
  elapsedMs: number,
): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.floor((Date.parse(deadline) - Date.parse(serverNow) - elapsedMs) / 1000));
}

export const isLive = (person: MonitorPerson) =>
  person.state === 'working' || person.state === 'disconnected';

export interface Counts {
  working: number;
  submitted: number;
  disconnected: number;
  not_started: number;
  violations: number;
}

export type FilterKey = keyof Counts | 'attention';

export function countsOf(people: readonly MonitorPerson[]): Counts {
  const counts: Counts = {
    working: 0,
    submitted: 0,
    disconnected: 0,
    not_started: 0,
    violations: 0,
  };
  for (const person of people) {
    if (person.state === 'working') counts.working++;
    else if (person.state === 'submitted') counts.submitted++;
    else if (person.state === 'disconnected') counts.disconnected++;
    else if (person.state === 'not_started') counts.not_started++;
    if (person.warnings > 0 || person.state === 'suspended') counts.violations++;
  }
  return counts;
}

export function matchesFilter(person: MonitorPerson, key: FilterKey): boolean {
  switch (key) {
    case 'working':
      return person.state === 'working';
    case 'submitted':
      return person.state === 'submitted';
    case 'disconnected':
      return person.state === 'disconnected';
    case 'not_started':
      return person.state === 'not_started';
    case 'violations':
      return person.warnings > 0 || person.state === 'suspended';
    case 'attention':
      return isLive(person) && person.reasons.length > 0;
  }
}

/** Bỏ dấu và hoa thường để tìm "nguyet" ra "Nguyệt". */
export const foldText = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
