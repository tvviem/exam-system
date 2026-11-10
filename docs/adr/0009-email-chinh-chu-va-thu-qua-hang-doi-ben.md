---
status: accepted
---

# Email chính chủ là gốc danh tính; thư gửi qua hàng đợi bền trong PostgreSQL

Đề xuất và được chủ dự án duyệt ngày 11/11/2026 (Q372 đến Q384). Chi tiết và các câu đã duyệt: [plan/slice-7.md](../plan/slice-7.md) và [plan/slice-7-phuong-an-b-email.md](../plan/slice-7-phuong-an-b-email.md).

## Bối cảnh

Hiện nay hệ thống không gửi email ([architecture.md](../architecture.md) mục 6): Người dự thi nhận **mật khẩu tạm trên Phiếu tài khoản**, Quản trị viên **thấy mật khẩu tạm** khi cấp lại, và quên mật khẩu phải nhờ Quản trị viên. Chủ dự án nhận xét cách này khó xác định danh tính và nhập nhằng.

## Quyết định đề xuất

1. **Email chính chủ là gốc danh tính.** Tài khoản mới ở trạng thái *Chờ kích hoạt* (chưa có mật khẩu). Người dùng bấm **liên kết một lần** trong thư để tự đặt mật khẩu; việc đó chứng minh vào được hộp thư và đánh dấu `email_verified_at`. Không ai biết mật khẩu của người khác; bỏ Phiếu tài khoản và "Cấp lại mật khẩu tạm".
2. **Mã (token) chỉ lưu dạng băm SHA-256** trong PostgreSQL, dùng một lần, mỗi người một mã còn hiệu lực mỗi loại, có hạn (kích hoạt 7 ngày kể từ lúc gửi, đặt lại 60 phút, xác thực email 24 giờ, liên kết hỗ trợ 60 phút). Dựng liên kết từ địa chỉ cấu hình cố định, không lấy từ tiêu đề `Host`.
3. **Thư đi qua hàng đợi bền `email_outbox` trong PostgreSQL**, worker BullMQ hiện có gửi qua một cổng `MailSender` (bộ chuyển đổi nhà cung cấp). Ban đầu là Gmail SMTP với App Password. **Hàng đợi không chứa mã**: worker **sinh mã lúc gửi**, lưu băm, dựng thư rồi gửi (Q381); gửi lỗi thì thử lại bằng mã mới và vô hiệu mã cũ. Thư được dựng theo cấu hình chống vào thư rác (Q382): đầu mục chuẩn, văn bản thuần cộng HTML, một liên kết, warm-up dần.
4. **Hạn mức:** trần 400 thư/24 giờ trượt (Google cho khoảng 500), dành riêng 100 cho thư khẩn, thư hàng loạt tối đa 300, xoay vòng giữa các Người ra đề, giới hạn gửi lại.
5. **Quên mật khẩu tự phục vụ**, luôn trả cùng một câu và cùng thời gian phản hồi; chỉ gửi cho tài khoản Hoạt động có **email đã xác thực**.
6. **Lối thoát khẩn cấp** là liên kết hỗ trợ có lý do bắt buộc và nhật ký (Người ra đề có quyền theo Q384 cho tài khoản Chờ kích hoạt, Quản trị viên cho mọi tài khoản), không phải mật khẩu. `prod-recover-admin` giữ làm phương án cuối.

## Vì sao không chọn cách khác

- **Giữ Phiếu mật khẩu tạm:** không xác minh được người cầm phiếu; Quản trị viên biết mật khẩu.
- **SMS/OTP:** tốn phí, cần đối tác, số điện thoại không phải lúc nào cũng có ([research/xac-thuc-chinh-chu-bang-sms.md](../research/xac-thuc-chinh-chu-bang-sms.md)).
- **Liên kết đặt lại do Quản trị viên gửi tay:** vẫn phải có người xác minh danh tính, không tự phục vụ được.
- **Mã ký không lưu (JWT) thay vì băm trong bảng:** không thu hồi được khi sửa email hoặc tạo mã mới; cần danh sách thu hồi nên không đơn giản hơn.

## Hình dạng module (rà bằng codebase-design, 11/11/2026)

