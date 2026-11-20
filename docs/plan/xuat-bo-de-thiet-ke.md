# Xuất Bộ đề theo mẫu văn bản hành chính (thiết kế đề xuất)

Trạng thái: **accepted** (chủ dự án đồng ý Q401–Q416 ngày 18/11/2026, gồm cả đối chiếu đề thi mẫu của Trường ở mục 3; **chưa có mã**). Ngày đề xuất: 18/11/2026. Câu quyết định đánh số tiếp từ **Q401** (Q396–Q400 là chốt tên hệ thống; Q385–Q395 của "Rút câu theo Phần" đang tạm gác).

## 1. Yêu cầu của chủ dự án

Người ra đề xuất **Bộ đề của một Phiên thi** ra tệp để lưu trữ, trình bày theo **mẫu văn bản hành chính dùng trong các kỳ thi ở Việt Nam**:

- Đầu trang có **Quốc hiệu** "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" và **Tiêu ngữ** "Độc lập - Tự do - Hạnh phúc".
- **Tên trường:** Trường Đại học Bạc Liêu. **Đơn vị trực thuộc:** đơn vị của Người ra đề.
- Thông tin chung của kỳ thi: **tên Bộ đề, tên học phần, lớp, thời gian làm bài**.

## 2. Hiện trạng (đã đọc mã và tài liệu, 18/11/2026)

| Việc | Hiện trạng |
|---|---|
| Xuất kết quả Phiên thi ra Excel (`results.xlsx`) | Có; chỉ có điểm, **không có nội dung câu hỏi** |
| Xuất nội dung Bộ đề, in, PDF, Word | **Không có** (kể cả trong backlog) |
| Đơn vị của Người ra đề | **Có sẵn**: bảng `units` (mã, tên), hồ sơ `examiner_profiles.unit_id`; Quản trị viên thêm, sửa Đơn vị và gán cho người dùng; màn "Tài khoản" của Người ra đề đã hiện Đơn vị |
| Học vị, học hàm của Người ra đề | Có sẵn trong `examiner_profiles` |
| Tên Bộ đề, thời lượng, ngày thi, danh sách Lớp | Có: `exams.title`, `sessions.duration_minutes`, `sessions.opens_at`, `session_roster.class_label` |
| **Học phần** | **Chưa có** ở Bộ đề lẫn Phiên thi (từ điển còn ghi Chủ đề "thường tương ứng với một học phần" nhưng cấm gọi Chủ đề là học phần) |
| Nội dung câu hỏi | JSON TipTap giới hạn: đoạn văn có định dạng (đậm, nghiêng, gạch chân, mũ, chỉ số), xuống dòng, **công thức LaTeX** (`math`), **hình minh họa** (`image`, tham chiếu bằng id); bản chụp bất biến trong `exam_items.snapshot` |
| Đáp án hiệu lực (sau Đính chính) | Có, `grading/effective-content.service` |
| Công cụ sẵn trong API | `exceljs`, `pdfkit`, `katex 0.19.1`, `sharp`; **chưa có thư viện tạo Word**; ảnh Node 24-slim **không có phông hệ thống** |

Kết luận quan trọng: **không cần migration** để lấy Đơn vị, học vị, học hàm. Chỉ "Học phần" là dữ liệu mới, và đề xuất không lưu nó (mục 4.2).

## 3. Mẫu bản xuất: "Mẫu Trường" theo đề thi thật (đã đối chiếu, 18/11/2026)

Nguồn: đề thi mẫu `THICUOIKY_K17_IT2221_132.doc` (Word 97-2003, tạo từ công cụ trộn đề; mã đề 132, 50 câu trắc nghiệm một đúng trong bốn, 6 trang A4), bản PDF của đúng đề đó, và tệp đáp án `DAP_AN_DE_HOAN_VI.pdf` cùng thư mục. Mọi số đo dưới đây **đo từ PDF** (PyMuPDF), không ước lượng. Các tệp mẫu chỉ để tham khảo, **không đưa vào kho**.

**Đề mẫu khác điều đã giả định ở bản đầu:** đề giấy của Trường là một **phiếu đề thi** (khung thông tin, lưới trả lời, chữ ký cán bộ coi thi) và **không in Quốc hiệu, Tiêu ngữ**. Phông 12 pt, lề rất hẹp. Bản thiết kế đầu (lề 20–35 mm, 13 pt, Quốc hiệu bắt buộc) thay bằng mẫu này; Quốc hiệu giữ lại như **khối tùy chọn** (Q411).

### 3.1 Bố cục của đề mẫu

```
                                           Trường Đại học Bạc Liêu     ← ĐẦU TRANG mỗi trang: nghiêng, canh phải, kẻ dưới
 ┌──────────────────────────────┬───────────────────────────────┬─────────┐
 │  THI KẾT THÚC HỌC PHẦN       │ Mã SV: ......................│ Điểm số │  ← KHUNG BẢNG, trang 1
 │  Học phần: Nguyên lý XD PM   │ Họ và tên: ..................│         │
 │  Ngày thi: 27/05/2026        │ Lớp: ........  Mã đề: 132     │         │
 │  Hình thức thi: Trắc nghiệm  │                               │         │
 │  Thời gian: 60 phút          │                               │         │
 ├──────────────────────────────┼───────────────────────────────┼─────────┤
 │ Cán bộ coi thi 1 (Chữ ký…)   │ Cán bộ coi thi 2 (Chữ ký…)    │Điểm chữ │
 └──────────────────────────────┴───────────────────────────────┴─────────┘
              PHẦN BÀI LÀM 50 CÂU TRẮC NGHIỆM
 *Chọn phương án đúng nhất (A, B, C, D), rồi điền vào ô trống tương ứng bên dưới…   ← nghiêng 11 pt
 ┌──┬──┬──┬ … 17 cột ┬──┐   lưới số câu, mỗi số một ô, bên dưới một ô trống để thí sinh điền
                 NỘI DUNG CÂU HỎI
 Câu 1: <nội dung>                          ← "Câu N:" đậm, MÀU XANH (#0000FF)
   A. …  B. …  C. …  D. …                   ← "A." đậm xanh; cách xếp theo độ dài (3.3)
 …
                   ----------- HẾT ----------
 Khoa Kỹ thuật và Công nghệ ─────────── Trang 1/6 - Mã đề thi 132     ← CHÂN TRANG: Đơn vị bên trái, trang và mã đề bên phải, kẻ trên
```

### 3.2 Số đo (từ PDF)

