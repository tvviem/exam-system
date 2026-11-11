# Phương án B chi tiết: email chính chủ, kích hoạt tài khoản và quên mật khẩu qua email

**Trạng thái: THIẾT KẾ ĐÃ DUYỆT (11/11/2026, ADR-0009 accepted). PR 7b (hạ tầng gửi thư) đã làm xong theo TDD, chưa commit; 7c và 7d chưa viết mã.** Chủ dự án đã duyệt **từng câu một** Q372 đến Q384 (bảng ở mục 11 và [slice-7.md](./slice-7.md)); các chỗ sửa theo quyết định được đánh dấu **[Qxxx]**. Chi tiết không có dấu [Qxxx] là phác thảo kỹ thuật (tên bảng, cột, giao diện) sẽ chốt ở thiết kế chi tiết của từng PR 7b, 7c, 7d. Quyết định kiến trúc: [ADR-0009](../adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md) (`proposed`). Cơ sở: rà soát `plo-tracker-bluni` (mục "Hướng mới của chủ dự án" trong slice-7.md) và đánh giá SMS ([docs/research/xac-thuc-chinh-chu-bang-sms.md](../research/xac-thuc-chinh-chu-bang-sms.md)).

## 1. Nguyên tắc và mục tiêu

1. **Email chính chủ là gốc danh tính.** Điểm tựa tin cậy là **email do người có danh sách cung cấp**: Người ra đề trong Excel (Người dự thi), Quản trị viên trong Lời mời (Người ra đề). **[Q373]** Hệ thống **tin** email đó (không giới hạn tên miền, không đối chiếu từng email) và chỉ chứng minh được rằng người bấm liên kết vào được hộp thư ấy. Ai bấm được liên kết trong hộp thư đó thì được coi là chủ tài khoản; lỗi gõ nhầm xử lý bằng đường sửa email ở mục 3.5.
2. **Không ai biết mật khẩu của người khác**, kể cả Quản trị viên. Mật khẩu do chính người dùng đặt, qua liên kết một lần.
3. **Tự phục vụ khi quên mật khẩu, 24/7**, không cần nhờ ai.
4. **Có lối thoát khẩn cấp** khi email hỏng (thư vào Spam, gõ sai, Gmail chặn tạm), nhưng lối thoát cũng là **liên kết** (không phải mật khẩu) và **có nhật ký**. **[Q377]** Email chỉ được coi là **đã xác thực** khi chủ hộp thư bấm liên kết; đặt mật khẩu qua liên kết hỗ trợ thì email **chưa xác thực**.
5. **Không tiết lộ tài khoản có tồn tại hay không** (câu trả lời luôn giống nhau).
6. **Mã chỉ lưu dạng băm**, một lần, hết hạn ngắn.

## 2. Trạng thái tài khoản

```text
                 (nhập Excel, Lời mời, Quản trị viên tạo)
                                │
                                ▼
                       CHỜ KÍCH HOẠT ──(liên kết kích hoạt, hạn 7 ngày kể từ lúc thư gửi [Q374]; người dùng đặt mật khẩu)──► HOẠT ĐỘNG
                          │   ▲                                                                     │   ▲
        (thư lỗi, hết hạn)│   │ Quản trị viên: Gửi lại thư / Sửa email / Tạo liên kết hỗ trợ       │   │ Mở khóa
                          └───┘                                                                     ▼   │
                                                                                                  BỊ KHÓA (Khóa đăng nhập, như hiện nay)
```

- **Chờ kích hoạt:** có tài khoản nhưng **chưa có mật khẩu**, **không đăng nhập được**; hiện trong danh sách cho Người ra đề và Quản trị viên (xem mục 7).
- **Hoạt động:** đã đặt mật khẩu. Có hai mức: **email đã xác thực** (`email_verified_at` có giá trị: kích hoạt bằng thư, hoặc bấm "Gửi thư xác thực") và **email chưa xác thực** (**[Q377]** kích hoạt bằng liên kết hỗ trợ; tài khoản dùng được, không chặn làm bài, có biểu ngữ nhắc xác thực; **"Quên mật khẩu" không gửi thư** tới email này cho tới khi xác thực).
- **Bị Khóa:** như hiện nay (Khóa đăng nhập do Quản trị viên).
- **Đã Xóa:** như hiện nay.
- Đề xuất dữ liệu: cột `email_verified_at` và `activated_at` trên `users` (trạng thái "chờ kích hoạt" suy ra từ `activated_at IS NULL`), thay vì thêm giá trị vào enum `user_status`.

## 3. Các luồng

### 3.1 Người dự thi: từ danh sách đến vào thi
1. Người ra đề tải file Excel hoặc CSV. **Cột email bắt buộc**, kiểm tra định dạng và **trùng email** (email là duy nhất giữa các tài khoản chưa Xóa, như hiện nay). Dòng thiếu email hoặc sai định dạng bị báo ngay khi đọc file (như các lỗi dòng hiện nay). **[Q373]** Email do Người ra đề gõ được tin; không giới hạn tên miền.
2. Quản trị viên duyệt (như hiện nay).
3. Hệ thống tạo tài khoản ở **Chờ kích hoạt** và **xếp hàng thư "Kích hoạt tài khoản"** (gửi dần, mục 5).
4. Sinh viên mở thư, bấm liên kết `.../kich-hoat?token=...` (**dùng một lần, hạn 7 ngày tính từ lúc thư được gửi đi thật [Q374]**, không tính từ lúc tạo tài khoản vì thư hàng loạt có thể gửi trễ vài ngày do hạn mức), thấy màn hình đặt mật khẩu (mật khẩu mới nhập hai lần, kiểm tra theo quy tắc hiện tại: từ 10 ký tự, không phổ biến, không chứa tên đăng nhập hay mã).
5. Đặt xong: tài khoản **Hoạt động**, email **đã xác thực**, hệ thống **không tự đăng nhập** mà chuyển về trang đăng nhập (OWASP).
6. **Không còn Phiếu tài khoản** với mật khẩu tạm. Người ra đề xem **bảng theo dõi kích hoạt** (mục 7) để biết ai chưa kích hoạt **trước ngày thi**.

### 3.2 Người ra đề: Lời mời có gửi thư
Như Lời mời hiện nay (Quản trị viên tạo, liên kết một lần băm mã, hạn 7 ngày, người nhận chọn học vị, học hàm, đặt mật khẩu), **nhưng thư mời được hệ thống gửi tự động** tới email trong Lời mời (Quản trị viên khỏi phải chép liên kết gửi Zalo), và việc bấm liên kết **xác thực email**. Giữ nút "Tạo lại liên kết" (gửi thư mới) và "Thu hồi". **[Q376]** Khác Người dự thi: Lời mời **chưa phải tài khoản** (không có gì để chiếm hay khóa); email gõ nhầm thì **Quản trị viên** sửa email của Lời mời hoặc thu hồi rồi tạo lại, có nhật ký. Thư mời thuộc nhóm **thư khẩn** (mục 5), không bị chặn bởi hàng đợi kích hoạt hàng loạt.

