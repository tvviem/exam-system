# Lát cắt 7: tài khoản và mật khẩu: khôi phục khi quên, liên kết đặt lại một lần

Nâng cấp sau khi bản MVP chạy thật (lát cắt 6). Câu hỏi bắt đầu từ chủ dự án (10/11/2026): Người dự thi hoặc Người ra đề tạo tài khoản đã lâu, đã đổi mật khẩu từ lần đầu, rồi quên. Hệ thống xử lý được chưa, và có cách nào tốt hơn cho **tài khoản cá nhân** không? Mô tả cơ chế hiện tại đầy đủ ở [docs/ops/tai-khoan-va-mat-khau.md](../ops/tai-khoan-va-mat-khau.md).

## Tóm tắt các quyết định (để xem lại nhanh)

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q371 | Làm theo **phương án C**: trước hết bổ sung kiểm thử trọn kịch bản và tài liệu hoàn chỉnh (PR 7a), sau đó mới thiết kế và làm **liên kết đặt lại dùng một lần** (PR 7b) | Kiểm thử là "lưới an toàn" trước khi sửa khu vực đăng nhập nhạy cảm |

## Hai PR

| PR | Nội dung | Trạng thái |
|---|---|---|
| **7a** | kiểm thử trọn kịch bản quên mật khẩu (API 16 bài, trình duyệt 4 bài), tài liệu `tai-khoan-va-mat-khau.md`, kế hoạch lát cắt này; **không đổi hành vi hệ thống** | làm xong 10/11/2026 |
| **7b** | liên kết đặt lại một lần: thiết kế từng câu (Q372 trở đi), migration, API, giao diện, kiểm thử, cập nhật tài liệu | chờ thiết kế |

## Rà soát hiện trạng (10/11/2026)

Câu hỏi: kịch bản "đã đổi mật khẩu từ lâu rồi quên" có được giải quyết chưa? **Có**, bằng "Cấp lại mật khẩu tạm" của Quản trị viên (Q61). Rà soát qua mã và chạy 133 bài kiểm thử liên quan (đạt hết) cho thấy:

**Đã có và đã kiểm:** cấp lại cho người dùng có mật khẩu thường (không phải mật khẩu tạm); mật khẩu cũ mất hiệu lực; mọi phiên thu hồi; gỡ khóa tạm do nhập sai; buộc đổi mật khẩu; mật khẩu tạm hạn 7 ngày; không ghi mật khẩu vào nhật ký; không tự cấp cho chính mình; cấp được khi người đó đang trong Phiên thi; Người ra đề chỉ cấp được cho Người dự thi mình xin tài khoản và chưa đổi mật khẩu.

**Khoảng trống phát hiện và đã bù ở PR 7a:**
1. Không có bài kiểm thử **trọn kịch bản** (chỉ có các mảnh lẻ) → thêm `password-recovery.int.test.ts` (16 bài).
2. Không có bài kiểm thử **trình duyệt** cho hộp thoại cấp lại (mật khẩu hiện một lần, không đóng bằng Esc) và luồng người dùng bị buộc đổi → thêm `password-recovery.spec.ts` (4 bài, desktop và điện thoại).
3. Không có tài liệu vận hành **một chỗ** về cơ chế → thêm `docs/ops/tai-khoan-va-mat-khau.md`.

**Điều phát hiện khi viết kiểm thử:** phiên của Quản trị viên chỉ **30 phút nhàn rỗi, tối đa 12 giờ**, nên nếu để lâu thì phải đăng nhập lại trước khi cấp lại (ghi trong tài liệu vận hành).

**Điểm yếu thiết kế (không sửa ở 7a, là lý do làm 7b):**
1. **Quản trị viên biết mật khẩu tạm** khi cấp lại, về nguyên tắc có thể đăng nhập bằng tài khoản người khác trước khi họ đổi. Có nhật ký ghi việc cấp lại nhưng hệ thống không ngăn.
2. **Chủ tài khoản không được báo** khi mật khẩu bị cấp lại.
3. Không tự phục vụ; hệ thống không xác minh danh tính (chỉ có quy trình của người vận hành).
4. Hạn 7 ngày của mật khẩu tạm dài hơn nhu cầu thực tế.

### Q371: hướng cải tiến (ĐÃ DUYỆT 10/11/2026: phương án C)

