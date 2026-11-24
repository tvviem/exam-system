# Màn làm bài, chế độ "Từng câu": câu hỏi là trung tâm (thiết kế)

**Trạng thái: `accepted`** (chủ dự án duyệt ngày 25/11/2026: hướng A "Câu hỏi là trung tâm" và đặt nút chuyển chế độ trong bảng Aa; cùng năm điểm kiểm thử T1 đến T5). Chỉ giao diện: không migration, không đổi API. Dự kiến ra bản `0.5.3` (PATCH).

## 1. Vấn đề (góp ý của chủ dự án sau khi chạy thử cả luồng, 25/11/2026)

Ở chế độ Từng câu, phía trên câu hỏi có băng "Mã đề của bạn · Bài gồm N câu", hàng chuyển Từng câu / Cả đề, khối "Hướng dẫn làm bài", tên Phần và hướng dẫn của Phần. Bấm **Câu tiếp** hay **Câu trước** thì trang cuộn về đầu, nên câu hỏi mới nằm gần đáy màn hình (hoặc ra ngoài hẳn khi hướng dẫn dài) và Người dự thi phải cuộn xuống lặp đi lặp lại. Đo trên điện thoại 412×915: đề bài bắt đầu ở khoảng y = 495 px, phương án C và D bị thanh dưới che; trên máy tính 1280×720 câu hỏi nằm nửa dưới màn hình.

## 2. Thiết kế (điện thoại và máy tính dùng chung)

1. **Thanh đầu (dính):** giờ, trạng thái lưu, chip **"Đề N"** (chỉ khi Phiên thi có từ hai Mã đề; tên truy cập "Mã đề của bạn: Đề N"), Aa, Nộp bài. Bỏ băng Mã đề trên đầu đề.
2. **Thanh dưới (dính):** nút bảng câu ghi **"Câu 2/6"** (dòng 1) và "Đã làm 1/6 câu" (dòng 2) kèm ‹ ›; tên truy cập vẫn nêu đủ tiến độ và số câu còn lại. Chế độ Cả đề giữ hai dòng cũ.
3. **Trên thẻ câu hỏi chỉ còn một dòng:** tên Phần và nút **ⓘ Hướng dẫn**. Hộp "Hướng dẫn làm bài" gồm hướng dẫn chung và hướng dẫn của Phần đang làm. Hướng dẫn của Phần hiện sẵn dưới dòng đó **chỉ ở câu đầu tiên của Phần**.
4. **Bỏ hàng chuyển chế độ;** chuyển trong bảng Aa, mục **"Cách xem đề"**. Chế độ Cả đề giữ hướng dẫn ở đầu trang (và nay hiện cả hướng dẫn của từng Phần, trước đây bị bỏ sót).
5. **Cuộn:** Câu tiếp, Câu trước hay nhảy từ bảng câu thì trang cuộn ngay (không hiệu ứng) tới đầu thẻ câu hỏi, sát dưới thanh đầu (`scroll-margin-top` bằng chiều cao thanh đầu); tới đầu khối Phần nếu vừa sang Phần có tên hoặc hướng dẫn. Con trỏ về tiêu đề "Câu n" (`tabindex="-1"`) cho trình đọc màn hình. Chọn đáp án không làm trang nhảy.

Kết quả đo: ở 412×915 thẻ câu hỏi hiện trọn cả bốn phương án ngay dưới thanh đầu sau mỗi lần chuyển câu.

## 3. Kiểm thử

| # | Điểm | Cách |
|---|---|---|
| T1 | Ngữ cảnh của câu đang làm | Hàm thuần `oneModeContext` và `hasRichText` (`lib/take/one-mode.ts`): câu đầu Phần có hướng dẫn, câu giữa Phần, Phần có tên không hướng dẫn, Phần không tên, nút Hướng dẫn, chỉ số ngoài phạm vi (8 bài, đỏ rồi xanh) |
| T2 | Neo cuộn | E2E điện thoại và máy tính: sau Câu tiếp, Câu trước, "Câu n" nằm ngay dưới thanh đầu (khung nhìn thấp để trang cuộn được), hai phương án đầu không bị thanh dưới che, con trỏ ở tiêu đề; chọn đáp án không đổi `scrollY` |
| T3 | Hướng dẫn | E2E: hướng dẫn Phần hiện ở câu đầu của Phần và ẩn ở câu sau; hộp ⓘ có hướng dẫn chung và hướng dẫn của Phần đang làm |
| T4 | Mã đề và vị trí | E2E: chip "Đề N" ở thanh đầu, không còn băng "Bài gồm N câu", "Câu 1/6" ở thanh dưới; 360 px không tràn ngang |
| T5 | Chuyển chế độ | E2E: chuyển trong Aa và nhớ sau khi tải lại; Cả đề giữ hướng dẫn ở đầu trang; tám spec cũ đổi sang hàm trợ giúp `setViewMode` |

Bài rà `a11y-sweep.spec.ts` vẫn đạt (nút "Cả đề" đổi sang `setViewMode`).

## 4. Ngoài phạm vi

Vuốt trái, phải để chuyển câu (dễ xung đột với cuộn ngang của công thức); tự chuyển câu sau khi chọn đáp án; ghi nhớ Phần đã đọc hướng dẫn.
