import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const MEDIA_STORE = Symbol('MEDIA_STORE');

/** Nơi lưu file (tải lên tạm, Phiếu tài khoản, sau này là ảnh). Hiện dùng thư mục trên volume (ADR-0006). */
export interface MediaStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Xóa nếu có; không có thì bỏ qua. */
  delete(key: string): Promise<void>;
}

// Khóa chỉ gồm chữ thường, số, `/`, `_`, `-`, `.` và không có đoạn `..`: không thoát được khỏi thư mục gốc.
const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]*$/;

@Injectable()
export class FileSystemMediaStore implements MediaStore {
  private readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = path.resolve(env.MEDIA_DIR);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.pathOf(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data, { mode: 0o600 });
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key));
  }

  delete(key: string): Promise<void> {
    return rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    if (!KEY_PATTERN.test(key) || key.split('/').includes('..')) {
      throw new Error(`Khóa MediaStore không hợp lệ: ${key}`);
    }
    return path.join(this.root, key);
  }
}

@Global()
@Module({
  providers: [{ provide: MEDIA_STORE, useClass: FileSystemMediaStore }],
  exports: [MEDIA_STORE],
})
export class MediaModule {}