| Hạng mục | Giá trị |
|---|---|
| Khổ giấy | A4 dọc |
| Phông | Times New Roman |
| Lề | trái ≈ 9 mm, phải ≈ 8 mm; chữ đầu trang cách mép trên ≈ 5 mm, chữ chân trang cách mép dưới ≈ 10 mm |
| Cỡ chữ | tiêu đề "THI KẾT THÚC HỌC PHẦN" 13 pt đậm; thân, Câu, Phương án 12 pt; đầu trang 12 pt nghiêng; chân trang 11 pt; nhãn "Điểm số", "Điểm chữ" 11 pt đậm; chữ ký cán bộ coi thi 10 pt nghiêng; dòng hướng dẫn lưới 11 pt nghiêng |
| Màu | chỉ "Câu N:" và "A. B. C. D." màu xanh (`#0000FF`) đậm; còn lại đen |
| Khoảng cách dòng | đơn (≈ 13,8 pt với chữ 12 pt) |
| Đầu trang | "Trường Đại học Bạc Liêu", nghiêng, canh phải, có đường kẻ dưới |
| Chân trang | trái: tên Đơn vị ("Khoa Kỹ thuật và Công nghệ"); phải: "Trang X/Y - Mã đề thi N"; có đường kẻ trên |
| Lưới trả lời | 17 cột; hàng số câu rồi hàng trống; hết hàng thì xuống hàng, ô thừa để trống |
| Kết thúc | dòng "----------- HẾT ----------" đậm, canh giữa |

### 3.3 Cách xếp bốn Phương án (suy từ cả 50 câu)

| Cách xếp | Điều kiện (Phương án dài nhất, tính cả "A. ") | Số câu trong mẫu |
|---|---|---|
| **Một hàng, bốn cột** | khoảng 18 ký tự trở xuống | 9 |
| **Hai hàng, hai cột** | khoảng 23–44 ký tự | 7 |
| **Mỗi Phương án một dòng** | từ khoảng 46 ký tự | 34 |

Thực chất là so **độ rộng chữ** với 1/4 hoặc 1/2 bề rộng vùng chữ (≈ 193 mm), không phải đếm ký tự cứng. Bản xuất dùng cùng quy tắc, áp cho Loại chọn một và chọn nhiều, và tính độ rộng bằng bảng đo phông (Tinos hoặc Liberation Serif, tương thích số đo với Times New Roman).

### 3.4 Nguồn của từng thông tin

| Thông tin | Nguồn | Tự động hay nhập |
|---|---|---|
| "Trường Đại học Bạc Liêu" (đầu trang) | hằng số của hệ thống | tự động |
| Tên Đơn vị (chân trang, bên trái) | `units.name` của **Người ra đề** (viết như đã nhập, không ép in hoa) | tự động; thiếu thì nhập tay |
| Tiêu đề kỳ thi ("THI KẾT THÚC HỌC PHẦN") | mặc định như mẫu | nhập, có mặc định, nhớ lần gần nhất |
| **Học phần** | không có trong dữ liệu | **nhập khi xuất** |
| Ngày thi | `sessions.opens_at` (giờ Việt Nam; Khung giờ nhiều ngày thì ghi khoảng ngày) | tự động |
| **Hình thức thi** | suy ra từ các Loại câu hỏi: toàn chọn một thì "Trắc nghiệm"; có tự luận thì "Trắc nghiệm và tự luận"; chỉ tự luận thì "Tự luận" | tự động, sửa được |
| Thời gian | `sessions.duration_minutes` ("60 phút") | tự động |
| Tên Bộ đề | `exams.title` (mẫu không in; thêm một dòng nhỏ dưới tiêu đề, theo yêu cầu của chủ dự án) | tự động |
| Mã SV, Họ và tên, Lớp, Điểm số, Điểm chữ, chữ ký cán bộ coi thi 1 và 2 | để **dòng chấm và ô trống** như mẫu (thí sinh và cán bộ điền trên giấy) | cố định |
| Mã đề | nhập (mặc định "đề chuẩn"); xem 3.6 | nhập |
| Số câu của lưới và nhãn "PHẦN BÀI LÀM n CÂU" | số câu chọn một của Bộ đề | tự động |
| Quốc hiệu, Tiêu ngữ | hằng số | công tắc, mặc định **tắt** (Q411) |

### 3.5 Hai bộ cài sẵn và công tắc từng khối (đề xuất "gọn hơn")

Vì hệ thống thi **trực tuyến**, không có phiếu trả lời giấy, nhiều khối của đề giấy là thừa khi chỉ cần lưu trữ. Đề xuất hai bộ cài sẵn, mỗi khối đều có công tắc để Người ra đề bật tắt:

| Khối | **Mẫu Trường** (như đề giấy) | **Gọn** (lưu trữ) |
|---|---|---|
| Quốc hiệu và Tiêu ngữ | tắt | tắt |
| Đầu trang, chân trang (trường, Đơn vị, Trang X/Y, Mã đề) | bật | bật |
| Khung thông tin: tiêu đề, Học phần, Ngày thi, Hình thức, Thời gian | bật | bật |
| Ô thí sinh (Mã SV, Họ tên, Lớp), Điểm số, Điểm chữ, chữ ký coi thi | bật | **tắt** |
| Lưới phiếu trả lời | bật | **tắt** |
| Hết ("---- HẾT ----") | bật | bật |

"Gọn" còn khoảng một nửa trang đầu, nhưng vẫn đủ thông tin để lưu trữ. Mặc định chọn **Mẫu Trường** vì mục tiêu của chủ dự án là xuất ra Word để chỉnh theo mẫu hiện hành (Q412).

### 3.6 Mã đề và đề hoán vị: điểm nối với hệ thống của mình

Trường đang làm theo quy trình: soạn **đề chuẩn**, dùng công cụ trộn thành nhiều **mã đề** (132, 209, 357, 485), mỗi mã có thứ tự câu và thứ tự Phương án khác nhau, kèm tệp **"Thông Tin Đề Thi Hoán Vị"** với các cột: *Mã câu hỏi, Câu đề chuẩn, Câu đề hoán vị, Thứ tự Phương án hoán vị (ví dụ C-B-A-D), Đáp án chuẩn, Đáp án hoán vị*.

Hệ thống của mình đã **xáo trộn riêng cho từng Lượt làm bài** (`layoutOf` theo `seed`), tức mỗi Lượt chính là một "mã đề" duy nhất, nên với thi trực tuyến **không cần công cụ trộn riêng**. Cho bản xuất:

- **Bước đầu:** xuất **đề chuẩn** (thứ tự gốc của Bộ đề) với "Mã đề" nhập tay, kèm bảng đáp án đơn giản (Câu, Đáp án, Điểm).
- **Về sau** (ghi vào lộ trình, không làm ngay): xuất **đề đúng như một Lượt đã nhận** (thứ tự câu và Phương án thực tế), kèm **bảng hoán vị** theo mẫu của Trường, khớp với "Rút câu theo Phần" (#114). Cần định nghĩa **mã đề** (ví dụ suy từ `seed`) và **mã câu hỏi** dễ đọc cho Câu hỏi; hiện chưa có hai khái niệm này (Q416).

## 4. Thiết kế

### 4.1 Hai tệp: Đề và Đáp án (Q405)

- **Đề thi**: như mục 3, **không có đáp án**. Dùng để in, nộp hồ sơ, lưu trữ.
- **Đáp án và thang điểm**: tệp riêng, cùng đầu trang, ghi Đáp án đúng (đã tính Đính chính, dùng đáp án hiệu lực), điểm từng câu, hướng dẫn chấm của câu tự luận. Chỉ tạo khi Người ra đề **chủ động chọn** và xác nhận một cảnh báo ("tệp này chứa đáp án, hãy bảo quản cẩn thận").

Tách hai tệp để tệp Đề an toàn khi chia sẻ.

### 4.2 Không thêm dữ liệu mới

"Học phần" chỉ là một ô nhập ở hộp thoại xuất, **không** thành cột ở `exams` hay `sessions` (tránh thêm khái niệm vào Phiên thi chỉ để in một dòng). Trình duyệt nhớ lần nhập gần nhất (`localStorage`, tiện ích riêng của từng người, không lưu ở server). Hộp thoại đã điền sẵn mọi thứ có sẵn; Người ra đề chỉ cần nhập Học phần. Nếu về sau cần lưu Học phần để thống kê thì thêm cột riêng (đề xuất khi đó).

### 4.3 Điểm vào

- **Từ Phiên thi** (chính): có đủ thời lượng, ngày thi, Lớp, nên điền sẵn được. Nút "Xuất Bộ đề" ở màn chi tiết Phiên thi.
- **Từ Bộ đề** (phụ): không biết thời lượng, ngày, Lớp; các ô này để trống cho Người ra đề nhập (Q402).

### 4.4 Chỉ xuất Bộ đề đã Phát hành hoặc Lưu trữ (Q406)

Lấy từ **bản chụp bất biến** `exam_items.snapshot`, nên tệp xuất đúng là "đề đã thi", không đổi theo Câu hỏi gốc. Bộ đề nháp chưa có bản chụp: không xuất (đã có Xem thử).

## 5. Định dạng đầu ra và kỹ thuật

### 5.1 Word trước, PDF sau (Q401)

- **Word (.docx)** là định dạng Khoa và Bộ môn thường nộp, chỉnh sửa, in; máy người mở dùng Times New Roman có sẵn, và Word cho "Lưu thành PDF" khi cần lưu trữ.
- **PDF** làm giai đoạn sau nếu cần: `pdfkit` đã có, nhưng phải **nhúng phông** (Times New Roman không phân phối được; dùng Tinos hoặc Liberation Serif, tương thích số đo, đủ chữ Việt, giấy phép mở) vì ảnh không có phông hệ thống.

Chưa có thư viện tạo Word trong kho. Hướng đề xuất: **tự dựng WordprocessingML** (`document.xml`, `styles.xml`, đầu và chân trang, media) bằng JSZip (đã có gián tiếp qua `exceljs`), vì cần kiểm soát bảng đầu trang không viền, gạch dưới, lề, số trang, và chèn công thức. Có thể thay bằng thư viện `docx` nếu bản thử (X0) cho thấy đủ.

### 5.2 Công thức: điểm rủi ro cần thử trước

Nội dung có công thức LaTeX. KaTeX đã có ở server (`katex`, kiểm khi lưu). Hướng đề xuất: **LaTeX → KaTeX (MathML) → OMML** (công thức Word gốc, sắc nét, sửa được) bằng một thư viện chuyển đổi (ví dụ `mathml2omml`). Tôi **chưa thử**, nên đặt **PR X0 là bản thử** trên 20–30 công thức thật từ ngân hàng câu hỏi (phân số, căn, tổng, ma trận, `\text` tiếng Việt), mở bằng Word và LibreOffice. Phương án dự phòng: dựng công thức thành ảnh SVG rồi PNG bằng `sharp` (không sửa được trong Word).

### 5.3 Hiệu năng

Mục tiêu dưới 2 giây cho Bộ đề 100 câu có vài hình. Đọc hình từ volume ảnh (biến thể 960 px), dựng đồng bộ trong yêu cầu. Nếu đo thấy quá 1 giây thì chuyển sang job nền kèm thông báo "đã xong, tải về" (hạ tầng BullMQ có sẵn). Đo bằng bài kiểm thử có đề 100 câu, 10 hình, 30 công thức.

## 6. Kiến trúc (mô-đun sâu)

Module mới `paper` (Bản xuất đề), phụ thuộc ba cổng nhỏ theo cách kho đang làm (không import chéo module):

```
PaperService.build(actor, { sessionId | examId }, options) → { file, filename, contentType }
   ├─ cổng EXAM_CONTENT       (exam: bản chụp Bộ đề, Phần, điểm, hoặc đáp án hiệu lực qua grading)
   ├─ cổng SESSION_INFO       (session: thời lượng, ngày, Lớp trong Danh sách dự thi, chủ Phiên thi)
   └─ cổng EXAMINER_PROFILE   (identity: họ tên, học vị, học hàm, Đơn vị)
        │
        ▼
   buildPaperDocument(spec) → .docx      ← lõi THUẦN: không đọc cơ sở dữ liệu, dễ kiểm thử
```

**Giao diện nhỏ, nhiều việc bên trong** (đúng tinh thần mô-đun sâu): bên ngoài chỉ có một lời gọi; ánh xạ khối nội dung, công thức, hình, đánh số câu, ngắt trang, tiêu đề lặp nằm hết bên trong. Điểm kiểm thử chính là `buildPaperDocument`: đưa vào một `spec` dữ liệu, đọc lại bằng bộ đọc .docx độc lập rồi kiểm đầu trang, thứ tự câu, nội dung, công thức.

## 7. Quyền, an toàn và nhật ký

- Chỉ **chủ Bộ đề hoặc chủ Phiên thi** (Người ra đề) được xuất; Quản trị viên: xem Q410. **Người dự thi không có đường nào** tới điểm cuối này (kiểm bằng bài kiểm thử vai trò). Điều này giữ bất biến "Đáp án đúng không có trong response API gửi cho Người dự thi".
- Tệp Đáp án: cần chọn rõ và xác nhận; ghi nhật ký riêng.
- Ghi `audit_logs` mỗi lần xuất: ai, Bộ đề, Phiên thi, loại tệp (Đề hay Đáp án). Không ghi nội dung.
- **Không lưu tệp ở server**: dựng rồi gửi thẳng cho người xuất. Tên tệp `de-thi-<tên-bộ-đề>.docx`, `dap-an-<tên-bộ-đề>.docx` (bỏ dấu, theo `slug` đang dùng).
- Chống chèn công thức độc hại: nội dung đã qua kiểm LaTeX khi lưu (cấm `\href`, `\includegraphics`...); bản xuất chỉ dùng các đường đó, thoát ký tự XML mọi chuỗi người dùng.

## 8. Liên quan "Rút câu theo Phần" (#114)

Khi có Rút câu, mỗi Người dự thi nhận một bộ câu khác nhau. Bản xuất theo thiết kế này là **Bộ đề gốc** (đủ mọi câu) kèm dòng "Mỗi thí sinh nhận N câu rút ngẫu nhiên theo tỷ lệ của từng Phần". Xuất **bộ câu thực tế của từng người** (đề kèm bài làm) là việc khác, làm sau khi R3 xong. Thiết kế `spec` ở mục 6 chừa chỗ cho danh sách câu riêng của một Lượt.

## 9. Lộ trình (PR nhỏ, TDD, mỗi PR một lát dọc)

| PR | Nội dung | Điểm kiểm thử |
|---|---|---|
| X0 | **Bản thử** công thức LaTeX → OMML và nhúng hình trong .docx, trên dữ liệu thật; chốt hướng 5.1 và 5.2 | Mở bằng Word và LibreOffice, chụp ảnh |
| X1 (**xong**, mã trong `apps/api/src/modules/paper`) | Lõi thuần `buildPaperDocument`: **Mẫu Trường** (đầu trang, chân trang, khung thông tin, lưới trả lời, cách xếp Phương án theo độ rộng 4/2/1, "HẾT"), hai bộ cài sẵn Mẫu Trường và Gọn, **bảng đăng ký Loại câu hỏi** (chọn một trước; mọi Loại khác có bộ trình bày hoặc cảnh báo), khối Quốc hiệu tùy chọn | Đọc lại .docx: đầu và chân trang, khung, lưới 17 cột, cách xếp 4/2/1 theo độ rộng, lề và cỡ chữ khớp mục 3.2; bài cưỡng chế mọi Loại có bộ trình bày |
| X2 (**xong**) | Công thức và hình minh họa | Số công thức, số hình khớp bản chụp; hình đúng biến thể |
| X3 (**xong**) | API (`PaperService`, cổng, quyền, nhật ký), chỉ Đã phát hành hoặc Lưu trữ | Tích hợp: quyền, Người dự thi bị từ chối, nhật ký, tên tệp |
| X4 (**xong**) | Giao diện: hộp thoại "Xuất Bộ đề" ở Phiên thi và Bộ đề, điền sẵn, ô Học phần | E2E desktop và mobile, ảnh chụp, bộ quét `ui-layout` |
| X5 (**xong**) | Tệp Đáp án và thang điểm (đáp án hiệu lực), xác nhận cảnh báo | Có Đính chính thì đáp án là bản đã sửa |
| X6 (**tùy chọn, làm sau**, mục 16) | (Tùy chọn) PDF bằng `pdfkit` và phông nhúng | Số trang, phông, công thức |
| X7 (**tùy chọn, làm sau**, mục 16) | (Sau) Xuất đề **đúng như một Lượt đã nhận** (thứ tự câu và Phương án thực tế) kèm bảng hoán vị theo mẫu của Trường; cần định nghĩa mã đề và mã câu hỏi (Q416) | Khớp `layout` của Lượt; đáp án hoán vị đúng |

Mỗi PR có kiểm đột biến. Bản xuất **không đổi** dữ liệu hay hành vi nào đang chạy.

**Kết quả X1 (19/11/2026):** khoảng đệm cột khi xếp Phương án là 13 mm (đo từ đề mẫu: hợp lệ trong 10,9 đến 15,9 mm; tái hiện đúng 9 câu một hàng, 7 câu hai cột, 34 câu mỗi dòng). Bảng đo chữ `font-metrics.ts` sinh từ Liberation Serif bằng PyMuPDF (tương thích số đo Times New Roman). Công thức và hình trong X1 chỉ là chỗ giữ màu đỏ kèm cảnh báo; làm thật ở X2 (dùng `mathml2omml`, giấy phép LGPL-3.0 đã được chủ dự án chấp nhận 19/11/2026, kèm lớp sửa lỗi của bản thử X0 ở nhánh `prototype/xuat-bo-de-cong-thuc`).

**Quyết định X2 (chủ dự án đồng ý ngày 20/11/2026) và kết quả:**

- **Q417, công thức không chuyển được:** chữ đỏ mã LaTeX tại chỗ kèm một cảnh báo theo câu (không vẽ thành ảnh, vì KaTeX không xuất SVG). Bộ 45 công thức mẫu: 44 chuyển được và hợp lệ, `\overset` rơi về chữ đỏ.
- **Q418, kích thước hình:** hình đứng riêng một đoạn, canh giữa, giữ tỉ lệ, không phóng to hình nhỏ. Trần ban đầu 120 mm rộng và 90 mm cao; chủ dự án xem bản Word ngày 20/11 thấy hình **to**, nên thu nhỏ còn **100 mm rộng và 60 mm cao**.
- **Q419, Phương án có hình hoặc công thức riêng dòng:** cả câu xếp mỗi Phương án một dòng, nội dung dựng ngay dưới nhãn.
- **Q420, giấy phép LGPL-3.0 của `mathml2omml`:** dùng nguyên gói, không sửa mã; ghi ở [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
- **Phát sinh khi làm:** biến thể ảnh của hệ thống là WebP mà Word 2019 không đọc WebP trong `.docx`, nên lõi **đổi WebP thành PNG** (PNG và JPEG giữ nguyên byte). Ngoặc `\left..\right` thành đối tượng `m:d` của Word (thanh đứng `∣` của KaTeX chuẩn hóa thành `|`); công thức riêng dòng đứng một đoạn `m:oMathPara`. Lõi nhận hình qua `PaperSpec.images` (không tự đọc ổ đĩa); việc đọc hình từ kho là của X3.
- **Hiệu năng:** Bộ đề 100 câu, 10 hình WebP 960 px, 30 công thức dựng khoảng 0,3 giây (ngân sách 1 giây).
- **Giới hạn đã biết:** Mệnh đề của chùm đúng/sai và các đoạn thêm trong Mệnh đề chưa dựng hình hoặc công thức riêng dòng (chỉ đoạn đầu của Mệnh đề); sẽ làm khi có nhu cầu.

**Quyết định X3 (chủ dự án đồng ý ngày 20/11/2026) và kết quả:**

- **Điểm vào:** `POST /api/paper/exam` với body `{ sessionId | examId (đúng một), course, title?, examCode?, unit?, preset?, blocks? }`; trả thẳng tệp `.docx` (mã 200, `Content-Disposition` là `de-thi-<tên-bộ-đề>.docx`, `Cache-Control: no-store`). Chỉ Người ra đề (`RequireTag('examiner')`).
- **Q421, cảnh báo:** header `X-Paper-Warnings` là JSON mã hóa URL, tối đa 20 mục kèm "và N cảnh báo khác".
- **Q422, cổng:** thêm `SESSION_INFO` (session cài đặt) và `ILLUSTRATION_FILES` (question-bank cài đặt), nối ở `PaperPortsWiringModule`. Thay vì mở rộng `profiles` của `EXAMINER_DIRECTORY`, thêm phương thức riêng `unitNameOf(userId)` (nhỏ hơn, không đụng các nơi dùng `profiles` và `search`). Ô `unit` trong body ghi đè khi Người ra đề chưa được gán Đơn vị.
- **Q423, quyền:** chỉ chủ Bộ đề hoặc chủ Phiên thi. Người khác và Bộ đề không có là 404; Người dự thi, Quản trị viên là 403; chưa đăng nhập là 401; Bộ đề nháp là 409 `EXAM_NOT_PUBLISHED`. Dùng `EXAM_CATALOG.statusOwnedBy` vì `EXAM_CONTENT.ownerOf` chỉ biết Bộ đề đã Phát hành.
- **Q424, ô nhập:** `course` bắt buộc (tối đa 150 ký tự); `title` mặc định "THI KẾT THÚC HỌC PHẦN"; `examCode` mặc định "đề chuẩn"; xuất từ Bộ đề thì ngày và thời gian để trống.
- **Không lộ đáp án:** `toPaperSpec` chỉ cho phần hiển thị của payload (danh sách cho phép, bắt buộc đủ mọi Loại); bài tích hợp quét mọi phần của gói `.docx` không thấy Đáp án đúng, hướng dẫn chấm, thang điểm, mã Phương án.
- **Hình:** chọn biến thể nhỏ nhất từ 960 px trở lên trong danh sách `variants` của bản chụp (ảnh nhỏ không có biến thể lớn thì lấy biến thể lớn nhất có); chỉ đọc hình nằm trong bản chụp của Bộ đề.
- **Nhật ký:** `audit_logs` ghi `paper.export` (ai, Bộ đề, Phiên thi, loại tệp, số cảnh báo), không ghi nội dung; xuất thất bại không ghi.
- **Hiệu năng:** Bộ đề 100 câu, 30 câu có công thức, toàn bộ yêu cầu HTTP khoảng 0,05 giây (ngân sách 1 giây), nên chưa cần job nền.
- **Hướng dẫn chung của Bộ đề (`exams.instructions`):** ban đầu X3 chưa in; đã bổ sung ngày 20/11/2026 (Q429): in dưới khung thông tin bằng kiểu "Ghi chú", trước lưới và câu hỏi, trống thì không in.
- **Chưa làm:** Lớp điền sẵn (Q415); chưa có nhu cầu rõ, bàn khi cần.

**Quyết định X4 (chủ dự án đồng ý ngày 20/11/2026) và kết quả:**

- **Q425, nút:** "Xuất Bộ đề" hiện rõ ở đầu trang Phiên thi (cạnh "Xem thử") và ở màn Bộ đề chỉ khi đã Phát hành hoặc Lưu trữ (cạnh "Nhân bản"); Bộ đề nháp không có nút.
- **Q426, ô nhập:** hiện sẵn Học phần và Mẫu (Mẫu Trường, Gọn); Mã đề, Tiêu đề kỳ thi, Đơn vị và ba công tắc (Quốc hiệu, Ô thí sinh/điểm/chữ ký, Lưới) nằm trong "Tùy chỉnh" (đóng mặc định). Đổi Mẫu đặt lại ba công tắc theo Mẫu mới. Trình duyệt nhớ Học phần, Tiêu đề kỳ thi, Mẫu, công tắc (không nhớ Mã đề và Đơn vị).
- **Q427, cảnh báo:** có cảnh báo thì tải tệp xong **giữ hộp thoại** và liệt kê theo câu; không có thì thông báo "Đã xuất tệp" và đóng.
- **Q428, câu chữ:** nút "Xuất Bộ đề", hộp thoại "Xuất Bộ đề ra Word", nút "Tải tệp Word", ghi chú "Tệp chỉ có đề, không có đáp án."
- **Dùng chung với máy chủ:** lược đồ yêu cầu (`paperExportRequestSchema`) và các khối của từng Mẫu (`PAPER_PRESET_BLOCKS`) chuyển vào `@exam/shared`; giao diện dựng yêu cầu rồi kiểm lại bằng chính lược đồ của máy chủ (hợp đồng chung).
- **Kiểm thử:** 13 bài unit cho hàm thuần của giao diện (`lib/paper-export.ts`), 7 kịch bản E2E chạy trên cả máy tính và điện thoại (tải tệp, cảnh báo, nút ở màn Bộ đề, Mẫu và công tắc, bàn phím và trợ năng, bố cục sáng/tối), đột biến 13 lần đều bị bắt.
- **Phát sinh khi làm:** native `<dialog>` đưa focus vào nút Đóng ngay khi mở, nên ô Học phần chỉ nhận focus sau một nhịp (bài E2E bàn phím bắt được lỗi này); mục "Tùy chỉnh" cần mũi tên xoay để người dùng nhận ra là bung được (phát hiện khi chụp ảnh tự duyệt).

**Quyết định X5 (chủ dự án đồng ý ngày 20/11/2026) và kết quả:**

- **Q430, nội dung tệp Đáp án:** tiêu đề "ĐÁP ÁN VÀ THANG ĐIỂM", khung thông tin gọn (cùng Mã đề, đầu và chân trang như tệp Đề), mỗi Phần một bảng Câu, Đáp án, Điểm, Cách chấm; tổng điểm kèm ghi chú thang 10; hướng dẫn chấm của câu tự luận nguyên văn ở cuối. Không in nội dung câu hỏi (số câu khớp tệp Đề).
- **Q431, đáp án hiệu lực:** lấy qua cổng mới `EFFECTIVE_CONTENT` (`grading` cài đặt, nối ở `AttemptPortsWiringModule`) nên đã tính Đính chính, đúng như lúc chấm; câu đã đính chính ghi "(đã đính chính)".
- **Q432, xác nhận và nhật ký:** `POST /api/paper/answers` bắt buộc `confirm: true` (lược đồ `paperAnswersRequestSchema` trong `@exam/shared`, strict, không nhận Mẫu và công tắc); nhật ký riêng `paper.export.answers`; giao diện có bước xác nhận "Tệp này chứa đáp án đúng", focus vào "Hủy" (hành động an toàn).
- **Q433, quyền:** như tệp Đề (chỉ chủ Bộ đề hoặc chủ Phiên thi; người khác 404, Người dự thi và Quản trị viên 403, nháp 409); người được Ủy quyền chấm không xuất.
- **Q434, cách ghi:** chọn một "B"; chọn nhiều "A, C"; chùm "a) Đúng; b) Sai"; tự luận "Xem hướng dẫn chấm"; cách chấm của câu nhiều ý: tỉ lệ số ý đúng, đúng hết mới có điểm, hoặc thang bậc ("đúng 1 ý được 25%, …"); điểm viết dấu phẩy ("0,5").
- **Cấu trúc mã:** phần đóng gói `.docx` (đầu trang, chân trang, kiểu, quan hệ, hình) tách ra `docx-package.ts` dùng chung cho hai tệp; khung thông tin chung rút ra `paperFrameOf` để hai tệp luôn khớp nhau.
- **Kiểm thử:** 8 bài unit `toAnswerSpec`, 3 bài `buildAnswerDocument`, 7 bài tích hợp (nội dung, Đính chính, xác nhận, quyền, nhật ký), 1 bài unit và 2 kịch bản E2E giao diện (cả máy tính và điện thoại); kiểm đột biến 10 lần ở máy chủ và 5 lần ở giao diện, đều bị bắt.

## 10. Thuật ngữ cần thống nhất (domain-modeling)

- **"Đề thi" nằm trong danh sách tránh của Bộ đề** (`_Avoid_: đề thi, bài kiểm tra, test`). Nhưng tiêu đề trên văn bản hành chính phải là "ĐỀ THI". Đề xuất: thuật ngữ trong hệ thống và giao diện chức năng là **"Xuất Bộ đề"**; chữ "ĐỀ THI" chỉ là **nội dung in trên tệp** (Q407).
- **Học phần**: chỉ là nhãn của ô nhập ở hộp thoại, chưa thành khái niệm của hệ thống (không thêm vào GLOSSARY). Nếu về sau lưu Học phần thì mới định nghĩa chính thức.
- **Đơn vị**: đã có định nghĩa ("Nơi công tác của Người ra đề, ví dụ một khoa hoặc phòng ban", tránh gọi là khoa, department); bản xuất in đúng tên Đơn vị đã nhập.

## 11. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Mẫu của Trường khác thể thức chung | **Đã giải quyết**: đã đối chiếu đề thi thật (mục 3); còn các Loại câu hỏi ngoài chọn một chưa có mẫu, sẽ dùng cùng khuôn rồi chỉnh theo đề mẫu của Loại đó khi có |
| Công thức không chuyển đẹp sang Word | Bản thử X0; dự phòng ảnh PNG |
| Word và LibreOffice hiển thị hơi khác | Kiểm cả hai ở X0, dùng cấu trúc Word chuẩn |
| Phông Times New Roman | Word dùng phông của máy người mở; PDF dùng Tinos hoặc Liberation Serif nhúng |
| Người ra đề chưa được gán Đơn vị | Hộp thoại cho nhập tay; Quản trị viên gán Đơn vị tại "Người dùng" |
| Tệp Đáp án bị lộ | Tệp riêng, phải xác nhận, ghi nhật ký, chỉ chủ Bộ đề |

## 12. Câu cần chủ dự án quyết (vòng 1)

Mỗi câu có đề xuất; trả lời "đồng ý" là chấp nhận đề xuất.

1. **Q401, định dạng:** làm **Word (.docx)** trước, PDF để giai đoạn sau nếu cần (Word có "Lưu thành PDF")? *(đề xuất: đồng ý)*
2. **Q402, điểm vào:** nút "Xuất Bộ đề" ở **Phiên thi** (điền sẵn thời lượng, ngày, Lớp) là chính; từ **Bộ đề** cũng xuất được nhưng tự nhập thời lượng, ngày, Lớp? *(đề xuất: đồng ý)*
3. **Q403, Đơn vị:** dùng **Đơn vị đã gán cho Người ra đề** (không thêm dữ liệu), thiếu thì nhập tay khi xuất? *(đề xuất: đồng ý)*
4. **Q404, Học phần:** là **ô nhập khi xuất** (trình duyệt nhớ lần gần nhất), **không** thêm cột vào Phiên thi hay Bộ đề? *(đề xuất: đồng ý; nếu anh muốn Học phần lưu cùng Phiên thi để thống kê thì nói, tôi thêm vào thiết kế)*
5. **Q405, Đáp án:** tách **hai tệp**: Đề (không đáp án) và Đáp án kèm thang điểm (chọn riêng, có cảnh báo, ghi nhật ký)? *(đề xuất: đồng ý)*
6. **Q406, trạng thái:** chỉ xuất Bộ đề **Đã phát hành hoặc Lưu trữ** (từ bản chụp bất biến)? *(đề xuất: đồng ý)*
7. **Q407, thuật ngữ:** dùng **"Xuất Bộ đề"** trong hệ thống; chữ **"ĐỀ THI"** chỉ là nội dung in trên tệp (ngoại lệ với danh sách tránh của GLOSSARY)? *(đề xuất: đồng ý)*
8. **Q408, nội dung đầu trang và cuối tệp:** có **bật tắt** được các mục: Ghi chú in, dòng "Bạc Liêu, ngày… tháng… năm…", khối chữ ký Người ra đề và Trưởng bộ môn duyệt, dòng kẻ trả lời cho câu tự luận? *(đề xuất: đồng ý, mặc định: có chữ ký, không dòng kẻ)*
9. **Q409, mẫu của Trường:** ✔ **đã nhận đề mẫu** (mục 3 viết lại theo đề thật).
10. **Q410, quyền:** chỉ **chủ Bộ đề, chủ Phiên thi** được xuất; Quản trị viên không xuất nội dung đề (giữ đúng nguyên tắc đề và đáp án thuộc Người ra đề)? *(đề xuất: đồng ý)*

## 13. Ngoài phạm vi

Không đổi Bộ đề đã Phát hành, không thêm cột dữ liệu, không in bài làm của từng Người dự thi, không xuất Ngân hàng câu hỏi, không nhập từ Word (backlog), không thay đổi cách chấm. Xuất bộ câu thực tế từng người (khi có Rút câu) là việc làm sau.

## 14. Quyết định và điều chỉnh sau khi duyệt (18/11/2026)

**Đã chốt (theo đề xuất):** Q401 (Word trước, PDF sau), Q402 (xuất từ Phiên thi là chính, từ Bộ đề là phụ), Q403 (Đơn vị đã gán cho Người ra đề, thiếu thì nhập tay), Q404 (Học phần là ô nhập khi xuất, không lưu), Q405 (hai tệp Đề và Đáp án), Q406 (chỉ Đã phát hành hoặc Lưu trữ), Q407 (thuật ngữ "Xuất Bộ đề", "ĐỀ THI" chỉ là chữ in trên tệp), Q408 (bật tắt ghi chú, dòng ngày tháng, chữ ký, dòng kẻ), Q410 (chỉ chủ Bộ đề và chủ Phiên thi xuất).

**Q409 đã đóng (đã nhận và đối chiếu đề mẫu, mục 3).** Kết quả đối chiếu thay đổi thiết kế: mẫu dùng **phiếu đề thi** (khung thông tin, lưới trả lời, chữ ký cán bộ coi thi), phông 12 pt, lề hẹp, đầu trang tên trường, chân trang Đơn vị và "Trang X/Y - Mã đề", **không có Quốc hiệu**. Chủ dự án cho phép đề xuất bố cục gọn hơn (mục 3.5).

**Câu quyết mới sau khi đối chiếu (Q411–Q416): chủ dự án ĐỒNG Ý CẢ SÁU theo đề xuất (18/11/2026).**

11. **Q411, Quốc hiệu:** mặc định theo **Mẫu Trường (không Quốc hiệu)**, còn khối "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập - Tự do - Hạnh phúc" là **công tắc tùy chọn**, tắt mặc định, bật khi cần đề thi dạng văn bản hành chính? *(đề xuất: đồng ý; vì đề thật của Trường không in Quốc hiệu nhưng anh đã nêu yêu cầu này)*
12. **Q412, bộ cài sẵn:** hai bộ **Mẫu Trường** (như đề giấy, mặc định) và **Gọn** (lưu trữ, bỏ ô thí sinh, chữ ký, lưới trả lời), mỗi khối có công tắc? *(đề xuất: đồng ý)*
13. **Q413, cách xếp Phương án:** tự chọn một hàng, hai cột hay mỗi dòng theo **độ rộng chữ** như đề mẫu (mục 3.3), áp cho chọn một và chọn nhiều? *(đề xuất: đồng ý)*
14. **Q414, đầu và chân trang:** theo mẫu: đầu trang "Trường Đại học Bạc Liêu" canh phải; chân trang **Đơn vị** bên trái, "Trang X/Y - Mã đề thi N" bên phải; **Mã đề** nhập khi xuất (mặc định "đề chuẩn")? *(đề xuất: đồng ý)*
15. **Q415, thông tin thí sinh:** các dòng **Mã SV, Họ và tên, Lớp** để chấm trống như mẫu (thí sinh viết), có công tắc "điền sẵn Lớp của Phiên thi" cho ai cần? *(đề xuất: đồng ý, mặc định để trống)*
16. **Q416, đáp án và hoán vị:** bước đầu tệp Đáp án chỉ có bảng **Câu, Đáp án, Điểm** của đề chuẩn; xuất **đề đúng như từng Lượt đã nhận** kèm bảng hoán vị theo mẫu của Trường để **làm sau**, gắn với "Rút câu theo Phần" và cần định nghĩa mã đề, mã câu hỏi? *(đề xuất: đồng ý)*

**Hai nguyên tắc mới của chủ dự án, đưa vào thiết kế:**

1. **Nhiều Loại câu hỏi về sau.** Bộ trình bày theo Loại là một **bảng đăng ký** (mỗi Loại một mục: `chọn một`, `chọn nhiều`, `chùm đúng/sai`, `tự luận`, và các Loại sẽ thêm), như cách thư hiện đã dùng một bảng trình bày thay cho hai câu lệnh rẽ nhánh. Thêm Loại mới chỉ thêm một mục. Có **bài kiểm thử cưỡng chế**: mọi Loại trong danh sách Loại câu hỏi phải có bộ trình bày; Loại chưa hỗ trợ thì bản xuất ghi một dòng cảnh báo rõ trong tệp ("câu N: Loại <tên> chưa hỗ trợ xuất") thay vì bỏ im lặng hay hỏng cả tệp. Mẫu trắc nghiệm một đúng trong bốn là trường hợp cơ bản được tối ưu trước, các Loại khác theo sau cùng một khuôn.
2. **Word để Người ra đề tinh chỉnh theo mẫu hiện hành của Nhà trường.** Do đó tệp .docx phải **dễ sửa**, không chỉ đẹp:
   - dùng **kiểu (style) có tên của Word** thay cho định dạng tay: "Tiêu đề đề thi", "Tiêu đề Phần", "Câu hỏi", "Phương án", "Ghi chú", "Chữ ký". Người dùng đổi phông hay cỡ chữ ở **một kiểu** là cả tệp đổi theo;
   - khối đầu trang là **bảng thật** hai cột không viền, không dùng hộp văn bản (hộp văn bản khó sửa);
   - công thức là công thức Word, hình là hình nội tuyến, số trang là trường tự cập nhật (Trang X/Y);
   - số "Câu N." là chữ thường (khớp tệp Đáp án và hệ thống); đánh số tự động của Word là phương án khác, chỉ làm nếu chủ dự án thấy cần khi sắp xếp lại câu;
   - mặc định theo thể thức chung ở mục 3, và chỉnh lại sau khi xem đề mẫu của Trường.

## 15. Trạng thái và bước tiếp theo (cập nhật 20/11/2026)

**X0 đến X5 đã xong, đã deploy và gắn tag `v0.2.0` (20/11/2026, commit `8c48220`).** Người ra đề xuất được tệp Đề thi và tệp Đáp án và thang điểm (Word, `.docx`) từ Phiên thi hoặc Bộ đề, kèm công thức Word gốc, hình, bước xác nhận khi xuất đáp án và nhật ký. Phần còn lại của nhóm "Xuất Bộ đề" là các chức năng tùy chọn ở mục 16, **chưa cần** nên không có lịch làm. Khi chủ dự án thử trên đề thật và gặp nhu cầu thì chọn mục ở mục 16 để làm (mỗi mục một PR nhỏ, TDD, chốt điểm kiểm thử với chủ dự án trước).

## 16. Chức năng tùy chọn (làm sau, chưa cần)

Ghi nhận ngày 20/11/2026 theo yêu cầu của chủ dự án: các mục dưới đây thuộc nhóm "Xuất Bộ đề" nhưng chưa cần thiết, nên **không làm bây giờ**. Mỗi mục ghi vì sao chưa cần, khi nào nên làm và điều cần nhớ để khỏi phải tìm lại.

| # | Chức năng | Vì sao chưa cần | Khi nào nên làm | Ghi chú thiết kế (nguồn) |
|---|---|---|---|---|
| T1 | **Xuất PDF** (X6) | Word đã đủ để chỉnh theo mẫu của Trường, và Word có "Lưu thành PDF" | Khoa cần PDF tự động, không qua Word, hoặc cần cố định bố cục tuyệt đối | `pdfkit` đã có trong kho nhưng phải **nhúng phông** (Tinos hoặc Liberation Serif, tương thích Times New Roman; mục 5.1). Bảng đo chữ `font-metrics.ts` đã có sẵn. **Rủi ro chính là công thức:** PDF không có công thức Word (OMML) nên phải vẽ công thức (MathML sang đường nét), việc lớn nhất của mục này |
| T2 | **Xuất đề đúng như một Lượt đã nhận** kèm bảng hoán vị (X7, Q416) | Đề chuẩn đã đủ để lưu trữ; thi trực tuyến mỗi Lượt đã tự xáo trộn nên không cần công cụ trộn riêng (mục 3.6) | Sau khi có "Rút câu theo Phần" (mỗi người một bộ câu khác nhau) và Trường cần lưu đúng đề từng người | Cần định nghĩa **mã đề** (ví dụ suy từ `seed` của Lượt) và **mã câu hỏi** dễ đọc, hiện chưa có hai khái niệm này. Bảng hoán vị theo mẫu của Trường: Mã câu hỏi, Câu đề chuẩn, Câu đề hoán vị, Thứ tự Phương án (ví dụ C-B-A-D), Đáp án chuẩn, Đáp án hoán vị (mục 3.6, mục 8) |
| T3 | **Điền sẵn Lớp** vào ô thí sinh (Q415) | Mặc định để trống như đề giấy, thí sinh tự viết | Có Người ra đề muốn in sẵn Lớp lên đề | Công tắc "điền sẵn Lớp của Phiên thi"; Lớp lấy từ Danh sách dự thi (`session_roster.class_label`). Cần thêm một ô vào hộp thoại và một trường vào yêu cầu (nhớ cập nhật lược đồ dùng chung `@exam/shared`) |
| T4 | **Hình và công thức riêng dòng trong Mệnh đề** của câu chùm đúng/sai | Mệnh đề thường chỉ là một câu chữ ngắn; hiện chỉ dựng đoạn đầu của Mệnh đề (giới hạn đã ghi ở kết quả X2) | Đề thật có Mệnh đề chứa hình hoặc công thức riêng dòng | Dùng lại cách Phương án đã làm (Q419): khối riêng dòng xuống dòng dưới nhãn `a)`. Làm ở `question-renderers.ts` (bộ trình bày chùm đúng/sai) |
| T5 | **Công thức chưa chuyển được sang Word** (ví dụ `\overset`) | Hiện rơi về chữ đỏ mã LaTeX kèm cảnh báo (Q417); bộ mẫu 45 công thức chuyển được 44 | Đề thật hay dùng cấu trúc đó | `\overset{a}{b}` có tương đương trong Word là `m:limUpp`; sửa ở lớp `math/` (xem `omml-repair.ts`). Phương án vẽ công thức thành ảnh cần thêm thư viện (MathJax) vì KaTeX không xuất SVG, nên chỉ làm khi thật cần |
| T6 | **Đánh số tự động của Word** cho "Câu N" | Số "Câu N" hiện là chữ thường để khớp tệp Đáp án và hệ thống | Người ra đề thường xuyên sắp xếp lại câu trong Word và muốn số tự đổi | Phải đổi cả tệp Đáp án hoặc ghi rõ hai tệp lệch số sau khi sửa tay (mục 14, nguyên tắc 2) |
| T7 | **Người được Ủy quyền chấm xuất tệp Đáp án** | Chỉ chủ Bộ đề và chủ Phiên thi xuất (Q410, Q433); người được Ủy quyền chấm đã xem đáp án ở màn Chấm khi cần | Có yêu cầu thật từ người được Ủy quyền | Mở quyền ở `PaperService.resolve`; thêm bài kiểm thử quyền và nhật ký ghi rõ người xuất không phải chủ |
| T8 | **Lưu Học phần thành dữ liệu** (cột riêng) | Học phần chỉ là ô nhập khi xuất, trình duyệt nhớ lần gần nhất (mục 4.2) | Cần thống kê hay lọc theo Học phần | Thêm cột riêng ở `exams` hoặc `sessions` (có migration, cần duyệt thiết kế) |
| T9 | **Dựng ở nền kèm thông báo "đã xong, tải về"** | Bộ đề 100 câu có công thức và hình xuất trong khoảng 0,05 giây qua HTTP (ngân sách 1 giây, mục 5.3) | Đo thấy chậm trên Bộ đề rất lớn hoặc rất nhiều hình | Hạ tầng BullMQ có sẵn (như xuất Excel); thêm trạng thái chờ ở hộp thoại |

**Cách chọn làm:** khi có nhu cầu thật (thường từ phản hồi khi dùng tệp trên đề của Trường), nêu rõ mục T nào, tôi đề xuất điểm kiểm thử và câu hỏi quyết, chủ dự án duyệt rồi mới làm, theo cùng quy trình các PR X1 đến X5.
