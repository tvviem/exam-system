# PR 7d: thiết kế kiểm thử (hỗ trợ kích hoạt, theo dõi, hạn mức, bỏ Phiếu tài khoản), làm theo TDD

**Trạng thái: ĐÃ DUYỆT (14/11/2026, mục 11). 7d-1, 7d-2 đã merge; 7d-3 đã làm xong, chờ PR (mục 16).** Cách làm như [7b](./slice-7b-thiet-ke-kiem-thu.md), [7c-1](./slice-7c-thiet-ke-kiem-thu.md), [7c-2](./slice-7c2-thiet-ke-kiem-thu.md): điểm tiếp xúc, hành vi, lát dọc, cách tự kiểm; duyệt xong mới vòng đỏ rồi xanh.

Căn cứ: [ADR-0009](../adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md); [slice-7-phuong-an-b-email.md](./slice-7-phuong-an-b-email.md) mục 3.3, 3.6, 3.7, 7, 8 và tiêu chí 5, 8, 9, 10, 12, 14 (Q374 đến Q377, Q384). Hạ tầng đã có: `MailService` (7b), `AuthLinks` kèm loại `support_link` (7c-1), đổi và xác thực email, Lời mời gửi thư (7c-2b), tạo tài khoản bằng thư kích hoạt (7c-2a). **Đã chạy thật ở production (14/11/2026)**: kích hoạt, quên mật khẩu, thư tới Gmail.

## 1. 7d làm gì, và vì sao cần

Hết 7c, **đường vào** đã xong. Còn thiếu **đường xử lý khi thư không tới** và **thấy ai chưa kích hoạt** trước ngày thi:

| Tình huống thật | Hiện nay | Sau 7d |
|---|---|---|
| Sinh viên không thấy thư kích hoạt (vào rác, gõ sai email) | không có cách gì ngoài bảo họ bấm "Quên mật khẩu?" | **Gửi lại**, **Sửa email**, hoặc **Liên kết hỗ trợ** đưa tận tay |
| Giảng viên muốn biết "lớp tôi ai chưa kích hoạt" trước giờ thi | không thấy | **bảng theo dõi kích hoạt** (ai chưa gửi, đã gửi, thư lỗi, cần kiểm tra, đã kích hoạt) |
| Quản trị viên muốn biết hàng đợi thư và hạn mức Gmail | chỉ xem được bằng lệnh (`prod-preflight`) | màn **Hàng đợi thư** và **chuông** khi quá 70 % hạn mức |
| Người dùng quên mật khẩu hoặc làm mất | **Cấp lại mật khẩu tạm** (Quản trị viên biết mật khẩu) | bỏ hẳn; dùng Quên mật khẩu hoặc Liên kết hỗ trợ |
| Phiếu tài khoản (PDF mật khẩu tạm) | còn tải được tới hết hạn | **xóa hẳn** (giao diện, API, job dọn, khóa mã hóa, bảng) |
| Đăng nhập vào tài khoản chưa kích hoạt | báo sai tên hoặc mật khẩu, người dùng không biết vì sao | thông điệp chỉ đường (không lộ tài khoản nào tồn tại, mục 5, quyết định f) |

## 2. Đề xuất cắt 7d (cần duyệt)

7d được thiết kế gốc là một PR "lớn". Đề xuất **3 PR**, mỗi PR đứng được riêng và giao giá trị ngay:

| PR | Nội dung | Vì sao thứ tự này |
|---|---|---|
| **7d-1 Hỗ trợ kích hoạt** | dịch vụ lõi `AccountSupport` (Gửi lại, Sửa email, Liên kết hỗ trợ, chính sách quyền theo vai trò); màn Quản trị viên (chi tiết người dùng, bộ lọc "chưa kích hoạt / email chưa xác thực"); thông điệp đăng nhập; chuông "đặt lại mật khẩu của Người ra đề hoặc Quản trị viên" | giảng viên sắp tải file thật: cần ngay cách xử lý thư không tới. Mọi thao tác nằm ở **một dịch vụ**, 7d-2 chỉ thêm màn hình |
| **7d-2 Theo dõi của Người ra đề** | bảng theo dõi kích hoạt (ở trang Yêu cầu và ở Danh sách dự thi); Gửi lại từng dòng và tất cả; Sửa email; Liên kết hỗ trợ; khung hạn mức và hàng đợi; màn Quản trị viên **Hàng đợi thư**; chuông quá 70 % hạn mức | cần 7d-1 (dùng lại dịch vụ và chính sách quyền) |
| **7d-3 Dọn Phiếu và hoàn tất** | xóa Phiếu tài khoản và "Cấp lại mật khẩu tạm" (cả của Quản trị viên và của Người ra đề), migration bỏ bảng `credential_slips`, bỏ `SLIP_ENCRYPTION_KEY`; `prod-preflight` **bắt buộc có SMTP**; checklist; tài liệu | xóa là **một chiều**, làm cuối khi hai PR trên đã chạy ổn |

Nếu anh muốn một PR duy nhất thì được, nhưng PR sẽ rất lớn (ước tính gấp đôi 7c-2b), khó duyệt và khó lùi.

## 3. Điểm tiếp xúc cần duyệt

