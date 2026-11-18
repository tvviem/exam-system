# Tên hệ thống (Q396–Q400)

Trạng thái: **accepted** (chủ dự án đồng ý ngày 18/11/2026). Nguồn sự thật duy nhất: mục "Tên hệ thống" ở đầu [GLOSSARY.md](../../GLOSSARY.md).

## Quyết định

| # | Quyết định |
|---|---|
| Q396 | Tên đầy đủ: **BLUni Exam - Hệ thống thi trực tuyến Trường Đại học Bạc Liêu**. Dùng "thi", không dùng "khảo thí" hay "kiểm tra đánh giá". |
| Q397 | Viết hoa "Trường"; cấu trúc "… Trường Đại học Bạc Liêu" (không dùng "tại"). |
| Q398 | Tên ngắn **BLUni Exam** giữ ở tiêu đề tab, PWA, tên người gửi thư và tiêu đề thư. |
| Q399 | Đồng bộ mọi nơi theo mục đầu GLOSSARY; các quyết định cũ giữ lịch sử, có ghi chú trỏ về tài liệu này. |
| Q400 | Production: `EMAIL_FROM_NAME=BLUni Exam`; **không đặt** `EMAIL_SYSTEM_NAME` (đã là mặc định trong mã, để một nguồn sự thật). |

## Căn cứ (từ chức năng hiện tại)

- "Thi" khớp với toàn bộ từ vựng của hệ thống: Phiên thi, Người dự thi, Danh sách dự thi, Mã vào thi, Phúc khảo.
- "Khảo thí" là tên chức năng và đơn vị cấp trường, rộng hơn thực tế: từng giảng viên tự tổ chức Phiên thi cho lớp của mình.
- "Kiểm tra đánh giá" mâu thuẫn với GLOSSARY (tránh "kiểm tra", "bài kiểm tra" thay cho thi).
- "Trực tuyến": làm bài trên web, không cài ứng dụng.
- "BLUni" là nhãn hiệu của Trường Đại học Bạc Liêu (`apps/web/src/assets/brand/README.md`).

## Hiện trạng trước khi đồng bộ (rà soát 18/11/2026)

| Cách gọi | Nằm ở |
|---|---|
| Hệ thống khảo thí trực tuyến BLUni | `AGENTS.md`, `README.md`, tiêu đề `GLOSSARY.md` |
| BLUni Exam - Hệ thống thi trực tuyến trường Đại học Bạc Liêu | mặc định `EMAIL_SYSTEM_NAME`, `docs/ops/gui-thu.md`, tài liệu thiết kế #109, bài kiểm thử thư |
| Hệ thống kiểm tra đánh giá (trực tuyến) | quyết định Q382 (`slice-7*.md`), dữ liệu mẫu trong bài kiểm thử thư |
| BLUni Exam (ngắn) | tiêu đề tab, PWA, `app.title`, tên người gửi thư |

## Đã đồng bộ

`GLOSSARY.md` (tiêu đề và mục Tên hệ thống), `README.md`, `AGENTS.md`, `apps/api/src/config/env.ts` (mặc định), `docs/ops/gui-thu.md`, các bài kiểm thử thư, tài liệu thiết kế #109, và ghi chú "đã được Q396 thay thế" ở Q382 (`slice-7.md`, `slice-7-phuong-an-b-email.md`, `slice-7b-thiet-ke-kiem-thu.md`).

## Production (`~/exam-prod-secrets/api.env`)

Tệp bí mật nên chủ dự án tự chạy bước này (Trợ lý không đọc): đặt `EMAIL_FROM_NAME=BLUni Exam` (giá trị không có dấu nháy vì Podman đọc `--env-file` nguyên văn) gỡ dòng `EMAIL_SYSTEM_NAME` nếu có, và **xóa dòng `SLIP_ENCRYPTION_KEY`** (khóa của Phiếu tài khoản, đã bỏ từ PR 7d-3; mã không đọc nữa và API khởi động được khi thiếu nó, bài D-43; script không in giá trị khóa này), **trước khi deploy** để các container nạp lại. Sau deploy gửi một thư thử (`make -C infra prod-mail-test ADDRESS=<email>`, xem [gui-thu.md](../ops/gui-thu.md)) và kiểm tên người gửi, tiêu đề, đầu thư.
