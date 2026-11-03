# Kiến trúc hệ thống (bản đề xuất để duyệt)

> Trạng thái: **công nghệ đã duyệt**; phần triển khai và các luồng đang chờ duyệt lần cuối. Thuật ngữ theo [GLOSSARY.md](../GLOSSARY.md). Các quyết định khó đảo ngược nằm trong [docs/adr](./adr).

## 1. Yêu cầu định hướng thiết kế

| Yêu cầu | Con số / ràng buộc |
|---|---|
| Tổng Người dùng | ~2.000 |
| Người dự thi đồng thời | 200–300 trong một Phiên thi; khi bắt đầu, có thể tất cả cùng bấm trong vòng ~1 phút |
| Thiết bị | Điện thoại là ưu tiên số 1; máy tính đứng thứ 2 |
| Hình thức thi | Chủ yếu tập trung tại lớp hoặc phòng máy, mạng Wi-Fi dùng chung có thể chập chờn |
| Triển khai | Podman pod trên WSL Ubuntu (giai đoạn 1), sau đó chuyển sang VPS; CI/CD bằng GitHub Actions |
| Nguyên tắc vàng | **Không bao giờ mất Câu trả lời**; server là nguồn sự thật duy nhất về thời gian và điểm |

## 2. Sơ đồ tổng thể

```
           ┌──────────── Điện thoại / Máy tính (PWA) ─────────────┐
           │ React SPA · Service Worker · IndexedDB (hàng đợi lưu)│
           └───────────────┬───────────────────────┬──────────────┘
                     HTTPS │ REST (JSON)           │ WSS (Socket.IO)
                           ▼                       ▼
                 ┌──────── Cloudflare (TLS, cache static) ────────┐
                 └───────────────────────┬────────────────────────┘
                                         │ Cloudflare Tunnel (cloudflared trên WSL)
═════════════════ Podman pod `prod-exam` ▼ (mạng chung localhost) ═════════════════
   ┌───────────────────────────────────────────────┐
   │ web: nginx  :80  → host :8180                 │  SPA tĩnh · /api, /ws → api
   │                                               │  /media → X-Accel-Redirect
   └──────────────────────┬────────────────────────┘
                 ┌────────▼─────────┐
                 │ api: NestJS :3000│  modular monolith (HTTP + WebSocket)
                 └──┬─────┬──────┬──┘
                    │     │      │
                    │     │  ┌───▼────────┐
                    │     │  │ redis :6379│  phiên đăng nhập · rate-limit · BullMQ
                    │     │  └───▲────────┘  Socket.IO adapter · presence · cache Bộ đề
                    │     │      │
                    │     │  ┌───┴────────┐
                    │     │  │ worker     │  tự Nộp bài · xử lý ảnh · import Excel
                    │     │  └───┬────────┘  Phiếu tài khoản · Chốt kết quả
                    ▼     ▼      ▼
   ┌──────────────────────┐   ┌────────────────────────┐
   │ postgres :5432       │   │ volume `exam_media`    │  ảnh gốc + biến thể WebP
   │ → host 127.0.0.1:5436│   │ (mount vào api, worker,│
   │ volume `exam_pgdata` │   │  web)                  │
   └──────────────────────┘   └────────────────────────┘
```

## 3. Công nghệ (đã duyệt)

