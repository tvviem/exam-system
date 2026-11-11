# Gửi thư (email) của hệ thống: cấu hình, kiểm tra và xử lý sự cố

Dành cho người vận hành (chủ dự án). Thiết kế: [ADR-0009](../adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md), [plan/slice-7-phuong-an-b-email.md](../plan/slice-7-phuong-an-b-email.md) mục 5 và 9. Bài kiểm thử và kết quả: [plan/slice-7b-thiet-ke-kiem-thu.md](../plan/slice-7b-thiet-ke-kiem-thu.md).

**Trạng thái (PR 7b, 11/11/2026):** hạ tầng gửi thư đã có và đã kiểm thử, nhưng **chưa tính năng nào gọi tới** (kích hoạt tài khoản, quên mật khẩu bằng email nằm ở PR 7c và 7d). Production **chưa cần** cấu hình SMTP cho tới khi 7c và 7d lên; xem mục 7.

## 1. Cách hệ thống gửi thư (đọc một lần để hiểu các lệnh bên dưới)

1. Chỗ nào cần gửi thư thì **xếp thư vào hàng đợi** (bảng `email_outbox` trong PostgreSQL). Xếp xong là xong, người dùng không phải chờ máy chủ thư. Hàng đợi **bền**: khởi động lại hay khôi phục từ sao lưu không làm mất thư.
2. **Worker** lấy từng thư ra gửi, theo **hạn mức** (mục 3). Thư lỗi tạm thời được thử lại; thư bị máy chủ thư từ chối cứng thì dừng.
3. **Hàng đợi không chứa mã hay liên kết.** Mã (liên kết kích hoạt, đặt lại mật khẩu) chỉ được sinh **lúc gửi**, trong bộ nhớ worker, rồi đưa vào thư. Nhờ vậy xem bảng `email_outbox` (hay bản sao lưu của nó) không lấy được mã nào.
4. Gửi **ít nhất một lần, không mất thư**. Trường hợp hiếm: máy chủ thư đã nhận thư mà worker chết trước khi kịp ghi "đã gửi" thì sau 10 phút thư được gửi lại, người dùng thấy **hai thư**; thư mới nhất mới dùng được.

## 2. Cấu hình (`api.env` của prod, quyền 600)

Không đặt nhóm `SMTP_*` thì hệ thống ở chế độ **không gửi**: thư vẫn xếp được nhưng được đánh dấu "bỏ qua", không gửi đi, không tính hạn mức. Đặt thì phải đặt **đủ bốn biến đầu**, thiếu một biến là api và worker **không khởi động** và nêu rõ biến thiếu.

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `SMTP_HOST` | có (nhóm) | | `smtp.gmail.com` |
| `SMTP_USERNAME` | có (nhóm) | | tài khoản gửi, ví dụ `khaothi.xxx@gmail.com` |
| `SMTP_PASSWORD` | có (nhóm) | | **App Password** của Gmail (16 ký tự), không phải mật khẩu đăng nhập |
| `EMAIL_FROM` | có (nhóm) | | địa chỉ người gửi; **với Gmail phải trùng `SMTP_USERNAME`** (Gmail ghi đè nếu khác, nên hệ thống từ chối khởi động) |
| `SMTP_PORT` | không | 587 | 587 dùng STARTTLS; 465 dùng TLS ngay |
| `EMAIL_REPLY_TO` | không | `EMAIL_FROM` | hộp thư thật để người nhận trả lời |
| `EMAIL_FROM_NAME` | không | Hệ thống kiểm tra đánh giá trực tuyến | tên hiển thị của người gửi và tên hệ thống trong thư |
| `EMAIL_SUPPORT_CONTACT` | không | "Cần trợ giúp, hãy liên hệ Người ra đề hoặc quản trị viên của bạn." | dòng liên hệ hỗ trợ cuối mỗi thư |
| `SMTP_TIMEOUT_SECONDS` | không | 15 | chờ máy chủ thư tối đa chừng này |
| `EMAIL_LIMIT_TOTAL` | không | 400 | tổng số thư mỗi 24 giờ trượt |
| `EMAIL_LIMIT_BULK` | không | 300 | phần dành cho thư hàng loạt (không được vượt tổng; phần còn lại dự trữ cho thư khẩn) |
| `EMAIL_MIN_GAP_SECONDS` | không | 6 | khoảng cách tối thiểu giữa hai thư |
| `EMAIL_WARMUP_BULK` | không | `50,100,150,200,300` | trần thư hàng loạt các ngày đầu; để trống để tắt (mục 4) |

