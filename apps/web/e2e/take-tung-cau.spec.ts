import { expect, type Page, test } from '@playwright/test';
import { examinerPage, ORIGIN, overflow, setViewMode, signIn } from './take-support';

// Chế độ "Từng câu" lấy câu hỏi làm trung tâm (docs/plan/take-tung-cau-thiet-ke.md): bấm Câu tiếp hay Câu trước thì câu hỏi mới nằm
// ngay dưới thanh đầu, không phải cuộn lại; hướng dẫn gọn lại; Mã đề ở thanh đầu; chuyển chế độ trong bảng Aa.

const headers = { origin: ORIGIN };
const doc = (...paragraphs: string[]) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

async function seed(examiner: Page, p: string, code: string, candidateCode: string) {
  const post = async (url: string, data: unknown) => {
    const res = await examiner.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Chủ đề từng câu ${p}` });
  const ids: string[] = [];
  for (let n = 1; n <= 6; n++) {
    const q = await post('/api/questions', {
      type: 'single_choice',
      topicId: topic.id,
      stem: doc(
        `Câu hỏi số ${n}: trong các phát biểu sau về hàm số bậc ba trên tập số thực, phát biểu nào là đúng khi xét tính đơn điệu và cực trị của nó trên toàn bộ tập xác định?`,
      ),
      defaultPoints: 1,
      tags: [],
      payload: {
        options: ['a', 'b', 'c', 'd'].map((id, i) => ({
          id,
          content: doc(`Phương án ${'ABCD'[i]} của câu ${n}`),
        })),
        key: ['b'],
        shuffleOptions: false,
      },
    });
    ids.push(q.id);
  }
  const exam = await post('/api/exams', { title: `Đề từng câu ${p}` });
  const items = (from: number, to: number) =>
    ids.slice(from, to).map((questionId) => ({ questionId, points: 1 }));
  const saved = await examiner.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: `Đề từng câu ${p}`,
      instructions: doc('Thời gian làm bài ba mươi phút.', 'Không được dùng tài liệu.'),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'Phần I. Trắc nghiệm',
          instructions: doc('Hướng dẫn riêng của Phần một: chọn đáp án đúng nhất.'),
          items: items(0, 4),
        },
        {
          title: 'Phần II. Củng cố',
          instructions: doc('Hướng dẫn riêng của Phần hai: đọc kỹ từng phương án.'),
          items: items(4, 6),
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await post(`/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
  const now = Date.now();
  const session = await post('/api/sessions', {
    examId: exam.id,
    title: `Ca từng câu ${p}`,
    opensAt: new Date(now - 10 * 60_000).toISOString(),
    closesAt: new Date(now + 4 * 3_600_000).toISOString(),
    durationMinutes: 30,
    accessCode: code,
    drawScope: 'shared',
    variantCount: 2,
  });
  await post(`/api/sessions/${session.id}/roster`, { codes: [candidateCode] });
}

/** Khoảng cách từ đáy thanh đầu tới đỉnh phần tử (px, dương là nằm dưới thanh đầu). */
async function belowHeader(page: Page, target: ReturnType<Page['locator']>) {
  const header = await page.locator('header').first().boundingBox();
  const box = await target.boundingBox();
  return (box?.y ?? -9999) - ((header?.y ?? 0) + (header?.height ?? 0));
}

async function start(page: Page, p: string, tag: string, code: string) {
  await signIn(page, `e2e-tcq-sv-${p}`);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  await setViewMode(page, 'Từng câu');
  expect(tag).toBeTruthy();
}

const runId = (t: { retry: number; repeatEachIndex: number }) => `${t.repeatEachIndex}${t.retry}`;

test('Từng câu: bấm Câu tiếp, Câu trước thì câu hỏi mới nằm ngay dưới thanh đầu; hướng dẫn gọn; Mã đề ở thanh đầu', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `TCQ${tag}${runId(testInfo)}A`;
  const examiner = await examinerPage(browser, `e2e-tcq-gv-${p}`);
  await seed(examiner, `${p}-${runId(testInfo)}`, code, `TCQ-${tag}-001`);
  // Khung nhìn thấp để trang đủ dài mà cuộn (đề thật thường dài hơn một màn hình)
  await page.setViewportSize({ width: p === 'mobile' ? 412 : 1280, height: 600 });
  await start(page, p, tag, code);

  // Thanh đầu: chip Mã đề; băng "Mã đề của bạn · Bài gồm N câu" đã bỏ khỏi đầu đề
  const chip = page.getByTestId('attempt-variant');
  await expect(chip).toContainText(/Mã đề của bạn: Đề [12]/);
  await expect(page.getByText(/Bài gồm 6 câu/)).toHaveCount(0);
  expect(await belowHeader(page, chip), 'chip nằm trong thanh đầu').toBeLessThan(0);
  // Thanh dưới: vị trí và tiến độ; không còn hàng chuyển chế độ trên đề bài
  const bar = page.getByRole('button', { name: /^Danh sách câu/ });
  await expect(bar).toContainText('Câu 1/6');
  await expect(bar).toContainText('Đã làm 0/6 câu');
  await expect(page.getByRole('button', { name: 'Từng câu' })).toHaveCount(0);

  // Câu đầu của Phần I: nhãn Phần, hướng dẫn Phần hiện sẵn, hướng dẫn chung nằm sau nút "Hướng dẫn"
  await expect(page.getByRole('heading', { name: 'Phần I. Trắc nghiệm', level: 2 })).toBeVisible();
  await expect(page.getByText('Hướng dẫn riêng của Phần một')).toBeVisible();
  await expect(page.getByText('Thời gian làm bài ba mươi phút.')).toBeHidden();
  await expect(page.getByRole('heading', { name: /^Câu 1/ })).toBeVisible();

  // Câu tiếp: hướng dẫn Phần ẩn đi, tiêu đề "Câu 2" ngay dưới thanh đầu, hai phương án đầu thấy ngay, con trỏ ở tiêu đề
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  const title2 = page.getByRole('heading', { name: /^Câu 2/ });
  await expect(title2).toBeVisible();
  await expect(page.getByText('Hướng dẫn riêng của Phần một')).toBeHidden();
  await expect.poll(() => belowHeader(page, title2), 'Câu 2 ngay dưới thanh đầu').toBeLessThan(60);
  expect(await belowHeader(page, title2)).toBeGreaterThanOrEqual(0);
  const navTop = (await page.getByRole('navigation').boundingBox())?.y ?? 0;
  for (const name of ['Phương án A của câu 2', 'Phương án B của câu 2']) {
    const option = page.getByText(name);
    const box = await option.boundingBox();
    expect(
      (box?.y ?? 9999) + (box?.height ?? 0),
      `${name} thấy ngay, không bị thanh dưới che`,
    ).toBeLessThan(navTop);
  }
  await expect(title2).toBeFocused();

  // Đã cuộn xuống đọc dở thì Câu tiếp vẫn đưa câu mới về đúng chỗ; chọn đáp án không làm trang nhảy
  await page.evaluate(() => window.scrollTo(0, 240));
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  const title3 = page.getByRole('heading', { name: /^Câu 3/ });
  await expect.poll(() => belowHeader(page, title3)).toBeLessThan(60);
  const before = await page.evaluate(() => window.scrollY);
  // Bấm bằng mã trong trang (Playwright tự cuộn để bấm sẽ làm sai phép đo)
  await page
    .getByRole('radio', { name: 'Phương án B của câu 3' })
    .evaluate((el) => (el as HTMLInputElement).click());
  await expect(page.getByRole('radio', { name: 'Phương án B của câu 3' })).toBeChecked();
  expect(await page.evaluate(() => window.scrollY), 'chọn đáp án không làm trang nhảy').toBe(
    before,
  );

  // Câu trước
  await page.getByRole('button', { name: 'Câu trước' }).click();
  await expect
    .poll(() => belowHeader(page, page.getByRole('heading', { name: /^Câu 2/ })))
    .toBeLessThan(80);

  // Sang Phần II (câu 5): nhãn Phần mới và hướng dẫn của Phần hiện lại, nằm ngay dưới thanh đầu
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await expect(page.getByRole('heading', { name: 'Phần II. Củng cố', level: 2 })).toBeVisible();
  await expect(page.getByText('Hướng dẫn riêng của Phần hai')).toBeVisible();
  await expect
    .poll(() =>
      belowHeader(page, page.getByRole('heading', { name: 'Phần II. Củng cố', level: 2 })),
    )
    .toBeLessThan(40);

  // Nút "Hướng dẫn": hộp có hướng dẫn chung và hướng dẫn của Phần đang làm
  await page.getByRole('button', { name: 'Hướng dẫn' }).click();
  const guide = page.getByRole('dialog', { name: 'Hướng dẫn làm bài' });
  await expect(guide.getByText('Thời gian làm bài ba mươi phút.')).toBeVisible();
  await expect(guide.getByText('Không được dùng tài liệu.')).toBeVisible();
  await expect(
    guide.getByRole('heading', { name: 'Hướng dẫn của Phần II. Củng cố' }),
  ).toBeVisible();
  await expect(guide.getByText('Hướng dẫn riêng của Phần hai')).toBeVisible();
  await guide.getByRole('button', { name: 'Đóng' }).click();
  await expect(guide).toBeHidden();
  expect(await overflow(page), 'tràn ngang').toBe(0);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tung-cau-${p}.png` });
});

test('Chuyển chế độ trong bảng Aa và nhớ lựa chọn; "Cả đề" giữ hướng dẫn ở đầu trang; 360 px vẫn vừa thanh đầu', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `TCQ${tag}${runId(testInfo)}B`;
  const examiner = await examinerPage(browser, `e2e-tcq-gv-${p}`);
  await seed(examiner, `${p}-${runId(testInfo)}b`, code, `TCQ-${tag}-001`);
  await page.setViewportSize({ width: 360, height: 640 });
  await start(page, p, tag, code);

  // Thanh đầu vừa 360 px: giờ, Mã đề, Aa và Nộp bài cùng nằm trong khung nhìn, không tràn ngang
  expect(await overflow(page), 'tràn ngang ở 360 px').toBe(0);
  for (const locator of [
    page.getByRole('timer'),
    page.getByTestId('attempt-variant'),
    page.getByRole('button', { name: 'Hiển thị' }),
    page.getByRole('button', { name: 'Nộp bài' }),
  ]) {
    const box = await locator.boundingBox();
    expect((box?.x ?? -1) + (box?.width ?? 0), 'nằm trong khung 360 px').toBeLessThanOrEqual(360);
  }

  // Cả đề: mọi câu ở một trang, hướng dẫn làm bài ở đầu trang như cũ
  await setViewMode(page, 'Cả đề');
  await expect(page.getByRole('heading', { name: /^Câu 6/ })).toBeAttached();
  await expect(page.getByText('Hướng dẫn làm bài', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Danh sách câu/ })).toContainText(
    'Đã làm 0/6 câu',
  );

  // Lựa chọn được nhớ: tải lại vẫn ở "Từng câu" sau khi chọn "Từng câu"
  await setViewMode(page, 'Từng câu');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Danh sách câu/ })).toContainText('Câu 1/6');
  await page.getByRole('button', { name: 'Hiển thị' }).click();
  await expect(page.getByRole('radio', { name: 'Từng câu' })).toBeChecked();
});
