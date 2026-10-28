import type { roleTagEnum } from '../identity.schema';

export type RoleTag = (typeof roleTagEnum.enumValues)[number];

export interface AuthenticatedUser {
  id: string;
  username: string | null;
  email: string | null;
  code: string | null;
  fullName: string;
  isAdmin: boolean;
  tags: RoleTag[];
  mustChangePassword: boolean;
}

export const SESSION_COOKIE = 'exam_sid';
