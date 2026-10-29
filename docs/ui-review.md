# Đánh giá giao diện quản trị và độ phù hợp với các vai trò sau này

> Ngày 29/10/2026, sau khi chủ dự án dùng thử lát cắt 1. Phương pháp: bộ quy tắc của skill UI UX Pro Max (10 nhóm theo mức ưu tiên, kèm tra cứu quy tắc điều hướng, bố cục, bảng, biểu mẫu, phản hồi), ảnh chụp giao diện thật ở 390, 768, 1024 và 1440 px ở cả hai chế độ sáng và tối, và đối chiếu với các chức năng của lát cắt 2 đến 6 trong [architecture.md](architecture.md) và README. Kết luận đã dẫn tới các quyết định Q106–Q110 trong [ui-design.md](ui-design.md).

## 1. Câu trả lời ngắn

Giao diện quản trị của lát cắt 1 **dùng được trên điện thoại và máy tính** (không tràn ngang, vùng chạm 48 px, danh sách chuyển từ thẻ sang bảng ở 768 px), nhưng **chưa phải một khung giao diện đủ tốt để làm nền cho các lát cắt sau**:

1. Khung điều hướng là một hàng tab ngang. Quản trị viên đã có 6 mục và chiếm 3 hàng trên điện thoại; Người ra đề sẽ có thêm Ngân hàng câu hỏi, Bộ đề, Phiên thi, Chấm bài nên chắc chắn không đủ chỗ.
2. Hai cỡ màn hình quan trọng chưa được thiết kế: **máy tính bảng (768 px)** và **màn rộng (≥ 1280 px)**. Ở 768 px bảng Người dùng bị nén (huy hiệu xuống 3 dòng, tên xuống 3 dòng); ở 1440 px nội dung bị dồn vào cột 1024 px.
3. Mỗi trang danh sách được viết tay riêng, chưa có thành phần dùng chung (bảng thích ứng, thanh lọc, chip số liệu, thanh hành động dính đáy, thông báo nổi). Lát cắt 2 đến 5 cần nhiều màn hình dạng này nên sẽ lặp code và lệch giao diện.
4. Các màn hình phức tạp của Người ra đề (soạn câu hỏi, dựng Bộ đề, theo dõi phòng thi thời gian thực, chấm bài) **chưa có mẫu thiết kế nào**, trong khi chúng quyết định phần lớn trải nghiệm của vai trò này.

Hướng thiết kế mới (khung thích ứng, mẫu trang, thành phần dùng chung) **phù hợp với cả Người ra đề và Người dự thi**, với điều kiện Người dự thi dùng khung riêng (khu làm bài theo prototype A/B), không dùng khung quản trị.

## 2. Đối chiếu từng nhóm quy tắc

Trạng thái: **Đạt** · **Một phần** · **Chưa**. Mã quy tắc theo skill UI UX Pro Max.