| # | Điểm tiếp xúc | Cách kiểm | Bắt được | Bỏ sót (nơi bù) |
|---|---|---|---|---|
| **K15** | **Chính sách quyền** `canSupport(actor, target)` | bài đơn vị bảng kịch bản (hàm thuần) | Quản trị viên mọi tài khoản; Người ra đề chỉ tài khoản **Chờ kích hoạt** mà mình có quyền theo Q384; người khác bị từ chối; tài khoản đã Xóa hoặc Quản trị viên | quyền ở tầng HTTP (K16) |
| **K16** | **`AccountSupport`** qua HTTP + `MailService` thật + bộ dựng thật + vận chuyển giả | bài tích hợp như `account-email.int.test.ts` | Gửi lại (giới hạn 1 lần/24 giờ mỗi sinh viên), Sửa email (có lý do, nhật ký, mã cũ chết, thư mới), Liên kết hỗ trợ (hiện một lần, 60 phút, lý do bắt buộc, nhật ký, email vẫn chưa xác thực), mọi thao tác ghi `audit_logs` không chứa mã | thư thật vào Inbox (kiểm tay) |
| **K17** | **Bảng theo dõi** (truy vấn trạng thái kích hoạt) | bài tích hợp | đúng 7 trạng thái (Chưa gửi, Đã gửi, Thư lỗi, Cần kiểm tra quá 48 giờ, Chờ kích hoạt, Đã kích hoạt, Email chưa xác thực) từ `email_outbox` và `users`; chỉ thấy tài khoản mình có quyền; phân trang | dữ liệu thật nhiều (đo ở mục 8) |
| **K18** | **Hạn mức hiển thị và chuông** | bài tích hợp với đồng hồ giả | "đã gửi X/300", "còn N thư trước thư của bạn", dự kiến xong; chuông quá 70 % rồi tự gỡ; chuông khi đặt lại mật khẩu Người ra đề hoặc Quản trị viên (không báo cho chính người đó) | |
| **K19** | **Giao diện** | E2E (điện thoại và máy tính) | luồng trọn vẹn của Quản trị viên và Người ra đề; hộp Liên kết hỗ trợ (hiện một lần, sao chép); bảng không cuộn ngang ở 375 px, sáng và tối | |
| **K20** | **Bất biến** | bài quét như 7c (A-27, B-17) mở rộng | không mã, không mật khẩu trong log, nhật ký, bảng, hàng đợi; **Quản trị viên không bao giờ nhận được mật khẩu** | |
| **K21** | **Xóa Phiếu (7d-3)** | bài tích hợp + bài kiến trúc | không còn đường tạo, tải, hay dọn Phiếu; migration chạy được trên dữ liệu có sẵn; `prod-preflight` đỏ khi thiếu SMTP | |

## 4. Quyết định thiết kế cần duyệt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| a | Cắt 7d thành 3 PR theo mục 2? | **Có** |
| b | Bảng theo dõi nằm ở đâu? Thiết kế gốc ghi "trong Danh sách dự thi", nhưng giảng viên cần biết **ngay sau khi tải file**, lúc sinh viên chưa nằm trong Phiên thi nào | **Cả hai nơi**: (1) trang chi tiết **Yêu cầu cấp tài khoản** (mỗi dòng đã tạo hiện trạng thái kích hoạt, có Gửi lại, Sửa email, Liên kết hỗ trợ), vì Người ra đề tạo Yêu cầu có quyền theo Q384; (2) **Danh sách dự thi** của Phiên thi hiện dấu "chưa kích hoạt" cùng các nút đó cho sinh viên trong Phiên thi |
| c | **Sửa email** của tài khoản đã **Hoạt động** (chỉ Quản trị viên, có lý do): xử lý thế nào? | email mới **chưa xác thực** (`email_verified_at` rỗng); gửi thư xác thực tới email mới; **thư báo tới email cũ** (như đổi email tự phục vụ); **không** thu hồi phiên (Khóa đăng nhập là quyết định riêng); nhật ký ghi email cũ, mới, lý do |
| d | **Sửa email** của tài khoản **Chờ kích hoạt**: xử lý thế nào? | thay email, **mã kích hoạt cũ chết**, tự **gửi thư kích hoạt** tới email mới **ngay** (sửa email là hành động mới nên **không** tính vào giới hạn Gửi lại 1 lần/24 giờ); nhật ký có lý do |
| e | **Liên kết hỗ trợ** cho tài khoản Chờ kích hoạt hoặc Hoạt động: loại và hạn | `activation` (Chờ kích hoạt) hoặc `password_reset` (Hoạt động); **hạn 60 phút**; **lý do bắt buộc**; hiện **một lần** trong hộp thoại (có nút sao chép), không lưu; tạo mã mới làm **mã cũ cùng loại chết**; dùng xong thì tài khoản **Hoạt động nhưng email chưa xác thực** (Q377) |
| f | Thông điệp đăng nhập cho tài khoản chưa kích hoạt: thiết kế gốc ghi "Tài khoản chưa được kích hoạt. Kiểm hộp thư…", nhưng nếu chỉ hiện cho tài khoản Chờ kích hoạt thì **lộ ra tên đăng nhập nào tồn tại** | **Một câu chung cho mọi đăng nhập thất bại**: "Sai tên đăng nhập hoặc mật khẩu. Nếu bạn chưa kích hoạt tài khoản, hãy kiểm tra hộp thư (cả thư rác) hoặc bấm Quên mật khẩu." Không lộ gì. (Đổi so với thiết kế gốc, cần anh đồng ý) |
| g | "Gửi lại cho tất cả" của Người ra đề: phạm vi | chỉ gửi các dòng **đủ điều kiện** (Chờ kích hoạt, chưa gửi lại trong 24 giờ), mỗi Người ra đề tối đa **1 lần mỗi 6 giờ** (Q375); báo "đã xếp N thư, bỏ qua M người chưa đủ điều kiện" |
| h | Quản trị viên có bị giới hạn Gửi lại 1 lần/24 giờ mỗi sinh viên không? | **Có, cùng giới hạn** (Q375); khi thư không tới thì dùng Sửa email hoặc Liên kết hỗ trợ, không gửi lặp lại. Quản trị viên **bỏ qua** giới hạn 1 lần/6 giờ của "Gửi lại cho tất cả" |
| i | Xóa Phiếu tài khoản (7d-3): bỏ bảng `credential_slips` luôn hay giữ bảng chỉ bỏ mã? | **Bỏ bảng** bằng migration (production có **0 Phiếu**, đã kiểm 14/11/2026). Là **cửa một chiều** nhưng không có dữ liệu để mất; dev và drill có thể có dữ liệu thử, vô hại. Bỏ cả `SLIP_ENCRYPTION_KEY` khỏi `api.env` và `.env.example` (mã vẫn chạy nếu khóa còn dư) |
| j | "Cấp lại mật khẩu tạm" của **Quản trị viên** và của **Người ra đề** ở Danh sách dự thi | **Bỏ cả hai** ở 7d-3; thay bằng Quên mật khẩu và Liên kết hỗ trợ. Lệnh vận hành `prod-recover-admin` giữ nguyên (ngoại lệ có chủ ý, in mật khẩu tạm một lần) |
| k | `prod-preflight` khi thiếu SMTP | **đỏ cố định** (hiện chỉ cảnh báo vì hệ thống chưa gửi thư thật); chạy ở 7d-3 |
| l | Chuông quá 70 % hạn mức: đo thế nào? | số thư đã gửi trong **24 giờ trượt** so với trần 400 (đã đủ chỗ cho 100 thư khẩn dự trữ); vượt **280 thư** thì có chuông cho mọi Quản trị viên; hạ dưới 70 % thì chuông tự gỡ; mỗi ngày tối đa **một** chuông mới, không dội liên tục |