**Bảo vệ:** các pod thử (`drill-exam`, `dr-exam`, và mọi stage khác `prod`) **không được** có `SMTP_HOST` trong `api.env`. `exam-ctl.sh` từ chối dựng api và worker nếu thấy, để khôi phục một bản sao lưu vào pod thử không gửi lại thư thật cho người thật. Ở dev và test (không có SMTP), thư được **in ra bảng điều khiển của worker** để thử bằng tay; production không bao giờ làm vậy (thư chứa liên kết có mã).

## 3. Hạn mức: vì sao có và hoạt động ra sao

Gmail cho khoảng 500 thư mỗi ngày; hệ thống tự giới hạn **400 thư mỗi 24 giờ trượt** để không bao giờ chạm trần của Google.

- **Thư khẩn** (quên mật khẩu, "mật khẩu đã đổi", Lời mời, liên kết hỗ trợ) được **dành riêng 100 thư**. **Thư hàng loạt** (kích hoạt cả lớp) tối đa **300**. Nên cả lớp 500 người cũng không chặn được người quên mật khẩu.
- Chạm trần thì thư **chờ sang cửa sổ sau, không phải lỗi**, không mất thư.
- Giữa nhiều Người ra đề cùng gửi thì **xoay vòng** từng thư một: một lớp 500 người không làm lớp 30 người của người khác chờ tới ngày thứ hai.
- Hai thư cách nhau ít nhất 6 giây.
- Lớp 500 sinh viên cần 500 thư kích hoạt nên **cần hơn một ngày**: nhập danh sách sớm vài ngày trước ngày thi.

## 4. Làm nóng tài khoản gửi (warm-up)

Tài khoản Gmail mới mà gửi ngay hàng trăm thư giống nhau dễ bị Google nghi ngờ. Hệ thống tự tăng dần trần thư hàng loạt: **ngày 1: 50, ngày 2: 100, ngày 3: 150, ngày 4: 200, từ ngày 5: 300**. Ngày tính theo **ngày lịch giờ Việt Nam** kể từ ngày gửi thành công **đầu tiên** của hệ thống. Thư khẩn không bị warm-up chặn.

## 5. Kiểm trước khi dùng thật

```bash
make -C infra prod-mail-test ADDRESS=<email của bạn>   # gửi thư thử qua đúng cấu hình đang chạy
make -C infra prod-preflight                           # có mục "Thư" (✓ ⚠ ✗)
make -C infra mail-ops-test                            # thử phần vận hành (không cần pod)
```

Lệnh `prod-mail-test` in rõ "Chưa cấu hình gửi thư", "Địa chỉ không hợp lệ" hoặc "Gửi thư thử thất bại (loại lỗi): lý do" (đã che mật khẩu). Khi gửi được:

1. Mở thư ở hộp thư đến **và cả Spam**. Nếu vào Spam, bấm "Không phải thư rác".
2. Mở thư → menu ⋮ → **"Hiện thư gốc" (Show original)**: **SPF, DKIM, DMARC đều PASS**. Khi gửi bằng Gmail thì Google lo cả ba. Khi **rời Gmail** sang tên miền riêng hoặc dịch vụ chuyên dụng thì **phải tự đặt bản ghi DNS** SPF, DKIM, DMARC (tên miền trên Cloudflare của bạn) **trước khi đổi**.

## 6. Mục "Thư" của `prod-preflight`

| Dòng | Nghĩa | Xử lý |
|---|---|---|
| ✓ đã cấu hình gửi thư | có `SMTP_HOST` trong `api.env` | |
| ⚠ chưa cấu hình gửi thư | chưa có SMTP, và **chưa thư nào bị bỏ qua** | bình thường cho tới khi dùng email (mục 7) |
| ✗ chưa cấu hình mà đã có N thư bị bỏ qua | người dùng thật đang **không nhận được thư** | đặt `SMTP_*` rồi deploy lại; thư đã bỏ qua phải gửi lại (7d có nút) |
| ✓ hàng đợi thư trống | | |
| ⚠ còn N thư chờ gửi | hạn mức 24 giờ đang xả dần | chờ; xem mục 3 |
| ✗ thư chờ cũ hơn 48 giờ | người dùng chưa kích hoạt được | xem log worker: sai App Password, Gmail chặn, hết hạn mức |
| ⚠ N thư lỗi hoặc bị từ chối trong 7 ngày | địa chỉ sai, hộp thư đầy | sửa email người nhận rồi gửi lại |

