# Hướng dẫn: Rút câu theo Phần

Dành cho **Người ra đề** và **Người dự thi**. Viết bằng lời của người dùng; thiết kế chi tiết và các quyết định ở [plan/rut-cau-theo-phan-thiet-ke.md](../plan/rut-cau-theo-phan-thiet-ke.md), thuật ngữ ở [GLOSSARY.md](../../GLOSSARY.md).

## Rút câu để làm gì

Bạn có một Bộ đề lớn, ví dụ **100 câu chia 4 Phần**, nhưng mỗi Người dự thi chỉ làm **40 câu**. Hệ thống **rút ngẫu nhiên** 10 câu mỗi Phần. Phiên thi chọn **Cách ra đề**: **dùng chung các Mã đề** (mặc định; rút một lần khi lưu Phiên thi, người cùng Mã đề nhận cùng bộ câu) hoặc **mỗi người một đề** (rút riêng cho từng người khi vào thi lần đầu; hai người ngồi cạnh nhau nhận hai bộ câu khác nhau, nhưng cấu trúc đề giống nhau). Cách ra đề và Mã đề giải thích ở [ma-de-phien-thi.md](ma-de-phien-thi.md); phần dưới nói chung về tỷ lệ rút và các quy tắc của kiểu **mỗi người một đề**.

Không muốn rút thì **không cần làm gì**: mặc định mọi Phần lấy đủ (100 %), đề chạy y như trước.

## Dành cho Người ra đề

### 1. Đặt tỷ lệ khi soạn Bộ đề

Ở trang soạn Bộ đề, mỗi Phần có dòng **Rút câu từ Phần này** với ô tỷ lệ (mặc định 100). Ví dụ Phần có 25 câu, nhập **40** thì bên cạnh hiện "→ mỗi người nhận 10/25 câu". Phía trên các Phần có dòng tóm tắt: "Mỗi Người dự thi nhận 40 câu, tối đa 40 điểm".

- Tỷ lệ từ 0 đến 100, tối đa hai chữ số lẻ (gõ dấu phẩy hoặc dấu chấm đều được). Số lẻ được làm tròn **nửa lên**, và nếu tỷ lệ lớn hơn 0 thì mỗi người nhận **ít nhất 1 câu**.
- **Các câu trong Phần rút dưới 100 % phải cùng điểm**, để mọi người có cùng điểm tối đa. Nếu lệch, hệ thống cảnh báo ở Phần đó (kèm gợi ý dùng **Đặt điểm nhanh**). Hộp Phát hành chỉ **cảnh báo, không chặn**; nhưng Phiên thi kiểu **mỗi người một đề** sẽ không lưu được khi còn Phần lệch điểm. Phiên thi **dùng chung Mã đề** cho phép câu lệch điểm trong Phần, miễn các Mã đề cùng tổng điểm. Phần 100 % hay 0 % thì không cần cùng điểm.
- Không được để **mọi Phần đều 0 %** (Người dự thi sẽ không có câu nào).
- Ô tỷ lệ chỉ nhận số từ 0 đến 100. Để trống hoặc nhập số sai thì ô báo lỗi ngay cạnh và nút **Lưu** bị khóa cho tới khi sửa.
- **Phần đặt 0 %** không lấy câu nào: Người dự thi **không thấy Phần đó** (không hiện tên Phần rỗng) trong bài làm. Dòng Rút câu của Phần có ghi chú nhắc điều này.
- Bộ đề có từ hai Phần trở lên: thanh dính cạnh nút **Lưu** có bộ **chuyển nhanh giữa các Phần**: nút ‹ › sang Phần trước/sau, nhãn "Phần 2/3" cho biết đang xem Phần nào (đổi theo vị trí cuộn trang) và bấm nhãn để mở danh sách Phần (tên, số câu) rồi nhảy thẳng tới Phần đó.
- Dòng **Rút câu từ Phần này** luôn hiện trong thẻ của Phần, kể cả khi bấm **Thu gọn Phần** (chỉ danh sách câu bị ẩn), nên vẫn thấy tỷ lệ và "mỗi người nhận N/M câu".
- Thanh cạnh nút **Lưu** có hai dòng: tổng của cả Bộ đề ("15 câu · 20 điểm") và, khi có Phần rút dưới 100 %, số **mỗi người nhận** ("Mỗi người nhận 9 câu · 14 điểm"; chỉ nêu số câu khi còn Phần lệch điểm).

### 2. Phát hành

Hộp **Phát hành** liệt kê từng Phần: số câu có sẵn, tỷ lệ rút và số câu mỗi Người dự thi nhận (ví dụ "3/6 câu · rút 50 %", hoặc "6/6 câu · lấy đủ"), kèm dòng tổng: "Cả Bộ đề có 15 câu; mỗi Người dự thi nhận 12 câu, tối đa 12 điểm." Xem kỹ bảng này trước khi bấm Phát hành, vì sau đó không sửa được.

Tỷ lệ ở Bộ đề **đóng băng** khi Phát hành, như mọi nội dung khác. Muốn đổi tỷ lệ mặc định thì **Nhân bản** Bộ đề, sửa rồi Phát hành bản mới (Nhân bản mang theo tỷ lệ).

