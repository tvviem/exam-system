import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Mã hóa AES-256-GCM cho file Phiếu tài khoản (Q93). Định dạng: [phiên bản 1 byte][IV 12][tag 16][mã hóa].
 * Khóa nằm trong env file, tách khỏi cả DB lẫn volume: chỉ lộ một trong hai thì không đọc được phiếu.
 */
@Injectable()
export class SlipVault {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Pick<Env, 'SLIP_ENCRYPTION_KEY'>) {
    this.key = Buffer.from(env.SLIP_ENCRYPTION_KEY, 'base64');
    if (this.key.length !== 32) throw new Error('SLIP_ENCRYPTION_KEY phải là 32 byte');
  }

  encrypt(plain: Buffer): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
  }

  /** Ném lỗi nếu sai khóa hoặc nội dung đã bị sửa. */
  decrypt(sealed: Buffer): Buffer {
    if (sealed.length < 1 + IV_BYTES + TAG_BYTES || sealed[0] !== VERSION) {
      throw new Error('File phiếu không đúng định dạng');
    }
    const iv = sealed.subarray(1, 1 + IV_BYTES);
    const tag = sealed.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(sealed.subarray(1 + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
  }
}
