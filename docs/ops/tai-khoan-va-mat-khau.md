# Tài khoản và mật khẩu: cách hệ thống hoạt động, và xử lý khi quên mật khẩu

Tài liệu cho người vận hành (chủ dự án, Quản trị viên), để **tra cứu và học lâu dài**. Mô tả **đúng những gì hệ thống đang làm** (đã kiểm bằng mã và bài kiểm thử, 10/11/2026), kể cả điểm yếu đã biết. Thiết kế gốc: [docs/plan/slice-1.md](../plan/slice-1.md) (Q44 đến Q70). Kế hoạch cải tiến cách cấp lại mật khẩu: [docs/plan/slice-7.md](../plan/slice-7.md).

> **Sắp đổi (11/11/2026):** chủ dự án đã mở lại phương án B (email chính chủ, kích hoạt và quên mật khẩu qua email, bỏ mật khẩu tạm). Tài liệu này vẫn **đúng với hệ thống đang chạy** cho tới khi các PR 7b đến 7d xong; thiết kế ở [slice-7-phuong-an-b-email.md](../plan/slice-7-phuong-an-b-email.md), quyết định ở [ADR-0009](../adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md).

> **Tóm tắt một dòng:** hệ thống **không gửi email**, nên "quên mật khẩu" luôn do **Quản trị viên** (hoặc người vận hành có quyền vào máy) **cấp lại mật khẩu tạm**; người đó đăng nhập bằng mật khẩu tạm rồi **tự đặt mật khẩu mới**.

## 1. Ba loại tài khoản và cách mỗi loại được tạo

| Vai | Tạo bằng cách nào | Mật khẩu ban đầu |
|---|---|---|
| **Quản trị viên đầu tiên** | lệnh dựng hệ thống `make -C infra prod-bootstrap` (tạo `quantri`), người vận hành tự nhập mật khẩu | do người vận hành đặt, **buộc đổi** ở lần đăng nhập đầu |
| **Quản trị viên khác** | Quản trị viên tạo ở mục Người dùng (tài khoản Quản trị viên **tách riêng**, không mang Nhãn vai trò; người vừa quản trị vừa ra đề dùng hai tài khoản) | mật khẩu tạm hiển thị **một lần**, hạn 7 ngày, buộc đổi |
| **Người ra đề** | **Lời mời**: Quản trị viên tạo, hệ thống hiện một **liên kết dùng một lần** (hạn 7 ngày); Quản trị viên tự gửi liên kết (Zalo, email của bạn) | người nhận **tự đặt mật khẩu** khi mở liên kết (không có mật khẩu tạm) |
| **Người dự thi** | **Yêu cầu cấp tài khoản**: Người ra đề tải file Excel hoặc CSV, Quản trị viên duyệt; hệ thống tạo tài khoản và **Phiếu tài khoản** (in hoặc tải, ghi tên đăng nhập và mật khẩu tạm; phiếu hết hạn tải sau 7 ngày) | mật khẩu tạm trên Phiếu, hạn 7 ngày, **buộc đổi** ở lần đăng nhập đầu |

## 2. Quy tắc mật khẩu và đăng nhập (đang áp dụng)

**Mật khẩu của người dùng** (khi đặt hoặc đổi):
- Từ **10 đến 128 ký tự**.
- **Không** nằm trong danh sách 10.000 mật khẩu phổ biến (có cả một số mật khẩu tiếng Việt hay gặp).
- **Không chứa** tên đăng nhập hoặc mã định danh của chính người đó (từ 4 ký tự trở lên); không trùng email.
- Lưu bằng **Argon2id** (băm một chiều theo khuyến nghị OWASP). Không ai, kể cả Quản trị viên, xem lại được mật khẩu.

**Mật khẩu tạm:**
- **10 ký tự** ngẫu nhiên, **bỏ các ký tự dễ nhầm** khi đọc trên giấy (0, O, o, 1, l, I, i).
- **Hạn 7 ngày.** Quá hạn mà chưa đổi thì không đăng nhập được (báo "Mật khẩu tạm đã hết hạn..."); phải cấp lại.
- Người dùng **buộc đổi** ngay khi đăng nhập bằng mật khẩu tạm: chưa đổi thì mọi chức năng khác bị chặn (chỉ vào được trang đổi mật khẩu).
- Sau khi người dùng đã đổi mật khẩu thì **không còn hạn 7 ngày**: mật khẩu tự đặt dùng được vô thời hạn cho tới khi họ đổi hoặc bị cấp lại.

