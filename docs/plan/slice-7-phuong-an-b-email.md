# Phương án B chi tiết: email chính chủ, kích hoạt tài khoản và quên mật khẩu qua email

**Trạng thái: BACKLOG (tạm dừng ngày 10/11/2026), chưa làm.** Đây là **bản thiết kế đề xuất của Trợ lý** để chủ dự án xem lại và duyệt **từng câu một** (Q373 trở đi) khi quay lại. Quyết định đã có: **Q372 = phương án B** ([slice-7.md](./slice-7.md)). Mọi chi tiết dưới đây **chưa được duyệt** trừ phần quyết định B. Cơ sở: rà soát `plo-tracker-bluni` (mục "Hướng mới của chủ dự án" trong slice-7.md) và đánh giá SMS ([docs/research/xac-thuc-chinh-chu-bang-sms.md](../research/xac-thuc-chinh-chu-bang-sms.md)).

## 1. Nguyên tắc và mục tiêu

1. **Email chính chủ là gốc danh tính.** Điểm tựa tin cậy là **email do nhà trường cung cấp** trong danh sách (Excel hoặc Lời mời). Ai bấm được liên kết trong hộp thư đó thì được coi là chủ tài khoản.
2. **Không ai biết mật khẩu của người khác**, kể cả Quản trị viên. Mật khẩu do chính người dùng đặt, qua liên kết một lần.
3. **Tự phục vụ khi quên mật khẩu, 24/7**, không cần nhờ ai.
4. **Có lối thoát khẩn cấp** khi email hỏng (thư vào Spam, gõ sai, Gmail chặn tạm), nhưng lối thoát cũng là **liên kết** (không phải mật khẩu) và **có nhật ký**.
5. **Không tiết lộ tài khoản có tồn tại hay không** (câu trả lời luôn giống nhau).
6. **Mã chỉ lưu dạng băm**, một lần, hết hạn ngắn.

## 2. Trạng thái tài khoản

```text
                 (nhập Excel, Lời mời, Quản trị viên tạo)
                                │
                                ▼
                       CHỜ KÍCH HOẠT ──(liên kết kích hoạt, hạn 24 giờ; người dùng đặt mật khẩu)──► HOẠT ĐỘNG
                          │   ▲                                                                     │   ▲
        (thư lỗi, hết hạn)│   │ Quản trị viên: Gửi lại thư / Sửa email / Tạo liên kết thủ công       │   │ Mở khóa
                          └───┘                                                                     ▼   │
                                                                                                  BỊ KHÓA (Khóa đăng nhập, như hiện nay)
```

- **Chờ kích hoạt:** có tài khoản nhưng **chưa có mật khẩu**, **không đăng nhập được**; hiện trong danh sách cho Người ra đề và Quản trị viên (xem mục 7).
- **Hoạt động:** đã đặt mật khẩu, email đã xác thực (`email_verified_at`).
- **Bị Khóa:** như hiện nay (Khóa đăng nhập do Quản trị viên).
- **Đã Xóa:** như hiện nay.
- Đề xuất dữ liệu: cột `email_verified_at` và `activated_at` trên `users` (trạng thái "chờ kích hoạt" suy ra từ `activated_at IS NULL`), thay vì thêm giá trị vào enum `user_status`.

## 3. Các luồng

### 3.1 Người dự thi: từ danh sách đến vào thi
1. Người ra đề tải file Excel hoặc CSV. **Cột email bắt buộc**, kiểm tra định dạng và **trùng email** (email là duy nhất giữa các tài khoản chưa Xóa, như hiện nay). Dòng thiếu email hoặc sai định dạng bị báo ngay khi đọc file (như các lỗi dòng hiện nay).
2. Quản trị viên duyệt (như hiện nay).
3. Hệ thống tạo tài khoản ở **Chờ kích hoạt** và **xếp hàng thư "Kích hoạt tài khoản"** (gửi dần, mục 5).
4. Sinh viên mở thư, bấm liên kết `.../kich-hoat?token=...` (**dùng một lần, hạn 24 giờ**), thấy màn hình đặt mật khẩu (mật khẩu mới nhập hai lần, kiểm tra theo quy tắc hiện tại: từ 10 ký tự, không phổ biến, không chứa tên đăng nhập hay mã).
5. Đặt xong: tài khoản **Hoạt động**, email **đã xác thực**, hệ thống **không tự đăng nhập** mà chuyển về trang đăng nhập (OWASP).
6. **Không còn Phiếu tài khoản** với mật khẩu tạm. Người ra đề xem **bảng theo dõi kích hoạt** (mục 7) để biết ai chưa kích hoạt **trước ngày thi**.

