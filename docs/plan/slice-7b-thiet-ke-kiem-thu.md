# PR 7b: thiết kế kiểm thử (hạ tầng gửi email), làm theo TDD

**Trạng thái: ĐÃ ĐƯỢC CHỦ DỰ ÁN DUYỆT (11/11/2026), toàn bộ S1–S8, quyết định a–h và danh sách hành vi.** Đã triển khai theo TDD (kết quả ở mục 10). Theo kỷ luật của skill `tdd` ("chỉ kiểm thử ở các điểm tiếp xúc đã thống nhất trước"), tài liệu này nêu **các điểm tiếp xúc (seam)**, **từng hành vi cần chứng minh**, **thứ tự làm theo lát dọc**, và **cách tự kiểm chất lượng bài kiểm thử**. Chủ dự án duyệt xong mới bắt đầu vòng đỏ rồi xanh.

Căn cứ: [ADR-0009](../adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md); [slice-7.md](./slice-7.md) (Q372 đến Q384); [slice-7-phuong-an-b-email.md](./slice-7-phuong-an-b-email.md) (mục 5 hạ tầng gửi email, mục 13 và 14 tiêu chí nghiệm thu và hình dạng module). Từ vựng module (module, interface, seam, adapter, độ sâu): skill `codebase-design`.

## 1. Phạm vi PR 7b

**Trong 7b:** module `mail` (bảng `email_outbox`; giao diện `enqueue`; hàm thuần `planBatch`; job gửi trong worker BullMQ hiện có; hai adapter vận chuyển `SmtpTransport` và `FakeTransport`; khung mẫu thư và sáu mẫu thư; cổng `MessageBuilder`); cấu hình `SMTP_*`, `EMAIL_*`, hạn mức; chế độ "không gửi" cho môi trường diễn tập; lệnh gửi thử; tài liệu vận hành.

**Ngoài 7b (làm ở PR sau, nhưng 7b phải chừa chỗ):**
| Việc | PR | Cách 7b chừa chỗ |
|---|---|---|
| `auth_tokens`, `AuthLinks`, sinh mã lúc gửi, trang liên kết | 7c | cổng `MessageBuilder` (7b định nghĩa, 7c cài đặt); 7b dùng **bản dựng giả** có ghi lại "mã đã sinh lúc nào" |
| Quyền Q384 (`canManageAccountOf`), gửi lại, sửa email, liên kết hỗ trợ | 7c, 7d | `enqueue` nhận `requesterId` (cho xoay vòng) và `lane` |
| Màn hình, bảng theo dõi, chuông 70 % | 7d | `MailService` có truy vấn chỉ đọc cho hạn mức và hàng đợi (đã kiểm thử), chưa có giao diện |
| Gửi thật qua Gmail | trước production | lệnh gửi thử (thủ công); không đưa vào CI |

## 2. Nguyên tắc áp dụng từ skill `tdd`

1. **Kiểm thử hành vi qua giao diện công khai**, không kiểm thử hàm riêng, không truy vấn bảng để "kiểm xuyên". Test đọc `email_outbox` chỉ khi **chính bảng đó là hành vi** (ví dụ "không chứa mã"), và khi đó đọc qua một **truy vấn chỉ đọc có tên** của `MailService`, hoặc qua SQL trong bài kiểm bất biến bảo mật (đã nêu rõ).
2. **Chỉ mock ở biên hệ thống:** vận chuyển SMTP (adapter), đồng hồ (`Clock` có sẵn), Redis không cần mock (đã có test dùng Redis thật). **Không mock** `MailService` nội bộ, hàng đợi trong của chính nó, `planBatch`.
3. **Lát dọc, không cắt ngang:** mỗi lần **một** bài kiểm thử, thấy **đỏ vì đúng lý do**, viết **vừa đủ** mã cho xanh, rồi bài kế. Không viết hết bài kiểm thử rồi mới viết mã.
4. **Đỏ trước xanh.** Mỗi bài phải được thấy **thất bại** trước (và thất bại vì lý do mong muốn, không phải lỗi biên dịch).
5. **Tránh bài kiểm thử "đúng theo định nghĩa"** (tautological): giá trị mong đợi lấy từ **nguồn độc lập** (số trong ADR, bảng kịch bản, ví dụ tính tay), không tính lại bằng chính công thức của mã.
6. **Tái cấu trúc không thuộc vòng lặp**; làm ở bước rà soát, bài kiểm thử vẫn xanh.
7. **Thời gian là một phần của kết quả** (AGENTS.md "Hiệu năng"): bài nào quá 1 giây thì xem lại; có bài đo thời gian riêng (mục 6).

## 3. Các điểm tiếp xúc (seam) cần chủ dự án duyệt

Mỗi điểm: **kiểm gì**, **bắt được gì**, **bỏ sót gì** (và nơi khác bù).