**Phiên đăng nhập:** Quản trị viên: hết hạn nếu **không hoạt động 30 phút**, tối đa **12 giờ**. Người ra đề và Người dự thi: **12 giờ** không hoạt động, tối đa **7 ngày**. (Vì vậy Quản trị viên phải đăng nhập lại trước khi cấp lại mật khẩu nếu để lâu.)

**Chống đoán mật khẩu:**
- Sai **5 lần liên tiếp** thì **chặn đăng nhập 15 phút** (khóa tạm; khác với "Khóa đăng nhập" do Quản trị viên đặt).
- Giới hạn **10 lần thử trong 10 phút** cho mỗi tên đăng nhập, và có giới hạn theo địa chỉ IP.
- Thông báo lỗi luôn **chung**: "Tên đăng nhập hoặc mật khẩu không đúng." (không cho biết tài khoản có tồn tại hay không); thời gian phản hồi giữ như nhau.
- Mọi lần đăng nhập, thành công hay thất bại, ghi vào **Lịch sử đăng nhập** (xóa sau 12 tháng).

## 3. Khi một người quên mật khẩu: ai xử lý và xử lý thế nào

Đây là kịch bản thường gặp nhất: tài khoản tạo từ lâu, người đó đã đổi mật khẩu từ lần đầu, rất lâu sau thì quên.

| Ai quên | Ai xử lý | Cách làm |
|---|---|---|
| **Người ra đề** hoặc **Người dự thi** (mọi trường hợp) | **Quản trị viên** | giao diện: **Người dùng** → mở người đó → **"Cấp lại mật khẩu tạm"** (mục 3.1) |
| **Người dự thi** (trường hợp hẹp) | **Người ra đề** đã xin cấp tài khoản cho họ | từ Danh sách dự thi của Phiên thi, **chỉ khi** người đó **chưa từng đổi mật khẩu tạm** (tình huống làm mất Phiếu). Đã đổi mật khẩu rồi thì hệ thống từ chối ("hãy nhờ Quản trị viên") |
| **Quản trị viên** | Quản trị viên **khác** | như trên (được cấp lại cho Quản trị viên khác; **không tự cấp cho chính mình**) |
| **Quản trị viên duy nhất / không ai đăng nhập được** | người có quyền vào máy chủ | `make -C infra prod-recover-admin ADMIN=<tên>`: mở Khóa đăng nhập, gỡ khóa tạm, in **một lần** mật khẩu tạm, thu hồi mọi phiên, ghi nhật ký `cli.recover-admin` ([trien-khai.md](./trien-khai.md) mục 5) |

### 3.1 Từng bước cho Quản trị viên

1. **Xác minh danh tính người xin cấp lại** (mục 4). Đây là bước quan trọng nhất và hệ thống không làm thay được.
2. Đăng nhập Quản trị viên (nếu phiên đã hết hạn).
3. Menu **Người dùng**, tìm theo tên (không cần dấu), tên đăng nhập, email, mã định danh hoặc lớp; mở trang chi tiết.
4. Bấm **"Cấp lại mật khẩu tạm"** và xác nhận trong hộp thoại ("Mật khẩu cũ mất hiệu lực, mọi Phiên đăng nhập bị thu hồi...").
5. **Chép mật khẩu tạm** hiện ra (nút Sao chép). Hộp thoại **không đóng được bằng Esc hay bấm ra ngoài**: phải bấm "Tôi đã lưu mật khẩu". **Mật khẩu chỉ hiện đúng một lần**, mất thì phải cấp lại.
6. Chuyển cho người đó qua kênh riêng tư (mục 4) và dặn **đổi ngay** khi đăng nhập.

### 3.2 Điều xảy ra khi cấp lại