### 3.2 Người ra đề: Lời mời có gửi thư
Như Lời mời hiện nay (Quản trị viên tạo, liên kết một lần băm mã, hạn 7 ngày, người nhận chọn học vị, học hàm, đặt mật khẩu), **nhưng thư mời được hệ thống gửi tự động** tới email trong Lời mời (Quản trị viên khỏi phải chép liên kết gửi Zalo), và việc bấm liên kết **xác thực email**. Giữ nút "Tạo lại liên kết" và "Thu hồi".

### 3.3 Quên mật khẩu (tự phục vụ)
1. Trang đăng nhập có liên kết **"Quên mật khẩu?"** → nhập **tên đăng nhập hoặc email**.
2. Hệ thống **luôn trả cùng một câu**: "Nếu tài khoản tồn tại, chúng tôi đã gửi thư hướng dẫn." (thời gian phản hồi đều nhau).
3. Nếu tài khoản **Hoạt động** và vượt qua giới hạn tần suất: xếp hàng thư "Đặt lại mật khẩu" với liên kết **một lần, hạn 60 phút**; các liên kết đặt lại cũ chưa dùng bị vô hiệu.
4. Mở liên kết, đặt mật khẩu mới. Khi xong: **mọi phiên cũ bị thu hồi**, ghi nhật ký, **gửi thư báo "mật khẩu của bạn vừa được đổi"** (không kèm mật khẩu) để chủ tài khoản biết nếu không phải mình làm, và **không tự đăng nhập**.
5. Tài khoản **Chờ kích hoạt** bấm "Quên mật khẩu" thì nhận lại **thư kích hoạt** (không phải thư đặt lại). Tài khoản **Bị Khóa** thì **không** nhận thư (Khóa đăng nhập là quyết định của Quản trị viên).

### 3.4 Đổi email (tài khoản Hoạt động)
Người dùng vào **Tài khoản** → nhập email mới và mật khẩu hiện tại → hệ thống gửi thư xác thực tới **email mới** (liên kết một lần, hạn 24 giờ) và **thư báo tới email cũ**. Email chỉ đổi khi liên kết được bấm. Đổi email là gắn lại phương thức xác thực nên **cần mật khẩu hiện tại**.

### 3.5 Quản trị viên: lối thoát khẩn cấp, theo thứ tự nhẹ đến nặng
| Tình huống | Việc Quản trị viên làm | Ghi nhật ký |
|---|---|---|
| Thư chưa đến | **Gửi lại thư** (nút) | có |
| Email gõ sai | **Sửa email** rồi gửi lại thư | có (email cũ, email mới) |
| Thư vẫn không đến mà phải vào thi ngay | **Tạo liên kết kích hoạt hoặc đặt lại thủ công**: hệ thống hiện liên kết **một lần** (hạn ngắn, ví dụ 60 phút), Quản trị viên gửi qua Zalo hoặc đưa trực tiếp; người dùng **tự đặt mật khẩu**; ghi nhận "email xác nhận thủ công bởi Quản trị viên" | có, kèm **lý do bắt buộc** |
| Không còn Quản trị viên nào đăng nhập được | lệnh `prod-recover-admin` (như hiện nay) | có |

Quản trị viên **không bao giờ nhìn thấy mật khẩu**. Nút "Cấp lại mật khẩu tạm" hiện nay **bị bỏ**.