| # | Điểm tiếp xúc | Cách kiểm | Bắt được | Bỏ sót (nơi bù) |
|---|---|---|---|---|
| **S1** | `planBatch(hàng đợi, thư đã gửi 24 giờ, cấu hình, giờ)` → thư kế tiếp và giờ thức dậy: **hàm thuần** | bài đơn vị chạy bảng kịch bản, tức thì, không cơ sở dữ liệu | sai logic trần 400 trượt, làn khẩn dự trữ 100, trần hàng loạt 300, warm-up, xoay vòng giữa Người ra đề, khoảng cách 6 giây | khóa đồng thời, thứ tự thật trong PostgreSQL (S2) |
| **S2** | `MailService.enqueue` + job gửi trong worker, với **PostgreSQL thật, `FakeTransport`, `FakeClock`, `InlineJobQueue`** | bài tích hợp (cùng kiểu `apps/api/test/*.int.test.ts`) | hàng đợi bền, thử lại và lùi, khôi phục việc kẹt, trần trượt tính từ cơ sở dữ liệu, không mất thư, hai worker không gửi trùng, chế độ không gửi, thư tới địa chỉ bị từ chối cứng | SMTP thật (S4, S8) |
| **S3** | `renderMail(loại, ngữ cảnh)` + dựng MIME: **thư dựng thật** | bài đơn vị phân tích MIME của thư đã dựng (không gửi) | đầu mục chuẩn, `multipart/alternative`, UTF-8, một liên kết, không ảnh, giờ hết hạn theo giờ Việt Nam, sáu loại thư (tiêu chí 13, 14) | thư có vào Inbox hay Spam thật (kiểm tay: xem thư gốc, SPF, DKIM) |
| **S4** | `SmtpTransport` với **máy chủ SMTP giả cục bộ** (thư viện kiểm thử, cổng ngẫu nhiên) | bài tích hợp nhỏ | STARTTLS bắt buộc, xác thực, phân loại mã 4xx (tạm thời), 5xx (vĩnh viễn), 535 (lỗi cấu hình), hết thời gian chờ, thư gửi đi đúng nội dung | hành vi riêng của Gmail (S8) |
| **S5** | `loadEnv` phần SMTP và hạn mức | bài đơn vị | thiếu hoặc thừa `SMTP_*`, Gmail mà `EMAIL_FROM` khác `SMTP_USERNAME`, giá trị hạn mức hợp lệ, mặc định | cấu hình thật trên máy (S7) |
| **S6** | **Bất biến bảo mật** quét log, bảng và lỗi trong toàn bộ luồng của S2 | bài tích hợp: bắt `pino`, đọc `email_outbox`, đọc `last_error` | không mã, không `SMTP_PASSWORD`, không địa chỉ đầy đủ trong log mức thường, lỗi đã che bí mật | rò rỉ ở nơi test không đi qua |
| **S7** | **Môi trường:** pod `drill-exam`, `dr-exam`, `restore-test` không gửi thư thật; `prod-preflight` kiểm SMTP chỉ ở prod; lệnh gửi thử | bài shell (cùng kiểu `test-backup-drill.sh`) và bài đơn vị cho lệnh | thư thật gửi từ pod thử, preflight báo đúng | gửi thật tới hộp thư thật (thủ công, trước production) |
| **S8** | **Gửi thử thật** (không thuộc CI) | lệnh `mail:test <địa chỉ>` chạy tay với Gmail thật | cấu hình App Password, cổng 587, tên hiển thị, SPF, DKIM, DMARC khi xem thư gốc | không tự động hóa được |

**Không kiểm thử trực tiếp** (kiểm gián tiếp qua hành vi): công thức lùi thời gian, bộ tạo `Message-ID`, truy vấn "nhận việc" (`FOR UPDATE SKIP LOCKED`), cách chuyển trạng thái nội bộ. Nếu một trong số đó sai, bài hành vi ở trên phải đỏ.

## 4. Quyết định thiết kế nhỏ cần duyệt (chốt cùng các điểm tiếp xúc)

