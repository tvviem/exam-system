# Hướng dẫn: Mã đề của Phiên thi

Dành cho **Người ra đề** và **Người dự thi**. Viết bằng lời của người dùng; thiết kế chi tiết và các quyết định ở [plan/ma-de-phien-thi-thiet-ke.md](../plan/ma-de-phien-thi-thiet-ke.md), thuật ngữ ở [GLOSSARY.md](../../GLOSSARY.md). Rút câu theo Phần (tỷ lệ rút) giải thích ở [rut-cau-theo-phan.md](rut-cau-theo-phan.md).

## Mã đề để làm gì

Bộ đề của bạn có tỷ lệ rút câu ở từng Phần (ví dụ Phần có 30 câu, rút 50 % thì mỗi người làm 15 câu). Có hai cách ra đề cho một Phiên thi:

- **Dùng chung các Mã đề (mặc định):** khi lưu Phiên thi, hệ thống **rút bộ câu một lần** cho từng **Mã đề** (Đề 1, Đề 2, …, tối đa 10) rồi tự chia Người dự thi vào các Mã đề. Những người **cùng Mã đề nhận đúng cùng tập câu**; các Mã đề thường khác nhau ở một số câu. Thứ tự câu và phương án vẫn xáo riêng từng người nếu bạn bật hai công tắc xáo trộn (mặc định tắt). **Một Mã đề** nghĩa là cả Phiên thi làm cùng một bộ câu.
- **Mỗi người một đề:** mỗi người được rút bộ câu riêng khi vào thi (như trước đây). Không có Mã đề và không xuất được một đề giấy chung.

> **Mã vào thi và Mã đề là hai thứ khác nhau.** Người dự thi vẫn chỉ nhập **Mã vào thi** như trước. **Mã đề** do hệ thống gán cho từng người trong Danh sách dự thi; người dự thi không nhập hay chọn. Bạn đổi tay được.

Mã đề, bộ câu của từng Mã đề và cách chia người đều **ghi vào cơ sở dữ liệu ngay khi bạn lưu Phiên thi**, trước giờ thi. Xem thử, xuất Word, vào thi và chấm điểm đều đọc cùng một bộ câu đã lưu, nên không bao giờ lệch nhau.

## Dành cho Người ra đề

### 1. Tạo Phiên thi

Ở bước **Thiết lập làm bài** có khối **Cách ra đề**:

- **Dùng chung các Mã đề** (đã chọn sẵn) và ô **Số Mã đề** từ 1 đến 10 (mặc định 1). Nhập số sai thì ô báo lỗi và nút **Tạo Phiên thi** bị khóa.
- **Mỗi người một đề** để giữ cách cũ.

Khối **Rút câu theo Phần** ngay dưới vẫn dùng như trước: kế thừa tỷ lệ của Bộ đề hoặc **Thay đổi cho Phiên thi này**. Tỷ lệ rút dùng chung cho mọi Mã đề của Phiên thi. Bấm **Tạo Phiên thi** là hệ thống rút bộ câu cho từng Mã đề.

**Quy tắc điểm khi dùng chung Mã đề:** các câu trong một Phần được phép khác điểm, nhưng **mọi Mã đề phải cùng tổng điểm** (để ai ở Mã đề nào cũng có cùng điểm tối đa). Lệch thì không lưu được và có thông báo. Cách xử lý: cho các câu trong Phần cùng điểm (**Đặt điểm nhanh**), để Phần lấy đủ 100 %, hoặc dùng một Mã đề. Với **Mỗi người một đề**, các câu trong Phần rút dưới 100 % vẫn phải cùng điểm.

Hộp **Phát hành** Bộ đề chỉ **cảnh báo** (không chặn) khi Phần rút dưới 100 % có câu khác điểm, vì việc quyết định nằm ở Phiên thi.

### 2. Danh sách dự thi: ai thuộc Mã đề nào

Thêm người vào Danh sách thì họ **được gán Mã đề ngay**, vào Mã đề đang ít người nhất, nên số người các Mã đề luôn lệch nhau không quá 1. Tab **Danh sách** của Phiên thi (có từ hai Mã đề) có:

- **Dòng số người từng Mã đề** ("Đề 1: 3 người · Đề 2: 3 người") và cảnh báo khi lệch quá 1 người.
- **Hộp chọn Mã đề trên từng dòng** để đổi tay một người. Người **đã làm bài** thì khóa (Mã đề đã ghi vào Lượt làm bài); người chưa làm vẫn đổi được kể cả khi đã có người khác làm bài.
- **Chia lại:** chia ngẫu nhiên và cân bằng cả Danh sách, kể cả những người bạn đã đổi tay (có hộp xác nhận). Chỉ làm được **trước khi có người làm bài**.
- **Tải Excel phân Mã đề:** bảng Mã định danh, Họ và tên, Lớp, Mã đề để in danh sách phòng thi.

