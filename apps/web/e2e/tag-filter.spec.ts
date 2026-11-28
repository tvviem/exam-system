import { expect, type Page, test } from '@playwright/test';
import { expectFooterAtBottom } from './dialog-support';
import { choosePickerTopic } from './topic-support';

// Lọc theo nhiều tag ở hộp chọn câu của Bộ đề và ở Ngân hàng câu hỏi (docs/plan/loc-nhieu-tag-thiet-ke.md).

const PASSWORD = 'mat-khau-on-dinh';
const ORIGIN = 'http://localhost:4173'; // server chặn yêu cầu ghi không có Origin

const rich = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Bốn câu A–D trong một Chủ đề, một câu tag `sql` ở Chủ đề khác, và một Bộ đề trống. */
async function seed(page: Page, tag: string) {
  const headers = { origin: ORIGIN };
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topicName = `Cấu trúc dữ liệu ${tag}`;
  const topic = await post('/api/topics', { name: topicName });
  const other = await post('/api/topics', { name: `Cơ sở dữ liệu ${tag}` });
  const question = (topicId: string, name: string, tags: string[]) =>
    post('/api/questions', {
      type: 'single_choice',
      topicId,
      stem: rich(`Câu thẻ ${name}`),
      defaultPoints: 1,
      tags,
      payload: {
        options: [
          { id: 'o1', content: rich('a') },
          { id: 'o2', content: rich('b') },
        ],
        key: ['o1'],
        shuffleOptions: true,
      },
    });
  await question(topic.id, 'A', ['chương 1', 'nhận biết']);
  await question(topic.id, 'B', ['chương 1', 'vận dụng', 'ngăn xếp']);
  await question(topic.id, 'C', ['chương 2', 'vận dụng']);
  await question(topic.id, 'D', ['chương 3', 'vận dụng', 'ngăn xếp']);
  await question(other.id, 'S', ['sql']);
  const exam = await post('/api/exams', { title: `Đề thẻ ${tag}` });
  return { topicName, topicId: topic.id as string, examId: exam.id as string };
}

const unique = (project: string) => `${project[0]}t${Date.now() % 1_000_000}`;
const noOverflow = async (page: Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    'tràn ngang',
  ).toBe(0);

