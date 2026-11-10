# Lát cắt 7: tài khoản và mật khẩu: khôi phục khi quên, liên kết đặt lại một lần

Nâng cấp sau khi bản MVP chạy thật (lát cắt 6). Câu hỏi bắt đầu từ chủ dự án (10/11/2026): Người dự thi hoặc Người ra đề tạo tài khoản đã lâu, đã đổi mật khẩu từ lần đầu, rồi quên. Hệ thống xử lý được chưa, và có cách nào tốt hơn cho **tài khoản cá nhân** không? Mô tả cơ chế hiện tại đầy đủ ở [docs/ops/tai-khoan-va-mat-khau.md](../ops/tai-khoan-va-mat-khau.md).

## Tóm tắt các quyết định (để xem lại nhanh)

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q371 | Làm theo **phương án C**: trước hết bổ sung kiểm thử trọn kịch bản và tài liệu hoàn chỉnh (PR 7a), sau đó mới thiết kế và làm **liên kết đặt lại dùng một lần** (PR 7b) | Kiểm thử là "lưới an toàn" trước khi sửa khu vực đăng nhập nhạy cảm |

## Hai PR

| PR | Nội dung | Trạng thái |
|---|---|---|
| **7a** | kiểm thử trọn kịch bản quên mật khẩu (API 16 bài, trình duyệt 4 bài), tài liệu `tai-khoan-va-mat-khau.md`, kế hoạch lát cắt này; **không đổi hành vi hệ thống** | làm xong 10/11/2026 |
| **7b** | liên kết đặt lại một lần: thiết kế từng câu (Q372 trở đi), migration, API, giao diện, kiểm thử, cập nhật tài liệu | chờ thiết kế |

## Rà soát hiện trạng (10/11/2026)

Câu hỏi: kịch bản "đã đổi mật khẩu từ lâu rồi quên" có được giải quyết chưa? **Có**, bằng "Cấp lại mật khẩu tạm" của Quản trị viên (Q61). Rà soát qua mã và chạy 133 bài kiểm thử liên quan (đạt hết) cho thấy:

**Đã có và đã kiểm:** cấp lại cho người dùng có mật khẩu thường (không phải mật khẩu tạm); mật khẩu cũ mất hiệu lực; mọi phiên thu hồi; gỡ khóa tạm do nhập sai; buộc đổi mật khẩu; mật khẩu tạm hạn 7 ngày; không ghi mật khẩu vào nhật ký; không tự cấp cho chính mình; cấp được khi người đó đang trong Phiên thi; Người ra đề chỉ cấp được cho Người dự thi mình xin tài khoản và chưa đổi mật khẩu.

**Khoảng trống phát hiện và đã bù ở PR 7a:**
1. Không có bài kiểm thử **trọn kịch bản** (chỉ có các mảnh lẻ) → thêm `password-recovery.int.test.ts` (16 bài).
2. Không có bài kiểm thử **trình duyệt** cho hộp thoại cấp lại (mật khẩu hiện một lần, không đóng bằng Esc) và luồng người dùng bị buộc đổi → thêm `password-recovery.spec.ts` (4 bài, desktop và điện thoại).
3. Không có tài liệu vận hành **một chỗ** về cơ chế → thêm `docs/ops/tai-khoan-va-mat-khau.md`.

**Điều phát hiện khi viết kiểm thử:** phiên của Quản trị viên chỉ **30 phút nhàn rỗi, tối đa 12 giờ**, nên nếu để lâu thì phải đăng nhập lại trước khi cấp lại (ghi trong tài liệu vận hành).

