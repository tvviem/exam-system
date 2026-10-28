---
status: accepted
---

# Phiên đăng nhập dạng opaque session cookie thay vì JWT

Phiên đăng nhập là một mã ngẫu nhiên lưu trong cookie `HttpOnly; Secure; SameSite=Lax`. Cookie trỏ tới bản ghi phiên trong Redis, có bản sao trong PostgreSQL để tra lịch sử. Khi Quản trị viên Khóa đăng nhập hoặc Xóa người dùng, mọi phiên của người đó bị thu hồi ngay lập tức. JWT không đáp ứng được yêu cầu này nếu không có danh sách thu hồi, mà khi đã có danh sách thu hồi thì JWT không còn ưu điểm "không trạng thái". Frontend và API chạy chung domain nên không cần token gửi qua header.