## 5. Danh sách hành vi và thứ tự lát

Mỗi dòng một bài; làm lần lượt, mỗi bài đỏ rồi xanh. Ký hiệu D-nn.

### 7d-1 Hỗ trợ kích hoạt

**Lát 1: chính sách quyền (K15).** D-01: Quản trị viên được hỗ trợ mọi tài khoản chưa Xóa và không Bị Khóa (kể cả tạo Liên kết hỗ trợ cho chính mình, vì không thêm đặc quyền nào). D-02: Người ra đề được hỗ trợ tài khoản **Chờ kích hoạt** do Yêu cầu của mình đã tạo. D-03: Người ra đề được hỗ trợ tài khoản Chờ kích hoạt có trong Danh sách dự thi của **Phiên thi chưa kết thúc của mình** (Q384). D-04: Người ra đề **không** được hỗ trợ tài khoản đã Hoạt động. D-05: Người ra đề không được hỗ trợ tài khoản của người khác (không thuộc Yêu cầu hay Phiên thi của mình). D-06: không ai hỗ trợ tài khoản đã Xóa hoặc đang Bị Khóa (báo lý do). D-07: Người ra đề không được hỗ trợ tài khoản Quản trị viên.

**Lát 2: Gửi lại (K16).** D-08: Gửi lại xếp **một thư kích hoạt mới** (làn hàng loạt cho Người ra đề, làn khẩn cho Quản trị viên), mã cũ chết khi thư mới được dựng. D-09: lần hai trong 24 giờ bị từ chối kèm giờ được gửi lại. D-10: tài khoản Hoạt động có email chưa xác thực: Gửi lại là **thư xác thực** (loại `email_change` tới chính email đó), không phải thư kích hoạt. D-11: tài khoản Hoạt động đã xác thực: từ chối ("không còn gì để gửi lại"). D-12: nhật ký ghi ai gửi lại cho ai.

**Lát 3: Sửa email (K16).** D-13: Chờ kích hoạt: email đổi ngay, mã cũ chết, thư kích hoạt tự gửi tới email mới (quyết định d). D-14: Hoạt động (chỉ Quản trị viên): email mới chưa xác thực, thư xác thực tới email mới, thư báo tới email cũ không chứa liên kết (quyết định c). D-15: **lý do bắt buộc** (Quản trị viên); Người ra đề cũng nhập lý do, ghi nhật ký. D-16: email mới trùng tài khoản chưa Xóa bị từ chối (409, trường email). D-17: định dạng sai bị từ chối. D-18: nhật ký ghi email cũ (che bớt trong log, đầy đủ trong `audit_logs`), mới, lý do; **không chứa mã**.

**Lát 4: Liên kết hỗ trợ (K16).** D-19: tạo cho tài khoản Chờ kích hoạt: liên kết loại `activation`, hạn 60 phút, hiện **một lần** trong phản hồi, lý do bắt buộc (thiếu lý do: 400). D-20: dùng liên kết (qua `/activate#mã`) đặt được mật khẩu; tài khoản **Hoạt động, email chưa xác thực**; đăng nhập được. D-21: tạo cho tài khoản Hoạt động: loại `password_reset`, người dùng tự đặt mật khẩu mới, mọi phiên cũ bị thu hồi, thư báo "mật khẩu đã đổi" tới email nếu có. D-22: tạo mới làm liên kết cũ cùng loại chết (và thư kích hoạt đang chờ không làm hỏng liên kết hỗ trợ). D-23: hết 60 phút thì chết (đúng mốc, dùng bộ bài hạn của `AuthLinks`). D-24: **mã không nằm** ở nhật ký, `auth_tokens`, log, hàng đợi thư; phản hồi là nơi duy nhất hiện mã.

**Lát 5: danh sách, đăng nhập, chuông (K16, K18).** D-25: danh sách người dùng của Quản trị viên lọc được "chưa kích hoạt", "email chưa xác thực", "thư lỗi". D-26: thông điệp đăng nhập chung (quyết định f): **giống hệt** cho tên không tồn tại, sai mật khẩu, tài khoản Chờ kích hoạt (kể cả nội dung và thời gian gần nhau). D-27: chuông cho các Quản trị viên **khác** khi mật khẩu của Người ra đề hoặc Quản trị viên được đặt lại qua email (không báo cho chính người đó).

**Lát 6: bất biến và giao diện (K19, K20).** D-28: quét log, nhật ký, bảng: không mã, không mật khẩu; phản hồi API của Quản trị viên **không bao giờ** chứa mật khẩu. E-01: màn chi tiết người dùng (trạng thái kích hoạt và xác thực, ba nút, hộp lý do, hộp Liên kết hỗ trợ). E-02: không cuộn ngang ở 375 px, sáng và tối. E-03: thông điệp đăng nhập.

### 7d-2 Theo dõi của Người ra đề

**Lát 7: trạng thái (K17).** D-29: bảy trạng thái đúng theo bảng ở thiết kế gốc mục 7, tính từ `email_outbox` và `users`. D-30: "Cần kiểm tra" đúng mốc 48 giờ từ lần gửi thành công. D-31: Người ra đề chỉ thấy dòng mình có quyền (K15). D-32: phân trang và lọc theo trạng thái. D-33: trả lời dưới **300 ms** với 500 dòng.

**Lát 8: thao tác hàng loạt (K16).** D-34: "Gửi lại cho tất cả" chỉ xếp người đủ điều kiện, báo số bỏ qua. D-35: lần hai trong 6 giờ bị từ chối. D-36: hai Người ra đề cùng bấm: thư xoay vòng (dùng lại bài 7b).

**Lát 9: hạn mức (K18).** D-37: "đã gửi X/300, còn N thư trước thư của bạn, dự kiến xong khoảng HH:MM" tính đúng theo `planBatch`. D-38: chuông quá 280 thư/24 giờ, tự gỡ khi hạ, tối đa một chuông mỗi ngày (quyết định l). D-39: màn Hàng đợi thư của Quản trị viên (đang chờ, đã gửi, lỗi, số 24 giờ so với trần), **không hiện mã**.

**Lát 10: giao diện (K19).** E-04: bảng theo dõi ở trang Yêu cầu (Người ra đề và Quản trị viên). E-05: Danh sách dự thi hiện dấu "chưa kích hoạt" và nút. E-06: luồng Liên kết hỗ trợ hết đường (hộp một lần, sao chép). E-07: 375 px và 1280 px, sáng và tối, không cuộn ngang.

