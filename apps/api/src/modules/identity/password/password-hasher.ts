import { hash, verify } from '@node-rs/argon2';
import { ApiError } from '../../../common/api-error';
import { GateFullError, hashGate } from './hash-gate';

// Thuật toán mặc định của @node-rs/argon2 là Argon2id; tham số theo OWASP.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Băm sẵn để so sánh khi không tìm thấy người dùng, giữ thời gian phản hồi như nhau. Tính một lần, ngoài cổng, để một lần
// bị từ chối vì bận không làm hỏng kết quả dùng chung.
let dummyHash: Promise<string> | undefined;

/** Mọi lần băm đi qua cổng giới hạn đồng thời; hàng đợi đầy thì báo `SERVER_BUSY` (503) thay vì làm cạn CPU. */
async function gated<T>(job: () => Promise<T>): Promise<T> {
  try {
    return await hashGate().run(job);
  } catch (error) {
    if (error instanceof GateFullError) throw new ApiError('SERVER_BUSY');
    throw error;
  }
}

export function hashPassword(password: string): Promise<string> {
  return gated(() => hash(password, OPTIONS));
}

export async function verifyPassword(
  passwordHash: string | null,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= hash('khong-ton-tai-nguoi-dung', OPTIONS);
    const dummy = await dummyHash;
    await gated(() => verify(dummy, password));
    return false;
  }
  return gated(() => verify(passwordHash, password));
}
