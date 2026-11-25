import { type Browser, devices, expect, type Page, test } from '@playwright/test';
import { ORIGIN, setViewMode, signIn } from './take-support';

// Rà tràn ngang trên điện thoại hẹp (360 px) với dữ liệu "xấu nhất mà hợp lệ": tên rất dài, chuỗi liền không có khoảng trắng.
// Mỗi trang, hộp thoại chính của cả ba vai không được rộng hơn màn hình, không phần tử nào lòi ra ngoài, không vùng cuộn ngang
// ngoài ý muốn. Chạy một lần ở dự án mobile. Thêm trang hay hộp thoại mới thì thêm một dòng ở đây.

const VIEWPORT = { width: 360, height: 780 };
/** Có trong mọi tên dài, để chắc trang đã hiện dữ liệu thử chứ không "đạt" vì đang trống. */
const MARK = 'RàTràn';
const LONG = `${MARK} Công nghệ thông tin và ứng dụng trí tuệ nhân tạo trong chuyển đổi số giáo dục đại học`;
/** Chuỗi liền (đường dẫn, mã) không có chỗ xuống dòng tự nhiên. */
const UNBROKEN = `${MARK}-https://example.edu.vn/tai-lieu/chuyen-doi-so/rat-dai-khong-co-khoang-trang-0123456789`;

const headers = { origin: ORIGIN };
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const rich = (...texts: string[]) => ({ type: 'doc', content: texts.map(paragraph) });
const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

async function call(page: Page, method: 'GET' | 'POST' | 'PUT', url: string, data?: unknown) {
  const res = await page.request.fetch(`/api${url}`, {
    method,
    headers,
    ...(data === undefined ? {} : { data }),
  });
  expect(res.ok(), `${method} ${url}: ${await res.text()}`).toBe(true);
  return res.status() === 204 ? null : res.json();
}

async function phone(browser: Browser, username: string) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: VIEWPORT,
    baseURL: ORIGIN,
  });
  const page = await context.newPage();
  await signIn(page, username);
  return page;
}

/** Ghi lại mọi chỗ tràn của màn đang hiện. `expectData`: chờ thấy dữ liệu thử trước khi đo. */
async function check(page: Page, name: string, found: string[], expectData = true) {
  if (expectData) {
    await expect(
      page.getByText(MARK).filter({ visible: true }).first(),
      `${name}: chưa thấy dữ liệu thử`,
    ).toBeVisible();
  } else {
    await page.locator('h1').first().waitFor();
  }
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    const extra = document.documentElement.scrollWidth - width;
    if (extra > 0) out.push(`trang tràn ngang ${extra} px`);
    const label = (el: Element) =>
      `<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') ?? '').slice(0, 70)}"> "${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`;
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden';
    };
    // Lòi ra ngoài màn hình mà không nằm trong một vùng (nằm gọn trong màn) tự cắt hoặc tự cuộn.
    const contained = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') {
          if (p.getBoundingClientRect().right <= width + 1) return true;
        }
      }
      return false;
    };
    const sticking = Array.from(document.body.querySelectorAll('*')).filter((el) => {
      if (!shown(el) || el.closest('svg') !== null) return false;
      const r = el.getBoundingClientRect();
      return (r.right > width + 1 || r.left < -1) && !contained(el);
    });
    for (const el of sticking) {
      if (el.parentElement && sticking.includes(el.parentElement)) continue; // chỉ báo phần tử ngoài cùng
      out.push(
        `lòi ra ngoài ${Math.round(el.getBoundingClientRect().right - width)} px: ${label(el)}`,
      );
    }
    // Chữ liền (mã, đường dẫn) tràn khỏi khung của nó rồi ra ngoài màn, dù chính khung vẫn nằm gọn.
    if (extra > 0) {
      const spilling = Array.from(document.body.querySelectorAll('*')).filter((el) => {
        if (!shown(el) || el.closest('svg') !== null || contained(el)) return false;
        if (getComputedStyle(el).overflowX !== 'visible') return false;
        const r = el.getBoundingClientRect();
        return r.right <= width + 1 && r.left + el.scrollWidth > width + 1;
      });
      for (const el of spilling) {
        if (spilling.some((other) => other !== el && el.contains(other))) continue; // chỉ báo trong cùng
        out.push(`chữ tràn khỏi khung: ${label(el)}`);
      }
    }
    // Vùng cuộn dọc (hộp thoại, bảng chọn) bị nội dung đẩy cho cuộn ngang. Vùng cố ý cuộn ngang ghi rõ `overflow-x-auto`.
    for (const el of document.body.querySelectorAll('*')) {
      if (el.matches('input, textarea, select') || !shown(el)) continue;
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX !== 'auto' && overflowX !== 'scroll') continue;
      if ((el.getAttribute('class') ?? '').includes('overflow-x-auto')) continue;
      if (el.scrollWidth > el.clientWidth + 1)
        out.push(`cuộn ngang ngoài ý muốn ${el.scrollWidth - el.clientWidth} px: ${label(el)}`);
    }
    return out;
  });
  if (problems.length > 0 && process.env.SHOTS) {
    await page.screenshot({
      path: `${process.env.SHOTS}/tran-${name.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`,
    });
  }
  found.push(...problems.map((problem) => `[${name}] ${problem}`));
}

