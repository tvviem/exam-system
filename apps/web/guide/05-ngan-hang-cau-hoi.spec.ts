import path from 'node:path';
import { expect, test } from '@playwright/test';
import { chooseTopic } from '../e2e/topic-support';
import { openPage, shot, signIn } from './support';

// Người ra đề: Ngân hàng câu hỏi (Chủ đề, nhập từ Excel, soạn bốn Loại câu hỏi, danh sách) - tài liệu nguoi-ra-de.md.

const DEMO = (name: string) => path.resolve(process.cwd(), '../../demo-data', name);

test('Ngân hàng câu hỏi: Chủ đề, nhập Excel, soạn câu, danh sách', async ({ browser }) => {
  const page = await openPage(browser, 'desktop');
  await signIn(page, 'tran.mai');
  await page.goto('/examiner/questions');
  await expect(page.getByRole('heading', { name: 'Ngân hàng câu hỏi', level: 1 })).toBeVisible();

  // Trang trống ban đầu
  await shot(page, 'nguoi-ra-de', '10-ngan-hang-trong', {
    marks: [
      {
        at: page.getByRole('button', { name: 'Quản lý Chủ đề' }),
        text: 'Quản lý Chủ đề: tạo, đổi tên, xóa Chủ đề',
      },
      {
        at: page.getByRole('link', { name: 'Nhập từ Excel' }),
        text: 'Nhập nhiều câu hỏi cùng lúc từ file Excel',
      },
      {
        at: page.getByRole('button', { name: 'Soạn câu hỏi' }),
        text: 'Soạn từng câu hỏi bằng trình soạn',
      },
    ],
  });

  // Chủ đề
  await page.getByRole('button', { name: 'Quản lý Chủ đề' }).click();
  const manager = page.getByRole('dialog');
  await manager.getByLabel('Tên Chủ đề').fill('Tin học căn bản');
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText('Tin học căn bản')).toBeVisible();
  await manager.getByLabel('Tên Chủ đề').fill('Thiết kế kiến trúc hệ thống phần mềm');
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText('Thiết kế kiến trúc hệ thống phần mềm')).toBeVisible();
  await manager.getByLabel('Tên Chủ đề').fill('Cấu trúc dữ liệu');
  await shot(page, 'nguoi-ra-de', '11-quan-ly-chu-de', {
    marks: [
      {
        at: manager.getByLabel('Tên Chủ đề'),
        text: 'Gõ tên Chủ đề mới (không phân biệt hoa thường và dấu)',
      },
      { at: manager.getByRole('button', { name: 'Thêm Chủ đề' }), text: 'Bấm Thêm Chủ đề' },
    ],
  });
  await manager.getByLabel('Tên Chủ đề').fill('');
  await manager.getByRole('button', { name: 'Đóng', exact: true }).last().click();

  // Nhập từ Excel
  await page.getByRole('link', { name: 'Nhập từ Excel' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nhập câu hỏi từ Excel', level: 1 }),
  ).toBeVisible();
  await chooseTopic(page, 'Tin học căn bản');
  await page.getByLabel('File câu hỏi (.xlsx)').setInputFiles(DEMO('cau-hoi-tin-hoc-can-ban.xlsx'));
  await shot(page, 'nguoi-ra-de', '12-nhap-excel', {
    full: true,
    marks: [
      {
        at: page.getByRole('link', { name: 'Tải file mẫu trống' }),
        text: 'Tải file mẫu trống (mỗi Loại câu hỏi một sheet) để điền',
      },
      { at: page.getByLabel('Chủ đề', { exact: true }), text: 'Chọn Chủ đề sẽ chứa các câu hỏi' },
      { at: page.getByLabel('File câu hỏi (.xlsx)'), text: 'Chọn file Excel đã điền' },
      {
        at: page.getByRole('button', { name: 'Tải lên và xem trước' }),
        text: 'Bấm Tải lên và xem trước',
      },
    ],
  });
  await page.getByRole('button', { name: 'Tải lên và xem trước' }).click();
  await expect(page.getByRole('button', { name: /^Hợp lệ \(20\)/ })).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, 'nguoi-ra-de', '13-xem-truoc-nhap', {
    full: true,
    marks: [
      {
        at: page.getByRole('button', { name: /^Hợp lệ \(20\)/ }),
        text: 'Hợp lệ: các dòng sẽ được tạo',
      },
      {
        at: page.getByRole('button', { name: /^Chọn một/ }).first(),
        text: 'Lọc xem theo Loại câu hỏi',
      },
      {
        at: page.getByRole('button', { name: /^Tạo \d+ câu hỏi/ }),
        text: 'Bấm Tạo để đưa vào Ngân hàng câu hỏi',
      },
    ],
  });
  await page.getByRole('button', { name: /^Tạo \d+ câu hỏi/ }).click();
  await expect(page).toHaveURL(/\/examiner\/questions/, { timeout: 30_000 });

  // Nhập thêm bộ câu hỏi thứ hai cho Chủ đề kiến trúc (không chụp)
  await page.goto('/examiner/questions/import');
  await chooseTopic(page, 'Thiết kế kiến trúc hệ thống phần mềm');
  await page
    .getByLabel('File câu hỏi (.xlsx)')
    .setInputFiles(DEMO('cau-hoi-kien-truc-phan-mem.xlsx'));
  await page.getByRole('button', { name: 'Tải lên và xem trước' }).click();
  await expect(page.getByRole('button', { name: /^Hợp lệ \(20\)/ })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /^Tạo \d+ câu hỏi/ }).click();
  await expect(page).toHaveURL(/\/examiner\/questions/, { timeout: 30_000 });

  // Danh sách câu hỏi
  await page.goto('/examiner/questions');
  await expect(page.getByText('Chủ đề').first()).toBeVisible();
  await shot(page, 'nguoi-ra-de', '14-danh-sach-cau-hoi', {
    marks: [
      {
        at: page.getByRole('button', { name: /Tin học căn bản/ }).first(),
        text: 'Chọn Chủ đề ở cột bên trái để chỉ xem câu hỏi của Chủ đề đó',
      },
      { at: page.getByLabel('Tìm câu hỏi'), text: 'Tìm theo một phần nội dung (không cần gõ dấu)' },
      { at: page.getByLabel('Loại câu hỏi'), text: 'Lọc theo Loại câu hỏi, Trạng thái' },
      { at: page.getByRole('button', { name: 'Chọn tag' }), text: 'Lọc theo một hay nhiều tag' },
    ],
  });
  await page.getByLabel('Tìm câu hỏi').fill('mang');
  await expect(page.getByText('Mạng').filter({ visible: true }).first()).toBeVisible();
  await shot(page, 'nguoi-ra-de', '15-tim-khong-dau');
  await page.getByLabel('Tìm câu hỏi').fill('');

  // Lọc theo nhiều tag
  const size = page.viewportSize() as { width: number; height: number };
  await page.setViewportSize({ width: size.width, height: 1400 }); // đủ cao để hộp hiện trọn danh sách, không phải cuộn
  await page.getByRole('button', { name: 'Chọn tag' }).click();
  const chooser = page.getByRole('dialog', { name: 'Chọn tag' });
  for (const tag of ['chương 1', 'chương 2', 'nhận biết'])
    await chooser.getByRole('checkbox', { name: new RegExp(`^${tag}, `) }).check();
  await shot(page, 'nguoi-ra-de', '17-chon-tag', {
    marks: [
      { at: chooser.getByRole('searchbox', { name: 'Tìm tag' }), text: 'Tìm tag, không cần dấu' },
      {
        at: chooser.getByRole('radio', { name: 'Khớp tất cả' }),
        text: 'Cách khớp khi chọn từ hai tag',
      },
      {
        at: chooser.getByRole('checkbox', { name: /^chương 1, / }),
        text: 'Tích các tag cần lọc (kèm số câu)',
      },
    ],
  });
  await chooser.getByRole('button', { name: 'Xong' }).click();
  await page.setViewportSize(size);
  await expect(page.getByText(/^Đang lọc:/)).toBeVisible();
  await shot(page, 'nguoi-ra-de', '18-dang-loc-tag', {
    marks: [
      { at: page.getByText(/^Đang lọc:/), text: 'Điều đang lọc được ghi bằng chữ' },
      {
        at: page.getByRole('button', { name: 'Bỏ lọc: chương 2' }),
        text: 'Bấm × để gỡ một tag',
      },
    ],
  });
  await page.goto('/examiner/questions');

  // Chọn nhiều câu: thanh thao tác nổi
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500); // để danh sách tải xong hẳn, tránh bị tải lại làm mất lựa chọn
  await page
    .getByRole('checkbox', { name: 'Chọn mọi câu trên trang' })
    .filter({ visible: true })
    .check();
  await expect(page.getByRole('button', { name: 'Chuyển Chủ đề' })).toBeVisible();
  await shot(page, 'nguoi-ra-de', '16-chon-nhieu-cau', {
    settle: 0,
    marks: [
      {
        at: page.getByRole('button', { name: 'Chuyển Chủ đề' }),
        text: 'Chuyển các câu đã chọn sang Chủ đề khác',
      },
      {
        at: page.getByRole('button', { name: 'Lưu trữ', exact: true }),
        text: 'Lưu trữ: ẩn câu khỏi danh sách (Khôi phục lại được)',
      },
    ],
  });
});
