import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Browser, devices, expect, type Locator, type Page } from '@playwright/test';

// Hàm dùng chung của bộ chụp ảnh hướng dẫn: mở trang như người dùng thật (máy tính hoặc điện thoại), đăng nhập, và chụp ảnh có đánh
// số ① ② ③ cùng khung nổi bật quanh đúng nút hay ô cần bấm. Bảng chú thích của từng ảnh ghi vào manifest.json để trình dựng Word
// in dưới ảnh, nên số trên ảnh và chữ chú thích luôn khớp nhau.

export const ORIGIN = 'http://localhost:4173';
export const PASSWORD = 'mat-khau-demo';
export const OUT = process.env.GUIDE_OUT ?? join(process.cwd(), '../../huong-dan-word/anh');
const MANIFEST = join(OUT, 'manifest.json');
const STATE = join(OUT, 'trang-thai.json');

export type Kind = 'desktop' | 'phone';

export async function openPage(browser: Browser, kind: Kind = 'desktop'): Promise<Page> {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    ...(kind === 'phone'
      ? { ...devices['Pixel 7'], viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }),
  });
  const page = await context.newPage();
  page.on('dialog', (dialog) => void dialog.dismiss());
  return page;
}

export async function signIn(page: Page, username: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Trạng thái chia sẻ giữa các bước của kịch bản (mã vào thi, liên kết Lời mời...). */
export function readState(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    return {};
  }
}
export function saveState(patch: Record<string, string>) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(STATE, JSON.stringify({ ...readState(), ...patch }, null, 2));
}

export interface Mark {
  /** Phần tử cần nhấn mạnh. */
  at: Locator;
  /** Chú thích in dưới ảnh trong tài liệu ("Bấm Nộp bài"). */
  text: string;
  /** Mở rộng khung ra ngoài phần tử (px). */
  pad?: number;
}

export interface ShotOptions {
  marks?: Mark[];
  /** Chụp cả trang (mặc định chỉ chụp khung nhìn). */
  full?: boolean;
  /** Chỉ chụp quanh phần tử này (kèm lề). */
  clip?: Locator;
  /** Chụp đúng vùng này của khung nhìn (px), ví dụ chỉ thẻ đăng nhập. */
  region?: { x: number; y: number; width: number; height: number };
  /** Dòng giới thiệu ngắn ngay trên chú thích. */
  caption?: string;
  /** Đợi chữ ổn định trước khi chụp (ms). */
  settle?: number;
  /** Giữ thông báo nổi (mặc định chờ thông báo tan để không dính vào ảnh). */
  toast?: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  n: number;
  pad: number;
}

/** Chạy trong trình duyệt: vẽ khung đỏ và số cho từng vùng; hộp thoại gốc ở lớp trên cùng nên khung phải nằm trong nó. */
function drawOverlay({ items }: { items: Box[] }) {
  const dialog = document.querySelector('dialog[open]');
  const host: Element = dialog ?? document.body;
  const fixed = dialog !== null;
  const layer = document.createElement('div');
  layer.id = 'guide-overlay';
  layer.style.cssText = `position:${fixed ? 'fixed' : 'absolute'};left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none`;
  for (const b of items) {
    const left = b.x + (fixed ? 0 : window.scrollX) - b.pad;
    const top = b.y + (fixed ? 0 : window.scrollY) - b.pad;
    const frame = document.createElement('div');
    frame.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${b.w + b.pad * 2}px;height:${b.h + b.pad * 2}px;border:3px solid #d92d20;border-radius:10px;box-shadow:0 0 0 4px rgba(217,45,32,.20)`;
    const badge = document.createElement('div');
    badge.textContent = String(b.n);
    badge.style.cssText = `position:absolute;left:${Math.max(2, left - 14)}px;top:${Math.max(2, top - 14)}px;width:28px;height:28px;border-radius:14px;background:#d92d20;color:#fff;font:700 15px/28px system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.35)`;
    layer.append(frame, badge);
  }
  host.append(layer);
}

