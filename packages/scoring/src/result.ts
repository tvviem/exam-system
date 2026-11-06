import { fromCenti, mulDivRound, toCenti } from './centi.js';

// Kết quả của một Người dự thi trong Phiên thi (Q287, Q295): chọn Lượt được tính, áp Mức xử lý, quy về thang 10.

export interface AttemptScore {
  attemptId: string;
  attemptNo: number;
  /** Điểm thô của Lượt (tổng điểm các câu, đến 0,01). */
  rawScore: number;
  /** Tổng điểm của Bộ đề. */
  maxScore: number;
}

export interface PenaltyInput {
  type: 'none' | 'percent' | 'void';
  /** Phần trăm trừ (0..100, đến 0,01) khi `type = 'percent'`. */
  percent?: number | null;
}

export interface CandidateResult {
  /** Lượt được tính (cao nhất, hoặc cuối). */
  countedAttemptId: string;
  rawScore: number;
  maxScore: number;
  /** Tổng phần trăm bị trừ đã giới hạn ở 100. */
  penaltyPercent: number;
  /** Có Mức xử lý Hủy kết quả. */
  voided: boolean;
  /** Điểm thô sau Mức xử lý. */
  finalScore: number;
  /** Điểm quy đổi thang 10, làm tròn đến 0,1. */
  scaledScore: number;
}

/**
 * `highest`: Lượt có điểm thô cao nhất (bằng nhau thì lấy Lượt đầu); `latest`: Lượt có số thứ tự lớn nhất. Không có Lượt nào
 * thì `null`. Hủy kết quả cho 0 và ghi `voided`.
 */
export function resultOf(input: {
  attempts: readonly AttemptScore[];
  attemptScoring: 'highest' | 'latest';
  penalties: readonly PenaltyInput[];
}): CandidateResult | null {
  const ordered = [...input.attempts].sort((a, b) => a.attemptNo - b.attemptNo);
  if (ordered.length === 0) return null;
  const counted =
    input.attemptScoring === 'latest'
      ? (ordered[ordered.length - 1] as AttemptScore)
      : ordered.reduce((best, a) => (toCenti(a.rawScore) > toCenti(best.rawScore) ? a : best));
  const baseC = toCenti(counted.rawScore);
  const maxC = toCenti(counted.maxScore);
  const voided = input.penalties.some((p) => p.type === 'void');
  // Phần trăm tính bằng đơn vị 0,01 % để cộng dồn chính xác.
  const percentBp = Math.min(
    10_000,
    input.penalties.reduce(
      (sum, p) => sum + (p.type === 'percent' ? toCenti(p.percent ?? 0) : 0),
      0,
    ),
  );
  const finalC = voided ? 0 : mulDivRound(baseC, 10_000 - percentBp, 10_000);
  // Điểm quy đổi tính theo phần mười: final / max × 10 = (final × 100 / max) phần mười.
  const tenths = maxC === 0 ? 0 : mulDivRound(finalC, 100, maxC);
  return {
    countedAttemptId: counted.attemptId,
    rawScore: counted.rawScore,
    maxScore: counted.maxScore,
    penaltyPercent: fromCenti(percentBp),
    voided,
    finalScore: fromCenti(finalC),
    scaledScore: tenths / 10,
  };
}
