---
status: accepted
---

# Redis chỉ chứa dữ liệu tạm; Câu trả lời ghi thẳng vào PostgreSQL

Redis được dùng cho phiên đăng nhập, giới hạn tần suất (rate limit), hàng đợi BullMQ (ví dụ tự động Nộp bài khi hết giờ), adapter Socket.IO, theo dõi trạng thái online và cache nội dung Bộ đề trong Phiên thi. Redis **không** giữ Câu trả lời. Mỗi lần lưu, Câu trả lời được ghi thẳng (upsert) vào PostgreSQL. Ước tính 300 Người dự thi, mỗi người lưu khoảng 5 giây một lần, cho ra khoảng 60 lượt ghi mỗi giây. Mức này nhẹ với PostgreSQL. Ghi đệm qua Redis (write-behind) sẽ thêm nguy cơ mất bài khi Redis gặp sự cố mà không đổi lại lợi ích gì.

## Consequences

- Mất Redis chỉ làm mọi người phải đăng nhập lại và mất trạng thái online; không mất Câu trả lời nào.
- Nếu quy mô tăng hơn 10 lần, xem xét lại phương án ghi đệm.
