# Lát cắt 1: Người dùng, đăng nhập, Lời mời, Yêu cầu cấp tài khoản

> Trạng thái: **accepted** (28/10/2026), sau vòng chất vấn Q43–Q58, review PR 1a (Q59–Q60) và chốt chi tiết PR 1b (Q61–Q70), review PR 1b (Q76) ở [mục Quyết định](#quyết-định-q43q99). Làm theo [data-model.md](../data-model.md) mục 1, [ADR-0004](../adr/0004-phien-dang-nhap-opaque-cookie.md), [architecture.md](../architecture.md) mục 6 và các quyết định Q1–Q3, Q21–Q23, Q31, Q37, Q39 của vòng chất vấn đặc tả (27/10/2026).

## Mục tiêu

Sau lát cắt 1:
- Quản trị viên đầu tiên được tạo bằng lệnh `bootstrap-admin` và đăng nhập được.
- Quản trị viên quản lý được Người dùng và Đơn vị, mời Người ra đề bằng link.
- Người ra đề gửi được Yêu cầu cấp tài khoản từ file Excel.
- Quản trị viên duyệt yêu cầu và xuất Phiếu tài khoản cho Người dự thi.

Lát cắt chia thành 4 PR. Merge xong PR nào thì hệ thống chạy được tới đó.

```text
1a đăng nhập ──► 1b quản lý Người dùng + nhật ký ──► 1c Lời mời
                                     └──────────────► 1d Yêu cầu cấp tài khoản (worker đầu tiên)
```

## Thiết kế chung

### Module

```text
apps/api/src/modules/
├── identity/   # Người dùng, Nhãn vai trò, Đơn vị, phiên đăng nhập, Lời mời, Yêu cầu cấp tài khoản
│   ├── auth/         # đăng nhập, đăng xuất, đổi mật khẩu, guard
│   ├── users/        # quản lý Người dùng (Quản trị viên)
│   ├── invitations/
│   └── account-requests/
└── audit/      # ghi nhật ký thao tác, chỉ INSERT
```

Hai module chỉ giao tiếp qua service công khai, đúng như architecture.md mục 4 quy định:

| Module | Xuất ra cho module khác |
|---|---|
| `identity` | `AuthGuard` (bắt buộc đăng nhập), decorator `@AdminOnly()`, `@RequireTag('examiner' \| 'candidate')`, `@CurrentUser()`; `IdentityService.revokeAllSessions(userId, reason)` (để tới lát cắt 4, Q76) |
| `audit` | `AuditService.record({ actorId, action, entity, before, after, ip })` |

### Phiên đăng nhập (ADR-0004)

| Mục | Cách làm |
|---|---|
| Cookie | `exam_sid`, gồm `HttpOnly`, `Secure` (trừ khi chạy dev), `SameSite=Lax`, `Path=/` |
| Mã phiên | 32 byte ngẫu nhiên. Cookie giữ mã gốc; PostgreSQL (`auth_sessions.token_hash`) và Redis chỉ giữ SHA-256 của mã |
| Redis | `auth:session:<hash>` chỉ chứa dữ liệu của phiên (`userId`, các mốc thời gian, IP, user agent), TTL bằng thời hạn phiên. Trạng thái, Nhãn vai trò và `mustChangePassword` đọc từ PostgreSQL ở mỗi request, nên Khóa đăng nhập có hiệu lực ngay. Bộ `auth:user-sessions:<userId>` dùng để thu hồi mọi phiên của một người |
| Thời hạn (Q44, Q45) | Người ra đề và Người dự thi: hết hạn sau 12 giờ không hoạt động (mỗi request gia hạn lại), tối đa 7 ngày kể từ lúc đăng nhập. Quản trị viên: 30 phút và 12 giờ |
| Nhiều thiết bị (Q51) | Được đăng nhập đồng thời; người dùng xem danh sách phiên đang mở của mình và đăng xuất từng phiên |
| Thu hồi | Khóa đăng nhập, Xóa người dùng, đổi mật khẩu (trừ phiên đang dùng), đăng xuất: xóa trong Redis và ghi `revoked_at`, `revoked_reason` vào PostgreSQL |
| CSRF | Ngoài `SameSite=Lax`, mọi request đổi dữ liệu (POST/PUT/PATCH/DELETE) phải có header `Origin` trùng với origin của hệ thống, sai thì trả 403 |
| Mất Redis | Phiên không tra được thì người dùng đăng nhập lại (ADR-0002). Không quay sang đọc PostgreSQL |

### Mật khẩu và chống dò mật khẩu

- Băm bằng Argon2id qua thư viện `@node-rs/argon2`. Thư viện có sẵn bản biên dịch, không cần build native trong image. Tham số theo OWASP: `m=19 MiB, t=2, p=1`.
- **Chính sách mật khẩu (Q46):** 10–128 ký tự, không bắt buộc kết hợp loại ký tự (theo ASVS 5). Từ chối mật khẩu trùng tên đăng nhập, email, Mã định danh, và các mật khẩu có trong danh sách khoảng 10.000 mật khẩu phổ biến (file tĩnh trong repo).
- **Khóa tạm sau 5 lần sai liên tiếp.** Đây là cơ chế tự động, khác với **Khóa đăng nhập** do Quản trị viên thực hiện. `failed_login_count` tăng mỗi lần sai. Đến lần thứ 5, đặt key Redis `auth:login-block:<userId>` sống trong **15 phút** (Q47). Đăng nhập thành công thì đếm lại từ 0. Không cần thêm cột vào DB. Từ lát cắt 4, Người ra đề cấp lại mật khẩu tạm (Q22) thì cũng gỡ chặn.
- **Giới hạn tần suất:** 20 lần đăng nhập mỗi 10 phút cho mỗi IP. Mức này nới rộng có chủ đích, vì cả lớp dùng chung Wi-Fi nên chung một IP. Mỗi định danh (tên đăng nhập hoặc email) được 10 lần mỗi 10 phút. Đếm bằng Redis.
- Mọi lần đăng nhập, dù thành công hay thất bại, đều ghi vào `login_events`. Thông báo lỗi luôn chung chung ("Tên đăng nhập hoặc mật khẩu không đúng"), không cho biết tài khoản có tồn tại hay không. Riêng trường hợp bị Khóa đăng nhập thì báo rõ, nhưng chỉ khi mật khẩu đúng.

### Bổ sung mô hình dữ liệu (đã ghi vào data-model.md)

| Thay đổi | Lý do |
|---|---|
| `users.password_expires_at timestamptz NULL` | Q48. Có giá trị khi tạo hoặc cấp lại bằng mật khẩu tạm, về NULL sau khi đổi mật khẩu. Đăng nhập bằng mật khẩu tạm đã quá hạn thì bị từ chối |
| `audit_logs.actor_id` được NULL | Q49. NULL nghĩa là hệ thống (CLI, worker); `action` ghi nguồn, ví dụ `cli.recover-admin` |
| `account_request_items.match_status` | Q58. `new`, `exact`, `name_mismatch`, `blocked`, ghi lúc đọc file |
| Migration đầu tiên chạy `CREATE EXTENSION IF NOT EXISTS citext` | `username` và `email` dùng kiểu `citext` |
| Khóa chính UUIDv7 sinh ở ứng dụng, dùng thư viện `uuid` (`v7()`) | PostgreSQL 17 chưa có hàm `uuidv7()` (bản 18 mới có) |

### Giao diện (web)

- Route `/login` đặt ngoài layout chính. `/change-password` nằm trong layout để vẫn có nút Đăng xuất, nhưng người chưa đổi mật khẩu tạm không vào được trang nào khác.
- Route `/admin/*` chỉ cho Quản trị viên. `/examiner/*` và `/take/*` kiểm tra Nhãn vai trò.
- Mọi route đều gọi `GET /api/auth/me` qua TanStack Query. Nếu `mustChangePassword = true`, người dùng bị chuyển tới `/change-password` cho tới khi đổi xong.
- Thiết kế cho điện thoại trước, vùng chạm tối thiểu 48 px. Mọi chuỗi giao diện nằm trong `vi.json`.

## PR 1a: Đăng nhập và Quản trị viên đầu tiên

**Bảng:** `users`, `units`, `user_role_tags`, `examiner_profiles`, `auth_sessions`, `login_events`, `audit_logs`. Các bảng dùng ở 1c và 1d (`invitations`, `account_requests`, `account_request_items`, `notifications`) được thêm bằng migration trong PR tương ứng.

**CLI** (`apps/api/src/cli/main.ts`, chạy bằng `pnpm cli <lệnh>`, trong image là `node dist/cli/main.js <lệnh>`):
- `bootstrap-admin`: đọc `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_FULL_NAME`, `BOOTSTRAP_ADMIN_PASSWORD`. Chỉ chạy khi không còn Quản trị viên nào chưa bị Xóa (Q60); có khóa advisory để hai lệnh chạy cùng lúc không cùng tạo được. Đặt `must_change_password = true`.
- `recover-admin --username <u>` (Q60): chỉ nhận tài khoản đã là Quản trị viên và chưa bị Xóa. Lệnh mở Khóa đăng nhập, gỡ khóa tạm, cấp mật khẩu tạm mới (in ra một lần, hạn 7 ngày) và thu hồi mọi Phiên đăng nhập. Ghi `audit_logs` với `actor_id = NULL`, `action = 'cli.recover-admin'`.

**API:**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | `{ identifier, password }`. `identifier` là tên đăng nhập hoặc email |
| POST | `/api/auth/logout` | Thu hồi phiên hiện tại |
| GET | `/api/auth/me` | `{ id, fullName, isAdmin, roleTags, mustChangePassword }` |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }`, thu hồi mọi phiên khác |
| GET | `/api/auth/auth-sessions` | Danh sách Phiên đăng nhập đang mở của chính mình (Q51) |
| DELETE | `/api/auth/auth-sessions/:id` | Đăng xuất một Phiên đăng nhập của chính mình |

**Web:** trang đăng nhập, trang đổi mật khẩu, nút đăng xuất, chặn route theo vai trò.

**Test:**
- Unit: chính sách mật khẩu. Logic khóa tạm được test qua seam HTTP (integration) với `Clock` giả.
- Integration: đăng nhập đúng/sai; khóa tạm; phiên bị thu hồi thì trả 401; bắt buộc đổi mật khẩu; thiếu hoặc sai `Origin` thì trả 403.
- E2E (desktop + mobile), chạy trên database `exam_e2e` riêng: Quản trị viên đăng nhập → bị buộc đổi mật khẩu → vào được `/admin`. `bootstrap-admin` được test ở integration.

## PR 1b: Quản lý Người dùng và nhật ký thao tác

**API Quản trị viên** (`/api/admin/...`, gắn `@AdminOnly()`):

| Chức năng | Ghi chú |
|---|---|
| Danh sách Người dùng | Tìm theo tên, tên đăng nhập, email, Mã định danh, Lớp; lọc theo Nhãn vai trò, trạng thái; phân trang |
| Xem, sửa thông tin | `date_of_birth` và `gender` chỉ trả về cho Quản trị viên (Nghị định 13/2023) |
| Gắn, gỡ Nhãn vai trò | Không áp dụng cho Quản trị viên |
| Khóa đăng nhập, mở khóa | Bắt buộc ghi lý do; thu hồi mọi phiên; không được tự khóa chính mình |
| Xóa người dùng | Soft-delete, thu hồi mọi phiên, không được tự xóa mình. Phần chọn người nhận Chủ đề, Bộ đề, Phiên thi của Người ra đề sẽ làm khi các bảng đó có (lát cắt 2–4). Ở lát cắt 1, người cần xóa chưa sở hữu gì nên xóa thẳng |
| Chỉ định Quản trị viên | Theo Q23, tài khoản Quản trị viên tách riêng và không mang Nhãn vai trò. Người vừa quản trị vừa ra đề dùng hai tài khoản. Vì vậy "chỉ định" nghĩa là **tạo tài khoản Quản trị viên mới** (có tên đăng nhập; email không bắt buộc, vì email phải là duy nhất). Không gắn `is_admin` cho tài khoản đang mang nhãn |
| Cấp lại mật khẩu tạm | Sinh mật khẩu tạm mới, đặt `must_change_password` và `password_expires_at`, rồi hiển thị **một lần** |
| Đơn vị | Thêm, sửa, xem danh sách |
| Lịch sử đăng nhập | Lọc theo người, theo kết quả |
| Nhật ký thao tác | Lọc theo người thực hiện, hành động, đối tượng |

**Audit:** mọi thao tác ở trên đều gọi `AuditService.record`. Bảng `audit_logs` bị thu hồi quyền `UPDATE` và `DELETE` ở mức DB, bằng một trigger `BEFORE UPDATE OR DELETE` báo lỗi.

**Web:** `/admin/users` (danh sách + chi tiết), `/admin/units`, `/admin/login-events`, `/admin/audit-logs`.

**Chi tiết (Q61–Q70):**
- Cấp lại mật khẩu tạm thu hồi mọi Phiên đăng nhập và gỡ khóa tạm, nhưng không mở Khóa đăng nhập. Không tự cấp cho chính mình (Q61).
- Quản trị viên được Khóa, Xóa, cấp lại mật khẩu tạm cho Quản trị viên khác; chỉ cấm làm với chính mình (Q62).
- Mở khóa không bắt buộc lý do; có thì ghi vào `audit_logs` (Q63). Khóa người đang bị khóa, hoặc mở khóa người chưa bị khóa, trả `INVALID_STATE` (409).
- Gắn nhãn `examiner` thì tạo `examiner_profiles` trống; gỡ nhãn thì giữ hồ sơ. Người dùng được phép không còn nhãn nào (Q64).
- Sửa được: họ tên, tên đăng nhập, email, Mã định danh, Lớp, ngày sinh, giới tính, và học vị, học hàm, Đơn vị nếu là Người ra đề. Tài khoản Quản trị viên chỉ sửa họ tên, tên đăng nhập, email. Trùng thì trả `CONFLICT` (409) kèm tên trường. Đổi tên đăng nhập hoặc email không thu hồi phiên (Q65).
- Người đã bị Xóa không khôi phục được; vẫn xem được qua bộ lọc "Đã xóa" nhưng không sửa được (Q66).
- Phân trang `page`, `pageSize` (mặc định 20, tối đa 100), trả `total`. Người dùng sắp theo ngày tạo mới nhất; lịch sử đăng nhập và nhật ký thao tác theo `at` giảm dần (Q67).
- `before`/`after` của nhật ký chỉ chứa trường thay đổi, không bao giờ chứa `password_hash` hay mật khẩu tạm (Q68).
- Tìm không dấu, không phân biệt hoa thường: migration bật extension `unaccent` (Q69).
- Tạo Quản trị viên mới: hệ thống sinh mật khẩu tạm, hiển thị một lần, hạn 7 ngày (Q70).

**Test (seam đã chốt):**
- Integration qua HTTP `/api/admin/*`: `@AdminOnly()`, từng quy tắc ở tầng service, thu hồi phiên ngay (cookie của người bị Khóa hoặc bị Xóa nhận 401), nhật ký kiểm tra qua `GET /api/admin/audit-logs`, `login_events` kiểm tra qua `GET /api/admin/login-events`.
- Integration bằng SQL trực tiếp: `UPDATE` và `DELETE` trên `audit_logs` báo lỗi.
- E2E (desktop + mobile): Quản trị viên tìm một người → Khóa đăng nhập → người đó đăng nhập thì thấy báo bị khóa.

## PR 1c: Lời mời (chỉ tạo link)

```text
Quản trị viên tạo Lời mời { email, fullName, unitId }
  → hệ thống sinh token 32 byte, lưu SHA-256, hết hạn sau 7 ngày
  → hiển thị link /invite/<token> một lần + nút "Sao chép"
  → Quản trị viên tự gửi link qua kênh của mình (Zalo, email cá nhân...)

Người nhận mở link
  ├─ email chưa có tài khoản → nhập học vị, học hàm, đặt mật khẩu
  │    → tạo users + nhãn examiner + examiner_profiles, đăng nhập luôn
  └─ email đã có tài khoản  → yêu cầu đăng nhập bằng tài khoản đó
       → sau khi đăng nhập: chỉ thêm nhãn examiner (+ examiner_profiles)
```

- Link chỉ dùng được một lần. Hết hạn, đã thu hồi hoặc đã dùng thì cùng hiện một thông báo chung.
- Quản trị viên xem được danh sách Lời mời: đang chờ, đã nhận, hết hạn, đã thu hồi. Có thể **Thu hồi**, hoặc **Tạo lại link**: link cũ mất hiệu lực, link mới có hạn 7 ngày.
- Quản trị viên nhập họ tên, email, Đơn vị; người được mời tự chọn học vị, học hàm; Quản trị viên sửa được về sau (Q53).
- Từ chối tạo Lời mời tới email đang thuộc một tài khoản Quản trị viên, gợi ý dùng email khác (Q52).
- Giai đoạn 1 không gửi email (Q43). Xem mục [Gửi email](#gửi-email-để-sau).

**Test:** integration cho cả hai nhánh (chưa có tài khoản / đã có tài khoản), link dùng lần hai, link hết hạn, link đã thu hồi, và trường hợp người đã đăng nhập bằng tài khoản có email khác với email được mời (phải từ chối).

### Chi tiết PR 1c (Q77–Q86)

**Trạng thái và token**
- **Trạng thái suy ra, không lưu (Q77):** `accepted` (có `accepted_at`) > `revoked` (có `revoked_at`) > `expired` (`expires_at` ≤ giờ của Clock) > `pending`.
- **Token (Q78):** 32 byte ngẫu nhiên, mã hóa base64url; DB chỉ lưu SHA-256. Link `/invite/<token>` chỉ hiện đúng lúc tạo hoặc tạo lại. Token không bao giờ vào `audit_logs` hay log.

**Quản trị viên**
- **Tạo (Q79):** từ chối (a) email của Quản trị viên (Q52), (b) email của người đã mang nhãn `examiner`, (c) email đã có Lời mời `pending` còn hạn (gợi ý "Tạo lại link"). Email của tài khoản đã bị Xóa coi như chưa có tài khoản. Tài khoản đang bị Khóa đăng nhập vẫn được mời.
- **Thu hồi và Tạo lại link (Q80):** Thu hồi chỉ cho Lời mời `pending`. Tạo lại link cho `pending` hoặc `expired`: giữ `id`, đổi `token_hash`, `expires_at` = giờ hiện tại + 7 ngày. Lời mời `accepted` hoặc `revoked` thì trả `INVALID_STATE`; muốn mời lại thì tạo Lời mời mới. Không sửa họ tên, email, Đơn vị của Lời mời đã tạo: thu hồi rồi tạo mới.
- **API (Q85):** `GET /api/admin/invitations` (lọc `status`, phân trang), `POST /api/admin/invitations`, `POST /api/admin/invitations/:id/revoke`, `POST /api/admin/invitations/:id/regenerate`. Chỉ tạo và tạo lại trả `token`, một lần duy nhất.

**Người được mời (không cần đăng nhập để xem)**
- **Xem (Q81):** `GET /api/invitations/:token` trả `{ email, fullName, unitName, accountExists }`. Link không tồn tại, hết hạn, đã thu hồi, đã dùng đều trả cùng `404 INVITATION_UNAVAILABLE`. Hai endpoint công khai giới hạn 30 lần mỗi 10 phút mỗi IP.
- **Nhận khi chưa có tài khoản (Q82):** `POST /api/invitations/:token/accept` với `{ password, academicDegree?, academicTitle? }` (học vị, học hàm không bắt buộc). Một transaction: tạo `users` (email và họ tên lấy từ Lời mời, không có `username`, `must_change_password = false`), gắn nhãn `examiner`, tạo `examiner_profiles` (Đơn vị từ Lời mời), đánh dấu `accepted`. Mật khẩu theo chính sách Q46. Đăng nhập luôn (tạo Phiên đăng nhập, đặt cookie, ghi `login_events`). Hai người nhận cùng lúc: chỉ một người thành công, người còn lại nhận `INVITATION_UNAVAILABLE`.
- **Nhận khi đã có tài khoản (Q83):** phải đang đăng nhập đúng tài khoản có email đó. Chưa đăng nhập: `401` (web chuyển tới `/login?redirect=/invite/<token>`). Đăng nhập tài khoản khác: `403 FORBIDDEN`. Body chỉ gồm học vị, học hàm. Thêm nhãn `examiner`; hồ sơ Người ra đề có sẵn thì giữ nguyên, chỉ điền các ô còn trống. Tài khoản đã là Quản trị viên: `INVALID_STATE`. Đã mang nhãn `examiner`: vẫn đánh dấu `accepted`, không đổi gì.

**Nhật ký và giao diện**
- **Nhật ký (Q84):** `invitation.create`, `invitation.revoke`, `invitation.regenerate` (người thực hiện là Quản trị viên) và `invitation.accept` (người thực hiện là người vừa nhận; `after` gồm `userId` và `createdAccount`).
- **Giao diện (Q86):** trang quản trị "Lời mời" (danh sách, tạo, hộp thoại link có nút Sao chép, Thu hồi, Tạo lại link) trong thanh điều hướng con; trang công khai `/invite/$token` nằm ngoài `_authed` với ba trạng thái: không dùng được (thông báo chung), form tạo tài khoản, yêu cầu đăng nhập.

**Test (seam đã chốt)**
1. *API Quản trị viên* (HTTP + PostgreSQL + Redis, Clock giả): tạo, liệt kê, lọc; ba lý do từ chối khi tạo; Thu hồi; Tạo lại link làm link cũ mất hiệu lực; chỉ Quản trị viên gọi được; nhật ký không chứa token.
2. *API công khai*: nhận ở cả hai nhánh; dùng lần hai, hết hạn (kéo Clock), đã thu hồi; đăng nhập sai tài khoản; hai lần nhận đồng thời; giới hạn tốc độ.
3. *E2E*: Quản trị viên tạo Lời mời và sao chép link; ở một ngữ cảnh trình duyệt mới người được mời đặt mật khẩu và vào trang chủ với vai trò Người ra đề. Thêm trang Lời mời vào `themes.spec`.

## PR 1d: Yêu cầu cấp tài khoản và Phiếu tài khoản

Đây là PR đầu tiên đưa BullMQ vào worker.

```text
Người ra đề tải lên .xlsx/.csv (dùng file mẫu) ─► job "account-request.parse" (worker, ExcelJS)
  → kiểm tra từng dòng: thiếu họ tên, sai định dạng, trùng trong file
  → kiểm tra trùng với tài khoản có sẵn: xét code trước, rồi email → match_status (Q54, Q58)
      exact → đề xuất tag_added · name_mismatch → Quản trị viên tự quyết · blocked → rejected
  → lưu account_requests + account_request_items (status pending), thông báo cho Quản trị viên

Quản trị viên duyệt từng dòng hoặc cả lô
  → dòng của người chưa có tài khoản → created: tạo users + nhãn candidate + mật khẩu tạm 7 ngày
  → dòng của người đã có tài khoản   → tag_added: chỉ thêm nhãn candidate
  → status: approved / partially_approved / rejected, thông báo cho Người ra đề gửi yêu cầu

Xuất Phiếu tài khoản (job "credential-slip.export") ─► PDF A4, 8 phiếu/trang + Excel danh sách không có mật khẩu
```

- **Tên đăng nhập mặc định:** `lower(code)`, không có mã thì dùng email (theo data-model).
- **Mật khẩu tạm:** 10 ký tự, bỏ các ký tự dễ nhầm như `0/O`, `1/l/I`. Hết hạn sau 7 ngày (`password_expires_at`).
- **Nội dung Phiếu tài khoản (Q21):** họ tên, Mã định danh, Lớp, tên đăng nhập, mật khẩu tạm, mã QR mở trang đăng nhập.
- **Ai tải được, trong bao lâu (Q21):** Quản trị viên và Người ra đề gửi yêu cầu, trong 7 ngày, trùng với hạn của mật khẩu tạm.
- **Bảo vệ mật khẩu tạm (Q56):** mật khẩu tạm chỉ có dạng rõ đúng lúc duyệt. Worker sinh file PDF, mã hóa AES-256-GCM, rồi lưu trên volume (sau interface `MediaStore`), tự xóa sau 7 ngày. Khóa mã hóa nằm trong env file, nên chỉ lộ bản sao lưu DB hoặc chỉ lộ volume thì không đọc được mật khẩu. Mỗi lần tải đều ghi `audit_logs`. Mật khẩu dạng rõ không bao giờ được ghi vào PostgreSQL hay vào log. Người nào đã đổi mật khẩu thì phiếu cũ của người đó không còn tác dụng. Quá 7 ngày thì dùng "Cấp lại mật khẩu tạm".
- **Định dạng phiếu (Q50):** PDF A4, 8 phiếu mỗi trang để cắt phát tại lớp; kèm Excel danh sách không có mật khẩu để tra cứu.
- **Thông báo trong ứng dụng (Q55, Q57):** bảng `notifications`, chuông có số chưa đọc, đánh dấu đã đọc. Client hỏi server mỗi 60 giây và khi người dùng quay lại tab; từ lát cắt 4 chuyển sang đẩy qua Socket.IO.
- Giới hạn tải lên: 2 MB và 2.000 dòng mỗi file. Kiểm tra loại MIME thật của file.
- **Worker:** thêm job dọn `login_events` cũ hơn 12 tháng, chạy hằng ngày (theo data-model).

**Web:**
- Phía Người ra đề: `/examiner/account-requests` (tải file mẫu, tải lên, xem trạng thái).
- Phía Quản trị viên: `/admin/account-requests` (duyệt từng dòng hoặc cả lô, lọc dòng `name_mismatch`, tải Phiếu tài khoản).
- Chuông thông báo ở thanh trên cùng.

**Test:**
- Unit: phân tích Excel/CSV với các file mẫu lỗi trong `test/fixtures`.
- Integration: luồng duyệt có dòng `created`, `tag_added`, `rejected`; đủ 4 giá trị `match_status`; tải phiếu sau 7 ngày bị từ chối; thông báo được tạo đúng người.
- E2E: Người ra đề tải lên → Quản trị viên duyệt → tải Phiếu tài khoản.

### Chi tiết PR 1d–1e (Q87–Q99, đề xuất)

PR 1d gom quá nhiều việc cho một lần review (hàng đợi, đọc Excel, duyệt, tạo hàng loạt tài khoản, PDF, mã hóa, thông báo, dọn dẹp). Đề xuất tách làm hai PR; tài khoản chỉ được tạo ở PR 1e, cùng lúc có Phiếu tài khoản để giao mật khẩu, nên không có tình huống tạo tài khoản mà không ai biết mật khẩu.

```text
PR 1d  hàng đợi + thông báo + gửi và xem Yêu cầu cấp tài khoản
         JobQueue (BullMQ) · notifications + chuông · file mẫu · tải lên · worker phân tích · bảng dòng
         Quản trị viên chỉ xem và Từ chối cả yêu cầu; chưa tạo tài khoản
PR 1e  duyệt + Phiếu tài khoản + dọn dẹp
         duyệt (worker tạo tài khoản) · PDF/Excel mã hóa · tải phiếu · job dọn hằng ngày
```

**Nền tảng (PR 1d)**
- **Hàng đợi (Q87):** nghiệp vụ gọi một cổng `JobQueue` (`enqueue(name, payload)`); bản thật dùng BullMQ trên Redis, test tích hợp dùng bản chạy tại chỗ nên không phải chờ. Payload của job chỉ mang id, không mang dữ liệu bí mật. Redis của pod phải đặt `maxmemory-policy noeviction` (BullMQ yêu cầu); kiểm tra cấu hình hiện tại ở `infra/`.
- **Trạng thái yêu cầu (Q89):** thêm `parsing`, `parse_failed`, `approving` vào `account_requests.status` (migration). PR 1d dùng `parsing → pending | parse_failed` và `pending → rejected`; `approving`, `approved`, `partially_approved` dùng ở PR 1e. Giao diện hỏi lại mỗi 2 giây khi đang `parsing`.
- **File mẫu và phân tích (Q88):** cột *Họ tên* (bắt buộc), *Mã định danh*, *Email*, *Lớp*, *Ngày sinh* (dd/mm/yyyy), *Giới tính* (Nam/Nữ/Khác). Mỗi dòng cần họ tên và ít nhất một trong mã hoặc email (để có tên đăng nhập). Dòng lỗi (thiếu họ tên, thiếu cả mã và email, email sai, ngày sinh sai, giới tính lạ, trùng trong file với dòng trước) vẫn được lưu với `match_status = blocked`, `outcome = rejected`, `outcome_note` là mã lỗi; Quản trị viên thấy nhưng không duyệt được. Tải lên `.xlsx` hoặc `.csv` UTF-8, tối đa 2 MB và 2.000 dòng; kiểm tra nội dung thật (xlsx phải là ZIP có `xl/workbook.xml`; csv phải là UTF-8 hợp lệ, không có byte NUL), không tin đuôi file hay MIME do client gửi.
- **Kiểm tra trùng (Q90, theo Q54):** xét mã trước rồi email. Mã và email trỏ tới hai người khác nhau: `blocked`. Khớp tài khoản Quản trị viên hoặc người đã bị Xóa: `blocked`. Khớp họ tên (bỏ dấu, không phân biệt hoa thường, gộp khoảng trắng) là `exact`, khác là `name_mismatch`, không khớp ai là `new`. Tài khoản đang bị Khóa đăng nhập vẫn khớp như bình thường.
- **Thông báo (Q95):** bảng `notifications`. Loại: `account_request.submitted` (tới mọi Quản trị viên chưa bị Xóa), `account_request.parse_failed` và `account_request.reviewed` (tới người gửi), `credential_slip.ready` (PR 1e). API: `GET /api/notifications` (50 mới nhất kèm số chưa đọc), `POST /api/notifications/read` (một hoặc tất cả). Chuông ở thanh trên cùng, hỏi mỗi 60 giây và khi tab hiện lại.
- **Quyền (Q97):** Người ra đề chỉ thấy và gửi yêu cầu của mình; Quản trị viên thấy tất cả; chỉ Quản trị viên duyệt hoặc từ chối.
- **Giao diện (Q98):** `/examiner/account-requests` (tải file mẫu, tải lên, danh sách, chi tiết với bảng dòng) và `/admin/account-requests` (danh sách lọc trạng thái, chi tiết lọc theo `match_status`, Từ chối cả yêu cầu kèm ghi chú).

**Duyệt và Phiếu tài khoản (PR 1e)**
- **Duyệt (Q91):** một nút duyệt cả lô các dòng `new` và `exact`, hoặc chọn từng dòng. Dòng `name_mismatch` phải quyết từng dòng: "Đúng là người này" (`tag_added`) hoặc Từ chối. Dòng `blocked` không duyệt được. Duyệt nhiều đợt được. Khi không còn dòng `pending`: `approved` nếu mọi dòng đều `created` hoặc `tag_added`, `rejected` nếu không dòng nào thành công, còn lại `partially_approved`.
- **Tạo tài khoản (Q92):** việc nặng (băm Argon2 cho hàng nghìn mật khẩu) nên chạy trong worker, không chạy trong request. Tên đăng nhập `lower(code)` hoặc email; trùng với người khác trong lúc chờ thì dòng thành `skipped` kèm `outcome_note` (`username_taken`, `code_taken`, `email_taken`). Mật khẩu tạm 10 ký tự, hạn 7 ngày, buộc đổi khi đăng nhập. Nhật ký ghi một dòng cho mỗi đợt duyệt (`account-request.approve`, `after` là số lượng từng kết quả), không ghi từng tài khoản.
- **Bảo vệ mật khẩu tạm (Q93, cụ thể hóa Q56):** mật khẩu dạng rõ chỉ tồn tại trong bộ nhớ worker. Worker mã hóa danh sách phiếu bằng AES-256-GCM (khóa `SLIP_ENCRYPTION_KEY` 32 byte trong env file) rồi dựng PDF và Excel, mã hóa cả hai và lưu qua `MediaStore` (thư mục trên volume). Bảng mới `credential_slips` (`id`, `request_id`, `created_by`, `item_count`, `status` `processing|ready|failed|expired`, `pdf_key`, `xlsx_key`, `expires_at`, `created_at`); mỗi đợt duyệt sinh một phiếu.
- **Tải phiếu (Q94):** `GET /api/credential-slips/:id/pdf` và `/xlsx`: Quản trị viên hoặc người gửi yêu cầu, trong 7 ngày; quá hạn trả `410 SLIP_EXPIRED`; chưa xong trả `409 INVALID_STATE`; mỗi lần tải ghi `credential-slip.download`. PDF dựng bằng `pdfkit` + `qrcode` (không cần trình duyệt), font Be Vietnam Pro (OFL, file TTF đặt trong `apps/api/assets/fonts`), QR mở `<APP_ORIGIN>/login`.
- **Dọn dẹp (Q96):** job lặp hằng ngày: xóa `login_events` quá 12 tháng, xóa file phiếu hết hạn (đặt `expired`), xóa file tải lên tạm.

**Test (seam đề xuất)**
1. *Unit* (không DB): bộ phân tích file với các file mẫu lỗi (xlsx dựng bằng ExcelJS trong test, csv); mã hóa/giải mã AES-GCM (đi về nguyên vẹn, sai khóa hoặc bị sửa thì lỗi).
2. *Tích hợp* (HTTP + PostgreSQL + Redis, `JobQueue` chạy tại chỗ, `MediaStore` trỏ thư mục tạm): tải lên → bốn giá trị `match_status` + dòng lỗi; quyền xem; thông báo tới đúng người. PR 1e: duyệt tạo `created`, `tag_added`, `skipped`, `rejected`; tải phiếu (kiểm tra là PDF hợp lệ và đủ số trang, không so hình); quá 7 ngày bị từ chối; mỗi lần tải có nhật ký; mật khẩu dạng rõ không có trong DB. Một test duy nhất đi qua BullMQ và Redis thật để kiểm tra bản adapter.
3. *E2E*: PR 1d: Người ra đề tải lên file mẫu → Quản trị viên thấy bảng dòng và thông báo. PR 1e: Quản trị viên duyệt → tải Phiếu tài khoản.

## Gửi email (để sau)

Q2 và Q37 trước đây chốt rằng email dùng cho Lời mời và link đặt mật khẩu. Q43 thay đổi điều này: **cả giai đoạn 1 không gửi email**, việc gửi email chuyển vào backlog. Khi cần gửi email, việc gửi đặt sau một interface `MailSender`, giống cách làm với `MediaStore`. Lúc đó chỉ phải viết thêm một adapter, không sửa nghiệp vụ. Khuyến nghị khi làm: dịch vụ gửi email giao dịch (ví dụ Brevo, Resend) gửi từ tên miền của hệ thống, hoặc một tài khoản Gmail riêng của hệ thống. Không dùng Gmail cá nhân của Quản trị viên, vì app password mở được cả hộp thư và hệ thống sẽ phụ thuộc vào một người. Chốt bằng ADR.

## Ngoài phạm vi lát cắt 1

- Người ra đề cấp lại mật khẩu tạm cho Người dự thi trong Danh sách dự thi: cần Phiên thi (lát cắt 4).
- Tự động Nộp bài khi bị Khóa đăng nhập giữa lúc làm bài: lát cắt 4.
- Chuyển giao Chủ đề, và chọn người nhận khi Xóa người dùng là Người ra đề: lát cắt 2.
- Người dùng tự đặt lại mật khẩu khi quên: cần email, nằm trong backlog. Giai đoạn 1 dùng "Cấp lại mật khẩu tạm".
- Xác thực hai lớp (TOTP) cho Quản trị viên: backlog (Q45).

## Quyết định (Q43–Q99)

Vòng chất vấn ngày 28/10/2026, tiếp nối Q1–Q42 của vòng chất vấn đặc tả. Mọi câu đều chấp nhận khuyến nghị.

| Câu | Quyết định |
|---|---|
| Q43 | Cả giai đoạn 1 không gửi email; Lời mời chỉ tạo link; Phiếu tài khoản là kênh duy nhất giao mật khẩu |
| Q44 | Phiên: 12 giờ không hoạt động, tối đa 7 ngày |
| Q45 | Quản trị viên: phiên 30 phút / 12 giờ; TOTP đưa vào backlog |
| Q46 | Mật khẩu 10–128 ký tự, chặn mật khẩu phổ biến; mật khẩu tạm 10 ký tự, bỏ ký tự dễ nhầm |
| Q47 | Sai 5 lần liên tiếp thì bị chặn 15 phút |
| Q48 | Thêm `users.password_expires_at` |
| Q49 | `audit_logs.actor_id = NULL` nghĩa là hệ thống |
| Q50 | Phiếu tài khoản dạng PDF A4, 8 phiếu/trang, kèm Excel danh sách không có mật khẩu |
| Q51 | Được đăng nhập nhiều thiết bị; người dùng tự xem và đăng xuất từng phiên |
| Q52 | Không tạo Lời mời tới email của tài khoản Quản trị viên |
| Q53 | Quản trị viên nhập họ tên, email, Đơn vị; người được mời chọn học vị, học hàm |
| Q54 | Kiểm tra trùng theo mã trước, rồi email; khác họ tên thì Quản trị viên tự quyết; khớp tài khoản Quản trị viên hoặc người đã bị Xóa thì từ chối |
| Q55 | Thông báo trong ứng dụng làm ở PR 1d |
| Q56 | Phiếu tài khoản mã hóa AES-256-GCM trên volume, tự xóa sau 7 ngày, khóa trong env file |
| Q57 | Thông báo: client hỏi server mỗi 60 giây; từ lát cắt 4 chuyển sang Socket.IO |
| Q58 | Thêm `account_request_items.match_status` |
| Q59 | Thuật ngữ **Phiên đăng nhập** (`AuthSession`) trong GLOSSARY; code không dùng "session" đứng một mình |
| Q60 | `recover-admin` chỉ khôi phục tài khoản Quản trị viên chưa bị Xóa và cấp mật khẩu tạm mới; `bootstrap-admin` chạy khi không còn Quản trị viên chưa bị Xóa |
| Q61 | Cấp lại mật khẩu tạm: thu hồi mọi phiên, gỡ khóa tạm, không mở Khóa đăng nhập, không tự cấp cho mình |
| Q62 | Quản trị viên thao tác được trên Quản trị viên khác, trừ chính mình |
| Q63 | Mở khóa không bắt buộc lý do |
| Q64 | Gắn nhãn `examiner` thì tạo `examiner_profiles` trống; gỡ nhãn giữ hồ sơ; cho phép không còn nhãn nào |
| Q65 | Danh sách trường sửa được; trùng thì `CONFLICT` (409); đổi tên đăng nhập/email không thu hồi phiên |
| Q66 | Xóa người dùng không khôi phục được; vẫn xem được qua bộ lọc "Đã xóa" |
| Q67 | Phân trang `page`/`pageSize` (20, tối đa 100) kèm `total` |
| Q68 | Nhật ký chỉ ghi trường thay đổi, không ghi mật khẩu |
| Q69 | Tìm kiếm không dấu bằng extension `unaccent` |
| Q70 | Tạo Quản trị viên mới bằng mật khẩu tạm sinh ngẫu nhiên, hiển thị một lần |
| Q76 | `IdentityService.revokeAllSessions` chưa làm ở lát cắt 1 vì chưa module nào dùng; thêm ở lát cắt 4 cùng việc tự động Nộp bài khi bị Khóa đăng nhập |
| Q77 | Trạng thái Lời mời suy ra từ cột và Clock, không lưu |
| Q78 | Token 32 byte, lưu SHA-256, link chỉ hiện một lần, không vào nhật ký |
| Q79 | Tạo Lời mời từ chối email Quản trị viên, email đã là Người ra đề, email đã có Lời mời còn hạn |
| Q80 | Thu hồi chỉ cho `pending`; Tạo lại link cho `pending` và `expired`, giữ `id`; không sửa Lời mời đã tạo |
| Q81 | Link không dùng được thì cùng trả `404 INVITATION_UNAVAILABLE`; endpoint công khai giới hạn 30 lần/10 phút/IP |
| Q82 | Nhận khi chưa có tài khoản: tạo `users` + nhãn + hồ sơ trong một transaction, đăng nhập luôn; học vị, học hàm không bắt buộc |
| Q83 | Nhận khi đã có tài khoản: phải đăng nhập đúng email; hồ sơ có sẵn chỉ điền ô trống |
| Q84 | Bốn hành động nhật ký `invitation.*`; `accept` có người thực hiện là người nhận |
| Q85 | API Quản trị viên: liệt kê, tạo, revoke, regenerate; chỉ tạo và regenerate trả token |
| Q86 | Trang quản trị "Lời mời" và trang công khai `/invite/$token` ngoài `_authed` |
| Q87 | Nghiệp vụ gọi cổng `JobQueue`; BullMQ là adapter, test dùng bản chạy tại chỗ; Redis đặt `noeviction` |
| Q88 | File mẫu 6 cột; dòng lỗi vẫn lưu nhưng không duyệt được; kiểm nội dung thật của file |
| Q89 | Thêm trạng thái `parsing`, `parse_failed`, `approving` cho `account_requests` |
| Q90 | Khớp tài khoản có sẵn: mã trước, email sau; hai người khác nhau hoặc Quản trị viên hoặc đã Xóa là `blocked` |
| Q91 | Duyệt cả lô `new` + `exact` hoặc từng dòng; `name_mismatch` phải quyết từng dòng |
| Q92 | Tạo tài khoản chạy trong worker; trùng giữa chừng thì `skipped`; một dòng nhật ký mỗi đợt duyệt |
| Q93 | Mật khẩu dạng rõ chỉ ở bộ nhớ worker; phiếu mã hóa AES-256-GCM; bảng `credential_slips` |
| Q94 | Tải phiếu: Quản trị viên hoặc người gửi, 7 ngày, `410` khi quá hạn, mỗi lần tải ghi nhật ký; `pdfkit` + `qrcode` |
| Q95 | Bảng `notifications`, bốn loại thông báo, chuông hỏi mỗi 60 giây |
| Q96 | Job dọn hằng ngày: `login_events` > 12 tháng, phiếu hết hạn, file tạm |
| Q97 | Người ra đề chỉ thấy yêu cầu của mình; chỉ Quản trị viên duyệt |
| Q98 | Hai khu giao diện `/examiner/account-requests` và `/admin/account-requests` |
| Q99 | Tách PR 1d thành 1d (nền tảng + gửi/xem yêu cầu) và 1e (duyệt + Phiếu tài khoản + dọn dẹp) |