**Điểm yếu thiết kế (không sửa ở 7a, là lý do làm 7b):**
1. **Quản trị viên biết mật khẩu tạm** khi cấp lại, về nguyên tắc có thể đăng nhập bằng tài khoản người khác trước khi họ đổi. Có nhật ký ghi việc cấp lại nhưng hệ thống không ngăn.
2. **Chủ tài khoản không được báo** khi mật khẩu bị cấp lại.
3. Không tự phục vụ; hệ thống không xác minh danh tính (chỉ có quy trình của người vận hành).
4. Hạn 7 ngày của mật khẩu tạm dài hơn nhu cầu thực tế.

### Q371: hướng cải tiến (ĐÃ DUYỆT 10/11/2026: phương án C)

**Phương án:**
- **A.** Giữ nguyên, chỉ bổ sung kiểm thử trình duyệt, trọn kịch bản và tài liệu vận hành.
- **B.** Thêm **liên kết đặt lại dùng một lần** cho Người ra đề và Người dự thi (Quản trị viên chỉ tạo và gửi liên kết, chủ tài khoản tự đặt mật khẩu; Quản trị viên không biết mật khẩu); giữ cấp mật khẩu tạm làm dự phòng.
- **C.** Làm cả hai theo thứ tự: bổ sung kiểm thử trước (không đổi hành vi), sau đó mới thiết kế B.
- Phương án đã loại cho giai đoạn này: **tự đặt lại qua email** (cần dịch vụ gửi email; nhiều Người dự thi không có email; vẫn trong backlog của lát cắt 1).

**Quyết định:** chọn **C**. Lý do: kiểm thử trọn kịch bản tạo lưới an toàn trước khi thay đổi cơ chế đăng nhập (khu vực nhạy cảm); thiết kế B dựa trên cơ chế liên kết dùng một lần đã có của **Lời mời** (liên kết băm mã, dùng một lần, hết hạn) nên không phải dựng mới từ đầu.

**Hướng của B (chưa duyệt chi tiết, sẽ hỏi từng câu):** Quản trị viên bấm "Tạo liên kết đặt lại mật khẩu" cho một người; hệ thống hiện liên kết **một lần**, hết hạn ngắn (đề xuất 24 giờ), dùng được **một lần**; Quản trị viên gửi qua Zalo; chủ tài khoản mở liên kết, tự chọn mật khẩu (theo cùng quy tắc: từ 10 ký tự...), mọi phiên cũ bị thu hồi, nhật ký ghi lại. Mật khẩu cũ **giữ nguyên cho tới khi liên kết được dùng** (đề xuất, để kẻ giả danh xin reset không khóa được chủ thật). Các câu cần quyết: hạn của liên kết; mật khẩu cũ còn hiệu lực hay không; ai được tạo liên kết (chỉ Quản trị viên hay cả Người ra đề cho Người dự thi của mình); có thông báo cho chủ tài khoản không và bằng cách nào; áp dụng cho Quản trị viên không; có giới hạn số lần tạo và có tạo lại thay liên kết cũ không; nhật ký ghi gì; giao diện ở đâu; có bỏ hạn 7 ngày của mật khẩu tạm hay rút ngắn không.

## Quy trình ghi chú cho các nâng cấp tiếp theo

1. Chủ dự án mô tả điểm nâng cấp → ghi mục tiêu vào `slice-N.md`.
2. Thiết kế **từng câu một** (Q371 trở đi): bài toán, ví dụ, phương án A/B/C, khuyến nghị, quyết định, phương án đã bỏ.
3. Quyết định kiến trúc khó đảo ngược → ADR; thuật ngữ mới → `GLOSSARY.md`; bảng dữ liệu → `docs/data-model.md`; kiến trúc → `docs/architecture.md`.
4. Mỗi PR có Summary, Evidence (số đo, kết quả kiểm thử), Merge Danger.
5. Sau khi làm: ghi chú triển khai (điều khác thiết kế, lỗi tìm ra, kết quả kiểm thử) vào `slice-N.md`; tài liệu vận hành vào `docs/ops/` kèm nhật ký bật thật.
6. Ghi tiến độ vào bộ nhớ dự án để phiên sau tiếp tục.
