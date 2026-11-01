---
status: accepted
---

# Gắn Thiết bị dự thi bằng mã thiết bị trong cookie

Mỗi Người dự thi, trong một Phiên thi, chỉ được dự thi trên **một** thiết bị, để chặn việc thi hộ từ bên ngoài phòng thi. Thiết bị được nhận diện bằng một **mã thiết bị**: chuỗi ngẫu nhiên 128 bit do server cấp qua cookie `exam_did` (HttpOnly, SameSite=Lax, sống 1 năm), cấp lúc đăng nhập hoặc lúc nhập Mã vào thi lần đầu nếu chưa có. Server chỉ lưu bản băm SHA-256 trong bảng `session_devices`.

- Thiết bị được **gắn** ở lần đầu nhập đúng Mã vào thi. Từ đó mọi thao tác dự thi (vào thi, bắt đầu Lượt làm bài, đọc đề, lưu Câu trả lời, Nộp bài) phải mang đúng mã thiết bị đã gắn. Việc đăng nhập trên thiết bị khác vẫn được phép; chỉ việc dự thi bị chặn.
- Ràng buộc nằm ở cơ sở dữ liệu bằng hai chỉ mục duy nhất từng phần: mỗi `(phiên thi, người)` có tối đa một thiết bị đang gắn; mỗi `(phiên thi, thiết bị)` chỉ phục vụ tối đa một người. Hai thiết bị cùng nhập mã một lúc thì chỉ một thiết bị thắng.
- **Thu hồi thiết bị** do Người ra đề thực hiện: thiết bị cũ bị loại khỏi Phiên thi cho người đó vĩnh viễn (trừ khi Người ra đề cho vào lại), Câu trả lời đã lưu được giữ, Câu trả lời còn trong hàng đợi của máy cũ bị từ chối. Thiết bị mới đầu tiên nhập đúng mã sẽ được gắn và làm tiếp đúng Lượt làm bài cũ. Mọi lần lưu Câu trả lời kiểm tra thiết bị trong cùng giao dịch, khóa dòng gắn bằng `FOR SHARE`, nên một lần lưu hoặc hoàn tất trước khi Thu hồi có hiệu lực, hoặc bị từ chối, không có trạng thái lưng chừng.

## Các phương án đã loại

- **Gắn theo Phiên đăng nhập** (`auth_sessions`): đơn giản nhưng đăng xuất hoặc bị văng ra rồi đăng nhập lại trên chính điện thoại đó cũng thành "thiết bị lạ"; với 300 người trên Wi-Fi chập chờn, Người ra đề sẽ phải Thu hồi liên tục.
- **Vân tay trình duyệt** (fingerprint): không ổn định giữa các lần cập nhật trình duyệt, dễ trùng giữa các máy cùng cấu hình trong phòng máy và khó giải thích khi có tranh chấp.
- **Giới hạn theo địa chỉ IP hoặc dải IP của phòng thi**: không áp dụng được cho thi qua mạng di động, và người thi hộ ở cùng mạng Wi-Fi vẫn qua được. Có thể làm sau như một lớp bổ sung.

## Consequences

- Người dùng xóa dữ liệu trình duyệt, đổi trình duyệt hoặc dùng chế độ ẩn danh sẽ bị coi là thiết bị mới và phải nhờ Người ra đề Thu hồi thiết bị. Đây là chủ ý: cách đổi thiết bị duy nhất có người chịu trách nhiệm.
- Phòng máy xóa sạch hồ sơ trình duyệt sau mỗi lần đăng nhập sẽ gặp lỗi này ở mỗi lần đăng nhập lại. Không có công tắc tắt quy tắc; nếu gặp nhiều trong thực tế thì xét lại bằng ADR mới.
- Mã thiết bị không phải bằng chứng danh tính: người có cả mật khẩu lẫn thiết bị vẫn thi hộ được. Quy tắc chỉ nâng chi phí của việc thi hộ từ xa (cần đúng thiết bị trong phòng) và cho Người ra đề thấy loại thiết bị, địa chỉ IP của thiết bị đang gắn để nhận ra thiết bị lạ.
- Màn hình xác nhận trước khi bắt đầu phải nói rõ hệ thống ghi nhận thiết bị, địa chỉ IP và việc rời khỏi màn hình bài thi.
