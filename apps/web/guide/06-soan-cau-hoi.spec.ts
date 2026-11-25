import { expect, type Page, test } from '@playwright/test';
import { openPage, shot, signIn } from './support';

// Người ra đề: soạn bốn Loại câu hỏi bằng trình soạn (tài liệu nguoi-ra-de.md).

async function typeIn(page: Page, name: string | RegExp, text: string) {
  const box = page.getByRole('textbox', { name });
  await box.click();
  await page.keyboard.type(text);
}

async function chooseType(page: Page, label: string) {
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Soạn câu hỏi' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: new RegExp(`^${label}`) })
    .click();
  await expect(page.getByRole('heading', { name: 'Soạn câu hỏi', level: 1 })).toBeVisible();
  const topic = page.getByLabel('Chủ đề', { exact: true });
  if (await topic.isVisible().catch(() => false))
    await topic.selectOption({ label: 'Tin học căn bản' });
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Câu hỏi')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
}

test('Soạn bốn Loại câu hỏi', async ({ browser }) => {
  const page = await openPage(browser, 'desktop');
  await signIn(page, 'tran.mai');

  // Chọn Loại câu hỏi
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Soạn câu hỏi' }).click();
  const chooser = page.getByRole('dialog');
  await shot(page, 'nguoi-ra-de', '20-chon-loai-cau-hoi', {
    marks: [
      { at: chooser.getByRole('link', { name: /^Chọn một/ }), text: 'Chọn một: một đáp án đúng' },
      {
        at: chooser.getByRole('link', { name: /^Chọn nhiều/ }),
        text: 'Chọn nhiều: nhiều đáp án đúng',
      },
      {
        at: chooser.getByRole('link', { name: /^Chùm đúng\/sai/ }),
        text: 'Chùm đúng/sai: nhiều mệnh đề, mỗi mệnh đề đúng hoặc sai',
      },
      {
        at: chooser.getByRole('link', { name: /^Tự luận/ }),
        text: 'Tự luận: Người dự thi viết câu trả lời, Người ra đề chấm',
      },
    ],
  });
  await page.keyboard.press('Escape');

  // Chọn một
  await chooseType(page, 'Chọn một');
  await typeIn(page, 'Phần dẫn', 'Thiết bị nào sau đây là thiết bị nhập dữ liệu?');
  await typeIn(page, 'Phương án A', 'Máy in');
  await typeIn(page, 'Phương án B', 'Bàn phím');
  await page.getByRole('button', { name: 'Thêm Phương án' }).click();
  await typeIn(page, 'Phương án C', 'Màn hình');
  await page.getByRole('radio', { name: /Phương án B/ }).check();
  await shot(page, 'nguoi-ra-de', '21-soan-chon-mot', {
    full: true,
    marks: [
      { at: page.getByLabel('Chủ đề', { exact: true }), text: 'Chọn Chủ đề của câu hỏi' },
      {
        at: page.getByLabel('Điểm mặc định'),
        text: 'Điểm mặc định của câu (sửa lại được khi đưa vào Bộ đề)',
      },
      { at: page.getByRole('textbox', { name: 'Phần dẫn' }), text: 'Phần dẫn: nội dung câu hỏi' },
      {
        at: page.getByRole('radio', { name: /Phương án B/ }),
        text: 'Chọn Phương án là đáp án đúng',
      },
      {
        at: page.getByRole('button', { name: 'Thêm Phương án' }),
        text: 'Thêm Phương án (tối đa 8)',
      },
      { at: page.getByRole('button', { name: 'Lưu', exact: true }), text: 'Bấm Lưu' },
    ],
  });
  await save(page);
  await shot(page, 'nguoi-ra-de', '22-thanh-cong-sua-cau-hoi', {
    full: true,
    marks: [
      {
        at: page.getByRole('button', { name: 'Nhân bản' }),
        text: 'Nhân bản: tạo bản sao để sửa thành câu mới',
      },
    ],
  });

  // Thanh công cụ: công thức, hình minh họa
  const toolbar = page.getByRole('toolbar', { name: /Định dạng cho Phần dẫn/ });
  await shot(page, 'nguoi-ra-de', '24-thanh-cong-cu-soan', {
    clip: toolbar,
    marks: [
      {
        at: toolbar.getByRole('button', { name: 'Đậm' }),
        text: 'Định dạng chữ: đậm, nghiêng, gạch chân, chỉ số trên và dưới',
      },
      {
        at: toolbar.getByRole('button', { name: 'Công thức' }),
        text: 'Chèn công thức toán (bàn phím toán hoặc mã LaTeX)',
      },
      { at: toolbar.getByRole('button', { name: 'Hình minh họa' }), text: 'Chèn hình minh họa' },
    ],
  });

  // Chọn nhiều
  await chooseType(page, 'Chọn nhiều');
  await typeIn(page, 'Phần dẫn', 'Chọn các phần mềm thuộc nhóm ứng dụng văn phòng.');
  await typeIn(page, 'Phương án A', 'Microsoft Word');
  await typeIn(page, 'Phương án B', 'Windows');
  await page.getByRole('button', { name: 'Thêm Phương án' }).click();
  await typeIn(page, 'Phương án C', 'Microsoft Excel');
  await page.getByRole('checkbox', { name: /Phương án A/ }).check();
  await page.getByRole('checkbox', { name: /Phương án C/ }).check();
  await shot(page, 'nguoi-ra-de', '25-soan-chon-nhieu', {
    full: true,
    marks: [
      {
        at: page.getByRole('checkbox', { name: /Phương án A/ }),
        text: 'Đánh dấu tất cả Phương án đúng',
      },
      {
        at: page.getByLabel('Cách chấm'),
        text: 'Cách chấm: Tỷ lệ (đúng bao nhiêu được bấy nhiêu), Đúng hết...',
      },
    ],
  });
  await save(page);

  // Chùm đúng/sai
  await chooseType(page, 'Chùm đúng/sai');
  await typeIn(page, 'Phần dẫn', 'Xét các phát biểu về bộ nhớ máy tính.');
  await typeIn(page, 'Mệnh đề a', 'RAM là bộ nhớ trong, mất dữ liệu khi tắt máy.');
  await typeIn(page, 'Mệnh đề b', 'Ổ cứng là bộ nhớ trong của máy tính.');
  await page.getByLabel('Cách chấm').selectOption('ladder');
  await shot(page, 'nguoi-ra-de', '26-soan-chum-dung-sai', {
    full: true,
    marks: [
      {
        at: page.getByRole('textbox', { name: 'Mệnh đề a' }),
        text: 'Mỗi Mệnh đề là một ý đúng hoặc sai',
      },
      {
        at: page.getByLabel('Cách chấm'),
        text: 'Cách chấm: Bậc thang (đúng nhiều Mệnh đề hơn thì được nhiều điểm hơn)',
      },
    ],
  });
  await save(page);

  // Tự luận
  await chooseType(page, 'Tự luận');
  await typeIn(page, 'Phần dẫn', 'Trình bày sự khác nhau giữa RAM và ROM.');
  await typeIn(
    page,
    'Hướng dẫn chấm',
    'Nêu được RAM mất dữ liệu khi tắt nguồn, ROM giữ dữ liệu cố định.',
  );
  await shot(page, 'nguoi-ra-de', '27-soan-tu-luan', {
    full: true,
    marks: [
      {
        at: page.getByRole('textbox', { name: 'Hướng dẫn chấm' }),
        text: 'Hướng dẫn chấm: chỉ Người ra đề thấy, giúp chấm thống nhất',
      },
    ],
  });
  await save(page);
});
