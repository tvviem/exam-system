import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { RoleTag } from './auth';

export type EditableField =
  | 'fullName'
  | 'dateOfBirth'
  | 'gender'
  | 'academicDegree'
  | 'academicTitle';

export const GENDERS = ['male', 'female', 'other'] as const;
export const ACADEMIC_DEGREES = [
  'bachelor',
  'engineer',
  'master',
  'doctor',
  'doctor_of_science',
] as const;
export const ACADEMIC_TITLES = ['associate_professor', 'professor'] as const;

export interface Account {
  id: string;
  fullName: string;
  username: string | null;
  email: string | null;
  code: string | null;
  classLabel: string | null;
  dateOfBirth: string | null;
  gender: (typeof GENDERS)[number] | null;
  isAdmin: boolean;
  roleTags: RoleTag[];
  examinerProfile: {
    academicDegree: (typeof ACADEMIC_DEGREES)[number] | null;
    academicTitle: (typeof ACADEMIC_TITLES)[number] | null;
    unitName: string | null;
  } | null;
  /** Các trường người dùng được tự sửa theo vai trò (Q133). */
  editable: EditableField[];
}

export type AccountChanges = Partial<{
  fullName: string;
  dateOfBirth: string | null;
  gender: Account['gender'];
  academicDegree: (typeof ACADEMIC_DEGREES)[number] | null;
  academicTitle: (typeof ACADEMIC_TITLES)[number] | null;
}>;

export const accountQuery = queryOptions({
  queryKey: ['account'],
  queryFn: () => apiFetch<Account>('/account'),
});

export const updateAccount = (changes: AccountChanges) =>
  apiFetch<Account>('/account', { method: 'PATCH', body: changes });
