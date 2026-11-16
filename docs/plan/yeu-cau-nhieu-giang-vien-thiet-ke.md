# Yêu cầu cấp tài khoản khi nhiều giảng viên dạy chung một lớp, và khớp với tài khoản đã Xóa

**Trạng thái: ĐÃ DUYỆT và ĐÃ LÀM XONG (16/11/2026), chờ PR (mục 6).** Phát sinh từ lần thử trên production: file Yêu cầu thử bị "Không duyệt được" vì khớp hai tài khoản thử đã Xóa mềm (luật Q54/Q90), và từ câu hỏi "nhiều giảng viên cùng dạy một lớp thì quản lý ra sao".

## 1. Bốn việc đã duyệt

| # | Việc | Nội dung |
|---|---|---|
| P1 | Hướng dẫn | Trang Yêu cầu nói rõ: chỉ gửi cho sinh viên **chưa có** tài khoản; đã có (do giảng viên khác tạo) thì **thêm thẳng vào Danh sách dự thi** bằng mã. Khi một Yêu cầu không có ai "mới" hay "khôi phục" thì nhắc lại điều đó |
| P2 | Duyệt đồng thời | Khi duyệt gặp tài khoản **vừa được Yêu cầu khác tạo** (cùng mã hoặc email, họ tên khớp): coi là "khớp có sẵn" (gắn nhãn, ghi nhận người đó vào Yêu cầu này, kết quả `tag_added`) thay vì "bỏ qua". Họ tên khác hoặc hai người khác nhau thì vẫn bỏ qua kèm lý do |
| P3 | Quyền theo dòng | Bảng "Theo dõi kích hoạt" và "Gửi lại cho tất cả" chỉ tác động lên dòng mình **có quan hệ** (tài khoản do Yêu cầu của mình tạo hoặc khôi phục, hoặc đang trong Danh sách dự thi chưa kết thúc của mình). Dòng còn lại chỉ hiện **trạng thái, không có nút** (sửa lệch của 7d-2 so với D-31) |
| P5 | Khôi phục (C-gọn) | Dòng khớp một tài khoản **đã Xóa chỉ có nhãn Người dự thi** thì có trạng thái **`restore`** thay vì chặn |

## 2. Luật đối chiếu mới (`matchRows`)

```text
chủ mã = tài khoản chưa Xóa trước, không có thì tài khoản đã Xóa; chủ email tương tự
Quản trị viên đang dùng khớp           -> blocked  matches_admin           (như cũ)
chủ mã và chủ email là hai người khác  -> blocked  code_email_conflict      (như cũ)
không khớp ai                          -> new
khớp tài khoản chưa Xóa                -> exact | name_mismatch             (như cũ)
khớp tài khoản đã Xóa:
    từng là Quản trị viên, hoặc có nhãn khác ngoài candidate -> blocked  removed_user_privileged (MỚI)
    còn lại                                                  -> restore   userId = tài khoản đã Xóa (MỚI)
```

Quyết định đã duyệt: (1) dòng `restore` **không** nằm trong "Duyệt các dòng hợp lệ", Quản trị viên phải tick riêng; (2) email sau khôi phục lấy **từ file**; (3) họ tên giữ tên cũ.

## 3. Khi duyệt một dòng `restore` (một giao dịch)

1. Khóa dòng người dùng. Không còn ở trạng thái đã Xóa, hoặc đã thành Quản trị viên, hoặc có thêm nhãn khác: dòng thành `skipped` (`restore_state_changed`).
2. `removed_at`, `removed_by` về trống; `status = active`, bỏ lý do khóa; xóa `password_hash`, `must_change_password`, `password_expires_at`, `activated_at`, `email_verified_at` (về **Chờ kích hoạt**); email = email trong file; mã giữ nguyên (nếu trống thì lấy mã trong file); họ tên giữ nguyên.
3. Bảo đảm nhãn `candidate`; vô hiệu mọi liên kết còn hiệu lực của người đó.
4. Xếp **một thư kích hoạt** (làn hàng loạt, người xếp là Người ra đề tạo Yêu cầu) trong cùng giao dịch.
5. Ghi nhật ký `user.restore` (Quản trị viên, Yêu cầu) và kết quả dòng là `restored`.
6. Email, mã hoặc tên đăng nhập bị người khác chiếm trong lúc chờ: cơ sở dữ liệu từ chối, dòng thành `skipped` kèm lý do (như dòng mới hiện nay).

