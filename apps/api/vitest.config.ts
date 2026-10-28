import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { testDatabaseUrl, testRedisUrl } from './test/test-env';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts'],
          globalSetup: ['test/global-setup.ts'],
          env: {
            NODE_ENV: 'test',
            LOG_LEVEL: 'warn',
            DATABASE_URL: testDatabaseUrl,
            REDIS_URL: testRedisUrl,
          },
          testTimeout: 15000,
        },
      },
    ],
  },
});