## 7. Việc chủ dự án làm trước khi bật email ở production

Chưa cần làm gì cho tới khi 7c và 7d lên. Khi tới lúc:

1. Tạo **tài khoản Gmail riêng** cho exam-system (không dùng chung với `plo-tracker-bluni` để không chung hạn mức), bật xác minh hai bước, tạo **App Password**, chép vào Bitwarden và `api.env`. `api.env` tự được sao lưu mã hóa khi đổi.
2. Đặt `EMAIL_FROM_NAME` và `EMAIL_SUPPORT_CONTACT` (số điện thoại hoặc hộp thư thật mà sinh viên liên hệ được).
3. **Làm nóng** tài khoản: gửi vài thư thật ít một vài ngày trước đợt kích hoạt lớn; đừng nhập lớp vài trăm người ngay ngày đầu.
4. Kiểm **cổng 587** gửi ra được từ máy chạy production (và từ VPS sau này: nhiều nhà cung cấp chặn cổng 25, thường mở 587).
5. Chạy `prod-mail-test` như mục 5.
6. Hai Quản trị viên xác thực email của mình; `prod-preflight` đạt trước Phiên thi thật đầu tiên.

## 8. Sự cố thường gặp

| Dấu hiệu | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| api hoặc worker không khởi động, log nêu `SMTP_PASSWORD`... | đặt thiếu một biến trong nhóm `SMTP_*` | đặt đủ bốn biến hoặc bỏ cả nhóm |
| không khởi động, log nêu `EMAIL_FROM` | dùng Gmail mà `EMAIL_FROM` khác `SMTP_USERNAME` | đặt `EMAIL_FROM` bằng đúng tài khoản Gmail |
| log worker: "Máy chủ thư từ chối thông tin đăng nhập; tạm dừng gửi 15 phút" | App Password sai, bị thu hồi, hoặc Gmail chặn đăng nhập | tạo App Password mới; hệ thống **không đánh dấu người nhận nào lỗi** và tự gửi tiếp sau 15 phút |
| `prod-mail-test` báo `auth` và thông báo có "5.4.5" | hết hạn mức ngày của Gmail | chờ 24 giờ; kiểm `EMAIL_LIMIT_TOTAL` có quá cao |
| thư vào Spam | tài khoản mới chưa làm nóng, thiếu `Reply-To`, tên miền chưa xác thực | mục 4 và 5; nhờ vài người đầu bấm "Không phải thư rác" |
| thư "bị từ chối" | hộp thư không tồn tại (máy chủ thư báo 5xx) | sửa email người nhận. Lưu ý: với địa chỉ ở nhà cung cấp khác, Gmail thường nhận thư rồi mới bị trả lại về hộp Gmail của tài khoản gửi; hệ thống **không đọc được** thư trả lại đó (Q382), nên người **đã gửi quá 48 giờ mà chưa kích hoạt** sẽ được đánh dấu "Cần kiểm tra" ở 7d |

## 9. Đã kiểm thử và chưa kiểm thử

Đã kiểm thử tự động (35 bài tích hợp, 87 bài đơn vị cho module `mail`, 14 bài của lệnh CLI và 15 bài vận hành; danh sách hành vi và kết quả kiểm thử đột biến: [slice-7b-thiet-ke-kiem-thu.md](../plan/slice-7b-thiet-ke-kiem-thu.md)): hạn mức, xoay vòng, thử lại, khôi phục việc kẹt, không mất thư, không lộ mã và mật khẩu, nội dung và MIME của sáu loại thư, giao thức SMTP với máy chủ giả (STARTTLS bắt buộc, phân loại lỗi).

**Chưa và không tự động kiểm được:** gửi qua **Gmail thật** (cấu hình App Password, cổng 587, thư vào hộp thư đến hay Spam, SPF/DKIM/DMARC). Việc đó chỉ kiểm được bằng tay (mục 5) trước khi bật ở production.
