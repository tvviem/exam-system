# PR 7c-2: thiết kế kiểm thử (tạo tài khoản bằng email, Lời mời gửi thư, đổi và xác thực email), làm theo TDD

**Trạng thái: 7c-2b ĐÃ LÀM XONG (mục 11); 7c-2a chưa làm** (chờ chủ dự án có email sinh viên). Điều kiện đổi email và hai quyết định về Lời mời đã được duyệt (mục 10 và 11.1). Cách làm như [7b](./slice-7b-thiet-ke-kiem-thu.md) và [7c-1](./slice-7c-thiet-ke-kiem-thu.md): điểm tiếp xúc, hành vi, lát dọc, cách tự kiểm; duyệt xong mới vòng đỏ rồi xanh.

Căn cứ: [ADR-0009](../adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md); [slice-7-phuong-an-b-email.md](./slice-7-phuong-an-b-email.md) mục 3.1, 3.2, 3.4, 3.6, 3.7 và tiêu chí 1, 5, 10, 16; hạ tầng thư (7b, #92) và `AuthLinks` (7c-1, #95).

## 1. Điều cần biết trước: 7c-2 đổi hành vi đang chạy

Hiện nay (đang chạy ở production, do hai Quản trị viên dùng):
- **Duyệt Yêu cầu cấp tài khoản** tạo tài khoản Người dự thi kèm **mật khẩu tạm** và **Phiếu tài khoản** (PDF mã hóa).
- **Lời mời** hiện **một liên kết** cho Quản trị viên tự gửi; người nhận bấm, đặt mật khẩu, **được đăng nhập luôn**.
- **Quản trị viên tạo Quản trị viên khác** đặt mật khẩu ban đầu.
- **Email** không bắt buộc ở file Excel; không có chỗ đổi hay xác thực email.

Sau 7c-2, ba đường tạo tài khoản đầu **không còn mật khẩu do người khác biết**: tài khoản ở **Chờ kích hoạt**, hệ thống tự gửi thư. Hệ quả cần chấp nhận:
- Các bài kiểm thử cũ dựa vào Phiếu và mật khẩu tạm của nhập Excel **phải sửa** (danh sách ở mục 6). Đây là thay đổi hành vi có chủ ý, không phải lỗi.
- Phần **Phiếu tài khoản** (giao diện, tải về) và nút **"Cấp lại mật khẩu tạm"** vẫn còn cho tới 7d (phục vụ tài khoản cũ), nhưng việc duyệt Yêu cầu **ngừng sinh Phiếu**.

## 2. Đề xuất cắt 7c-2 (cần duyệt)

| PR | Nội dung | Vì sao |
|---|---|---|
| **7c-2a** | email **bắt buộc** ở file Excel; duyệt Yêu cầu tạo tài khoản **Chờ kích hoạt** + xếp **thư kích hoạt**; Quản trị viên tạo Quản trị viên bằng email; bỏ sinh Phiếu khi duyệt | cùng một thay đổi cốt lõi ("tạo tài khoản = xếp thư"), đụng nhiều bài cũ |
| **7c-2b** | **Lời mời** tự gửi thư; **đổi email** và **xác thực email** (API, trang `/verify-email#mã`, mục Email ở trang Tài khoản); thư "email đã đổi" | dùng lại `AuthLinks`; có phần giao diện mới. **Cần cho hai Quản trị viên của production** (Q380) tự xác thực email để dùng được "Quên mật khẩu" |

Thứ tự đề xuất: **7c-2b trước**, vì nó mở đường cho hai Quản trị viên thật xác thực email (giá trị ngay), còn 7c-2a thay đổi quy trình nhập lớp và có thể làm sau khi anh chuẩn bị xong danh sách email sinh viên. Nếu anh muốn đúng thứ tự thiết kế gốc thì làm 7c-2a trước; không có ràng buộc kỹ thuật giữa hai bên.

Tài liệu này chi tiết cho **cả hai** (đánh dấu a hoặc b ở từng hành vi).

## 3. Điểm tiếp xúc cần duyệt

| # | Điểm tiếp xúc | Cách kiểm | Bắt được | Bỏ sót (nơi bù) |
|---|---|---|---|---|
| **K8** (a) | **Đọc file Excel**: email bắt buộc, sai định dạng, trùng trong file, trùng tài khoản có sẵn | bài đơn vị `account-request-file` (như bài cũ) | dòng thiếu email, sai định dạng, trùng được báo ngay lúc đọc | nội dung file thật của anh (thử bằng tay một lớp) |
| **K9** (a) | **Duyệt Yêu cầu** qua HTTP + job + **`MailService` thật + bộ dựng thật + vận chuyển giả** | bài tích hợp như `account-request-approval.int.test.ts` | tài khoản Chờ kích hoạt (không mật khẩu, không Phiếu), một thư kích hoạt mỗi người, làn hàng loạt, xoay vòng theo người tạo Yêu cầu, tài khoản có sẵn giữ email và không nhận thư (TC 16) | thư vào Inbox (kiểm tay, đã làm ở 7b) |
| **K10** (a) | **Quản trị viên tạo Quản trị viên** bằng email | bài tích hợp như `admin-users.int.test.ts` | email bắt buộc, Chờ kích hoạt, thư kích hoạt, không mật khẩu | |
| **K11** (b) | **Lời mời gửi thư**: tạo, gửi lại, thu hồi, nhận | bài tích hợp + bộ dựng thật | thư mời tự gửi (làn khẩn), mã sinh **lúc gửi**, tạo lại làm mã cũ mất hiệu lực, nhận Lời mời xác thực email | |
| **K12** (b) | **Đổi email và xác thực email** (`AuthLinks` loại `email_change`) | bài tích hợp (dịch vụ và HTTP) | cần mật khẩu hiện tại; email chỉ đổi khi bấm liên kết; hạn 24 giờ; trùng email bị chặn cả lúc xin lẫn lúc bấm; thư báo tới email cũ | |
| **K13** (b) | **Giao diện**: mục Email ở trang Tài khoản, trang `/verify-email#mã`, trang nhận Lời mời | E2E (Playwright, điện thoại và máy tính) | luồng trọn vẹn, mã xóa khỏi thanh địa chỉ, mỗi trạng thái một trang, không cuộn ngang | |
| **K14** (a, b) | **Bất biến**: không mã, không mật khẩu trong log, nhật ký, bảng, hàng đợi | bài quét như 7c-1 (A-27) mở rộng | | |

## 4. Quyết định thiết kế cần duyệt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| a | Cắt thành 7c-2a và 7c-2b, làm 2b trước? | **Có** (mục 2) |
| b | Phiếu tài khoản và "Cấp lại mật khẩu tạm" còn tới 7d; duyệt Yêu cầu ngừng sinh Phiếu ngay ở 7c-2a? | **Có**: duyệt Yêu cầu chỉ tạo Chờ kích hoạt. Mã xóa Phiếu để 7d |
| c | Liên kết Lời mời: giữ `/invite/<mã>` (mã trong đường dẫn, vào log máy chủ) hay đổi sang `/invite#mã` như các liên kết khác (quyết định mảnh `#` ở 7c-1)? | **Đổi sang mảnh `#`** cho nhất quán; an toàn vì production chưa có Lời mời nào còn hiệu lực (anh đã xác nhận chưa có người dùng thật). Trang `/invite/$token` cũ chuyển hướng hoặc báo "liên kết cũ, xin gửi lại" |
| d | Nhận Lời mời xong có **tự đăng nhập** (như hiện nay) hay không (như kích hoạt, theo OWASP)? | **Giữ như hiện nay** (thiết kế gốc ghi "như Lời mời hiện nay"); Người ra đề vừa đặt mật khẩu và vào luôn. Nếu anh muốn đồng nhất thì sửa |
| e | Dòng thiếu email ở file Excel báo lỗi gì? Mã định danh còn bắt buộc không? | lỗi mới `missing_email` thay `missing_code_and_email`; **mã định danh vẫn tùy chọn** (tên đăng nhập mặc định là mã viết thường, không có mã thì dùng email) |
| f | Tài khoản có sẵn (khớp mã hoặc email) khi duyệt: giữ nguyên email, không gửi thư (TC 16) | **Có**; màn duyệt ghi "đã có tài khoản, giữ nguyên email, không gửi thư" |
| g | Quản trị viên tạo Quản trị viên khác bằng email: gộp vào 7c-2a? | **Có** (cùng cơ chế "tạo = xếp thư"); thư thuộc làn **khẩn** |
| h | Đổi email của chính mình cần **mật khẩu hiện tại**; email mới không được trùng tài khoản chưa Xóa; kiểm lại lúc bấm liên kết (có thể người khác lấy mất trong lúc chờ) | **Có**, theo thiết kế 3.4 |
| i | "Gửi thư xác thực" cho email đang lưu (hai Quản trị viên của production) | dùng chính loại `email_change` với địa chỉ mới bằng địa chỉ hiện có; chịu giới hạn 3 lần mỗi giờ như Quên mật khẩu |
| j | Tên đăng nhập của `quantri` (chưa có email): nhập email lần đầu cũng qua luồng đổi email (cần mật khẩu hiện tại, bấm liên kết) | **Có**, không có đường tắt |

## 5. Danh sách hành vi và thứ tự lát

Mỗi dòng một bài; làm lần lượt, mỗi bài đỏ rồi xanh. TC là tiêu chí ở mục 13 của [tài liệu thiết kế email](./slice-7-phuong-an-b-email.md).

### 7c-2b (làm trước)

**Lát 1: xác thực email của chính mình (K12), đường xuyên suốt nhỏ nhất.** B-01: `requestEmailChange(user, mật khẩu hiện tại, email mới)` rồi dùng liên kết trong thư thì email đổi và được đánh dấu đã xác thực (TC 1, 5).

**Lát 2: bảo vệ đổi email (K12).** B-02: sai mật khẩu hiện tại bị từ chối, không xếp thư. B-03: email chưa đổi cho tới khi bấm liên kết (đăng nhập bằng email cũ còn được). B-04: email mới trùng tài khoản chưa Xóa bị chặn lúc xin (lỗi rõ). B-05: lúc bấm liên kết mà email đã bị người khác lấy thì từ chối kèm lý do, không đổi. B-06: hạn 24 giờ đúng mốc (dùng lại bộ bài hạn của `AuthLinks`). B-07: xin hai lần thì mã cũ bị thay. B-08: đổi xong gửi **thư báo tới email cũ** (không có liên kết, không có mật khẩu) (TC 14). B-09: "Gửi thư xác thực" cho email đang lưu hoạt động đúng như B-01 và chịu giới hạn 3/giờ (câu i).

**Lát 3: Lời mời gửi thư (K11).** B-10: tạo Lời mời xếp thư mời (làn khẩn) tới email trong Lời mời; thư có liên kết `/invite#mã`; mã sinh lúc gửi. B-11: gửi lỗi tạm thời rồi thử lại: mã lần đầu mất hiệu lực. B-12: Tạo lại liên kết gửi thư mới và liên kết cũ chết. B-13: Thu hồi thì liên kết chết. B-14: nhận Lời mời qua liên kết trong thư đặt mật khẩu và tạo Người ra đề, **email đã xác thực**. B-15: hạn 7 ngày tính từ lúc gửi. B-16: Lời mời tới email của Quản trị viên hoặc Người ra đề có sẵn vẫn bị từ chối như hiện nay (Q79).

**Lát 4: bất biến (K14).** B-17: quét log, nhật ký, `auth_tokens`, `invitations`, `email_outbox`: mã và mật khẩu chỉ nằm trong thư; không email đầy đủ trong log.

**Lát 5: giao diện (K13, Playwright).** E-01: mục Email ở trang Tài khoản (hiện email, trạng thái đã hay chưa xác thực, nút "Gửi thư xác thực", form "Đổi email" có mật khẩu hiện tại). E-02: trang `/verify-email#mã` thành công, hết hạn, đã dùng, bị thay, email đã bị lấy, mỗi trạng thái một trang (TC 14). E-03: mã xóa khỏi thanh địa chỉ. E-04: trang nhận Lời mời mới (mảnh `#`). E-05: không cuộn ngang ở 375 px, sáng và tối. E-06: bộ E2E cũ vẫn xanh (trừ bài Lời mời cũ phải sửa đường dẫn).

### 7c-2a

**Lát 6: đọc file (K8).** B-18: dòng thiếu email báo `missing_email` ngay lúc đọc. B-19: email sai định dạng, trùng trong file: báo như hiện nay. B-20: dòng chỉ có mã (không email) không còn hợp lệ. B-21: mã định danh vẫn tùy chọn; tên đăng nhập mặc định đúng quy tắc cũ.

**Lát 7: duyệt tạo Chờ kích hoạt (K9).** B-22: duyệt một dòng mới tạo tài khoản **không có mật khẩu**, `activated_at` rỗng, không mật khẩu tạm, **không Phiếu** (TC 1). B-23: mỗi dòng mới xếp đúng **một thư kích hoạt** (làn hàng loạt, `requestedBy` là Người ra đề tạo Yêu cầu). B-24: tài khoản có sẵn (khớp mã hoặc email) giữ nguyên email, thêm nhãn, **không nhận thư** (TC 16). B-25: duyệt 500 dòng xếp 500 thư trong một giao dịch dưới 300 ms. B-26: thư gửi dần theo hạn mức và xoay vòng giữa hai Người ra đề (dùng lại bộ bài 7b, kiểm bằng luồng thật). B-27: người dùng kích hoạt bằng liên kết trong thư rồi đăng nhập được (nối với 7c-1). B-28: dòng bị từ chối không tạo gì và không gửi thư.

**Lát 8: Quản trị viên tạo Quản trị viên (K10).** B-29: email bắt buộc. B-30: tạo xong ở Chờ kích hoạt, không mật khẩu, nhận thư kích hoạt (làn khẩn). B-31: Quản trị viên mới kích hoạt bằng liên kết rồi đăng nhập; không còn đường đặt mật khẩu ban đầu.

**Hiệu năng (AGENTS.md):** B-25 và: `requestEmailChange` dưới 300 ms (có kiểm mật khẩu bằng Argon2); `consume` đổi email dưới 100 ms.

## 6. Bài cũ phải sửa (có chủ ý)

| Tệp | Lý do | Cách sửa |
|---|---|---|
| `apps/api/test/account-request-approval.int.test.ts` | dựa vào mật khẩu tạm và Phiếu khi duyệt | viết lại theo B-22 đến B-28 |
| `apps/api/test/account-requests.int.test.ts` | file mẫu và dòng chỉ có mã | thêm cột email bắt buộc |
| `apps/api/test/admin-users.int.test.ts` | Quản trị viên tạo Quản trị viên có mật khẩu | theo B-29 đến B-31 |
| `apps/api/test/public-invitations.int.test.ts`, `admin-invitations.int.test.ts` | đường dẫn `/invite/<mã>` và nhận Lời mời | theo B-10 đến B-16 |
| `apps/web/e2e/account-requests.spec.ts`, `invitations.spec.ts` | Phiếu, mật khẩu tạm, đường dẫn Lời mời | viết lại theo luồng mới |
| `apps/web/e2e/*` dùng người dùng seed | không đổi: người dùng seed vẫn có mật khẩu | giữ nguyên |

Không đổi (còn dùng tới 7d): `session-reissue.int.test.ts`, `password-recovery.int.test.ts` (cấp lại mật khẩu tạm), `credential-slips` và bài phiếu.

## 7. Cách tự kiểm chất lượng

Như 7b và 7c-1: đỏ đúng lý do (kể cả bài E2E, **lần này chạy thấy đỏ trước khi làm giao diện**); **đột biến** (bỏ kiểm mật khẩu hiện tại; đổi email ngay khi xin; bỏ kiểm trùng lúc bấm; thư báo không gửi cho email cũ; Lời mời lưu mã trong hàng đợi; duyệt vẫn sinh mật khẩu hoặc Phiếu; tài khoản có sẵn bị ghi đè email hoặc nhận thư; thư kích hoạt sai làn hoặc thiếu `requestedBy`; không bắt buộc email; Quản trị viên mới có mật khẩu); bộ bài cũ vẫn xanh trừ mục 6; từng bài dưới 1 giây; ghi kết quả vào tài liệu cùng PR.

## 8. Định nghĩa "xong"

Mọi bài mục 5 xanh; đột biến chạy và ghi kết quả; lint, `tsc`, `architecture.test`, bộ tích hợp và E2E đầy đủ xanh; cập nhật cùng PR: `docs/data-model.md`, `docs/architecture.md`, `docs/ops/tai-khoan-va-mat-khau.md` (đường tạo tài khoản mới), `docs/ops/gui-thu.md`, `GLOSSARY.md` nếu có thuật ngữ mới. Sau 7c-2b: hai Quản trị viên của production **xác thực được email** (Q380), rồi mới dùng "Quên mật khẩu" được.

## 9. Điều cần chủ dự án quyết

1. **Duyệt cách cắt 7c-2a và 7c-2b và thứ tự** (mục 2): tôi đề xuất **2b trước**.
2. **Duyệt các điểm tiếp xúc K8 đến K14** (mục 3).
3. **Duyệt các quyết định a đến j** (mục 4), nhất là **b** (ngừng sinh Phiếu khi duyệt, giữ Phiếu và "Cấp lại mật khẩu tạm" tới 7d), **c** (Lời mời dùng mảnh `#`), **d** (giữ tự đăng nhập sau khi nhận Lời mời), **e** (mã định danh vẫn tùy chọn).
4. Danh sách hành vi và thứ tự lát (mục 5), và **danh sách bài cũ phải sửa** (mục 6): có bài nào anh muốn giữ nguyên hành vi không.
5. **Một câu cho anh về dữ liệu thật:** trước khi bật 7c-2a ở production, lớp của anh có **email của từng sinh viên** chưa (email trường hay email cá nhân)? Nếu chưa có, đường tạo tài khoản mới sẽ bị chặn ở bước nhập file; khi đó nên làm 2b trước và hoãn 2a.

## 10. Quyết định đã duyệt (12/11/2026)

**Điều kiện đổi email của người dùng: chủ dự án đồng ý toàn bộ đề xuất** (cuộc trao đổi 12/11/2026):

- **Ai làm:** chỉ chính người đó, đang đăng nhập, tài khoản Hoạt động. Người ra đề không đổi hộ email của Người dự thi đã kích hoạt.
- **Khi xin:** bắt buộc mật khẩu hiện tại; email mới đúng định dạng, không trùng tài khoản chưa Xóa, khác email hiện tại (trừ "Gửi thư xác thực" cho chính email đang lưu); tối đa 3 lần mỗi giờ, cách nhau 60 giây.
- **Hiệu lực:** chỉ khi bấm liên kết gửi tới email **mới** (một lần, 24 giờ, xin lần hai làm liên kết cũ chết); kiểm lại trùng email lúc bấm; bấm xong email mới được coi là đã xác thực; gửi thư báo tới email cũ.
- **Đề xuất kèm theo, chốt khi tới lát đổi email:** không thu hồi các phiên khác khi đổi email; thư báo chưa có nút "đây không phải tôi"; `quantri` chưa có email cũng đi đúng luồng này, không đường tắt; không tự đổi tên đăng nhập khi đổi email.

**Chủ dự án yêu cầu các câu chi tiết còn lại được hỏi đúng lúc tới lát cắt tương ứng**, không hỏi trước. Năm câu ở mục 9 (cắt 7c-2a/2b, mảnh `#` cho Lời mời, tự đăng nhập sau nhận Lời mời, mã định danh tùy chọn, email sinh viên) sẽ được xác nhận khi bắt đầu từng lát liên quan.

## 11. Kết quả triển khai 7c-2b (12/11/2026)

Làm theo TDD: bài viết trước, thấy đỏ đúng lý do rồi mới viết mã. **Lần này bài E2E đã chạy thấy đỏ (6/6) trước khi làm giao diện** (khác 7c-1).

### 11.1 Quyết định của chủ dự án trong lúc làm (12/11/2026)

- **Mã Lời mời ở mảnh `#`** (`/invite#mã`), nhất quán với các liên kết khác; liên kết kiểu cũ `/invite/<mã>` báo không dùng được.
- **Giữ tự đăng nhập sau khi nhận Lời mời** (như hiện nay).
- **Làm 7c-2b trước 7c-2a**, vì chủ dự án chưa thu thập email sinh viên.

### 11.2 Số bài

| Nhóm | Tệp | Bài |
|---|---|---|
| Đổi và xác thực email (K12), bất biến (K14): B-01 đến B-10, B-17b, B-18 | `apps/api/test/account-email.int.test.ts` | 16 |
| Lời mời gửi thư (K11): B-10 đến B-17 | `apps/api/test/invitation-mail.int.test.ts` | 8 |
| Lời mời cũ chuyển sang luồng mới (assertion hành vi giữ nguyên) | `admin-invitations.int.test.ts`, `public-invitations.int.test.ts` | 14 và 15 |
| Giao diện (K13): E-01 đến E-05 | `apps/web/e2e/account-email.spec.ts` | 5 bài, chạy desktop và mobile |
| Lời mời trên giao diện (đã viết lại) | `apps/web/e2e/invitations.spec.ts` | 1 bài |

Toàn bộ bộ tích hợp của dự án: **1009 đạt**, 1 bỏ qua (có sẵn).

### 11.3 Điều chỉnh so với thiết kế (phát hiện khi làm)

| # | Điều chỉnh | Lý do |
|---|---|---|
| i | API Lời mời đổi sang **`POST /api/invitations/preview` và `accept` với mã trong thân** (bỏ hai đường có mã trong URL) | mã trong đường dẫn API vào nhật ký máy chủ dù trang dùng mảnh `#` |
| ii | Trang `/verify-email` **xác nhận bằng nút bấm**, không tự xác nhận khi mở | trình quét liên kết của hộp thư không bấm nút nên không vô tình xác nhận thay người dùng |
| iii | `MailService.cancelPending(kind, context)` | Thu hồi Lời mời trước khi thư kịp gửi phải hủy thư (không để kẹt thử lại rồi thất bại) |
| iv | Ô mật khẩu trong mục Email đặt nhãn **"Mật khẩu hiện tại để đổi email"** | trang có hai ô "Mật khẩu hiện tại" gây khó cho trình đọc màn hình (E2E cũ phát hiện) |
| v | `useLinkToken` dựng lại trang khi dán liên kết khác vào **cùng tab** (chỉ đổi mảnh `#`) | trang giữ kết quả của liên kết cũ (E2E phát hiện) |
| vi | Route Lời mời kiểu cũ đặt tên `invite_.$token` | tên `invite.$token` bị TanStack coi là con của `invite` nên không hiển thị |

### 11.4 Kiểm thử đột biến

18 đột biến (kiểm mật khẩu hiện tại, email giống hiện tại, trùng lúc xin và lúc bấm, giới hạn tần suất, xác thực email đã xác thực rồi, đánh dấu xác thực, thư báo tới email cũ và địa chỉ che bớt, sinh mã lúc gửi, thu hồi và Tạo lại, Lời mời đã thu hồi, hạn 7 ngày, xác thực khi nhận Lời mời, làn thư, người mời): **15 bị bắt ngay, 2 sống sót ban đầu rồi bị bắt sau khi siết bài, 1 phòng thủ hai lớp.** Lỗ hổng của bộ bài đã vá: B-13 kiểm thư bị hủy (`skipped`) chứ không chỉ "không gửi", B-01 kiểm làn `urgent`. Đột biến Y11 (xây thư cho Lời mời đã thu hồi) không tách riêng được vì hủy thư đã chặn trước; giữ kiểm ở bộ dựng như lớp phòng thủ thứ hai.

Một lỗi thật bắt được ngay trong lúc làm: biến `previousEmail` chưa được gán nên thư báo tới email cũ không bao giờ gửi (B-08 bắt).

### 11.5 Chưa làm

7c-2a (email bắt buộc ở file Excel, duyệt tạo Chờ kích hoạt, Quản trị viên tạo Quản trị viên bằng email). 7d: gửi lại, sửa email, liên kết hỗ trợ, bảng theo dõi, chuông, bỏ Phiếu và "Cấp lại mật khẩu tạm". **Việc của chủ dự án sau khi deploy:** hai Quản trị viên vào trang Tài khoản bấm "Gửi thư xác thực" để xác thực email, rồi mới nhận được thư đặt lại mật khẩu.
