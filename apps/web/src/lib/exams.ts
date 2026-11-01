import type { CandidateView, ExamContent, RichText } from '@exam/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';
import type { DraftQuestion } from './exam-draft';
import { queryString } from './query-string';

// Bộ đề (docs/plan/slice-3.md, Q160–Q165, Q180).

export type ExamStatus = 'draft' | 'published' | 'archived';
export const EXAM_STATUSES: ExamStatus[] = ['draft', 'published', 'archived'];

export interface ExamListItem {
  id: string;
  title: string;
  status: ExamStatus;
  publishedAt: string | null;
  updatedAt: string;
  itemCount: number;
  totalPoints: number;
}

export interface ExamDetail {
  id: string;
  title: string;
  instructions: RichText;
  status: ExamStatus;
  version: number;
  publishedAt: string | null;
  updatedAt: string;
  sections: {
    id: string;
    title: string | null;
    instructions: RichText;
    items: { questionId: string; points: number; question: DraftQuestion }[];
  }[];
  totals: { items: number; points: number };
}

export interface ExamListParams {
  /** Không nêu: Nháp và Đã phát hành (Q180). */
  status?: ExamStatus;
  q?: string;
  page?: number;
}

export const examsQuery = (params: ExamListParams) =>
  queryOptions({
    queryKey: ['exams', 'list', params],
    queryFn: () => apiFetch<PageResult<ExamListItem>>(`/exams${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });

export const examQuery = (id: string) =>
  queryOptions({
    queryKey: ['exams', 'detail', id],
    queryFn: () => apiFetch<ExamDetail>(`/exams/${id}`),
  });

export const createExam = (title: string) =>
  apiFetch<ExamDetail>('/exams', { method: 'POST', body: { title } });

export const saveExam = (id: string, content: ExamContent) =>
  apiFetch<ExamDetail>(`/exams/${id}`, { method: 'PUT', body: content });

export const deleteExam = (id: string) => apiFetch<null>(`/exams/${id}`, { method: 'DELETE' });

export interface ExamPreview {
  id: string;
  title: string;
  instructions: RichText;
  status: ExamStatus;
  showScoringRules: boolean;
  sections: {
    id: string;
    title: string | null;
    instructions: RichText;
    items: { number: number; questionId: string; points: number; question: CandidateView }[];
  }[];
  totals: { items: number; points: number };
}

/** Xem thử do server làm sạch (không có Đáp án); công tắc quy tắc chấm không được lưu (Q170). */
export const examPreviewQuery = (id: string, showScoringRules: boolean) =>
  queryOptions({
    queryKey: ['exams', 'preview', id, showScoringRules],
    queryFn: () =>
      apiFetch<ExamPreview>(
        `/exams/${id}/preview${queryString({ showScoringRules: String(showScoringRules) })}`,
      ),
  });

export type PublishProblemCode =
  | 'title_missing'
  | 'empty_exam'
  | 'empty_section'
  | 'question_archived'
  | 'question_invalid'
  | 'illustration_not_ready'
  | 'points_invalid';

export interface PublishProblem {
  code: PublishProblemCode;
  questionId?: string;
  sectionId?: string;
}

/** Chỉ để hiện cho người dùng; `publishExam` chạy lại cùng phép kiểm trên server (Q171). */
export const publishCheckQuery = (id: string) =>
  queryOptions({
    queryKey: ['exams', 'publish-check', id],
    queryFn: () => apiFetch<{ problems: PublishProblem[] }>(`/exams/${id}/publish-check`),
  });

export const publishExam = (id: string, version: number) =>
  apiFetch<{ id: string }>(`/exams/${id}/publish`, { method: 'POST', body: { version } });
export const duplicateExam = (id: string) =>
  apiFetch<{ id: string }>(`/exams/${id}/duplicate`, { method: 'POST' });
export const archiveExam = (id: string) =>
  apiFetch<{ id: string }>(`/exams/${id}/archive`, { method: 'POST' });
export const restoreExam = (id: string) =>
  apiFetch<{ id: string }>(`/exams/${id}/restore`, { method: 'POST' });