### 3.3 Quên mật khẩu (tự phục vụ)
1. Trang đăng nhập có liên kết **"Quên mật khẩu?"** → nhập **tên đăng nhập hoặc email**.
2. Hệ thống **luôn trả cùng một câu**: "Nếu tài khoản tồn tại, chúng tôi đã gửi thư hướng dẫn." (thời gian phản hồi đều nhau).
3. Nếu tài khoản **Hoạt động với email đã xác thực [Q377]** và vượt qua giới hạn tần suất: xếp hàng thư "Đặt lại mật khẩu" với liên kết **một lần, hạn 60 phút**; các liên kết đặt lại cũ chưa dùng bị vô hiệu.
4. Mở liên kết, đặt mật khẩu mới. Khi xong: **mọi phiên cũ bị thu hồi**, ghi nhật ký, **gửi thư báo "mật khẩu của bạn vừa được đổi"** (không kèm mật khẩu) để chủ tài khoản biết nếu không phải mình làm, và **không tự đăng nhập**.
5. Tài khoản **Chờ kích hoạt** bấm "Quên mật khẩu" thì nhận lại **thư kích hoạt** (không phải thư đặt lại; chịu giới hạn gửi lại của Q375). Tài khoản **Bị Khóa** thì **không** nhận thư (Khóa đăng nhập là quyết định của Quản trị viên). Tài khoản **email chưa xác thực [Q377]** thì **không** nhận thư; câu trả lời vẫn giống nhau, người dùng nhờ Người ra đề hoặc Quản trị viên tạo liên kết hỗ trợ.
6. **Liên kết đặt lại hết hạn (60 phút) [Q374]:** trang báo hết hạn có nút dẫn thẳng tới "Quên mật khẩu" để tự yêu cầu lại. **Liên kết kích hoạt hết hạn:** trang có nút "Gửi lại thư kích hoạt" (gửi tới email đang lưu).
7. **Người ra đề và Quản trị viên [Q376]:** dùng cùng luồng; **không bị chặn** khi đang theo dõi Phiên thi; khi đặt lại xong, **Quản trị viên khác nhận chuông [Q377]**.

### 3.4 Đổi email (tài khoản Hoạt động)
Người dùng vào **Tài khoản** → nhập email mới và mật khẩu hiện tại → hệ thống gửi thư xác thực tới **email mới** (liên kết một lần, hạn 24 giờ) và **thư báo tới email cũ**. Email chỉ đổi khi liên kết được bấm. Đổi email là gắn lại phương thức xác thực nên **cần mật khẩu hiện tại**.

### 3.5 Lối thoát khẩn cấp, theo thứ tự nhẹ đến nặng **[Q374, Q377]**

Nguyên tắc: các nút này chỉ gửi tới **email đang lưu hoặc email vừa sửa**, không bao giờ trả mật khẩu hay liên kết về cho người bấm (trừ liên kết hỗ trợ, hiện một lần cho người có quyền).

| Tình huống | Người ra đề **[Q384: người tạo Yêu cầu đã tạo tài khoản đó, hoặc có người đó trong Danh sách dự thi của Phiên thi chưa kết thúc của mình]** | Quản trị viên (mọi tài khoản) | Người dùng tự làm |
|---|---|---|---|
| Thư chưa đến, hoặc liên kết kích hoạt hết hạn | **Gửi lại** từng dòng; **Gửi lại cho tất cả người chưa kích hoạt** (theo giới hạn Q375) | Gửi lại | Nút "Gửi lại thư kích hoạt" ở trang hết hạn, hoặc bấm "Quên mật khẩu" (nhận thư kích hoạt) |
| Email gõ sai | **Sửa email, chỉ khi còn Chờ kích hoạt**: vô hiệu liên kết cũ, gửi thư mới tới email mới | Sửa email **ở mọi trạng thái**, **lý do bắt buộc** | không |
| Liên kết đặt lại hết hạn (60 phút) | không | không | "Quên mật khẩu" lần nữa |
| Thư vẫn không đến mà phải vào thi ngay | **Tạo liên kết hỗ trợ, chỉ khi còn Chờ kích hoạt** | Tạo liên kết hỗ trợ (kích hoạt hoặc đặt lại) cho mọi tài khoản | không |
| Mất quyền vào hộp thư của tài khoản đã kích hoạt | không (báo Quản trị viên) | Tạo liên kết hỗ trợ, hoặc **Khóa, sửa email, cấp lại** nếu nghi người lạ đã kích hoạt | không |
| Không còn Quản trị viên nào đăng nhập được | không | lệnh `prod-recover-admin` (như hiện nay; lệnh này vẫn in mật khẩu tạm một lần, là ngoại lệ có chủ ý) | không |

- **Liên kết hỗ trợ:** hiện **một lần**, hạn 60 phút, **lý do bắt buộc**, nhật ký; người có quyền đưa qua Zalo hoặc trực tiếp; người dùng **tự đặt mật khẩu**. Vì chưa chứng minh được hộp thư, tài khoản sau đó **Hoạt động nhưng email chưa xác thực** (mục 2, **Q377**).
- **Mọi lần sửa email và tạo liên kết hỗ trợ ghi `audit_logs`** (ai, cho ai, email cũ và mới, lý do). Đây là lớp an toàn thật vì Người ra đề, về thực chất, đã có khả năng đổi email sang hộp thư của mình rồi kích hoạt hộ; nhật ký và biểu ngữ "email chưa xác thực" giúp Quản trị viên phát hiện.
- Tài khoản **đã kích hoạt** mà người kích hoạt là người lạ (email gõ nhầm sang người khác): chỉ **Quản trị viên** xử lý (Khóa, sửa email, cấp liên kết), Người ra đề không sửa được.

Quản trị viên và Người ra đề **không bao giờ nhìn thấy mật khẩu** của người khác. Nút "Cấp lại mật khẩu tạm" hiện nay (của Quản trị viên và của Người ra đề trong Danh sách dự thi) **bị bỏ**.

### 3.6 Quản trị viên và tài khoản đặc biệt
- Quản trị viên đầu tiên vẫn tạo bằng `prod-bootstrap` (lúc đó chưa có email). Sau khi cấu hình email, **thêm và xác thực email** cho tài khoản đó.
- Quản trị viên khác do Quản trị viên tạo (có email bắt buộc, kích hoạt qua thư như mọi người).
- Quản trị viên quên mật khẩu: quên mật khẩu qua email như mọi người (cần email đã xác thực); nếu email hỏng thì Quản trị viên **khác** tạo liên kết hỗ trợ; không còn ai thì `prod-recover-admin`. **[Q377]** Mỗi lần mật khẩu của Quản trị viên hoặc Người ra đề được đặt lại qua email, **mọi Quản trị viên khác nhận chuông**.

### 3.7 Chuyển các tài khoản đang có (chưa có email hoặc chưa xác thực) **[Q376c]**
- **Môi trường dev (pod dev): mọi email hiện có coi là đã xác thực.** Làm bằng **lệnh nạp dữ liệu của dev**, **không** bằng migration, vì migration cũng chạy ở production.
- **Production: không có đường tắt.** Migration để `email_verified_at` trống cho mọi tài khoản đang có; họ phải chạy đủ luồng xác thực. **Hiện trạng production (11/11/2026, chủ dự án xác nhận): chỉ có 2 Quản trị viên và không có người dùng nào khác**: `quantri` (do `prod-bootstrap` tạo, **chưa có email**) và `tvvresearch` (đã có email, chưa xác thực). Vì vậy **không cần** cơ chế chuyển hàng loạt (hạn chót xác thực, bảng theo dõi dữ liệu cũ, Người ra đề nhập email hộ): chỉ cần để hai Quản trị viên tự xác thực qua biểu ngữ và trang Tài khoản; Quản trị viên **không bao giờ bị chặn đăng nhập** vì chưa xác thực. Điều kiện này chỉ đúng **chừng nào chưa tạo người dùng thật bằng luồng cũ**; nếu tạo trước khi lát cắt 7 lên production thì họ thành dữ liệu cũ cần chuyển (xem Q380).