| # | Câu hỏi | Đề xuất |
|---|---|---|
| a | **Chế độ "không gửi"** (không có `SMTP_*`: pod thử, dev, test): `enqueue` có thành công không? | **Có**, để luồng nghiệp vụ không gãy; worker đánh dấu thư **"bỏ qua (chưa cấu hình gửi thư)"**, không thử lại, không tính vào hạn mức; log mức cảnh báo một lần. `prod-preflight` báo ✗ nếu prod ở chế độ này |
| b | **Giao đúng một lần?** SMTP không có tính giao đúng một lần. Nếu worker chết **sau khi** máy chủ SMTP nhận thư nhưng **trước khi** ghi "đã gửi" thì sao? | **Ít nhất một lần, không bao giờ mất**; trong trường hợp hiếm đó người dùng có thể nhận **hai thư**, thư sau dùng được và thư trước đã bị thay (Q381). Bài kiểm thử chứng minh "không mất, nhiều nhất hai bản" |
| c | **Lỗi xác thực SMTP (535, mật khẩu ứng dụng sai hoặc bị thu hồi)** | **Không** đánh dấu từng người nhận là lỗi vĩnh viễn (lỗi không phải do người nhận). **Ngắt mạch**: tạm dừng gửi, giữ nguyên hàng đợi, báo mức lỗi trong log và (ở 7d) chuông Quản trị viên; thử lại sau 15 phút |
| d | **Warm-up**: tính ngày thứ mấy thế nào | tính theo **ngày lịch giờ Việt Nam kể từ ngày gửi thành công đầu tiên của hệ thống** (lấy từ `email_outbox`); trần hàng loạt 50, 100, 150, 200, 300 cho ngày 1 đến 5, từ ngày 6 là 300 (cấu hình được, Q382) |
| e | **Thêm thư viện** | `nodemailer` (vận chuyển SMTP); hai thư viện **chỉ cho kiểm thử**: một máy chủ SMTP giả (`smtp-server`) và một bộ phân tích MIME (`mailparser`). Cần cập nhật `pnpm-lock.yaml`; kiểm giấy phép và `pnpm audit` |
| f | **Dev**: thấy được liên kết kích hoạt khi thử bằng tay thế nào (hàng đợi không lưu thư, bộ gửi giả chỉ giữ trong bộ nhớ) | thêm **`ConsoleTransport`** (adapter thứ ba, **chỉ khi `NODE_ENV` khác `production`**): in thư ra bảng điều khiển của worker; bài kiểm chứng minh production **không bao giờ** chọn nó |
| g | **Nơi đặt `planBatch`** | `apps/api/src/modules/mail/plan-batch.ts` kèm `plan-batch.test.ts` (dự án `unit` của vitest, chạy tức thì), không tách gói riêng |
| h | **Gửi lại, giới hạn theo sinh viên** (1 lần/24 giờ, tự gửi 3 lần/ngày) nằm ở đâu | ở `mail` dưới dạng **khóa chống trùng** `(người nhận, loại thư)` với thời gian chờ do người gọi truyền vào (7b định nghĩa cơ chế, 7c/7d truyền quy tắc); bài kiểm thử cơ chế ở 7b |

## 5. Danh sách hành vi và thứ tự làm (lát dọc)

Quy ước: mỗi dòng là **một bài kiểm thử** có tên là một câu hành vi tiếng Việt. Làm lần lượt, mỗi bài đỏ rồi xanh. Cột "TC" là tiêu chí nghiệm thu (mục 13, 14 của tài liệu thiết kế) mà bài chứng minh.

### Lát 1 (đường xuyên suốt đầu tiên, "tracer bullet")
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| M-01 | xếp một thư rồi chạy job: `FakeTransport` nhận đúng một thư gửi đúng người, với tiêu đề và nội dung dựng từ bản dựng giả; thư ở trạng thái **đã gửi** | S2 | 4 |

(Bài này buộc có đủ: bảng `email_outbox` và migration, `MailService.enqueue`, job đăng ký trong worker, cổng `MailTransport`, cổng `MessageBuilder`, nối module. Mọi bài sau mỏng hơn.)

### Lát 2: hàng đợi không chứa mã (Q381)
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| M-02 | sau khi xếp thư và **trước khi** chạy job, bản dựng giả **chưa bị gọi** và hàng đợi **không chứa chuỗi mã nào** | S2, S6 | 3 |
| M-03 | mã chỉ sinh **lúc gửi**: bản dựng giả ghi nhận được gọi đúng một lần trong job | S2 | 3 |
| M-04 | gửi lỗi tạm thời rồi thử lại thì bản dựng được gọi **lần nữa**, mã mới khác mã cũ, và bản dựng giả nhận tín hiệu "vô hiệu mã cũ" | S2 | 3 |