| Lớp | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ | **TypeScript** cả frontend lẫn backend | Một ngôn ngữ; schema Zod dùng chung cho Câu hỏi và Câu trả lời ([ADR-0003](./adr/0003-modular-monolith-typescript.md)) |
| Runtime | Node.js LTS (24.x) | Ổn định, tối ưu cho tác vụ I/O |
| Backend | **NestJS 12** (adapter Fastify) | Chia module theo nghiệp vụ, có sẵn DI, guard và interceptor cho phân quyền. Đây là NestJS, framework backend, không phải Next.js (Next.js đã bị loại ở [ADR-0003](./adr/0003-modular-monolith-typescript.md)). Gói NestJS 12 chỉ có ESM; api biên dịch ra CommonJS và nạp các gói này qua `require(esm)` của Node 24 |
| Truy cập DB | **Drizzle ORM** + node-postgres | Gần với SQL, hỗ trợ tốt JSONB và partial index; migration sinh dạng file SQL dễ review |
| CSDL | **PostgreSQL 17/18** (managed) | [ADR-0001](./adr/0001-postgresql-la-noi-luu-tru-goc.md) |
| Cache / hàng đợi | **Redis 7+** + **BullMQ** | [ADR-0002](./adr/0002-redis-chi-chua-du-lieu-tam.md) |
| Thời gian thực | **Socket.IO** + Redis adapter | Đẩy thông báo cộng giờ hoặc buộc Nộp bài; theo dõi Phiên thi; tự kết nối lại khi rớt mạng |
| Frontend | **React 19 + Vite**, TanStack Router + Query, Tailwind CSS | SPA nhẹ, tách code theo route; giao diện thiết kế cho điện thoại trước |
| PWA | vite-plugin-pwa (Workbox) | Cài lên màn hình chính, cache vỏ ứng dụng, chịu được mạng chập chờn |
| Soạn nội dung | TipTap (rich text) + **MathLive** (soạn công thức trực quan, có bàn phím toán ảo) + KaTeX (hiển thị) | Công thức lưu dạng LaTeX trong node riêng của TipTap. Trang làm bài chỉ tải KaTeX (nhẹ); MathLive chỉ tải ở trang soạn câu hỏi |
| Excel | ExcelJS (trong worker) | Nhập câu hỏi theo mẫu, nhập Yêu cầu cấp tài khoản, xuất Kết quả, xuất Phiếu tài khoản |
| Ngôn ngữ giao diện | i18next | Giai đoạn 1 chỉ có tiếng Việt; chuỗi giao diện tách ra file |
| Ảnh | sharp (trong worker) + lưu trên volume | Tạo biến thể WebP 480/960/1600 px để điện thoại tải nhanh. Việc lưu file nằm sau một interface `MediaStore`, hiện dùng filesystem, sau này đổi sang S3/R2 mà không sửa nghiệp vụ ([ADR-0006](./adr/0006-podman-pod-tren-wsl-qua-cloudflare-tunnel.md)) |
| Mật khẩu | Argon2id | Chuẩn OWASP hiện hành |
| Kiểm thử | Vitest, Playwright (gồm cả kích thước màn hình điện thoại) | Integration test dùng Postgres + Redis thật trong pod (`dev-exam` trên máy, `ci-exam` trên CI), nhưng trên database `exam_test` và Redis DB 15 riêng, được làm sạch mỗi lần chạy, nên không đụng dữ liệu demo |
| Quan sát | pino (log JSON), OpenTelemetry, Sentry | |

## 4. Module backend

```
apps/api/src/modules/
  identity/      Người dùng, vai trò, đăng nhập, phiên, Khóa đăng nhập, Xóa người dùng, lịch sử đăng nhập
  audit/         nhật ký thao tác (chỉ ghi thêm)
  notifications/ thông báo trong ứng dụng (chuông); module khác gọi NotificationsService để gửi
  question-bank/ Chủ đề, Câu hỏi, Hình minh họa
  exam/          Bộ đề, Phần, Phát hành (tạo bản chụp)
  session/       Phiên thi, Danh sách dự thi, Khung giờ, thiết lập
  attempt/       bắt đầu Lượt làm bài, xáo trộn, lưu Câu trả lời, Nộp bài, đồng hồ
  grading/       chấm tự động, chấm Câu tự luận, Công bố kết quả, Phúc khảo, Chốt kết quả
  realtime/      gateway Socket.IO (presence, theo dõi, đẩy sự kiện)
```

Quy tắc: một module chỉ gọi module khác qua service công khai của module đó, không đọc trực tiếp bảng của module khác. Module `attempt` và `grading` chỉ đọc bản chụp trong `exam_items` ([ADR-0005](./adr/0005-chup-noi-dung-khi-phat-hanh.md)).