## 4. Thiết kế mã (token) và bảo mật

| Hạng mục | Đề xuất |
|---|---|
| Sinh mã | 32 byte ngẫu nhiên an toàn mật mã, mã hóa base64url (không đoán được) |
| Lưu | **chỉ lưu SHA-256 của mã** (như `invitations.tokenHash`), không lưu mã đọc được; so sánh thời gian hằng định |
| Loại và hạn | `activation` **7 ngày tính từ lúc thư được gửi đi thật [Q374]** (đặt `expires_at` khi gửi, không khi tạo tài khoản); `password_reset` 60 phút; `email_change` 24 giờ; `support_link` (Quản trị viên hoặc Người ra đề tạo, **[Q377]**) 60 phút. Hạn từng loại đã duyệt ở Q381 (bảng ở mục 11) |
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
| Bảo vệ mã trong hàng đợi **[Q381]** | **cải tiến so với `plo-tracker-bluni`** (nơi mã nằm nguyên dạng trong bảng): **hàng đợi không chứa mã**. Hàng đợi chỉ lưu người nhận và loại thư; **worker sinh mã lúc gửi**, lưu SHA-256 vào `auth_tokens`, dựng thư rồi gửi, nên mã đọc được chỉ tồn tại trong bộ nhớ worker vài giây. Không cần khóa mã hóa mới. Gửi lỗi giữa chừng thì lần thử lại **sinh mã mới và vô hiệu mã cũ** (hiếm khi thư cũ đã tới: người dùng thấy hai thư, thư mới nhất dùng được; trang liên kết cũ báo "đã được thay bằng thư mới hơn"). Liên kết hỗ trợ sinh mã ngay lúc bấm, hiện một lần, không qua hàng đợi |
| Giới hạn an toàn **[Q375]** | tối đa **400 thư trong 24 giờ trượt** (Google cho khoảng 500); **dành riêng 100 thư cho thư khẩn** (quên mật khẩu, "mật khẩu đã đổi", liên kết hỗ trợ, Lời mời), thư hàng loạt (kích hoạt) tối đa **300**; cách nhau tối thiểu 6 giây; chạm trần thì **hoãn sang cửa sổ sau, không tính là lỗi**. **Xoay vòng giữa các Người ra đề** (lấy lần lượt từng người, không gửi hết lớp này rồi mới đến lớp khác). **Giới hạn gửi lại:** mỗi sinh viên được Người ra đề hoặc Quản trị viên gửi lại tối đa **1 lần/24 giờ**, tự gửi lại tối đa **3 lần/ngày**; nút "Gửi lại cho tất cả" chỉ gửi người đủ điều kiện và mỗi Người ra đề bấm tối đa **1 lần/6 giờ** |
| Hiển thị hạn mức **[Q375]** | Người ra đề thấy "hôm nay đã gửi X/300 thư hàng loạt, còn N thư trước thư của bạn, dự kiến xong khoảng HH:MM dd/mm"; Quản trị viên thấy số thư/24 giờ so với trần, **chuông khi vượt 70 %**, và khi duyệt lô lớn thấy "xếp N thư, dự kiến D ngày" |
| Thử lại | tối đa 5 lần, chờ tăng dần (60 giây đến 1 giờ); phân biệt **lỗi tạm thời** (thử lại) và **lỗi vĩnh viễn** (hộp thư không tồn tại, sai xác thực: đánh dấu email "không gửi được" để Quản trị viên và Người ra đề thấy) |
| **Giới hạn của việc phát hiện thư lỗi [Q382]** | Gmail SMTP chỉ báo lỗi **ngay lúc nộp thư** (địa chỉ sai định dạng, tài khoản bị chặn). Với email gửi tới nhà cung cấp khác, Gmail thường **nhận thư rồi mới bị trả lại về hộp Gmail của tài khoản gửi**, hệ thống **không đọc được** thư trả lại đó. Vì vậy trạng thái đỏ **"Thư lỗi"** chỉ hiện cho lỗi từ chối ngay. Bù lại bảng theo dõi có thêm trạng thái vàng **"Cần kiểm tra"** cho dòng **đã gửi quá 48 giờ mà chưa kích hoạt**, để Người ra đề hỏi sinh viên và sửa email. Đọc thư trả lại tự động (IMAP) hoặc dùng dịch vụ có báo bounce (Resend, Amazon SES, Postmark, Mailgun) là lý do thêm để rời Gmail |
| Mẫu thư **[Q382]** | sáu loại thư (kích hoạt, Lời mời, đặt lại mật khẩu, mật khẩu đã đổi, xác thực email, email đã đổi); tiếng Việt, bản văn bản thuần và HTML **cùng nội dung**; mỗi thư có **giờ hết hạn cụ thể theo giờ Việt Nam** (không ghi "còn N ngày" vì thư nằm trong hộp thư nhiều ngày), nêu ai gửi, dặn không chia sẻ liên kết, dòng liên hệ hỗ trợ cấu hình được; thư "mật khẩu đã đổi" ghi giờ, trình duyệt, hệ điều hành, **không ghi IP** (IP chỉ ở nhật ký). Mọi thư không kèm mật khẩu |
| Giảm vào Spam **[Q382]** | **Cấu hình thư (đặt trong mã và `api.env`, kiểm bằng test):** (1) `From` ổn định: một tên hiển thị và một địa chỉ không đổi (với Gmail phải **trùng tài khoản SMTP**, nếu khác Gmail ghi đè); `Reply-To` là hộp thư có thật; (2) đủ đầu mục chuẩn: `Date`, `Message-ID` có tên miền người gửi, `MIME-Version`, `Auto-Submitted: auto-generated`; **không** thêm `List-Unsubscribe` (thư giao dịch, mức 400 thư/ngày không thuộc quy định thư hàng loạt); (3) `multipart/alternative` gồm văn bản thuần và HTML, UTF-8 mã hóa đúng, tiêu đề tiếng Việt mã hóa đúng; (4) tiêu đề rõ, có tên hệ thống, không viết hoa toàn bộ, không dấu chấm than, không từ kiểu khuyến mãi; (5) thân thư: **một liên kết chính**, chữ hiển thị trùng đích, tên miền cố định của hệ thống, **không rút gọn URL, không ảnh, không tệp đính kèm, không điểm theo dõi**; (6) **mỗi thư có nội dung riêng** (họ tên, tên đăng nhập, giờ hết hạn) chứ không phải một mẫu giống hệt gửi hàng trăm lần; (7) **khởi động dần (warm-up)**: tài khoản gửi mới mà gửi ngay hàng trăm thư giống nhau dễ bị Google nghi ngờ, nên trần thư hàng loạt tăng dần (đề xuất 50, 100, 150, 200, 300 trong 5 ngày đầu, cấu hình được); (8) dừng gửi tới địa chỉ đã bị từ chối cứng. **Xác thực tên miền:** khi gửi bằng Gmail thì SPF, DKIM, DMARC do Google lo; **khi rời Gmail sang tên miền riêng hoặc dịch vụ chuyên dụng thì phải tự đặt bản ghi DNS SPF, DKIM, DMARC** (cần làm trước khi chuyển, xem mục 9). **Phía người nhận:** màn chờ kích hoạt và thư hướng dẫn nhắc "không thấy thư thì kiểm Spam hoặc Quảng cáo (Promotions), thêm địa chỉ gửi vào danh bạ"; nhờ vài người đầu bấm "Không phải spam" |
| Khi nào rời Gmail | thường vượt 200 đến 300 thư mỗi ngày, cần biết thư bị trả lại, hoặc Gmail bị khóa: chuyển Amazon SES, Postmark, Resend, Mailgun hoặc Google Workspace của trường. Kênh gửi là một bộ chuyển đổi nên đổi nhà cung cấp không viết lại phần còn lại |