/** Chụp ảnh `<thư mục vai>/<tên>.png`, thêm khung và số cho từng `marks`, ghi manifest. */
export async function shot(page: Page, folder: string, name: string, options: ShotOptions = {}) {
  const { marks = [], full = false, clip, region, caption, settle = 350, toast = false } = options;
  const file = join(OUT, folder, `${name}.png`);
  mkdirSync(dirname(file), { recursive: true });
  await page.waitForTimeout(settle);
  // Thông báo nổi của bước trước tự tan sau 4 giây: chờ cho ảnh không có thông báo thừa.
  if (!toast) {
    await page
      .locator('[aria-live="polite"] [role="status"]')
      .first()
      .waitFor({ state: 'detached', timeout: 6000 })
      .catch(() => {});
  }
  // "Cả trang": nới khung nhìn bằng đúng chiều cao trang rồi chụp một khung, để thanh bên và thanh dính giữ nguyên như thật.
  const original = page.viewportSize();
  if (full && original) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({
      width: original.width,
      height: Math.min(Math.max(height, original.height), 3200),
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
  } else {
    // Chỉ cuộn khi phần tử nằm ngoài khung nhìn (phần tử dính, đang chuyển động thì không cuộn được).
    for (const mark of marks) {
      const target = mark.at.first();
      const box = await target.boundingBox();
      const viewport = page.viewportSize();
      if (!box || !viewport || box.y < 0 || box.y + box.height > viewport.height) {
        await target.scrollIntoViewIfNeeded();
      }
    }
  }
  const boxes: Box[] = [];
  for (const [i, mark] of marks.entries()) {
    const box = await mark.at.first().boundingBox();
    expect(box, `không thấy phần tử cho chú thích "${mark.text}" trong ${name}`).not.toBeNull();
    if (!box) continue;
    boxes.push({ x: box.x, y: box.y, w: box.width, h: box.height, n: i + 1, pad: mark.pad ?? 4 });
  }
  await page.evaluate(drawOverlay, { items: boxes });
  try {
    if (region) {
      await page.screenshot({ path: file, clip: region });
    } else if (clip) {
      const box = await clip.first().boundingBox();
      expect(box, `không thấy vùng cắt của ${name}`).not.toBeNull();
      if (box) {
        const margin = 16;
        await page.screenshot({
          path: file,
          clip: {
            x: Math.max(0, box.x - margin),
            y: Math.max(0, box.y - margin),
            width: box.width + margin * 2,
            height: box.height + margin * 2,
          },
        });
      }
    } else {
      await page.screenshot({ path: file });
    }
  } finally {
    await page.evaluate(() => document.getElementById('guide-overlay')?.remove());
    if (full && original) await page.setViewportSize(original);
  }
  appendFileSync(
    MANIFEST,
    `${JSON.stringify({
      file: `${folder}/${name}.png`,
      caption: caption ?? null,
      marks: marks.map((m, i) => ({ n: i + 1, text: m.text })),
    })}\n`,
  );
}

/** Gọi API bằng phiên đăng nhập của trang (chuẩn bị dữ liệu mẫu nhanh, không cần chụp). */
export async function api(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
) {
  const res = await page.request.fetch(`/api${url}`, {
    method,
    headers: { origin: ORIGIN },
    ...(data === undefined ? {} : { data }),
  });
  expect(res.ok(), `${method} ${url}: ${await res.text()}`).toBe(true);
  return res.status() === 204 ? null : res.json();
}

export const rich = (text: string) => ({
  type: 'doc',
  content: [
    text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
  ],
});

/** Lấy mã của Lời mời: mã chỉ có trong thư nên đặt mã đã biết thẳng vào database E2E (như e2e/invitations.spec.ts). */
export async function knownInviteToken(email: string): Promise<string> {
  const { createHash, randomBytes } = await import('node:crypto');
  const { createRequire } = await import('node:module');
  const path = await import('node:path');
  const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
  const { Client } = apiRequire('pg');
  const token = randomBytes(32).toString('base64url');
  const db = new Client({
    connectionString:
      process.env.E2E_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_e2e',
  });
  await db.connect();
  try {
    // Chờ worker gửi xong thư (lúc gửi nó sinh mã mới đè lên), rồi mới đặt mã đã biết.
    for (let i = 0; i < 60; i++) {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM email_outbox WHERE lower(to_email) = lower($1) AND status IN ('sent','skipped')`,
        [email],
      );
      if (rows[0].n > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await db.query(
      `UPDATE invitations SET token_hash = $1, expires_at = now() + interval '7 days' WHERE email = $2`,
      [createHash('sha256').update(token).digest('hex'), email],
    );
  } finally {
    await db.end();
  }
  return token;
}
