# exam-system

BLUni Exam, hệ thống thi trực tuyến của Trường Đại học Bạc Liêu, ưu tiên làm bài trên điện thoại. Người ra đề xây dựng Bộ đề từ ngân hàng Câu hỏi của mình và tổ chức Phiên thi tại lớp hoặc phòng máy. Người dự thi đăng nhập, nhập Mã vào thi và làm bài ngay trên điện thoại hoặc máy tính.

> **Trạng thái (25/11/2026):** **phiên bản 0.5.4 đang chạy thật** (các tag `v0.1.0` ngày 18/11 đến `v0.5.4` ngày 25/11; mỗi tag có một [Release trên GitHub](https://github.com/tvviem/exam-system/releases) ghi mã commit và điểm lùi, bảng đầy đủ ở [docs/ops/phat-hanh.md](docs/ops/phat-hanh.md) mục 8) trên Podman pod `prod-exam` tại `https://exam.plotrackerbluni.site`. Đã xong các lát cắt 0 đến 7: khung dự án; Người dùng, đăng nhập, Lời mời, Yêu cầu cấp tài khoản; Ngân hàng câu hỏi; Bộ đề; Phiên thi (làm bài trên điện thoại kể cả khi mất mạng, theo dõi phòng thi trực tiếp); chấm, Công bố kết quả, Phúc khảo, Đính chính; triển khai production kèm sao lưu và khôi phục; **tài khoản bằng email** (thư kích hoạt, quên mật khẩu, đổi và xác thực email, Lời mời tự gửi thư). Sau đó: bản 0.2.0 thêm [Xuất Bộ đề ra Word](docs/plan/xuat-bo-de-thiet-ke.md); bản 0.3.0 thêm [Rút câu theo Phần](docs/plan/rut-cau-theo-phan-thiet-ke.md) (một Bộ đề lớn, ví dụ 100 câu chia 4 Phần, dùng cho nhiều Phiên thi mà mỗi Người dự thi chỉ nhận một bộ câu rút, ví dụ 40 câu); **bản 0.5.0 thêm [Mã đề của Phiên thi](docs/plan/ma-de-phien-thi-thiet-ke.md)**: cả Phiên thi dùng chung một hay vài bộ câu (như đề giấy A, B, C), hệ thống chia Người dự thi vào các Mã đề, xuất Word từng Mã đề hoặc tất cả trong một tệp zip. Các bản 0.3.1 đến 0.5.4 chủ yếu chỉnh giao diện theo góp ý khi chạy thử: soạn Bộ đề thuận tay hơn, Bộ đề đã Phát hành có thẻ tổng quan và bộ lọc, Phiên thi và Kết quả gọn hơn trên điện thoại, Ngân hàng câu hỏi dễ đọc hơn, màn Vào thi bớt lặp, trợ năng, màn làm bài chế độ Từng câu lấy câu hỏi làm trung tâm ([thiết kế](docs/plan/take-tung-cau-thiet-ke.md); kế hoạch rà UX/UI ở [docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md](docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md)). `1.0.0` để dành cho khi hệ thống ổn định (xem [phat-hanh.md](docs/ops/phat-hanh.md) mục 7). **Hướng dẫn sử dụng theo vai** nằm ở [docs/huong-dan/](docs/huong-dan/README.md): ba tài liệu trọn bộ (Người dự thi, Người ra đề, Quản trị viên) viết bằng Markdown, kèm bộ công cụ chụp ảnh màn hình và dựng tệp Word ở [tools/huong-dan/](tools/huong-dan/README.md). Việc làm sau (định hướng mở, chưa lên lịch): [nguồn tham khảo của Câu hỏi và gợi ý ôn tập](docs/plan/mang-kien-thuc-va-on-tap-thiet-ke.md). Muốn tự dùng thử thì xem các mục "Dùng thử" bên dưới, mới nhất là [Dùng thử Mã đề của Phiên thi](#dùng-thử-mã-đề-của-phiên-thi-bản-050); hiệu năng đã đo ở [docs/hieu-nang.md](docs/hieu-nang.md).

## Tính năng giai đoạn 1

**Quản trị viên**
- Tạo Quản trị viên đầu tiên khi triển khai; chỉ định thêm Quản trị viên khác.
- Tạo link Lời mời để một người trở thành Người ra đề; duyệt Yêu cầu cấp tài khoản (mỗi người mới nhận một thư kích hoạt để tự đặt mật khẩu).
- Gắn Nhãn vai trò (Người ra đề, Người dự thi); Khóa đăng nhập, Xóa người dùng, xem lịch sử đăng nhập và nhật ký thao tác.
- Chuyển giao Chủ đề khi Người ra đề nghỉ việc; Bộ đề nháp có câu của Chủ đề đó đi theo. Xóa Người ra đề chuyển luôn mọi Bộ đề và Phiên thi của họ cho người nhận.
- Không Khóa đăng nhập hay Xóa được người đang trong Phiên thi đang diễn ra (trang người dùng báo rõ Phiên thi nào và vô hiệu hai nút).

**Tài khoản và thư** (lát cắt 7)
- Đăng nhập bằng email hoặc tên đăng nhập; Người dự thi nhận **thư kích hoạt** để tự đặt mật khẩu; **quên mật khẩu** thì xin liên kết đặt lại dùng một lần qua thư; đổi email phải **xác thực** bằng thư.
- **Lời mời** tự gửi thư, có Gửi lại và Thu hồi. Thư đi qua hàng đợi bền (mất mạng hay SMTP lỗi thì thử lại, không mất thư); Quản trị viên và Người ra đề của Người dự thi thấy ai chưa kích hoạt trước ngày thi, gửi lại thư hoặc sửa email.
- Yêu cầu cấp tài khoản chịu được nhiều giảng viên dạy chung một lớp và khớp được với tài khoản đã Xóa; dòng khớp tài khoản có sẵn được làm nổi bật khi duyệt.

**Người ra đề**
- Quản lý Chủ đề và Câu hỏi thuộc sở hữu riêng.
  - 4 loại câu: chọn một, chọn nhiều, chùm đúng/sai, tự luận ngắn.
  - Hình minh họa, soạn công thức toán trực quan.
  - Nhập hàng loạt câu hỏi cả bốn loại từ Excel (mỗi loại một sheet).
- Soạn Bộ đề: chia Phần, dùng lại Câu hỏi giữa nhiều Bộ đề, Đặt điểm nhanh, Xem thử, Phát hành, Nhân bản, Lưu trữ.
  - Phát hành chụp lại nội dung từng câu (bản chụp) và khóa Bộ đề; không có thao tác thu hồi.
  - Câu hỏi đã nằm trong Bộ đề không xóa được, chỉ Lưu trữ rồi Khôi phục.
  - **Rút câu theo Phần:** mỗi Phần có Tỷ lệ rút mặc định (ví dụ Bộ đề 100 câu chia 4 Phần, rút 40 % mỗi Phần thì mỗi người nhận 40 câu); báo ngay số câu mỗi người nhận và điểm tối đa; Phần rút dưới 100 % phải có các câu cùng điểm (chặn Phát hành nếu lệch); tỷ lệ đóng băng khi Phát hành. Không đặt tỷ lệ thì làm đủ mọi câu, như trước.
  - **Xuất Bộ đề ra Word** (.docx) theo Mẫu Trường: tệp Đề thi (công thức Word gốc, hình minh họa) và tệp Đáp án và thang điểm.
  - **Soạn thuận tay:** nút **Thêm câu hỏi** luôn nằm ở thanh dính phía dưới (đích mặc định là Phần đang xem); trong hộp chọn câu, nút **Xem** mở **Chi tiết câu hỏi** (đề bài, các phương án, đáp án đúng đánh dấu bằng màu và dấu ✓) trước khi thêm; nút chuyển nhanh giữa các Phần. Bộ đề đã Phát hành có **thẻ tổng quan** (tổng số câu, tổng điểm, mỗi Người dự thi nhận bao nhiêu câu và tối đa bao nhiêu điểm, bảng từng Phần để bấm nhảy tới), thanh chuyển nhanh giữa các Phần và **bộ lọc câu hỏi** theo nội dung hoặc tag.
- Tổ chức Phiên thi.
  - Thiết lập: Khung giờ, Thời lượng, Mã vào thi, số lượt làm bài, xáo trộn câu và phương án.
  - Lập Danh sách dự thi: tìm theo Lớp hoặc từng người.
  - **Rút câu:** Phiên thi kế thừa Tỷ lệ rút của Bộ đề và ghi đè từng Phần (đến khi có Lượt làm bài đầu tiên), nên một Bộ đề dùng được cho nhiều Phiên thi với tỷ lệ khác nhau; mỗi Người dự thi được rút bộ câu riêng khi vào thi lần đầu và giữ nguyên bộ đó ở mọi Lượt; **Xem thử** cho thấy một lượt rút mẫu.
  - **Mã đề:** chọn **Cách ra đề**: *dùng chung các Mã đề* (mặc định: 1 đến 10 bộ câu cố định, rút một lần khi lưu Phiên thi, như đề giấy A, B, C) hoặc *mỗi người một đề* (cách của bản 0.3.0). Mã đề **khác Mã vào thi**: Người dự thi vẫn chỉ nhập Mã vào thi, Mã đề do hệ thống gán. Người được thêm vào Danh sách dự thi nhận Mã đề ngay (chia cân bằng); Người ra đề xem số người từng Mã đề, **đổi tay** từng người, **Chia lại**, xem và **Rút lại** câu của từng Mã đề ở tab **Đề**; khóa từ Lượt làm bài đầu tiên. **Xuất Word** từng Mã đề hoặc tất cả trong một tệp zip kèm Excel phân Mã đề. Tab **Tổng quan** đặt Mã vào thi (kèm nút Sao chép) lên đầu.
- Theo dõi phòng thi trực tiếp (đã xong, lát cắt 4): Cộng giờ, Buộc nộp, Thu hồi thiết bị cho đổi máy, Cảnh cáo, Đình chỉ, Đóng cửa vào thi; số liệu cập nhật qua Socket.IO. Buộc nộp phải gõ lại Mã định danh (một người) hay số người (nhóm, cả phòng) mới bấm được; bấm nhầm thì **Hoàn tác Buộc nộp** trong 10 phút, Người dự thi tự về đề với các câu đã lưu còn nguyên.
- Chấm và Kết quả (lát cắt 5): Lượt vừa nộp được **chấm tự động** (ba Loại câu trắc nghiệm) trong vài giây; Người ra đề **chấm Câu tự luận** theo từng câu (ẩn tên, bằng bàn phím hoặc ngón tay, tự lưu), quyết **Mức xử lý** cho Vi phạm, xem **bảng Kết quả** và **Thống kê câu**, **Công bố kết quả** với Thời hạn phúc khảo 0–14 ngày, **xuất Excel**; có thể **Ủy quyền chấm** cho Người ra đề khác khi có sự cố.
- **Chấm theo bộ câu của từng người:** với Phiên thi rút câu, chấm điểm, điểm tối đa (ví dụ 40 điểm), thang 10, Phúc khảo, Theo dõi và Excel đều tính theo bộ câu mà người đó nhận; Excel có cột Điểm thô, Điểm tối đa, Điểm sau Mức xử lý và Điểm quy đổi (thang 10).
- **Phúc khảo** và **Đính chính đáp án** (lát cắt 5): xử lý Phúc khảo từng cái một (phím J/K), gia hạn Thời hạn phúc khảo, hệ thống nhắc khi quá hạn và tự **Chốt** khi hết hạn mà không còn Phúc khảo; phát hiện nhập sai đáp án thì đổi đáp án, xem trước bao nhiêu người đổi điểm rồi chấm lại cả phòng ở nền chỉ trong vài giây.

**Người dự thi**
- Vào thi bằng Mã vào thi; mỗi Phiên thi gắn với một thiết bị (Người ra đề cho đổi máy khi có sự cố).
- Phiên thi rút câu báo rõ trước khi bắt đầu "bài gồm N câu, rút ngẫu nhiên"; màn làm bài đánh số "Câu x/N" theo bộ câu của mình.
- Phiên thi có từ hai Mã đề thì Người dự thi thấy "Mã đề của bạn: Đề N" (ở màn xác nhận trước khi bắt đầu và ở đầu màn làm bài); màn Vào thi gọn: mỗi Phiên thi một thẻ, nút **Nhập mã** đưa con trỏ vào ô nhập.
- Làm bài trên điện thoại với hai chế độ xem chuyển qua lại được: **Từng câu** và **Cả đề**; cài như ứng dụng (PWA).
- Bài tự lưu, chịu được mạng chập chờn và tải lại trang khi mất mạng, đồng hồ do server quyết định, cảnh báo khi còn 5 phút và 1 phút; nhận ngay thông báo Cộng giờ, Cảnh cáo, Buộc nộp từ Người ra đề.
- Xem **Kết quả của tôi** sau khi Công bố (bản đồ câu ✓ ◐ ✗, lọc câu sai, xem từng câu một, không bao giờ thấy Đáp án đúng) và gửi **Phúc khảo** trong Thời hạn phúc khảo (tối đa 10 % số câu của bài mình, ít nhất 3); nhận thông báo khi được xử lý hoặc khi điểm đổi vì Đính chính.

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
                        ├─ worker  BullMQ: tự nộp bài quá hạn, xử lý ảnh, Excel, gửi thư, chấm tự động và chấm lại sau Đính chính, Chốt kết quả
                        ├─ postgres  nơi lưu trữ gốc
                        └─ redis     phiên đăng nhập, hàng đợi, trạng thái online, kênh tin đẩy
```

Backend chia module theo nghiệp vụ: `identity`, `audit`, `notifications`, `mail` (gửi thư qua hàng đợi bền, [ADR-0009](docs/adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md)), `backup` (sao lưu, khôi phục và cảnh báo cho Quản trị viên), `paper` (xuất Bộ đề ra Word theo mẫu của Trường: tệp Đề thi và tệp Đáp án), `question-bank`, `exam`, `session`, `attempt`, `realtime`, `grading` (chấm, Công bố, Phúc khảo, Đính chính). Module không đọc bảng của nhau mà nói chuyện qua các cổng trong `apps/api/src/common` (test kiến trúc `architecture.test.ts` giữ ranh giới này). Kênh đẩy Socket.IO (`/ws`) chỉ là phần tăng tốc: tin đẩy không mang dữ liệu, mất kênh thì heartbeat 15 giây và hỏi lại vẫn giữ mọi thứ đúng. Chi tiết luồng nghiệp vụ, bảo mật và ước tính tải nằm trong [docs/architecture.md](docs/architecture.md).

## Cấu trúc monorepo

```
exam-system/
  apps/
    api/          NestJS (HTTP + WebSocket); worker BullMQ ở src/worker, cùng mã và cùng image
      drizzle/    migration SQL (0000–0030)
      scripts/    load-exam (đo tải), demo-room (phòng thi thử), demo-data (file Excel mẫu)
    web/          React PWA: /admin, /examiner, /take; e2e/ là Playwright
  packages/
    shared/       schema Zod và luật thuần dùng chung (Câu hỏi, Phiên thi, Lượt, Rút câu, theo dõi, tin đẩy)
    scoring/      hàm chấm điểm thuần (pure functions)
  infra/
    Makefile      dev-up, dev-down, ci-up, ci-down (Podman pod)
    containers/   Containerfile cho api và web, nginx.conf
  demo-data/      file Excel dữ liệu demo (xem demo-data/README.md)
  docs/           kiến trúc, mô hình dữ liệu, ADR, kế hoạch từng lát cắt (plan/), vận hành (ops/)
  .github/workflows/ci.yml
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
cp apps/api/.env.example apps/api/.env
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
| 2 | `pnpm -C apps/api dev:worker` | worker: đọc file Excel, tạo tài khoản, gửi thư kích hoạt; tự khởi động lại khi terminal 1 build lại mã |

Chạy terminal 2 sau khi terminal 1 đã build xong (có thư mục `apps/api/dist`). **Không có worker** thì yêu cầu tải lên sẽ đứng ở "Đang đọc file".

Mở http://localhost:5173 và đăng nhập bằng tài khoản vừa tạo; lần đầu phải đổi mật khẩu. Trang http://localhost:5173/status hiển thị trạng thái PostgreSQL và Redis.

`make -C infra dev-up` tạo pod `dev-exam` gồm PostgreSQL (`127.0.0.1:5434`) và Redis (`127.0.0.1:6381`). Pod `ci-exam` dùng cổng 5435 và 6382. Tên pod và volume của dev, CI và production được tách riêng. Muốn bắt đầu lại từ đầu với dữ liệu trống: `make -C infra dev-down`, rồi chạy lại từ bước `dev-up`.

| Lệnh | Việc làm |
|---|---|
| `pnpm lint` / `pnpm format` | Kiểm tra / tự sửa lint và format (Biome); cảnh báo cũng làm `pnpm lint` thất bại (`--error-on-warnings`) |
| (tự bật khi `pnpm install`) | Hook `pre-commit` (`.githooks/`): Biome kiểm các tệp đã đưa vào commit, có lỗi hoặc cảnh báo thì từ chối; bỏ qua tạm bằng `git commit --no-verify`; kiểm thử: `sh .githooks/pre-commit.test.sh` |
| `pnpm typecheck` | Kiểm tra kiểu toàn monorepo |
| `pnpm test` | Unit test |
| `pnpm test:integration` | Integration test trên database `exam_test` và Redis DB 15 của pod `dev-exam`; không đụng dữ liệu dev |
| `pnpm test:e2e` | Playwright (desktop + mobile), tự dựng api và worker riêng trên database `exam_e2e` và Redis DB 14; cần `pnpm -C apps/api build` trước |
| `pnpm db:generate` | Sinh migration từ `apps/api/src/db/schema.ts` |
| `pnpm db:migrate` | Áp migration vào database trong `DATABASE_URL` |
| `pnpm -C apps/api demo:room` | Phòng thi thử có người dự thi giả (xem Dùng thử lát cắt 4); `--clean` để dọn |
| `pnpm -C apps/api load:exam` | Đo tải (100 hoặc 500 người); không chạy trong CI |
| `pnpm -C apps/api demo:data` | Sinh lại file Excel dữ liệu demo ở `demo-data/` |
| `pnpm cli bootstrap-admin` | Tạo Quản trị viên đầu tiên (đọc biến `BOOTSTRAP_ADMIN_*`) |
| `pnpm cli recover-admin --username <tên>` | Mất quyền quản trị: mở khóa, in mật khẩu tạm mới (7 ngày), thu hồi mọi phiên |

## Dùng thử lát cắt 1

Mục này dẫn anh đi qua toàn bộ chức năng đã làm, theo đúng luồng nghiệp vụ đã thống nhất. Cần đã làm xong [Bắt đầu nhanh](#bắt-đầu-nhanh) với **cả hai terminal** đang chạy. Nên mở thêm một cửa sổ ẩn danh (hoặc trình duyệt khác) để đóng vai người thứ hai mà không bị lẫn phiên đăng nhập.

**Điều hướng:** từ 1024 px (laptop) menu là thanh bên trái; trên máy tính bảng và điện thoại là thanh tab dưới đáy với 4 mục chính và nút **Thêm** (chứa Lịch sử đăng nhập, Nhật ký thao tác). Chuông thông báo và nút **Tài khoản** ở góc phải trên cùng.

**1. Quản trị viên: Đơn vị**
1. Đăng nhập `quantri` (đổi mật khẩu lần đầu; mật khẩu mới ít nhất 10 ký tự, không dùng mật khẩu phổ biến).
2. Mục **Đơn vị** → **Thêm Đơn vị**: mã `CNTT`, tên `Khoa Công nghệ thông tin`.

**2. Quản trị viên: mời một Người ra đề bằng link**
1. Mục **Lời mời** → **Mời Người ra đề**: họ tên, email (ví dụ `giang.vien@example.edu.vn`), chọn Đơn vị.
2. Hệ thống **tự gửi thư mời** tới email đó (ở máy phát triển chưa cấu hình SMTP thì thư được **in ra cửa sổ worker**; xem [docs/ops/gui-thu.md](docs/ops/gui-thu.md) cho production). Liên kết trong thư dùng được một lần, hạn 7 ngày kể từ lúc gửi. Danh sách có **Gửi lại thư mời** (liên kết cũ mất hiệu lực ngay) và **Thu hồi**.
3. Dán link vào **cửa sổ ẩn danh**. Người được mời thấy tên, email, Đơn vị; đặt mật khẩu, chọn học vị/học hàm (không bắt buộc), bấm **Tạo tài khoản và vào hệ thống**. Họ vào thẳng trang Người ra đề. Mở lại link đó lần nữa sẽ báo "không còn dùng được".
4. Thử thêm: mời một email đã có tài khoản, link sẽ yêu cầu đăng nhập đúng tài khoản đó rồi chỉ thêm vai trò Người ra đề.

**3. Người ra đề: gửi Yêu cầu cấp tài khoản cho Người dự thi** (cửa sổ ẩn danh)
1. Mục **Yêu cầu cấp tài khoản** → **Tải file mẫu** (Excel, có sheet hướng dẫn).
2. Chọn file [docs/samples/yeu-cau-cap-tai-khoan-mau.csv](docs/samples/yeu-cau-cap-tai-khoan-mau.csv) (hoặc điền file mẫu của anh), có thể ghi chú, bấm **Gửi yêu cầu**. File mẫu có 8 dòng: 5 người hợp lệ và 3 dòng cố ý sai (thiếu họ tên, email sai, trùng mã trong file) để xem hệ thống báo lỗi từng dòng.
3. Trang chi tiết tự cập nhật từ "Đang đọc file" sang "Chờ duyệt". Bảng dòng cho biết từng người: **Người mới** (sẽ được tạo), **Khớp tài khoản có sẵn**, **Khớp nhưng khác họ tên**, **Không duyệt được** kèm lý do (thiếu họ tên, email sai, trùng trong file...).

**4. Quản trị viên: duyệt Yêu cầu** (cửa sổ chính)
1. Chuông thông báo trên thanh trên cùng có số chưa đọc (cập nhật mỗi 60 giây, hoặc tải lại trang). Bấm vào thông báo để mở yêu cầu.
2. Xem bảng dòng, lọc theo loại. Bấm **Duyệt các dòng hợp lệ** (người mới và người khớp đúng), hoặc tick từng dòng rồi **Duyệt dòng đã chọn / Từ chối dòng đã chọn**. Dòng "khác họ tên" chỉ được duyệt khi anh tick riêng: kiểm tra đúng là người đó.
3. Vài giây sau trạng thái đổi sau khi worker xong. Với file mẫu, 5 người hợp lệ được tạo tài khoản và 3 dòng lỗi không duyệt được nên yêu cầu thành "Duyệt một phần" (nếu mọi dòng đều thành công thì là "Đã duyệt"). Mỗi người mới ở trạng thái **Chờ kích hoạt** và được xếp một thư kích hoạt (không có mật khẩu tạm, không ai biết mật khẩu của họ). Trang Yêu cầu hiện bảng **Theo dõi kích hoạt**: ai đã gửi thư, thư lỗi, cần kiểm tra, đã kích hoạt; có nút Gửi lại, Sửa email, Liên kết hỗ trợ.
4. Người ra đề (cửa sổ ẩn danh) cũng thấy bảng theo dõi kích hoạt của yêu cầu mình gửi.
5. Thử **Từ chối yêu cầu** ở một yêu cầu khác: người gửi nhận thông báo.

**5. Người dự thi: kích hoạt bằng thư**
1. Ở máy phát triển chưa cấu hình SMTP nên thư kích hoạt được **in ra cửa sổ worker**: mở liên kết `/activate#…` trong đó, tự đặt mật khẩu, rồi đăng nhập bằng tên đăng nhập (mã định danh viết thường, hoặc email) để vào trang Người dự thi.
2. Quay lại bước 3 và tải lên **cùng file** một lần nữa: lần này các dòng thành **Khớp tài khoản có sẵn** (chỉ thêm vai trò, không tạo tài khoản trùng). Sửa họ tên một dòng trong file để thấy **Khớp nhưng khác họ tên**.

**6. Quản trị viên: quản lý Người dùng và nhật ký**
- **Người dùng**: tìm không dấu theo tên, mã, email, lớp; lọc theo trạng thái và Nhãn vai trò; mở một người để sửa thông tin, gắn/gỡ Nhãn vai trò, **Khóa đăng nhập** (bắt buộc lý do, người đó bị đăng xuất ngay), **Cấp lại mật khẩu tạm** (hiện một lần, hạn 7 ngày), **Xóa người dùng**. Có **Tạo Quản trị viên** cho người quản trị thứ hai.
- **Lịch sử đăng nhập** (bấm tên để lọc theo người) và **Nhật ký thao tác** (ai làm gì lúc nào, chỉ ghi thêm, không sửa được).
- **Giao diện sáng/tối**: nút **Tài khoản** ở góc phải trên cùng → chọn Hệ thống / Sáng / Tối. Thử thu nhỏ cửa sổ về cỡ điện thoại (khoảng 360 px): danh sách chuyển thành thẻ, nút đủ lớn để bấm.

## Dùng thử lát cắt 2

Cần như lát cắt 1: cả hai terminal đang chạy (worker xử lý ảnh và đọc file Excel), một Quản trị viên và ít nhất hai Người ra đề (mời qua **Lời mời**).

1. **Soạn câu hỏi** (Người ra đề): **Ngân hàng câu hỏi** → **Quản lý Chủ đề** → thêm Chủ đề → **Soạn câu hỏi**, chọn một trong 4 Loại. Thử công thức (nút Σ, gõ LaTeX hoặc dùng bàn phím toán), chèn **Hình minh họa** (bắt buộc mô tả), xem trước bên phải (tab **Xem thử** trên điện thoại). Điểm từ 0,05 đến 100, bước 0,05. Rời trang khi còn thay đổi chưa lưu sẽ được hỏi; lưu xong thì không.
2. **Nhập từ Excel**: nút **Nhập từ Excel** → tải **file ví dụ** (8 câu, 4 Loại) hoặc **file mẫu trống** (sheet "Hướng dẫn" giải thích từng cột) → chọn Chủ đề, tải lên, xem trước từng dòng (lọc theo trạng thái và Loại, bỏ chọn dòng, xem nội dung), **Tạo N câu hỏi**. **Hủy lô** nếu cần sửa file rồi tải lại.
3. **Chuyển giao** (Quản trị viên): **Người dùng** → mở một Người ra đề → thẻ **Nội dung** → tick Chủ đề → **Chuyển giao…** → chọn người nhận. Chủ đề trùng tên được thêm "(từ …)"; Hình minh họa đi theo Câu hỏi; người nhận có thông báo.
4. **Xóa người dùng còn Chủ đề**: **Xóa người dùng** → hộp thoại tự chuyển sang bước chọn người nhận (**Chuyển giao và xóa**).

## Dùng thử lát cắt 3

Cần như lát cắt 2 (không cần worker cho lát cắt này). Sau khi lấy mã mới, chạy `pnpm db:migrate` để áp migration `0011_exam_publish` (thêm bảng `exam_item_illustrations` và các trigger bảo vệ Bộ đề đã Phát hành; không đổi dữ liệu cũ). Cần ít nhất hai Người ra đề và một Quản trị viên.

1. **Soạn Bộ đề** (Người ra đề): menu **Bộ đề** → **Tạo Bộ đề**. Thêm Phần, **Thêm câu hỏi** (từ ngân hàng) (lọc như ở ngân hàng; câu đã có trong Bộ đề hiện "Đã có"), đặt điểm từng câu (nhãn "Điểm", từ 0,05 đến 100, bước 0,05), **Lưu**. Mỗi câu chỉ xuất hiện một lần trong Bộ đề, tối đa 200 câu. Trong hộp chọn câu: tick một câu rồi giữ **Shift** và tick câu khác để chọn cả dải ở giữa; ô **Chọn cả N câu trên trang này** chọn nhanh cả trang; các câu đã chọn được giữ khi đổi trang hoặc bộ lọc (dòng "Đã chọn N câu", nút **Bỏ chọn tất cả**).
2. **Đặt điểm nhanh**: nút **Đặt điểm nhanh** → chọn phạm vi (cả Bộ đề, một Phần hoặc một Loại câu hỏi) → "mỗi câu cùng điểm" (ví dụ 0,25) hoặc "chia đều một tổng" (ví dụ 10 điểm cho 40 câu); có bản xem trước trước khi áp dụng. Chỉ đổi điểm trong Bộ đề này, không đổi điểm mặc định của Câu hỏi. Thay đổi chỉ áp vào bản đang soạn, nhớ bấm **Lưu**. Phải **Lưu** trước khi bấm **Phát hành…**.
3. **Xem thử**: tab **Xem thử** cạnh tab **Soạn** hiện Bộ đề như Người dự thi sẽ thấy: đánh số câu, điểm, tổng điểm, **không có Đáp án**. Công tắc "Hiện cách tính điểm" chỉ để so sánh hai kiểu hiển thị, không được lưu. Bộ đề nháp lấy nội dung hiện tại của Câu hỏi.
4. **Phát hành**: nút **Phát hành…** kiểm tra trước và liệt kê vấn đề cần sửa (thiếu tiêu đề, Bộ đề rỗng, Phần rỗng, câu đã Lưu trữ hoặc không còn hợp lệ, ảnh chưa xử lý xong, điểm sai). Hết vấn đề thì hiện hộp xác nhận.
5. **Bộ đề đã Phát hành**: chuyển sang chỉ đọc, cả hai tab Soạn và Xem thử đều hiện nội dung **bản chụp** lúc Phát hành. Sửa hay Lưu trữ Câu hỏi gốc sau đó không đổi Bộ đề này. Còn dùng được **Nhân bản** (tạo Bộ đề nháp mới, tên thêm "(bản sao)") và **Lưu trữ** / **Khôi phục** Bộ đề (Bộ đề đã Lưu trữ ẩn khỏi danh sách mặc định, lọc theo trạng thái để xem).
6. **Lưu trữ Câu hỏi**: ở danh sách Câu hỏi, tick câu → **Lưu trữ** (hoặc lọc "Đã lưu trữ" → **Khôi phục**). Câu ẩn khỏi danh sách mặc định và khỏi bảng chọn câu khi soạn Bộ đề mới, nhưng không mất. Trình soạn Câu hỏi cho biết câu đang dùng ở bao nhiêu Bộ đề nháp và Bộ đề đã Phát hành.
7. **Chuyển giao Chủ đề** (Quản trị viên): như lát cắt 2, nay hộp thoại báo thêm số Bộ đề nháp sẽ chuyển và số câu bị gỡ khỏi các Bộ đề đó (câu thuộc Chủ đề không chuyển). Bộ đề đã Phát hành ở lại người cũ. **Xóa người dùng**: mọi Bộ đề (nháp, Phát hành, Lưu trữ) sang người nhận; người chỉ còn Bộ đề cũng phải chọn người nhận. Người nhận có thông báo kèm số Bộ đề.

**Lưu ý khi dùng**
- **Phát hành không hoàn tác.** Sau đó cơ sở dữ liệu chặn mọi sửa nội dung Bộ đề, kể cả bằng SQL trực tiếp. Muốn đổi thì Nhân bản thành nháp mới. Kiểm tra kỹ bằng tab Xem thử trước khi Phát hành.
- **Câu hỏi nằm trong Bộ đề không xóa được.** Bộ đề nháp: gỡ câu khỏi Bộ đề trước. Bộ đề đã Phát hành: chỉ Lưu trữ, vì bản chụp cần câu gốc để truy ngược khi chấm và phúc khảo.
- **Bộ đề chưa có Phiên thi.** Lát cắt này chỉ tạo và Phát hành Bộ đề; chưa tổ chức thi (lát cắt 4).
- Quản trị viên không đọc được Bộ đề của Người ra đề; chỉ chủ sở hữu thấy.
- Khi Xóa người dùng, ảnh chỉ còn nằm trong bản chụp (không còn ở Câu hỏi nào) vẫn thuộc người đã xóa; chủ Bộ đề vẫn xem được ảnh đó. Hộp "Bộ lọc" trên điện thoại ở danh sách Câu hỏi dùng chung `id` với thanh lọc (lỗi có từ trước, chưa sửa).

## Dùng thử lát cắt 4

Cần như lát cắt 3 và `pnpm db:migrate` (migration `0012`–`0015`: Phiên thi, Lượt làm bài, theo dõi, chỉ mục Đình chỉ). Chạy `podman pod start dev-exam` nếu pod đang dừng, rồi `pnpm dev`. Từng tính năng có bảng "Cách thử, mong đợi" trong [docs/plan/slice-4.md](docs/plan/slice-4.md) (các mục Hướng dẫn thử 4c-1, 4c-2, 4c-3, 4d-2, 4d-3).

**Cách nhanh nhất: phòng thi thử có sẵn người dự thi giả.** Dựng một Phiên thi thử và cho N người dự thi giả (mặc định 120) đi qua API thật, nên màn Theo dõi hiện như một kỳ thi thật mà không cần mở nhiều trình duyệt. Thêm dòng `LOGIN_MAX_PER_IP=100000` vào `apps/api/.env` (mô phỏng đăng nhập hàng trăm lần từ một máy), chạy lại `pnpm dev`, rồi:

```bash
pnpm -C apps/api build
pnpm -C apps/api demo:room                      # 120 người, Thời lượng 30 phút
pnpm -C apps/api demo:room --users 300 --minutes 45
pnpm -C apps/api demo:room --clean              # xóa mọi dữ liệu demo-*
```

Lệnh in địa chỉ màn Theo dõi và tài khoản `demo-gv`; đăng nhập tài khoản đó ở một cửa sổ ẩn danh. Cứ 20 người giả có 1 hay rời tab, 1 mất mạng 3 phút, 2 làm rất chậm; số còn lại nộp bài sau khoảng 70–95% Thời lượng. Dừng mô phỏng bằng Ctrl-C (dữ liệu còn nguyên); `--clean` chỉ xóa dữ liệu `demo-*`.

**Người ra đề** (đăng nhập `demo-gv`, hoặc tự tạo Phiên thi ở menu **Phiên thi**)
1. Tạo Phiên thi: chọn Bộ đề đã Phát hành, Khung giờ, Thời lượng, Mã vào thi; lập **Danh sách dự thi** theo Lớp hoặc từng người. **Xem thử** để thấy đề như Người dự thi mà không ghi gì.
2. Tab **Theo dõi**: ba chế độ Thẻ, Bảng, Lưới (30, 120, 300 người); chip **Cần chú ý** (mất kết nối, rời màn hình nhiều lần, thiết bị lạ, làm chậm); dòng "Cập nhật trực tiếp" khi kênh đẩy đang nối.
3. Thao tác: chọn một người, nhóm hoặc cả phòng rồi **Cộng giờ**, **Buộc nộp**; trên một người: **Cảnh cáo**, **Đình chỉ**, **Thu hồi thiết bị** (và Hoàn tác Thu hồi); cả phòng: **Đóng cửa vào thi**. Mọi thao tác nặng đều qua hộp xác nhận nêu số người.
4. Đóng tab Theo dõi rồi mở lại (hoặc mở trên máy khác): Người dự thi không bị ảnh hưởng, màn hình quản lý hiện lại đủ.

**Người dự thi** (điện thoại, hoặc Chrome giả lập 360 × 780; chỉ chạy trên `localhost` hoặc HTTPS)
1. Vào **Làm bài**, nhập Mã vào thi, xác nhận, **Bắt đầu làm bài**. Hai chế độ **Từng câu** và **Cả đề**; đánh dấu câu; lưới câu; nút **Aa** đổi cỡ chữ, kiểu chữ, sáng/tối.
2. Bài tự lưu; bật Offline vẫn làm tiếp, có mạng lại tự gửi (thử ở bản dựng thật: `pnpm -C apps/web build && pnpm -C apps/web preview`, cổng 4173).
3. Khi Người ra đề Cộng giờ, Cảnh cáo, Buộc nộp hoặc Thu hồi thiết bị, màn hình đổi trong chưa đến 1 giây.

**Quản trị viên**
1. Mở một Người ra đề hay Người dự thi đang trong Phiên thi đang diễn ra: có dải cảnh báo nêu Phiên thi, và nút **Khóa đăng nhập**, **Xóa người dùng** bị vô hiệu kèm lý do. Hết Phiên thi, hoặc Người ra đề đã Buộc nộp hay Đình chỉ người đó, thì làm được.
2. **Xóa Người ra đề**: hộp xác nhận nêu số Phiên thi (sắp mở, đã xong, đã Hủy) sẽ chuyển cùng Chủ đề và Bộ đề; cảnh báo nếu người nhận đang có tên trong Danh sách của Phiên thi sắp nhận. Người nhận có thông báo và mở được Theo dõi của Phiên thi vừa nhận.

**Đo tải:** `LOAD_USERS=100 nice -n 19 pnpm -C apps/api load:exam` (khoảng 2 phút); 500 người: `LOAD_API_INSTANCES=2 LOAD_USERS=500 nice -n 19 pnpm -C apps/api load:exam` (khoảng 5 phút; một bản api không đủ cho 500 người cùng Cộng giờ). Số đo ở [docs/architecture.md](docs/architecture.md) mục 11.

## Dùng thử lát cắt 5

Cần như lát cắt 4 và `pnpm db:migrate` (migration `0017`–`0021`: chấm, thiết lập chấm và Công bố, Phúc khảo, Đính chính). Chạy cả `pnpm dev` và worker (`pnpm -C apps/api dev:worker`): chấm tự động, chấm lại và job Chốt chạy ở worker.

**Cách nhanh nhất:** phòng thi thử đi tiếp sau giờ thi. Chuẩn bị như lát cắt 4 (`LOGIN_MAX_PER_IP=100000`, `pnpm -C apps/api build`), rồi:

```bash
pnpm -C apps/api demo:room --users 20 --through grade     # nộp xong, chấm tự động xong; bạn tự chấm 2 câu Tự luận
pnpm -C apps/api demo:room --users 20 --through release   # script chấm Tự luận và Công bố giúp
pnpm -C apps/api demo:room --users 20 --through appeal    # như trên, có sẵn 10 Phúc khảo chờ xử lý
pnpm -C apps/api demo:room --clean                        # xóa mọi dữ liệu demo-*
```

Bộ đề thử 20 câu đủ bốn Loại. Người ra đề `demo-gv`, Người dự thi `demo-sv001`…, mật khẩu `Demo-Phong-Thi-123`. Hướng dẫn từng bước cho người dùng nằm ở [docs/huong-dan/cham-diem-va-phuc-khao.md](docs/huong-dan/cham-diem-va-phuc-khao.md); bảng "Cách thử, mong đợi" chi tiết ở [docs/plan/slice-5.md](docs/plan/slice-5.md).

**Đo tải sau giờ thi:** `LOAD_USERS=100 nice -n 19 pnpm -C apps/api load:exam` (khoảng 4 phút; Bộ đề 40 câu, cả phòng bị Buộc nộp cùng lúc rồi chấm, Công bố, Phúc khảo, Đính chính). Số đo và cách đọc ở [docs/hieu-nang.md](docs/hieu-nang.md).

## Dùng thử Rút câu theo Phần (bản 0.3.0)

Cần như lát cắt 5 và `pnpm db:migrate` (migration `0028`, `0029`: tỷ lệ rút mặc định ở Bộ đề và ghi đè ở Phiên thi, đều chỉ thêm bảng và trigger khóa). Cách thử nhanh bằng giao diện:

1. Soạn một Bộ đề, **Chia Phần**, thêm câu vào từng Phần (Phần rút dưới 100 % cần các câu cùng điểm: dùng **Đặt điểm nhanh**), rồi nhập **Rút câu từ Phần này** (ví dụ 40 cho Phần có 10 câu). Dòng tóm tắt cho biết mỗi người nhận bao nhiêu câu và điểm tối đa.
2. Phát hành, tạo Phiên thi: ở bước *Thiết lập làm bài* có khối **Rút câu theo Phần** (kế thừa Bộ đề, **Thay đổi cho Phiên thi này** để ghi đè). **Xem thử** cho một lượt rút mẫu.
3. Hai Người dự thi vào thi trên hai thiết bị: bộ câu của họ khác nhau, "Câu x/N" đúng số câu rút; sau khi chấm và Công bố, Kết quả và Excel tính theo bộ câu riêng (điểm tối đa mỗi người, thang 10).

Từng bước chi tiết cho người dùng: [docs/huong-dan/rut-cau-theo-phan.md](docs/huong-dan/rut-cau-theo-phan.md). Kiểm tra trọn luồng bằng test: `test/rut-cau-toan-luong.int.test.ts` (trong `pnpm test:integration`).

**Đo tải Rút câu:** `RUT_CAU_BENCH=1 pnpm --filter @exam/api exec vitest run --project integration test/rut-cau-bench.int.test.ts` (Bộ đề 100 câu, rút 40 %, 100 người; đặt thêm `RUT_CAU_N=500` cho 500 người). In thời gian bắt đầu Lượt, đọc đề, chấm cả Phiên thi, bảng Kết quả và xuất Excel; số đo ở [docs/architecture.md](docs/architecture.md) mục "Ngân sách phản hồi".

## Dùng thử Mã đề của Phiên thi (bản 0.5.0)

Cần như phần Rút câu và `pnpm db:migrate` (migration `0030`: Mã đề của Phiên thi, chỉ thêm bảng, cột và trigger khóa). Cách thử nhanh bằng giao diện (dùng lại Bộ đề đã Phát hành ở phần Rút câu):

1. **Phiên thi** → **Tạo Phiên thi**: chọn Bộ đề, ở *Thiết lập làm bài* chọn **Cách ra đề** là *Dùng chung các Mã đề* và đặt **Số Mã đề** là 2 hoặc 3. Tạo xong, hệ thống đã rút và lưu bộ câu của từng Mã đề.
2. Tab **Danh sách**: thêm vài người (hoặc cả lớp); mỗi người được gán Mã đề ngay, dòng đầu bảng ghi số người từng Mã đề. Thử **đổi tay** một người và **Chia lại**.
3. Tab **Đề**: chọn từng Mã đề để xem câu theo Phần, **Xem thử Mã đề này**, **Xuất Word Mã đề này** hoặc **Xuất tất cả Mã đề (zip)** (kèm Excel phân Mã đề).
4. Hai Người dự thi cùng Mã đề nhận đúng cùng tập câu; hai người khác Mã đề khác nhau ở một số câu. Họ thấy "Mã đề của bạn: Đề N". Tab **Theo dõi** có cột và ô lọc Mã đề; sau khi chấm và Công bố, Excel Kết quả có cột **Mã đề**.

Từng bước chi tiết cho người dùng: [docs/huong-dan/ma-de-phien-thi.md](docs/huong-dan/ma-de-phien-thi.md). Kiểm tra bằng test: `test/ma-de-phien-thi.int.test.ts` và các `test/ma-de-v*.int.test.ts` (trong `pnpm test:integration`).

**Đo tải Mã đề:** `MA_DE_BENCH=1 pnpm --filter @exam/api exec vitest run --project integration test/ma-de-bench.int.test.ts` (10 Mã đề, Bộ đề 100 câu, 500 người); số đo ở [docs/architecture.md](docs/architecture.md) mục "Ngân sách phản hồi" và [docs/hieu-nang.md](docs/hieu-nang.md).

## Vận hành

**Các tiến trình**

| Tiến trình | Lệnh (dev) | Ghi chú |
|---|---|---|
| web | `pnpm dev` (cổng 5173) | Vite, chuyển tiếp `/api` sang api |
| api | `pnpm dev` (cổng 3000) | NestJS; kiểm tra sức khỏe ở `/api/health` |
| worker | `pnpm -C apps/api dev:worker` | BullMQ: đọc file Excel, duyệt và tạo tài khoản, gửi thư, dọn dẹp hằng ngày lúc 3 giờ sáng. Production dùng `pnpm -C apps/api start:worker` (cùng image với api) |
| PostgreSQL, Redis | `make -C infra dev-up` | Redis đặt `noeviction` vì BullMQ cần |

**Biến môi trường của api và worker** (đặt trong `apps/api/.env`; xem `.env.example`)

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL` | có | Kết nối PostgreSQL và Redis |
| `APP_ORIGINS` | production | Địa chỉ công khai của hệ thống, cách nhau bằng dấu phẩy; địa chỉ đầu tiên dùng làm gốc của liên kết trong thư. Cũng là danh sách Origin được phép gửi request đổi dữ liệu (chống CSRF) |
| `MEDIA_DIR` | không | Thư mục lưu file tải lên tạm và Hình minh họa (mặc định `./media-data`). Production: một volume cho cả api lẫn worker |
| `LOGIN_MAX_PER_IP` | không | Số lần thử đăng nhập tối đa mỗi IP trong 10 phút (mặc định 20). Nâng cao khi chạy `demo:room` hay đo tải |
| `DB_POOL_MAX` | không | Số kết nối PostgreSQL tối đa của mỗi tiến trình (mặc định 10); tổng api và worker phải nhỏ hơn `max_connections` |
| `TRUST_PROXY` | không | Ai được tin khi báo địa chỉ khách qua `X-Forwarded-For` (mặc định `loopback`, nginx cùng pod) |
| `ILLUSTRATION_QUOTA_BYTES`, `MEDIA_ACCEL_PREFIX` | không | Hạn mức dung lượng Hình minh họa mỗi Người ra đề (mặc định 500 MB); tiền tố để api nhờ nginx trả ảnh (`X-Accel-Redirect`, ví dụ `/_media`) |
| `REALTIME_THROTTLE_MS`, `REALTIME_MAX_SOCKETS_PER_USER` | không | Khoảng cách tối thiểu giữa hai tin `monitor.changed` (mặc định 2000 ms) và số kết nối Socket.IO tối đa mỗi người (mặc định 20) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM` (cùng nhóm) | production | Cấu hình gửi thư (kích hoạt, quên mật khẩu, Lời mời...). Để trống cả nhóm ở dev thì thư được in ra cửa sổ worker. Các biến tùy chọn `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `EMAIL_SUPPORT_CONTACT`, `EMAIL_LIMIT_TOTAL`, `EMAIL_LIMIT_BULK`, `EMAIL_MIN_GAP_SECONDS`, `EMAIL_WARMUP_BULK` và cách đặt giá trị: [docs/ops/gui-thu.md](docs/ops/gui-thu.md) |
| `LOG_LEVEL`, `PORT` | không | Mức log và cổng của api |

**Sự cố thường gặp**
- *Worker báo lỗi rồi thoát (ví dụ `ENOENT ... dist/...`) hoặc nghi còn tiến trình worker cũ chạy ngầm*: gõ `pkill -f dist/worker/main.js` để tắt hết, đợi terminal 1 build xong rồi chạy lại `pnpm -C apps/api dev:worker`. Chỉ nên có đúng một worker.
- *Yêu cầu đứng mãi ở "Đang đọc file" hoặc "Đang tạo tài khoản"*: worker chưa chạy hoặc không nối được Redis. Bật worker rồi tải lại trang; yêu cầu kẹt quá 15 phút ở "Đang đọc file" sẽ được job dọn dẹp chuyển thành "File lỗi".
- *Đăng nhập sai nhiều lần bị chặn 15 phút*: đúng thiết kế (Q47). Quản trị viên mở bằng **Cấp lại mật khẩu tạm**; chính Quản trị viên bị chặn thì dùng `pnpm cli recover-admin`.
- *Đổi cổng hoặc tên miền*: cập nhật `APP_ORIGINS`, nếu không các thao tác ghi sẽ bị từ chối với lỗi "Yêu cầu bị từ chối. Hãy tải lại trang".
- *Màn Theo dõi ghi "Cập nhật mỗi 5 giây" thay vì "Cập nhật trực tiếp"*: kênh Socket.IO không nối được (proxy không chuyển `/ws`, Origin không có trong `APP_ORIGINS`, hoặc bị chặn). Hệ thống vẫn đúng, chỉ chậm hơn: Người dự thi nhận thông báo trong tối đa 15 giây.
- *Phòng thi từ khoảng 300 người trở lên*: chạy hai bản api (đo 4/11/2026: một bản chậm quanh Cộng giờ cả phòng, hai bản đạt mọi ngưỡng với 500 người).
- *Dữ liệu dev lộn xộn*: `make -C infra dev-down`, `make -C infra dev-up`, rồi `pnpm db:migrate` và tạo lại Quản trị viên.

## Quy trình phát triển

- **Ngôn ngữ nghiệp vụ:** đặt tên biến, bảng, API và nội dung giao diện theo [GLOSSARY.md](GLOSSARY.md). Gặp khái niệm mới thì thống nhất và bổ sung glossary trước khi code.
- **Duyệt thiết kế trước khi code:** thay đổi kiến trúc hoặc mô hình dữ liệu được đề xuất bằng tài liệu hoặc ADR ở trạng thái `proposed`, rồi mới triển khai.
- **Nhánh và PR:** tạo nhánh từ `main`, mở pull request theo mẫu Summary / Evidence / Merge Danger. CI có 4 check phải xanh (Lint·typecheck·unit; Integration·e2e·migration drift; Image web; Image api) trước khi merge squash; chỉ merge khi chủ dự án ra lệnh. Quy trình mỗi lát cắt: thiết kế được duyệt, test đỏ rồi xanh theo từng đường cắt, review hai trục (Standards, Spec).
- **Commit:** thông điệp ngắn bằng tiếng Việt nêu việc đã làm (tiêu đề PR kèm số, ví dụ "4e: … (#51)").
- **Prototype:** đặt trên nhánh `prototype/*`, không merge vào `main`. Sổ các bản thử đã làm, kết luận của từng bản và cách xem lại: [docs/ban-thu.md](docs/ban-thu.md).
- **Phát hành:** tag và Release chỉ gắn trên commit đã chạy thật ở production và đã kiểm tra, khi chủ dự án đồng ý. Mỗi tag có một [Release trên GitHub](https://github.com/tvviem/exam-system/releases) ghi mã commit đầy đủ, ảnh và **điểm lùi** (bản trước); bảng các bản đã phát hành và cách lùi nằm ở [docs/ops/phat-hanh.md](docs/ops/phat-hanh.md) mục 8.
- **Kiểm tra cục bộ:** `pnpm lint` coi cảnh báo của Biome là lỗi; hook pre-commit (`.githooks`, bật qua `pnpm install`) chạy Biome trên các tệp sắp commit.
- **Agent:** Claude Code, Codex và Copilot cùng đọc [AGENTS.md](AGENTS.md); [CLAUDE.md](CLAUDE.md) nạp file này.

## Triển khai

Giai đoạn 1 chạy trên Podman pod `prod-exam` trên máy WSL Ubuntu, ra Internet qua Cloudflare Tunnel ([ADR-0006](docs/adr/0006-podman-pod-tren-wsl-qua-cloudflare-tunnel.md)). **Hiện đã có:** CI (lint, typecheck, unit, audit phụ thuộc, integration, E2E trên pod `ci-exam`, kiểm migration không lệch schema) và build image api, web lên GHCR khi push `main`. **Lát cắt 6 ([kế hoạch](docs/plan/slice-6.md)):** pod `prod-exam` **đã chạy thật** trên laptop WSL tại `https://exam.plotrackerbluni.site`; lệnh `make -C infra prod-bootstrap`, `prod-up`, `prod-scale`, `prod-status`… dựng và vận hành pod (hướng dẫn: [docs/ops/trien-khai.md](docs/ops/trien-khai.md)); workflow GitHub "Deploy (bấm tay)" (xác nhận trước khi chạy, sao lưu trước deploy, kiểm sau deploy, tự lùi khi lỗi). **Sao lưu và khôi phục đã bật thật** (9/11/2026): dump hằng đêm, lưu liên tục WAL, đẩy sang ổ D: và Cloudflare R2 (mã hóa gpg), thử khôi phục hằng tháng, báo ngoài máy bằng healthchecks.io, màn hình "Sao lưu dữ liệu" và chuông cho Quản trị viên (hướng dẫn và nhật ký bật thật: [docs/ops/khoi-phuc.md](docs/ops/khoi-phuc.md)). **Trước mỗi Phiên thi thật:** `make -C infra prod-preflight` và [checklist](docs/ops/checklist-phien-thi.md). Chi tiết ở [docs/architecture.md](docs/architecture.md) mục 8, 9 và 11. **Phát hành:** bản chạy thật được đánh dấu bằng tag chú thích `vMAJOR.MINOR.PATCH` trên đúng commit đang chạy (hiện `v0.2.0`), ghi chú Release theo [docs/ops/phat-hanh.md](docs/ops/phat-hanh.md); không deploy hay gắn tag trong giờ thi.

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [GLOSSARY.md](GLOSSARY.md) | Thuật ngữ nghiệp vụ và tên dùng trong mã nguồn |
| [docs/architecture.md](docs/architecture.md) | Kiến trúc, luồng nghiệp vụ, bảo mật, trải nghiệm điện thoại, triển khai, phạm vi |
| [docs/data-model.md](docs/data-model.md) | Thiết kế bảng PostgreSQL, ràng buộc, công thức tính Kết quả |
| [docs/plan/](docs/plan) | Kế hoạch, quyết định, ghi chú triển khai và hướng dẫn thử từng lát cắt: slice-0 đến slice-7 (slice-1: Q43–Q99, slice-3: Q159–Q191, slice-4: Q192–Q272, slice-5: Q285–Q322, slice-7: email Q372–Q384), cùng các thiết kế sau bản 0.1: [Xuất Bộ đề](docs/plan/xuat-bo-de-thiet-ke.md) (Q401–Q416), [Rút câu theo Phần](docs/plan/rut-cau-theo-phan-thiet-ke.md) (Q385–Q395), [tên hệ thống](docs/plan/ten-he-thong.md) (Q396–Q400), [Mã đề của Phiên thi](docs/plan/ma-de-phien-thi-thiet-ke.md) (Q462–Q479), [rà UX/UI sau bản 0.5.1](docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md) |
| [docs/hieu-nang.md](docs/hieu-nang.md) | Hiệu năng và sức tải đã đo, cách đọc số đo, khuyến nghị cỡ phòng thi |
| [docs/huong-dan/](docs/huong-dan/README.md) | Hướng dẫn sử dụng theo vai: mục lục và các hướng dẫn đã có (chấm điểm, Công bố, Phúc khảo, Đính chính; Rút câu theo Phần; Mã đề của Phiên thi) |
| [docs/ops/trien-khai.md](docs/ops/trien-khai.md), [khoi-phuc.md](docs/ops/khoi-phuc.md), [checklist-phien-thi.md](docs/ops/checklist-phien-thi.md) | Dựng và vận hành pod production; sao lưu và khôi phục; việc phải làm trước mỗi Phiên thi thật |
| [docs/ops/phat-hanh.md](docs/ops/phat-hanh.md), [gui-thu.md](docs/ops/gui-thu.md), [tai-khoan-va-mat-khau.md](docs/ops/tai-khoan-va-mat-khau.md) | Tôn chỉ đánh số phiên bản, gắn tag và viết ghi chú Release; cấu hình gửi thư; xử lý tài khoản và mật khẩu |
| [docs/ops/demo-wsl.md](docs/ops/demo-wsl.md), [chuyen-len-vps.md](docs/ops/chuyen-len-vps.md) | Triển khai demo trên laptop WSL (bản nháp); hướng chuyển sang VPS khi cần |
| [docs/ui-design.md](docs/ui-design.md), [docs/ui-review.md](docs/ui-review.md) | Thiết kế giao diện và kết quả rà soát giao diện |
| [docs/ban-thu.md](docs/ban-thu.md) | Sổ các bản thử (nhánh `prototype/*`): mỗi bản trả lời câu hỏi gì, kết luận, đã vào mã ở đâu |
| [demo-data/README.md](demo-data/README.md) | File Excel dữ liệu demo và kịch bản dùng |
| [docs/adr](docs/adr) | Các quyết định kiến trúc đã duyệt |
| [AGENTS.md](AGENTS.md) | Hướng dẫn cho AI agent làm việc trên repo |

## Lộ trình

| Lát cắt | Nội dung |
|---|---|
| 0 | **Xong.** Khung monorepo, Podman pod cho dev/CI, pipeline GitHub Actions |
| 1 | **Xong.** Tạo Quản trị viên đầu tiên, đăng nhập, quản lý Người dùng, Lời mời, Yêu cầu cấp tài khoản, giao diện sáng/tối |
| 2 | **Xong.** Chủ đề, Câu hỏi, Hình minh họa, soạn công thức, nhập Excel |
| 3 | **Xong.** Bộ đề, Phần, Đặt điểm nhanh, Xem thử, Phát hành, Lưu trữ Câu hỏi và Bộ đề, Nhân bản, Chuyển giao kèm Bộ đề |
| 4 | **Xong.** Phiên thi, Danh sách dự thi, Mã vào thi, làm bài trên điện thoại (chịu mất mạng), theo dõi phòng thi trực tiếp, Cộng giờ, Buộc nộp, Đình chỉ, kênh đẩy Socket.IO, Xóa Người ra đề chuyển Phiên thi |
| 5 | **Xong.** Chấm tự động và tự luận, Công bố kết quả, Kết quả của tôi, Phúc khảo, Chốt, Đính chính đáp án, Ủy quyền chấm, xuất Excel, đo tải sau giờ thi |
| 6 | **Xong.** Triển khai production lên pod `prod-exam`, workflow "Deploy (bấm tay)", sao lưu và khôi phục, báo ngoài máy |
| 7 | **Xong.** Tài khoản bằng email: thư kích hoạt, quên mật khẩu, đổi và xác thực email, Lời mời tự gửi thư, theo dõi kích hoạt |
| 0.2.0 | **Xong.** [Xuất Bộ đề ra Word](docs/plan/xuat-bo-de-thiet-ke.md): tệp Đề thi (Mẫu Trường hoặc Gọn, công thức Word gốc, hình) và tệp Đáp án và thang điểm (đáp án hiệu lực sau Đính chính, có xác nhận); chức năng tùy chọn chưa cần ở mục 16 của tài liệu |
| 0.3.0 | **Xong** (22/11/2026). [Rút câu theo Phần](docs/plan/rut-cau-theo-phan-thiet-ke.md): tỷ lệ mặc định ở Bộ đề (đóng băng khi Phát hành), ghi đè ở Phiên thi, rút riêng cho từng Người dự thi (cùng bộ câu ở mọi Lượt), chấm, điểm tối đa, Phúc khảo, Theo dõi và Excel theo bộ câu của từng Lượt, Xem thử một lượt rút; Excel thêm cột Điểm sau Mức xử lý; nhớ nội dung Bộ đề đã Phát hành để vào thi nhanh hơn. Đo 500 người bấm bắt đầu cùng lúc: mỗi người chờ vài giây ở trường hợp xấu nhất, chấm 5,7 ms mỗi Lượt ([số đo](docs/architecture.md), mục Ngân sách phản hồi); hướng dẫn: [rut-cau-theo-phan.md](docs/huong-dan/rut-cau-theo-phan.md) |
| 0.3.1, 0.4.0 | **Xong** (22 và 23/11/2026). Chỉ giao diện: trình soạn Bộ đề gọn hơn khi tên Phần hoặc Chủ đề dài, chuyển nhanh giữa các Phần, hộp Phát hành nêu số câu mỗi người nhận theo từng Phần; sửa các lỗi hiển thị số rút câu |
| 0.5.0 | **Xong** (24/11/2026). [Mã đề của Phiên thi](docs/plan/ma-de-phien-thi-thiet-ke.md): cả Phiên thi dùng chung 1 đến 10 Mã đề (cách ra đề *dùng chung* hoặc *mỗi người một đề*), tự chia và đổi tay Người dự thi, Chia lại, Rút lại, xuất Word từng Mã đề hoặc cả zip kèm Excel phân Mã đề, cột Mã đề ở Theo dõi và Excel Kết quả; hướng dẫn [docs/huong-dan/ma-de-phien-thi.md](docs/huong-dan/ma-de-phien-thi.md) |
| 0.5.1 | **Xong** (24/11/2026). Chỉ giao diện, theo góp ý khi chạy thử: nút **Thêm câu hỏi** ở thanh dính, **Chi tiết câu hỏi** trong hộp chọn câu; Bộ đề đã Phát hành có thẻ tổng quan, chuyển nhanh giữa các Phần và lọc câu hỏi |
| 0.5.2 | **Xong** (24/11/2026). Chỉ giao diện, [rà UX/UI sáu điểm](docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md): Phiên thi (Mã vào thi đứng đầu, tab một dòng), Kết quả (một nút chính), Ngân hàng câu hỏi (bảng đọc được ở 1280 px), trang đầu của Người ra đề, màn Vào thi bớt lặp, trợ năng; thêm bài rà trợ năng `a11y-sweep.spec.ts` |
| 0.5.3 | **Xong** (25/11/2026). Chỉ giao diện, [màn làm bài chế độ Từng câu](docs/plan/take-tung-cau-thiet-ke.md): chuyển câu thì câu hỏi mới nằm ngay dưới thanh đầu (không phải cuộn lại), Mã đề thành chip ở thanh đầu, thanh dưới ghi "Câu n/N", hướng dẫn gọn sau nút Hướng dẫn, chuyển Từng câu / Cả đề trong bảng Aa |
| 0.5.4 | **Xong** (25/11/2026). Chỉ giao diện: sửa chữ tiếng Anh ở Tài khoản của tôi; tên Chủ đề dài xuống dòng thay vì tràn ngang trên điện thoại và thay vì bị cắt bằng "…" ở cột Chủ đề trên máy tính. Kèm ba hướng dẫn trọn bộ theo vai ([docs/huong-dan/](docs/huong-dan/README.md)) |
| Sau 0.5.4 | **Định hướng mở, chưa lên lịch:** [nguồn tham khảo của Câu hỏi và gợi ý ôn tập sau khi làm bài](docs/plan/mang-kien-thuc-va-on-tap-thiet-ke.md) (cần khóa AI nên tạm hoãn; bước không cần AI làm được trước) |

Để giai đoạn sau: nhập câu hỏi từ Word, tải ảnh vào Câu tự luận, giao diện tiếng Anh, xác thực hai lớp cho Quản trị viên, chuyển sang VPS (xem [docs/ops/chuyen-len-vps.md](docs/ops/chuyen-len-vps.md)).

## Bản quyền

© 2026 TRIỆU VĨNH VIÊM. **Bảo lưu mọi quyền** (xem [LICENSE](LICENSE)). Kho công khai để mọi người *xem* (và fork trên GitHub theo điều khoản của GitHub), nhưng đây **không phải mã nguồn mở**: không ai được sao chép, sửa, phân phối hay dùng mã nếu chưa được chủ sở hữu cho phép bằng văn bản. Các bản sao đã lấy theo giấy phép MIT trong khoảng 7–8/11/2026 (trước khi giấy phép đổi) vẫn theo giấy phép MIT đó.
