# Mô hình dữ liệu (bản đề xuất để duyệt)

> PostgreSQL. Khóa chính dùng `uuid` (UUIDv7, sắp xếp được theo thời gian). Mọi bảng có `created_at` và `updated_at` (dạng `timestamptz`), các bảng dưới đây không ghi lại hai cột này. Thuật ngữ theo [GLOSSARY.md](../GLOSSARY.md).

> Đặt điểm nhanh (theo Bộ đề, Phần hoặc Loại câu; đồng loạt hoặc chia đều tổng) chỉ là thao tác giao diện, ghi vào `exam_items.points`. Không cần thêm bảng.

## 1. Người dùng (module `identity`)

```sql
units (                                   -- Đơn vị (khoa/phòng)
  id, code UNIQUE, name
)

users (
  id            uuid PK,
  username      citext,                   -- tên đăng nhập
  email         citext,
  password_hash text,                     -- Argon2id
  full_name     text NOT NULL,
  code          text,                     -- Mã định danh (mã SV, mã NV...)
  class_label   text,                     -- Lớp: chỉ để tìm kiếm, không lưu lịch sử
  date_of_birth date,
  gender        enum('male','female','other'),
  status        enum('active','locked') DEFAULT 'active',
  locked_at, locked_by → users, locked_reason,
  must_change_password bool DEFAULT true,
  password_expires_at  timestamptz NULL,  -- hạn của mật khẩu tạm (7 ngày); NULL sau khi người dùng đổi mật khẩu
  failed_login_count   int DEFAULT 0,
  last_login_at,
  created_by → users,
  removed_at, removed_by → users          -- Xóa người dùng (soft-delete)
)
-- Duy nhất trong số người dùng chưa bị xóa:
UNIQUE (username) WHERE removed_at IS NULL
UNIQUE (email)    WHERE removed_at IS NULL
UNIQUE (code)     WHERE removed_at IS NULL AND code IS NOT NULL
INDEX  (class_label) WHERE removed_at IS NULL

-- users có thêm cột: is_admin bool DEFAULT false   -- Quản trị viên không mang Nhãn vai trò

user_role_tags (                          -- Nhãn vai trò; một người có thể mang cả hai
  user_id → users (is_admin = false), tag enum('examiner','candidate'),
  granted_by → users, granted_at,
  PK (user_id, tag)
)
INDEX (tag, user_id)                      -- tìm nhanh Người dự thi khi lập Danh sách dự thi

invitations (                             -- Lời mời trở thành Người ra đề
  id, email citext, full_name, unit_id → units,
  token_hash text UNIQUE, invited_by → users (admin),
  expires_at, accepted_at, accepted_user_id → users, revoked_at
)

account_requests (                        -- Yêu cầu cấp tài khoản
  id, requested_by → users (examiner), note text,
  original_filename text,                 -- tên file người dùng tải lên, chỉ để hiển thị
  upload_key text NULL,                   -- khóa file tải lên trong MediaStore; xóa sau khi phân tích
  status enum('parsing','parse_failed','pending','approving','approved','partially_approved','rejected'),
  parse_error text NULL,                  -- mã lỗi khi status = parse_failed
  row_count int NULL,
  reviewed_by → users (admin), reviewed_at, review_note
)
account_request_items (
  id, request_id → account_requests, row_number int,   -- số dòng trong file, để Người ra đề tìm lại
  full_name, code, email, class_label, date_of_birth, gender,   -- dữ liệu từ Excel/CSV, NULL nếu dòng lỗi ở trường đó
  match_status enum('new','exact','name_mismatch','blocked'), -- kết quả kiểm tra trùng lúc đọc file
  outcome enum('pending','created','tag_added','skipped','rejected'),
  user_id → users NULL,                   -- tài khoản bị khớp lúc kiểm tra trùng, hoặc tài khoản được tạo
  outcome_note                            -- mã lỗi của dòng (blocked) hoặc lý do bỏ qua
)

credential_slips (                        -- Phiếu tài khoản của một đợt duyệt (PR 1e)
  id, request_id → account_requests, created_by → users (admin), item_count int,
  status enum('ready','failed','expired'),   -- `failed`: dựng PDF lỗi, tài khoản vẫn được tạo (dùng "Cấp lại mật khẩu tạm")
  pdf_key text NULL, xlsx_key text NULL,     -- khóa trong MediaStore; file đã mã hóa AES-256-GCM, NULL khi hết hạn
  expires_at timestamptz,                    -- = hạn của mật khẩu tạm (7 ngày kể từ lúc duyệt)
  created_at
)

examiner_profiles (                       -- thông tin riêng của Người ra đề
  user_id PK → users,
  academic_degree enum('bachelor','engineer','master','doctor','doctor_of_science'), -- học vị
  academic_title  enum('associate_professor','professor') NULL,                       -- học hàm
  unit_id → units
)

auth_sessions (
  id uuid PK, user_id → users, token_hash text UNIQUE,
  ip inet, user_agent text, device_label text,
  expires_at, revoked_at, revoked_reason
)

login_events (                            -- lịch sử đăng nhập
  id, user_id → users NULL, identifier_tried text,
  success bool, failure_reason text, ip inet, user_agent text, at timestamptz
)

audit_logs (                              -- chỉ INSERT, không UPDATE/DELETE
  id bigserial, actor_id → users NULL,              -- NULL: thao tác do hệ thống (CLI, worker)
  action text,                                      -- 'user.lock', 'exam.publish', 'cli.recover-admin', ...
  entity_type text, entity_id uuid,
  before jsonb, after jsonb, ip inet, at timestamptz
)
```