Đổi **số Mã đề** hay **Cách ra đề** ở trang sửa Phiên thi thì cả Danh sách được chia lại.

### 3. Tab Đề

Phiên thi dùng chung Mã đề có tab **Đề**. Chọn Mã đề để xem **câu theo Phần**, số câu và tổng điểm (chỉ có đề bài, **không có đáp án**). Các nút:

- **Xem thử Mã đề này:** đi qua đúng bộ câu của Mã đề như Người dự thi, đầu màn hình ghi "Đang xem Đề 2". Xem thử cả Phiên thi mà không chọn thì ra Mã đề đầu.
- **Xuất Word Mã đề này:** tệp Đề (và tệp Đáp án nếu muốn) chỉ gồm câu của Mã đề, ô "Mã đề" điền sẵn nhãn.
- **Xuất tất cả Mã đề (zip):** một tệp zip, mỗi Mã đề một tệp Đề và **Excel phân Mã đề**. Muốn kèm Đáp án của từng Mã đề thì bấm **Tải zip kèm Đáp án…** (có bước xác nhận vì tệp chứa đáp án đúng).
- **Rút lại Mã đề này / Rút lại tất cả Mã đề:** rút lại bộ câu (hạt giống mới), cách chia người giữ nguyên. Có hộp xác nhận. Chỉ làm được **trước khi có người làm bài**.

Nút **Xuất Bộ đề** ở đầu trang với Phiên thi nhiều Mã đề hỏi bạn chọn Mã đề cần xuất.

### 4. Theo dõi, Kết quả

- **Theo dõi:** bảng có cột **Mã đề**; dạng thẻ ghi Mã đề ở dòng định danh. Có ô lọc **Mã đề** cạnh ô lọc Lớp (lọc ngay trên máy; **Bỏ lọc** xóa cả hai). Số liệu tóm tắt và các thao tác "cả phòng" (Cộng giờ, Buộc nộp) luôn áp cho cả phòng.
- **Excel Kết quả:** trang *Tổng hợp* có cột **Mã đề** ngay sau *Lớp* (để trống nếu Phiên thi không có từ hai Mã đề). Các cột sau đó dịch sang phải một ô.
- Chấm điểm và Phúc khảo theo bộ câu của Mã đề; điểm tối đa của mọi người cùng bằng nhau.

### 5. Khi nào không sửa được nữa

Từ **Lượt làm bài đầu tiên** của Phiên thi, hệ thống khóa: số Mã đề, Cách ra đề, tỷ lệ rút, **Rút lại** và **Chia lại**. Khi đó vẫn đổi tay Mã đề được cho **người chưa làm bài**.

### 6. Câu hỏi thường gặp

- **Người thêm vào Danh sách sau thì sao?** Được gán ngay vào Mã đề đang ít người nhất.
- **Một người làm nhiều Lượt?** Giữ nguyên Mã đề ở mọi Lượt (chỉ thứ tự xáo đổi theo từng Lượt).
- **Muốn đổi tỷ lệ rút mặc định của Bộ đề?** Bộ đề đã Phát hành không sửa được; chỉnh tỷ lệ ở Phiên thi (**Thay đổi cho Phiên thi này**) hoặc Nhân bản Bộ đề rồi Phát hành bản mới.
- **Chống chép bài?** Người cùng Mã đề có cùng tập câu, nên chống chép kém hơn kiểu mỗi người một đề; chỉ còn khác thứ tự câu và phương án (nếu bật xáo). Cần chặt hơn thì dùng nhiều Mã đề, hoặc **Mỗi người một đề**.
- **Có nên dùng 10 Mã đề cho 500 người?** Được. Số đo: lưu Phiên thi 10 Mã đề 88 ms, thêm 500 người 146 ms, Chia lại 56 ms, xuất zip 10 Mã đề 352 ms ([architecture.md](../architecture.md), "Ngân sách phản hồi").

## Dành cho Người dự thi

- Nhập **Mã vào thi** như mọi khi. Nếu Phiên thi có từ hai Mã đề, màn xác nhận trước khi bắt đầu có dòng **"Mã đề của bạn: Đề 2"**, và đầu màn làm bài có "**Mã đề của bạn: Đề 2 · Bài gồm 15 câu**".
- Phiên thi chỉ có một Mã đề, hay mỗi người một đề, thì **không có** dòng Mã đề.
- Bạn chỉ thấy các câu của Mã đề mình; không biết Mã đề hay câu của người khác. Nếu làm lại, bạn vẫn nhận đúng Mã đề này.