### 3. Tạo Phiên thi: kế thừa và ghi đè

Ở bước **Thiết lập làm bài** có khối **Rút câu theo Phần**. Mặc định chỉ hiện "Dùng tỷ lệ của Bộ đề: Phần I 40 %" và "Mỗi Người dự thi nhận … câu, tối đa … điểm". Bạn không phải làm gì thêm.

Muốn Phiên thi này khác Bộ đề (ví dụ Bộ đề rút 40 % cho kiểm tra, nhưng Phiên thi ôn tập lấy đủ), bấm **Thay đổi cho Phiên thi này**, sửa tỷ lệ từng Phần. Một Bộ đề dùng được cho nhiều Phiên thi với tỷ lệ khác nhau; **Dùng lại tỷ lệ của Bộ đề** xóa các thay đổi.

- Tỷ lệ của Phiên thi chỉ sửa được **trước khi có người làm bài**. Từ Lượt làm bài đầu tiên, bảng bị khóa và hiện lý do (vì người đã làm bài đã nhận bộ câu rồi).
- Phần lệch điểm bị ghi đè xuống dưới 100 % cũng bị cảnh báo ở kiểu **mỗi người một đề**. Bộ đề đã Phát hành không sửa điểm được; hãy Nhân bản Bộ đề, sửa điểm, tạo Phiên thi mới, đặt Phần đó 100 % hay 0 %, hoặc chuyển sang **dùng chung các Mã đề**.
- Tab **Tổng quan** của Phiên thi có dòng **Rút câu**: "Mỗi người nhận 12/15 câu (Phần I 70 %)".

### 4. Xem thử một lượt rút

Ở **Xem thử** của Phiên thi kiểu **mỗi người một đề** bạn thấy **một lượt rút mẫu** của một người ngẫu nhiên: "gồm 9 câu trong 15 câu của Bộ đề". Tải lại trang thì ra một bộ khác. Phiên thi **dùng chung Mã đề** thì Xem thử cho đúng bộ câu của Mã đề (chọn Mã đề ở tab **Đề**) và không đổi khi tải lại. Muốn xem cả Bộ đề thì dùng tab **Xem thử** của chính Bộ đề.

### 5. Chấm điểm và Kết quả

- Mỗi người chỉ được chấm trên **bộ câu của mình**. Câu tự luận: hàng đợi từng câu chỉ có bài của những người đã rút câu đó; câu chưa rút coi như không có.
- **Điểm tối đa mỗi người** (ví dụ 40 điểm) là điểm tối đa của bộ câu rút, không phải tổng điểm cả Bộ đề (ví dụ 100). Điểm quy đổi thang 10 tính theo số này: 32/40 là 8,0.
- **Excel**, trang *Tổng hợp*: dòng "Điểm tối đa mỗi người", và các cột *Điểm thô*, *Điểm tối đa*, *Điểm sau Mức xử lý*, *Điểm quy đổi (thang 10)*, *Ghi chú*. Trang *Chi tiết* có đủ cột câu của Bộ đề; ô của câu mà người đó **không được rút để trống**.
- **Phúc khảo**: hạn mức mỗi người tính theo số câu **họ nhận** (ví dụ 40 câu thì tối đa 4 lượt, không phải 10).
- **Đính chính đáp án**: chỉ chấm lại những người đã rút câu đó.

### 6. Câu hỏi thường gặp

- **Cùng một người làm nhiều Lượt thì sao?** Mọi Lượt của người đó trong Phiên thi nhận **đúng cùng bộ câu** (chỉ thứ tự xáo trộn đổi theo từng Lượt). Người dự thi được báo điều này trước khi bắt đầu.
- **Hai người trùng nhau bao nhiêu câu?** Đo trên Bộ đề 100 câu, mỗi người rút 40 câu: trung bình hai người trùng khoảng **16 trên 40 câu (40 %)**, nhiều nhất 26 trên 40 trong 300 người; không có hai người cùng một bộ câu, và mỗi câu được chọn với xác suất như nhau.
- **Bật hay tắt xáo trộn có đổi bộ câu không?** Không. Bộ câu rút độc lập với việc xáo trộn thứ tự.
- **Phần chỉ có một câu mà tỷ lệ 30 %?** Vẫn rút 1 câu (tối thiểu 1 khi tỷ lệ lớn hơn 0).

## Dành cho Người dự thi

- Ở danh sách Phiên thi và màn xác nhận trước khi bắt đầu có dòng "**Bài của bạn gồm 40 câu, rút ngẫu nhiên từ 100 câu của Bộ đề.** Mỗi Người dự thi nhận một bộ câu riêng; nếu làm lại, bạn vẫn nhận đúng bộ câu này." (Phiên thi dùng chung Mã đề: bạn còn thấy "Mã đề của bạn: Đề 2", xem [ma-de-phien-thi.md](ma-de-phien-thi.md).)
- Trong lúc làm bài bạn chỉ thấy **40 câu của mình**, đánh số "Câu 1/40" đến "Câu 40/40". Bạn không thấy các câu không thuộc bộ của mình.
- Kết quả hiện **điểm thô trên điểm tối đa** (ví dụ 32/40), **điểm quy đổi thang 10** (8,0) và chỉ các câu của bạn.