Quy tắc ràng buộc ở tầng service:
- Quản trị viên không được tự Khóa đăng nhập hoặc tự Xóa mình.
- Khóa đăng nhập hoặc Xóa người dùng sẽ thu hồi mọi `auth_sessions` của người đó, xóa luôn trong Redis.
- Mỗi người dùng phải có ít nhất một trong hai: `username` hoặc `email`.
- Quản trị viên đầu tiên được tạo bằng lệnh `pnpm cli bootstrap-admin`, thông tin lấy từ biến môi trường. Lệnh chỉ chạy được khi không còn Quản trị viên nào chưa bị Xóa (`is_admin = true AND removed_at IS NULL`), nhờ vậy vẫn khôi phục được khi mọi Quản trị viên đều đã bị Xóa.
- **Lời mời:** Quản trị viên tạo Lời mời (họ tên, email, Đơn vị) → hệ thống hiển thị link một lần, Quản trị viên tự gửi cho người được mời (giai đoạn 1 không gửi email) → người nhận mở link (dùng một lần, hết hạn sau 7 ngày), chọn học vị, học hàm và đặt mật khẩu → tạo `users`, gắn nhãn `examiner` và `examiner_profiles`. Nếu email đã có tài khoản thì người nhận phải đăng nhập bằng tài khoản đó, rồi chỉ được thêm nhãn. Không được tạo Lời mời tới email của một tài khoản Quản trị viên.
- **Yêu cầu cấp tài khoản:** Người ra đề tải lên Excel/CSV → hệ thống kiểm tra trùng theo `code`/`email` → Quản trị viên duyệt từng dòng hoặc cả lô. Người đã có tài khoản thì chỉ được thêm nhãn `candidate` (`tag_added`), người chưa có thì tạo tài khoản mới (`created`) kèm mật khẩu tạm ngẫu nhiên và Phiếu tài khoản. Giai đoạn 1 không gửi email; Phiếu tài khoản là kênh duy nhất giao mật khẩu.
- **Kiểm tra trùng khi đọc file:** xét `code` trước, rồi đến `email`. `exact`: khớp mã và họ tên, đề xuất `tag_added`. `name_mismatch`: khớp mã hoặc email nhưng khác họ tên, Quản trị viên tự quyết. `blocked`: khớp tài khoản Quản trị viên hoặc người đã bị Xóa, luôn `rejected`.
- **Phiếu tài khoản:** PDF A4, 8 phiếu mỗi trang, gồm họ tên, Mã định danh, Lớp, tên đăng nhập, mật khẩu tạm và mã QR mở trang đăng nhập; kèm file Excel danh sách không có mật khẩu. Cả file PDF lẫn Excel được mã hóa AES-256-GCM (khóa `SLIP_ENCRYPTION_KEY` trong env file), lưu sau `MediaStore` và tự xóa sau 7 ngày. Thông tin từng phiếu cũng được mã hóa và ghi ngay lúc tạo tài khoản để job chết giữa chừng vẫn dựng lại được phiếu, rồi xóa sau khi phiếu đã lưu. Quản trị viên và Người ra đề gửi yêu cầu tải được trong 7 ngày đó, mỗi lần tải ghi `audit_logs`. Mật khẩu dạng rõ không bao giờ được ghi vào PostgreSQL hay vào log.
- **Quản trị viên:** có thể có nhiều người. Lệnh `pnpm cli recover-admin --username <tên>` trên máy chủ khôi phục một tài khoản Quản trị viên chưa bị Xóa: mở Khóa đăng nhập, gỡ khóa tạm, cấp mật khẩu tạm mới (in ra một lần, hạn 7 ngày) và thu hồi mọi Phiên đăng nhập. Lệnh không biến tài khoản khác thành Quản trị viên, vì tài khoản Quản trị viên được tách riêng.
- **Chuyển giao Chủ đề:** đổi `topics.owner_id` và `questions.owner_id`, kèm các Bộ đề **nháp** đang dùng câu của Chủ đề đó, trong cùng một giao dịch, rồi ghi `audit_logs`.
- **Xóa người dùng là Người ra đề:** bắt buộc chọn người nhận cho mọi Chủ đề, Bộ đề và Phiên thi chưa Chốt của người đó.
- **Tên đăng nhập mặc định:** `lower(code)`, nếu không có mã thì dùng email. Mật khẩu tạm hết hạn sau 7 ngày nếu chưa dùng.
- **Người ra đề cấp lại mật khẩu tạm:** chỉ cho người có tên trong Danh sách dự thi của một Phiên thi chưa Chốt của mình, có ghi `audit_logs`.
- **Tài khoản Quản trị viên** (`is_admin = true`) không có dòng nào trong `user_role_tags`. Chỉ định thêm Quản trị viên nghĩa là tạo một tài khoản Quản trị viên mới; không gắn `is_admin` cho tài khoản đang mang Nhãn vai trò.
- **Dữ liệu cá nhân** (Nghị định 13/2023): `date_of_birth` và `gender` không bắt buộc, chỉ Quản trị viên xem được. `login_events` được xóa sau 12 tháng bằng job của worker. `audit_logs` và Kết quả giữ lâu dài.
- **Khóa đăng nhập khi đang làm bài:** tự động Nộp bài (`submit_reason = 'account_locked'`) và báo cho Người ra đề.