### 7d-3 Dọn Phiếu và hoàn tất

**Lát 11 (K21).** D-40: không còn API tải Phiếu, tạo "Cấp lại mật khẩu tạm" (admin và roster); gọi bị 404. D-41: migration bỏ `credential_slips` chạy được trên cơ sở dữ liệu đang có dòng và trống. D-42: job dọn không còn bước Phiếu; bước còn lại vẫn chạy. D-43: ứng dụng khởi động được khi **không** có `SLIP_ENCRYPTION_KEY`. D-44: `prod-preflight` **đỏ** khi thiếu SMTP (bài shell `test-mail-ops.sh`). D-45: `architecture.test` xanh sau khi gỡ module Phiếu. D-46: tài liệu vận hành, checklist phiên thi, `data-model.md`, `GLOSSARY.md` (bỏ Phiếu tài khoản) sửa trong cùng PR.

## 6. Bài cũ phải sửa hoặc xóa (có chủ ý)

| Tệp | Lý do | Cách xử lý |
|---|---|---|
| `apps/api/test/session-reissue.int.test.ts`, `password-recovery.int.test.ts` | thử "Cấp lại mật khẩu tạm" | xóa ở 7d-3 (hành vi bị bỏ); giữ phần trọn kịch bản quên mật khẩu bằng email của 7c-1 |
| `apps/api/test/account-request-approval.int.test.ts` (phần `seedSlip`, tải Phiếu, hết hạn, PDF thật, dọn dẹp) | Phiếu bị xóa | xóa các bài đó ở 7d-3 |
| `apps/web/e2e` bài Phiếu và mật khẩu tạm còn lại | như trên | xóa hoặc sửa theo luồng mới |
| `apps/api/test/architecture.test.ts` | module Phiếu biến mất | cập nhật |

## 7. Cách tự kiểm chất lượng

Như 7c: đỏ đúng lý do (E2E phải **thấy đỏ trước khi viết giao diện**); **đột biến** (bỏ kiểm quyền Người ra đề; Người ra đề hỗ trợ tài khoản Hoạt động; bỏ lý do bắt buộc; không vô hiệu mã cũ; Liên kết hỗ trợ xác thực email; lưu mã vào nhật ký; bỏ giới hạn Gửi lại; sai mốc 48 giờ; chuông cho chính người bị đặt lại; thông điệp đăng nhập phân biệt được tài khoản chờ kích hoạt; bỏ kiểm tài khoản Xóa hoặc Khóa); **một tiến trình đột biến mỗi lần** (bài học 13/11) và kiểm `git diff` trước, sau; bộ bài cũ vẫn xanh trừ mục 6; từng bài dưới 1 giây; kết quả ghi vào tài liệu cùng PR.

## 8. Hiệu năng (AGENTS.md)

D-33 (bảng theo dõi 500 dòng dưới 300 ms, có chỉ mục), D-39 (màn Hàng đợi thư), Liên kết hỗ trợ và Gửi lại dưới 300 ms (không gồm gửi thư, chạy nền), thông điệp đăng nhập không đổi thời gian đáng kể so với hiện nay.

## 9. Định nghĩa "xong"

Mọi bài mục 5 của PR đó xanh; đột biến chạy và ghi kết quả; lint, `tsc`, `architecture.test`, tích hợp và E2E đầy đủ xanh; cập nhật cùng PR: `docs/ops/tai-khoan-va-mat-khau.md` (đường xử lý thư không tới), `docs/ops/gui-thu.md`, `docs/ops/checklist-phien-thi.md` ("kích hoạt đủ trước ngày thi"), `docs/data-model.md`, `docs/architecture.md`, `GLOSSARY.md`.

## 10. Điều cần chủ dự án quyết

1. **Cách cắt 3 PR và thứ tự** (mục 2, quyết định a).
2. **Bảng theo dõi ở hai nơi** (quyết định b).
3. **Quyết định f**: thông điệp đăng nhập **chung cho mọi lần thất bại**, đổi so với thiết kế gốc để không lộ tài khoản nào tồn tại.
4. **Quyết định i, j, k** (xóa bảng Phiếu, bỏ cả hai "Cấp lại mật khẩu tạm", `prod-preflight` đỏ khi thiếu SMTP): đây là các **cửa một chiều** của 7d-3.
5. Các quyết định còn lại (c, d, e, g, h, l): tôi giữ theo đề xuất nếu anh không đổi.
6. Danh sách hành vi và **bài cũ phải xóa** (mục 5 và 6): có bài nào anh muốn giữ không.

## 11. Quyết định đã duyệt (14/11/2026)

Chủ dự án **đồng ý toàn bộ đề xuất** (a đến l, mục 10): cắt 3 PR theo thứ tự 7d-1, 7d-2, 7d-3; bảng theo dõi ở hai nơi; **thông điệp đăng nhập chung cho mọi lần thất bại** (quyết định f, đổi so với thiết kế gốc); xóa bảng `credential_slips`, bỏ cả hai "Cấp lại mật khẩu tạm", `prod-preflight` đỏ khi thiếu SMTP.

**Giải thích quyết định f cho chủ dự án (đã hỏi lại):** hiện nay người dùng chưa kích hoạt **đã** có đường tự cứu là "Quên mật khẩu?" (hệ thống gửi lại thư kích hoạt, giới hạn gửi lại). Câu thông điệp chung chỉ **dẫn họ tới đường đó**. Nếu thông điệp chỉ hiện "chưa kích hoạt" cho tài khoản chưa kích hoạt, người lạ gõ thử tên đăng nhập sẽ phân biệt được "tên này có tồn tại" (câu khác) với "không tồn tại" (câu thường), nên dò được danh sách mã sinh viên.

## 12. Chống lạm dụng và từ chối dịch vụ (K22, bổ sung 14/11/2026 theo câu hỏi của chủ dự án)

Chủ dự án hỏi về tấn công **từ chối dịch vụ** bằng cách gọi liên tục tới tên miền hoặc đăng nhập sai liên tục. Rà soát mã và cấu hình hiện có cho thấy hệ thống **đã có vài lớp nhưng còn hai lỗ hổng cụ thể**; mục này ghi lại hiện trạng, phần làm ngay ở 7d-1 và phần cần chủ dự án quyết.

### 12.1 Các lớp đã có