### 3.6 Quản trị viên và tài khoản đặc biệt
- Quản trị viên đầu tiên vẫn tạo bằng `prod-bootstrap` (lúc đó chưa có email). Sau khi cấu hình email, **thêm và xác thực email** cho tài khoản đó.
- Quản trị viên khác do Quản trị viên tạo (có email bắt buộc, kích hoạt qua thư như mọi người).
- Quản trị viên quên mật khẩu: quên mật khẩu qua email như mọi người; nếu email hỏng thì Quản trị viên **khác** tạo liên kết thủ công; không còn ai thì `prod-recover-admin`.

### 3.7 Chuyển các tài khoản đang có (chưa có email hoặc chưa xác thực)
Đề xuất: **không khóa ngay**. Người dùng hiện có đăng nhập bình thường; **lần đăng nhập kế tiếp** được yêu cầu **thêm và xác thực email** (nhập email, nhận thư, bấm liên kết) trước khi tiếp tục dùng; Quản trị viên có bảng "chưa xác thực email" để nhắc, và hạn chót (ví dụ trước ngày thi). **Câu hỏi mở** (mục 11).

## 4. Thiết kế mã (token) và bảo mật

| Hạng mục | Đề xuất |
|---|---|
| Sinh mã | 32 byte ngẫu nhiên an toàn mật mã, mã hóa base64url (không đoán được) |
| Lưu | **chỉ lưu SHA-256 của mã** (như `invitations.tokenHash`), không lưu mã đọc được; so sánh thời gian hằng định |
| Loại và hạn | `activation` 24 giờ; `password_reset` 60 phút; `email_change` 24 giờ; `manual_link` (Quản trị viên tạo) 60 phút |
| Dùng một lần | đánh dấu đã dùng ngay trong giao dịch đặt mật khẩu; một người dùng chỉ có **một mã còn hiệu lực mỗi loại** (tạo mã mới vô hiệu mã cũ) |
| Liên kết | dựng từ **địa chỉ cấu hình cố định** (`APP_ORIGINS`/URL công khai), **không** lấy từ tiêu đề `Host`; luôn HTTPS; trang nhận mã gửi `Referrer-Policy: no-referrer`; mã trong đường dẫn (query) và bị **xóa khỏi thanh địa chỉ** sau khi đọc |
| Chống dò tài khoản | cùng câu trả lời, cùng thời gian phản hồi (luôn làm cùng số bước, gửi thư không chặn phản hồi) |
| Giới hạn tần suất (Redis) | đề xuất: mỗi tên đăng nhập hoặc email tối đa 3 lần mỗi giờ; mỗi IP tối đa 20 lần mỗi giờ; cách nhau tối thiểu 60 giây; **vượt giới hạn vẫn trả cùng câu** (không lộ) |
| Sau khi đặt mật khẩu | thu hồi mọi phiên; ghi nhật ký; thư báo đã đổi; **không tự đăng nhập** |
| Thử mã sai | mã dài 32 byte nên không đoán được; vẫn giới hạn số lần thử sai theo IP để chống dò |
| Nhật ký (`audit_logs`) | `account.activation-requested`, `account.activated`, `account.password-reset-requested`, `account.password-reset`, `account.email-change-requested`, `account.email-changed`, `admin.activation-resend`, `admin.activation-link`, `admin.email-change`; kèm IP, trình duyệt; **không bao giờ ghi mã hay mật khẩu** |
| Quy tắc mật khẩu | giữ nguyên quy tắc hiện nay (từ 10 đến 128 ký tự, không phổ biến, không chứa định danh) |

## 5. Hạ tầng gửi email