## 2. Ngân hàng câu hỏi (module `question-bank`)

```sql
topics (                                  -- Chủ đề
  id, owner_id → users NOT NULL, name, description, archived_at
)

questions (
  id, topic_id → topics, owner_id → users,   -- owner_id lặp lại để kiểm tra quyền nhanh
  type enum('single_choice','multiple_choice','true_false_cluster','essay'),
  stem jsonb,                              -- rich text (TipTap JSON)
  payload jsonb,                           -- phần riêng theo type, kiểm tra bằng Zod
  default_points numeric(6,2),
  tags text[], version int, archived_at
)

illustrations (                           -- Hình minh họa
  id, owner_id → users, object_key text, width, height, mime, bytes, alt text
)
question_illustrations (question_id, illustration_id, position text, sort int)
-- position: 'stem' | 'option:<id>' | 'statement:<id>'
```

Ví dụ `payload` theo từng loại:

```jsonc
// single_choice / multiple_choice
{ "options": [{ "id": "o1", "content": {...} }, ...],
  "key": ["o2", "o4"],
  "scoringRule": "proportional" | "all_or_nothing",   // chỉ dùng cho multiple_choice
  "shuffleOptions": true }

// true_false_cluster
{ "statements": [{ "id": "s1", "content": {...}, "key": true }, ...],
  "scoringRule": "proportional" | "all_or_nothing" | "ladder",
  "ladder": [0, 0.1, 0.25, 0.5, 1] }   // phần tử thứ k = tỷ lệ điểm khi đúng k Mệnh đề; độ dài = số Mệnh đề + 1

// essay
{ "maxLength": 2000, "rubric": {...} }   // rubric: hướng dẫn chấm, không hiển thị cho Người dự thi
```

## 3. Bộ đề (module `exam`)

```sql
exams (
  id, owner_id → users, title, instructions jsonb,
  status enum('draft','published','archived'), published_at
)

exam_sections (                           -- Phần; Bộ đề không chia phần có 1 Phần mặc định
  id, exam_id → exams, title NULL, instructions jsonb, sort int,
  shuffle_items bool DEFAULT true
)

exam_items (
  id, exam_id → exams, section_id → exam_sections,
  question_id → questions,                -- một Câu hỏi dùng lại được ở nhiều Bộ đề
  points numeric(6,2), sort int,
  snapshot jsonb NULL,                    -- điền khi Phát hành (ADR-0005)
  UNIQUE (exam_id, question_id)           -- một Câu hỏi không xuất hiện 2 lần trong cùng Bộ đề
)
-- Ràng buộc sở hữu (kiểm tra ở service + trigger): questions.owner_id = exams.owner_id
```