- Sinh mật khẩu tạm mới (10 ký tự, **hạn 7 ngày**), người đó **bị buộc đổi** ở lần đăng nhập tới.
- **Mật khẩu cũ mất hiệu lực ngay.**
- **Mọi phiên đăng nhập đang mở của người đó bị thu hồi** (đăng xuất khỏi mọi thiết bị).
- Gỡ **khóa tạm** do nhập sai nhiều lần (nếu đang bị chặn 15 phút thì vào lại được).
- **Không** mở "Khóa đăng nhập" do Quản trị viên đặt: người đang bị Khóa vẫn bị Khóa (phải "Mở khóa" riêng).
- **Không cấp lại được** cho người đã bị **Xóa** (hệ thống từ chối), và Quản trị viên **không tự cấp cho chính mình**.
- Không bị chặn khi người đó đang trong Phiên thi (Quản trị viên vẫn cấp được); nhưng người đó sẽ bị đăng xuất, nên chỉ làm khi thật cần.
- Ghi vào **Nhật ký thao tác**: `user.temporary-password.reissue` (ai cấp cho ai, lúc nào, hạn). **Mật khẩu không bao giờ được ghi** vào nhật ký hay cơ sở dữ liệu ở dạng đọc được.
- Người đó đặt mật khẩu mới thì ghi `account.change-password` và **mọi phiên khác bị thu hồi** (trừ phiên đang dùng).

### 3.3 Các tình huống kèm theo

| Tình huống | Điều xảy ra |
|---|---|
| Mật khẩu tạm quá 7 ngày chưa dùng | đăng nhập báo "Mật khẩu tạm đã hết hạn"; Quản trị viên cấp lại (mật khẩu tạm cũ bị thay) |
| Cấp lại hai lần liên tiếp | chỉ mật khẩu tạm **mới nhất** dùng được |
| Người đó gõ sai nhiều lần và bị chặn 15 phút | cấp lại sẽ gỡ chặn ngay |
| Người đó đang bị "Khóa đăng nhập" | cấp lại không mở khóa; đăng nhập báo "Tài khoản đã bị Khóa đăng nhập" |
| Quản trị viên để lâu mới cấp (phiên hết hạn) | đăng nhập lại rồi cấp |

## 4. Quy trình vận hành khuyến nghị (không nằm trong hệ thống, nên cần người làm)

Vì đây là **tài khoản cá nhân**, kẻ giả danh xin "quên mật khẩu" là rủi ro thật:
1. **Xác minh danh tính** trước khi cấp: gặp trực tiếp, hoặc qua kênh đã biết chắc là của người đó (số điện thoại đã đăng ký, mã sinh viên kèm giấy tờ); không cấp chỉ vì một tin nhắn lạ.
2. **Chuyển mật khẩu tạm qua kênh riêng** (nói trực tiếp, tin nhắn cá nhân). **Không gửi vào nhóm.**
3. **Dặn đổi ngay** khi đăng nhập và không dùng lại mật khẩu cũ ở nơi khác.
4. Sau khi cấp, **xem Nhật ký thao tác** nếu nghi ngờ; nếu cả Quản trị viên lẫn người dùng đều không nhận ra việc cấp lại, đó là dấu hiệu cần điều tra (xem thêm Lịch sử đăng nhập).
5. Với tài khoản **Quản trị viên**, ưu tiên cấp lại **trực tiếp** (ngồi cùng nhau), vì quyền rất cao.

## 5. Giới hạn đã biết của cách hiện tại (nói thẳng)

1. **Quản trị viên biết mật khẩu tạm** khi cấp lại, nên về nguyên tắc có thể **đăng nhập bằng tài khoản người khác** trước khi họ kịp đổi. Có nhật ký ghi việc cấp lại, nhưng hệ thống không ngăn.
2. **Không có thông báo cho chủ tài khoản** khi mật khẩu của họ bị cấp lại (họ đang không đăng nhập được nên không thấy chuông).
3. **Không tự phục vụ**: người quên luôn phải nhờ người khác; ngoài giờ làm việc không ai cấp được thì phải chờ.
4. **Hệ thống không xác minh danh tính**; chỉ có quy trình ở mục 4.
5. **Hạn 7 ngày** của mật khẩu tạm khá dài so với nhu cầu (thường dùng trong vài phút).

**Hướng cải tiến đã chọn** (ngày 10/11/2026, [slice-7.md](../plan/slice-7.md), Q371): thêm **liên kết đặt lại dùng một lần**, trong đó Quản trị viên **không bao giờ biết mật khẩu**; chủ tài khoản mở liên kết và tự đặt mật khẩu mới. Cấp mật khẩu tạm vẫn giữ làm phương án dự phòng. Thiết kế đang được duyệt từng câu; khi xong tài liệu này sẽ được cập nhật.

