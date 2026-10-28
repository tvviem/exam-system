import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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
