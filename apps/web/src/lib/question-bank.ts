import type { QuestionInput, QuestionType, RichText } from '@exam/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';
import { queryString } from './query-string';

export type { QuestionType } from '@exam/shared';
export { QUESTION_TYPES } from '@exam/shared';

export interface Topic {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  questionCount?: number;
}

export interface QuestionListItem {
  id: string;
  topicId: string;
  topicName: string;
  type: QuestionType;
  preview: string;
  defaultPoints: number;
  tags: string[];
  version: number;
  updatedAt: string;
  archivedAt: string | null;
  /** Dùng ở Bộ đề nào (Q174): số Bộ đề nháp và số Bộ đề đã Phát hành hoặc Lưu trữ. */
  usage: { draftCount: number; publishedCount: number };
}

export type Question = QuestionInput & {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  usage: { draftExams: { id: string; title: string }[]; publishedCount: number };
};

export interface QuestionListParams {
  q?: string;
  topicId?: string;
  type?: QuestionType;
  tag?: string;
  /** Chỉ hiện câu đã Lưu trữ (Q174). */
  archived?: boolean;
  page?: number;
}

export const topicsQuery = (includeArchived = false) =>
  queryOptions({
    queryKey: ['topics', { includeArchived }],
    queryFn: () => apiFetch<Topic[]>(`/topics${includeArchived ? '?includeArchived=true' : ''}`),
  });

export const questionsQuery = (params: QuestionListParams) =>
  queryOptions({
    queryKey: ['questions', 'list', params],
    queryFn: () =>
      apiFetch<PageResult<QuestionListItem>>(
        `/questions${queryString({ ...params, archived: params.archived ? 'true' : undefined })}`,
      ),
    placeholderData: keepPreviousData,
  });

export const questionQuery = (id: string) =>
  queryOptions({
    queryKey: ['questions', 'detail', id],
    queryFn: () => apiFetch<Question>(`/questions/${id}`),
  });

export const createTopic = (input: { name: string; description?: string }) =>
  apiFetch<Topic>('/topics', { method: 'POST', body: input });
export const updateTopic = (id: string, input: { name?: string; description?: string }) =>
  apiFetch<Topic>(`/topics/${id}`, { method: 'PATCH', body: input });
export const deleteTopic = (id: string) => apiFetch<null>(`/topics/${id}`, { method: 'DELETE' });
export const archiveTopic = (id: string) =>
  apiFetch<Topic>(`/topics/${id}/archive`, { method: 'POST' });
export const restoreTopic = (id: string) =>
  apiFetch<Topic>(`/topics/${id}/restore`, { method: 'POST' });

export const createQuestion = (input: QuestionInput) =>
  apiFetch<Question>('/questions', { method: 'POST', body: input });
export const updateQuestion = (id: string, input: QuestionInput, version: number) =>
  apiFetch<Question>(`/questions/${id}`, { method: 'PUT', body: { ...input, version } });
export const duplicateQuestion = (id: string) =>
  apiFetch<Question>(`/questions/${id}/duplicate`, { method: 'POST' });
export const moveQuestions = (ids: string[], topicId: string) =>
  apiFetch<{ moved: number }>('/questions/move', { method: 'POST', body: { ids, topicId } });
export const deleteQuestions = (ids: string[]) =>
  apiFetch<{ deleted: number }>('/questions/delete', { method: 'POST', body: { ids } });

export type { RichText };

export const archiveQuestions = (ids: string[]) =>
  apiFetch<{ updated: number }>('/questions/archive', { method: 'POST', body: { ids } });
export const restoreQuestions = (ids: string[]) =>
  apiFetch<{ updated: number }>('/questions/restore', { method: 'POST', body: { ids } });

/** Số Bộ đề (nháp, đã Phát hành, Lưu trữ) đang chứa Câu hỏi này. */
export const examCountOf = (item: Pick<QuestionListItem, 'usage'>) =>
  item.usage.draftCount + item.usage.publishedCount;
