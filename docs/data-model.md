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

-- Lát cắt 6 (PR 6d, module `backup`, migration 0022, plan/slice-6.md Q362–Q366): kết quả các lần sao lưu quan trọng, để
-- Quản trị viên xem chỉ đọc và để job `backup.check` báo chuông. KHÔNG phải ứng dụng ghi: script infra/scripts/exam-backup.sh
-- chèn bằng psql (sổ gốc là file backup-runs.jsonl ở máy; bảng này chỉ là bản sao để hiển thị). Giữ 12 tháng.
backup_runs (
  id uuid PK, run_key text UNIQUE,                  -- giờ ghi sổ + loại việc: chèn bù không trùng
  kind text,                                        -- dump-nightly, dump-publish, basebackup, restore-test, nightly, secrets, catchup, push
  status enum('ok','failed'), finished_at timestamptz, seconds int NULL, bytes bigint NULL,
  detail text NULL CHECK (char_length <= 200),      -- ngắn, KHÔNG chứa bí mật
  created_at
)  -- INDEX (finished_at), (kind, finished_at). Chỉ ghi: việc quan trọng thành công, mọi lỗi (mỗi đợt lỗi một dòng), dòng "đã phục hồi" của
   -- việc đẩy; đẩy thành công mỗi phút KHÔNG ghi.

-- Lát cắt 7 (PR 7b, module `mail`, migration 0023, plan/slice-7b-thiet-ke-kiem-thu.md, ADR-0009): hàng đợi thư bền. Worker lấy
-- từng thư ra gửi theo hạn mức (400 thư/24 giờ trượt, thư hàng loạt tối đa 300, thư khẩn dự trữ 100, cách nhau 6 giây).
-- KHÔNG BAO GIỜ lưu mã hay nội dung có mã (Q381): worker dựng thư và sinh mã lúc gửi.
email_outbox (
  id uuid PK,
  kind enum('activation','invitation','password_reset','password_changed','email_change','email_changed_notice'),
  lane enum('urgent','bulk'),                       -- urgent dùng phần dự trữ; bulk tối đa 300 (và theo lịch warm-up)
  to_email text,
  status enum('pending','sending','sent','failed','rejected','skipped') DEFAULT 'pending',
      -- pending: chờ gửi hoặc chờ thử lại; sending: worker đang gửi (kẹt quá 10 phút thì được nhận lại);
      -- sent: máy chủ thư đã nhận; failed: hết 5 lần thử; rejected: máy chủ thư từ chối cứng địa chỉ;
      -- skipped: chưa cấu hình SMTP (chế độ không gửi), không tính hạn mức
  attempt_count int DEFAULT 0, next_attempt_at timestamptz,   -- chờ thử lại: 60, 120, 240, 480 giây (tối đa 1 giờ)
  locked_at timestamptz NULL,                       -- giờ nhận việc, khi status = 'sending'
  sent_at timestamptz NULL,                         -- giờ NHẬN VIỆC của lần gửi thành công (căn cứ hạn mức và khoảng cách)
  last_error text NULL,                             -- đã che mật khẩu SMTP; có thể chứa địa chỉ người nhận (đã có ở to_email)
  user_id uuid NULL → users, requested_by uuid NULL → users,   -- requested_by: xoay vòng giữa các Người ra đề
  context jsonb NULL,                               -- migration 0025: dữ liệu KHÔNG bí mật cho mẫu thư (giờ, trình duyệt, hệ điều hành); không bao giờ chứa mã
  created_at timestamptz
)  -- INDEX (status, next_attempt_at), (sent_at). Hạn mức đếm từ bảng này (sent trong 24 giờ trượt + sending), không từ Redis
   -- hay bộ nhớ, nên khởi động lại không đếm lại từ 0.

