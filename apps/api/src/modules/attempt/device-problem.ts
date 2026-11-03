import { hashDeviceKey } from './device-key';

/** Lý do thiết bị không dùng được cho Phiên thi này, hoặc `null` nếu thiết bị đang gắn đúng (ADR-0007). */
export function deviceProblem(
  rows: { status: 'active' | 'revoked'; deviceHash: string }[],
  key: string | undefined,
): 'DEVICE_REVOKED' | 'DEVICE_BOUND_ELSEWHERE' | 'NOT_JOINED' | null {
  const hash = key ? hashDeviceKey(key) : undefined;
  const mine = rows.find((row) => row.deviceHash === hash);
  if (mine?.status === 'active') return null;
  if (mine?.status === 'revoked') return 'DEVICE_REVOKED';
  return rows.some((row) => row.status === 'active') ? 'DEVICE_BOUND_ELSEWHERE' : 'NOT_JOINED';
}
