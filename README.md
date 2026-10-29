# exam-system

Hệ thống kiểm tra đánh giá trực tuyến, ưu tiên làm bài trên điện thoại. Người ra đề xây dựng Bộ đề từ ngân hàng Câu hỏi của mình và tổ chức Phiên thi tại lớp hoặc phòng máy. Người dự thi đăng nhập, nhập Mã vào thi và làm bài ngay trên điện thoại hoặc máy tính.

> **Trạng thái:** đã xong đặc tả nghiệp vụ và kiến trúc, lát cắt 0 (khung dự án) và **lát cắt 1** (Người dùng, đăng nhập, Lời mời, Yêu cầu cấp tài khoản, Phiếu tài khoản). Lát cắt tiếp theo là 2 (Chủ đề, Câu hỏi). Muốn tự dùng thử những gì đã làm thì xem [Dùng thử lát cắt 1](#dùng-thử-lát-cắt-1).

## Tính năng giai đoạn 1

**Quản trị viên**
- Tạo Quản trị viên đầu tiên khi triển khai; chỉ định thêm Quản trị viên khác.
- Tạo link Lời mời để một người trở thành Người ra đề; duyệt Yêu cầu cấp tài khoản và xuất Phiếu tài khoản có mật khẩu tạm.
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
| Ngôn ngữ | TypeScript 6 (Node.js 24 LTS) |
| Backend | NestJS 12 (Fastify), Drizzle ORM, Socket.IO, BullMQ |
| Frontend | React 19 + Vite (PWA), TanStack Router/Query, Tailwind CSS, i18next |
| Soạn nội dung | TipTap, MathLive (soạn công thức), KaTeX (hiển thị) |
| Dữ liệu | PostgreSQL 17, Redis 7 |
| Kiểm thử | Vitest, Playwright (desktop và mobile); integration test chạy trên PostgreSQL và Redis thật trong pod |
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
                        ├─ worker  BullMQ: tự nộp bài, xử lý ảnh, Excel, Phiếu tài khoản, chốt kết quả
                        ├─ postgres  nơi lưu trữ gốc
                        └─ redis     phiên đăng nhập, hàng đợi, trạng thái online, cache
```

Backend chia module theo nghiệp vụ: `identity`, `audit`, `question-bank`, `exam`, `session`, `attempt`, `grading`, `realtime`. Chi tiết luồng nghiệp vụ, bảo mật và ước tính tải nằm trong [docs/architecture.md](docs/architecture.md).

## Cấu trúc monorepo

```
exam-system/
  apps/
    api/          NestJS (HTTP + WebSocket); worker BullMQ ở src/worker, cùng mã và cùng image
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

Chạy lần lượt từng bước (mỗi bước một lệnh, chờ xong rồi chạy bước sau):

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
cp apps/api/.env.example apps/api/.env && sed -i "s|^SLIP_ENCRYPTION_KEY=.*|SLIP_ENCRYPTION_KEY=$(openssl rand -base64 32)|" apps/api/.env
```

```bash
pnpm db:migrate
```

```bash
BOOTSTRAP_ADMIN_USERNAME=quantri BOOTSTRAP_ADMIN_FULL_NAME="Quản trị hệ thống" \
BOOTSTRAP_ADMIN_PASSWORD='mot-cum-tu-de-nho' pnpm cli bootstrap-admin
```

Sau đó mở **hai cửa sổ terminal** và để chúng chạy:

| Terminal | Lệnh | Việc làm |
|---|---|---|
| 1 | `pnpm dev` | api (cổng 3000) và web (cổng 5173), tự nạp lại khi sửa mã |
| 2 | `pnpm -C apps/api dev:worker` | worker: đọc file Excel, tạo tài khoản, dựng Phiếu tài khoản; tự khởi động lại khi terminal 1 build lại mã |

Chạy terminal 2 sau khi terminal 1 đã build xong (có thư mục `apps/api/dist`). **Không có worker** thì yêu cầu tải lên sẽ đứng ở "Đang đọc file".

Mở http://localhost:5173 và đăng nhập bằng tài khoản vừa tạo; lần đầu phải đổi mật khẩu. Trang http://localhost:5173/status hiển thị trạng thái PostgreSQL và Redis.

`make -C infra dev-up` tạo pod `dev-exam` gồm PostgreSQL (`127.0.0.1:5434`) và Redis (`127.0.0.1:6381`). Pod `ci-exam` dùng cổng 5435 và 6382. Tên pod và volume của dev, CI và production được tách riêng. Muốn bắt đầu lại từ đầu với dữ liệu trống: `make -C infra dev-down`, rồi chạy lại từ bước `dev-up`.

| Lệnh | Việc làm |
|---|---|
| `pnpm lint` / `pnpm format` | Kiểm tra / tự sửa lint và format (Biome) |
| `pnpm typecheck` | Kiểm tra kiểu toàn monorepo |
| `pnpm test` | Unit test |
| `pnpm test:integration` | Integration test trên database `exam_test` và Redis DB 15 của pod `dev-exam`; không đụng dữ liệu dev |
| `pnpm test:e2e` | Playwright (desktop + mobile), tự dựng api và worker riêng trên database `exam_e2e` và Redis DB 14; cần `pnpm -C apps/api build` trước |
| `pnpm db:generate` | Sinh migration từ `apps/api/src/db/schema.ts` |
| `pnpm db:migrate` | Áp migration vào database trong `DATABASE_URL` |
| `pnpm cli bootstrap-admin` | Tạo Quản trị viên đầu tiên (đọc biến `BOOTSTRAP_ADMIN_*`) |
| `pnpm cli recover-admin --username <tên>` | Mất quyền quản trị: mở khóa, in mật khẩu tạm mới (7 ngày), thu hồi mọi phiên |

## Dùng thử lát cắt 1

Mục này dẫn anh đi qua toàn bộ chức năng đã làm, theo đúng luồng nghiệp vụ đã thống nhất. Cần đã làm xong [Bắt đầu nhanh](#bắt-đầu-nhanh) với **cả hai terminal** đang chạy. Nên mở thêm một cửa sổ ẩn danh (hoặc trình duyệt khác) để đóng vai người thứ hai mà không bị lẫn phiên đăng nhập.

**1. Quản trị viên: Đơn vị**
1. Đăng nhập `quantri` (đổi mật khẩu lần đầu; mật khẩu mới ít nhất 10 ký tự, không dùng mật khẩu phổ biến).
2. Mục **Đơn vị** → **Thêm Đơn vị**: mã `CNTT`, tên `Khoa Công nghệ thông tin`.

**2. Quản trị viên: mời một Người ra đề bằng link**
1. Mục **Lời mời** → **Mời Người ra đề**: họ tên, email (ví dụ `giang.vien@example.edu.vn`), chọn Đơn vị.
2. Hệ thống **không gửi email** (giai đoạn 1): hộp thoại hiện link đúng một lần, bấm **Sao chép link** rồi **Tôi đã sao chép link**. Danh sách có **Thu hồi** và **Tạo lại link** (link cũ mất hiệu lực ngay).
3. Dán link vào **cửa sổ ẩn danh**. Người được mời thấy tên, email, Đơn vị; đặt mật khẩu, chọn học vị/học hàm (không bắt buộc), bấm **Tạo tài khoản và vào hệ thống**. Họ vào thẳng trang Người ra đề. Mở lại link đó lần nữa sẽ báo "không còn dùng được".
4. Thử thêm: mời một email đã có tài khoản, link sẽ yêu cầu đăng nhập đúng tài khoản đó rồi chỉ thêm vai trò Người ra đề.

**3. Người ra đề: gửi Yêu cầu cấp tài khoản cho Người dự thi** (cửa sổ ẩn danh)
1. Mục **Yêu cầu cấp tài khoản** → **Tải file mẫu** (Excel, có sheet hướng dẫn).
2. Chọn file [docs/samples/yeu-cau-cap-tai-khoan-mau.csv](docs/samples/yeu-cau-cap-tai-khoan-mau.csv) (hoặc điền file mẫu của anh), có thể ghi chú, bấm **Gửi yêu cầu**. File mẫu có 8 dòng: 5 người hợp lệ và 3 dòng cố ý sai (thiếu họ tên, email sai, trùng mã trong file) để xem hệ thống báo lỗi từng dòng.
3. Trang chi tiết tự cập nhật từ "Đang đọc file" sang "Chờ duyệt". Bảng dòng cho biết từng người: **Người mới** (sẽ được tạo), **Khớp tài khoản có sẵn**, **Khớp nhưng khác họ tên**, **Không duyệt được** kèm lý do (thiếu họ tên, email sai, trùng trong file...).

**4. Quản trị viên: duyệt và lấy Phiếu tài khoản** (cửa sổ chính)
1. Chuông thông báo trên thanh trên cùng có số chưa đọc (cập nhật mỗi 60 giây, hoặc tải lại trang). Bấm vào thông báo để mở yêu cầu.
2. Xem bảng dòng, lọc theo loại. Bấm **Duyệt các dòng hợp lệ** (người mới và người khớp đúng), hoặc tick từng dòng rồi **Duyệt dòng đã chọn / Từ chối dòng đã chọn**. Dòng "khác họ tên" chỉ được duyệt khi anh tick riêng: kiểm tra đúng là người đó.
3. Vài giây sau trạng thái đổi sau khi worker xong. Với file mẫu, 5 người hợp lệ được tạo tài khoản và 3 dòng lỗi không duyệt được nên yêu cầu thành "Duyệt một phần" (nếu mọi dòng đều thành công thì là "Đã duyệt"). Hiện thêm mục **Phiếu tài khoản**: **Tải PDF (in phát)** là phiếu A4, 8 phiếu mỗi trang, có tên đăng nhập, mật khẩu tạm và mã QR; **Tải Excel (tra cứu)** không có mật khẩu. Phiếu chỉ tải được trong **7 ngày** và mỗi lần tải được ghi vào Nhật ký thao tác.
4. Người ra đề (cửa sổ ẩn danh) cũng thấy và tải được phiếu của yêu cầu mình gửi.
5. Thử **Từ chối yêu cầu** ở một yêu cầu khác: người gửi nhận thông báo.

**5. Người dự thi: đăng nhập bằng mật khẩu tạm**
1. Đăng xuất, đăng nhập bằng tên đăng nhập và mật khẩu trên phiếu. Hệ thống buộc đổi mật khẩu rồi vào trang Người dự thi.
2. Quay lại bước 3 và tải lên **cùng file** một lần nữa: lần này các dòng thành **Khớp tài khoản có sẵn** (chỉ thêm vai trò, không tạo tài khoản trùng). Sửa họ tên một dòng trong file để thấy **Khớp nhưng khác họ tên**.

**6. Quản trị viên: quản lý Người dùng và nhật ký**
- **Người dùng**: tìm không dấu theo tên, mã, email, lớp; lọc theo trạng thái và Nhãn vai trò; mở một người để sửa thông tin, gắn/gỡ Nhãn vai trò, **Khóa đăng nhập** (bắt buộc lý do, người đó bị đăng xuất ngay), **Cấp lại mật khẩu tạm** (hiện một lần, hạn 7 ngày), **Xóa người dùng**. Có **Tạo Quản trị viên** cho người quản trị thứ hai.
- **Lịch sử đăng nhập** (bấm tên để lọc theo người) và **Nhật ký thao tác** (ai làm gì lúc nào, chỉ ghi thêm, không sửa được).
- **Giao diện sáng/tối**: nút **Tài khoản** ở góc phải trên cùng → chọn Hệ thống / Sáng / Tối. Thử thu nhỏ cửa sổ về cỡ điện thoại (khoảng 360 px): danh sách chuyển thành thẻ, nút đủ lớn để bấm.

## Vận hành

**Các tiến trình**

| Tiến trình | Lệnh (dev) | Ghi chú |
|---|---|---|
| web | `pnpm dev` (cổng 5173) | Vite, chuyển tiếp `/api` sang api |
| api | `pnpm dev` (cổng 3000) | NestJS; kiểm tra sức khỏe ở `/api/health` |
| worker | `pnpm -C apps/api dev:worker` | BullMQ: đọc file Excel, duyệt và tạo tài khoản, dựng Phiếu tài khoản, dọn dẹp hằng ngày lúc 3 giờ sáng. Production dùng `pnpm -C apps/api start:worker` (cùng image với api) |
| PostgreSQL, Redis | `make -C infra dev-up` | Redis đặt `noeviction` vì BullMQ cần |

**Biến môi trường của api và worker** (đặt trong `apps/api/.env`; xem `.env.example`)

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL` | có | Kết nối PostgreSQL và Redis |
| `SLIP_ENCRYPTION_KEY` | có | Khóa AES-256-GCM mã hóa Phiếu tài khoản: 32 byte dạng base64, tạo bằng `openssl rand -base64 32`. Mỗi môi trường một khóa riêng; **giữ kín và sao lưu riêng khỏi dữ liệu**. Mất khóa thì không mở lại được các phiếu còn hạn (phiếu chỉ sống 7 ngày; khi đó dùng "Cấp lại mật khẩu tạm") |
| `APP_ORIGINS` | production | Địa chỉ công khai của hệ thống, cách nhau bằng dấu phẩy; địa chỉ đầu tiên được in thành mã QR trên phiếu. Cũng là danh sách Origin được phép gửi request đổi dữ liệu (chống CSRF) |
| `MEDIA_DIR` | không | Thư mục lưu file tải lên tạm và Phiếu tài khoản (mặc định `./media-data`). Production: một volume cho cả api lẫn worker |
| `LOGIN_MAX_PER_IP` | không | Số lần thử đăng nhập tối đa mỗi IP trong 10 phút (mặc định 20) |
| `LOG_LEVEL`, `PORT` | không | Mức log và cổng của api |

**Sự cố thường gặp**
- *Worker báo lỗi rồi thoát (ví dụ `ENOENT ... dist/...`) hoặc nghi còn tiến trình worker cũ chạy ngầm*: gõ `pkill -f dist/worker/main.js` để tắt hết, đợi terminal 1 build xong rồi chạy lại `pnpm -C apps/api dev:worker`. Chỉ nên có đúng một worker.
- *Yêu cầu đứng mãi ở "Đang đọc file" hoặc "Đang tạo tài khoản"*: worker chưa chạy hoặc không nối được Redis. Bật worker rồi tải lại trang; yêu cầu kẹt quá 15 phút ở "Đang đọc file" sẽ được job dọn dẹp chuyển thành "File lỗi".
- *api hoặc worker không khởi động, báo `SLIP_ENCRYPTION_KEY`*: thiếu hoặc sai khóa; xem lệnh `sed` ở Bắt đầu nhanh.
- *Đăng nhập sai nhiều lần bị chặn 15 phút*: đúng thiết kế (Q47). Quản trị viên mở bằng **Cấp lại mật khẩu tạm**; chính Quản trị viên bị chặn thì dùng `pnpm cli recover-admin`.
- *Đổi cổng hoặc tên miền*: cập nhật `APP_ORIGINS`, nếu không các thao tác ghi sẽ bị từ chối với lỗi "Yêu cầu bị từ chối. Hãy tải lại trang".
- *Dữ liệu dev lộn xộn*: `make -C infra dev-down`, `make -C infra dev-up`, rồi `pnpm db:migrate` và tạo lại Quản trị viên.

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
| [docs/ui-design.md](docs/ui-design.md) | Thiết kế giao diện: màu, chữ, chế độ sáng/tối, thành phần, danh sách kiểm |
| [docs/plan/slice-1.md](docs/plan/slice-1.md) | Kế hoạch và các quyết định (Q43–Q99) của lát cắt 1 |
| [docs/adr](docs/adr) | Các quyết định kiến trúc đã duyệt |
| [AGENTS.md](AGENTS.md) | Hướng dẫn cho AI agent làm việc trên repo |

## Lộ trình

| Lát cắt | Nội dung |
|---|---|
| 0 | **Xong.** Khung monorepo, Podman pod cho dev/CI, pipeline GitHub Actions |
| 1 | **Xong.** Tạo Quản trị viên đầu tiên, đăng nhập, quản lý Người dùng, Lời mời, Yêu cầu cấp tài khoản, Phiếu tài khoản, giao diện sáng/tối |
| 2 | Chủ đề, Câu hỏi, Hình minh họa, soạn công thức, nhập Excel |
| 3 | Bộ đề, Phần, đặt điểm, Xem thử, Phát hành |
| 4 | Phiên thi, Mã vào thi, làm bài trên điện thoại, theo dõi phòng thi |
| 5 | Chấm, Công bố kết quả, Phúc khảo, Đính chính đáp án, xuất Excel |
| 6 | Triển khai production lên pod `prod-exam` |

Để giai đoạn sau: rút ngẫu nhiên câu hỏi, thống kê câu hỏi, nhập câu hỏi từ Word, tải ảnh vào Câu tự luận, giao diện tiếng Anh, gửi email, xác thực hai lớp cho Quản trị viên, chuyển sang VPS.

## Bản quyền

Mã nguồn đóng. © 2026 tvviem. Mọi quyền được bảo lưu; không được sao chép, phân phối hoặc sử dụng khi chưa có sự đồng ý bằng văn bản.
