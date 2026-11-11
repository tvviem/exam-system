# PR 7c: thiết kế kiểm thử (liên kết một lần, kích hoạt, quên mật khẩu), làm theo TDD

**Trạng thái: ĐÃ ĐƯỢC CHỦ DỰ ÁN DUYỆT (11/11/2026)**: cắt 7c thành 7c-1 và 7c-2, mã trong mảnh `#`, `status` và `consume` tách hai bước, tài khoản Chờ kích hoạt báo lỗi như tài khoản không tồn tại, Khóa rồi Mở khóa thì dùng lại được liên kết (mục 10). Chưa viết bài kiểm thử hay mã nào. Cách làm như [PR 7b](./slice-7b-thiet-ke-kiem-thu.md): nêu điểm tiếp xúc, hành vi, thứ tự lát dọc, cách tự kiểm; duyệt xong mới vòng đỏ rồi xanh.

Căn cứ: [ADR-0009](../adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md); [slice-7-phuong-an-b-email.md](./slice-7-phuong-an-b-email.md) mục 2 (trạng thái tài khoản), 3 (luồng), 4 (mã và bảo mật), 13 (tiêu chí 1, 2, 3, 5, 7, 10, 15, 17); mô-đun `mail` đã có ở 7b (PR #92).

## 1. Đề xuất cắt nhỏ 7c (cần duyệt)

Kế hoạch gốc xếp 7c là "lớn". Đề xuất tách để mỗi PR vẫn xem xét được và đo thời gian từng phần:

| PR | Nội dung | Vì sao |
|---|---|---|
| **7c-1** | cột `users.email_verified_at`, `activated_at`; bảng `auth_tokens`; `AuthLinks` (`issue`, `consume` kết quả có kiểu); `MessageBuilder` thật của `identity`; **kích hoạt** và **quên mật khẩu, đặt lại** (API + 3 trang web); giới hạn tần suất; nhật ký | là lõi bảo mật; mọi thứ sau dùng lại |
| **7c-2** | Lời mời tự gửi thư; Người ra đề và Quản trị viên tạo tài khoản ở **Chờ kích hoạt** (nhập Excel bắt buộc email); **đổi email** và thư xác thực; thư "mật khẩu đã đổi" và "email đã đổi" | dùng lại `AuthLinks`; đụng nhiều chỗ cũ (Yêu cầu cấp tài khoản, Lời mời) |

7d giữ nguyên (màn hình theo dõi, gửi lại, sửa email, liên kết hỗ trợ, chuông, bỏ Phiếu tài khoản). **Tài liệu này chi tiết cho 7c-1**; 7c-2 thiết kế sau khi 7c-1 xong.

## 2. Phạm vi 7c-1

**Trong:** migration (2 cột trên `users`, bảng `auth_tokens`); `AuthLinks`; bộ dựng thư của `identity` đăng ký vào cổng `MESSAGE_BUILDER` của `mail`; API `POST /api/auth/forgot-password`, `GET /api/auth/links/status`, `POST /api/auth/links/consume`; ba trang web (Quên mật khẩu, Kích hoạt, Đặt lại); giới hạn tần suất; nhật ký; chặn đăng nhập tài khoản Chờ kích hoạt.

**Ngoài (để chừa chỗ):**

| Việc | PR | Chừa chỗ thế nào |
|---|---|---|
| Tạo tài khoản Chờ kích hoạt từ nhập Excel, Lời mời tự gửi, đổi email | 7c-2 | `AuthLinks.issue` nhận loại `activation`, `email_change`; bài kiểm thử dùng tài khoản dựng sẵn |
| `support_link` (Q377), Gửi lại, sửa email, quyền Q384 | 7d | `issue` nhận `createdBy` và `reason`; loại `support_link` có trong enum nhưng chưa có API |
| Chuông, biểu ngữ, bảng theo dõi | 7d | không đụng |

## 3. Điểm tiếp xúc cần duyệt

| # | Điểm tiếp xúc | Cách kiểm | Bắt được | Bỏ sót (nơi bù) |
|---|---|---|---|---|
| **K1** | **`AuthLinks`**: `issue(người dùng, mục đích, {createdBy, reason})` trả mã và hạn; `consume(mã, mục đích, mật khẩu mới)` trả kết quả có kiểu `ok` / `expired(lúc nào)` / `used(lúc nào)` / `replaced` / `blocked(khóa hoặc xóa)` / `unknown`. PostgreSQL thật, `FakeClock` | bài tích hợp gọi thẳng dịch vụ (không qua HTTP) | hạn từng loại, một lần dùng, một mã còn hiệu lực mỗi loại, thu hồi phiên, nhật ký, không lưu mã | cách trang hiển thị (K5) |
| **K2** | **Bộ dựng thư của `identity`** cài cổng `MESSAGE_BUILDER`: sinh mã **lúc gửi**, vô hiệu mã cũ, trả dữ liệu cho mẫu thư | bài tích hợp chạy **`MailService` thật + bộ dựng thật + `FakeMailTransport`**, đọc liên kết từ thư đã "gửi", dùng nó qua K1 | mã sinh đúng lúc, thử lại vô hiệu mã cũ, thư dùng đúng địa chỉ cấu hình (không lấy từ `Host`), hạn kích hoạt tính từ lúc gửi (Q374) | thư vào Inbox hay Spam (kiểm tay) |
| **K3** | **API HTTP** `forgot-password`, `links/status`, `links/consume` | bài tích hợp qua `app.inject` như `password-recovery.int.test.ts` | cùng một câu trả lời và đúng mã trạng thái cho mọi tài khoản, không tự đăng nhập, `Referrer-Policy`, thông báo lỗi có giờ | thời gian phản hồi (K4), giao diện (K6) |
| **K4** | **Giới hạn tần suất và thời gian phản hồi đều nhau** (Redis thật) | bài tích hợp + đo thời gian | 3 lần/giờ mỗi định danh, 20 lần/giờ mỗi IP, cách nhau 60 giây, vượt vẫn trả cùng câu; chênh lệch thời gian giữa tài khoản có và không | tấn công phân tán |
| **K5** | **Bất biến bảo mật** quét log, `audit_logs`, `auth_tokens`, thư lưu | bài tích hợp quét sau luồng đầy đủ | không mã và không mật khẩu ở đâu ngoài thư; `auth_tokens` chỉ có SHA-256; nhật ký có IP và trình duyệt | |
| **K6** | **Giao diện** ba trang (Playwright, điện thoại và máy tính) | E2E như `e2e/password-recovery.spec.ts` | mã bị xóa khỏi thanh địa chỉ sau khi đọc; trang hết hạn/đã dùng/bị thay nêu lý do, giờ, việc làm tiếp (tiêu chí 14); đặt mật khẩu hai lần; không tự đăng nhập; không cuộn ngang ở 375 px; sáng/tối | |
| **K7** | **Trạng thái tài khoản** `Chờ kích hoạt` (`activated_at` rỗng, `password_hash` rỗng) | bài tích hợp qua đăng nhập | không đăng nhập được, không lộ "tài khoản tồn tại"; bài cũ (900+) vẫn xanh | dữ liệu production (chỉ 2 Quản trị viên, Q380) |

Không kiểm trực tiếp (kiểm gián tiếp): hàm băm, so sánh hằng định, cách sinh mã.

## 4. Quyết định thiết kế nhỏ cần duyệt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| a | **`consume` hai bước hay một?** Trang cần biết mã còn dùng được **trước khi** người dùng gõ mật khẩu | **hai lời gọi**: `status(mã)` chỉ đọc (không tiêu mã) để hiển thị trang hoặc lý do; `consume(mã, mật khẩu)` mới tiêu. Cả hai trả cùng kiểu kết quả |
| b | Đưa mã vào đâu: query `?token=` hay mảnh `#` (fragment) | **mảnh `#`**: không bao giờ gửi lên máy chủ, không lọt vào nhật ký nginx hay `Referer`. Thiết kế gốc ghi query (mục 4); đề xuất đổi vì an toàn hơn, trang đọc mã từ `location.hash` rồi xóa; `Referrer-Policy: no-referrer` vẫn đặt |
| c | Chặn tài khoản Chờ kích hoạt đăng nhập | trả **cùng thông báo "sai tên đăng nhập hoặc mật khẩu"** như tài khoản không tồn tại (không lộ trạng thái); giới hạn đăng nhập sai hiện có vẫn áp dụng |
| d | Thời gian phản hồi đều nhau của `forgot-password` | **luôn làm cùng số bước** (tra người dùng, kiểm giới hạn, xếp thư hoặc xếp "thư giả" không gửi), gửi thư không chặn phản hồi (đã có `enqueue`); bài đo: chênh lệch giữa tài khoản có và không dưới 20 ms ở trung vị |
| e | Hạn `activation` tính từ lúc gửi (Q374) | bộ dựng thư đặt `expires_at = lúc gửi + 7 ngày` **khi sinh mã**; bài kiểm: thư gửi trễ 3 ngày vì hạn mức vẫn còn 7 ngày kể từ lúc gửi |
| f | `forgot-password` cho tài khoản Chờ kích hoạt | xếp **thư kích hoạt** (không phải thư đặt lại), chịu cooldown 24 giờ (Q375, đã có `enqueueWithCooldown`) |
| g | Mật khẩu mới có chứa tên đăng nhập, mã định danh | dùng lại `password-policy.ts` hiện có (không viết lại) |
| h | Phiên của Quản trị viên khác khi đặt lại xong | thu hồi **mọi phiên của chính người đó** (Q381); chuông cho Quản trị viên khác là việc của 7d |

## 5. Danh sách hành vi và thứ tự lát

Mỗi dòng là một bài; làm lần lượt, mỗi bài đỏ rồi xanh. "TC" là tiêu chí nghiệm thu ở mục 13 và 14 của [tài liệu thiết kế email](./slice-7-phuong-an-b-email.md).

**Lát 1: đường xuyên suốt nhỏ nhất (K1).** A-01: `issue` rồi `consume` đúng mã đặt được mật khẩu, tài khoản thành Hoạt động, `email_verified_at` có giá trị (TC 1).

**Lát 2: mã không lộ (K1, K5).** A-02: `auth_tokens` chỉ chứa SHA-256, không chứa mã (TC 3). A-03: `issue` hai lần cùng loại thì mã cũ trả `replaced`, chỉ mã mới dùng được. A-04: mã khác loại (đặt lại dùng cho kích hoạt) trả `unknown`.

**Lát 3: kết quả có kiểu (K1).** A-05: dùng lần hai trả `used(lúc nào)`. A-06: hết hạn trả `expired(lúc nào)` đúng ở mốc: kích hoạt 7 ngày, đặt lại 60 phút, đổi email 24 giờ (TC 1, 14, 17). A-07: tài khoản Khóa hoặc Xóa trả `blocked`; Khóa rồi Mở khóa thì mã còn hạn dùng lại được (TC 15; chốt "dùng lại được" hay "phải gửi lại" ở mục 4, câu i). A-08: mã không khớp bản ghi nào trả `unknown` **không** nêu lý do chi tiết.

**Lát 4: đặt mật khẩu (K1).** A-09: vi phạm chính sách mật khẩu trả lỗi và **không tiêu mã**. A-10: đặt xong thì thu hồi mọi phiên, ghi `account.password-reset` hoặc `account.activated`, không tự đăng nhập (TC 2). A-11: hai `consume` đồng thời cùng mã: đúng một thành công.

**Lát 5: bộ dựng thư thật (K2).** A-12: xếp thư kích hoạt rồi chạy job: thư tới `FakeMailTransport` có liên kết, và dùng liên kết đó kích hoạt được. A-13: gửi lỗi tạm thời rồi thử lại: mã thư đầu `replaced`, thư sau dùng được (TC 3). A-14: liên kết dựng từ địa chỉ cấu hình, kể cả khi yêu cầu có `Host` giả. A-15: hạn kích hoạt tính từ lúc gửi, không từ lúc tạo (Q374).

**Lát 6: quên mật khẩu (K3).** A-16: tài khoản Hoạt động có email đã xác thực: nhận thư đặt lại; chỉ một mã còn hiệu lực. A-17: **cùng một câu trả lời, mã trạng thái, thân phản hồi** cho: có tài khoản, không có, Khóa, Chờ kích hoạt, email chưa xác thực, vượt giới hạn (TC 2, 7, 10). A-18: Khóa, Xóa, email chưa xác thực **không** xếp thư. A-19: Chờ kích hoạt nhận thư kích hoạt, không phải thư đặt lại (mục 4 câu f). A-20: đặt lại xong gửi thư "mật khẩu đã đổi" (TC 2).

**Lát 7: giới hạn và thời gian (K4).** A-21: 3 yêu cầu/giờ/định danh; thứ 4 vẫn cùng câu, không thêm thư. A-22: 20/giờ/IP. A-23: cách nhau 60 giây. A-24: chênh lệch thời gian phản hồi giữa tài khoản có và không dưới 20 ms ở trung vị (mục 4 câu d).

**Lát 8: trạng thái Chờ kích hoạt (K7).** A-25: không đăng nhập được, cùng thông báo như tài khoản không tồn tại. A-26: không có mặt trong việc "Cấp lại mật khẩu tạm" (7d sẽ bỏ nút; hiện giữ).

**Lát 9: bất biến (K5).** A-27: quét toàn bộ log, `audit_logs`, `auth_tokens`, `email_outbox`, thư của `FakeMailTransport` (trừ liên kết trong thư): không mã, không mật khẩu (TC 3). A-28: nhật ký có IP và trình duyệt.

**Lát 10: giao diện (K6, Playwright).** E-01: kích hoạt trọn vẹn trên điện thoại (mở liên kết, đặt mật khẩu hai lần, về trang đăng nhập, đăng nhập được). E-02: mã bị xóa khỏi thanh địa chỉ sau khi đọc và không có trong `Referer`. E-03: trang hết hạn nêu giờ hết hạn và nút làm tiếp (Quên mật khẩu, hoặc Gửi lại thư kích hoạt). E-04: trang đã dùng, bị thay, không nhận ra mỗi loại một nội dung. E-05: trang Quên mật khẩu hiện cùng câu trả lời mọi trường hợp. E-06: không cuộn ngang ở 375 px, sáng và tối. E-07: **toàn bộ bộ E2E hiện có vẫn xanh**.

**Hiệu năng (AGENTS.md):** H-01: `forgot-password` trả lời dưới 100 ms (không chờ gửi thư). H-02: `status` và `consume` dưới 100 ms (băm SHA-256 và Argon2 nằm trong `consume`: đo; Argon2 hiện khoảng vài chục ms).

## 6. Hạ tầng kiểm thử thêm

`FakeMailTransport` có sẵn (đọc thư đã gửi để lấy liên kết); thêm `linkIn(mail)` trích liên kết trong thư. `createTestApp` thêm `seedPendingUser`. Dùng `captureLogs` (7b). E2E dùng lại cổng kích hoạt qua API để lấy liên kết (bộ gửi giả của E2E ghi thư ra tệp hoặc cổng đọc chỉ dùng khi `NODE_ENV` khác production).

## 7. Cách tự kiểm chất lượng

Như 7b (mục 7): đỏ đúng lý do; **kiểm thử đột biến** với danh sách riêng (bỏ băm mã; bỏ kiểm hạn; bỏ vô hiệu mã cũ; bỏ thu hồi phiên; hạn sai từng loại; `Host` giả được tin; trả lý do chi tiết cho mã lạ; câu trả lời khác nhau giữa các trường hợp; không giới hạn tần suất; lộ mã trong log hay `audit_logs`; tiêu mã khi mật khẩu vi phạm chính sách); bộ bài cũ vẫn xanh; thời gian từng bài dưới 1 giây; chạy lặp 5 lần các bài đồng thời (A-11).

## 8. Định nghĩa "xong" cho 7c-1

Mọi bài mục 5 xanh; đột biến đã chạy và ghi kết quả; lint, `tsc`, `architecture.test` (A1: `mail` không import bảng của `identity`, qua cổng `MESSAGE_BUILDER`), bộ tích hợp và E2E cũ vẫn xanh; cập nhật cùng PR: `docs/data-model.md`, `docs/architecture.md`, `docs/ops/tai-khoan-va-mat-khau.md` (mô tả luồng mới), `GLOSSARY.md` nếu có thuật ngữ mới, `docs/ops/gui-thu.md`. **Chưa bật ở production** cho tới khi cấu hình SMTP thật và chạy `prod-mail-test`.

## 9. Điều cần chủ dự án quyết

1. **Duyệt cách cắt 7c thành 7c-1 và 7c-2** (mục 1).
2. **Duyệt bảy điểm tiếp xúc K1 đến K7** (mục 3).
3. **Duyệt các quyết định a đến h** (mục 4), nhất là **b** (mã trong mảnh `#` thay vì query: khác thiết kế gốc), **a** (kiểm trạng thái và tiêu mã là hai bước) và **c** (tài khoản Chờ kích hoạt báo lỗi giống tài khoản không tồn tại).
4. Câu còn mở **i**: tài khoản Khóa rồi Mở khóa thì liên kết còn hạn **dùng lại được** hay **phải gửi lại** (tiêu chí 15 để ngỏ). Đề xuất **dùng lại được** (ít việc cho người dùng; mã vẫn một lần và có hạn).
5. Danh sách hành vi và thứ tự lát (mục 5): thiếu, thừa hay nên đổi ưu tiên gì không.

## 10. Quyết định của chủ dự án (11/11/2026)

Chủ dự án đồng ý **toàn bộ đề xuất**:

| # | Quyết định | Ghi chú |
|---|---|---|
| 1 | **Cắt 7c thành 7c-1 và 7c-2** (mục 1) | 7c-1: `auth_tokens`, `AuthLinks`, `MessageBuilder` thật, kích hoạt, quên mật khẩu, ba trang web, giới hạn tần suất. 7c-2: Lời mời tự gửi thư, nhập Excel bắt buộc email, đổi email. Tài liệu này chi tiết cho 7c-1 |
| 2 | **Mã trong mảnh `#`** của đường dẫn, không phải `?token=` | **Khác thiết kế gốc** (mục 4 của [slice-7-phuong-an-b-email.md](./slice-7-phuong-an-b-email.md) ghi query). Mảnh `#` không gửi lên máy chủ nên không lọt vào log nginx hay `Referer`. Trang đọc mã từ `location.hash` rồi xóa; `Referrer-Policy: no-referrer` vẫn đặt |
| 3 | **`status` (chỉ đọc) và `consume` (tiêu mã) là hai bước** (câu a) | trang biết mã còn dùng được và lý do nếu không, trước khi người dùng gõ mật khẩu |
| 4 | **Tài khoản Chờ kích hoạt đăng nhập báo như tài khoản không tồn tại** (câu c) | không lộ trạng thái; sinh viên dùng "Quên mật khẩu?" để nhận thư kích hoạt |
| 5 | **Khóa rồi Mở khóa thì liên kết còn hạn dùng lại được** (câu i, tiêu chí 15) | ít việc cho người dùng; mã vẫn một lần và có hạn |

Các câu b, d, e, f, g, h (mục 4) thực hiện đúng như đề xuất. Tiêu chí 15 của tài liệu thiết kế email nay chốt "dùng lại được".

**Bước kế:** viết bài kiểm thử và mã cho 7c-1 theo TDD (lát 1: A-01), mỗi bài đỏ rồi xanh; kiểm thử đột biến; cập nhật tài liệu cùng PR.