| Hạng mục | Đề xuất (theo `plo-tracker-bluni`, có cải tiến) |
|---|---|
| Nhà cung cấp ban đầu | **Gmail SMTP** (`smtp.gmail.com:587`, STARTTLS) bằng **App Password** (bật xác minh hai bước); địa chỉ gửi **trùng** tài khoản SMTP; khuyến nghị **tài khoản gửi riêng** cho `exam-system` (không dùng chung `tvvresearch@gmail.com` với `plo-tracker-bluni` để không chung hạn mức) |
| Cấu hình | các biến trong `api.env` (quyền 600): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`; không có SMTP thì hệ thống ở chế độ "không gửi" (dev và test dùng bộ gửi giả, **production không bao giờ in mã ra log**) |
| Hàng đợi bền | bảng `email_outbox` (trạng thái: chờ, đang gửi, đã gửi, thử lại, lỗi; số lần thử, lần thử kế, lỗi cuối) xử lý bởi **worker BullMQ hiện có**; không mất khi khởi động lại; việc kẹt ở "đang gửi" quá lâu được khôi phục |
| Bảo vệ mã trong hàng đợi | **cải tiến so với `plo-tracker-bluni`** (nơi mã nằm nguyên dạng trong bảng): mã trong nội dung chờ gửi được **mã hóa AES-256-GCM** (khóa riêng trong `api.env`) và **xóa ngay sau khi gửi xong** hoặc khi hết hạn |
| Giới hạn an toàn | tối đa **400 thư trong 24 giờ** (Google cho khoảng 500), cách nhau tối thiểu 6 giây, tối đa 100 người nhận mỗi thao tác hàng loạt; chạm trần thì **hoãn sang cửa sổ sau, không tính là lỗi** |
| Thử lại | tối đa 5 lần, chờ tăng dần (60 giây đến 1 giờ); phân biệt **lỗi tạm thời** (thử lại) và **lỗi vĩnh viễn** (hộp thư không tồn tại, sai xác thực: đánh dấu email "không gửi được" để Quản trị viên và Người ra đề thấy) |
| Mẫu thư | tiếng Việt, bản văn bản và HTML; đầu mục `Auto-Submitted`; tiêu đề rõ ("Kích hoạt tài khoản thi trực tuyến", "Đặt lại mật khẩu"); nêu ai gửi, hạn dùng, **dặn không chia sẻ liên kết**, và cách liên hệ nếu không phải mình yêu cầu |
| Giảm vào Spam | gửi cho người thực sự có tài khoản, tên và địa chỉ gửi ổn định, không rút gọn URL, kiểm SPF, DKIM, DMARC khi xem thư gốc; nhờ vài người đầu "Không phải spam" |
| Khi nào rời Gmail | thường vượt 200 đến 300 thư mỗi ngày, cần biết thư bị trả lại, hoặc Gmail bị khóa: chuyển Amazon SES, Postmark, Resend, Mailgun hoặc Google Workspace của trường. Kênh gửi là một bộ chuyển đổi nên đổi nhà cung cấp không viết lại phần còn lại |

**Ví dụ hạn mức:** lớp 500 sinh viên cần **500 thư kích hoạt**. Với trần 400 mỗi 24 giờ: ngày 1 gửi 400, ngày 2 gửi 100; nên **nhập danh sách sớm ít nhất vài ngày** trước ngày thi. Mỗi lần có người quên mật khẩu thêm 1 thư; ngày thi với 500 người có thể phát sinh vài chục thư đặt lại, vẫn trong trần nếu danh sách đã kích hoạt từ trước.

## 6. Mô hình dữ liệu (phác thảo)

```text
users (thêm)       email_verified_at timestamptz NULL, activated_at timestamptz NULL
                   -- password_hash cho phép NULL khi còn "Chờ kích hoạt"
auth_tokens (mới)  id, user_id → users, purpose enum('activation','password_reset','email_change','manual_link'),
                   token_hash UNIQUE, new_email NULL (cho email_change), expires_at, used_at NULL,
                   created_by → users NULL (NULL: tự yêu cầu; có giá trị: Quản trị viên tạo),
                   reason text NULL (bắt buộc với manual_link), requested_ip inet NULL, created_at
