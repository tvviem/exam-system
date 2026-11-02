import { createHash, randomBytes } from 'node:crypto';

/** Cookie mã thiết bị (ADR-0007): 128 bit ngẫu nhiên, server chỉ giữ bản băm SHA-256. */
export const DEVICE_COOKIE = 'exam_did';
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export const generateDeviceKey = (): string => randomBytes(16).toString('base64url');

export const hashDeviceKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex');