## 4. Phiên thi (module `session`)

```sql
sessions (
  id, exam_id → exams (status = published), owner_id → users, title,
  opens_at, closes_at, duration_minutes,
  max_attempts int DEFAULT 1,
  attempt_scoring enum('highest','latest') DEFAULT 'highest',
  shuffle_items bool, shuffle_options bool,
  access_code text NOT NULL,              -- Mã vào thi do Người ra đề đặt trước
  appeal_period_hours int DEFAULT 72,     -- Kết quả luôn chờ Người ra đề Công bố
  released_at, finalized_at
)

-- Mã vào thi không trùng giữa các Phiên thi chưa đóng:
UNIQUE (access_code) WHERE finalized_at IS NULL

session_roster (                          -- Danh sách dự thi: chỉ người mang nhãn candidate,
                                          -- không bao gồm sessions.owner_id (dùng Xem thử thay thế)
  session_id → sessions, user_id → users, added_by → users, added_at,
  extra_minutes int DEFAULT 0,            -- cộng giờ riêng cho từng người
  PK (session_id, user_id)
)
```

## 5. Lượt làm bài và Chấm (module `attempt`, `grading`)

```sql
attempts (
  id, session_id → sessions, user_id → users, attempt_no int,
  seed bigint, layout jsonb,              -- thứ tự câu và phương án đã cố định
  started_at, deadline, submitted_at,
  active_auth_session_id → auth_sessions, -- thiết bị đang làm bài; đổi máy cần Người ra đề Cho phép
  submit_reason enum('candidate','timeout','examiner','disqualified','account_locked'),
  status enum('in_progress','submitted','graded'),
  auto_score numeric, manual_score numeric,
  raw_score numeric, max_score numeric,   -- Điểm thô; Điểm quy đổi = round(raw/max*10, 2)
  UNIQUE (session_id, user_id, attempt_no)
)
-- Mỗi người chỉ có 1 Lượt làm bài đang mở trong một Phiên thi:
UNIQUE (session_id, user_id) WHERE status = 'in_progress'

responses (                               -- Câu trả lời
  attempt_id → attempts, item_id → exam_items,
  value jsonb, client_seq int, saved_at,
  flagged bool DEFAULT false,             -- đánh dấu xem lại
  auto_score numeric NULL,
  manual_score numeric NULL, graded_by → users, graded_at, feedback text,
  PK (attempt_id, item_id)
)

attempt_events (                          -- sự kiện bất thường: rời tab, mất kết nối...
  id bigserial, attempt_id, type text, data jsonb, at
)

violations (                              -- Vi phạm
  id, attempt_id → attempts, session_id → sessions, user_id → users,
  action enum('warning','disqualify'), reason text NOT NULL,
  penalty_type enum('none','percent','void') DEFAULT 'none',
  penalty_percent numeric(5,2) NULL,
  recorded_by → users, recorded_at, penalty_decided_at
)

appeals (                                 -- Phúc khảo: mỗi đối tượng 1 lần, trong 72 giờ sau Công bố
  id, attempt_id,
  target enum('response','penalty'),
  item_id NULL,                           -- khi target = 'response'
  violation_id NULL,                      -- khi target = 'penalty'
  reason text NOT NULL, created_at,
  status enum('open','resolved'),
  previous_value jsonb, new_value jsonb, resolver_id → users, response text, resolved_at,
  UNIQUE (attempt_id, item_id), UNIQUE (violation_id)
)

-- Kết quả của một Người dự thi trong Phiên thi:
--   base  = max(raw_score) hoặc raw_score của lượt cuối (theo sessions.attempt_scoring)
--   void  = có violation nào với penalty_type = 'void'      → Kết quả = 0, ghi "Hủy"
--   final = base × (1 − min(100, Σ penalty_percent) / 100)
--   Điểm quy đổi = round(final / max_score × 10, 2)

notifications (                           -- thông báo trong ứng dụng; module `notifications`
  id, user_id → users, type text, data jsonb, created_at, read_at
)  -- INDEX (user_id, created_at DESC)

key_corrections (                         -- Đính chính đáp án → chấm lại câu đó cho mọi Lượt làm bài
  id, exam_item_id → exam_items, old_key jsonb, new_key jsonb,
  reason text, corrected_by → users, corrected_at,
  affected_attempts int                   -- số Lượt làm bài đã được chấm lại
)
```