**Phương án:**
- **A.** Giữ nguyên, chỉ bổ sung kiểm thử trình duyệt, trọn kịch bản và tài liệu vận hành.
- **B.** Thêm **liên kết đặt lại dùng một lần** cho Người ra đề và Người dự thi (Quản trị viên chỉ tạo và gửi liên kết, chủ tài khoản tự đặt mật khẩu; Quản trị viên không biết mật khẩu); giữ cấp mật khẩu tạm làm dự phòng.
- **C.** Làm cả hai theo thứ tự: bổ sung kiểm thử trước (không đổi hành vi), sau đó mới thiết kế B.
- Phương án đã loại cho giai đoạn này: **tự đặt lại qua email** (cần dịch vụ gửi email; nhiều Người dự thi không có email; vẫn trong backlog của lát cắt 1).

**Quyết định:** chọn **C**. Lý do: kiểm thử trọn kịch bản tạo lưới an toàn trước khi thay đổi cơ chế đăng nhập (khu vực nhạy cảm); thiết kế B dựa trên cơ chế liên kết dùng một lần đã có của **Lời mời** (liên kết băm mã, dùng một lần, hết hạn) nên không phải dựng mới từ đầu.

**Hướng của B (chưa duyệt chi tiết, sẽ hỏi từng câu):** Quản trị viên bấm "Tạo liên kết đặt lại mật khẩu" cho một người; hệ thống hiện liên kết **một lần**, hết hạn ngắn (đề xuất 24 giờ), dùng được **một lần**; Quản trị viên gửi qua Zalo; chủ tài khoản mở liên kết, tự chọn mật khẩu (theo cùng quy tắc: từ 10 ký tự...), mọi phiên cũ bị thu hồi, nhật ký ghi lại. Mật khẩu cũ **giữ nguyên cho tới khi liên kết được dùng** (đề xuất, để kẻ giả danh xin reset không khóa được chủ thật). Các câu cần quyết: hạn của liên kết; mật khẩu cũ còn hiệu lực hay không; ai được tạo liên kết (chỉ Quản trị viên hay cả Người ra đề cho Người dự thi của mình); có thông báo cho chủ tài khoản không và bằng cách nào; áp dụng cho Quản trị viên không; có giới hạn số lần tạo và có tạo lại thay liên kết cũ không; nhật ký ghi gì; giao diện ở đâu; có bỏ hạn 7 ngày của mật khẩu tạm hay rút ngắn không.

## Hướng mới của chủ dự án (10/11/2026): xác thực email chính chủ, đặt lại mật khẩu qua email

Sau khi xem các điểm yếu của cách cấp mật khẩu tạm, chủ dự án nhận xét cách vận hành hiện tại **"rất khó xác định danh tính và nhập nhằng"**, và khuyến khích: **yêu cầu người dùng xác thực email chính chủ trước khi sử dụng hệ thống**; từ đó quên mật khẩu được xử lý bằng email, **như dự án `plo-tracker-bluni` đã làm** (Quản trị viên dùng tài khoản Gmail cùng cơ chế **App Password** để gửi email). Hướng này **thay thế** phương án "liên kết đặt lại do Quản trị viên gửi tay" (Q372 cũ về mật khẩu cũ còn hiệu lực hay không vẫn dùng được cho luồng email, xem dưới); cấp mật khẩu tạm có thể giữ làm lối thoát khẩn cấp.

### Rà soát `plo-tracker-bluni` (thư mục cùng cấp, chỉ đọc, 10/11/2026)

Không đọc file bí mật nào (không mở `.env`, `backend.env`). Các nơi đã đọc và điều học được:

| Chủ đề | Nơi | Cách `plo-tracker-bluni` làm |
|---|---|---|
| Gửi email | `docs/EMAIL_DELIVERY_GMAIL.md`, `backend/app/services/email_sender.py` | **Gmail SMTP** (`smtp.gmail.com:587`, STARTTLS) bằng **App Password** (bật xác minh hai bước, tạo mật khẩu ứng dụng 16 ký tự, chỉ lưu trong file bí mật quyền 600). Với Gmail, `EMAIL_FROM` **phải trùng** `SMTP_USERNAME`. Thư dựng từ mẫu tiếng Việt (bản văn bản và HTML), có đầu mục `Auto-Submitted` |
| Hàng đợi bền | bảng `emailoutbox` (migration `e20260625a01`), lớp `DurableEmailSender` | thư **vào hàng đợi trong PostgreSQL**, tiến trình nền gửi lần lượt: `pending, retry -> processing -> sent \| failed`; **không mất khi khởi động lại**; khôi phục việc kẹt (`processing` quá lâu); API trả `queued` chứ không `sent` |
| Giới hạn an toàn | `EMAIL_DAILY_LIMIT=400`, `EMAIL_MIN_INTERVAL_SECONDS=6`, `EMAIL_BULK_MAX_RECIPIENTS=100`, `EMAIL_MAX_ATTEMPTS=5` (chờ tăng dần 60 giây đến 1 giờ) | Google cho tài khoản cá nhân tối đa khoảng **500 thư mỗi ngày**; script chủ động dừng ở 400 và **hoãn sang cửa sổ sau mà không tính là lỗi**; phân biệt lỗi tạm thời (thử lại) và lỗi vĩnh viễn (mã 5xx, sai xác thực) |
| Kích hoạt tài khoản | `UserAdminService`, `AuthService.set_password_by_token`, bảng `PasswordSetupToken` | tài khoản mới **chưa kích hoạt, chưa xác thực email**; Quản trị viên **phát hành thư thiết lập mật khẩu**; liên kết `/set-password?token=...` **dùng một lần, hạn 24 giờ** (`PASSWORD_SETUP_EXPIRE_MINUTES=1440`); khi người dùng đặt mật khẩu bằng liên kết thì **email được coi là đã xác thực** ("vào được hộp thư nghĩa là chính chủ") |
| Quên mật khẩu | `POST /auth/forgot-password`, `AuthService.request_password_reset` | nhập tên đăng nhập hoặc email; **luôn trả "đã gửi"** dù tài khoản có hay không (chống dò tài khoản); chỉ cấp mã cho tài khoản hợp lệ và đang hoạt động; **vô hiệu các mã cũ chưa dùng**; mã `token_urlsafe(32)`, **hạn 60 phút**; dùng chung `/set-password`; **giới hạn tần suất mềm** theo IP và định danh (Redis), vượt thì vẫn trả "đã gửi" |
| Nhật ký | `AuditLog` | ghi `REQUEST_PASSWORD_RESET`, `SET_PASSWORD` kèm IP, trình duyệt, mã yêu cầu; không ghi mật khẩu |
| Dev và test | `ConsoleEmailSender` | không gửi thật; **không bao giờ in mã ra log ở production** |
| Chính sách | `docs/knowledge/_shared/auth-session.md` | mật khẩu 10 đến 64 ký tự, khuyến khích câu dài dễ nhớ, chặn mật khẩu yếu, phổ biến, đã lộ hoặc theo ngữ cảnh |
| Khuyến nghị tương lai | cuối `EMAIL_DELIVERY_GMAIL.md` | khi vượt 200 đến 300 thư mỗi ngày, cần biết thư bị trả lại, hoặc Gmail bị khóa thì chuyển sang dịch vụ chuyên dụng (Amazon SES, Postmark, Resend, Mailgun) hoặc Google Workspace dùng tên miền của trường |

### Điều cần cân nhắc khi mang sang `exam-system` (phát hiện từ rà soát)