| Lớp | Có gì | Giới hạn |
|---|---|---|
| Cloudflare Tunnel | không mở cổng nào ra Internet; Cloudflare gánh tấn công tầng 3 và 4 (băng thông) | luật giới hạn tần suất tầng 7 và Bot Fight Mode **chưa cấu hình** (việc của chủ dự án, mục 12.4) |
| Đăng nhập | 10 lần mỗi 10 phút theo **tên đăng nhập**; theo **IP** (production đặt 1000 vì cả lớp dùng chung một IP); sai 5 lần thì chặn tài khoản 15 phút | xem lỗ hổng 1 và 2 |
| Quên mật khẩu | mỗi người 3 lần mỗi giờ, cách nhau 60 giây; mỗi IP 20 lần mỗi giờ; luôn một câu trả lời | kẻ dùng **nhiều IP** gửi tới nhiều tài khoản thật vẫn đốt được hạn mức thư (lỗ hổng 3) |
| Thư | hạn mức Gmail 400 mỗi 24 giờ, dành riêng 100 cho thư khẩn, 6 giây một thư | thư khẩn dùng chung cho Quên mật khẩu, Lời mời, hỗ trợ kích hoạt, đổi email |

### 12.2 Lỗ hổng tìm thấy

1. **Khóa nhắm vào một sinh viên.** Giới hạn đăng nhập đếm theo tên đăng nhập, **bất kể IP**. Kẻ biết mã sinh viên gửi 10 yêu cầu mỗi 10 phút là người thật đó **không đăng nhập được** (kể cả gõ đúng mật khẩu), còn 5 lần sai liên tiếp thì chặn tài khoản 15 phút. Rất rẻ để làm trước giờ thi.
2. **Đốt CPU bằng Argon2.** Mỗi lần đăng nhập, kể cả tên không tồn tại, chạy một lần băm Argon2 (khoảng 30 ms, cố ý để không lộ tài khoản qua thời gian). Nhiều nguồn cùng gửi thì tranh nhau bốn luồng của Node (dùng chung với đĩa và DNS), làm chậm cả bài thi đang diễn ra. Hiện **không có giới hạn số lần băm chạy đồng thời**.
3. **Đốt hạn mức thư.** Trước 7d-1, nhiều IP có thể gửi "Quên mật khẩu" tới hàng trăm tài khoản thật (mã dễ đoán) và dùng hết 100 thư khẩn trong 24 giờ.

### 12.3 Phần làm ở 7d-1 và phần cần quyết

| Việc | Trạng thái |
|---|---|
| **Ngân sách thư ẩn danh** của "Quên mật khẩu": 30 thư mỗi giờ, 60 thư mỗi ngày toàn hệ thống; tên không có thật, tài khoản Bị Khóa hay email chưa xác thực **không** tiêu ngân sách; vượt thì vẫn một câu trả lời, không gửi thêm; không chặn thư của người đã đăng nhập (D-47 đến D-50) | **đã làm ở 7d-1** |
| Giới hạn thao tác hỗ trợ: Gửi lại 1 lần mỗi 24 giờ mỗi sinh viên; Liên kết hỗ trợ 30 lần mỗi giờ mỗi người tạo | **đã làm ở 7d-1** |
| Lỗ hổng 1: đếm giới hạn và khóa **theo cặp (tên đăng nhập, IP)** thay vì chỉ tên đăng nhập, kèm trần cao theo tên đăng nhập (chống đoán mật khẩu từ nhiều IP) | **đã làm (PR đăng nhập chống từ chối dịch vụ, mục 14)** |
| Lỗ hổng 2: trần số lần băm Argon2 chạy đồng thời và hàng đợi có hạn; quá hàng đợi trả 503 `SERVER_BUSY` | **đã làm (mục 14)** |

### 12.4 Việc của chủ dự án trên Cloudflare (không cần mã)

Trong bảng điều khiển Cloudflare của tên miền: bật **Bot Fight Mode**; thêm **một luật giới hạn tần suất** (gói miễn phí cho một luật) cho đường dẫn bắt đầu bằng `/api/auth/` (ví dụ 60 yêu cầu mỗi phút mỗi IP, hành động chặn 10 phút); có thể bật **Turnstile** cho trang quên mật khẩu khi cần. Lớp này chặn kẻ tấn công **trước khi tới máy của anh**, nên là lớp rẻ nhất.

## 13. Kết quả triển khai 7d-1 (14/11/2026)

Làm theo TDD: bài viết trước, thấy đỏ đúng lý do rồi mới viết mã (chính sách quyền: đỏ vì chưa có mô-đun; HTTP: đỏ 22/22 vì chưa có đường dẫn; ngân sách thư: đỏ 2/4, hai bài còn lại là bài bảo vệ). **Thừa nhận:** bài E2E của 7d-1 được viết **sau** khi làm giao diện nên **chưa thấy đỏ trước** (giống 7c-1).

### 13.1 Làm gì

- `support-policy.ts` (hàm thuần `canSupport`), `AccountSupportService` (Gửi lại, Sửa email, Liên kết hỗ trợ), `SupportRateLimiter`, cổng `SUPPORT_ROSTER_SCOPE` (`session` cài đặt, quan hệ Q384).
- `AuthLinks`: liên kết hỗ trợ (`support_link`) mở được ở trang kích hoạt lẫn trang đặt lại mật khẩu, **không** đánh dấu email đã xác thực, đặt mật khẩu xong thì mọi liên kết hỗ trợ còn lại chết; `revokeActive`.
- `MailService`: `cancelPendingForUser`.
- API mới: `POST /api/account-support/:userId/resend | email | link`. `PATCH /api/admin/users/:id` **không còn đổi email** (phải qua Sửa email có lý do).
- Danh sách người dùng: bộ lọc `activation` (pending, unverified, mail_failed), mỗi dòng trả `pending` và `emailVerified`.
- Chuông `account.password_reset_by_email` cho các Quản trị viên khác khi mật khẩu của Người ra đề hoặc Quản trị viên được đặt lại.
- Ngân sách thư ẩn danh của "Quên mật khẩu" (30 thư mỗi giờ, 60 mỗi ngày).
- Web: thẻ "Kích hoạt và email" ở trang chi tiết người dùng (Gửi lại, Sửa email, Liên kết hỗ trợ hiện một lần có nút sao chép), bộ lọc và dấu "Chờ kích hoạt" ở danh sách, bỏ ô email khỏi hồ sơ, thông điệp đăng nhập chung có chỉ dẫn.

### 13.2 Số bài