**Cổng giữa các module** (đặt ở `apps/api/src/common/`, nối ở các module `*-wiring.module.ts`): bên cần dữ liệu khai báo một interface nghiệp vụ nhỏ, bên sở hữu dữ liệu cài đặt, nên hai module không import nhau. Đã có: `EXAM_USAGE`, `OWNED_CONTENT`, `SESSION_USAGE`, `EXAM_CATALOG` (`session` hỏi `exam`), `CANDIDATE_DIRECTORY` (`session` hỏi `identity`), `SESSION_ENTRY` (`attempt` hỏi `session`: được vào Phiên thi nào, theo thiết lập nào), `EXAM_CONTENT` (`attempt` hỏi `exam`: chỉ đọc bản chụp), `SESSION_ATTEMPTS` (`session` hỏi `attempt`: đã có Lượt chưa, đóng Lượt khi Hủy, thiết bị), `CANDIDATE_MEDIA` (`question-bank` hỏi `attempt`: được xem ảnh của đề không), `USER_DEACTIVATION_HOOKS` (`identity` báo `attempt` khi Khóa hoặc Xóa người dùng). Cổng đặt theo việc cần làm (một lần gọi trả đủ thứ bên dùng cần), không theo từng bảng. Test kiến trúc `src/architecture.test.ts` cấm `session` và `attempt` import bảng của module khác; các cặp nợ cũ nằm trong danh sách cố định ở đầu file đó. Quyết định: [slice-4.md Q223, Q228](./plan/slice-4.md).

## 5. Các luồng nghiệp vụ quan trọng

### 5.1 Bắt đầu Lượt làm bài
0. Trên điện thoại: đăng nhập → nhập **Mã vào thi** do Người ra đề công bố tại lớp → hệ thống tìm Phiên thi tương ứng. Sai mã quá 5 lần trong 10 phút thì bị chặn tạm thời.
1. Kiểm tra: người dùng có trong Danh sách dự thi, đang trong Khung giờ, còn lượt làm bài.
2. Tạo `attempt` với `seed` ngẫu nhiên. Sinh thứ tự Câu hỏi trong từng Phần và thứ tự Phương án, lưu vào `attempt.layout`. Thứ tự này **cố định suốt Lượt làm bài**.
3. `deadline = min(started_at + duration, window_close_at) + extension`. Server lưu giá trị này; client chỉ hiển thị.
4. Đặt job BullMQ có độ trễ để tự Nộp bài tại `deadline + grace` (mặc định 30 giây).
5. Trả về nội dung đã lọc **không có Đáp án đúng**, theo thứ tự trong `layout`, kèm URL ảnh có chữ ký hết hạn sau 2 giờ.

### 5.2 Lưu Câu trả lời
- Client lưu ngay khi người dùng chọn. Với Câu tự luận, client debounce 2 giây rồi lưu.
- Gửi `PUT /attempts/:id/responses/:itemId { value, clientSeq }`.
- Server upsert, chỉ nhận khi `clientSeq` lớn hơn giá trị đang lưu (chống ghi đè dữ liệu cũ). Từ chối nếu đã quá `deadline + grace`.
- Mất mạng: Câu trả lời nằm trong hàng đợi IndexedDB (cùng bản sao đề, nên tải lại trang vẫn làm tiếp được) và được gửi lại khi có mạng. Giao diện hiển thị trạng thái "Đã lưu ✓" hoặc "Đang chờ mạng…".

### 5.3 Nộp bài
- Nộp bài là idempotent (gửi nhiều lần cho cùng kết quả), dùng khóa Redis chống bấm đúp.
- Chấm tự động các câu có Đáp án đúng. Câu tự luận chuyển sang trạng thái "chờ chấm".
- Khi tới hạn mà client chưa gửi phần còn trong hàng đợi, server Nộp bài với những gì đã nhận.

### 5.4 Theo dõi Phiên thi (màn hình của Người ra đề)
- Người dự thi gửi **heartbeat** `POST /take/attempts/:id/heartbeat` mỗi 15 giây (Q213); Redis (`presence:{sessionId}`) giữ lần báo gần nhất, "mất kết nối" suy ra khi đọc (quá 45 giây). Response mang hạn hiện tại, trạng thái, thiết bị còn hợp lệ không và thông báo mới (Cộng giờ, Cảnh cáo) nên mọi thay đổi đến Người dự thi trong tối đa 15 giây dù không có kênh đẩy. Socket.IO (PR 4d-3) chỉ là phần tăng tốc: hỏng thì hệ thống vẫn đúng.
- Sự kiện bất thường (rời màn hình, mất mạng) ghi vào `session_events`, không ghi từng nhịp.
- Màn Theo dõi đọc `GET /sessions/:id/monitor`: trạng thái, tiến độ, thiết bị và dấu hiệu Cần chú ý của cả phòng, tính ở server bằng hàm thuần ở `packages/shared`. Mở lại màn hình trên thiết bị khác lấy lại đủ trạng thái; máy của Người ra đề không nằm trong đường găng của Người dự thi (hạn, job quét, lưu bài đều ở server).
- Người ra đề có thể, cho một Lượt, một nhóm hoặc cả phòng: **Cộng giờ** (kèm lý do, mã lô chống cộng hai lần khi thử lại), **Buộc nộp**; cho một Lượt: **Cảnh cáo** hoặc **Đình chỉ** (kèm lý do); **Đóng và Mở lại cửa vào thi**; **Thu hồi thiết bị** và **Hoàn tác Thu hồi**. Mỗi thao tác ghi `audit_logs`.
- Sau khi Phiên thi đã mở, chỉ được kéo dài Khung giờ hoặc Thời lượng, đổi Mã vào thi và thêm người vào Danh sách dự thi.