### Lát 3: bảng lập lịch thuần (`planBatch`), mỗi dòng một kịch bản, kết quả tức thì
| ID | Kịch bản (giờ cố định; số thư đã gửi trong 24 giờ trượt) | Mong đợi (từ ADR, không tính bằng chính công thức) | TC |
|---|---|---|---|
| P-01 | hàng đợi rỗng | không gửi, không thức dậy | 4 |
| P-02 | 1 thư hàng loạt, đã gửi 0 | gửi ngay thư đó | 4 |
| P-03 | đã gửi 400 (tổng) | không gửi thư nào; giờ thức dậy = lúc thư **cũ nhất** trong cửa sổ trượt hết 24 giờ | 4, 9 |
| P-04 | đã gửi 300 thư hàng loạt, còn thư hàng loạt và thư khẩn đang chờ | thư hàng loạt **bị hoãn** (đã đủ 300), thư **khẩn vẫn được gửi** (còn 100 dự trữ) | 9 |
| P-05 | đã gửi 399 tổng, có thư khẩn | gửi thư khẩn (tổng thành 400) | 9 |
| P-06 | đã gửi 400 tổng, có thư khẩn | **không** gửi (trần là trần, kể cả thư khẩn) | 9 |
| P-07 | 500 thư của người A và 30 thư của người B, cùng xếp, hàng loạt, trần 300 | trong 300 thư đầu có **đủ 30 thư của B** (xoay vòng: lần lượt A, B, A, B...), không phải 300 thư của A | 9 |
| P-08 | thư của A xếp trước thư của B nhưng cùng lượt xoay vòng | thứ tự trong cùng một người là **xếp trước gửi trước** | 9 |
| P-09 | thư gửi gần nhất cách đây 3 giây (khoảng cách tối thiểu 6 giây) | chưa gửi, thức dậy sau đúng 3 giây nữa | 4 |
| P-10 | ngày warm-up thứ 1 (trần hàng loạt 50), đã gửi 50 hàng loạt | hoãn hàng loạt; thư khẩn vẫn gửi | 13 |
| P-11 | ngày warm-up thứ 3 (150), đã gửi 120 | còn gửi được | 13 |
| P-12 | từ ngày 6 trở đi (300) | trần hàng loạt là 300 | 13 |
| P-13 | thư có `notBefore` (đang chờ thử lại) ở tương lai | không chọn; giờ thức dậy là `notBefore` sớm nhất nếu không có thư nào khác | 4 |
| P-14 | thư bị hoãn vì trần có tuổi quá hạn 48 giờ | vẫn **không** bị bỏ (chỉ hoãn), không đánh dấu lỗi | 4 |
| P-15 | 10.000 thư trong hàng đợi | kết quả trong **dưới 50 ms** (kiểm hiệu năng hàm thuần) | hiệu năng |

### Lát 4: hạn mức trượt tính từ cơ sở dữ liệu, thời gian giả
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| M-05 | xếp 450 thư khẩn, chạy job nhiều vòng với `FakeClock`: đúng **400** thư đi trong 24 giờ đầu, 50 thư còn **chờ (không lỗi)** | S2 | 4, 9 |
| M-06 | tua 24 giờ + 1 giây: 50 thư còn lại được gửi; không thư nào bị mất hay đánh dấu lỗi | S2 | 4 |
| M-07 | khởi động lại (xây lại ứng dụng test trên cùng cơ sở dữ liệu): hạn mức **đã dùng** vẫn được tính (không đếm lại từ 0 vì Redis hay bộ nhớ trống) | S2 | 4 (ADR-0002) |
| M-08 | hai thư gửi liền nhau cách nhau đúng 6 giây trên `FakeClock` | S2 | 4 |

### Lát 5: công bằng giữa nhiều Người ra đề (tích hợp)
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| M-09 | A xếp 500 thư kích hoạt, B xếp 30 thư kích hoạt sau đó; trong **ngày đầu** thư của B **xong hết** | S2 | 9 |
| M-10 | khi hàng loạt đã đầy 300, thư khẩn (quên mật khẩu) vẫn đi **ngay** | S2 | 9 |
| M-11 | cơ chế chống trùng: xếp lại cùng `(người nhận, loại)` trong thời gian chờ bị từ chối với kết quả có kiểu và **chỉ nêu giờ được phép gửi lại** | S2 | 9 |

### Lát 6: lỗi, thử lại, lỗi vĩnh viễn, ngắt mạch
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| M-12 | lỗi tạm thời (mã 4xx): thử lại sau 60 giây, rồi 120, 240, 480 giây (lùi tăng dần, trần 1 giờ); tối đa **5 lần**, sau đó **thất bại** kèm lý do | S2 | 4 |
| M-13 | lỗi vĩnh viễn của người nhận (mã 5xx như 550): **không** thử lại, đánh dấu **bị từ chối** để giao diện báo (Q382), thư khác vẫn đi | S2 | 4 |
| M-14 | địa chỉ đã bị từ chối cứng trước đó thì thư sau tới địa chỉ đó **không gửi** (không đốt hạn mức) | S2 | 13 |
| M-15 | lỗi xác thực (535): **ngắt mạch**, không đánh dấu người nhận nào là lỗi, hàng đợi giữ nguyên, thử lại sau 15 phút trên `FakeClock`; khi hết lỗi thì tiếp tục và **không mất thư** | S2 | 4 |
| M-16 | lỗi giữa chừng không làm lộ bí mật: `last_error` không chứa mật khẩu SMTP dù máy chủ giả trả thông báo có chứa nó | S6 | 3 |

### Lát 7: bền vững và đồng thời
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| M-17 | job bị bỏ giữa chừng (worker chết khi đang ở "đang gửi" quá ngưỡng 10 phút): thư được **nhận lại** và gửi; **không mất** | S2 | 4 |
| M-18 | cùng khoảng đó nếu máy chủ giả đã nhận thư trước khi chết: tổng số bản tới hộp thư **không quá 2** (ít nhất một lần, quyết định b) | S2 | 4 |
| M-19 | hai tiến trình xử lý song song (hai lần `drain` đồng thời): mỗi thư **đúng một** tiến trình nhận, không gửi trùng | S2 | 4 |
| M-20 | `enqueue` **không chờ** việc gửi: với vận chuyển bị treo mãi, `enqueue` vẫn hoàn tất tức thì (phản hồi của trang "Quên mật khẩu" không bị chặn, Q383) | S2 | hiệu năng |

