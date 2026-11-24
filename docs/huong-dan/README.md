# Hướng dẫn sử dụng

Hướng dẫn viết bằng lời của người dùng, chia theo vai: **Quản trị viên**, **Người ra đề**, **Người dự thi**. Thuật ngữ in hoa theo [GLOSSARY.md](../../GLOSSARY.md). Các hướng dẫn này là nền để biên soạn tài liệu hướng dẫn dạng PDF gửi người dùng; bảng dưới cho biết phần nào đã có, phần nào còn thiếu. Cập nhật đến **bản 0.5.2** (24/11/2026).

## Đã có

| Hướng dẫn | Vai | Nội dung | Từ bản |
|---|---|---|---|
| [cham-diem-va-phuc-khao.md](cham-diem-va-phuc-khao.md) | Người ra đề, Người dự thi | Chấm tự động và chấm Câu tự luận, quyết Mức xử lý cho Vi phạm, Công bố kết quả, Phúc khảo, Đính chính đáp án, Ủy quyền chấm, xem Kết quả của tôi | 0.1.0 |
| [rut-cau-theo-phan.md](rut-cau-theo-phan.md) | Người ra đề, Người dự thi | Tỷ lệ rút câu ở Bộ đề và Phiên thi, chuyển nhanh giữa các Phần, thẻ tổng quan và lọc của Bộ đề đã Phát hành, Xem thử, chấm theo bộ câu của từng người | 0.3.0 |
| [ma-de-phien-thi.md](ma-de-phien-thi.md) | Người ra đề, Người dự thi | Cách ra đề, Mã đề, chia và đổi tay Người dự thi, Chia lại, Rút lại, xuất Word và zip, Theo dõi và Excel theo Mã đề | 0.5.0 |

## Còn thiếu (cần viết để đủ bộ cho bản PDF)

| Vai | Việc cần hướng dẫn | Tài liệu hiện có để dựa vào |
|---|---|---|
| Người dự thi | Nhận thư kích hoạt, đăng nhập và đổi mật khẩu, quên mật khẩu; **Vào thi** (Mã vào thi, màn xác nhận); làm bài trên điện thoại (Từng câu và Cả đề, đánh dấu xem lại, lưới số câu, mất mạng, nộp bài); xem Kết quả của tôi | [ops/tai-khoan-va-mat-khau.md](../ops/tai-khoan-va-mat-khau.md), [plan/slice-4.md](../plan/slice-4.md), [architecture.md](../architecture.md) mục 7 |
| Người ra đề | Bắt đầu: đăng nhập, tài khoản, gửi **Yêu cầu cấp tài khoản** cho Người dự thi | [ops/tai-khoan-va-mat-khau.md](../ops/tai-khoan-va-mat-khau.md), [plan/yeu-cau-nhieu-giang-vien-thiet-ke.md](../plan/yeu-cau-nhieu-giang-vien-thiet-ke.md) |
| Người ra đề | **Ngân hàng câu hỏi**: Chủ đề, bốn Loại câu hỏi, Hình minh họa, công thức, nhập từ Excel, Lưu trữ, tag | [plan/slice-2.md](../plan/slice-2.md), [demo-data/README.md](../../demo-data/README.md) |
| Người ra đề | **Soạn Bộ đề**: Phần, thêm câu, Đặt điểm nhanh, Xem thử, Phát hành, Nhân bản, Lưu trữ, Xuất Bộ đề ra Word | [plan/slice-3.md](../plan/slice-3.md), [plan/xuat-bo-de-thiet-ke.md](../plan/xuat-bo-de-thiet-ke.md) |
| Người ra đề | **Tạo Phiên thi và Danh sách dự thi**: Khung giờ, Thời lượng, Mã vào thi, thêm người theo Lớp, xáo trộn | [plan/slice-4.md](../plan/slice-4.md) |
| Người ra đề | **Theo dõi phòng thi**: Cộng giờ, Buộc nộp và Hoàn tác, Thu hồi thiết bị, Cảnh cáo, Đình chỉ, Đóng cửa vào thi | [plan/slice-4.md](../plan/slice-4.md), [ops/checklist-phien-thi.md](../ops/checklist-phien-thi.md) |
| Quản trị viên | Tạo Quản trị viên đầu tiên, Lời mời, duyệt Yêu cầu cấp tài khoản, Nhãn vai trò, Khóa và Xóa người dùng, Chuyển giao Chủ đề, nhật ký, Sao lưu | [ops/tai-khoan-va-mat-khau.md](../ops/tai-khoan-va-mat-khau.md), [ops/khoi-phuc.md](../ops/khoi-phuc.md), [ops/gui-thu.md](../ops/gui-thu.md) |
| Mọi vai | Hỏi đáp thường gặp và cách xử lý khi có sự cố (không vào được, mất mạng giữa chừng, quên mật khẩu, đổi máy) | [ops/checklist-phien-thi.md](../ops/checklist-phien-thi.md) |

## Quy ước khi viết hướng dẫn

- Mỗi hướng dẫn mở đầu bằng **Dành cho** vai nào, rồi **Từ bản** nào; viết theo việc người dùng muốn làm, không theo cấu trúc mã.
- Dùng đúng nhãn trên giao diện (in đậm), ví dụ nút **Thêm câu hỏi**, tab **Danh sách**; khi giao diện đổi nhãn thì sửa hướng dẫn cùng PR.
- Ảnh chụp màn hình (nếu có) dùng dữ liệu mẫu, không có tên, mã sinh viên hay email của người thật (kho mã nguồn công khai).
- Không ghi đường dẫn máy chủ, khóa, mật khẩu hay địa chỉ nội bộ.
- Không nêu cách khai thác lỗ hổng; việc vận hành máy chủ nằm ở [../ops/](../ops).