## 6. Kiểm thử bảo vệ cơ chế này

| Bài | Kiểm gì |
|---|---|
| `apps/api/test/password-recovery.int.test.ts` (16 bài, PR 7a) | **trọn kịch bản** cho cả Người ra đề và Người dự thi: tài khoản 120 ngày tuổi quên mật khẩu → Quản trị viên cấp lại → mật khẩu cũ mất hiệu lực → dùng mật khẩu tạm bị buộc đổi, mọi chức năng khác bị chặn → tự đặt mật khẩu mới → mật khẩu tạm không dùng lại được, 30 ngày sau vẫn đăng nhập được, không còn hạn 7 ngày; nhật ký ghi đủ và **không chứa mật khẩu nào**; phiên cũ bị thu hồi; hết hạn 7 ngày rồi cấp lại; cấp lại hai lần; người bị Khóa; mật khẩu yếu bị từ chối; người đã Xóa; **Quản trị viên thứ hai cấp lại cho Quản trị viên quên**, không tự cấp cho mình; chỉ Quản trị viên được cấp |
| `apps/web/e2e/password-recovery.spec.ts` (4 bài, PR 7a) | trên **trình duyệt thật** (desktop và điện thoại): Quản trị viên tìm người, bấm cấp lại, mật khẩu hiện một lần, **không đóng bằng Esc**, tải lại trang không còn; người đó thử mật khẩu cũ bị từ chối, dùng mật khẩu tạm, bị buộc đổi, mật khẩu yếu bị từ chối, đặt mật khẩu mới, mật khẩu tạm không dùng lại được |
| `apps/api/test/admin-users.int.test.ts`, `auth.int.test.ts`, `cli.int.test.ts`, `session-reissue.int.test.ts`, `account.int.test.ts` | các mảnh lẻ: cấp lại (Q61), hết hạn 7 ngày (Q48), `prod-recover-admin`, Người ra đề cấp lại cho Người dự thi (chỉ khi chưa đổi mật khẩu), đổi mật khẩu |

Chạy lại: `make -C infra dev-up` rồi `pnpm -C apps/api exec vitest run --project integration test/password-recovery.int.test.ts`; trình duyệt: `pnpm -C apps/api build && pnpm -C apps/web exec playwright test password-recovery`.

## 7. Học thêm: vì sao thiết kế như vậy

- **Vì sao không có "quên mật khẩu" tự phục vụ.** Tự phục vụ thường dựa vào **email**: gửi liên kết đặt lại tới hộp thư của chủ tài khoản. Hệ thống này không gửi email (giai đoạn 1) và nhiều Người dự thi không có email; vì vậy cách an toàn nhất có thể hiện nay là một người có thẩm quyền xác minh rồi cấp lại.
- **Vì sao thu hồi mọi phiên khi cấp lại.** Nếu mật khẩu bị lộ, kẻ xấu có thể đang đăng nhập sẵn; đổi mật khẩu mà không thu hồi phiên thì họ vẫn ở trong. Thu hồi buộc mọi thiết bị đăng nhập lại.
- **Vì sao báo lỗi chung "tên đăng nhập hoặc mật khẩu không đúng".** Nói riêng "không có tài khoản này" giúp kẻ xấu dò xem tài khoản nào tồn tại. Hệ thống cũng băm một mật khẩu giả khi không tìm thấy người dùng để **thời gian phản hồi bằng nhau**.
- **Vì sao mật khẩu tạm bỏ ký tự dễ nhầm.** Phiếu tài khoản được in; `0` với `O`, `1` với `l` và `I` dễ đọc nhầm trên giấy. Bớt ký tự dễ nhầm làm người dùng gõ đúng ngay lần đầu.
- **Vì sao Quản trị viên có phiên ngắn hơn (30 phút nhàn rỗi, 12 giờ tối đa).** Quyền cao thì rủi ro khi để máy mở cao; đổi lại phải đăng nhập lại thường xuyên.
- **Vì sao tách "khóa tạm do sai mật khẩu" và "Khóa đăng nhập".** Khóa tạm (15 phút) là chống đoán mật khẩu, tự hết; Khóa đăng nhập là quyết định của Quản trị viên (nghi bị lộ tài khoản, hoặc người đó nghỉ), không tự hết. Cấp lại mật khẩu gỡ khóa tạm nhưng **không** mở Khóa đăng nhập.