Họ tên, mã, lượt làm bài, điểm, Danh sách dự thi của tài khoản cũ **không đổi** (cùng `id`). "Xóa" chỉ đặt cờ, nộp các Lượt đang làm dở và thu hồi phiên, nên không có gì phải hoàn lại.

## 4. Ghi chú đối chiếu cho Quản trị viên (theo yêu cầu của chủ dự án)

Với mọi dòng khớp một tài khoản (kể cả đã Xóa, và dòng bị chặn do khớp người đã Xóa), **Quản trị viên** thấy bảng so sánh "file" và "tài khoản đang có":

- họ tên, mã, email, lớp: ô nào khác nhau được **tô nổi và ghi chữ** (không chỉ màu);
- **khớp theo**: mã, email hay cả hai;
- trạng thái tài khoản: đang dùng, bị Khóa, hoặc **đã Xóa lúc … bởi …**;
- vai trò (nhãn) hiện có;
- đường dẫn mở tài khoản.

**Người ra đề không thấy** tên hay chi tiết tài khoản bị khớp (tránh dùng tính năng này để dò danh bạ); với dòng `restore` họ chỉ thấy "Đang chờ Quản trị viên xác nhận".

## 5. Điểm tiếp xúc và bài kiểm

| Seam | Bài |
|---|---|
| `matchRows` qua HTTP (tải file, đọc Yêu cầu) | R-01 đến R-05: khớp đã Xóa thành `restore`; đã Xóa có vai trò hoặc từng là Quản trị viên bị chặn; mã và email trỏ hai người bị chặn; "Duyệt các dòng hợp lệ" không duyệt `restore`, chọn riêng thì duyệt được |
| duyệt dòng `restore` | R-06 đến R-09: cùng `id`, trạng thái Chờ kích hoạt, email từ file, một thư kích hoạt, nhật ký `user.restore`, mã cũ chết, đăng nhập bằng liên kết mới; bị chiếm email giữa chừng thì `skipped` |
| API danh sách dòng | R-10, R-11: Quản trị viên nhận chi tiết đối chiếu; Người ra đề không; số đếm có `restore` |
| P2 | R-12, R-13: hai Yêu cầu cùng sinh viên, duyệt lần lượt: dòng thứ hai `tag_added` (họ tên khớp) hoặc `skipped` (họ tên khác) |
| P3 | R-14, R-15: bảng theo dõi có `actionable`; "Gửi lại cho tất cả" không gửi cho dòng không có quan hệ; Quản trị viên luôn có quyền |
| Giao diện | E-08: ghi chú đối chiếu, chip "Khôi phục", hướng dẫn P1, trên điện thoại và máy tính |

## 6. Kết quả

- **Bài mới:** `account-request-restore.int.test.ts` (R-01 đến R-13, đều đỏ rồi xanh), `account-tracking.int.test.ts` thêm R-14 đến R-16, E2E `account-request-restore.spec.ts` (E-08, desktop và mobile). Bài cũ đổi có chủ ý: `account-requests.int.test.ts` (dòng khớp người đã Xóa từ "chặn" thành "khôi phục"; số đếm thêm `restore`).
- **Đột biến (8, một cái mỗi lần, mã khôi phục sau mỗi lần):** bỏ kiểm "chỉ nhãn Người dự thi"; không xóa mật khẩu khi khôi phục; không vô hiệu liên kết cũ; gộp đồng thời không kiểm họ tên; mọi dòng thao tác được; Người ra đề thấy ghi chú gốc; "Duyệt các dòng hợp lệ" duyệt cả dòng khôi phục; khôi phục không đặt email từ file. **Cả 8 bị bắt.**
- **Migration `0027_khop_tai_khoan_da_xoa`:** thêm giá trị `restore` (kiểu `account_request_match_status`) và `restored` (kiểu `account_request_item_outcome`); chỉ thêm giá trị, không đổi dữ liệu.
- **Phát hiện khi làm giao diện (chụp ảnh thật):** bảng đối chiếu lần đầu dùng lưới 4 cột nên ở máy tính (nằm trong cột "Kết quả kiểm tra" hẹp) chữ bị ngắt giữa từ; đổi sang xếp dọc ở mọi cỡ màn hình. Cột "Họ tên" của bảng cũng được đặt độ rộng tối thiểu.
- **Điều chỉnh so với thiết kế:** quan hệ "tài khoản do Yêu cầu của mình tạo" trong chính sách hỗ trợ (`AccountSupportService.relation`) nay tính cả kết quả `restored`; cổng `SUPPORT_ROSTER_SCOPE` thêm `inOpenRosterAmong` (kiểm hàng loạt, tránh N truy vấn).