**Ví dụ hạn mức [Q375]:** lớp 500 sinh viên cần **500 thư kích hoạt**. Thư hàng loạt chỉ được 300 mỗi 24 giờ: ngày 1 gửi 300, ngày 2 gửi 200; nên **nhập danh sách sớm ít nhất vài ngày** trước ngày thi (hạn liên kết 7 ngày tính từ lúc gửi nên thư đến trễ vẫn dùng được). Nếu thường xuyên có lớp trên 300 người cần kích hoạt trong một ngày thì cần nhà cung cấp gửi thư chuyên dụng (xem hàng "Khi nào rời Gmail"). Phiên bản cũ của đoạn này tính 400 thư hàng loạt mỗi ngày; nay còn 300 vì 100 thư để dành cho thư khẩn. Mỗi lần có người quên mật khẩu thêm 1 thư; ngày thi với 500 người có thể phát sinh vài chục thư đặt lại, vẫn trong trần nếu danh sách đã kích hoạt từ trước.

## 6. Mô hình dữ liệu (phác thảo)

```text
users (thêm)       email_verified_at timestamptz NULL, activated_at timestamptz NULL
                   -- password_hash cho phép NULL khi còn "Chờ kích hoạt"
auth_tokens (mới)  id, user_id → users, purpose enum('activation','password_reset','email_change','support_link'),
                   token_hash UNIQUE, new_email NULL (cho email_change), expires_at, used_at NULL,
                   created_by → users NULL (NULL: tự yêu cầu; có giá trị: Quản trị viên hoặc Người ra đề tạo),
                   sent_at NULL (hạn activation tính từ đây, Q374),
                   reason text NULL (bắt buộc với support_link), requested_ip inet NULL, created_at
email_outbox (mới) id, kind enum('activation','password_reset','password_changed','email_change','email_changed_notice','invitation'),
                   to_email, status,   -- Q381: KHÔNG lưu mã hay nội dung có mã; worker dựng thư lúc gửi attempt_count, max_attempts,
                   next_attempt_at, locked_at, sent_at, last_error, user_id NULL, created_at,
                   lane enum('urgent','bulk'),   -- Q375: thư khẩn dùng phần dự trữ 100/400, thư hàng loạt tối đa 300
                   requested_by → users NULL     -- Q375: để xoay vòng giữa các Người ra đề và đếm giới hạn gửi lại
-- Thư "gửi lại" cần bản ghi lần gửi lại gần nhất theo từng sinh viên (1 lần/24 giờ, Q375): đề xuất đọc từ email_outbox
-- (kind + user_id + created_at), không thêm bảng riêng; chốt ở Q383.
```

(Tên bảng và cột chỉ là phác thảo; sẽ chốt ở bước thiết kế chi tiết và `docs/data-model.md`.)

## 7. Giao diện

**Yêu cầu chung [Q381]:** mọi màn hình và thư liên quan đến liên kết hoặc giới hạn phải **nêu rõ thời hạn và con số cho người dùng** để họ làm đúng việc: liên kết còn bao lâu và hết lúc nào (giờ, ngày cụ thể), mã đã dùng hoặc đã bị thay bằng thư mới hơn, được gửi lại bao nhiêu lần nữa và bao giờ được gửi lại (đếm ngược 60 giây), còn mấy lần "Quên mật khẩu" trong giờ này. Không chỉ báo lỗi chung chung kiểu "liên kết không hợp lệ".

| Màn hình | Nội dung |
|---|---|
| Đăng nhập | liên kết "Quên mật khẩu?"; tài khoản chưa kích hoạt nhận thông báo "Tài khoản chưa được kích hoạt. Kiểm hộp thư hoặc liên hệ người quản lý" |
| `/quen-mat-khau` | một ô (tên đăng nhập hoặc email), câu trả lời chung sau khi gửi |
| `/kich-hoat?token=` và `/dat-lai-mat-khau?token=` | kiểm mã còn hợp lệ trước khi hiện form; đặt mật khẩu hai lần; báo rõ mã hết hạn, đã dùng; sau khi xong chuyển về đăng nhập |
| Tài khoản của tôi | hiện email và trạng thái xác thực; đổi email (nhập mật khẩu hiện tại) |
| **Người ra đề: bảng theo dõi kích hoạt** trong Danh sách dự thi | mỗi sinh viên: Chưa gửi thư, Đã gửi, **Thư lỗi** (bị từ chối ngay), **Cần kiểm tra** (đã gửi quá 48 giờ chưa kích hoạt), **Chờ kích hoạt**, **Đã kích hoạt**, **Email chưa xác thực**; lọc theo trạng thái; nút **Gửi lại** (từng dòng và tất cả, Q375), **Sửa email** và **Tạo liên kết hỗ trợ** (chỉ dòng còn Chờ kích hoạt, Q374, Q377); khung **hạn mức và hàng đợi** (Q375); để xử lý **trước ngày thi** |
| **Quản trị viên: chi tiết người dùng** | trạng thái kích hoạt và xác thực email; nút **Gửi lại thư**, **Sửa email** (mọi trạng thái, có lý do), **Tạo liên kết hỗ trợ** (có hộp lý do); thay cho "Cấp lại mật khẩu tạm" |
| Mọi người dùng, khi email chưa xác thực **[Q377]** | biểu ngữ nhắc và nút "Gửi thư xác thực" (trong Tài khoản của tôi); không chặn làm bài |
| Chuông của Quản trị viên **[Q375, Q377]** | số thư/24 giờ vượt 70 % hạn mức; mật khẩu của Người ra đề hoặc Quản trị viên vừa được đặt lại qua email |
| Quản trị viên: danh sách | bộ lọc "chưa kích hoạt", "email chưa xác thực", "thư lỗi" |
| Quản trị viên: hàng đợi thư | thư đang chờ, đã gửi, lỗi (không hiện mã); số thư đã gửi trong 24 giờ so với trần |

## 8. Những gì thay đổi trong hệ thống hiện tại

