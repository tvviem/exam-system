# exam-system

Nền tảng Khảo thí Trực tuyến BLUNI, ưu tiên làm bài trên điện thoại. Viết tài liệu, nội dung giao diện và trao đổi với chủ dự án bằng tiếng Việt; tên trong mã nguồn bằng tiếng Anh.

## Ngôn ngữ nghiệp vụ

Dùng đúng thuật ngữ trong [GLOSSARY.md](GLOSSARY.md) (ví dụ Người ra đề / `Examiner`, Người dự thi / `Candidate`, Lượt làm bài / `Attempt`) cho tên biến, bảng, API và giao diện. Gặp khái niệm chưa có trong glossary thì thống nhất với chủ dự án trước, rồi mới bổ sung.

## Tài liệu thiết kế

- Đọc [docs/architecture.md](docs/architecture.md) trước khi thêm module, luồng nghiệp vụ hoặc thay đổi hạ tầng.
- Đọc [docs/data-model.md](docs/data-model.md) trước khi viết migration hoặc truy vấn.
- Đọc [docs/adr/](docs/adr) trước khi thay đổi một quyết định đã ghi; muốn đổi thì viết ADR mới thay thế.

## Bất biến của hệ thống

- Đáp án đúng chỉ tồn tại ở server: không có trong response API nào gửi cho Người dự thi, kể cả sau khi Công bố kết quả.
- Server quyết định thời gian (`deadline`) và điểm; client chỉ hiển thị.
- Câu trả lời được ghi vào PostgreSQL trước khi API báo lưu thành công.
- Lượt làm bài, Chấm và Phúc khảo chỉ đọc bản chụp trong `exam_items.snapshot`.

## Quy trình làm việc

Chủ dự án duyệt thiết kế trước khi viết code: đề xuất thay đổi kiến trúc hoặc mô hình dữ liệu dưới dạng tài liệu hoặc ADR ở trạng thái `proposed`, chờ đồng ý rồi mới triển khai.

## Hiệu năng

Phản hồi tức thời là yêu cầu hàng đầu của chủ dự án: chờ quá 2–3 giây là đã chậm, mục tiêu là cỡ mili giây. Khi viết hoặc chạy test, xem cả thời gian (không chỉ đúng/sai); thao tác hay yêu cầu nào quá khoảng 300 ms là đáng xem lại, quá 1 giây là lỗi. Ngân sách và số đo hiện có ở [docs/architecture.md](docs/architecture.md), mục "Ngân sách phản hồi".
