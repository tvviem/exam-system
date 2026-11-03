// PROTOTYPE: đo chi phí vẽ lại mỗi nhịp 2 giây (tác vụ dài) của từng chế độ ở 300 người, CPU chậm 4 lần.
import { test } from '@playwright/test';
import { signIn } from './take-support';

test('chi phí mỗi nhịp cập nhật', async ({ page, context }, info) => {
  const kind = info.project.name;
  await signIn(page, `e2e-lc-gv-${kind}`);
  const client = await context.newCDPSession(page);
  test.setTimeout(120_000);
  for (const rate of [4]) {
    await client.send('Emulation.setCPUThrottlingRate', { rate });
    const out: string[] = [];
    for (const view of ['grid', 'table', 'cards']) {
      await page.goto(`/examiner/sessions/theo-doi-thu?n=300&view=${view}`);
      await page.getByText('/ 300 người').waitFor();
      await page.waitForTimeout(600);
      const stats = await page.evaluate(
        () =>
          new Promise<{ tasks: number; maxMs: number; totalMs: number }>((resolve) => {
            const durations: number[] = [];
            const obs = new PerformanceObserver((list) => {
              for (const e of list.getEntries()) durations.push(e.duration);
            });
            obs.observe({ type: 'longtask', buffered: false });
            setTimeout(() => {
              obs.disconnect();
              resolve({
                tasks: durations.length,
                maxMs: Math.round(Math.max(0, ...durations)),
                totalMs: Math.round(durations.reduce((a, b) => a + b, 0)),
              });
            }, 8000);
          }),
      );
      out.push(
        `${view}: ${stats.tasks} tác vụ dài, lâu nhất ${stats.maxMs} ms, tổng ${stats.totalMs} ms/8 s`,
      );
    }
    console.log(`[${kind}] CPU x${rate}: ${out.join(' | ')}`);
  }
});
