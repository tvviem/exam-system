# Giữ cho bài E2E ổn định (rút ra ngày 15/11/2026)

**Bối cảnh.** Ba lần merge liên tiếp (#99, #100, #101) có CI đỏ vì bài E2E chập chờn, lần nào cũng phải chạy lại. Thống kê 33 lần chạy CI gần nhất: PWA `take-offline` chập chờn 10 lần (và đỏ hẳn 1 lần), `invitations` đỏ hẳn 2 lần, `account-email` E-01 đỏ hẳn 1 lần. Tìm nguyên nhân từng bài thay vì nới thời gian chờ.

## Ba nguyên nhân và cách đã sửa

| Bài | Nguyên nhân gốc | Cách sửa |
|---|---|---|
| PWA `take-offline` | **Lỗi sản phẩm.** `register-sw.ts` thoát sớm khi `navigator.serviceWorker.controller` đã có, nên trên máy chậm danh sách file `/assets` không bao giờ được gửi để lưu đệm: lần mở đầu thiếu vỏ ứng dụng, mất mạng rồi tải lại không mở được. Tái hiện được khi CPU trình duyệt chậm từ 4 lần (thiếu 28/40 file) | luôn gửi danh sách file đã tải sau khi service worker sẵn sàng, cộng một `PerformanceObserver` (`buffered`) cho file về muộn; bài E2E mới chạy ở CPU chậm 6 lần (đã thấy đỏ trước khi sửa) |
| `invitations` | `knownTokenFor` ghi mã đã biết ngay khi tạo Lời mời, **trước khi worker gửi thư**; lúc gửi, worker sinh mã mới đè lên nên trang lời mời không hiện email | chờ dòng thư trong `email_outbox` thành `sent` hoặc `skipped` rồi mới ghi mã (như `addTokenAfterMail`) |
| `account-email` E-01 và các bài xếp thư | máy chủ E2E giữ hạn mức thư như production (khoảng cách 6 giây, warm-up 50/100/…), nên thư của các bài xếp hàng chờ nhau quá 15 giây; ngoài ra gieo người dùng không an toàn khi thử lại (trùng tên đăng nhập) | `prepare-api.cjs` đặt `EMAIL_MIN_GAP_SECONDS=0` và `EMAIL_WARMUP_BULK=''`; tên tài khoản gieo mang số lần thử và chỉ số lặp (`runTag`) |

## Quy ước cho bài E2E mới

1. **Không chờ bằng số giây cố định cho việc bất đồng bộ.** Chờ theo điều kiện thật (`expect.poll` trên dòng `email_outbox`, trạng thái trên giao diện).
2. **Mã đặt thẳng vào cơ sở dữ liệu phải đặt SAU khi worker gửi thư**, vì lúc gửi thư mã được sinh lại.
3. **Dữ liệu gieo phải chạy lại được**: tên đăng nhập, email mang `testInfo.retry` và `testInfo.repeatEachIndex`.
4. **Đăng nhập một lần cho mỗi tài khoản mỗi worker** (dùng lại cookie phiên như `ui-layout.spec.ts`): giới hạn đăng nhập chặn một cặp (tên đăng nhập, IP) sau 10 lần mỗi 10 phút.
5. **Máy chủ E2E chạy bản build**: chạy `npm run build` ở `apps/api` trước khi chạy E2E cục bộ.
6. Nghi bài phụ thuộc tốc độ máy thì thử làm chậm CPU (`Emulation.setCPUThrottlingRate`) hoặc chạy `--repeat-each` với nhiều worker; tái hiện được là sửa được.
