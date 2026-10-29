# Lát cắt 2: Ngân hàng câu hỏi

> Trạng thái: **accepted** (29/10/2026): chủ dự án đã duyệt Q111–Q126 (Q112 giữ Chủ đề phẳng) và các seam test. Làm theo [data-model.md](../data-model.md) mục 2, [architecture.md](../architecture.md) mục 3 và 6, [GLOSSARY.md](../../GLOSSARY.md) mục Ngân hàng câu hỏi, [ADR-0005](../adr/0005-chup-noi-dung-khi-phat-hanh.md) và [ui-design.md](../ui-design.md) (khung ứng dụng, mẫu "Soạn", Q100–Q110). Quyết định đánh số tiếp từ Q111 ([lát cắt 1](slice-1.md) dừng ở Q99; Q100–Q110 là của giao diện).

## Mục tiêu

Sau lát cắt 2:
- Người ra đề tạo Chủ đề và soạn Câu hỏi thuộc sở hữu riêng, đủ 4 Loại câu hỏi, kèm công thức toán và Hình minh họa.
- Nhập hàng loạt Câu chọn một và Câu chọn nhiều từ Excel, có xem trước từng dòng.
- Quản trị viên Chuyển giao Chủ đề khi Người ra đề nghỉ việc; Xóa người dùng là Người ra đề buộc chọn người nhận.
- Nội dung Câu hỏi chỉ chủ sở hữu thấy, kể cả Đáp án đúng.

Lát cắt chia thành 4 PR. Merge xong PR nào thì hệ thống chạy được tới đó.

```text
2a Chủ đề + Câu hỏi (4 loại, văn bản có định dạng)  ──► 2b Công thức toán
                                                    ├──► 2c Hình minh họa
                                                    └──► 2d Nhập Excel + Chuyển giao + Xóa người dùng chọn người nhận
```

| PR | Nội dung | Đưa vào dùng được |
|---|---|---|
| 2a | Bảng `topics`, `questions`; schema nội dung và `payload` dùng chung; CRUD, tìm và lọc; trình soạn và Xem thử; Nhân bản, di chuyển, xóa | Người ra đề soạn và quản lý Câu hỏi bằng chữ |
| 2b | Node công thức (MathLive soạn, KaTeX hiển thị, kiểm LaTeX ở server) | Câu hỏi có công thức |
| 2c | `illustrations`, tải ảnh, worker xử lý (sharp), phục vụ có kiểm quyền | Câu hỏi có hình |
| 2d | Nhập Excel; Chuyển giao Chủ đề; Xóa người dùng chọn người nhận | Vòng đời nội dung khi đổi người |

## Thiết kế chung

### Module và quyền

```text
apps/api/src/modules/question-bank/   topics, questions, illustrations, imports, transfer
packages/shared/                      schema Zod: nội dung (TipTap JSON), payload từng Loại câu hỏi
```

- **Chỉ chủ sở hữu.** Người ra đề chỉ thấy và sửa Chủ đề, Câu hỏi, Hình minh họa của mình; truy cập của người khác trả `NOT_FOUND`. Kiểm tra ở tầng service theo `owner_id`, không chỉ ở guard (architecture.md mục 6).
- **Quản trị viên không đọc nội dung Câu hỏi** (Q113): chỉ thấy tên Chủ đề và số câu của một Người ra đề để Chuyển giao. Giữ đúng tinh thần "Đáp án đúng chỉ ở nơi cần thiết".
- `module identity` gọi `question-bank` qua service công khai (kiểm tra người còn nội dung khi Xóa người dùng), không đọc bảng của nhau.

### Nội dung có định dạng (Q114)

`stem`, từng Phương án, từng Mệnh đề và `rubric` là JSON của TipTap theo một **schema giới hạn**, kiểm bằng Zod ở `packages/shared` cho cả web và api:

| Được phép | Không cho phép |
|---|---|
| Đoạn văn, xuống dòng, đậm, nghiêng, gạch chân, chỉ số trên, chỉ số dưới, danh sách đánh dấu và đánh số | HTML thô, liên kết, bảng, mã nhúng, video |
| Node `math` (PR 2b), node `image` tham chiếu Hình minh họa (PR 2c) | Bất kỳ node hay thuộc tính nào ngoài danh sách |

