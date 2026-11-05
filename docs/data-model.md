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
- **Xóa người dùng là Người ra đề:** bắt buộc chọn người nhận cho mọi Chủ đề, Bộ đề và Phiên thi chưa Chốt của người đó. Còn Chủ đề hoặc Bộ đề (kể cả Bộ đề rỗng) mà không nêu người nhận thì `409 HAS_CONTENT` (kèm `topics` và số `exams`); nêu người nhận thì Chuyển giao toàn bộ (mọi Bộ đề đổi chủ, kể cả đã Phát hành) rồi Xóa trong một giao dịch (nhật ký `topic.transfer` rồi `user.remove`; thông báo `topics.transferred` có `topics` và `exams`). Chuyển giao chọn Chủ đề thì chỉ Bộ đề nháp có câu của Chủ đề đó đi theo, các câu còn của người cho bị gỡ khỏi Bộ đề. `identity` làm việc này qua cổng `OWNED_CONTENT` (`src/common/owned-content.ts`); `OwnedContentWiringModule` ghép phần của `question-bank` và `exam`, `identity` không đọc bảng của chúng.
- **Tên đăng nhập mặc định:** `lower(code)`, nếu không có mã thì dùng email. Mật khẩu tạm hết hạn sau 7 ngày nếu chưa dùng.
- **Người ra đề cấp lại mật khẩu tạm:** chỉ cho người có tên trong Danh sách dự thi của một Phiên thi chưa Chốt của mình, có ghi `audit_logs`.
- **Tài khoản Quản trị viên** (`is_admin = true`) không có dòng nào trong `user_role_tags`. Chỉ định thêm Quản trị viên nghĩa là tạo một tài khoản Quản trị viên mới; không gắn `is_admin` cho tài khoản đang mang Nhãn vai trò.
- **Dữ liệu cá nhân** (Nghị định 13/2023): `date_of_birth` và `gender` không bắt buộc, chỉ Quản trị viên xem được. `login_events` được xóa sau 12 tháng bằng job của worker. `audit_logs` và Kết quả giữ lâu dài.
- **Khóa đăng nhập khi đang làm bài:** tự động Nộp bài (`submit_reason = 'account_locked'`) và báo cho Người ra đề.

## 2. Ngân hàng câu hỏi (module `question-bank`)

**Chữ Việt luôn ở dạng NFC (dựng sẵn).** Nội dung Câu hỏi (lời dẫn, Phương án, Mệnh đề, hướng dẫn chấm, công thức, mô tả ảnh) được `richTextSchema` đưa về NFC ngay khi nhận, và mọi ô của file Excel/CSV nhập vào được đưa về NFC ở `common/spreadsheet.ts`. Nhờ vậy chữ gõ hay dán ở dạng dấu rời (NFD) vẫn lưu, đếm ký tự (giới hạn `STEM_MAX_CHARS`, `ITEM_MAX_CHARS`) và hiển thị giống hệt dạng dựng sẵn; bản chụp trong `exam_items.snapshot` được sao từ nội dung đã chuẩn hóa nên Bộ đề, Phiên thi và Lượt làm bài đọc cùng một chuỗi. Chưa áp dụng cho: tên Chủ đề, nhãn, tiêu đề và các chữ ngắn ngoài nội dung có định dạng; câu trả lời tự luận của Người dự thi (việc đếm `maxLength` vẫn theo ký tự thô).