### 5.5 Chấm tự động
| Loại | Tỷ lệ (`Proportional`) | Đúng hết (`AllOrNothing`) |
|---|---|---|
| Câu chọn một | — (đúng thì đủ điểm, sai thì 0) | — |
| Câu chọn nhiều | `điểm × max(0, (số đúng đã chọn − số sai đã chọn) / số Phương án đúng)` | đủ điểm khi tập đã chọn trùng khớp Đáp án đúng |
| Chùm đúng/sai | `điểm × số Mệnh đề nhận định đúng / tổng số Mệnh đề` | đủ điểm khi mọi Mệnh đề đều đúng |

Chùm đúng/sai có thêm quy tắc **Bậc thang**: `điểm × ladder[số Mệnh đề nhận định đúng]`. Người ra đề tự nhập bảng khi soạn câu, ví dụ `[0, 0.1, 0.25, 0.5, 1]` cho chùm 4 Mệnh đề.

Mọi hàm chấm nằm trong `packages/scoring` dưới dạng hàm thuần (pure function), được unit test đầy đủ.

### 5.6 Kết quả và Phúc khảo
`Đã nộp → Đã chấm → Đã Công bố → (Thời hạn phúc khảo 72 giờ) → Đã Chốt`. Kết quả luôn chờ Người ra đề bấm Công bố. Khi xem Kết quả, Người dự thi thấy điểm từng câu và trạng thái *đúng / chưa đúng hoàn toàn / sai*. Không đánh dấu riêng Phương án hay Mệnh đề nào sai; với chùm đúng/sai chỉ hiện tổng, ví dụ "đúng 3/4 Mệnh đề". API **không bao giờ trả về Đáp án đúng**, kể cả sau khi Chốt, để giữ ngân hàng câu hỏi dùng được lâu dài. Nút Công bố chỉ bật khi mọi Câu tự luận đã được chấm. Nếu Phúc khảo cho thấy Đáp án đúng bị nhập sai, Người ra đề thực hiện **Đính chính đáp án**: worker chấm lại câu đó cho mọi Lượt làm bài thuộc các Phiên thi **chưa Chốt** dùng Bộ đề này (Phiên thi đã Chốt giữ nguyên) và ghi `key_corrections` cùng nhật ký thao tác. Người dự thi gửi Phúc khảo cho từng câu kèm lý do. Người ra đề chấm lại một lần; điểm cũ và điểm mới đều được lưu vết. Worker tự Chốt kết quả khi hết hạn và không còn Phúc khảo đang mở.

## 6. Bảo mật

- **Xác thực:**
  - Dùng opaque session cookie ([ADR-0004](./adr/0004-phien-dang-nhap-opaque-cookie.md)).
  - Băm mật khẩu bằng Argon2id.
  - Khóa tạm 15 phút sau 5 lần đăng nhập sai liên tiếp.
  - Buộc đổi mật khẩu ở lần đăng nhập đầu tiên. Mật khẩu dài 10–128 ký tự, chặn mật khẩu phổ biến; mật khẩu tạm hết hạn sau 7 ngày.
  - Phiên hết hạn sau 12 giờ không hoạt động, tối đa 7 ngày; với Quản trị viên là 30 phút và 12 giờ. Được đăng nhập nhiều thiết bị cùng lúc.
  - Chống CSRF: ngoài `SameSite=Lax`, mọi request đổi dữ liệu phải có header `Origin` đúng.
  - Giai đoạn 1 không gửi email: Lời mời là link do Quản trị viên tự gửi, mật khẩu tạm giao qua Phiếu tài khoản.