### Lát 8: chế độ không gửi và cấu hình
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| C-01 | không có `SMTP_*`: `enqueue` thành công, thư được đánh dấu **bỏ qua (chưa cấu hình gửi thư)**, `FakeTransport` không nhận gì, không tính hạn mức | S2 | 11 |
| C-02 | `SMTP_*` có một phần (thiếu mật khẩu): khởi động **thất bại** nêu rõ biến thiếu | S5 | 11 |
| C-03 | máy chủ Gmail mà `EMAIL_FROM` khác `SMTP_USERNAME`: khởi động thất bại nêu rõ | S5 | 13 |
| C-04 | `NODE_ENV=production` không bao giờ chọn `ConsoleTransport` (kể cả khi thiếu `SMTP_*`: dùng chế độ không gửi, không in thư) | S5 | 3 |
| C-05 | tên hệ thống và dòng liên hệ hỗ trợ lấy từ cấu hình (`api.env`), có mặc định | S5 | 14 |

### Lát 9: nội dung và MIME của thư (S3)
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| T-01..T-06 | với **từng loại** trong sáu loại (kích hoạt, Lời mời, đặt lại mật khẩu, mật khẩu đã đổi, xác thực email, email đã đổi): thư có `From`, `Reply-To`, `Date`, `Message-ID` có tên miền người gửi, `MIME-Version`, `Auto-Submitted: auto-generated`; `multipart/alternative` gồm văn bản thuần và HTML **cùng nội dung**; UTF-8; tiêu đề tiếng Việt mã hóa đúng, có tên hệ thống, không viết hoa toàn bộ, không dấu chấm than | S3 | 13 |
| T-07 | mỗi thư có **đúng một** liên kết, chữ hiển thị trùng đích, thuộc tên miền cấu hình; **không** ảnh, tệp đính kèm, điểm theo dõi, URL rút gọn | S3 | 13 |
| T-08 | mỗi thư chứa **họ tên người nhận** và **giờ hết hạn cụ thể theo giờ Việt Nam** (ví dụ "14:35 ngày 18/11/2026"); **không** có cụm "còn N ngày" | S3 | 13, 14 |
| T-09 | thư "mật khẩu đã đổi" ghi giờ, trình duyệt, hệ điều hành, **không có IP**; **không thư nào** chứa mật khẩu | S3 | 3, 14 |
| T-10 | hai thư cùng loại cho hai người khác nhau **không giống hệt nhau** (nội dung riêng, tránh thư hàng loạt giống hệt) | S3 | 13 |
| T-11 | không có `List-Unsubscribe` (thư giao dịch, quyết định Q382) | S3 | 13 |

### Lát 10: vận chuyển SMTP thật với máy chủ giả (S4)
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| V-01 | gửi một thư tới máy chủ SMTP giả qua `SmtpTransport`: máy chủ nhận đúng người gửi, người nhận, đầu mục và hai phần nội dung | S4 | 13 |
| V-02 | máy chủ không hỗ trợ STARTTLS: **từ chối gửi**, không gửi thông tin xác thực dạng thường | S4 | 3 |
| V-03 | mã 421 và 451 được phân loại **tạm thời**; mã 550 và 553 **vĩnh viễn (người nhận)**; mã 535 **lỗi cấu hình (ngắt mạch)** | S4 | 4 |
| V-04 | máy chủ không phản hồi: kết thúc đúng trong thời gian `SMTP_TIMEOUT_SECONDS` (đặt 1 giây khi thử), phân loại tạm thời | S4 | 4 |

### Lát 11: bất biến bảo mật tổng hợp (S6)
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| B-01 | chạy trọn một luồng (xếp, gửi, lỗi, thử lại, thành công) rồi **quét toàn bộ log của tiến trình test**: không chứa mã, không chứa `SMTP_PASSWORD`, không chứa địa chỉ email đầy đủ ở mức log thường (chỉ dạng che `l***@x.vn`) | S6 | 3 |
| B-02 | dump `email_outbox` sau luồng trên: **không cột nào** chứa chuỗi giống mã (32 byte base64url) hay mật khẩu | S6 | 3 |

### Lát 12: lệnh gửi thử và môi trường (S7)
| ID | Hành vi | Điểm | TC |
|---|---|---|---|
| L-01 | `mail:test <địa chỉ>` dựng một thư thử rõ ràng ("Thư thử của hệ thống"), gửi qua vận chuyển đã cấu hình, in kết quả **không in** thông tin xác thực; địa chỉ sai định dạng bị từ chối | S7 | 11 |
| L-02 | `mail:test` ở chế độ không gửi nói rõ "chưa cấu hình gửi thư", thoát khác 0 | S7 | 11 |
| E-01 | `exam-ctl.sh`: `api.env` do `create_secrets` sinh cho stage `drill`, `dr` **không có** `SMTP_*` (kiểm bằng bài shell kiểu drill) | S7 | 11 |
| E-02 | `prod-preflight`: stage `prod` thiếu `SMTP_*` thì **✗**, hàng đợi thư tồn quá ngưỡng thì **✗**; stage khác bỏ qua | S7 | 11 |