```sql
topics (                                  -- Chủ đề: danh sách phẳng của một Người ra đề
  id, owner_id → users NOT NULL, name, description, archived_at, created_at, updated_at,
  name_key text                           -- tên bỏ dấu, chữ thường, gộp khoảng trắng (normalizeForSearch)
)
-- UNIQUE (owner_id, name_key) WHERE archived_at IS NULL: tên không trùng trong các Chủ đề chưa lưu trữ của cùng chủ

questions (
  id, topic_id → topics, owner_id → users,   -- owner_id lặp lại để kiểm tra quyền nhanh
  type enum('single_choice','multiple_choice','true_false_cluster','essay'),
  stem jsonb,                              -- rich text (TipTap JSON)
  payload jsonb,                           -- phần riêng theo type, kiểm tra bằng Zod
  default_points numeric(6,2),
  tags text[], version int, archived_at, created_at, updated_at,
  search_text text                         -- văn bản thuần của Phần dẫn, Phương án, Mệnh đề, đã bỏ dấu và chữ thường
)
-- Tìm kiếm: chuẩn hóa chuỗi tìm bằng cùng hàm rồi LIKE trên search_text (thoát %, _). Khác Người dùng (unaccent lúc truy vấn):
-- cách này xử lý được cả "đ" và không cần gọi hàm trên từng dòng. `version` tăng mỗi lần sửa nội dung hoặc đổi Chủ đề.

illustrations (                           -- Hình minh họa (Q139, Q140)
  id, owner_id → users, sha256 text (hex, 64 ký tự), status enum('processing','ready','failed'), failure_reason text,
  width, height,                          -- của biến thể lớn nhất
  variants int[],                         -- các cạnh dài đã tạo, ví dụ {480,960,1600}; file WebP tại illustrations/<id>/<cạnh>.webp
  bytes int,                              -- dung lượng đang chiếm, tính vào hạn mức: cỡ file tải lên khi `processing`, tổng các biến thể khi `ready`, 0 khi `failed`
  created_at, UNIQUE (owner_id, sha256)
)
question_illustrations (question_id → questions ON DELETE CASCADE, illustration_id → illustrations, PK (question_id, illustration_id))
-- Cập nhật mỗi lần tạo hoặc sửa Câu hỏi từ các node `image`; không có bản gốc, `alt` nằm trong node (Q137).

question_import_batches (                 -- Lô nhập Câu hỏi từ Excel (Q123, Q146); sống 30 ngày
  id, owner_id → users, topic_id → topics ON DELETE CASCADE,   -- Chủ đề đích; xóa Chủ đề thì lô đi theo
  original_filename text,                 -- chỉ để hiển thị
  upload_key text NULL,                   -- file chờ đọc trong MediaStore; xóa ngay sau khi đọc xong
  status enum('parsing','parse_failed','ready','committing','committed'),
  parse_error text NULL,                  -- mã lỗi cả file khi status = parse_failed; lỗi gắn với một sheet ghi `mã:tên sheet` (vd `missing_columns:Chọn một`)
  row_count int NULL, created_count int NULL,
  created_at, commit_requested_at NULL,   -- lúc bấm xác nhận; `committing` quá 15 phút thì job dọn đưa về `ready`
  committed_at NULL, expires_at           -- = created_at + 30 ngày
)
question_import_items (
  id, batch_id → question_import_batches ON DELETE CASCADE,
  type question_type,                     -- Loại câu hỏi do sheet của file quyết định (Q156); có cả ở dòng lỗi
  row_number int,                         -- số dòng thật trong sheet của Loại đó
  payload jsonb NULL,                     -- Câu hỏi đã đổi từ dòng Excel (chưa có topicId); NULL khi dòng lỗi
  search_text text NULL,                  -- cùng cách chuẩn hóa với questions.search_text, để so nghi trùng
  error_code text NULL,
  duplicate_of_question_id uuid NULL,     -- nghi trùng: Câu hỏi đã có trong Chủ đề đích (không có FK: câu có thể bị xóa sau)
  duplicate_of_row int NULL,              -- nghi trùng: dòng đầu tiên cùng nội dung trong file
  duplicate_of_type question_type NULL,   -- sheet của dòng trùng đó (số dòng chỉ duy nhất trong một sheet)
  selected bool,                          -- mặc định: dòng hợp lệ true; nghi trùng và lỗi false
  outcome enum('pending','created','skipped'),
  UNIQUE (batch_id, type, row_number)
)
-- Trạng thái của dòng suy ra từ cột, không lưu: có error_code là lỗi; có một trong hai cột duplicate_* là nghi trùng; còn lại hợp lệ.
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
  id, owner_id → users, title, instructions jsonb,        -- instructions: nội dung có định dạng, không ảnh (Q165)
  status enum('draft','published','archived'),
  version int DEFAULT 1,                                   -- khóa lạc quan của lần lưu cả tài liệu (Q163)
  published_at, archived_at
)

exam_sections (                           -- Phần; Bộ đề không chia phần có 1 Phần mặc định (title NULL)
  id, exam_id → exams ON DELETE CASCADE, title NULL, instructions jsonb, sort int
  -- Xáo trộn là thiết lập của Phiên thi (Q161), không có cờ ở Phần
)

exam_items (
  id, exam_id → exams ON DELETE CASCADE, section_id → exam_sections ON DELETE CASCADE,
  question_id → questions ON DELETE RESTRICT,  -- một Câu hỏi dùng lại được ở nhiều Bộ đề
  points numeric(6,2), sort int,
  snapshot jsonb NULL,                    -- điền khi Phát hành (ADR-0005)
  UNIQUE (exam_id, question_id)           -- một Câu hỏi không xuất hiện 2 lần trong cùng Bộ đề
)
-- Ràng buộc sở hữu (kiểm tra ở service + trigger): questions.owner_id = exams.owner_id

exam_item_illustrations (                 -- ảnh nằm trong bản chụp của Bộ đề đã Phát hành (Q176)
  exam_item_id → exam_items ON DELETE CASCADE,
  illustration_id → illustrations ON DELETE RESTRICT,  -- ảnh có dòng ở đây không xóa được
  PRIMARY KEY (exam_item_id, illustration_id)
)

-- Trigger (migration 0011, Q172): exams.status khác 'draft' thì
--   exam_items, exam_sections: chặn INSERT/UPDATE/DELETE;
--   exams: chỉ cho đổi status published <-> archived, archived_at, owner_id, updated_at; chặn DELETE và quay về 'draft'.
-- Bộ đề nháp xóa theo cascade vẫn qua được. Chấm điểm chỉ tin exam_items.snapshot nên đây là lớp bảo vệ thứ hai sau service.
```