- **Phân quyền:**
  - Kiểm tra vai trò bằng guard.
  - Kiểm tra quyền sở hữu ở tầng service: Người ra đề chỉ thấy Chủ đề, Bộ đề và Phiên thi của mình.
  - Người dự thi chỉ thấy Lượt làm bài của mình.
- **Dữ liệu thi:**
  - Không gửi Đáp án đúng xuống client.
  - Server tính giờ và tính điểm.
  - Ảnh phục vụ qua `/media` kèm token ký ngắn hạn. nginx chỉ trả file khi api đã kiểm tra quyền (X-Accel-Redirect); volume ảnh không công khai trực tiếp.
- **Tại phòng thi:**
  - Người ra đề đặt trước Mã vào thi cho Phiên thi và công bố tại lớp; có thể đổi mã bất cứ lúc nào.
  - Mỗi Lượt làm bài chỉ cho một phiên hoạt động; sang thiết bị khác phải được Người ra đề cho phép.
- **Web:**
  - Bật HTTPS/HSTS và CSP chặt.
  - Lọc HTML do người dùng nhập.
  - Giới hạn tần suất theo IP và theo người dùng.
  - Kiểm tra định dạng, kích thước và loại MIME thật của ảnh tải lên.
- **Vận hành:**
  - Khóa bí mật lưu trong env file ngoài repo (`~/exam-prod-secrets/*.env`, quyền `600`).
  - `pg_dump` hằng ngày, thêm một bản ngay trước mỗi lần deploy; định kỳ chạy thử khôi phục.
  - Nhật ký thao tác chỉ ghi thêm.
  - Mục tiêu đạt OWASP ASVS cấp 2.

## 7. Trải nghiệm làm bài trên điện thoại

Đã chốt sau khi thử prototype (nhánh `prototype/exam-taking-ui`): có **hai chế độ xem**, Người dự thi chuyển qua lại bất cứ lúc nào bằng nút gạt "1 câu | Cả đề" ở đầu màn hình. Hai chế độ dùng chung Lượt làm bài: Câu trả lời, đánh dấu, đồng hồ và trạng thái lưu. Chuyển chế độ luôn giữ đúng câu đang làm. Lựa chọn được nhớ trên thiết bị; mặc định điện thoại mở chế độ 1 câu, màn hình rộng (≥ 900 px) mở chế độ Cả đề. Phương án "vùng ngón cái" (vuốt ngang, đáp án dồn xuống đáy) bị loại.

- **Chế độ 1 câu:** mỗi màn hình một câu. Thanh trên cùng có đồng hồ và trạng thái lưu. Thanh dưới có nút "Trước / Sau" và nút mở lưới số câu (bottom sheet) cho biết câu đã làm, làm dở, chưa làm, đánh dấu xem lại, chưa lưu.
- **Chế độ Cả đề:** toàn bộ Bộ đề cuộn liên tục theo Phần, giống đề giấy. Dải số câu dính ở trên, tự sáng theo câu đang đọc và chạm vào để nhảy tới câu đó; nút Nộp bài nằm cuối dải.
- Vùng chạm tối thiểu 48 px. Cả dòng Phương án đều bấm được. Chùm đúng/sai hiển thị dạng bảng với 2 nút Đ/S cỡ lớn cho mỗi Mệnh đề.
- Ảnh tải lười (lazy load) theo câu kế tiếp, chạm để phóng to và kéo bằng hai ngón.
- Ngân sách hiệu năng: JS ban đầu của trang làm bài dưới 150 KB (gzip); LCP dưới 2,5 giây trên mạng 4G.
- Khi còn 5 phút và 1 phút: hiển thị cảnh báo và rung (nếu máy hỗ trợ). Trước khi Nộp bài, hiện màn hình xác nhận liệt kê các câu chưa làm.

## 8. Triển khai (giai đoạn 1: Podman pod trên WSL)

Làm theo cùng mô hình đã chạy ổn định ở `plo-tracker-bluni` ([ADR-0006](./adr/0006-podman-pod-tren-wsl-qua-cloudflare-tunnel.md)). Các bước chi tiết, số đo sức chứa và checklist ở [ops/demo-wsl.md](./ops/demo-wsl.md):