| Phần | Hiện nay | Theo B |
|---|---|---|
| File Excel yêu cầu cấp tài khoản | email tùy chọn | **email bắt buộc**, kiểm tra trùng và định dạng |
| Phiếu tài khoản (PDF, Excel; mật khẩu tạm; hạn tải 7 ngày) | có (mô-đun `identity`, bảng `credential_slips`) | **bỏ** (bảng giữ lại cho dữ liệu cũ hoặc xóa theo migration riêng) |
| "Cấp lại mật khẩu tạm" của Quản trị viên và của Người ra đề trong Danh sách | có | **bỏ**; thay bằng Gửi lại thư, Sửa email, Tạo liên kết hỗ trợ |
| Mật khẩu tạm hạn 7 ngày và `must_change_password` | có | không dùng cho người dùng thường; `must_change_password` vẫn dùng cho `prod-bootstrap` và `prod-recover-admin` |
| Quên mật khẩu | nhờ Quản trị viên | **tự phục vụ qua email** |
| Lời mời Người ra đề | Quản trị viên tự gửi liên kết | **hệ thống tự gửi thư**, vẫn là liên kết một lần băm mã |
| Thông báo `account.password_reissued` | có | bỏ (thay bằng thư "mật khẩu đã đổi") |
| `account_request_items.email` | NULL nếu dòng lỗi ở trường đó, email tùy chọn | email **bắt buộc**: thiếu hoặc sai định dạng là lỗi dòng khi đọc file (cột vẫn cho NULL ở dòng lỗi) |
| `users.password_hash`, `must_change_password`, `password_expires_at` | mọi tài khoản có mật khẩu tạm lúc tạo | tài khoản **Chờ kích hoạt không có mật khẩu** (cho phép NULL); `must_change_password` và `password_expires_at` chỉ còn cho `prod-bootstrap` và `prod-recover-admin` |
| `docs/data-model.md` mục 4 (Lời mời, Yêu cầu cấp tài khoản, Phiếu tài khoản, Người ra đề cấp lại mật khẩu tạm), `docs/architecture.md` mục 6 và 12, `GLOSSARY.md` (Phiếu tài khoản, thuật ngữ mới), `docs/ops/tai-khoan-va-mat-khau.md`, `trien-khai.md`, `khoi-phuc.md`, `chuyen-len-vps.md`, `demo-wsl.md`, `demo-data/README.md`, `README.md`, `docs/ui-design.md`, `.env.example` | mô tả luồng mật khẩu tạm và "không gửi email" | đã gắn **ghi chú "sẽ đổi theo ADR-0009"** ở những chỗ chính (11/11/2026); **sửa hẳn khi từng PR 7b, 7c, 7d được làm**, cùng một PR với mã |
| Kiểm thử | `password-recovery` (16 bài API, 4 bài trình duyệt), `admin-users`, `session-reissue`, `account-requests` (phiếu) | viết lại cho luồng mới; các kịch bản của PR 7a là **lưới an toàn** để chuyển đổi: mỗi kịch bản (quên, hết hạn, cấp hai lần, người bị Khóa, người đã Xóa, Quản trị viên quên) phải có bản tương ứng với liên kết thay cho mật khẩu tạm |
| Tài liệu | `tai-khoan-va-mat-khau.md` | viết lại mục 3 đến 5, thêm mục vận hành email (cấu hình, hạn mức, xử lý thư lỗi), cập nhật `checklist-phien-thi.md` và `prod-preflight` (thêm kiểm SMTP và hàng đợi thư) |

## 9. Tác động tới vận hành

- **Bí mật mới** (`SMTP_PASSWORD`; không còn khóa mã hóa nội dung chờ gửi, Q381) nằm trong `api.env` nên **tự động được sao lưu** (mã hóa gpg, thư mục `khoa/`) khi đổi; `backup.env` không đổi.
- **Khôi phục từ sao lưu:** hàng đợi thư nằm trong cơ sở dữ liệu nên được khôi phục cùng; thư còn "chờ" sẽ **gửi lại** sau khôi phục (chấp nhận gửi trùng, hoặc đánh dấu hủy các thư quá cũ khi khôi phục). Mã đã hết hạn thì vô hại.
- **Cổng ra SMTP 587** từ laptop WSL và từ VPS sau này (nhiều nhà cung cấp VPS chặn cổng 25 nhưng thường mở 587; cần kiểm).
- **`prod-preflight` và checklist Phiên thi:** thêm mục "đã kích hoạt đủ danh sách thi", "hàng đợi thư không tồn đọng", "SMTP gửi thử được".
- **Thử nghiệm:** môi trường thử dùng **bộ gửi giả** (không gửi thật) và một lệnh **gửi thư thử** tới hộp thư của Quản trị viên để kiểm cấu hình.
- **Các môi trường khác nhau [Q376c]:** `dev-exam` (pod dev) dùng bộ gửi giả và nạp dữ liệu với email **đã xác thực** sẵn; **`drill-exam`, `dr-exam` (diễn tập khôi phục), pod `restore-test` hằng tháng và `demo` phải tắt hẳn việc gửi thư thật** (không có `SMTP_*`), nếu không, khôi phục một bản sao lưu sẽ gửi lại thư thật cho người thật. Chỉ `prod-exam` có SMTP thật. `exam-ctl.sh` cần thêm kiểm này và `prod-preflight` kiểm ngược lại.
- **Production chuyển dữ liệu cũ [Q376c, Q380]:** chỉ 2 Quản trị viên hiện có, tự xác thực qua biểu ngữ; không có cơ chế chuyển hàng loạt.
- **Việc chủ dự án cần làm (nhắc trước khi lên production):**
  1. Tạo **tài khoản Gmail riêng** cho `exam-system` (không dùng chung với `plo-tracker-bluni`), bật xác minh hai bước, tạo App Password, đưa vào Bitwarden và `api.env`.
  2. Đặt **tên hiển thị của hệ thống** và **dòng liên hệ hỗ trợ** trong cài đặt (mặc định tạm: "Hệ thống kiểm tra đánh giá trực tuyến"; Q382).
  3. **Làm nóng tài khoản gửi** (warm-up): gửi vài thư thật ít một vài ngày trước đợt kích hoạt lớn; không nhập lớp vài trăm người ngay ngày đầu.
  4. Kiểm **cổng 587** gửi ra được từ máy chạy production.
  5. **Chạy thử:** lệnh gửi thư thử tới hộp thư của bạn, xem thư gốc ("Show original") để thấy SPF, DKIM, DMARC đều PASS và thư không vào Spam.
  6. Khi **rời Gmail** (lớp thường xuyên trên 300 người, cần báo bounce, hoặc Gmail chặn): đặt bản ghi DNS SPF, DKIM, DMARC cho tên miền gửi (tên miền trên Cloudflare của bạn) **trước khi** đổi nhà cung cấp.
  7. Hai Quản trị viên xác thực email (Q380) và `prod-preflight` báo đạt trước Phiên thi thật đầu tiên.
- **Quyền riêng tư (Nghị định 13/2023):** thông báo mục đích thu thập email (xác thực danh tính, khôi phục tài khoản), lưu tối thiểu, cho phép sửa; cần đối chiếu văn bản gốc trước khi vận hành rộng.

## 10. Rủi ro và cách giảm

