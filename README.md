# exam-system

Hệ thống kiểm tra đánh giá trực tuyến, ưu tiên làm bài trên điện thoại. Người ra đề xây dựng Bộ đề từ ngân hàng Câu hỏi của mình và tổ chức Phiên thi tại lớp hoặc phòng máy. Người dự thi đăng nhập, nhập Mã vào thi và làm bài ngay trên điện thoại hoặc máy tính.

> **Trạng thái:** đã xong giai đoạn đặc tả nghiệp vụ và kiến trúc; đang chuẩn bị lát cắt 0 (khung monorepo, hạ tầng, CI). Các lệnh trong mục [Bắt đầu nhanh](#bắt-đầu-nhanh) chỉ chạy được sau khi xong lát cắt 0.

## Tính năng giai đoạn 1

**Quản trị viên**
- Tạo Quản trị viên đầu tiên khi triển khai; chỉ định thêm Quản trị viên khác.
- Gửi Lời mời để một người trở thành Người ra đề; duyệt Yêu cầu cấp tài khoản và xuất Phiếu tài khoản có mật khẩu tạm.
- Gắn Nhãn vai trò (Người ra đề, Người dự thi); Khóa đăng nhập, Xóa người dùng, xem lịch sử đăng nhập và nhật ký thao tác.
- Chuyển giao Chủ đề khi Người ra đề nghỉ việc.

**Người ra đề**
- Quản lý Chủ đề và Câu hỏi thuộc sở hữu riêng.
  - 4 loại câu: chọn một, chọn nhiều, chùm đúng/sai, tự luận ngắn.
  - Hình minh họa, soạn công thức toán trực quan.
  - Nhập hàng loạt câu trắc nghiệm từ Excel.
- Soạn Bộ đề: chia Phần, dùng lại Câu hỏi giữa nhiều Bộ đề, đặt điểm nhanh, Xem thử, Phát hành.
- Tổ chức Phiên thi.
  - Thiết lập: Khung giờ, Thời lượng, Mã vào thi, số lượt làm bài, xáo trộn câu và phương án.
  - Lập Danh sách dự thi: tìm theo Lớp hoặc từng người.
- Theo dõi phòng thi trực tiếp: cộng giờ, cho phép đổi thiết bị, ghi nhận Vi phạm, Đình chỉ.
- Chấm Câu tự luận theo từng câu (có thể ẩn tên), Công bố kết quả, xử lý Phúc khảo, Đính chính đáp án, xuất Kết quả ra Excel.

**Người dự thi**
- Làm bài trên điện thoại với hai chế độ xem chuyển qua lại được: **1 câu** và **Cả đề**.
- Bài tự lưu, chịu được mạng chập chờn, đồng hồ do server quyết định, cảnh báo khi còn 5 phút và 1 phút.
- Xem Kết quả sau khi được Công bố: điểm từng câu và câu nào chưa đúng hoàn toàn, không lộ Đáp án đúng.
- Gửi Phúc khảo trong 72 giờ.

Định nghĩa đầy đủ của mọi thuật ngữ in hoa nằm trong [GLOSSARY.md](GLOSSARY.md).

## Bất biến của hệ thống

- Đáp án đúng chỉ tồn tại ở server; không API nào gửi nó cho Người dự thi, kể cả sau khi Công bố kết quả.
- Server quyết định thời gian làm bài và điểm số; client chỉ hiển thị.
- Câu trả lời được ghi vào PostgreSQL trước khi API báo "đã lưu".
- Bộ đề đã Phát hành dùng bản chụp nội dung; sửa Câu hỏi sau đó không làm thay đổi bài đã thi.

## Công nghệ

| Lớp | Lựa chọn |
|---|---|
| Ngôn ngữ | TypeScript (Node.js 24 LTS) |
| Backend | NestJS 11 (Fastify), Drizzle ORM, Socket.IO, BullMQ |
| Frontend | React 19 + Vite (PWA), TanStack Router/Query, Tailwind CSS, i18next |
| Soạn nội dung | TipTap, MathLive (soạn công thức), KaTeX (hiển thị) |
| Dữ liệu | PostgreSQL 17, Redis 7 |
| Kiểm thử | Vitest, Testcontainers, Playwright (desktop và mobile) |
| Hạ tầng | Podman pod (rootless), Cloudflare Tunnel, GitHub Actions, GHCR |

Lý do của từng lựa chọn nằm trong các ADR ở [docs/adr](docs/adr).

## Kiến trúc

```
Điện thoại / Máy tính (PWA)
        │ HTTPS + WebSocket
        ▼
Cloudflare Tunnel ──► Podman pod `prod-exam`
                        ├─ web     nginx: SPA tĩnh, proxy /api và /ws, phục vụ ảnh
                        ├─ api     NestJS modular monolith (HTTP + WebSocket)
                        ├─ worker  BullMQ: tự nộp bài, xử lý ảnh, Excel, email, chốt kết quả
                        ├─ postgres  nơi lưu trữ gốc
                        └─ redis     phiên đăng nhập, hàng đợi, trạng thái online, cache
```

Backend chia module theo nghiệp vụ: `identity`, `audit`, `question-bank`, `exam`, `session`, `attempt`, `grading`, `realtime`. Chi tiết luồng nghiệp vụ, bảo mật và ước tính tải nằm trong [docs/architecture.md](docs/architecture.md).

## Cấu trúc monorepo

```
exam-system/
  apps/
    api/          NestJS (HTTP + WebSocket)
    worker/       tiến trình BullMQ, dùng chung mã với api
    web/          React PWA: /admin, /examiner, /take
  packages/
    shared/       schema Zod dùng chung: Câu hỏi, Câu trả lời, Quy tắc chấm, DTO
    scoring/      hàm chấm điểm thuần (pure functions)
  infra/
    Makefile      dev-up, ci-up, prod-bootstrap (Podman pod)
    containers/   Containerfile cho api, web
    scripts/      bootstrap, backup, restore
  docs/           kiến trúc, mô hình dữ liệu, ADR
  .github/workflows/
```

## Yêu cầu môi trường

- Ubuntu (WSL2 hoặc máy thật), có bật systemd
- Node.js 24 LTS, pnpm (qua `corepack`)
- Podman 4.9 trở lên
- Git

## Bắt đầu nhanh

> Dự kiến; chạy được sau khi xong lát cắt 0.

```bash
git clone https://github.com/tvviem/exam-system.git
```

```bash
cd exam-system && corepack enable && pnpm install
```

```bash
make -C infra dev-up
```

```bash
pnpm db:migrate && pnpm cli bootstrap-admin
```

```bash
pnpm dev
```

`make -C infra dev-up` tạo pod `dev-exam` gồm PostgreSQL và Redis; tên pod và volume của dev, CI và production được tách riêng.

## Quy trình phát triển

- **Ngôn ngữ nghiệp vụ:** đặt tên biến, bảng, API và nội dung giao diện theo [GLOSSARY.md](GLOSSARY.md). Gặp khái niệm mới thì thống nhất và bổ sung glossary trước khi code.
- **Duyệt thiết kế trước khi code:** thay đổi kiến trúc hoặc mô hình dữ liệu được đề xuất bằng tài liệu hoặc ADR ở trạng thái `proposed`, rồi mới triển khai.
- **Nhánh và PR:** tạo nhánh từ `main`, mở pull request. CI phải xanh (lint, typecheck, unit, integration, e2e) trước khi merge.
- **Commit:** theo [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, ...).
- **Prototype:** đặt trên nhánh `prototype/*`, không merge vào `main`. Ví dụ: `prototype/exam-taking-ui`.
- **Agent:** Claude Code, Codex và Copilot cùng đọc [AGENTS.md](AGENTS.md); [CLAUDE.md](CLAUDE.md) nạp file này.

## Triển khai

Giai đoạn 1 chạy trên Podman pod `prod-exam` trên máy WSL Ubuntu, ra Internet qua Cloudflare Tunnel ([ADR-0006](docs/adr/0006-podman-pod-tren-wsl-qua-cloudflare-tunnel.md)). Mỗi lần push lên `main`, GitHub Actions:
1. Build image lên GHCR.
2. Trên runner self-hosted `wsl-exam`: sao lưu DB, chạy migration, thay lần lượt từng container, chạy smoke test.

Pipeline không deploy khi đang có Phiên thi diễn ra. Khi hệ thống ổn định sẽ chuyển sang VPS, dùng lại cùng image và Makefile. Chi tiết ở [docs/architecture.md](docs/architecture.md) mục 8 và 9.

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [GLOSSARY.md](GLOSSARY.md) | Thuật ngữ nghiệp vụ và tên dùng trong mã nguồn |
| [docs/architecture.md](docs/architecture.md) | Kiến trúc, luồng nghiệp vụ, bảo mật, trải nghiệm điện thoại, triển khai, phạm vi |
| [docs/data-model.md](docs/data-model.md) | Thiết kế bảng PostgreSQL, ràng buộc, công thức tính Kết quả |
| [docs/adr](docs/adr) | Các quyết định kiến trúc đã duyệt |
| [AGENTS.md](AGENTS.md) | Hướng dẫn cho AI agent làm việc trên repo |

## Lộ trình

| Lát cắt | Nội dung |
|---|---|
| 0 | Khung monorepo, Podman pod cho dev/CI, pipeline GitHub Actions |
| 1 | Tạo Quản trị viên đầu tiên, đăng nhập, quản lý Người dùng, Lời mời, Yêu cầu cấp tài khoản |
| 2 | Chủ đề, Câu hỏi, Hình minh họa, soạn công thức, nhập Excel |
| 3 | Bộ đề, Phần, đặt điểm, Xem thử, Phát hành |
| 4 | Phiên thi, Mã vào thi, làm bài trên điện thoại, theo dõi phòng thi |
| 5 | Chấm, Công bố kết quả, Phúc khảo, Đính chính đáp án, xuất Excel |
| 6 | Triển khai production lên pod `prod-exam` |

Để giai đoạn sau: rút ngẫu nhiên câu hỏi, thống kê câu hỏi, nhập câu hỏi từ Word, tải ảnh vào Câu tự luận, giao diện tiếng Anh, chuyển sang VPS.

## Bản quyền

Mã nguồn đóng. © 2026 tvviem. Mọi quyền được bảo lưu; không được sao chép, phân phối hoặc sử dụng khi chưa có sự đồng ý bằng văn bản.