Phía client **dựng giao diện từ JSON**, không dùng `dangerouslySetInnerHTML`, nên không có đường cho XSS. Giới hạn: Phần dẫn ≤ 20.000 ký tự văn bản, mỗi Phương án hoặc Mệnh đề ≤ 2.000.

### Ràng buộc theo Loại câu hỏi (Q115)

| Loại | Quy tắc |
|---|---|
| Câu chọn một | 2–8 Phương án, đúng một Phương án đúng |
| Câu chọn nhiều | 2–8 Phương án, ít nhất một đúng; `scoringRule` Tỷ lệ hoặc Đúng hết |
| Chùm đúng/sai | 1–8 Mệnh đề, mỗi Mệnh đề có đúng/sai; `scoringRule` Tỷ lệ, Đúng hết hoặc Bậc thang; Bậc thang dài (số Mệnh đề + 1), giá trị từ 0 đến 1, không giảm dần, phần tử đầu 0 và phần tử cuối 1 |
| Câu tự luận | `maxLength` 100–5.000 (mặc định 2.000); `rubric` tùy chọn, không hiển thị cho Người dự thi |

- Điểm mặc định `default_points` từ 0,25 đến 100, bước 0,25.
- Mỗi Phương án và Mệnh đề có `id` ổn định (`o1`, `s1`...), thứ tự lưu là thứ tự soạn; việc xáo trộn chỉ xảy ra lúc thi.
- `tags` tự do: tối đa 10, mỗi tag 1–30 ký tự, chuẩn hóa chữ thường và bỏ khoảng trắng thừa.

### Chủ đề (Q112)

Chủ đề là **danh sách phẳng**, không có cây (GLOSSARY): tên 1–100 ký tự, mô tả ≤ 500, tên không trùng (không phân biệt hoa thường và dấu) trong các Chủ đề chưa lưu trữ của cùng chủ. Chủ đề còn Câu hỏi thì không xóa được; có **Lưu trữ Chủ đề** (`archived_at`) để ẩn khỏi lựa chọn. Mỗi Câu hỏi thuộc đúng một Chủ đề; việc phân nhóm nhỏ hơn dùng `tags`.

### Phiên bản, xóa và Lưu trữ (Q116, Q117)

- `questions.version` tăng mỗi lần lưu thay đổi; **không lưu lịch sử bản cũ**, vì Bộ đề chụp nội dung lúc Phát hành (ADR-0005) nên sửa Câu hỏi sau đó không ảnh hưởng bài đã thi. Bộ đề nháp (lát cắt 3) tham chiếu bản hiện tại.
- Theo GLOSSARY: Câu hỏi **chưa từng dùng** trong Bộ đề đã Phát hành thì xóa hẳn (có xác nhận); đã dùng thì chỉ **Lưu trữ**. Lát cắt 2 chưa có Bộ đề nên chỉ có xóa hẳn; Lưu trữ thêm ở lát cắt 3 qua một cổng `QuestionUsage` (mặc định "chưa dùng").

### Tìm và lọc (Q118)

Cột `search_text` (văn bản thuần của Phần dẫn và các Phương án/Mệnh đề, cập nhật khi lưu), tìm không dấu và không phân biệt hoa thường bằng `unaccent` như danh sách Người dùng. Lọc theo Chủ đề, Loại, tag; sắp xếp mới sửa trước; phân trang 20 dòng, trang nằm trên URL.

### Soạn và Xem thử (Q119, Q120)

- **Lưu rõ ràng bằng nút Lưu**, không tự lưu lên server (tự lưu sẽ tăng `version` liên tục). Có cảnh báo khi rời trang đang có thay đổi chưa lưu. Bản đang soạn được nhớ trên thiết bị (`localStorage`, theo từng Câu hỏi) để không mất khi hết pin hay đóng tab; lần mở lại hỏi "Khôi phục bản nháp?".
- **Xem thử:** thành phần `QuestionView` hiển thị Câu hỏi đúng như Người dự thi sẽ thấy, dùng chung với khu làm bài (lát cắt 4) và Xem thử Bộ đề (lát cắt 3). Ở trang soạn có công tắc "Hiện Đáp án đúng" chỉ cho chủ sở hữu.
- **Thao tác:** Nhân bản, di chuyển sang Chủ đề khác, xóa; chọn nhiều dòng để di chuyển hoặc xóa hàng loạt (thanh hành động dính đáy, theo ui-design mục 10).

