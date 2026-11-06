// Các hàm chấm thuần (pure) của lát cắt 5: docs/architecture.md mục 5.5, docs/plan/slice-5.md. Không phụ thuộc gói nào.
export { fromCenti, mulDivRound, toCenti } from './centi.js';
export {
  type AttemptScore,
  type CandidateResult,
  type PenaltyInput,
  resultOf,
} from './result.js';
export {
  type KeyOverride,
  type ScoredResponse,
  type ScoringItem,
  type ScoringRule,
  scoreResponse,
  type Verdict,
} from './score-response.js';
