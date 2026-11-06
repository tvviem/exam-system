import { fromCenti, mulDivRound, toCenti } from './centi.js';

// Chấm tự động một Câu trả lời (docs/architecture.md mục 5.5; Q287–Q289). Hàm thuần: không I/O, không ném lỗi với dữ liệu lạ.

export type ScoringRule = 'proportional' | 'all_or_nothing' | 'ladder';

/** Một câu của Bộ đề đủ để chấm; `payload` lấy từ bản chụp (còn chứa Đáp án đúng nên không bao giờ gửi cho client). */
export interface ScoringItem {
  type: 'single_choice' | 'multiple_choice' | 'true_false_cluster' | 'essay';
  /** Điểm của câu trong Bộ đề. */
  points: number;
  payload: unknown;
}

/**
 * Đáp án đúng thay thế bản chụp (Đính chính đáp án, Q302): `string[]` cho câu chọn một/chọn nhiều (id Phương án đúng),
 * `Record<id, boolean>` cho chùm đúng/sai.
 */
export type KeyOverride = string[] | Record<string, boolean>;

/** `pending`: tự luận có nội dung, chờ chấm tay. `blank`: bỏ trống. */
export type Verdict = 'correct' | 'partial' | 'wrong' | 'blank' | 'pending';

export interface ScoredResponse {
  /** Điểm thập phân, đến 0,01; `null` khi `pending`. */
  score: number | null;
  verdict: Verdict;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null;

const idsOf = (list: unknown): Set<string> | null => {
  if (!Array.isArray(list)) return null;
  const ids = list.map((entry) => (isRecord(entry) ? entry.id : undefined));
  return ids.every((id) => typeof id === 'string') ? new Set(ids as string[]) : null;
};

const WRONG: ScoredResponse = { score: 0, verdict: 'wrong' };
const BLANK: ScoredResponse = { score: 0, verdict: 'blank' };

function result(earnedCenti: number, maxCenti: number): ScoredResponse {
  const score = Math.min(Math.max(earnedCenti, 0), maxCenti);
  const verdict: Verdict = score === maxCenti ? 'correct' : score === 0 ? 'wrong' : 'partial';
  return { score: fromCenti(score), verdict };
}

function choiceKey(payload: Record<string, unknown>, override?: KeyOverride): string[] | null {
  if (override !== undefined) return strings(override);
  return strings(payload.key);
}

function scoreSingle(
  payload: Record<string, unknown>,
  value: unknown,
  maxC: number,
  override?: KeyOverride,
): ScoredResponse {
  const key = choiceKey(payload, override);
  if (key?.length !== 1) return WRONG;
  if (value === null || value === undefined) return BLANK;
  if (!isRecord(value) || typeof value.optionId !== 'string') return WRONG;
  const options = idsOf(payload.options);
  if (options && !options.has(value.optionId)) return WRONG;
  return result(value.optionId === key[0] ? maxC : 0, maxC);
}

function scoreMultiple(
  payload: Record<string, unknown>,
  value: unknown,
  maxC: number,
  override?: KeyOverride,
): ScoredResponse {
  const key = choiceKey(payload, override);
  if (!key || key.length === 0) return WRONG;
  if (value === null || value === undefined) return BLANK;
  const chosen = isRecord(value) ? strings(value.optionIds) : null;
  if (!chosen || new Set(chosen).size !== chosen.length) return WRONG;
  const options = idsOf(payload.options);
  if (options && !chosen.every((id) => options.has(id))) return WRONG;
  if (chosen.length === 0) return BLANK;
  const keySet = new Set(key);
  const right = chosen.filter((id) => keySet.has(id)).length;
  const wrong = chosen.length - right;
  if (payload.scoringRule === 'all_or_nothing') {
    return result(right === key.length && wrong === 0 ? maxC : 0, maxC);
  }
  // Tỷ lệ: mỗi Phương án sai chọn thừa triệt tiêu một Phương án đúng, thấp nhất 0.
  return result(mulDivRound(maxC, Math.max(0, right - wrong), key.length), maxC);
}

function clusterKey(
  payload: Record<string, unknown>,
  override?: KeyOverride,
): Map<string, boolean> | null {
  if (override !== undefined) {
    if (!isRecord(override)) return null;
    const entries = Object.entries(override);
    return entries.every(([, v]) => typeof v === 'boolean') && entries.length > 0
      ? new Map(entries as [string, boolean][])
      : null;
  }
  if (!Array.isArray(payload.statements) || payload.statements.length === 0) return null;
  const map = new Map<string, boolean>();
  for (const statement of payload.statements) {
    if (!isRecord(statement) || typeof statement.id !== 'string') return null;
    if (typeof statement.key !== 'boolean') return null;
    map.set(statement.id, statement.key);
  }
  return map;
}

function scoreCluster(
  payload: Record<string, unknown>,
  value: unknown,
  maxC: number,
  override?: KeyOverride,
): ScoredResponse {
  const key = clusterKey(payload, override);
  if (!key) return WRONG;
  if (value === null || value === undefined) return BLANK;
  if (!isRecord(value) || !isRecord(value.answers)) return WRONG;
  const answers = Object.entries(value.answers);
  if (!answers.every(([id, v]) => key.has(id) && typeof v === 'boolean')) return WRONG;
  if (answers.length === 0) return BLANK;
  // Mệnh đề để trống tính là không đúng.
  const given = value.answers;
  const correct = [...key].filter(([id, expected]) => given[id] === expected).length;
  const total = key.size;
  switch (payload.scoringRule) {
    case 'all_or_nothing':
      return result(correct === total ? maxC : 0, maxC);
    case 'ladder': {
      const ladder = payload.ladder;
      if (!Array.isArray(ladder) || ladder.length !== total + 1) return WRONG;
      const rate = ladder[correct];
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1) return WRONG;
      // Tỷ lệ của bảng là số thập phân đến 4 chữ số; đổi sang số nguyên (đơn vị 0,0001) để chia chính xác.
      return result(mulDivRound(maxC, Math.round(rate * 10_000), 10_000), maxC);
    }
    default:
      return result(mulDivRound(maxC, correct, total), maxC);
  }
}

function scoreEssay(value: unknown): ScoredResponse {
  const text = isRecord(value) && typeof value.text === 'string' ? value.text : '';
  // Chỉ khoảng trắng cũng là bỏ trống (Q288): tự được 0 điểm, không vào hàng đợi chấm tay.
  return text.trim() === '' ? BLANK : { score: null, verdict: 'pending' };
}

export function scoreResponse(
  item: ScoringItem,
  value: unknown,
  keyOverride?: KeyOverride,
): ScoredResponse {
  const maxC = toCenti(item.points);
  const payload = isRecord(item.payload) ? item.payload : {};
  switch (item.type) {
    case 'single_choice':
      return scoreSingle(payload, value, maxC, keyOverride);
    case 'multiple_choice':
      return scoreMultiple(payload, value, maxC, keyOverride);
    case 'true_false_cluster':
      return scoreCluster(payload, value, maxC, keyOverride);
    case 'essay':
      return scoreEssay(value);
  }
}