### Lát 13: hiệu năng
| ID | Hành vi | Ngân sách | Điểm |
|---|---|---|---|
| H-01 | `enqueue` một lô 500 thư (duyệt lớp lớn) trong **một** giao dịch | dưới 300 ms | S2 |
| H-02 | nhận việc kế tiếp khi hàng đợi có 10.000 dòng (có chỉ mục) | dưới 20 ms | S2 |
| H-03 | một vòng xử lý (chọn, dựng, gửi bằng bộ gửi giả, ghi trạng thái) | dưới 50 ms | S2 |
| P-15 | `planBatch` với 10.000 thư | dưới 50 ms | S1 |

## 6. Hạ tầng kiểm thử cần dựng (thuộc 7b)

| Thành phần | Việc |
|---|---|
| `FakeTransport` | ghi lại mọi thư gửi; **lập trình được** phản hồi theo địa chỉ: tạm thời N lần rồi thành công, vĩnh viễn, lỗi xác thực, treo mãi; cho phép "máy chủ nhận thư rồi mới chết" (cho M-18) |
| `FakeMessageBuilder` | trả nội dung theo loại; ghi lại **mỗi lần được gọi và mã giả nó "sinh"**, và tín hiệu vô hiệu mã cũ (cho M-02 đến M-04) |
| `FakeClock` (có sẵn) | tua thời gian cho hạn mức, lùi thời gian, khoảng cách 6 giây, ngắt mạch |
| `InlineJobQueue` (có sẵn) | chạy job tại chỗ, `discard()` để giả lập job mất, chạy lại để giả lập giao lại |
| `createTestApp` | cấu hình hạn mức nhỏ (qua env) khi cần chạy nhanh, thêm tùy chọn chọn vận chuyển giả |
| `captureLogs` | gom log `pino` của test để quét (B-01) |
| Máy chủ SMTP giả cục bộ | dựng trong `beforeAll` của bài V-xx, cổng ngẫu nhiên, hủy sau bài |

## 7. Cách tự kiểm chất lượng bài kiểm thử (làm trước khi gọi là xong)

1. **Đỏ đúng lý do:** ghi lại thông báo lỗi của từng bài lúc đỏ; không chấp nhận đỏ vì lỗi biên dịch hay thiếu import.
2. **Kiểm thử đột biến thủ công** (cố ý phá mã, mỗi lần ít nhất **một** bài phải đỏ rồi khôi phục): bỏ trần 400; bỏ làn dự trữ khẩn; bỏ xoay vòng; ghi mã vào `email_outbox`; bỏ vô hiệu mã cũ khi thử lại; bỏ yêu cầu STARTTLS; đếm hạn mức từ bộ nhớ thay vì cơ sở dữ liệu; đánh dấu người nhận lỗi vĩnh viễn khi gặp 535; bỏ khóa nhận việc (`SKIP LOCKED`). Ghi kết quả vào ghi chú triển khai.
3. **Không có bài "đúng theo định nghĩa":** rà từng bài xem giá trị mong đợi có đến từ ADR hoặc ví dụ tính tay.
4. **Không phụ thuộc thứ tự, ngày giờ máy, hay mạng ngoài:** mọi thời gian qua `FakeClock`; không bài nào gọi Internet.
5. **Tốc độ:** toàn bộ bài của 7b chạy trong dưới 60 giây trên máy này; bài đơn vị `planBatch` dưới 1 giây.
6. **Chạy lặp 5 lần liên tiếp** các bài đồng thời (M-19) để chắc không chập chờn.

## 8. Định nghĩa "xong" cho PR 7b

- Mọi bài ở mục 5 xanh; mục 7 đã làm và ghi kết quả; lint, typecheck, `architecture.test` (A1) sạch; toàn bộ bộ kiểm thử hiện có (đơn vị và tích hợp) vẫn xanh, không bài nào bị sửa hay xóa để cho qua.
- `docs/data-model.md` (bảng `email_outbox`), `docs/architecture.md` mục 6 (đã gửi email), `docs/ops` (cấu hình SMTP, hạn mức, lệnh gửi thử, xử lý thư lỗi, danh sách việc chủ dự án làm trước production ở mục 9 của tài liệu thiết kế), `GLOSSARY.md` nếu có thuật ngữ mới: cập nhật **trong cùng PR**.
- Chưa bật gửi thư ở production (chỉ khi chủ dự án làm xong các việc chuẩn bị Gmail ở mục 9 và chạy `mail:test` thật).

## 9. Điều cần chủ dự án quyết ngay