### Giao diện (Q126)

Thêm mục **Ngân hàng câu hỏi** vào thanh bên của Người ra đề. Mẫu **Danh sách** cho Câu hỏi: trên laptop hai cột (Chủ đề bên trái, danh sách Câu hỏi bên phải); trên điện thoại Chủ đề là bộ lọc dạng chip. Mẫu **Soạn** cho trình soạn (hai cột soạn / xem trước; điện thoại hai tab), route khai báo `staticData: { wide: true }`. PR 2a xây các thành phần còn hoãn từ PR giao diện: đường dẫn (Chủ đề → Câu hỏi), `Tabs`, ngăn bên.

## PR 2b: Công thức toán (Q121)

- Công thức lưu **LaTeX** trong node `math` (dạng dòng hoặc khối). **MathLive** để soạn (tải lười, chỉ ở trang soạn); **KaTeX** để hiển thị, font tự host và tải lười để giữ ngân sách JS của trang làm bài (architecture.md mục 7).
- Server kiểm LaTeX hợp lệ khi lưu bằng KaTeX ở chế độ `throwOnError`, từ chối công thức lỗi; không cho các lệnh nguy hiểm (`\href`, `\url`, `\includegraphics`, `\input`), giới hạn mỗi công thức ≤ 2.000 ký tự và mỗi Câu hỏi ≤ 50 công thức.
- Người dùng không cần biết LaTeX: bàn phím toán ảo của MathLive; người quen LaTeX gõ trực tiếp được.

## PR 2c: Hình minh họa (Q122)

```text
Người ra đề tải ảnh (JPEG/PNG/WebP ≤ 5 MB) ─► API kiểm nội dung thật, lưu bản tạm (MediaStore)
   ─► job "illustration.process" (worker, sharp): xoay đúng chiều, bỏ EXIF, giữ bản gốc đã làm sạch,
      tạo WebP 480 / 960 / 1600 px ─► illustrations.status = ready
Gắn vào Phần dẫn / Phương án / Mệnh đề bằng node `image` ─► phục vụ qua /media (kiểm quyền)
```

- Không nhận SVG và GIF động (rủi ro XSS và hiệu năng); kiểm magic bytes, không tin đuôi file hay MIME của client; ảnh quá 8.000 px mỗi cạnh bị từ chối (chống nén bom).
- **Văn bản thay thế (`alt`) bắt buộc**, ≤ 250 ký tự, để trình đọc màn hình và người mất mạng vẫn hiểu hình.
- Một ảnh dùng lại được trong nhiều Câu hỏi của cùng chủ; chỉ xóa được khi không còn Câu hỏi nào dùng. Hạn mức mặc định 500 MB mỗi Người ra đề (cấu hình bằng biến môi trường).
- **Phục vụ:** `GET /api/media/:id/:variant` kiểm quyền rồi trả file; production dùng nginx `X-Accel-Redirect` để api không phải đọc file, môi trường dev api tự trả. Lát cắt 2 chỉ chủ sở hữu xem được; token ký 2 giờ cho Người dự thi thêm ở lát cắt 4.
- Ảnh được tải lười, chạm để phóng to (architecture.md mục 7).

## PR 2d: Nhập Excel, Chuyển giao, Xóa người dùng

### Nhập Excel (Q123)

Chỉ **Câu chọn một và Câu chọn nhiều** (README, architecture.md). Luồng giống Yêu cầu cấp tài khoản ở lát cắt 1:

```text
Chọn Chủ đề đích ─► tải file mẫu, điền, tải lên (.xlsx/.csv, ≤ 2 MB, ≤ 500 dòng)
  ─► job "question-import.parse" ─► bảng xem trước từng dòng: hợp lệ / lỗi / nghi trùng
  ─► Người ra đề xác nhận ─► job "question-import.commit" tạo Câu hỏi vào Chủ đề đích
```

