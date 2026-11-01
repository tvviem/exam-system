import type { ExamContent, QuestionType, RichText } from '@exam/shared';
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

export type { QuestionType };

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