## 4. Phiên thi (module `session`)

Thực hiện ở migration 0012 (PR 4a); thiết kế và lý do ở [plan/slice-4.md](plan/slice-4.md). Cột `released_at`, `finalized_at`, `appeal_period_hours` thêm ở lát cắt 5.

```sql
sessions (
  id, exam_id → exams ON DELETE RESTRICT (trigger: không nháp, không Lưu trữ khi tạo), owner_id → users, title,
  opens_at, closes_at CHECK (closes_at > opens_at),     -- Khung giờ chỉ giới hạn việc bắt đầu (Q208)
  duration_minutes CHECK (1..600),
  hard_close bool DEFAULT false,                        -- Cắt cứng khi đóng Khung giờ
  max_attempts int DEFAULT 1 CHECK (1..5),
  attempt_scoring enum('highest','latest') DEFAULT 'highest',
  shuffle_items bool, shuffle_options bool, show_scoring_rules bool,
  access_code text NOT NULL CHECK (access_code ~ '^[A-Z0-9]{4,12}$'),   -- Mã vào thi do Người ra đề đặt trước
  entry_closed_at,                                      -- Đóng cửa vào thi
  cancelled_at, cancelled_by → users, cancel_reason,    -- Hủy Phiên thi; trigger: không hoàn tác, sau hủy chỉ đổi chủ
  version int DEFAULT 1                                 -- khóa lạc quan khi sửa
)

-- Q222: Mã vào thi không trùng giữa hai Phiên thi chưa hủy có Khung giờ chồng nhau (đóng cả hai đầu).
EXCLUDE USING gist (access_code WITH =, tstzrange(opens_at, closes_at, '[]') WITH &&) WHERE (cancelled_at IS NULL)

session_roster (                          -- Danh sách dự thi: người mang Nhãn candidate, tối đa 500 (kiểm ở service)
  session_id → sessions ON DELETE CASCADE, user_id → users, added_by → users, added_at,
  class_label text,                       -- Lớp chụp tại lúc thêm, không đổi theo hồ sơ sau đó
  extra_minutes int DEFAULT 0 CHECK (0..600),   -- phút cộng sẵn cho riêng từng người
  PK (session_id, user_id)
)
-- Trigger: INSERT thì user_id <> sessions.owner_id (Q144, owner_cannot_sit). Cấm bớt người đã có Lượt: thêm ở migration 0013.
```

