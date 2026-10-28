# Lát cắt 1: Người dùng, đăng nhập, Lời mời, Yêu cầu cấp tài khoản

> Trạng thái: **proposed**. Làm theo [data-model.md](../data-model.md) mục 1, [ADR-0004](../adr/0004-phien-dang-nhap-opaque-cookie.md) và [architecture.md](../architecture.md) mục 6. Những chỗ cần **thêm vào mô hình dữ liệu** hoặc tài liệu **chưa quy định** được đánh dấu **[cần duyệt]** và gom lại ở mục [Câu hỏi mở](#câu-hỏi-mở).

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
| `identity` | `AuthGuard` (bắt buộc đăng nhập), decorator `@AdminOnly()`, `@RequireTag('examiner' \| 'candidate')`, `@CurrentUser()`; `IdentityService.revokeAllSessions(userId, reason)` |
| `audit` | `AuditService.record({ actorId, action, entity, before, after, ip })` |

### Phiên đăng nhập (ADR-0004)

| Mục | Cách làm |
|---|---|
| Cookie | `exam_sid`, gồm `HttpOnly`, `Secure` (trừ khi chạy dev), `SameSite=Lax`, `Path=/` |
| Mã phiên | 32 byte ngẫu nhiên. Cookie giữ mã gốc; PostgreSQL (`auth_sessions.token_hash`) và Redis chỉ giữ SHA-256 của mã |
| Redis | `auth:session:<hash>` chứa `{ userId, isAdmin, tags, mustChangePassword }`, TTL bằng thời hạn phiên. Bộ `auth:user-sessions:<userId>` dùng để thu hồi mọi phiên của một người |
| Thời hạn **[cần duyệt]** | Hết hạn sau 12 giờ không hoạt động (mỗi request gia hạn lại), tối đa 7 ngày kể từ lúc đăng nhập |
| Thu hồi | Khóa đăng nhập, Xóa người dùng, đổi mật khẩu (trừ phiên đang dùng), đăng xuất: xóa trong Redis và ghi `revoked_at`, `revoked_reason` vào PostgreSQL |
| CSRF | Ngoài `SameSite=Lax`, mọi request đổi dữ liệu (POST/PUT/PATCH/DELETE) phải có header `Origin` trùng với origin của hệ thống, sai thì trả 403 |
| Mất Redis | Phiên không tra được thì người dùng đăng nhập lại (ADR-0002). Không quay sang đọc PostgreSQL |

### Mật khẩu và chống dò mật khẩu

- Băm bằng Argon2id qua thư viện `@node-rs/argon2`. Thư viện có sẵn bản biên dịch, không cần build native trong image. Tham số theo OWASP: `m=19 MiB, t=2, p=1`.
- **Chính sách mật khẩu [cần duyệt]:** 10–128 ký tự, không bắt buộc kết hợp loại ký tự (theo ASVS 5). Từ chối mật khẩu trùng tên đăng nhập, email, Mã định danh, và các mật khẩu có trong danh sách khoảng 10.000 mật khẩu phổ biến (file tĩnh trong repo).
- **Khóa tạm sau 5 lần sai liên tiếp.** Đây là cơ chế tự động, khác với **Khóa đăng nhập** do Quản trị viên thực hiện. `failed_login_count` tăng mỗi lần sai. Đến lần thứ 5, đặt key Redis `auth:login-block:<userId>` sống trong **15 phút [cần duyệt]**. Đăng nhập thành công thì đếm lại từ 0. Không cần thêm cột vào DB.
- **Giới hạn tần suất:** 20 lần đăng nhập mỗi 10 phút cho mỗi IP. Mức này nới rộng có chủ đích, vì cả lớp dùng chung Wi-Fi nên chung một IP. Mỗi định danh (tên đăng nhập hoặc email) được 10 lần mỗi 10 phút. Đếm bằng Redis.
- Mọi lần đăng nhập, dù thành công hay thất bại, đều ghi vào `login_events`. Thông báo lỗi luôn chung chung ("Tên đăng nhập hoặc mật khẩu không đúng"), không cho biết tài khoản có tồn tại hay không. Riêng trường hợp bị Khóa đăng nhập thì báo rõ, nhưng chỉ khi mật khẩu đúng.

### Bổ sung mô hình dữ liệu [cần duyệt]

| Thay đổi | Lý do |
|---|---|
| `users.password_expires_at timestamptz NULL` | Data-model ghi "mật khẩu tạm hết hạn sau 7 ngày nếu chưa dùng" nhưng chưa có cột lưu hạn này. Cột có giá trị khi tạo bằng mật khẩu tạm, về NULL sau khi đổi mật khẩu |
| Migration đầu tiên chạy `CREATE EXTENSION IF NOT EXISTS citext` | `username` và `email` dùng kiểu `citext` |
| Khóa chính UUIDv7 sinh ở ứng dụng, dùng thư viện `uuid` (`v7()`) | PostgreSQL 17 chưa có hàm `uuidv7()` (bản 18 mới có) |

### Giao diện (web)

- Route `/login` và `/change-password` đặt ngoài layout chính.
- Route `/admin/*` chỉ cho Quản trị viên. `/examiner/*` và `/take/*` kiểm tra Nhãn vai trò.
- Mọi route đều gọi `GET /api/auth/me` qua TanStack Query. Nếu `mustChangePassword = true`, người dùng bị chuyển tới `/change-password` cho tới khi đổi xong.
- Thiết kế cho điện thoại trước, vùng chạm tối thiểu 48 px. Mọi chuỗi giao diện nằm trong `vi.json`.

## PR 1a: Đăng nhập và Quản trị viên đầu tiên

**Bảng:** `users`, `units`, `user_role_tags`, `examiner_profiles`, `auth_sessions`, `login_events`. Tạo đủ bảng ngay từ đầu để 1b, 1c và 1d không phải sửa schema.

**CLI** (`apps/api/src/cli/main.ts`, chạy bằng `pnpm cli <lệnh>`, trong image là `node dist/cli/main.js <lệnh>`):
- `bootstrap-admin`: đọc `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_FULL_NAME`, `BOOTSTRAP_ADMIN_PASSWORD`. Chỉ chạy khi chưa có Quản trị viên nào. Đặt `must_change_password = true`.
- `recover-admin --username <u>`: cấp lại quyền Quản trị viên cho một người dùng có sẵn, và mở Khóa đăng nhập nếu đang bị khóa. Ghi `audit_logs` với actor là hệ thống **[cần duyệt: actor_id NULL nghĩa là "hệ thống"]**.

**API:**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | `{ identifier, password }`. `identifier` là tên đăng nhập hoặc email |
| POST | `/api/auth/logout` | Thu hồi phiên hiện tại |
| GET | `/api/auth/me` | `{ id, fullName, isAdmin, tags, mustChangePassword }` |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }`, thu hồi mọi phiên khác |

**Web:** trang đăng nhập, trang đổi mật khẩu, nút đăng xuất, chặn route theo vai trò.

**Test:**
- Unit: chính sách mật khẩu; logic khóa tạm (lần sai thứ 5, hết 15 phút, đếm lại sau khi đăng nhập thành công).
- Integration: đăng nhập đúng/sai; khóa tạm; phiên bị thu hồi thì trả 401; bắt buộc đổi mật khẩu; thiếu hoặc sai `Origin` thì trả 403.
- E2E (desktop + mobile): `bootstrap-admin` → đăng nhập → bị buộc đổi mật khẩu → vào được `/admin`.

## PR 1b: Quản lý Người dùng và nhật ký thao tác

**API Quản trị viên** (`/api/admin/...`, gắn `@AdminOnly()`):

| Chức năng | Ghi chú |
|---|---|
| Danh sách Người dùng | Tìm theo tên, tên đăng nhập, email, Mã định danh, Lớp; lọc theo Nhãn vai trò, trạng thái; phân trang |
| Xem, sửa thông tin | `date_of_birth` và `gender` chỉ trả về cho Quản trị viên (Nghị định 13/2023) |
| Gắn, gỡ Nhãn vai trò | Không áp dụng cho Quản trị viên |
| Khóa đăng nhập, mở khóa | Bắt buộc ghi lý do; thu hồi mọi phiên; không được tự khóa chính mình |
| Xóa người dùng | Soft-delete, thu hồi mọi phiên, không được tự xóa mình. Phần chọn người nhận Chủ đề, Bộ đề, Phiên thi của Người ra đề sẽ làm khi các bảng đó có (lát cắt 2–4). Ở lát cắt 1, người cần xóa chưa sở hữu gì nên xóa thẳng |
| Chỉ định Quản trị viên **[cần duyệt]** | Gắn `is_admin = true` và gỡ hết Nhãn vai trò, vì Quản trị viên không mang nhãn. Có hộp xác nhận, vì thao tác này làm người đó mất quyền Người ra đề/Người dự thi |
| Cấp lại mật khẩu tạm | Sinh mật khẩu tạm mới, đặt `must_change_password` và `password_expires_at`, rồi hiển thị **một lần** |
| Đơn vị | Thêm, sửa, xem danh sách |
| Lịch sử đăng nhập | Lọc theo người, theo kết quả |
| Nhật ký thao tác | Lọc theo người thực hiện, hành động, đối tượng |

**Audit:** mọi thao tác ở trên đều gọi `AuditService.record`. Bảng `audit_logs` bị thu hồi quyền `UPDATE` và `DELETE` ở mức DB, bằng một trigger `BEFORE UPDATE OR DELETE` báo lỗi.

**Web:** `/admin/users` (danh sách + chi tiết), `/admin/units`, `/admin/login-events`, `/admin/audit-logs`.

**Test:** integration cho từng quy tắc ràng buộc ở tầng service (data-model mục 1), cho việc thu hồi phiên ngay lập tức, và cho việc `audit_logs` từ chối UPDATE.

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
- Không gửi email ở lát cắt này. Xem mục [Gửi email](#gửi-email-để-sau).

**Test:** integration cho cả hai nhánh (chưa có tài khoản / đã có tài khoản), link dùng lần hai, link hết hạn, link đã thu hồi, và trường hợp người đã đăng nhập bằng tài khoản có email khác với email được mời (phải từ chối).

## PR 1d: Yêu cầu cấp tài khoản và Phiếu tài khoản

Đây là PR đầu tiên đưa BullMQ vào worker.

```text
Người ra đề tải lên .xlsx/.csv (dùng file mẫu) ─► job "account-request.parse" (worker, ExcelJS)
  → kiểm tra từng dòng: thiếu họ tên, sai định dạng, trùng trong file, trùng code/email với tài khoản có sẵn
  → lưu account_requests + account_request_items (status pending)