async function visit(page: Page, name: string, path: string, found: string[], expectData = true) {
  await page.goto(path);
  await check(page, name, found, expectData);
}

/** Mở hộp thoại bằng một nút, đo, rồi đóng. */
async function dialog(page: Page, name: string, button: string | RegExp, found: string[]) {
  await page.getByRole('button', { name: button }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await check(page, name, found, false);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('Rà tràn ngang trên điện thoại 360 px với tên dài: ba vai', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'chỉ cần chạy một lần, ở điện thoại');
  test.setTimeout(240_000);
  const found: string[] = [];

  // ---------- Quản trị viên: Đơn vị và Lời mời tên dài ----------
  const admin = await phone(browser, 'e2e-ovf-admin');
  const unit = await call(admin, 'POST', '/admin/units', {
    code: 'RATRAN-DON-VI-0123456789',
    name: `${LONG} (Đơn vị)`,
  });
  await call(admin, 'POST', '/admin/invitations', {
    email:
      'ratran.dia.chi.thu.rat.dai.khong.co.khoang.trang.0123456789@truong-dai-hoc.example.edu.vn',
    fullName: `${LONG} (Lời mời)`,
    unitId: unit.id,
  });

  // ---------- Người ra đề: Ngân hàng câu hỏi, Bộ đề, Phiên thi ----------
  const examiner = await phone(browser, 'e2e-ovf-gv');
  const topic = await call(examiner, 'POST', '/topics', { name: LONG.slice(0, 100) });
  await call(examiner, 'POST', '/topics', { name: UNBROKEN.slice(0, 100) });
  const common = {
    topicId: topic.id,
    tags: [`${MARK}-the-lien-khong-cach`.slice(0, 30), 'thẻ dài có khoảng trắng'],
  };
  const options = [
    { id: 'o1', content: rich(UNBROKEN) },
    { id: 'o2', content: rich(LONG) },
  ];
  const questions = [
    await call(examiner, 'POST', '/questions', {
      ...common,
      type: 'single_choice',
      stem: rich(`${LONG}?`, UNBROKEN),
      defaultPoints: 1,
      payload: { options, key: ['o1'], shuffleOptions: false },
    }),
    await call(examiner, 'POST', '/questions', {
      ...common,
      type: 'multiple_choice',
      stem: rich(UNBROKEN),
      defaultPoints: 2,
      payload: { options, key: ['o1'], scoringRule: 'proportional', shuffleOptions: false },
    }),
    await call(examiner, 'POST', '/questions', {
      ...common,
      type: 'true_false_cluster',
      stem: rich(`${LONG} (chùm)`),
      defaultPoints: 1,
      payload: {
        statements: [
          { id: 's1', content: rich(UNBROKEN), key: true },
          { id: 's2', content: rich(LONG), key: false },
        ],
        scoringRule: 'ladder',
        ladder: [0, 0.25, 1],
      },
    }),
    await call(examiner, 'POST', '/questions', {
      ...common,
      type: 'essay',
      stem: rich(`${LONG} (tự luận)`),
      defaultPoints: 5,
      payload: { maxLength: 1000, rubric: rich(UNBROKEN) },
    }),
  ];
  const makeExam = async (title: string) => {
    const exam = await call(examiner, 'POST', '/exams', { title });
    const saved = await call(examiner, 'PUT', `/exams/${exam.id}`, {
      title,
      instructions: rich(LONG, UNBROKEN),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: LONG,
          instructions: emptyDoc,
          items: questions.map((q, i) => ({ questionId: q.id, points: [1, 2, 1, 5][i] })),
        },
      ],
    });
    return { id: exam.id as string, version: saved.version as number };
  };
  const draft = await makeExam(UNBROKEN.slice(0, 200));
  const published = await makeExam(`${LONG} (đề)`);
  await call(examiner, 'POST', `/exams/${published.id}/publish`, { version: published.version });
  const now = Date.now();
  const session = await call(examiner, 'POST', '/sessions', {
    examId: published.id,
    title: `${LONG} (phiên)`,
    opensAt: new Date(now - 10 * 60_000).toISOString(),
    closesAt: new Date(now + 4 * 3_600_000).toISOString(),
    durationMinutes: 30,
    accessCode: 'RATRAN360',
    variantCount: 2,
  });
  await call(examiner, 'POST', `/sessions/${session.id}/roster`, {
    codes: ['RATRAN-SV-012345678901234567'],
  });

  // Yêu cầu cấp tài khoản (đi qua giao diện vì là tệp tải lên).
  await examiner.goto('/examiner/account-requests');
  const csv = [
    'Họ tên,Mã định danh,Email,Lớp',
    `${LONG},RATRAN-MA-DINH-DANH-0123456789,ratran.sinh.vien.email.rat.dai.0123456789@truong-dai-hoc.example.edu.vn,${MARK}-LOP-CHAT-LUONG-CAO-0123456789-KHOA-2026`,
    `,RATRAN-MA-LOI-0123456789,ratran.loi@example.edu.vn,${MARK}-LOP`,
  ].join('\n');
  await examiner.getByLabel('File danh sách').setInputFiles({
    name: `${MARK}-danh-sach-lop-ten-tep-rat-dai-khong-co-khoang-trang-0123456789.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await examiner.getByLabel('Ghi chú').fill(UNBROKEN);
  await check(examiner, 'GV Yêu cầu: chọn tệp', found, false);
  await examiner.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(examiner).toHaveURL(/\/account-requests\/[0-9a-f-]{36}/);
  const requestId = new URL(examiner.url()).pathname.split('/').pop();
  await expect(examiner.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 20_000 });
  await check(examiner, 'GV Yêu cầu: chi tiết', found);

  // ---------- Người dự thi: vào thi, làm bài, nộp ----------
  const candidate = await phone(browser, 'e2e-ovf-sv');
  await visit(candidate, 'SV Vào thi', '/take', found);
  await candidate.getByLabel('Mã vào thi').fill('RATRAN360');
  await candidate.getByRole('button', { name: 'Vào thi' }).click();
  await expect(candidate.getByRole('button', { name: 'Bắt đầu làm bài' })).toBeVisible();
  await check(candidate, 'SV Xác nhận vào thi', found);
  await candidate.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await candidate.waitForURL(/\/take\/attempts\//);
  await setViewMode(candidate, 'Từng câu');
  for (let n = 1; n <= questions.length; n++) {
    await check(candidate, `SV Từng câu ${n}`, found, false);
    if (n < questions.length) await candidate.getByRole('button', { name: 'Câu tiếp' }).click();
  }
  await candidate.getByRole('textbox', { name: 'Câu trả lời' }).fill(UNBROKEN);
  await dialog(candidate, 'SV Danh sách câu', /^Danh sách câu/, found);
  await dialog(candidate, 'SV Hiển thị', 'Hiển thị', found);
  await dialog(candidate, 'SV Hướng dẫn', 'Hướng dẫn', found);
  await setViewMode(candidate, 'Cả đề');
  await check(candidate, 'SV Cả đề', found);
  await candidate.getByRole('radio').first().check();

  // Người ra đề theo dõi trong lúc đang có người làm bài.
  await visit(examiner, 'GV Theo dõi', `/examiner/sessions/${session.id}?tab=monitor`, found);
  await dialog(examiner, 'GV Chi tiết người đang thi', 'Chi tiết', found);

  await dialog(candidate, 'SV Nộp bài', 'Nộp bài', found);
  await candidate.getByRole('button', { name: 'Nộp bài' }).click();
  await candidate.getByRole('dialog').getByRole('button', { name: 'Nộp bài' }).click();
  await expect(candidate.getByRole('heading', { name: 'Đã nộp' })).toBeVisible();
  await check(candidate, 'SV Sau khi nộp', found, false);

  // ---------- Chấm, Công bố, Phúc khảo ----------
  await visit(examiner, 'GV Chấm tự luận', `/examiner/sessions/${session.id}/grading`, found);
  await call(examiner, 'POST', `/sessions/${session.id}/close-entry`, {});
  await examiner
    .getByRole('button', { name: /^Tối đa/ })
    .first()
    .click();
  // Công bố thử đến khi được: điểm vừa chấm cần một nhịp mới ghi xong.
  await expect
    .poll(async () => {
      const res = await examiner.request.post(`/api/sessions/${session.id}/release`, {
        headers,
        data: { appealPeriodDays: 3 },
      });
      return res.ok();
    })
    .toBe(true);

  await visit(candidate, 'SV Kết quả', `/take/results/${session.id}`, found);
  await candidate.getByTestId('appeal-open').first().click();
  await candidate.getByRole('dialog').getByLabel(/Lý do/).fill(`${UNBROKEN} xin xem lại câu này`);
  await check(candidate, 'SV Hộp Phúc khảo', found, false);
  await candidate.getByTestId('appeal-send').click();
  await expect(candidate.getByTestId('appeal-status').first()).toBeVisible();
  await check(candidate, 'SV Đã gửi Phúc khảo', found, false);
  await visit(candidate, 'SV Tài khoản', '/account', found);

  // ---------- Người ra đề: mọi trang ----------
  const gv: [string, string, boolean?][] = [
    ['GV Ngân hàng câu hỏi', '/examiner/questions'],
    ['GV Sửa câu hỏi', `/examiner/questions/${questions[0].id}`],
    ['GV Sửa câu chùm', `/examiner/questions/${questions[2].id}`],
    ['GV Soạn câu mới', '/examiner/questions/new?type=single_choice', false],
    ['GV Nhập Excel', '/examiner/questions/import', false],
    ['GV Bộ đề (danh sách)', '/examiner/exams'],
    ['GV Bộ đề nháp', `/examiner/exams/${draft.id}`],
    ['GV Bộ đề đã phát hành', `/examiner/exams/${published.id}`],
    ['GV Phiên thi (danh sách)', '/examiner/sessions'],
    ['GV Tạo Phiên thi', '/examiner/sessions/new', false],
    ['GV Phiên thi: Tổng quan', `/examiner/sessions/${session.id}`],
    ['GV Phiên thi: Đề', `/examiner/sessions/${session.id}?tab=variants`],
    ['GV Phiên thi: Danh sách', `/examiner/sessions/${session.id}?tab=roster`],
    ['GV Phiên thi: Kết quả', `/examiner/sessions/${session.id}?tab=results`],
    ['GV Phúc khảo', `/examiner/sessions/${session.id}/appeals`],
    ['GV Xem thử', `/examiner/sessions/${session.id}/try`],
    ['GV Yêu cầu (danh sách)', '/examiner/account-requests'],
    ['GV Tài khoản', '/account', false],
  ];
  for (const [name, path, data] of gv) await visit(examiner, name, path, found, data ?? true);
  await examiner.goto('/examiner/questions');
  await dialog(examiner, 'GV Quản lý Chủ đề', 'Quản lý Chủ đề', found);
  await dialog(examiner, 'GV Lọc câu hỏi', /^Lọc/, found);
  await examiner.goto(`/examiner/exams/${draft.id}`);
  await dialog(examiner, 'GV Thêm câu hỏi', /^Thêm câu hỏi/, found);
  await examiner.goto(`/examiner/exams/${published.id}`);
  await dialog(examiner, 'GV Xuất Bộ đề', 'Xuất Bộ đề', found);

  // ---------- Quản trị viên: mọi trang ----------
  const users = await call(admin, 'GET', '/admin/users?q=e2e-ovf-sv');
  const adminPages: [string, string, boolean?][] = [
    ['QT Người dùng', '/admin/users?q=e2e-ovf'],
    ['QT Chi tiết người dùng', `/admin/users/${users.items[0].id}`],
    ['QT Đơn vị', '/admin/units'],
    ['QT Lời mời', '/admin/invitations'],
    ['QT Yêu cầu (danh sách)', '/admin/account-requests', false],
    ['QT Yêu cầu (chi tiết)', `/admin/account-requests/${requestId}`],
    ['QT Ủy quyền chấm', '/admin/grading-delegates', false],
    ['QT Lịch sử đăng nhập', '/admin/login-events', false],
    ['QT Nhật ký thao tác', '/admin/audit-logs', false],
    ['QT Hàng đợi thư', '/admin/mail-queue', false],
    ['QT Sao lưu', '/admin/backup', false],
    ['QT Tài khoản', '/account', false],
  ];
  for (const [name, path, data] of adminPages) await visit(admin, name, path, found, data ?? true);

  expect(found, `\n${found.join('\n')}\n`).toEqual([]);
});