| Rủi ro | Giảm bằng |
|---|---|
| Thư vào Spam hoặc không đến đúng lúc cận giờ thi | kích hoạt **sớm**; bảng theo dõi kích hoạt; Gửi lại; liên kết hỗ trợ; checklist "kích hoạt đủ" trước ngày thi |
| Chạm trần Gmail khi nhập danh sách lớn | hàng đợi có trần và hoãn; nhập sớm; chuyển nhà cung cấp chuyên dụng khi cần |
| Email sinh viên gõ sai hoặc không tồn tại | kiểm định dạng khi nhập; thư lỗi vĩnh viễn hiện cho Người ra đề; Quản trị viên sửa email |
| Chiếm hộp thư (kẻ chiếm email thì chiếm tài khoản) | mã dùng một lần, hạn ngắn, thư báo "mật khẩu đã đổi", thu hồi phiên, nhật ký; khuyến nghị sinh viên bật xác minh hai bước cho email (ngoài hệ thống) |
| Lạm dụng "Quên mật khẩu" để làm ngập hộp thư người khác | giới hạn theo tài khoản và IP; cách nhau 60 giây; trả lời luôn giống nhau |
| Kẻ lạ giả danh xin Quản trị viên "liên kết hỗ trợ" | **lý do bắt buộc**, nhật ký, quy trình xác minh danh tính của người vận hành; liên kết hạn ngắn và gửi tới người đã biết |
| Gmail bị Google khóa gửi tạm | hàng đợi giữ thư; chuyển nhà cung cấp; liên kết hỗ trợ cho ca khẩn |
| Phụ thuộc một kênh | lối thoát khẩn cấp; `prod-recover-admin` cho Quản trị viên |

## 11. Các câu thiết kế (cập nhật 11/11/2026)

**Đã duyệt** (chi tiết và lý do ở bảng đầu [slice-7.md](./slice-7.md)):

| Q | Quyết định |
|---|---|
| Q372 | Phương án B (email chính chủ, kích hoạt và quên mật khẩu qua email, bỏ mật khẩu tạm) |
| Q373 | Phương án A: tin email do Người ra đề cung cấp; không giới hạn tên miền |
| Q374 | Người ra đề sửa email khi còn Chờ kích hoạt, Quản trị viên sửa mọi trạng thái; ba cửa gửi lại (sinh viên tự, Người ra đề, Quản trị viên); hạn kích hoạt 7 ngày từ lúc thư gửi; liên kết đặt lại hết hạn thì tự yêu cầu lại |
| Q375 | Trần 400/24 giờ trượt, dự trữ 100 cho thư khẩn, thư hàng loạt tối đa 300, xoay vòng giữa Người ra đề, giới hạn gửi lại, hiển thị hạn mức |
| Q376 | Người ra đề dùng chung cơ chế (kèm không bị chặn khi theo dõi Phiên thi, chuông, đổi email cần mật khẩu); dev coi email là đã xác thực, production chạy đủ luồng |
| Q377 | Chuông mỗi lần đặt lại mật khẩu của Người ra đề/Quản trị viên; liên kết hỗ trợ: Người ra đề cho tài khoản Chờ kích hoạt, Quản trị viên cho mọi tài khoản; email chưa xác thực không nhận thư quên mật khẩu |
| Q378 | Mật khẩu cũ còn dùng được cho tới khi liên kết đặt lại được dùng; nghi bị dùng trái phép thì Quản trị viên Khóa đăng nhập |
| Q379 | Quên mật khẩu của Người dự thi không bị chặn khi đang có Lượt làm bài; nhật ký ghi kèm "đang có Lượt" |
| Q380 | Production chỉ có 2 Quản trị viên nên tự xác thực qua biểu ngữ/trang Tài khoản; Quản trị viên không bao giờ bị chặn; `prod-preflight` và checklist thêm mục "mọi Quản trị viên có email đã xác thực"; bỏ cơ chế chuyển hàng loạt |
| Q381 | Worker **sinh mã lúc gửi**, hàng đợi không lưu mã (thay cho mã hóa AES nội dung chờ gửi); hạn: kích hoạt 7 ngày từ lúc gửi, đặt lại 60 phút, xác thực email và đổi email 24 giờ, liên kết hỗ trợ 60 phút; một mã còn hiệu lực mỗi loại mỗi người; quên mật khẩu tối đa 3 lần/giờ/tài khoản (cách nhau 60 giây), 20 lần/giờ/IP, thử mã sai 10 lần/giờ/IP, vượt thì vẫn trả cùng câu; **giao diện phải nêu rõ các thời hạn cho người dùng** |
| Q382 | Sáu loại thư; thời hạn ghi giờ cụ thể (giờ Việt Nam) trong thư, giờ cụ thể kèm đếm ngược trên màn hình; trang liên kết lỗi nêu rõ lý do (hết hạn, đã dùng, đã bị thay) và cách làm tiếp; thư "mật khẩu đã đổi" ghi giờ, trình duyệt, hệ điều hành, không ghi IP; tên hệ thống và dòng liên hệ hỗ trợ **cấu hình được** (mặc định tạm); **bổ sung cấu hình chống vào thư rác** (đầu mục, tiêu đề, thân thư, warm-up, DNS khi rời Gmail) |
| Q383 | Gói kỹ thuật: bảng và module `mail` qua cổng, trang quên mật khẩu dưới 300 ms và đều nhau, bộ gửi giả và test trọn kịch bản, pod diễn tập không có SMTP, sửa tài liệu cùng PR với mã, bốn thuật ngữ GLOSSARY; tên hệ thống và dòng liên hệ cấu hình ở `api.env` (không làm màn Cài đặt) |
| Q384 | "Người ra đề của Người dự thi" (được sửa email, gửi lại, tạo Liên kết hỗ trợ khi tài khoản còn Chờ kích hoạt) = **người tạo Yêu cầu đã tạo tài khoản đó HOẶC Người ra đề có người đó trong Danh sách dự thi của Phiên thi chưa kết thúc của mình** (phương án C); thuật ngữ đổi: Liên kết một lần (chung), **Liên kết hỗ trợ** (thay "Liên kết thủ công"), Chờ kích hoạt, Email đã xác thực (trạng thái) |

**Còn phải duyệt:** không còn câu thiết kế nào (Q372 đến Q384 đã duyệt); còn **duyệt ADR-0009** và đồng ý cách gọi bốn thuật ngữ khi thêm vào GLOSSARY (đã đồng ý ở Q384; GLOSSARY đã cập nhật).

**Thuật ngữ đã thêm vào GLOSSARY (11/11/2026, sau khi chủ dự án đồng ý cách gọi, Q384):** **Chờ kích hoạt** (`PendingActivation`), **Liên kết một lần** (`AuthLink`), **Liên kết hỗ trợ** (`SupportLink`), **Email đã xác thực** (trạng thái, `email_verified_at`); đã sửa mục **Người dùng** và **Lời mời**. Mục **Phiếu tài khoản** sẽ bỏ khi PR 7d làm.

## 12. Kế hoạch PR (đề xuất; cập nhật theo Q373 đến Q377)

| PR | Nội dung | Ước lượng |
|---|---|---|
| **7b** | hạ tầng gửi email: cấu hình SMTP, `email_outbox` (hai làn khẩn/hàng loạt, xoay vòng giữa Người ra đề, trần 400/300/100), worker, thử lại, mẫu thư, lệnh gửi thử, bộ gửi giả, **tắt gửi ở pod diễn tập**, tài liệu vận hành, kiểm thử | vừa |
| **7c** | `auth_tokens`, kích hoạt tài khoản, Lời mời tự gửi thư, quên mật khẩu (chỉ email đã xác thực), đổi email, thư xác thực, nhật ký, màn hình, kiểm thử trọn kịch bản | lớn |
| **7d** | màn hình Quản trị viên và Người ra đề (gửi lại, sửa email, liên kết hỗ trợ, hạn mức, bảng theo dõi kích hoạt), chuông (quá 70 % hạn mức, đặt lại mật khẩu Người ra đề/Quản trị viên), biểu ngữ và trang xác thực email cho Quản trị viên hiện có (Q380), lệnh nạp dev, bỏ Phiếu tài khoản và "Cấp lại mật khẩu tạm", cập nhật `prod-preflight` và checklist, tài liệu | lớn |