-- Lát cắt 7 (PR 7c-1, module `identity`, migration 0024, plan/slice-7c-thiet-ke-kiem-thu.md, ADR-0009): Liên kết một lần.
-- `users` thêm: activated_at timestamptz NULL (lúc đặt mật khẩu lần đầu), email_verified_at timestamptz NULL (lúc chính chủ hộp thư
-- bấm liên kết). Chờ kích hoạt = `password_hash` NULL và `activated_at` NULL (quy tắc dựa vào `password_hash`, không dựa vào
-- `activated_at`, vì dữ liệu cũ có thể rỗng). Migration chuyển tài khoản đang có mật khẩu thành đã kích hoạt (`activated_at = created_at`),
-- email vẫn chưa xác thực.
auth_tokens (
  id uuid PK, user_id uuid → users,
  purpose enum('activation','password_reset','email_change','support_link'),
  token_hash text UNIQUE,                           -- CHỈ SHA-256 của mã; không bao giờ lưu mã đọc được
  new_email citext NULL,                            -- chỉ email_change (7c-2)
  expires_at timestamptz,                           -- kích hoạt 7 ngày, đặt lại 60 phút, đổi email 24 giờ, hỗ trợ 60 phút
  used_at timestamptz NULL, replaced_at timestamptz NULL,   -- một người chỉ có MỘT mã còn hiệu lực mỗi loại: mã mới đặt replaced_at cho mã cũ
  created_by uuid NULL → users, reason text NULL,   -- cho liên kết hỗ trợ (7d)
  created_at timestamptz
)  -- INDEX (user_id, purpose). Còn hạn tới TRƯỚC expires_at, hết hạn từ đúng lúc đó.
```

Quy tắc ràng buộc ở tầng service:
- **Hàng đợi thư (`email_outbox`):** chọn thư kế tiếp và đánh dấu `sending` trong **một giao dịch có khóa tư vấn** (`pg_advisory_xact_lock`), nên nhiều tiến trình không chọn trùng thư và không vượt khoảng cách hay hạn mức. Thư `sending` cũng tính vào hạn mức. Địa chỉ đã có thư `rejected` thì thư sau tới địa chỉ đó bị đánh dấu `rejected` luôn, không gửi và không đốt hạn mức. Hàm chọn thư là hàm thuần `planBatch` (`modules/mail/plan-batch.ts`), kiểm thử bằng bảng kịch bản.
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
- **Đang đề xuất (chưa áp dụng, [ADR-0009](adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md)):** thêm `users.email_verified_at`, `users.activated_at`, cho phép `password_hash` NULL khi *Chờ kích hoạt*, bảng `auth_tokens` (mã băm, một lần) và `email_outbox` (hàng đợi thư); email trong Yêu cầu cấp tài khoản thành bắt buộc; bỏ Phiếu tài khoản (`credential_slips`), mật khẩu tạm và "Người ra đề cấp lại mật khẩu tạm"; Lời mời được hệ thống tự gửi thư. Các mục Lời mời, Yêu cầu cấp tài khoản, Phiếu tài khoản, Người ra đề cấp lại mật khẩu tạm ở trên mô tả hiện trạng cho tới khi PR 7b đến 7d xong. Phác thảo: [plan/slice-7-phuong-an-b-email.md](plan/slice-7-phuong-an-b-email.md) mục 6.
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

Thực hiện ở migration 0012 (PR 4a); thiết kế và lý do ở [plan/slice-4.md](plan/slice-4.md). Công bố và Chốt nằm ở bảng `session_gradings` của module `grading` (xem mục 5 và [ADR-0008](adr/0008-diem-nam-o-bang-rieng-cua-grading.md)); `sessions` chỉ thêm cột `review_after_release` (Q297).

```sql
sessions (
  id, exam_id → exams ON DELETE RESTRICT (trigger: không nháp, không Lưu trữ khi tạo), owner_id → users, title,
  opens_at, closes_at CHECK (closes_at > opens_at),     -- Khung giờ chỉ giới hạn việc bắt đầu (Q208)
  duration_minutes CHECK (1..600),
  hard_close bool DEFAULT false,                        -- Cắt cứng khi đóng Khung giờ
  max_attempts int DEFAULT 1 CHECK (1..5),
  attempt_scoring enum('highest','latest') DEFAULT 'highest',
  shuffle_items bool, shuffle_options bool, show_scoring_rules bool,
  review_after_release bool DEFAULT false,              -- Cho Người dự thi xem lại đề sau Công bố (lát cắt 5, Q297); đổi được đến lúc Công bố
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
  status enum('in_progress','submitted'),                -- không thêm 'graded': "đã chấm" suy ra từ attempt_grades (ADR-0008)
  CHECK ((status = 'submitted') = (submitted_at IS NOT NULL AND submit_reason IS NOT NULL)),
  FOREIGN KEY (session_id, user_id) → session_roster ON DELETE RESTRICT,  -- người đã có Lượt không bị bớt khỏi Danh sách (Q217)
  UNIQUE (session_id, user_id, attempt_no)
  -- Điểm không nằm ở đây mà ở response_grades, attempt_grades (lát cắt 5, ADR-0008).
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
  -- Điểm và chấm thủ công nằm ở response_grades (lát cắt 5, ADR-0008), không thêm cột vào đây.
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

appeals (                                 -- Phúc khảo (migration 0020, module `grading`, Q300, Q309–Q317)
  id, session_id → sessions, attempt_id → attempts, user_id → users,   -- session_id, user_id lặp lại từ Lượt (đếm hạn mức, liệt kê)
  target enum('response','penalty'),
  item_id → exam_items NULL,              -- khi target = 'response'
  violation_id → violations NULL,         -- khi target = 'penalty'
  reason text NOT NULL CHECK (10–1000 ký tự), created_at,
  status enum('open','resolved') DEFAULT 'open',
  previous_value jsonb, new_value jsonb,  -- {score, verdict} hoặc {type, percent}; chỉ có khi resolved
  resolver_id → users, response text (1–1000), resolved_at,
  CHECK target khớp item_id/violation_id; CHECK resolved đủ resolver_id, response, resolved_at, previous/new_value
)
-- UNIQUE từng phần (attempt_id, item_id) WHERE item_id IS NOT NULL và (violation_id) WHERE violation_id IS NOT NULL.
-- INDEX (session_id, status, created_at) cho danh sách, số chờ và kiểm "còn Phúc khảo mở"; INDEX (session_id, user_id) cho hạn mức.
-- Trigger appeals_guard: chỉ chèn khi đã Công bố và chưa Chốt, khớp Lượt/Bộ đề/Vi phạm; mỗi Phúc khảo xử lý một lần (open → resolved),
--   đã xử lý thì bất biến; không xóa. Hạn mức (10 % số câu, tối thiểu 3) và giờ hạn do service kiểm (đồng hồ ứng dụng).
-- Hạn mức Phúc khảo một Người dự thi trong một Phiên thi = max(3, ceil(10 % số câu của Bộ đề)); một Chùm tính là một câu.

-- Kết quả của một Người dự thi trong Phiên thi:
--   base  = max(raw_score) hoặc raw_score của lượt cuối (theo sessions.attempt_scoring)
--   void  = có violation nào với penalty_type = 'void'      → Kết quả = 0, ghi "Hủy"
--   final = base × (1 − min(100, Σ penalty_percent) / 100)
--   Điểm quy đổi = round(final / max_score × 10, 1)   -- làm tròn đến 0,1 (Q287)

notifications (                           -- thông báo trong ứng dụng; module `notifications`
  id, user_id → users, type text, data jsonb, created_at, read_at
)  -- INDEX (user_id, created_at DESC)

-- Lát cắt 5 (module `grading`, thiết kế ở plan/slice-5.md, ADR-0008). Điểm ở bảng riêng, bài làm gốc giữ nguyên khóa trigger.
response_grades (                          -- một dòng cho MỖI câu của Bộ đề trong mỗi Lượt đã chấm (kể cả câu bỏ trống)
  attempt_id → attempts ON DELETE RESTRICT, item_id → exam_items ON DELETE RESTRICT,
  score numeric(6,2) NULL,                 -- NULL = Câu tự luận có nội dung, chờ chấm; làm tròn 0,01 (Q287)
  verdict enum('correct','partial','wrong','blank','pending') NOT NULL,   -- 0018: tự động từ scoreResponse, chấm tay từ điểm
  source enum('auto','manual','appeal','correction'),    -- 'manual' chỉ cho câu tự luận (trigger)
  graded_by → users NULL, graded_at, feedback text NULL CHECK (char_length <= 1000),
  PRIMARY KEY (attempt_id, item_id)
)  -- Trigger: chỉ ghi khi Lượt đã nộp; score trong [0, điểm câu]; source = 'manual' phải có graded_by; Phiên thi đã Chốt thì chặn ghi.
attempt_grades (attempt_id PK → attempts ON DELETE RESTRICT, graded_at)   -- dấu "đã chấm tự động xong"; job quét tìm Lượt submitted chưa có dấu
session_gradings (
  session_id PK → sessions ON DELETE RESTRICT,
  blind bool DEFAULT true,                 -- Chấm ẩn tên (Q291); 0018 chỉ có blind, created_at, updated_at
  released_at NULL, released_by → users NULL,   -- thêm ở 5c
  appeal_period_hours int NULL CHECK (appeal_period_hours = 0 OR appeal_period_hours BETWEEN 24 AND 336),   -- 5c
  finalized_at NULL,                       -- 5c; released_at, finalized_at chỉ đặt một lần, không xóa
  appeal_reminded_at NULL                  -- 5d-1: lần gần nhất job Chốt nhắc Phúc khảo quá hạn (nhắc lúc hết hạn rồi mỗi 24 giờ)
  -- appeal_period_hours chỉ được tăng (gia hạn, Q314), chỉ khi chưa Chốt; INDEX (released_at) WHERE released_at NOT NULL AND finalized_at NULL
)
session_grading_delegates (                -- Ủy quyền chấm (Q307, migration 0018)
  id, session_id → sessions, user_id → users, granted_by → users, granted_at, revoked_at NULL
)  -- UNIQUE (session_id) WHERE revoked_at IS NULL; trigger: không xóa, thu hồi chỉ một lần
key_correction_effects (                   -- chỉ ghi thêm: điểm đổi do mỗi Đính chính đáp án (Q302)
  correction_id → key_corrections, attempt_id → attempts, old_score numeric(6,2), new_score numeric(6,2)
)

key_corrections (                         -- Đính chính đáp án → chấm lại câu đó cho mọi Lượt làm bài
  id, exam_item_id → exam_items, old_key jsonb, new_key jsonb,
  reason text, corrected_by → users, corrected_at,
  affected_attempts int                   -- số Lượt làm bài đã được chấm lại
)
```