| Thành phần | Container trong pod `prod-exam` | Ghi chú |
|---|---|---|
| web | nginx (image tự build) | Cổng duy nhất mở ra host: `:8180` (tránh `:8080` và `:8000` của plo-tracker) |
| api | NestJS | Chỉ nghe trong pod, `localhost:3000` |
| worker | cùng image với api, lệnh khởi động khác | |
| postgres | PostgreSQL 17 | `127.0.0.1:5436` trên host để quản trị (5433 đã có `devplotracker` dùng); volume `exam_pgdata` |
| redis | Redis 7 | Chỉ trong pod |

- **Ra Internet:** dùng chung `cloudflared` đang chạy trên máy. Thêm một ingress rule `exam.<tên-miền>` → `http://localhost:8180`. Tunnel hỗ trợ WebSocket nên Socket.IO chạy được.
- **Bí mật:** đặt trong `~/exam-prod-secrets/{api,postgres}.env`, không nằm trong repo.
- **Sao lưu:** lưu ở `~/exam-prod-backups/`, lấy ý tưởng từ `BACKUP_OPERATOR_RUNBOOK.md` của plo-tracker.
- **Rủi ro riêng của WSL:** Windows ngủ, cập nhật hoặc khởi động lại trong giờ thi. Cần tắt sleep, đặt Active Hours cho Windows Update và có checklist trước mỗi Phiên thi quan trọng.
- **Chuyển sang VPS:** dùng nguyên các image và Makefile. Chỉ đổi env file và runner. Nếu VPS có Podman ≥ 4.4, có thể chuyển sang Quadlet (systemd) để tự khởi động lại.

## 9. CI/CD bằng GitHub Actions

```
Pull request / push ──► lint · typecheck · unit test · integration (Podman: postgres + redis)
                     ──► build SPA · Playwright e2e (desktop + mobile viewport)
                     ──► kiểm tra migration drift · quét bảo mật (pnpm audit; CodeQL khi có GitHub Advanced Security)

push main ──► build + push image lên GHCR (tag = commit SHA)
          ──► job deploy chạy trên runner [self-hosted, wsl-exam]
                1. kiểm tra pod, env file, container đang chạy
                2. đóng băng: dừng deploy nếu đang có Phiên thi diễn ra
                3. pg_dump trước khi deploy
                4. chạy migration
                5. thay lần lượt api → worker → web, đợi health check
                6. smoke test qua https://exam.<tên-miền>/api/health
```

- Runner hiện có ở `~/actions-runner` đăng ký cho repo plo-tracker. Tài khoản GitHub cá nhân không có runner dùng chung nhiều repo, nên cần **đăng ký thêm một runner** (ví dụ `~/actions-runner-exam`, nhãn `wsl-exam`).
- Migration chỉ được thêm, không phá vỡ dữ liệu cũ (expand → migrate → contract).
- Hạ tầng dev và CI dùng chung `infra/Makefile` (`make -C infra dev-up`, `ci-up`, ...) theo ADR Podman pod của plo-tracker, với tên pod/volume khác nhau cho từng môi trường.

## 10. Cấu trúc monorepo

```
exam-system/
  apps/
    api/        NestJS (HTTP + WebSocket); worker BullMQ ở src/worker, cùng mã và cùng image, lệnh khởi động khác
    web/        React PWA (route /admin, /examiner, /take)
  packages/
    shared/     schema Zod: Câu hỏi, Câu trả lời, Quy tắc chấm, DTO
    scoring/    hàm chấm thuần (pure), kiểm thử kỹ bằng unit test
  infra/
    Makefile    dev-up / ci-up / prod-bootstrap (Podman pod)
    containers/ Containerfile cho api, web
    scripts/    bootstrap, backup, restore
  docs/
  .github/workflows/
```

## 11. Ước tính tải

- **Bắt đầu thi:** 300 lượt bắt đầu trong khoảng 60 giây, tức khoảng 5 request/giây. Nội dung Bộ đề lấy từ cache Redis, ảnh tải qua CDN.
- **Lưu Câu trả lời:** khoảng 60 lượt ghi/giây lúc cao điểm, mỗi lượt là 1 câu lệnh upsert.
- **Heartbeat:** 300 kết nối WebSocket, mỗi kết nối gửi 15 giây một lần.

