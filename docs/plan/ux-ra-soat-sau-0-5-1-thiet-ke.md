# Rà soát UX/UI sau bản 0.5.1: sáu điểm cần chỉnh (thiết kế đề xuất)

**Trạng thái: `accepted`** (chủ dự án duyệt ngày 24/11/2026, đồng ý cả sáu quyết định D1 đến D6 như đề xuất). Chỉ chỉnh giao diện: không migration, không đổi API, không đổi nghiệp vụ. **Tiến độ (24/11/2026):** PR A (U2, U3) đã merge (#158); PR B (U1) đang chờ CI (#159); PR C (U4 đến U6) chưa làm. Dự kiến ra bản **`0.5.2`** (PATCH, cùng lý do với `0.5.1`, xem [phat-hanh.md](../ops/phat-hanh.md) mục 7).

## 1. Nguồn và phạm vi

Ngày 24/11/2026, sau khi gộp hai nhóm góp ý của bản `0.5.1`, chủ dự án nhờ rà lại giao diện của **Người ra đề** và **Người dự thi** xem đã thân thiện, tối ưu và không thừa thông tin chưa. Cách rà: chạy bản trên `main` (`fcc0622`) với dữ liệu thật qua Playwright trên điện thoại (Pixel 7) và máy tính (1280 px), chụp ảnh toàn trang 22 trang (Người dự thi, Người ra đề), đo tự động (tràn ngang, nút không có tên, kích thước vùng bấm, tiêu đề cấp 1, dòng chữ lặp), rồi xem từng ảnh.

**Kết quả tốt (giữ nguyên):** không trang nào tràn ngang; không nút nào thiếu tên; màn xác nhận vào thi và màn làm bài gọn, đủ ý; trang Bộ đề đã phát hành đúng thiết kế đã duyệt. **Sáu điểm dưới đây** là những chỗ nên chỉnh. Ba điểm đầu là lỗi rõ (chủ dự án gọi là "3 điểm lỗi"), ba điểm sau là điểm nên cân nhắc.

Chưa rà: trang Quản trị viên, và các màn Người dự thi sau Công bố kết quả (xem kết quả, Phúc khảo). Để dành cho đợt sau.

## 2. Sáu điểm

### U1. Bảng Ngân hàng câu hỏi trên máy tính: cột "Phần dẫn" bị ép, cột "Cập nhật" bị cắt

**Hiện trạng (1280 px):** màn hình có hai thanh bên (menu 18 rem và danh sách Chủ đề 16 rem) nên vùng bảng chỉ còn khoảng 650 px, mà bảng có 7 cột. Cột Phần dẫn (quan trọng nhất) rộng chừng 70 px, mỗi dòng vài chữ, câu hỏi dài thành 5 dòng; cột "Cập nhật" nằm ngoài khung và bị cắt. Cột Chủ đề lặp tên Chủ đề ở mọi dòng dù đã chọn lọc theo Chủ đề; nhãn "Trong 1 Bộ đề" lặp ở **mọi** dòng (12 lần), trên cả thẻ điện thoại.

**Đề xuất:**
- Cột Phần dẫn **rộng tối thiểu 18 rem** và chiếm phần còn lại; tối đa hai dòng.
- **Bỏ cột Chủ đề.** Khi đang xem "Tất cả Chủ đề", tên Chủ đề hiện thành **dòng phụ nhỏ dưới Phần dẫn** (cả bảng và thẻ); khi đã chọn một Chủ đề thì không hiện (thông tin đã nằm ở thanh bên).
- **Nhãn "Dùng ở": chỉ nêu ngoại lệ.** Câu chưa vào Bộ đề nào hiện chữ nhạt "Chưa dùng" ở dòng phụ; câu đã vào Bộ đề thì **không hiện nhãn** (đó là trạng thái thường). Lưu ý: ngân hàng mới nhập (nhiều câu chưa vào Bộ đề) sẽ có nhiều dòng "Chưa dùng"; nếu thấy nhiễu, hướng thay thế là bộ lọc "Chưa dùng". Số Bộ đề vẫn xem được ở trang sửa câu và khi xóa (đã có cảnh báo "đang dùng").
- Cột "Cập nhật" chỉ hiện từ **1536 px** (cỡ `2xl`); dưới đó ngày cập nhật nằm trong dòng phụ. Cột Loại, Điểm giữ.

**Kết quả mong muốn:** ở 1280 px, bảng không còn cuộn ngang, Phần dẫn đọc được trong hai dòng; thẻ điện thoại mất một nhãn lặp và một dòng chữ.

**Kiểm thử:** hàm thuần `questionRowInfo({ topicFiltered, examCount })` trả `{ showTopic, usageLabel }`; E2E ở 1280 px kiểm Phần dẫn rộng ≥ 280 px và vùng chứa bảng không cuộn ngang; E2E điện thoại kiểm không còn nhãn "Trong 1 Bộ đề" lặp.

### U2. Phiên thi > Tổng quan: danh sách dọc dài, Mã vào thi ở cuối, tab xuống ba dòng

**Hiện trạng (điện thoại):** tám thông tin xếp mỗi thứ hai dòng nên trang dài; **Mã vào thi, thứ Người ra đề cần nhất lúc thi, nằm gần cuối**. Thanh tab bốn nhãn chia đều nên "Danh sách dự thi" xuống ba dòng và "Tổng quan" hai dòng, các tab lệch nhau. Trên máy tính trang ổn.

**Đề xuất:**
- **Thẻ Mã vào thi lên đầu** (ngay dưới nút hành động): mã chữ lớn đơn cách, nút **Sao chép**, một dòng nhắc "Người dự thi nhập mã này tại trang Vào thi". Chỉ hiện khi Phiên thi chưa kết thúc hoặc hủy. Bỏ dòng "Mã vào thi" cũ ở cuối.
- Thông tin còn lại thành **lưới hai cột** trên điện thoại (ô ngắn: Thời lượng, Số Lượt, Cắt cứng, Cách ra đề, Xáo trộn, Hiện cách tính điểm, Người trong Danh sách); **Khung giờ và Bộ đề** (dài) chiếm trọn một hàng. Máy tính giữ nguyên.
- **Thanh tab dùng chung (`Tabs`):** nhãn không xuống dòng, cuộn ngang khi không đủ chỗ (có dấu mờ ở mép), vùng bấm ≥ 44 px. Rút "Danh sách dự thi" thành **"Danh sách"** (khớp cách gọi "Người trong Danh sách" và tên mục trong thuật ngữ). Đổi này áp dụng cho mọi nơi dùng `Tabs`.

**Kiểm thử:** E2E điện thoại kiểm Mã vào thi nằm trong 600 px đầu trang, mỗi tab cao một dòng (chiều cao chữ ≈ nhau), không tràn ngang; E2E máy tính kiểm bố cục giữ nguyên.

### U3. Trang Kết quả: năm nút xếp dọc, tab "Vi phạm" xuống dòng, dòng điểm thừa

**Hiện trạng (điện thoại):** năm nút (Chấm tự luận, Chấm ẩn tên, Ủy quyền chấm, Công bố kết quả, Xuất Excel) mỗi nút một hàng; nút chính "Công bố kết quả" lẫn với các nút phụ. Tab "Vi phạm (0 chưa quyết)" xuống hai dòng dù là số 0. Người "Chưa làm bài" vẫn hiện dòng "Điểm thô —/9 · quy đổi —" thừa so với nhãn trạng thái. Nút tên người dự thi cao 24 px, khó bấm. Đoạn giải thích "Cho xem lại đề sau Công bố" bốn dòng.

**Đề xuất:**
- **Một nút chính theo tình huống** (như hiện nay đã làm với Chấm tự luận): còn bài tự luận chờ chấm thì "Chấm tự luận (n)" là nút chính; hết bài chờ thì "Công bố kết quả" là nút chính. Nút chính **rộng trọn hàng** trên điện thoại; các nút còn lại xếp **lưới hai cột** (ba hàng thay vì năm). Máy tính giữ nguyên.
- Nút phụ trên điện thoại dùng chữ nhỏ hơn và **ẩn biểu tượng** để chữ không xuống dòng trong ô nửa hàng (nút "Chấm ẩn tên" đã có trạng thái bật/tắt cho trình đọc màn hình, không cần đổi tên).
- Tab "Vi phạm" chỉ kèm số khi **có Vi phạm chưa quyết** (huy hiệu số, có chữ cho người dùng màu); bằng 0 thì chỉ ghi "Vi phạm".
- Dòng điểm trong thẻ người dự thi **ẩn khi chưa có Lượt làm bài**; nhãn "Chưa làm bài" đủ.
- Cả thẻ người dự thi là vùng bấm (cao ≥ 44 px), không chỉ chữ tên.
- Đoạn giải thích "Cho xem lại đề sau Công bố" **gập thành "Chi tiết"** (nút mở, có chữ), mặc định hiện một dòng tóm tắt.

**Kiểm thử:** hàm thuần `releaseActionsOf(status, released)` trả nút chính và danh sách nút phụ; E2E điện thoại kiểm nút chính trọn hàng, chiều cao vùng bấm ≥ 44 px, tab một dòng, thẻ "Chưa làm bài" không có dòng điểm; E2E hiện có của Công bố, Chấm, Ủy quyền chạy lại nguyên.

### U4. Trang đầu của Người ra đề là "Yêu cầu cấp tài khoản"

**Hiện trạng:** `/examiner` chuyển thẳng tới form tải danh sách xin cấp tài khoản. Việc hằng ngày là Phiên thi, Bộ đề, Câu hỏi; yêu cầu cấp tài khoản chỉ làm thỉnh thoảng.

**Đề xuất:** `/examiner` chuyển tới **Phiên thi**. Thanh điều hướng giữ nguyên thứ tự. (Một trang "Hôm nay" tổng hợp Phiên thi sắp mở và đang chạy là ý hay nhưng là tính năng riêng, **ghi vào backlog**, không làm trong đợt này.)

**Kiểm thử:** cập nhật các E2E đang chờ trang Yêu cầu sau đăng nhập; E2E mới kiểm Người ra đề đăng nhập xong thấy "Phiên thi".

### U5. Màn "Vào thi" của Người dự thi: nhãn và lời nhắc lặp

**Hiện trạng:** trong nhóm "Đang mở", **mỗi thẻ lại có nhãn "Đang mở"** (lặp tiêu đề nhóm); mỗi thẻ có dòng "Nhập Mã vào thi để vào." và nút "Nhập mã" trong khi ô nhập mã đã ngay trên đầu trang.

**Đề xuất:**
- Nhãn trạng thái trên thẻ **chỉ hiện khi khác tiêu đề nhóm** (ví dụ "Đóng cửa vào thi" nằm trong nhóm đang chạy).
- Bỏ câu "Nhập Mã vào thi để vào."; nút **"Nhập mã"** giữ (bấm thì cuộn lên ô nhập và đưa con trỏ vào), rộng trọn hàng trên điện thoại.
- Giữ nguyên tên Phiên thi và tên Bộ đề (Người dự thi cần biết đề nào).

**Kiểm thử:** hàm thuần `phaseBadgeVisible(group, phase)`; E2E kiểm nhóm "Đang mở" không có nhãn lặp, bấm "Nhập mã" đưa con trỏ vào ô nhập.

### U6. Trợ năng: tiêu đề cấp 1 và vùng bấm nhỏ

**Hiện trạng:** các trang Kết quả, Chấm, Phúc khảo, Xem thử và màn Làm bài **không có tiêu đề cấp 1** (người dùng trình đọc màn hình không biết mình đang ở trang nào). Liên kết logo ở đầu trang cao 32 px (dưới ngưỡng 44 px trên điện thoại).

**Đề xuất:**
- Mỗi trang có **đúng một `h1`**: Kết quả, Chấm, Phúc khảo dùng tên Phiên thi làm `h1` (nâng cấp chữ đang có, giữ nguyên hình thức); Xem thử và Làm bài thêm `h1` ẩn trực quan (`sr-only`) ghi tên Phiên thi.
- Liên kết logo cao ≥ 44 px trên điện thoại (thêm đệm, không đổi cỡ logo).
- **Thêm một bài rà tự động lâu dài** `a11y-sweep.spec.ts` chạy trên các trang chính (điện thoại và máy tính): đúng một `h1`, không nút thiếu tên, không tràn ngang, vùng bấm ≥ 44 px trên điện thoại (có danh sách ngoại lệ nêu rõ lý do). Dùng lại logic đo đã viết cho đợt rà này; nhờ đó các lần chỉnh sau không làm giao diện xấu đi mà không ai biết.

## 3. Cách chia PR và thứ tự

| PR | Gồm | Vì sao thứ tự này |
|---|---|---|
| **A** | U2 + U3 (và `Tabs` dùng chung) | Người ra đề dùng nhiều nhất lúc đang thi và chấm; cùng sửa `Tabs`, `session` và `results` |
| **B** | U1 (Ngân hàng câu hỏi) | Độc lập, chỉ đụng trang danh sách câu hỏi |
| **C** | U4 + U5 + U6 (kèm bài rà lâu dài) | Thay đổi nhỏ, rải nhiều trang; bài rà chốt lại cả ba PR |

Mỗi PR theo quy trình quen: hàm thuần có kiểm thử (đỏ rồi xanh) → giao diện → E2E điện thoại và máy tính → ảnh chụp → chủ dự án nói "commit, push và mở PR". Sau khi cả ba vào `main`: chủ dự án deploy, kiểm, rồi gắn **`v0.5.2`**. Không đổi cơ sở dữ liệu nên lùi về `v0.5.1` luôn an toàn. Không deploy trong giờ thi.

## 4. Quyết định cần chủ dự án duyệt

| # | Điểm | Đề xuất |
|---|---|---|
| D1 | U1: nhãn "Dùng ở" chỉ nêu ngoại lệ ("Chưa dùng") | Đồng ý |
| D2 | U2: đổi nhãn tab "Danh sách dự thi" thành "Danh sách" | Đồng ý |
| D3 | U3: nút chính rộng trọn hàng, nút phụ lưới hai cột (không dùng menu "⋯") | Đồng ý (giữ nút nhìn thấy được, ít đổi hành vi) |
| D4 | U4: `/examiner` chuyển tới Phiên thi; trang "Hôm nay" để backlog | Đồng ý |
| D5 | U6: thêm bài rà trợ năng lâu dài vào bộ E2E (thêm khoảng một đến hai phút) | Đồng ý |
| D6 | Số bản: `0.5.2` (PATCH) | Đồng ý |

## 5. Ngoài phạm vi

- Trang "Hôm nay" cho Người ra đề; thay đổi màu hay phông chữ; trang Quản trị viên; thông báo lỗi `401` ở console của `/login` (là lời gọi kiểm tra đăng nhập khi chưa đăng nhập, bình thường).