| Bộ | Trước (sau 7c-2a) | Sau |
|---|---|---|
| Unit api | 314 | 323 |
| Tích hợp | 1023 | **1056** đạt (1 bỏ qua) |
| Unit web | 294 | 294 |
| E2E | 245 đạt | **255 đạt**, 3 bỏ qua |

Bài mới: `support-policy.test.ts` (9, D-01 đến D-07), `account-support.int.test.ts` (D-03, D-05 đến D-25b, 28 bài), `recovery-budget.int.test.ts` (D-47 đến D-51, 5 bài), D-26 trong `auth.int.test.ts`, E2E `account-support.spec.ts` (2 bài x 2 màn hình). Bài cũ sửa có chủ ý: `admin-users.int.test.ts` (PATCH email) và các E2E đọc thông điệp đăng nhập.

### 13.3 Điều chỉnh so với thiết kế (phát hiện khi làm)

| # | Điều chỉnh | Lý do |
|---|---|---|
| i | Liên kết hỗ trợ lưu `purpose = support_link` (không phải `activation` hay `password_reset`) | tách bạch với liên kết thường: không xác thực email, có `created_by` và `reason` |
| ii | `support_link` mở được ở **cả hai** trang (kích hoạt và đặt lại) | người dùng luôn được báo đúng trạng thái (đã dùng, hết hạn) thay vì "liên kết lạ" |
| iii | Tạo hay dùng xong liên kết thường thì **mọi liên kết hỗ trợ còn lại chết** | tránh sót liên kết đặt lại mật khẩu 60 phút (phát hiện bằng đột biến M15) |
| iv | Người ra đề không thuộc phạm vi, tài khoản đã Xóa: trả **404** (không phải 403) | không cho dò xem tài khoản có tồn tại không |
| v | Gửi lại: giới hạn bằng khóa Redis theo sinh viên (24 giờ), **không** dựa vào thư kích hoạt đã có | thư tạo tài khoản không được tính vào giới hạn Gửi lại, nếu không sinh viên mới tạo hôm nay bị chặn ngay |
| vi | `PATCH` người dùng bỏ hẳn trường email | tránh đường đổi email không lý do, không xác thực lại |
| vii | Giới hạn 30 Liên kết hỗ trợ mỗi giờ mỗi người tạo; ngân sách thư ẩn danh | chống lạm dụng (mục 12) |

### 13.4 Kiểm thử đột biến

25 đột biến (bỏ kiểm quyền Người ra đề với tài khoản Hoạt động, Xóa, Khóa, Quản trị viên, quan hệ; bỏ lý do bắt buộc; bỏ giới hạn Gửi lại và khoảng cách; sửa email không bỏ xác thực, không vô hiệu mã cũ, không hủy thư đang chờ, không báo email cũ; loại liên kết sai; mã vào nhật ký; liên kết hỗ trợ xác thực email; không giết liên kết hỗ trợ còn lại; trần ngân sách ẩn danh theo giờ và ngày; thiếu ngân sách ở hai nhánh; chuông báo chính người đó hoặc Người dự thi; bộ lọc kích hoạt sai; trần Liên kết hỗ trợ). **22 bị bắt ngay, 3 sống sót ban đầu** (ngân sách ở nhánh Chờ kích hoạt, trần 30 Liên kết hỗ trợ, và chạy lại M25) rồi **bị bắt sau khi thêm D-51 và D-25b**: kiểm lại từng đột biến một, **25/25**. Một tiến trình đột biến mỗi lần, kiểm `git diff` trước và sau (bài học 13/11).

### 13.5 Chưa làm

7d-2 (bảng theo dõi của Người ra đề ở trang Yêu cầu và Danh sách dự thi, Gửi lại cho tất cả, khung hạn mức, màn Hàng đợi thư, chuông quá 70 % hạn mức), 7d-3 (xóa Phiếu, bỏ "Cấp lại mật khẩu tạm", `prod-preflight` đỏ khi thiếu SMTP). Giao diện **Người ra đề** dùng thẻ hỗ trợ ở 7d-2 (API đã có quyền của Người ra đề). **Chờ chủ dự án quyết** (mục 12.3): lỗ hổng 1 (khóa nhắm vào một sinh viên) và lỗ hổng 2 (trần số lần băm Argon2 đồng thời). Chưa thử thật: gửi thư xác thực, kích hoạt hỗ trợ trên production.

## 14. Kết quả: hai lỗ hổng đăng nhập (15/11/2026)