Quản trị viên duyệt từng dòng hoặc cả lô
  → dòng của người chưa có tài khoản → created: tạo users + nhãn candidate + mật khẩu tạm 7 ngày
  → dòng của người đã có tài khoản   → tag_added: chỉ thêm nhãn candidate
  → status: approved / partially_approved / rejected

Xuất Phiếu tài khoản (job "credential-slip.export") ─► file .xlsx, mỗi trang in một Người dự thi
```

- **Tên đăng nhập mặc định:** `lower(code)`, không có mã thì dùng email (theo data-model).
- **Mật khẩu tạm:** 10 ký tự, bỏ các ký tự dễ nhầm như `0/O`, `1/l/I`. Hết hạn sau 7 ngày (`password_expires_at`).
- **Bảo vệ mật khẩu tạm [cần duyệt]:** mật khẩu tạm chỉ có dạng rõ đúng lúc duyệt. Worker sinh file Phiếu tài khoản và lưu vào Redis, mã hóa AES-GCM, TTL 24 giờ. Quản trị viên tải được trong 24 giờ đó. Quá hạn thì phải dùng "Cấp lại mật khẩu tạm" cho cả lô. Mật khẩu dạng rõ không bao giờ được ghi vào PostgreSQL hay vào log.
- Giới hạn tải lên: 2 MB và 2.000 dòng mỗi file. Kiểm tra loại MIME thật của file.
- **Worker:** thêm job dọn `login_events` cũ hơn 12 tháng, chạy hằng ngày (theo data-model).

**Web:**
- Phía Người ra đề: `/examiner/account-requests` (tải file mẫu, tải lên, xem trạng thái).
- Phía Quản trị viên: `/admin/account-requests` (duyệt từng dòng hoặc cả lô, tải Phiếu tài khoản).

**Test:**
- Unit: phân tích Excel/CSV với các file mẫu lỗi trong `test/fixtures`.
- Integration: luồng duyệt có dòng `created`, `tag_added`, `rejected`.
- E2E: Người ra đề tải lên → Quản trị viên duyệt → tải Phiếu tài khoản.

## Gửi email (để sau)

Lát cắt 1 chỉ tạo link. Khi cần gửi email, việc gửi đặt sau một interface `MailSender`, giống cách làm với `MediaStore`. Lúc đó chỉ phải viết thêm một adapter, không sửa nghiệp vụ. Phân tích lựa chọn nhà cung cấp nằm trong câu trả lời ngày 28/10/2026 cho chủ dự án; sẽ chốt bằng ADR khi làm.

## Ngoài phạm vi lát cắt 1

- Người ra đề cấp lại mật khẩu tạm cho Người dự thi trong Danh sách dự thi: cần Phiên thi (lát cắt 4).
- Tự động Nộp bài khi bị Khóa đăng nhập giữa lúc làm bài: lát cắt 4.
- Chuyển giao Chủ đề, và chọn người nhận khi Xóa người dùng là Người ra đề: lát cắt 2.
- Người dùng tự đặt lại mật khẩu khi quên: hiện tại Quản trị viên cấp lại mật khẩu tạm; tự đặt lại cần email.

## Câu hỏi mở

1. Thời hạn phiên: hết hạn sau 12 giờ không hoạt động, tối đa 7 ngày?
2. Chính sách mật khẩu: 10–128 ký tự kèm danh sách mật khẩu phổ biến?
3. Khóa tạm sau 5 lần sai kéo dài 15 phút?
4. Thêm cột `users.password_expires_at`?
5. `audit_logs.actor_id = NULL` nghĩa là thao tác do hệ thống (CLI, worker)?
6. Chỉ định Quản trị viên thì gỡ hết Nhãn vai trò của người đó?
7. Phiếu tài khoản lưu mã hóa trong Redis 24 giờ, quá hạn thì cấp lại mật khẩu tạm?
