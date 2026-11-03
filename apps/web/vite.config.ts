import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Điền mã bản dựng vào `sw.js` (băm danh sách file trong /assets): mỗi bản dựng một kho vỏ ứng dụng riêng. */
function serviceWorkerBuildId(): Plugin {
  let outDir = 'dist';
  return {
    name: 'exam-sw-build-id',
    apply: 'build',
    configResolved: (config) => {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const file = join(outDir, 'sw.js');
      const assets = readdirSync(join(outDir, 'assets')).sort().join('\n');
      const id = createHash('sha256').update(assets).digest('hex').slice(0, 12);
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__BUILD_ID__', id));
    },
  };
}

const apiTarget = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    serviceWorkerBuildId(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/ws': { target: apiTarget, ws: true },
    },
  },
  preview: {
    port: 4173,
    proxy: { '/api': apiTarget },
  },
});
