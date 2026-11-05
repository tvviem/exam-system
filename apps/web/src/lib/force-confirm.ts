import { UNDO_WATCH_MS } from '@exam/shared';
import { remainingSecondsAt } from './monitor-view';

// Hàm thuần của thang bảo vệ Buộc nộp (Q277, Q278): điều phải gõ lại để xác nhận và đếm lùi cửa sổ Hoàn tác.

export interface ForceTarget {
  fullName: string;
  code: string | null;
}

/**
 * Điều Người ra đề phải gõ lại trước khi Buộc nộp: một người thì Mã định danh của họ (không có mã thì họ tên), nhóm hay cả
 * phòng thì số người. Gõ lại buộc người thao tác nhìn vào đúng đối tượng thay vì bấm theo quán tính.
 */
export function confirmPhraseOf(targets: readonly ForceTarget[], scope: 'one' | 'group' | 'all') {
  const [only] = targets;
  if (scope === 'one' && only) return only.code ?? only.fullName;
  return String(targets.length);
}

const fold = (text: string) => text.normalize('NFC').trim().toLocaleLowerCase('vi');

/** Khớp không phân biệt hoa thường, bỏ khoảng trắng hai đầu, chữ Việt gõ dạng tổ hợp hay dựng sẵn đều được. */
export const confirmMatches = (typed: string, phrase: string) =>
  typed.trim() !== '' && fold(typed) === fold(phrase);

/** Giây còn lại của cửa sổ Hoàn tác theo giờ server lúc nhận ảnh chụp cộng thời gian đã trôi (đồng hồ đơn điệu). */
export const undoSecondsLeft = (undoUntil: string | null, serverNow: string, elapsedMs: number) =>
  remainingSecondsAt(undoUntil, serverNow, elapsedMs);

/** Mốc hết hạn Hoàn tác sớm nhất trong số những người còn hoàn tác được; `null` nếu không ai. */
export function undoUntilOfEarliest(
  people: readonly { undoUntil: string | null }[],
): string | null {
  let earliest: string | null = null;
  for (const { undoUntil } of people) {
    if (undoUntil && (earliest === null || Date.parse(undoUntil) < Date.parse(earliest))) {
      earliest = undoUntil;
    }
  }
  return earliest;
}

/**
 * Màn "Đã nộp" của Người dự thi còn theo dõi việc Hoàn tác trong bao nhiêu mili giây (Q279): 15 phút kể từ lúc bị Buộc nộp, tính theo
 * giờ server lúc nhận trạng thái cộng thời gian đã trôi (đồng hồ đơn điệu). Lý do nộp khác (hết giờ, tự nộp, Đình chỉ, khóa, Hủy)
 * thì không theo dõi.
 */
export function reopenWatchLeftMs(
  submittedAt: string | null,
  reason: string | null,
  serverNow: string,
  elapsedMs: number,
): number {
  if (reason !== 'examiner' || submittedAt === null) return 0;
  const left = Date.parse(submittedAt) + UNDO_WATCH_MS - Date.parse(serverNow) - elapsedMs;
  return Math.max(0, left);
}
