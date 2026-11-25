import { defineConfig, devices } from '@playwright/test';

// Chụp ảnh cho tài liệu hướng dẫn sử dụng (docs/huong-dan/tai-lieu). Không chạy trong CI: dùng riêng bộ người dùng mẫu
// (guide/users.json) trên database E2E, tuần tự từng bước theo một kịch bản. Chạy: `pnpm guide:shots` (xem tools/huong-dan/README.md).

const baseURL = 'http://localhost:4173';

export default defineConfig({
  testDir: './guide',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    actionTimeout: 20_000,
  },
  webServer: [
    {
      command: 'node e2e/prepare-api.cjs',
      url: 'http://localhost:3100/api/health',
      env: { E2E_USERS_FILE: './guide/users.json' },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm build && pnpm preview',
      url: baseURL,
      env: { API_URL: 'http://localhost:3100' },
      reuseExistingServer: false,
    },
  ],
});