Một container api (Node.js) trên máy WSL hiện tại đủ đáp ứng với dư địa lớn; điểm nghẽn thực tế nhiều khả năng là đường truyền mạng của máy chủ và Wi-Fi phòng học. Trước Phiên thi thật đầu tiên sẽ chạy kiểm thử tải bằng k6 với kịch bản 500 người.

### Ngân sách phản hồi (đề xuất 3/11/2026, chờ chủ dự án duyệt con số)

Chủ dự án coi phản hồi tức thời là yêu cầu hàng đầu: người dùng chờ quá 2–3 giây là đã chậm, hệ thống cần trả lời trong cỡ mili giây. Ngân sách đề xuất:

| Việc | Ngân sách |
|---|---|
| Thao tác thường của API (lưu câu trả lời, đọc đề, danh sách, tìm kiếm) | p95 dưới 200 ms (một người dùng), dưới 1 giây khi 100 người cùng lúc |
| Báo lỗi (403, 404, 409…) | hiện trong dưới 0,5 giây; không thử lại lỗi 4xx (`lib/query-policy.ts`) |
| Mọi chỗ chờ quá 1 giây | có chỉ báo đang xử lý (đã có ở các thao tác nặng) |
| Tải trang đầu trên điện thoại | LCP dưới 2,5 giây trên mạng 4G giả lập (chưa đo trên 4G giả lập, mới đo cục bộ) |

Số đo ngày 3/11/2026 (một tiến trình, PostgreSQL thật, máy phát triển, đo trong bộ test tích hợp nên chưa gồm mạng):

| Đường | Một người | 100 người cùng lúc (p50 / p95) |
|---|---|---|
| Vào thi (`join`) | 15 ms | 376 / 443 ms |
| Bắt đầu Lượt (`start`) | 30 ms | 982 / 1030 ms |
| Đọc đề (`view`) | 13 ms | 409 / 445 ms |
| Lưu Câu trả lời (1000 lần lưu) | 14 ms | 468 / 508 ms |
| Nộp bài | 12 ms | 228 / 326 ms |
| Danh sách / tìm kiếm Câu hỏi, 20.000 câu của một Người ra đề | 20–25 ms | không đo |

Ước tính ở trên (5 lượt bắt đầu mỗi giây) thấp hơn nhiều so với khả năng đo được (khoảng 100 lượt bắt đầu mỗi giây trên một tiến trình), nên còn dư địa lớn. Chưa làm: đo bằng k6 qua HTTP thật với 500 người (kế hoạch ở 4e), đo LCP trên 4G giả lập, thử nghiệm giữ nội dung Bộ đề trong bộ nhớ để `start` khỏi đọc hai lần.

## 12. Phạm vi giai đoạn 1 và backlog

**Giai đoạn 1** gồm các nghiệp vụ đã chốt trong [GLOSSARY.md](../GLOSSARY.md):
- Người dùng: Quản trị viên, Nhãn vai trò, Lời mời, Yêu cầu cấp tài khoản kèm Phiếu tài khoản, Khóa đăng nhập, Xóa người dùng, Chuyển giao.
- Ngân hàng câu hỏi: 4 Loại câu hỏi, Hình minh họa, soạn công thức trực quan, nhập Excel cả bốn Loại (mỗi Loại một sheet).
- Bộ đề: danh sách câu cố định, Phần, đặt điểm nhanh, Phát hành, Xem thử.
- Phiên thi: Mã vào thi, Khung giờ, nhiều lượt làm bài, theo dõi trực tiếp, cộng giờ, Cho phép đổi thiết bị, Vi phạm và Đình chỉ.
- Kết quả: chấm tự động, chấm Câu tự luận theo câu (có thể ẩn tên), Công bố kết quả, Phúc khảo, Đính chính đáp án, Chốt kết quả, xuất Excel, thông báo trong ứng dụng.

**Backlog (giai đoạn sau):**
- Rút ngẫu nhiên câu hỏi theo Chủ đề.
- Thống kê câu hỏi (độ khó, độ phân biệt).
- Nhập câu hỏi từ Word.
- Tải ảnh hoặc file trong Câu tự luận.
- Giao diện tiếng Anh.
- Chuyển hạ tầng sang VPS.
- Gửi email (Lời mời, link đặt mật khẩu, tự đặt lại mật khẩu khi quên) qua interface `MailSender`; chọn nhà cung cấp bằng ADR.
- Xác thực hai lớp (TOTP) cho Quản trị viên.
