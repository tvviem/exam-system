import { hash, verify } from '@node-rs/argon2';

// Thuật toán mặc định của @node-rs/argon2 là Argon2id; tham số theo OWASP.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Băm sẵn để so sánh khi không tìm thấy người dùng, giữ thời gian phản hồi như nhau.
let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(
  passwordHash: string | null,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= hash('khong-ton-tai-nguoi-dung', OPTIONS);
    await verify(await dummyHash, password);
    return false;
  }
  return verify(passwordHash, password);
}