test('hộp chọn câu: danh sách tag của Chủ đề, tìm không dấu, chọn nhiều, hai cách khớp', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-tag-${p}`);
  const { topicName, examId } = await seed(page, unique(p));
  await page.goto(`/examiner/exams/${examId}`);
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  await choosePickerTopic(dialog, topicName);

  const openFilters = async () => {
    if (p === 'mobile') await dialog.getByRole('button', { name: /^Bộ lọc/ }).click();
  };
  const backToList = async () => {
    if (p === 'mobile') await dialog.getByRole('button', { name: /^Xem \d+ câu$/ }).click();
  };
  const tick = (name: string) => dialog.getByRole('checkbox', { name: new RegExp(`^${name}, `) });
  const questions = dialog.getByRole('checkbox', { name: /^Chọn câu:/ });
  const shown = async (...names: string[]) => {
    await expect(questions).toHaveCount(names.length);
    for (const name of names)
      await expect(
        dialog.getByRole('checkbox', { name: `Chọn câu: Câu thẻ ${name}` }),
      ).toBeVisible();
  };

  await openFilters();
  // Chỉ tag của Chủ đề đang chọn, gom theo loại, kèm số câu.
  const chapters = dialog.getByRole('group', { name: 'chương' });
  await expect(chapters.getByRole('checkbox')).toHaveCount(3);
  await expect(dialog.getByRole('group', { name: 'mức độ' }).getByRole('checkbox')).toHaveCount(2);
  await expect(tick('chương 1')).toHaveAccessibleName('chương 1, 2 câu');
  await expect(tick('sql')).toHaveCount(0);

  // Tìm không dấu trong danh sách tag.
  const search = dialog.getByRole('searchbox', { name: 'Tìm tag' });
  await search.fill('ngan xep');
  await expect(tick('ngăn xếp')).toBeVisible();
  await expect(tick('chương 1')).toHaveCount(0);
  await search.fill('');

  await tick('chương 1').check();
  await tick('chương 2').check();
  await tick('vận dụng').check();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tag-loc-${p}.png` });
  await backToList();
  await expect(dialog.getByText('Đang lọc: (chương 1 hoặc chương 2) và vận dụng')).toBeVisible();
  await shown('B', 'C');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tag-ds-${p}.png` });
  await noOverflow(page);

  await openFilters();
  await dialog.getByRole('radio', { name: 'Khớp bất kỳ' }).check();
  await backToList();
  await expect(dialog.getByText('Đang lọc: chương 1 hoặc chương 2 hoặc vận dụng')).toBeVisible();
  await shown('A', 'B', 'C', 'D');

  // Gỡ bằng nhãn.
  await dialog.getByRole('button', { name: 'Bỏ lọc: vận dụng' }).click();
  await shown('A', 'B', 'C');
  await dialog.getByRole('button', { name: 'Bỏ lọc: chương 2' }).click();
  await shown('A', 'B');
  await openFilters();
  await expect(tick('chương 1')).toBeChecked();
  await expect(tick('chương 2')).not.toBeChecked();

  // Điện thoại: chọn nhiều thì chỉ hiện bốn nhãn, còn lại gom vào một nút mở màn Bộ lọc; danh sách vẫn còn chỗ.
  await tick('chương 2').check();
  await dialog.getByRole('radio', { name: 'Khớp bất kỳ' }).check(); // chỉ hiện từ hai tag
  for (const name of ['chương 3', 'nhận biết', 'vận dụng', 'ngăn xếp']) await tick(name).check();
  await backToList();
  const chips = dialog.getByRole('list', { name: 'Đang lọc' });
  const removable = chips.getByRole('button', { name: /^Bỏ lọc:/ });
  if (p === 'mobile') {
    await expect(removable).toHaveCount(4);
    const list = await dialog.getByTestId('picker-list').boundingBox();
    expect(list?.height ?? 0, 'chỗ cho danh sách').toBeGreaterThan(200);
    await chips.getByRole('button', { name: '+3 bộ lọc khác' }).click();
    await expect(tick('ngăn xếp')).toBeVisible();
  } else {
    await expect(removable).toHaveCount(7);
  }
});

test('Ngân hàng câu hỏi: hộp "Chọn tag", giữ trên địa chỉ trang, địa chỉ cũ một tag vẫn chạy', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-tag-${p}`);
  const { topicId } = await seed(page, unique(p));
  await page.goto(`/examiner/questions?topicId=${topicId}`);
  const row = (name: string) => page.getByText(`Câu thẻ ${name}`).filter({ visible: true });
  await expect(row('A')).toBeVisible();

  await page.getByRole('button', { name: 'Chọn tag' }).click();
  const chooser = page.getByRole('dialog', { name: 'Chọn tag' });
  await chooser.getByRole('checkbox', { name: /^chương 1, / }).check();
  await chooser.getByRole('checkbox', { name: /^ngăn xếp, / }).check();
  await chooser.getByRole('button', { name: 'Xong' }).click();
  await expect(page.getByText('Đang lọc: chương 1 và ngăn xếp')).toBeVisible();
  await expect(row('B')).toBeVisible();
  await expect(row('A')).toHaveCount(0);
  await expect(page).toHaveURL(/tag=/);
  await noOverflow(page);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tag-nh-${p}.png` });

  await page.reload();
  await expect(page.getByText('Đang lọc: chương 1 và ngăn xếp')).toBeVisible();
  await expect(row('B')).toBeVisible();
  await expect(row('A')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Chọn tag (2)' })).toBeVisible();

  await page.getByRole('button', { name: 'Bỏ lọc: ngăn xếp' }).click();
  await expect(row('A')).toBeVisible();

  // Địa chỉ đã đánh dấu từ bản trước: một tag, viết hoa vẫn nhận.
  await page.goto(`/examiner/questions?topicId=${topicId}&tag=${encodeURIComponent('Chương 3')}`);
  await expect(row('D')).toBeVisible();
  await expect(row('A')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bỏ lọc: chương 3' })).toBeVisible();
});

test('màn soạn câu hỏi chỉ cách đặt tag: ví dụ ngay dưới ô, hướng dẫn mở khi cần', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-tag-${p}`);
  await seed(page, unique(p));
  await page.goto('/examiner/questions/new?type=single_choice');
  const tags = page.getByLabel('Tags', { exact: true });
  await expect(tags).toHaveAccessibleDescription(/Ví dụ: chương 2, vận dụng, ngăn xếp/);
  const guide = page.getByText('Cách đặt tag để dễ tìm');
  await expect(guide).toBeVisible();
  await expect(page.getByText('Mỗi câu nên có')).toBeHidden(); // đóng sẵn, không chiếm chỗ
  await guide.click();
  // Ô Tags và hướng dẫn rộng trọn hàng, đọc thoải mái.
  const [field, row] = await tags.evaluate((el) => [
    el.getBoundingClientRect().width,
    (el.closest('.grid') as Element).getBoundingClientRect().width,
  ]);
  expect(Math.round(field as number)).toBe(Math.round(row as number));
  for (const title of [
    'Mỗi câu nên có',
    'Viết thống nhất',
    'Loại riêng',
    'Không cần gắn',
    'Khi lọc',
  ])
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  await noOverflow(page);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tag-soan-${p}.png` });
});

test('hộp "Chọn tag" nhiều tag: cuộn được tới tag cuối, nút Xong sát đáy, không gì lộ bên dưới', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-tag-${p}`);
  const { topicId } = await seed(page, unique(p));
  // 40 tag không thuộc loại nào, để nhóm "Khác" dài hơn khung sau khi "Xem thêm".
  for (let q = 0; q < 4; q++) {
    const res = await page.request.post('/api/questions', {
      headers: { origin: ORIGIN },
      data: {
        type: 'essay',
        topicId,
        stem: rich(`Câu nhiều tag ${q}`),
        defaultPoints: 1,
        tags: Array.from(
          { length: 10 },
          (_, k) => `ý ${String.fromCharCode(97 + q)}${'abcdefghij'[k]}`,
        ),
        payload: { maxLength: 100 },
      },
    });
    expect(res.ok(), await res.text()).toBe(true);
  }
  await page.goto(`/examiner/questions?topicId=${topicId}`);
  await page.getByRole('button', { name: 'Chọn tag' }).click();
  const chooser = page.getByRole('dialog', { name: 'Chọn tag' });
  await chooser.getByRole('button', { name: /^Xem thêm \d+ tag$/ }).click();
  const done = chooser.getByRole('button', { name: 'Xong' });
  await expectFooterAtBottom(chooser, done);
  const collapse = chooser.getByRole('button', { name: 'Thu gọn' });
  await collapse.scrollIntoViewIfNeeded();
  const [last, bar] = [await collapse.boundingBox(), await done.boundingBox()];
  expect((last?.y ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual((bar?.y ?? 0) + 1);
  // Đã cuộn tới cuối: nút đóng ở đầu hộp vẫn thấy.
  await expect(chooser.getByRole('button', { name: 'Đóng' })).toBeInViewport({ ratio: 1 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/chon-tag-${p}.png` });
  await noOverflow(page);
  await done.click();
  await expect(chooser).toBeHidden();
});