Trạng thái hiện cho Người ra đề (Sắp mở, Đang mở, Đóng cửa vào thi, Đã đóng, Đã hủy) **không lưu**: suy ra từ giờ và hai cột `entry_closed_at`, `cancelled_at` bằng hàm `phaseOf` ở `@exam/shared`.

## 5. Lượt làm bài và Chấm (module `attempt`, `grading`)

Phần Thiết bị dự thi, Lượt làm bài và Câu trả lời thực hiện ở migration 0013 (PR 4b-2); thiết kế và lý do ở [plan/slice-4.md](plan/slice-4.md) (Q192–Q236, ADR-0007). Cột điểm và chấm thêm ở lát cắt 5, bảng sự kiện và Vi phạm thêm ở PR 4d.

```sql
session_devices (                         -- Thiết bị dự thi (ADR-0007, Q234)
  id, session_id, user_id, device_hash text NOT NULL,   -- SHA-256 của cookie exam_did, không giữ giá trị gốc
  ip inet, user_agent text,                              -- để Người ra đề nhận ra thiết bị lạ
  status enum('active','revoked') DEFAULT 'active',
  bound_at, revoked_at, revoked_by → users, revoke_reason text, pardoned_at,
  FOREIGN KEY (session_id, user_id) → session_roster ON DELETE CASCADE,  -- bớt người (chưa có Lượt) thì thiết bị đi theo
  UNIQUE (session_id, user_id, device_hash)
)
UNIQUE (session_id, user_id)     WHERE status = 'active'    -- tối đa một thiết bị đang gắn mỗi người
UNIQUE (session_id, device_hash) WHERE status = 'active'    -- một thiết bị chỉ phục vụ một người (Q209)

attempts (
  id, session_id → sessions ON DELETE RESTRICT, user_id → users, attempt_no int CHECK (>= 1),
  seed bigint, layout jsonb,              -- thứ tự câu và phương án cố định (layoutOf ở @exam/shared)
  started_at, deadline CHECK (> started_at),  -- deadline: nguồn sự thật của hạn nộp, server quyết định
  submitted_at, submit_reason enum('candidate','timeout','examiner','disqualified','account_locked','session_cancelled'),
  status enum('in_progress','submitted'),                -- lát cắt 5 thêm 'graded'
  CHECK ((status = 'submitted') = (submitted_at IS NOT NULL AND submit_reason IS NOT NULL)),
  FOREIGN KEY (session_id, user_id) → session_roster ON DELETE RESTRICT,  -- người đã có Lượt không bị bớt khỏi Danh sách (Q217)
  UNIQUE (session_id, user_id, attempt_no)
  -- Cột điểm (auto_score, manual_score, raw_score, max_score) thêm ở lát cắt 5.
)
-- Mỗi người chỉ có 1 Lượt làm bài đang mở trong một Phiên thi:
UNIQUE (session_id, user_id) WHERE status = 'in_progress'
INDEX (status, deadline) WHERE status = 'in_progress'       -- job quét tự nộp (attempt.sweep, mỗi 10 giây)
-- Trigger attempts_guard (Q217): nội dung cố định sau khi tạo (session, người, số thứ tự, seed, layout, giờ bắt đầu);
--   chỉ in_progress → submitted; đã nộp thì không sửa gì; hạn chỉ được kéo dài (Cộng giờ); không xóa.

responses (                               -- Câu trả lời
  attempt_id → attempts ON DELETE RESTRICT, item_id → exam_items ON DELETE RESTRICT,
  value jsonb, client_seq int CHECK (>= 0), saved_at,   -- client_seq: lưu idempotent (Q216)
  flagged bool DEFAULT false,             -- đánh dấu xem lại
  PK (attempt_id, item_id)
  -- Cột điểm và chấm thủ công (auto_score, manual_score, graded_by, graded_at, feedback) thêm ở lát cắt 5.
)
-- Trigger responses_guard (Q217): chỉ INSERT/UPDATE khi Lượt đang làm (khóa dòng Lượt FOR SHARE nên Nộp bài xen vào thì
--   chờ rồi thấy đã nộp); câu phải thuộc Bộ đề của Phiên thi; không chuyển sang Lượt hay câu khác.
-- Trigger sessions_guard (thay hàm của 0012): Phiên thi đã có Lượt thì không đổi exam_id, shuffle_items, shuffle_options.

session_events (                          -- sự kiện bất thường (Q198, migration 0014): chỉ ghi nhận, chỉ ghi thêm
  id bigserial, session_id → sessions, user_id → users, attempt_id → attempts NULL,
  type enum('tab_hidden','tab_visible','went_offline','back_online','device_rejected'),
  data jsonb, client_event_id uuid NULL,  -- mã do trình duyệt sinh: gửi lại heartbeat không ghi trùng
  at timestamptz DEFAULT now()            -- giờ server nhận
  -- UNIQUE (attempt_id, client_event_id) WHERE client_event_id IS NOT NULL
  -- Trigger session_events_guard: không sửa, không xóa. (`device_rejected` chưa có nơi ghi.)
)

attempt_reopenings (                      -- nhật ký Hoàn tác Buộc nộp (Q273–Q280, migration 0016), chỉ ghi thêm
  id, attempt_id → attempts, reopened_by → users, reopened_at,
  previous_submitted_at,                  -- lúc Lượt bị Buộc nộp; UNIQUE(attempt_id, previous_submitted_at): mỗi lần nộp hoàn tác một lần
  new_deadline                            -- hạn mới của Lượt (undoDeadlineOf)
  -- Trigger attempts_guard: Lượt đã nộp chỉ mở lại khi lý do cũ là 'examiner', trạng thái về in_progress với
  --   submitted_at và submit_reason trống, hạn không rút ngắn, mọi cột khác giữ nguyên, và có dòng khớp lần nộp và hạn mới.
)

attempt_time_extensions (                 -- nhật ký Cộng giờ (Q254, Q256, Q262): một dòng mỗi Lượt được cộng
  id, attempt_id → attempts, minutes int CHECK (1..180), scope enum('one','group','all'),
  reason text CHECK (1..200 ký tự), batch_id uuid, extended_by → users, at,
  UNIQUE (attempt_id, batch_id)           -- gửi lại cùng yêu cầu không cộng hai lần
  -- Trigger: chỉ ghi thêm; chỉ cho Lượt đang làm (khóa dòng Lượt FOR UPDATE); tổng phút của một Lượt ≤ 600.
)

violations (                              -- Vi phạm (Q259, migration 0014)
  id, attempt_id → attempts, session_id → sessions, user_id → users,
  action enum('warning','disqualify'), reason text CHECK (1..500 ký tự),
  penalty_type enum('none','percent','void') DEFAULT 'none',
  penalty_percent numeric(5,2) NULL,      -- CHECK: có số phần trăm (0..100) khi và chỉ khi penalty_type = 'percent'
  recorded_by → users, recorded_at, penalty_decided_at
  -- Chỉ mục (session_id, user_id): kiểm Đình chỉ khi bắt đầu Lượt (Q272, migration 0015).
  -- Trigger violations_guard: session_id và user_id phải khớp Lượt; sau khi ghi chỉ ba cột hình phạt được quyết
  --   (lát cắt 5); không xóa.
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
