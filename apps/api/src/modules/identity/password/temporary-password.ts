import { randomInt } from 'node:crypto';

// Bỏ các ký tự dễ nhầm khi đọc trên Phiếu tài khoản: 0/O/o, 1/l/I/i.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const TEMPORARY_PASSWORD_LENGTH = 10;
export const TEMPORARY_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateTemporaryPassword(): string {
  let result = '';
  for (let i = 0; i < TEMPORARY_PASSWORD_LENGTH; i++)
    result += ALPHABET[randomInt(ALPHABET.length)];
  return result;
}