email_outbox (mới) id, kind enum('activation','password_reset','password_changed','email_change','email_changed_notice','invitation'),
                   to_email, payload_encrypted bytea NULL (xóa sau khi gửi), status, attempt_count, max_attempts,
                   next_attempt_at, locked_at, sent_at, last_error, user_id NULL, created_at
```

(Tên bảng và cột chỉ là phác thảo; sẽ chốt ở bước thiết kế chi tiết và `docs/data-model.md`.)

## 7. Giao diện

| Màn hình | Nội dung |
|---|---|
| Đăng nhập | liên kết "Quên mật khẩu?"; tài khoản chưa kích hoạt nhận thông báo "Tài khoản chưa được kích hoạt. Kiểm hộp thư hoặc liên hệ người quản lý" |
| `/quen-mat-khau` | một ô (tên đăng nhập hoặc email), câu trả lời chung sau khi gửi |
| `/kich-hoat?token=` và `/dat-lai-mat-khau?token=` | kiểm mã còn hợp lệ trước khi hiện form; đặt mật khẩu hai lần; báo rõ mã hết hạn, đã dùng; sau khi xong chuyển về đăng nhập |
| Tài khoản của tôi | hiện email và trạng thái xác thực; đổi email (nhập mật khẩu hiện tại) |
| **Người ra đề: bảng theo dõi kích hoạt** trong Danh sách dự thi | mỗi sinh viên: Chưa gửi thư, Đã gửi, **Thư lỗi**, **Chờ kích hoạt**, **Đã kích hoạt**; lọc theo trạng thái; để xử lý **trước ngày thi** |
| **Quản trị viên: chi tiết người dùng** | trạng thái kích hoạt; nút **Gửi lại thư**, **Sửa email**, **Tạo liên kết thủ công** (có hộp lý do); thay cho "Cấp lại mật khẩu tạm" |
| Quản trị viên: danh sách | bộ lọc "chưa kích hoạt", "email chưa xác thực", "thư lỗi" |
| Quản trị viên: hàng đợi thư | thư đang chờ, đã gửi, lỗi (không hiện mã); số thư đã gửi trong 24 giờ so với trần |

## 8. Những gì thay đổi trong hệ thống hiện tại

| Phần | Hiện nay | Theo B |
|---|---|---|
| File Excel yêu cầu cấp tài khoản | email tùy chọn | **email bắt buộc**, kiểm tra trùng và định dạng |
| Phiếu tài khoản (PDF, Excel; mật khẩu tạm; hạn tải 7 ngày) | có (mô-đun `identity`, bảng `credential_slips`) | **bỏ** (bảng giữ lại cho dữ liệu cũ hoặc xóa theo migration riêng) |
| "Cấp lại mật khẩu tạm" của Quản trị viên và của Người ra đề trong Danh sách | có | **bỏ**; thay bằng Gửi lại thư, Sửa email, Tạo liên kết thủ công |
| Mật khẩu tạm hạn 7 ngày và `must_change_password` | có | không dùng cho người dùng thường; `must_change_password` vẫn dùng cho `prod-bootstrap` và `prod-recover-admin` |
| Quên mật khẩu | nhờ Quản trị viên | **tự phục vụ qua email** |
| Lời mời Người ra đề | Quản trị viên tự gửi liên kết | **hệ thống tự gửi thư**, vẫn là liên kết một lần băm mã |
| Thông báo `account.password_reissued` | có | bỏ (thay bằng thư "mật khẩu đã đổi") |
| Kiểm thử | `password-recovery` (16 bài API, 4 bài trình duyệt), `admin-users`, `session-reissue`, `account-requests` (phiếu) | viết lại cho luồng mới; các kịch bản của PR 7a là **lưới an toàn** để chuyển đổi: mỗi kịch bản (quên, hết hạn, cấp hai lần, người bị Khóa, người đã Xóa, Quản trị viên quên) phải có bản tương ứng với liên kết thay cho mật khẩu tạm |
| Tài liệu | `tai-khoan-va-mat-khau.md` | viết lại mục 3 đến 5, thêm mục vận hành email (cấu hình, hạn mức, xử lý thư lỗi), cập nhật `checklist-phien-thi.md` và `prod-preflight` (thêm kiểm SMTP và hàng đợi thư) |

## 9. Tác động tới vận hành

- **Bí mật mới** (`SMTP_PASSWORD`, khóa mã hóa nội dung chờ gửi) nằm trong `api.env` nên **tự động được sao lưu** (mã hóa gpg, thư mục `khoa/`) khi đổi; `backup.env` không đổi.
- **Khôi phục từ sao lưu:** hàng đợi thư nằm trong cơ sở dữ liệu nên được khôi phục cùng; thư còn "chờ" sẽ **gửi lại** sau khôi phục (chấp nhận gửi trùng, hoặc đánh dấu hủy các thư quá cũ khi khôi phục). Mã đã hết hạn thì vô hại.
- **Cổng ra SMTP 587** từ laptop WSL và từ VPS sau này (nhiều nhà cung cấp VPS chặn cổng 25 nhưng thường mở 587; cần kiểm).
- **`prod-preflight` và checklist Phiên thi:** thêm mục "đã kích hoạt đủ danh sách thi", "hàng đợi thư không tồn đọng", "SMTP gửi thử được".
- **Thử nghiệm:** môi trường thử dùng **bộ gửi giả** (không gửi thật) và một lệnh **gửi thư thử** tới hộp thư của Quản trị viên để kiểm cấu hình.
- **Quyền riêng tư (Nghị định 13/2023):** thông báo mục đích thu thập email (xác thực danh tính, khôi phục tài khoản), lưu tối thiểu, cho phép sửa; cần đối chiếu văn bản gốc trước khi vận hành rộng.

## 10. Rủi ro và cách giảm

| Rủi ro | Giảm bằng |
|---|---|
| Thư vào Spam hoặc không đến đúng lúc cận giờ thi | kích hoạt **sớm**; bảng theo dõi kích hoạt; Gửi lại; liên kết thủ công; checklist "kích hoạt đủ" trước ngày thi |
| Chạm trần Gmail khi nhập danh sách lớn | hàng đợi có trần và hoãn; nhập sớm; chuyển nhà cung cấp chuyên dụng khi cần |
| Email sinh viên gõ sai hoặc không tồn tại | kiểm định dạng khi nhập; thư lỗi vĩnh viễn hiện cho Người ra đề; Quản trị viên sửa email |
| Chiếm hộp thư (kẻ chiếm email thì chiếm tài khoản) | mã dùng một lần, hạn ngắn, thư báo "mật khẩu đã đổi", thu hồi phiên, nhật ký; khuyến nghị sinh viên bật xác minh hai bước cho email (ngoài hệ thống) |
| Lạm dụng "Quên mật khẩu" để làm ngập hộp thư người khác | giới hạn theo tài khoản và IP; cách nhau 60 giây; trả lời luôn giống nhau |
| Kẻ lạ giả danh xin Quản trị viên "liên kết thủ công" | **lý do bắt buộc**, nhật ký, quy trình xác minh danh tính của người vận hành; liên kết hạn ngắn và gửi tới người đã biết |
| Gmail bị Google khóa gửi tạm | hàng đợi giữ thư; chuyển nhà cung cấp; liên kết thủ công cho ca khẩn |
| Phụ thuộc một kênh | lối thoát khẩn cấp; `prod-recover-admin` cho Quản trị viên |

## 11. Các câu thiết kế còn phải duyệt (hỏi từng câu khi quay lại)

| Q | Câu hỏi | Gợi ý của Trợ lý |
|---|---|---|
| Q373 | Nhà cung cấp gửi thư và hạn mức: Gmail App Password riêng (400 mỗi ngày, hạn mức an toàn), khi nào chuyển nhà cung cấp chuyên dụng | Gmail riêng cho `exam-system`, trần 400 mỗi ngày |
| Q374 | Mã: băm, mã hóa nội dung chờ gửi, hạn từng loại, một lần | như mục 4 và 5 |
| Q375 | Mật khẩu cũ còn hiệu lực cho tới khi dùng liên kết đặt lại hay vô hiệu ngay | còn hiệu lực cho tới khi dùng (chống kẻ giả danh khóa chủ thật); nghi lộ thì dùng Khóa đăng nhập |
| Q376 | Có chặn "Quên mật khẩu" khi người đó đang làm một Lượt làm bài không (đặt lại sẽ thu hồi phiên đang thi) | chặn đặt lại trong lúc có Lượt đang làm; thư vẫn có hạn nên làm sau |
| Q377 | Lối thoát khẩn cấp của Quản trị viên: chỉ liên kết thủ công, hay vẫn cho mật khẩu tạm làm phương án cuối | chỉ liên kết (Quản trị viên không biết mật khẩu); `prod-recover-admin` làm phương án cuối |
| Q378 | Chuyển tài khoản đang có chưa có email: yêu cầu ở lần đăng nhập kế, hạn chót, hay bắt buộc ngay | yêu cầu ở lần đăng nhập kế, có hạn chót trước ngày thi |
| Q379 | Thông báo cho chủ tài khoản (thư "mật khẩu đã đổi", "email đã đổi") và nội dung | có, không kèm mật khẩu |
| Q380 | Các thiết lập kỹ thuật còn lại (tên bảng, giao diện, kiểm thử, tài liệu), gom một lần như Q361, Q366, Q370 | đồng ý cả gói |

## 12. Kế hoạch PR (đề xuất)

| PR | Nội dung | Ước lượng |
|---|---|---|
| **7b** | hạ tầng gửi email: cấu hình SMTP, `email_outbox`, worker, trần và thử lại, mẫu thư, lệnh gửi thử, bộ gửi giả, tài liệu vận hành, kiểm thử | vừa |
| **7c** | `auth_tokens`, kích hoạt tài khoản, Lời mời tự gửi thư, quên mật khẩu, đổi email, nhật ký, màn hình, kiểm thử trọn kịch bản | lớn |
| **7d** | màn hình Quản trị viên (gửi lại, sửa email, liên kết thủ công, hàng đợi thư), bảng theo dõi kích hoạt cho Người ra đề, chuyển tài khoản cũ, bỏ Phiếu tài khoản và "Cấp lại mật khẩu tạm", cập nhật `prod-preflight` và checklist, tài liệu | lớn |

## 13. Điều kiện nghiệm thu (các bài kiểm thử phải chứng minh)

1. Kích hoạt bằng liên kết: đặt mật khẩu, email xác thực, không tự đăng nhập; liên kết dùng lần hai bị từ chối; hết hạn bị từ chối.
2. Quên mật khẩu: luôn cùng câu trả lời (tài khoản có, không có, bị Khóa, chờ kích hoạt, vượt giới hạn); thời gian phản hồi gần nhau; chỉ **một** mã còn hiệu lực; dùng xong thu hồi mọi phiên, ghi nhật ký, gửi thư báo.
3. Mã **không bao giờ** xuất hiện ở log, nhật ký, hay cơ sở dữ liệu ở dạng đọc được; nội dung chờ gửi bị xóa sau khi gửi.
4. Hàng đợi: chạm trần ngày thì hoãn không mất thư; khởi động lại không mất thư; lỗi vĩnh viễn đánh dấu "không gửi được"; không gửi trùng khi worker chết giữa chừng quá ngưỡng cho phép.
5. Quản trị viên: Gửi lại, Sửa email, Tạo liên kết thủ công đều ghi nhật ký (có lý do); Quản trị viên **không bao giờ nhận được mật khẩu**.
6. Trình duyệt: luồng kích hoạt, quên mật khẩu, đổi email trên điện thoại và máy tính; trang nhận mã không rò mã qua `Referrer`.
7. Giới hạn tần suất: vượt ngưỡng vẫn trả cùng câu và không gửi thêm thư.