- Module `mail` (hàng đợi, hạn mức, vận chuyển) **không biết gì về mã hay người dùng**: nó định nghĩa cổng `MessageBuilder`, còn `identity` cài đặt (đảo phụ thuộc, để tránh vòng và để không phạm `architecture.test` A1). Đường nối vận chuyển có hai adapter thật (`SmtpTransport`, `FakeTransport`).
- `AuthLinks` trong `identity`: `issue` và `consume` với kết quả có kiểu (ok, hết hạn, đã dùng, bị thay, bị chặn, không nhận ra), nên giao diện nêu được lý do và giờ cụ thể.
- Chọn thư gửi tiếp là hàm thuần `planBatch`, kiểm thử bằng bảng kịch bản. Chi tiết: [plan/slice-7-phuong-an-b-email.md](../plan/slice-7-phuong-an-b-email.md) mục 14.

## Chỗ có thể xung đột với tài liệu hiện có (đã rà 11/11/2026)

| Tài liệu | Xung đột | Cách xử lý |
|---|---|---|
| [ADR-0001](./0001-postgresql-la-noi-luu-tru-goc.md) | không: hàng đợi thư và mã băm nằm trong PostgreSQL | nhất quán |
| [ADR-0002](./0002-redis-chi-chua-du-lieu-tam.md) | giới hạn tần suất đặt ở Redis (dữ liệu tạm) | nhất quán; hạn mức 24 giờ **trượt** đếm từ `email_outbox` (PostgreSQL), không từ Redis, để không mất khi Redis khởi động lại |
| [ADR-0004](./0004-phien-dang-nhap-opaque-cookie.md) | đặt mật khẩu xong **thu hồi mọi phiên** và không tự đăng nhập | dùng cơ chế thu hồi phiên có sẵn |
| architecture.md mục 6 ("Giai đoạn 1 không gửi email", "buộc đổi mật khẩu ở lần đăng nhập đầu", mật khẩu tạm 7 ngày) | đúng cho tới khi 7c, 7d xong | đã gắn ghi chú; sửa hẳn trong PR làm mã |
| architecture.md mục 12 (backlog: gửi email qua `MailSender`, "chọn nhà cung cấp bằng ADR") | chính là ADR này | ghi chú trỏ tới ADR-0009 |
| data-model.md mục 4 (Lời mời không gửi email; Yêu cầu cấp tài khoản kèm mật khẩu tạm và Phiếu; Người ra đề cấp lại mật khẩu tạm) | sẽ đổi | đã gắn ghi chú; sửa hẳn trong PR làm mã |
| Bất biến trong AGENTS.md (đáp án ở server, server quyết định giờ và điểm, ghi trước khi báo thành công, chỉ đọc snapshot) | không đụng tới | nhất quán |
| Ngân sách phản hồi (AGENTS.md, architecture.md mục 11) | gửi thư **không được chặn** phản hồi; `quen-mat-khau` phải trả nhanh và đều | gửi ở nền qua hàng đợi; test đo thời gian |
| Sao lưu và khôi phục ([khoi-phuc.md](../ops/khoi-phuc.md)) | khôi phục bản sao lưu có thể **gửi lại thư thật**; pod `drill-exam`, `dr-exam`, `restore-test` không được gửi | các pod đó tắt gửi (không có `SMTP_*`); thư quá cũ hết hạn nên vô hại; `prod-preflight` kiểm |
| `api.env` | thêm `SMTP_*` (không cần khóa mã hóa nội dung chờ gửi vì hàng đợi không chứa mã) | tự vào bản sao lưu `khoa/` đã mã hóa gpg; `backup.env` không đổi |

## Hệ quả

- Production cần cổng ra SMTP 587; kiểm trên laptop WSL và VPS sau này.
- Người dự thi không nhận được thư thì không vào thi được: bù bằng bảng theo dõi kích hoạt, gửi lại, sửa email, liên kết hỗ trợ, và kích hoạt sớm trước ngày thi.
- **Gmail SMTP không cho biết thư trả lại bất đồng bộ**: bảng theo dõi dùng trạng thái "Cần kiểm tra" (quá 48 giờ chưa kích hoạt) thay cho việc chỉ dựa vào báo lỗi; khi rời Gmail phải đặt SPF, DKIM, DMARC cho tên miền gửi.
- Phụ thuộc Gmail 500 thư/ngày; lớp thường xuyên trên 300 người cần chuyển nhà cung cấp chuyên dụng (cổng `MailSender` giữ cho việc này không phải viết lại).
- Mọi tài khoản hiện có ở production phải chạy luồng xác thực email (Q376c); dev nạp dữ liệu với email đã xác thực.