Chủ dự án đồng ý làm cả hai (15/11/2026). Làm theo TDD trên nhánh riêng sau 7d-1 (#99). Bài viết trước: `hash-gate.test.ts` (4 bài, đỏ vì chưa có mô-đun), `login-abuse.int.test.ts` (V1-a đến V1-h, V2-a đến V2-c; V1-a, b, e, f và V2-a đỏ đúng lý do, các bài V1-c, d, g là bài bảo vệ vì hành vi cũ đã đúng ở các điểm đó).

### 14.1 Lỗ hổng 1: khóa nhắm vào một sinh viên

| Trước | Sau |
|---|---|
| 10 lần thử mỗi 10 phút theo **tên đăng nhập**, bất kể IP | 10 lần mỗi 10 phút theo **cặp (tên đăng nhập, IP)**; thêm **trần 200 lần mỗi 10 phút theo tên** (chống đoán mật khẩu từ nhiều IP); lượt đã bị chặn theo cặp **không** đếm vào trần theo tên |
| sai 5 lần thì khóa tài khoản 15 phút, ở mọi IP | sai 5 lần thì khóa **cặp (tài khoản, IP)** 15 phút; lưu ở Redis theo IP; sinh viên từ IP khác vẫn đăng nhập được; đăng nhập đúng chỉ gỡ khóa của IP đó; cấp lại mật khẩu gỡ mọi khóa |

Hệ quả cần biết: kẻ chỉ có **một IP** không còn khóa được sinh viên. Kẻ có **rất nhiều IP** vẫn có thể làm cạn trần 200 lần mỗi 10 phút của một tài khoản (cần cả một mạng máy ma, và Cloudflare chặn lớp này), khi đó sinh viên đó nhận "thao tác quá nhiều lần" trong tối đa 10 phút. Cột `users.failed_login_count` không còn dùng (còn trong cơ sở dữ liệu, bỏ ở một PR dọn sau).

**Sửa đổi 28/11/2026 (Q531, chủ dự án đồng ý):** con số 10 lần theo cặp chỉnh được bằng biến `LOGIN_MAX_PER_IDENTIFIER_AND_IP`, **mặc định 10 và production giữ mặc định**. Chỉ môi trường kiểm thử giao diện đặt 100, vì nhiều bài dùng chung một tài khoản thử và CI đỏ giả khi chạy lại. Trần 200 lần theo tên đăng nhập không chỉnh được.

### 14.2 Lỗ hổng 2: đốt CPU bằng Argon2

`WorkGate`: tối đa **4 lần băm chạy đồng thời** (hoặc số luồng của máy nếu ít hơn; chỉnh bằng `HASH_CONCURRENCY`), tối đa **400 lần chờ** (`HASH_QUEUE_MAX`), quá thì **503 `SERVER_BUSY`** ngay ("Máy chủ đang bận, hãy đợi vài giây"). Áp cho mọi lần băm và kiểm tra mật khẩu (đăng nhập, đặt mật khẩu, đổi mật khẩu). Bị từ chối vì bận **không** tính là một lần sai mật khẩu. 100 đăng nhập đúng cùng lúc (đầu giờ thi) vẫn đều thành công (V2-c).

### 14.3 Đột biến

14 đột biến (cổng cho chạy quá số luồng, bỏ từ chối khi đầy, không nhả chỗ, lỗi bận không thành 503, kiểm mật khẩu không qua cổng, giới hạn cặp bỏ IP, trần theo tên quá thấp, lượt bị chặn vẫn đếm vào trần tên, khóa bỏ IP, đăng nhập đúng gỡ khóa mọi IP, không đếm lại từ đầu, ngưỡng 6 lần, cấp lại mật khẩu không gỡ khóa, bỏ giới hạn theo IP): **14/14 bị bắt** (M14 chạy tay vì Biome đã đổi dạng chuỗi cần thay). Một tiến trình đột biến mỗi lần, `git diff` kiểm trước và sau.

### 14.4 Chưa làm

Chuông cho Quản trị viên khi một tài khoản chạm trần 200 lần (dấu hiệu bị tấn công); Cloudflare (mục 12.4) vẫn là việc của chủ dự án.

## 15. Tiến độ 7d-2 (15/11/2026)

**Quyết định A (chủ dự án duyệt 15/11/2026):** "Chờ kích hoạt" là **nhóm lọc** gồm Chưa gửi, Đã gửi, Thư lỗi, Cần kiểm tra; bảng chỉ có **sáu trạng thái riêng** (thêm Đã kích hoạt, Email chưa xác thực). Không có trạng thái riêng tên "Chờ kích hoạt".

### 15.1 Đã làm (nhánh `feat/theo-doi-kich-hoat-7d2`)

- Lát 7 (D-29 đến D-33): `GET /api/account-support/tracking?requestId&state|group=awaiting&page&pageSize`; Người ra đề chỉ xem Yêu cầu của mình (404), Quản trị viên xem mọi Yêu cầu, Người dự thi 403; số đếm theo trạng thái trên toàn Yêu cầu; 500 dòng dưới 300 ms. Chỉ thư **kích hoạt** quyết định trạng thái (D-29b).
- Lát 8 (D-34 đến D-36): `POST /api/account-support/resend-all {requestId}` → `{queued, skipped}`; chỉ người còn Chờ kích hoạt và chưa Gửi lại trong 24 giờ; Người ra đề tối đa 1 lần mỗi 6 giờ (Redis, hoàn lượt khi không ai đủ điều kiện), Quản trị viên không bị giới hạn 6 giờ (vẫn bị 24 giờ mỗi sinh viên) và dùng làn khẩn; hai Người ra đề cùng bấm thì thư xoay vòng (D-36); nhật ký `account-support.resend-all`.
- Test `apps/api/test/account-tracking.int.test.ts` (13 bài). Đột biến: 3 bài ở lát 7 (mốc 47 giờ, bỏ kiểm chủ Yêu cầu, tính thư mọi loại) và 6 ở lát 8 (bỏ 24 giờ mỗi sinh viên, Quản trị viên cũng bị 6 giờ, không hoàn lượt, sai làn, gửi cho người đã kích hoạt, bỏ kiểm quyền xem): hai đột biến sống sót lúc đầu (thư loại khác; Quản trị viên bị 6 giờ) đã bị bắt sau khi thêm D-29b và D-35d.

- Theo Phiên thi (D-31b): `GET /api/account-support/tracking?sessionId=` (cùng khuôn với `requestId`; chọn đúng một trong hai); cổng `SUPPORT_ROSTER_SCOPE` thêm `rosterUserIds(sessionId, ownerId|null)`; Người ra đề chỉ Phiên thi của mình (404), Quản trị viên mọi Phiên thi. Đột biến bỏ giới hạn chủ Phiên thi bị bắt.
- Lát 9 (D-37, D-37b, D-38, D-39), `MailQuotaService`: `GET /api/account-support/quota` (khung hạn mức: đã gửi 24 giờ, trần, số thư chờ, số thư đứng trước thư của mình và giờ dự kiến xong, **mô phỏng bằng chính `planBatch`** nên khớp lịch gửi thật, kể cả xoay vòng giữa hai Người ra đề); `GET /api/admin/mail-queue` (chỉ Quản trị viên: số theo trạng thái, 24 giờ so với trần, 50 thư chưa gửi được gần nhất, **không có mã**); chuông `mail.quota_high` cho mọi Quản trị viên khi vượt 70 % trần (280/400), kiểm sau mỗi lần chạy `mail.dispatch`, tự gỡ theo **loại** (không theo ngày) khi hạ xuống, mỗi ngày giờ Việt Nam tối đa một chuông (khóa Redis `mail:quota-bell:<ngày>`). Lỗi tìm thấy nhờ bài: gỡ chuông theo khóa ngày không gỡ được chuông của hôm qua, đã sửa bằng `clearUnreadOfType`. 7 đột biến (ngưỡng, không gỡ, `ahead`, nhiều chuông một ngày, đếm 24 giờ mọi thời gian, bỏ AdminOnly, liệt kê cả thư đã gửi) đều bị bắt.

### 15.2 Còn lại

Lát 10: giao diện và E2E (bảng theo dõi ở trang Yêu cầu và Danh sách dự thi, khung hạn mức, màn Hàng đợi thư, chuông, kiểm tra không cuộn ngang và không bị che ở 375 và 1280 px, sáng và tối).


## 16. Kết quả 7d-3: bỏ Phiếu tài khoản và "Cấp lại mật khẩu tạm" (16/11/2026)

Làm theo TDD: bài viết trước và thấy đỏ đúng lý do (D-40 đỏ vì các đường dẫn còn tồn tại, D-41 đỏ vì bảng còn, D-43 đỏ vì khóa vẫn bắt buộc, bài V1-g đỏ vì đặt lại mật khẩu bằng liên kết không gỡ khóa đăng nhập; D-42 là bài bảo vệ, xanh từ đầu và phải còn xanh sau khi gỡ).

### 16.1 Đã gỡ

- **API:** module `credential-slips` (controller, service, bộ dựng PDF/Excel, kho mã hóa) và các bài của chúng; `GET /account-requests/:id/slips`; `POST /admin/users/:id/temporary-password`; `POST /sessions/:id/roster/:userId/reissue-password`; `RequesterCredentialsService`; hàm `reissueTemporaryPassword`; bước "phiếu hết hạn" của job dọn dẹp; mã lỗi `SLIP_EXPIRED`; bảng `credential_slips` và kiểu `credential_slip_status` (migration `0026_bo_phieu_tai_khoan`); biến `SLIP_ENCRYPTION_KEY` (không còn bắt buộc; còn trong `api.env` cũ thì bị bỏ qua); `exam-ctl.sh` không sinh khóa này nữa.
- **Web:** mục "Phiếu tài khoản" ở trang Yêu cầu; nút "Cấp lại mật khẩu tạm" ở trang chi tiết người dùng và ở menu Danh sách dự thi; `TemporaryPasswordDialog` và các khóa i18n liên quan. Nhật ký thao tác cũ `user.temporary-password.reissue` vẫn lọc và đọc được; nhãn thông báo cũ (`credential_slip.*`, `account.password_reissued`) giữ cho lịch sử.
- **Giữ lại có chủ ý:** `generateTemporaryPassword` và `recoverAdmin` (lệnh `prod-recover-admin`, in mật khẩu tạm một lần trên máy chủ).

### 16.2 Kết quả theo bài

| Bài | Kết quả |
|---|---|
| D-40 | các đường tải Phiếu và cấp lại mật khẩu tạm không còn: Quản trị viên và Người ra đề đều nhận 404 "Cannot ..." (`slip-removal.int.test.ts`) |
| D-41 | migration chạy được **trên cơ sở dữ liệu có 3 dòng Phiếu** (đủ ba trạng thái) và **trên cơ sở dữ liệu trống**; người dùng không bị đụng. Kiểm bằng tập lệnh tạm áp 0000 đến 0025, chèn dữ liệu, rồi áp 0026 (không đưa vào bộ bài thường trực); bài thường trực kiểm bảng và kiểu không còn |
| D-42 | job dọn dẹp không còn bước Phiếu; bước lỗi không chặn bước sau (viết lại: cho bước đầu lỗi, bước "yêu cầu kẹt ở parsing" vẫn chạy) |
| D-43 | khởi động được khi không có `SLIP_ENCRYPTION_KEY`; có khóa lạ cũng không lỗi (`env.test.ts`) |
| D-44 | `prod-preflight`: production thiếu SMTP là ✗ cố định (trước đó chỉ ⚠ nếu chưa có thư bị bỏ qua); `test-mail-ops.sh` 15 đạt |
| D-45 | `architecture.test` xanh sau khi gỡ module |
| D-46 | cập nhật `GLOSSARY.md` (bỏ thuật ngữ Phiếu tài khoản), `data-model.md`, `README.md`, `architecture.md` và các tài liệu vận hành (`tai-khoan-va-mat-khau`, `demo-wsl`, `khoi-phuc`, `chuyen-len-vps`, `trien-khai`) |

### 16.3 Điều chỉnh so với thiết kế (phát hiện khi làm)

| # | Điều chỉnh | Lý do |
|---|---|---|
| i | **Đặt lại mật khẩu bằng liên kết (Quên mật khẩu, Liên kết hỗ trợ) phải gỡ mọi khóa đăng nhập tạm của tài khoản đó** (`AuthLinks.consume` gọi `LoginBlock.clear`) | "Cấp lại mật khẩu tạm" từng làm việc này. Bỏ nó đi mà không bù thì người tự khóa mình (gõ sai nhiều lần), bấm Quên mật khẩu, đặt mật khẩu mới xong vẫn chưa đăng nhập được tới khi khóa hết hạn. Bài V1-g được viết lại theo đường mới |
| ii | E2E `password-recovery.spec.ts` viết lại: Quản trị viên tạo Liên kết hỗ trợ, người dùng tự đặt mật khẩu mới | kịch bản cũ dựa vào mật khẩu tạm |
| iii | Giữ `slips` trong danh sách loại trừ của sao lưu | thư mục `slips/` cũ nếu còn thì vẫn không bị chép; không có job nào dọn nó nữa (production không có Phiếu nào) |

### 16.4 Việc của chủ dự án khi deploy

Migration `0026` **xóa bảng** (một chiều); production không có Phiếu nào (kiểm 14/11/2026). `SLIP_ENCRYPTION_KEY` còn trong `~/exam-prod-secrets/api.env` thì vô hại, có thể xóa dòng đó sau khi deploy.

## 17. Bổ sung luật "Gửi lại cho tất cả" (17/11/2026)

Phát hiện khi thử trên production: Lý Nhật Nam nhận hai thư kích hoạt cách nhau 21 giây, vì "Gửi lại cho tất cả" được bấm ngay sau khi duyệt khôi phục (thư tạo hoặc khôi phục không tính vào giới hạn Gửi lại 24 giờ, theo điều chỉnh v của mục 13.3). Hệ quả: thư sau làm liên kết thư trước hết hiệu lực. **Luật B (chủ dự án duyệt):** "Gửi lại cho tất cả" bỏ qua người có thư kích hoạt (đang chờ, đang gửi hoặc đã gửi) tạo trong 24 giờ qua, không tốn lượt Gửi lại của họ; thư bị từ chối hoặc lỗi không tính. Kết quả API thêm `recent` (số người bị bỏ qua vì vừa nhận thư). Bài R-17 đến R-20 và các bài D-34, D-35, R-14, R-15 điều chỉnh (đẩy thư lùi 25 giờ trước khi thử); 3 đột biến (bỏ luật, tính cả thư bị từ chối, vẫn tốn lượt Gửi lại) đều bị bắt. Gửi lại từng người, Sửa email và Liên kết hỗ trợ không đổi.