1. **Duyệt tám điểm tiếp xúc S1 đến S8** (mục 3).
2. **Duyệt tám quyết định nhỏ a đến h** (mục 4), đặc biệt: **a** (chế độ không gửi), **b** (ít nhất một lần, có thể trùng hai thư trong trường hợp hiếm), **c** (ngắt mạch khi sai mật khẩu SMTP), **e** (thêm ba thư viện).
3. **Duyệt danh sách hành vi và thứ tự lát** (mục 5): có hành vi nào thiếu, thừa hoặc nên đổi ưu tiên không.

## 10. Kết quả triển khai (11/11/2026)

Làm đúng quy trình: mỗi bài kiểm thử được viết trước, thấy **đỏ vì đúng lý do** (hành vi thiếu, không phải lỗi biên dịch), rồi viết mã vừa đủ cho xanh; bản giả và hạ tầng test dựng khi bài đầu tiên cần tới. Các bài mà mã sẵn có đã thỏa ngay (M-02, M-03, M-09, M-10, M-18, M-20, B-01, B-02...) được ghi nhận là bài "đặc trưng hóa" và đều đã qua kiểm thử đột biến (mục 10.3) để chắc chúng thật sự bắt được lỗi.

### 10.1 Số bài

| Nhóm | Tệp | Bài |
|---|---|---|
| Hàm lập lịch thuần `planBatch` (P-01 đến P-16) | `src/modules/mail/plan-batch.test.ts` | 22 |
| Cấu hình, chọn adapter (C-02 đến C-06) | `src/modules/mail/mail.config.test.ts` | 12 |
| Mẫu thư và MIME (T-01 đến T-12) | `src/modules/mail/mail-templates.test.ts` | 41 |
| `SmtpTransport` với máy chủ SMTP giả (V-01 đến V-04) | `src/modules/mail/smtp-transport.test.ts` | 11 |
| `ConsoleTransport` | `src/modules/mail/console-transport.test.ts` | 1 |
| Hàng đợi (tích hợp): M-01 đến M-21b, C-01, B-01, B-02, L-01, L-02, H-01 đến H-03 | `test/mail-outbox.int.test.ts` | 35 |
| Lệnh `mail-test` (CLI) | `test/cli.int.test.ts` | 4 |
| Vận hành: chốt chặn pod thử, mục Thư của preflight (E-01, E-02) | `infra/scripts/test-mail-ops.sh` (`make -C infra mail-ops-test`) | 15 |

Toàn bộ bộ kiểm thử tích hợp của dự án (có cả 7b): **941 đạt, 1 bỏ qua (có sẵn từ trước), 632 giây**. Bộ đơn vị đầy đủ xanh. Lint (`biome check .`), `tsc --noEmit` và `architecture.test.ts` (A1) sạch.

### 10.2 Điều chỉnh so với kế hoạch (phát hiện khi làm, mỗi mục có bài kiểm thử)

| # | Điều chỉnh | Lý do |
|---|---|---|
| i | **`MessageBuilder` trả dữ liệu cho mẫu thư** (họ tên, liên kết, hạn, người yêu cầu...), `mail` tự dựng thư; không còn trả thư dựng sẵn như mục 14.2 của tài liệu thiết kế email | mẫu thư và MIME nằm đúng một chỗ; `identity` không phải biết cấu hình gửi thư |
| ii | **Hai loại thư thông báo** (`password_changed`, `email_changed_notice`) **không có liên kết nào**; T-07 ("đúng một liên kết") áp dụng cho bốn loại có liên kết | thư thông báo mà có liên kết thì giống thư lừa đảo; muốn làm gì thì vào hệ thống bằng đường quen |
| iii | Lỗi `auth` (sai đăng nhập, thiếu STARTTLS, **Gmail báo hết hạn mức ngày `550 5.4.5`**) là lỗi phía hệ thống: **ngắt mạch 15 phút, không đánh dấu người nhận nào lỗi** | `550 5.4.5` nếu coi như "địa chỉ bị từ chối" thì sẽ đánh dấu oan cả lớp |
| iv | Lỗi lạ (ví dụ bộ dựng thư hỏng) coi như lỗi tạm thời: thử lại tối đa 5 lần | không lặp vô hạn |
| v | `sent_at` ghi **giờ nhận việc**; thư `sending` cũng tính vào hạn mức và khoảng cách | đo đúng khoảng cách giữa hai lần nhận việc, không lệ thuộc thời gian gửi |
| vi | Xếp thư **không thất bại khi Redis hỏng** (thư đã nằm bền trong cơ sở dữ liệu, cron mỗi phút gửi nốt) | trang Quên mật khẩu không được hỏng vì Redis |
| vii | **Mỗi lần chạy job gửi thư tối đa 50 giây (đồng hồ), mỗi tiến trình chỉ một lần chạy cùng lúc, cờ tự hết hạn sau 5 phút**; hết hạn mà còn thư thì xếp lần chạy kế vào cuối hàng đợi | phát hiện khi rà thiết kế: gửi 300 thư cách nhau 6 giây là 30 phút trong một job; worker chỉ có 2 chỗ nên có thể làm job tự nộp bài và chấm tự động phải chờ giữa Phiên thi (M-21, M-21b) |
| viii | **`prod-preflight` mục Thư: thiếu SMTP chỉ ⚠ khi chưa thư nào bị bỏ qua; ✗ khi đã có thư bị bỏ qua** (khác E-02 gốc luôn ✗) | để production hiện tại (chưa dùng email) không bị báo KHÔNG ĐẠT vô cớ; tới 7d có thể đổi thành ✗ cố định |
| ix | M-05 đến M-08 và M-09 đến M-11 chạy với **hạn mức thu nhỏ 10 lần** (trần 40, hàng loạt 30) | ở 400 thư mỗi bài mất 3 đến 7 giây (quá ngưỡng 1 giây); các con số thật 400/300 do `planBatch` (bảng kịch bản viết thẳng số) và C-06 (mặc định cấu hình) bảo đảm |
| x | Thêm bài ngoài kế hoạch: M-12b (lỗi lạ), M-19b (khóa chọn thư), M-20b (Redis hỏng), M-21, M-21b, P-16 (thư khẩn đi trước), mục chống chèn đầu mục thư và thoát HTML (T-12), STARTTLS thiếu và quota Gmail (V-02, V-03) | do kiểm thử đột biến và rà thiết kế phát hiện thiếu |
| xi | **Tên hiển thị mặc định** là "Hệ thống kiểm tra đánh giá trực tuyến" (Q382) | khớp tài liệu thiết kế |