1. **Mã nằm nguyên dạng trong cơ sở dữ liệu ở `plo-tracker-bluni`**: cột `token` của `PasswordSetupToken` và của `emailoutbox` đều lưu mã **dạng đọc được**. Ai đọc được cơ sở dữ liệu hoặc bản sao lưu thì dùng được mã còn hạn. Ở `exam-system` nên làm chặt hơn: **chỉ lưu băm của mã** (giống Lời mời hiện tại) và mã trong hàng đợi gửi thư được **mã hóa** rồi **xóa ngay sau khi gửi**.
2. **Hạn mức Gmail 500 thư mỗi ngày** va với việc cấp tài khoản **hàng loạt** cho Người dự thi (một lớp 500 sinh viên là hết hạn mức của cả ngày, và thư kích hoạt cho cả lớp gửi trong nhiều ngày). Cần hàng đợi có giới hạn (như `plo-tracker-bluni`) và lập kế hoạch kích hoạt **trước ngày thi nhiều ngày**, hoặc dùng dịch vụ gửi thư chuyên dụng.
3. **Người dự thi không nhận được thư (rơi vào Spam, email gõ sai) thì không vào thi được.** Cần lối thoát của Quản trị viên (cấp liên kết hoặc mật khẩu tạm thủ công, có nhật ký) và hạn "phải kích hoạt trước giờ thi".
4. **Email hiện là tùy chọn** trong Yêu cầu cấp tài khoản của `exam-system`; bắt buộc email nghĩa là đổi định dạng file Excel, kiểm tra email trùng, và quyền riêng tư (Nghị định 13/2023: ghi rõ mục đích thu thập email).
5. **Cùng một Gmail**: tài khoản `tvvresearch@gmail.com` đang là địa chỉ gửi của `plo-tracker-bluni` **và** là email của Quản trị viên thứ hai `tvvresearch` của `exam-system`. Dùng chung tài khoản gửi thì **chung hạn mức 500 thư** của hai hệ thống; nên cân nhắc tài khoản gửi riêng cho từng hệ thống.
6. **Các bí mật mới** (`SMTP_PASSWORD`...) nằm trong `api.env`, nên **tự động được sao lưu** (mã hóa gpg, thư mục `khoa/`) khi đổi; khôi phục từ sao lưu phải **không gửi lại** các thư còn nằm trong hàng đợi (hoặc chấp nhận gửi trùng).
7. **Hạ tầng:** cần cổng ra SMTP 587 từ laptop WSL và từ VPS sau này (một số nhà cung cấp VPS chặn cổng 25 nhưng thường mở 587).
8. **Đã có sẵn trong `exam-system`** để tận dụng: hàng đợi job BullMQ và worker; bảng `notifications`; cơ chế liên kết dùng một lần băm mã (Lời mời); `AuditService`; giới hạn tần suất đăng nhập qua Redis; mẫu bí mật `api.env`.

### Hướng tổ chức lại lát cắt 7 (đề xuất, chờ duyệt từng câu)

| PR | Nội dung |
|---|---|
| **7a** | kiểm thử trọn kịch bản, tài liệu hiện trạng, rà soát (đã làm, PR #89) |
| **7b** | **hạ tầng gửi email**: cấu hình SMTP và App Password, hàng đợi bền (băm mã, mã hóa nội dung chờ gửi, xóa sau khi gửi), giới hạn và thử lại, mẫu thư tiếng Việt, tài liệu vận hành, kiểm thử với bộ gửi giả |
| **7c** | **xác thực email và kích hoạt tài khoản**; **quên mật khẩu qua email** (có trả lời chung, giới hạn tần suất, mã hạn ngắn, một lần); lối thoát khẩn cấp của Quản trị viên; nhật ký; kiểm thử; cập nhật tài liệu `tai-khoan-va-mat-khau.md` |

Các câu thiết kế dự kiến (hỏi từng câu): phạm vi bắt buộc email và số phận của Phiếu tài khoản (Q372); nhà cung cấp gửi thư và hạn mức (Q373); mã: băm, mã hóa, hạn, một lần (Q374); mật khẩu cũ còn hiệu lực đến khi dùng mã không (Q375); lối thoát khẩn cấp của Quản trị viên (Q376); thông báo cho chủ tài khoản khi đổi mật khẩu (Q377); chuyển dữ liệu cũ (người dùng hiện có chưa có email) (Q378); các thiết lập kỹ thuật còn lại (Q379).

## Quy trình ghi chú cho các nâng cấp tiếp theo

1. Chủ dự án mô tả điểm nâng cấp → ghi mục tiêu vào `slice-N.md`.
2. Thiết kế **từng câu một** (Q371 trở đi): bài toán, ví dụ, phương án A/B/C, khuyến nghị, quyết định, phương án đã bỏ.
3. Quyết định kiến trúc khó đảo ngược → ADR; thuật ngữ mới → `GLOSSARY.md`; bảng dữ liệu → `docs/data-model.md`; kiến trúc → `docs/architecture.md`.
4. Mỗi PR có Summary, Evidence (số đo, kết quả kiểm thử), Merge Danger.
5. Sau khi làm: ghi chú triển khai (điều khác thiết kế, lỗi tìm ra, kết quả kiểm thử) vào `slice-N.md`; tài liệu vận hành vào `docs/ops/` kèm nhật ký bật thật.
6. Ghi tiến độ vào bộ nhớ dự án để phiên sau tiếp tục.