| Nhóm | Quy tắc | Hiện tại | Bằng chứng / xử lý |
|---|---|---|---|
| Truy cập (1) | `color-contrast` ≥ 4,5:1 | Đạt | Đã đo, bảng token mới cũng đạt; kiểm tự động ở Q104 |
| | `focus-states`, `form-labels`, `aria-labels` | Đạt | Viền focus 2 px, nhãn luôn hiện, nút biểu tượng có `aria-label` |
| | `table-header` có nhãn | Một phần | Cột chọn dòng có tiêu đề rỗng, đã sửa bằng nhãn ẩn ở PR 1e |
| | Cập nhật huy hiệu bất đồng bộ có thông báo ngữ cảnh | Chưa | Chuông thông báo đổi số nhưng không có vùng `aria-live`; sửa trong PR UI-1 |
| Chạm (2) | Vùng chạm ≥ 44–48 px | Đạt (điện thoại) | Nhưng **chưa phân biệt thiết bị trỏ chuột**: bảng dày đặc của lát cắt 4 và 5 cần hàng 40 px trên máy tính (Q109) |
| Bố cục (5) | `breakpoint-consistency` 375/768/1024/1440 | Chưa | Chỉ có điểm gãy ở 768; 1024 và 1440 chưa được thiết kế |
| | `horizontal-scroll`, `viewport-meta` | Đạt | Không tràn ngang ở 360 px |
| | `container-width` | Một phần | Cột cố định 1024 px làm lãng phí màn rộng; các màn dày đặc cần chiều ngang (Q107) |
| | `chip-collection-reflow`, `compact-label-overflow` | Chưa | Huy hiệu bị bẻ dòng ở 768 px; đã thêm `whitespace-nowrap` và cỡ chữ 13 px |
| Điều hướng (9) | `adaptive-navigation` (≥ 1024 px thanh bên) | Chưa | Chỉ có tab ngang |
| | `bottom-nav-limit` ≤ 5 mục, `nav-label-icon` | Chưa | Tab ngang có 6 mục và không có biểu tượng |
| | `nav-state-active`, `deep-linking`, `back-behavior` | Đạt | Mục đang chọn được tô; mọi trang có URL; danh sách giữ lọc và trang trên URL |
| | `breadcrumb-web` (≥ 3 cấp) | Chưa | Người dùng → chi tiết → nhật ký chỉ có nút "Danh sách…"; cần khi Chủ đề → Câu hỏi → Phiên bản (Q106) |
| | `avoid-mixed-patterns` | Đạt | Chỉ một kiểu điều hướng chính |
| Biểu mẫu, phản hồi (8) | `confirmation-messages`, `toast-notifications` | Chưa | Thao tác thành công chỉ hiện dòng "Đã lưu." cục bộ; chưa có thông báo nổi dùng chung |
| | `bulk-actions`, thanh hành động dính | Một phần | Có chọn nhiều dòng ở yêu cầu cấp tài khoản, nhưng nút nằm ở đầu trang và cuộn khuất trên điện thoại |
| | `empty-states`, `loading-indicators` | Đạt | Khung xương giữ chỗ; trạng thái trống có hướng dẫn |
| Chữ và màu (6) | `semantic-color-tokens` | Đạt | Đã dùng token ngữ nghĩa |
| | Thang cỡ chữ nhất quán | Chưa | Cỡ chữ rải rác; huy hiệu 12 px thấp hơn quy định của chính tài liệu |
| Nhất quán | Thành phần dùng chung | Chưa | Mỗi danh sách viết riêng (`UserTable`, `ItemTable`, `RequestListItem`...) |

## 3. Độ phù hợp với từng vai trò trong các lát cắt sau

**Thiết bị chính của từng vai trò** quyết định mẫu thiết kế:

| Vai trò | Thiết bị chính | Ghi chú |
|---|---|---|
| Quản trị viên | Laptop, đôi khi điện thoại | Việc ít nhưng nhạy cảm (khóa, xóa, duyệt); cần xác nhận rõ |
| Người ra đề | **Laptop khi soạn, chấm; điện thoại hoặc máy tính bảng khi theo dõi phòng thi** | Cùng một người, hai bối cảnh rất khác nhau |
| Người dự thi | **Điện thoại** | Áp lực thời gian, mạng chập chờn |