### 10.3 Kiểm thử đột biến (mục 7.2)

Cố ý phá mã theo 42 cách, mỗi lần chạy lại bộ bài liên quan; đột biến "bị bắt" khi có ít nhất một bài đỏ. Tập lệnh nằm ngoài kho (thư mục tạm của phiên).

**Kết quả: 40 bị bắt, 2 đột biến tương đương (không thể bắt vì mã dư).** Phép thử tìm ra **5 lỗ hổng của chính bộ bài** và đã vá:

| Đột biến sống sót lần đầu | Lỗ hổng của bài | Cách vá |
|---|---|---|
| thêm `List-Unsubscribe` | T-11 vô nghĩa: `mailparser` gom mọi đầu mục `List-*` vào khóa `list` nên `headers.has('list-unsubscribe')` luôn sai | kiểm trên văn bản MIME gốc |
| thư khẩn không được ưu tiên hơn hàng loạt | không bài nào có cả thư khẩn lẫn thư hàng loạt cùng đủ điều kiện | thêm P-16 |
| chống trùng không phân biệt chữ hoa thường | M-11 chỉ thử cùng chữ hoa thường | thử `SV@Example.COM` |
| bỏ khóa tư vấn chọn thư | điều kiện `status = 'pending'` che mất; khóa còn cần cho cuộc đua thư khẩn đến chen giữa | M-19b giữ khóa từ ngoài, `dispatch` phải chờ |
| V-02 (STARTTLS) xanh nhầm | máy chủ giả chỉ giấu lời quảng cáo STARTTLS nhưng vẫn nhận lệnh | `disabledCommands: ['STARTTLS']` |

Hai đột biến tương đương: bộ lọc cửa sổ 24 giờ trong `planBatch` (cách tính "giờ có chỗ" đã tự bỏ qua thư cũ, bộ lọc chỉ để nhanh) và `oneLine` thứ hai cho tiêu đề (đã làm ở đầu vào).

### 10.4 Số đo thời gian

| Thao tác | Số đo | Ngân sách |
|---|---|---|
| Xếp một lô 500 thư trong một giao dịch (H-01) | khoảng 160 ms | 300 ms |
| Một vòng xử lý với hàng đợi 10.000 thư (chọn, dựng, gửi, ghi; H-02, H-03) | khoảng 19 ms | 50 ms |
| `planBatch` với 10.000 thư trong hàng đợi (P-15) | dưới 50 ms (bài kiểm) | 50 ms |
| Mọi bài của `mail-outbox.int.test.ts` | từng bài dưới 0,7 giây | 1 giây |

### 10.5 Chưa làm và việc kế

- **Chưa kiểm được:** gửi qua **Gmail thật** (chỉ kiểm tay bằng `make -C infra prod-mail-test`, xem [ops/gui-thu.md](../ops/gui-thu.md) mục 5 và 7).
- **Cảnh báo `pnpm audit --prod` (1 mức trung bình: `uuid` qua `exceljs`) có sẵn từ trước**, không do ba thư viện mới (`nodemailer` MIT-0; dev: `mailparser`, `smtp-server`).
- Mỗi lần `enqueue` lẻ xếp thêm một job kích; xếp lô dùng `enqueueMany` (một job). Cờ một lần chạy mỗi tiến trình làm các job kích thừa trả về ngay.
- PR 7c: `AuthLinks` (`auth_tokens`, sinh mã, `consume` kết quả có kiểu), `MessageBuilder` thật, trang liên kết. PR 7d: màn hình, bảng theo dõi, chuông 70 %, quyền Q384, gửi lại. Khi 7d xong, đổi mục Thư của preflight thành ✗ cố định khi thiếu SMTP.
