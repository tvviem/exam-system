---
status: accepted
---

# PostgreSQL là nơi lưu trữ gốc, JSONB cho phần riêng của từng Loại câu hỏi

Dữ liệu của hệ thống có quan hệ chặt chẽ (Người dùng → Chủ đề → Câu hỏi → Bộ đề → Phiên thi → Lượt làm bài → Câu trả lời → Phúc khảo), và điểm số đòi hỏi giao dịch ACID cùng ràng buộc toàn vẹn. Vì vậy chọn PostgreSQL thay vì một CSDL NoSQL làm nơi lưu trữ gốc. Phần khác nhau giữa các Loại câu hỏi (Phương án, Mệnh đề, Đáp án đúng, Quy tắc chấm) được lưu trong cột `JSONB` và kiểm tra bằng schema dùng chung giữa frontend và backend. Cách này giữ được sự linh hoạt kiểu tài liệu mà không phải tách sang một hệ lưu trữ thứ hai.

## Considered Options

- **MongoDB**: phù hợp với nội dung Câu hỏi đa hình, nhưng việc Chấm, thống kê theo Lớp và Phúc khảo đều cần JOIN và giao dịch nhiều bảng. Với tải 200–300 Người dự thi đồng thời, MongoDB không mang lại lợi thế về hiệu năng.