| Chức năng (lát cắt) | Yêu cầu giao diện | Khung hiện tại | Khung đề xuất |
|---|---|---|---|
| Ngân hàng câu hỏi: cây Chủ đề, danh sách Câu hỏi, lọc, thao tác hàng loạt (2) | Chia đôi (cây Chủ đề bên trái, danh sách bên phải) trên laptop; trên điện thoại cây thành ngăn kéo; chọn nhiều + thanh hành động | Không đáp ứng: không có thanh bên, không có thanh hành động | Mẫu **Danh sách có bộ lọc** + ngăn bên (Q108) |
| Trình soạn câu hỏi: 4 loại, soạn công thức, ảnh (2) | 2 cột soạn / xem trước thật trên laptop; điện thoại hai tab "Soạn" và "Xem trước", thanh công cụ dính; tự lưu có trạng thái | Chưa có mẫu | Mẫu **Soạn** (mục 10), vùng nội dung rộng (Q107) |
| Nhập câu hỏi từ Excel (2) | Tải lên → xem trước từng dòng lỗi → xác nhận | Đã có mẫu tương tự ở Yêu cầu cấp tài khoản | Dùng lại mẫu đó (bảng dòng + chip số liệu + thanh duyệt) |
| Dựng Bộ đề: Phần, kéo thả, chọn câu, đặt điểm nhanh, Xem thử, Phát hành (3) | Kéo thả có thay thế bằng nút ↑↓ cho bàn phím và điện thoại; chọn câu trong ngăn bên; bảng điểm sửa tại chỗ | Chưa có mẫu | Mẫu **Soạn** + ngăn bên; Xem thử dùng chính khu làm bài |
| Tạo Phiên thi: Khung giờ, Thời lượng, Mã vào thi, Danh sách dự thi (4) | Biểu mẫu nhiều nhóm; chọn người theo Lớp hoặc từng người | Chỉ có biểu mẫu đơn giản | Mẫu **Các bước** (mục 10) |
| **Theo dõi phòng thi thời gian thực** (4) | Tóm tắt số lượng; danh sách ổn định không nhảy dòng; lọc theo trạng thái; hành động từng người và hàng loạt (cộng giờ, đổi thiết bị, Đình chỉ có lý do); dùng được bằng một tay khi đi quanh lớp | Chưa có mẫu | Mẫu **Theo dõi** (mục 10), hành động trong ngăn kéo; thẻ lớn trên điện thoại |
| **Chấm Câu tự luận** (5) | Chia đôi (hàng đợi bài ẩn tên bên trái, nội dung và ô điểm bên phải), phím tắt, tự lưu điểm, tiến độ; điện thoại: một bài mỗi màn | Chưa có mẫu | Mẫu **Chấm** (mục 10) |
| Công bố, Phúc khảo, xuất Excel (5) | Bảng kết quả rộng, cột tên cố định khi cuộn ngang, lọc; hàng đợi phúc khảo giống hàng đợi chấm | Bảng không có cột cố định | Thành phần bảng có cột cố định (Q108) |
| Quản trị: Chuyển giao Chủ đề (2) | Chọn người nhận trong hộp thoại có tìm kiếm | Có hộp thoại | Giữ |
| Người dự thi: nhập Mã vào thi (4), làm bài, xem Kết quả, Phúc khảo (5) | Phone-first, vùng chạm lớn, mất mạng vẫn dùng được | Prototype A/B đã chốt | Khu làm bài riêng, cùng bảng màu và bảng "Hiển thị" (Q102) |

## 4. Kết luận

- **Giữ:** nguyên tắc ở [ui-design.md](ui-design.md) mục 1 (yên tĩnh, không chỉ dựa vào màu, điện thoại trước), token ngữ nghĩa, `<dialog>` gốc, lucide, Be Vietnam Pro.
- **Thay:** hàng tab ngang bằng khung thích ứng (thanh bên ≥ 1024 px, thanh tab dưới đáy bên dưới); cột cố định 1024 px bằng vùng nội dung thích ứng.
- **Bổ sung:** bộ mẫu trang và thành phần dùng chung trước khi viết các màn hình của lát cắt 2.
- **Làm sau, khi tới lượt:** mẫu **Theo dõi** (lát cắt 4) và **Chấm** (lát cắt 5) cần prototype riêng để chủ dự án chọn trước khi lập trình, như đã làm với giao diện làm bài.
- **Bản thử** của khung mới nằm ở nhánh `prototype/ui-theme` (`prototypes/ui-theme/khung-moi/`), dựng bằng thành phần thật của ứng dụng.
