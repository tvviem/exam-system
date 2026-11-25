# Dựng tài liệu hướng dẫn (Word)

Ba tài liệu hướng dẫn theo vai (Người dự thi, Người ra đề, Quản trị viên) được viết bằng Markdown ở `docs/huong-dan/tai-lieu/`.
Ảnh chụp màn hình và tệp Word **không** nằm trong repo (xuất ra thư mục `huong-dan-word/`, đã loại khỏi git).

## 1. Chụp ảnh

Bộ chụp là các kịch bản Playwright ở `apps/web/guide/` (không chạy trong CI). Mỗi lần chạy tạo lại CSDL thử và phát lại toàn bộ câu chuyện (khoảng 5 phút):

```
podman pod start ci-exam
cd apps/web
E2E_DATABASE_URL=postgres://exam:exam@127.0.0.1:5435/exam_e2e E2E_REDIS_URL=redis://127.0.0.1:6382/14 \
  pnpm exec playwright test -c playwright.guide.config.ts
```

Ảnh ra `huong-dan-word/anh/<thư-mục>/<tên>.png`, kèm `manifest.json` (chú thích và các điểm đánh số ①②③). Dữ liệu trong ảnh là dữ liệu hư cấu (`apps/web/guide/users.json`).

## 2. Dựng Word

Cần Python 3 với `python-docx`, `Pillow` (và `defusedxml`, `lxml` nếu muốn chạy bộ kiểm tra của skill docx):

```
python tools/huong-dan/dung-word.py --nguon docs/huong-dan/tai-lieu/nguoi-du-thi.md \
  --anh huong-dan-word/anh --ra huong-dan-word/HuongDan-NguoiDuThi-v0.5.3.docx \
  --phien-ban 0.5.3 --ngay 25/11/2026
```

Làm tương tự cho `nguoi-ra-de.md` và `quan-tri-vien.md`. Ảnh `nguoi-du-thi/` được đặt vào khung điện thoại.
Khi mở tệp trong Word, chọn **Có** nếu Word hỏi cập nhật các trường để mục lục có số trang.

`bang-xem.py` ghép nhiều ảnh thành một tấm để rà soát nhanh.

## 3. Quy ước

Nguồn Markdown là bản gốc cho tới khi chủ dự án chỉnh tay trong Word; sau đó Word là bản gốc và dựng lại sẽ ghi đè.