- **Cột của mẫu:** Nội dung, Phương án A đến F (tối đa 6), Đáp án (`A` hoặc `A,C`), Điểm, Quy tắc chấm (Tỷ lệ hoặc Đúng hết, chỉ cho câu chọn nhiều), Tags. Một dòng có từ hai Đáp án trở lên là Câu chọn nhiều.
- **Công thức** viết LaTeX trong `$...$`, chuyển thành node `math`. Ảnh không nhập qua Excel; thêm ảnh khi sửa Câu hỏi.
- **Lỗi từng dòng:** thiếu nội dung, ít hơn 2 Phương án, Đáp án không khớp Phương án có thật, điểm sai, LaTeX lỗi. **Nghi trùng:** nội dung giống một Câu hỏi đã có trong Chủ đề đích (so sánh `search_text` đã chuẩn hóa); chỉ cảnh báo, người dùng quyết định.
- Lô nhập được giữ 30 ngày để xem lại (bảng `question_import_batches`, `question_import_items`), job dọn hằng ngày xóa lô cũ; tạo Câu hỏi và nhật ký trong một giao dịch cho cả lô.

### Chuyển giao Chủ đề (Q124)

Quản trị viên chọn một người ra đề, chọn một hoặc nhiều Chủ đề của họ, chọn người nhận rồi xác nhận. Trong **một giao dịch**: đổi `topics.owner_id`, `questions.owner_id` và `illustrations.owner_id` của mọi thứ thuộc các Chủ đề đó, ghi `audit_logs` (`topic.transfer`, nêu số Chủ đề, số Câu hỏi, người cũ và người mới). Người nhận phải mang Nhãn Người ra đề và chưa bị Khóa hay Xóa. Nếu người nhận đã có Chủ đề trùng tên thì tên Chủ đề chuyển sang được thêm hậu tố " (từ <tên người cũ>)". Bộ đề nháp và Phiên thi được thêm vào giao dịch này ở lát cắt 3 và 4.

### Xóa người dùng là Người ra đề (Q125)

Nếu người đó còn Chủ đề, API từ chối với `HAS_CONTENT` kèm danh sách Chủ đề. Hộp thoại Xóa người dùng cho **chọn người nhận ngay trong một bước**: hệ thống Chuyển giao toàn bộ rồi mới Xóa, trong cùng một giao dịch. Tài khoản không còn nội dung thì Xóa như hiện nay.

## Test (seam đã duyệt)

1. **Unit (không DB):**
   - Schema nội dung: JSON hợp lệ, node và thuộc tính lạ bị loại, vượt giới hạn ký tự.
   - `payload` từng Loại câu hỏi ở các biên: số Phương án, đáp án, Bậc thang, điểm, tag.
   - Trích `search_text`; kiểm LaTeX (hợp lệ, lỗi, lệnh bị cấm); bộ đọc file Excel nhập câu hỏi với các file mẫu lỗi.
2. **Tích hợp** (HTTP + PostgreSQL + Redis, `JobQueue` chạy tại chỗ, `MediaStore` thư mục tạm):
   - Quyền sở hữu: người khác nhận `NOT_FOUND`, Quản trị viên không đọc được nội dung.
   - CRUD cả 4 loại, tìm không dấu, lọc, Nhân bản, di chuyển; xóa Chủ đề còn câu bị từ chối.
   - Ảnh: tải lên, worker tạo đủ biến thể, EXIF bị bỏ, file giả MIME bị từ chối, chỉ chủ xem được.
   - Nhập Excel: xem trước (hợp lệ, lỗi, nghi trùng), xác nhận tạo, chạy lại không tạo trùng.
   - Chuyển giao nguyên tử (lỗi giữa chừng thì không đổi gì), người nhận không hợp lệ, nhật ký; Xóa người dùng trả `HAS_CONTENT`.