## 13. Điều kiện nghiệm thu (các bài kiểm thử phải chứng minh)

1. Kích hoạt bằng liên kết: đặt mật khẩu, email xác thực, không tự đăng nhập; liên kết dùng lần hai bị từ chối; hết hạn bị từ chối.
2. Quên mật khẩu: luôn cùng câu trả lời (tài khoản có, không có, bị Khóa, chờ kích hoạt, vượt giới hạn); thời gian phản hồi gần nhau; chỉ **một** mã còn hiệu lực; dùng xong thu hồi mọi phiên, ghi nhật ký, gửi thư báo.
3. Mã **không bao giờ** xuất hiện ở log, nhật ký, hay cơ sở dữ liệu ở dạng đọc được; hàng đợi `email_outbox` không chứa mã (worker sinh mã lúc gửi); gửi lỗi rồi thử lại thì mã cũ bị vô hiệu.
4. Hàng đợi: chạm trần ngày thì hoãn không mất thư; khởi động lại không mất thư; lỗi vĩnh viễn đánh dấu "không gửi được"; không gửi trùng khi worker chết giữa chừng quá ngưỡng cho phép.
5. Quản trị viên: Gửi lại, Sửa email, Tạo liên kết hỗ trợ đều ghi nhật ký (có lý do); Quản trị viên **không bao giờ nhận được mật khẩu**.
6. Trình duyệt: luồng kích hoạt, quên mật khẩu, đổi email trên điện thoại và máy tính; trang nhận mã không rò mã qua `Referrer`.
7. Giới hạn tần suất: vượt ngưỡng vẫn trả cùng câu và không gửi thêm thư.
8. **Quyền theo vai trò [Q374, Q377]:** Người ra đề sửa email và tạo liên kết hỗ trợ **chỉ** cho tài khoản còn Chờ kích hoạt **mà mình có quyền theo Q384** (là người tạo Yêu cầu đã tạo tài khoản đó, hoặc có người đó trong Danh sách dự thi của Phiên thi chưa kết thúc của mình); tài khoản khác hoặc đã kích hoạt thì bị từ chối; Quản trị viên làm được ở mọi trạng thái; mọi thao tác ghi nhật ký kèm lý do với liên kết hỗ trợ và sửa email của Quản trị viên.
9. **Hạn mức công bằng [Q375]:** hai Người ra đề cùng xếp thư (500 và 30 người): thư của người thứ hai xong trong ngày đầu; thư khẩn đi ngay khi hàng đợi hàng loạt đã đầy; "Gửi lại" cho cùng một sinh viên lần hai trong 24 giờ bị từ chối; "Gửi lại cho tất cả" bỏ qua người chưa đủ điều kiện.
10. **Email chưa xác thực [Q377]:** kích hoạt bằng liên kết hỗ trợ cho kết quả "Hoạt động, email chưa xác thực"; "Quên mật khẩu" cho tài khoản đó không xếp thư (câu trả lời vẫn giống mọi trường hợp khác); sau khi bấm thư xác thực thì được nhận thư quên mật khẩu.
11. **Môi trường [Q376c]:** dev nạp dữ liệu với email đã xác thực; migration **không** đánh dấu xác thực; pod `drill-exam`, `dr-exam`, `restore-test` không gửi thư thật (kiểm bằng test của `exam-ctl.sh` và `prod-preflight`).
12. **Chuông [Q377]:** đặt lại mật khẩu của Người ra đề hoặc Quản trị viên tạo chuông cho các Quản trị viên khác (không cho chính người đó); vượt 70 % hạn mức tạo chuông và tự gỡ khi hạ.
13. **Thư không bị nghi là rác [Q382]:** test dựng thư thật và kiểm đủ đầu mục (`From`, `Reply-To`, `Date`, `Message-ID`, `Auto-Submitted`, `MIME-Version`), có cả phần văn bản thuần và HTML cùng nội dung, UTF-8 đúng, một liên kết duy nhất dẫn tới tên miền cấu hình, không ảnh, không tệp đính kèm, không URL rút gọn, tiêu đề không viết hoa toàn bộ; mỗi thư chứa họ tên và giờ hết hạn riêng; warm-up giới hạn đúng theo lịch; địa chỉ bị từ chối cứng thì không gửi lại.
14. **Thời hạn hiển thị rõ [Q381, Q382]:** mọi thư có giờ hết hạn cụ thể; mọi trang liên kết lỗi nêu lý do, giờ liên quan và việc làm tiếp; nút gửi lại hiện số lần còn lại và đếm ngược 60 giây.

## 14. Rà soát thiết kế bằng skill domain-modeling và codebase-design (11/11/2026)

Hai lượt rà: (1) **ngôn ngữ nghiệp vụ**, đối chiếu thuật ngữ và tình huống biên với GLOSSARY, data-model và mã; (2) **hình dạng module** (độ sâu, đường nối, khả năng kiểm thử). Kết quả cần xử lý đánh dấu **[RV]**; điểm cần chủ dự án quyết nằm ở Q384.

### 14.1 Ngôn ngữ nghiệp vụ

**Xung đột phát hiện khi đối chiếu mã.** Q374(a) và Q377 viết "Người ra đề **đã tạo Yêu cầu** đó". Nhưng cơ chế hiện có "cấp lại mật khẩu tạm" (`SessionRosterService.reissuePassword`, data-model mục 4) cho phép Người ra đề thao tác với người **có tên trong Danh sách dự thi của một Phiên thi chưa kết thúc của chính họ**. Hai cách hiểu "Người ra đề của Người dự thi" khác nhau. Tình huống làm lộ khác biệt:
- **S1.** Người ra đề A tạo tài khoản cho Lan (Chờ kích hoạt). Người ra đề B sau đó đưa Lan vào Danh sách dự thi, thi ngày mai. Lan chưa kích hoạt. Theo chữ của Q374, B **không** gửi lại thư hay sửa email được (A mới được).
- **S1'.** Ngược lại nếu chỉ theo Danh sách dự thi: A tạo Yêu cầu vài ngày trước kỳ thi, lúc đó Lan **chưa nằm trong Danh sách dự thi nào**, nên A **không** sửa được email gõ nhầm trong giai đoạn quan trọng nhất (kích hoạt sớm).
→ **Q384(a): đã duyệt phương án C (hợp của hai điều kiện).**

