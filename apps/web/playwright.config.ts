import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Nhiều luồng dài (dựng phòng, vài người đăng nhập) mất 20–35 giây khi máy bận: giới hạn mặc định 30 giây làm bài đỏ oan.
  // Ngân sách phản hồi không nằm ở đây mà ở từng khẳng định thời gian trong bài.
  timeout: 60_000,
  // Trên máy phát triển, 8 luồng song song (mặc định ở máy 16 nhân) làm các khẳng định "dưới 0,5–2 giây" đỏ vì tranh CPU,
  // nhất là khi máy còn chạy prod. CI giữ mặc định theo số nhân của runner.
  workers: process.env.CI ? undefined : 4,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // api riêng cho E2E (database exam_e2e, Redis DB 14), cần `pnpm build` trước.
      command: 'node e2e/prepare-api.cjs',
      url: 'http://localhost:3100/api/health',
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
