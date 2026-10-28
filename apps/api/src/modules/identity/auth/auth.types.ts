export interface AuthenticatedUser {
  id: string;
  username: string | null;
  email: string | null;
  code: string | null;
  fullName: string;
  isAdmin: boolean;
  tags: ('examiner' | 'candidate')[];
  mustChangePassword: boolean;
}

export const SESSION_COOKIE = 'exam_sid';