**Thuật ngữ cần làm sắc nét [RV]:**
- Thiết kế có **bốn loại liên kết một lần** (kích hoạt, đặt lại mật khẩu, xác thực email, thủ công) mà GLOSSARY chưa có từ chung. Đề xuất một thuật ngữ chung **Liên kết một lần** (`AuthLink`) và bốn mục đích của nó, để mã, giao diện và thư gọi thống nhất (tránh lẫn "mã", "token", "link").
- **"Liên kết thủ công"** dễ hiểu sai (thủ công so với cái gì?). Đã đổi thành **Liên kết hỗ trợ** (`SupportLink`): liên kết do người có quyền tạo hộ khi thư không đến.
- **"Email đã xác thực"** là một **trạng thái**, không phải một khái niệm riêng; giữ làm thuộc tính của Người dùng.
- **Chờ kích hoạt** giữ nguyên (khớp với trạng thái mới của Người dùng).
- **Lời mời** (Người ra đề) và **Liên kết kích hoạt** (Người dự thi) là hai việc khác nhau, nhưng cùng cơ chế liên kết một lần; GLOSSARY phải nói rõ **Lời mời không phải tài khoản** (chỉ thành tài khoản khi chấp nhận) còn Chờ kích hoạt **đã là tài khoản**.
- Định nghĩa **Người dùng** hiện ghi "do Quản trị viên tạo"; thực tế còn do Lời mời và Yêu cầu cấp tài khoản tạo. Sửa khi thêm thuật ngữ.
- GLOSSARY chỉ chứa ngôn ngữ nghiệp vụ, **không** chứa chi tiết cài đặt (hạn mức 400/300/100, SHA-256, hàng đợi...); các chi tiết này ở ADR-0009 và tài liệu này.

**Các tình huống biên khác đã xét:**
- **S2.** Dòng Excel khớp tài khoản **đã có** (theo mã) nhưng email khác: hiện chỉ thêm nhãn (`tag_added`). Quy tắc: **không ghi đè email của tài khoản có sẵn** và **không gửi thư**; màn duyệt và bảng theo dõi phải nói rõ "đã có tài khoản, giữ nguyên email" để Người ra đề khỏi chờ thư không bao giờ đến.
- **S3.** Quản trị viên tách riêng khỏi Người ra đề ("người vừa quản trị vừa ra đề dùng hai tài khoản") mà email là **duy nhất**: một người cần **hai email khác nhau** cho hai tài khoản. Ghi vào tài liệu vận hành.
- **S4.** Người dùng **bị Khóa đăng nhập hoặc bị Xóa** mà còn liên kết một lần chưa dùng: liên kết **phải chết** và trang báo rõ "tài khoản đã bị khóa". Thêm vào tiêu chí nghiệm thu (mục 13).
- **S5.** Người dự thi **Chờ kích hoạt** đã nằm trong Danh sách dự thi: màn của Người ra đề (Danh sách dự thi, Phòng chờ) phải thấy dấu "chưa kích hoạt" để xử lý trước giờ thi. Đã có trong bảng theo dõi (mục 7); nối thêm vào Danh sách dự thi.
- **S6.** Một người mang cả Nhãn Người ra đề lẫn Người dự thi: một tài khoản, một email, không vấn đề.

### 14.2 Hình dạng module (codebase-design)

Mã hiện có đã sẵn chỗ dựa: cổng `ADMIN_DIRECTORY` nối module qua `AttemptPortsWiringModule`, và `Clock` ở `common/clock.ts` để kiểm thử hạn.

1. **Module `mail` sâu, giao diện nhỏ [RV].** Giao diện chỉ gồm: `enqueue(kind, người nhận, làn khẩn/hàng loạt, người yêu cầu)`; hai **adapter vận chuyển** (`SmtpTransport` và `FakeTransport`: **hai adapter nên đây là đường nối thật**); và **bộ dựng thư**. Hạn mức, làn, xoay vòng giữa Người ra đề, warm-up, thử lại, khôi phục việc kẹt đều **nằm bên trong**, người gọi không phải biết.
2. **Tránh vòng phụ thuộc [RV].** `identity` gọi `mail.enqueue`; nhưng worker của `mail` lại cần `identity` sinh mã lúc gửi (Q381) và dựng nội dung. Nếu `mail` nhập thẳng `auth_tokens` của `identity` thì phạm `architecture.test` A1; nếu `mail` gọi `identity` còn `identity` gọi `mail` thì thành vòng. Giải pháp: `mail` **định nghĩa** cổng `MessageBuilder` (cho mỗi loại thư: dựng nội dung từ mã), còn `identity` **cài đặt** và đăng ký (đảo phụ thuộc). Thành thật: cổng này hiện chỉ có **một** adapter (`identity`), nên là đường nối **để phá vòng phụ thuộc**, không phải để thay thế được; chấp nhận vì `mail` không biết gì về mã hay người dùng.
3. **`AuthLinks` (trong `identity`) là module sâu [RV].** Giao diện: `issue(người dùng, mục đích, {người tạo, lý do})` trả mã và hạn; `consume(mã, mục đích, mật khẩu mới)` trả **kết quả có kiểu**: `ok` | `expired(lúc nào)` | `used(lúc nào)` | `replaced` | `blocked(khóa/xóa)` | `unknown`. Mọi chi tiết (băm, so sánh thời gian hằng định, vô hiệu mã cũ, thu hồi phiên, quy tắc mật khẩu, nhật ký) nằm bên trong. Kết quả có kiểu **chính là thứ giao diện cần** để nêu rõ lý do và giờ liên quan (yêu cầu Q381). Điểm cần giữ: chỉ người **đang cầm mã đúng** mới thấy lý do chi tiết; mã không khớp bản ghi nào chỉ báo chung "không nhận ra".
4. **Hàm lập lịch thuần [RV].** Chọn thư gửi tiếp theo là một **hàm thuần** `planBatch(hàng đợi, số thư đã gửi 24 giờ qua, cấu hình, giờ hiện tại) → danh sách thư gửi ngay, giờ thức dậy kế`, không chạm cơ sở dữ liệu hay mạng, theo kiểu `packages/scoring`. Kiểm thử bằng bảng kịch bản (lớp 500 và 30; làn khẩn khi hàng loạt đầy; ngày warm-up thứ 1 đến 5; chạm trần) trả kết quả tức thì. Worker chỉ làm phần keo.
5. **Một chỗ duy nhất cho quyền (Q384).** Hàm kiểu `canManageAccountOf(người thao tác, người đích)` trong `identity` dùng cho sửa email, gửi lại, liên kết hỗ trợ; không rải điều kiện vào từng controller. Lúc Q384 chốt thì sửa đúng một chỗ.
6. **Dùng `Clock`** cho mọi hạn (7 ngày, 60 phút, 24 giờ, 60 giây): test dịch thời gian thay vì chờ.
7. **Kiểm thử qua giao diện nhỏ:** test của `mail` đi qua `enqueue` và `FakeTransport`; test của `AuthLinks` đi qua `issue` và `consume`; **không** test xuyên vào bảng.

(Tiêu chí nghiệm thu bổ sung từ mục 14, đánh số tiếp mục 13:)

15. **Liên kết của tài khoản bị Khóa hoặc bị Xóa [S4]** đều bị từ chối và trang nói rõ lý do; Khóa rồi Mở khóa thì liên kết còn hạn dùng lại được (hoặc phải gửi lại: chốt khi viết mã).
16. **Email của tài khoản có sẵn không bị ghi đè [S2]** khi dòng Excel khớp tài khoản đó; màn duyệt nói rõ "đã có tài khoản, giữ nguyên email, không gửi thư".
17. **`consume` trả đủ các kết quả có kiểu** (ok, hết hạn, đã dùng, bị thay, bị chặn, không nhận ra) và trang hiển thị tương ứng với giờ cụ thể.
18. **`planBatch` có bảng kịch bản** (lớp lớn cùng lớp nhỏ, làn khẩn, warm-up từng ngày, chạm trần) chạy tức thì, không cần cơ sở dữ liệu.
