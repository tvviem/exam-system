import swc from 'unplugin-swc';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  plugins: [swc.vite()],
  test: {
    // Đọc apps/api/.env khi chạy trên máy; trên CI biến môi trường được đặt sẵn và được ưu tiên.
    env: { ...loadEnv(mode, process.cwd(), ''), ...process.env },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'integration', include: ['test/**/*.int.test.ts'], testTimeout: 15000 },
      },
    ],
  },
}));