3. **E2E:** soạn một câu mỗi loại bằng giao diện (kèm công thức và ảnh ở PR tương ứng); nhập Excel; Quản trị viên Chuyển giao rồi người nhận thấy Chủ đề. Thêm các trang mới vào bộ kiểm "không cuộn ngang" ở 360/768/1024/1440 px.

Không test từng nút của TipTap: chỉ kiểm các luồng chính qua E2E, vì hành vi của trình soạn thuộc thư viện.

## Ngoài phạm vi lát cắt 2

- Lưu trữ Câu hỏi: cần Bộ đề đã Phát hành (lát cắt 3).
- Chuyển các Bộ đề nháp và Phiên thi trong Chuyển giao: lát cắt 3 và 4.
- Rút ngẫu nhiên câu hỏi theo Chủ đề, thống kê câu hỏi, nhập từ Word, ảnh trong Câu tự luận: giai đoạn sau (architecture.md mục 9).
- Chia sẻ Chủ đề giữa các Người ra đề: ngoài giai đoạn 1 (GLOSSARY: mỗi Chủ đề chỉ có một chủ).

## Quyết định (Q111–Q126, đã duyệt)

| Câu | Quyết định |
|---|---|
| Q111 | Chia lát cắt 2 thành 4 PR: 2a Chủ đề + Câu hỏi, 2b công thức, 2c Hình minh họa, 2d nhập Excel + Chuyển giao + Xóa người dùng chọn người nhận |
| Q112 | Chủ đề phẳng, tên không trùng trong cùng chủ; còn Câu hỏi thì không xóa được, có Lưu trữ Chủ đề; phân nhóm nhỏ bằng `tags` |
| Q113 | Chỉ chủ sở hữu thấy nội dung Câu hỏi; Quản trị viên chỉ thấy tên Chủ đề và số câu để Chuyển giao |
| Q114 | Nội dung là TipTap JSON theo schema giới hạn, kiểm bằng Zod dùng chung; client dựng từ JSON, không HTML thô |
| Q115 | Ràng buộc từng Loại câu hỏi (2–8 Phương án, 1–8 Mệnh đề, Bậc thang hợp lệ, điểm 0,25–100, tự luận 100–5.000 ký tự) |
| Q116 | `version` tăng mỗi lần sửa, không lưu lịch sử bản cũ (đã có bản chụp lúc Phát hành) |
| Q117 | Chưa dùng thì xóa hẳn, đã dùng thì Lưu trữ; Lưu trữ thêm ở lát cắt 3 qua cổng `QuestionUsage` |
| Q118 | Tìm không dấu qua cột `search_text`; lọc Chủ đề, Loại, tag; phân trang 20 trên URL |
| Q119 | Lưu bằng nút (không tự lưu lên server), cảnh báo rời trang, bản nháp nhớ trên thiết bị; Nhân bản, di chuyển, xóa hàng loạt |
| Q120 | `QuestionView` dùng chung với khu làm bài và Xem thử Bộ đề; công tắc "Hiện Đáp án đúng" chỉ cho chủ |
| Q121 | Công thức LaTeX trong node `math`; MathLive soạn, KaTeX hiển thị, cả hai tải lười; server kiểm LaTeX và chặn lệnh nguy hiểm |
| Q122 | Ảnh JPEG/PNG/WebP ≤ 5 MB, không SVG/GIF; worker bỏ EXIF và tạo WebP 480/960/1600; `alt` bắt buộc; phục vụ có kiểm quyền |
| Q123 | Nhập Excel chỉ cho câu chọn một và chọn nhiều; xem trước từng dòng rồi mới tạo; công thức viết trong `$...$`; ≤ 500 dòng |
| Q124 | Chuyển giao nhiều Chủ đề trong một giao dịch, người nhận hợp lệ, trùng tên thì thêm hậu tố, ghi nhật ký |
| Q125 | Xóa người dùng còn Chủ đề thì từ chối `HAS_CONTENT`; hộp thoại cho chọn người nhận và Chuyển giao rồi Xóa trong một bước |
| Q126 | Giao diện theo ui-design: mục "Ngân hàng câu hỏi" ở thanh bên, danh sách hai cột trên laptop, mẫu Soạn dùng `staticData.wide`; xây đường dẫn, `Tabs`, ngăn bên |
