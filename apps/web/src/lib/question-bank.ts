import type { QuestionInput, QuestionType, RichText } from '@exam/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';

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
}

export type Question = QuestionInput & {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export interface QuestionListParams {
  q?: string;
  topicId?: string;
  type?: QuestionType;
  tag?: string;
  page?: number;
}

const queryString = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const topicsQuery = (includeArchived = false) =>
  queryOptions({
    queryKey: ['topics', { includeArchived }],
    queryFn: () => apiFetch<Topic[]>(`/topics${includeArchived ? '?includeArchived=true' : ''}`),
  });

export const questionsQuery = (params: QuestionListParams) =>
  queryOptions({
    queryKey: ['questions', 'list', params],
    queryFn: () =>
      apiFetch<PageResult<QuestionListItem>>(`/questions${queryString({ ...params })}`),
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
