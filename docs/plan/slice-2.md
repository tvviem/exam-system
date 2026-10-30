# Lát cắt 2: Ngân hàng câu hỏi

> Trạng thái: **accepted** (29/10/2026): chủ dự án đã duyệt Q111–Q126 (Q112 giữ Chủ đề phẳng) và các seam test. Làm theo [data-model.md](../data-model.md) mục 2, [architecture.md](../architecture.md) mục 3 và 6, [GLOSSARY.md](../../GLOSSARY.md) mục Ngân hàng câu hỏi, [ADR-0005](../adr/0005-chup-noi-dung-khi-phat-hanh.md) và [ui-design.md](../ui-design.md) (khung ứng dụng, mẫu "Soạn", Q100–Q110). Quyết định đánh số tiếp từ Q111 ([lát cắt 1](slice-1.md) dừng ở Q99; Q100–Q110 là của giao diện).

## Mục tiêu

Sau lát cắt 2:
- Người ra đề tạo Chủ đề và soạn Câu hỏi thuộc sở hữu riêng, đủ 4 Loại câu hỏi, kèm công thức toán và Hình minh họa.
- Nhập hàng loạt Câu chọn một và Câu chọn nhiều từ Excel, có xem trước từng dòng.
- Quản trị viên Chuyển giao Chủ đề khi Người ra đề nghỉ việc; Xóa người dùng là Người ra đề buộc chọn người nhận.
- Nội dung Câu hỏi chỉ chủ sở hữu thấy, kể cả Đáp án đúng.

Lát cắt chia thành 5 PR (2a–2e, kèm 2f đề xuất ở Q153). Merge xong PR nào thì hệ thống chạy được tới đó.

```text
2a Chủ đề + Câu hỏi (4 loại, văn bản có định dạng)  ──► 2b Công thức toán
                                                    ├──► 2c Hình minh họa
                                                    ├──► 2d Nhập Excel
                                                    └──► 2f Chuyển giao + Xóa người dùng chọn người nhận (đề xuất, Q153)
```

| PR | Nội dung | Đưa vào dùng được |
|---|---|---|
| 2a | Bảng `topics`, `questions`; schema nội dung và `payload` dùng chung; CRUD, tìm và lọc; trình soạn và Xem thử; Nhân bản, di chuyển, xóa | Người ra đề soạn và quản lý Câu hỏi bằng chữ |
| 2b | Node công thức (MathLive soạn, KaTeX hiển thị, kiểm LaTeX ở server) | Câu hỏi có công thức |
| 2c | `illustrations`, tải ảnh, worker xử lý (sharp), phục vụ có kiểm quyền | Câu hỏi có hình |
| 2d | Nhập Excel (Q123, Q145–Q147) | Nạp hàng loạt Câu hỏi chọn một và chọn nhiều |
| 2f | Chuyển giao Chủ đề; Xóa người dùng chọn người nhận (Q124, Q125, Q148–Q151) | Vòng đời nội dung khi đổi người |

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

Cột `search_text` (văn bản thuần của Phần dẫn và các Phương án/Mệnh đề, cập nhật khi lưu), tìm không dấu và không phân biệt hoa thường. *Khi làm PR 2a:* `search_text` được lưu sẵn dạng đã chuẩn hóa (`normalizeForSearch`, xử lý cả "đ") và tìm bằng `LIKE`, thay cho `unaccent()` lúc truy vấn; hành vi như nhau. Lọc theo Chủ đề, Loại, tag; sắp xếp mới sửa trước; phân trang 20 dòng, trang nằm trên URL.

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

### Chi tiết đã duyệt khi làm PR 2b (Q127–Q131)

- **Q127 Hình dạng node:** một node nhúng trong dòng `math` với `attrs: { latex, display }` (`display` đúng thì hiện riêng dòng, căn giữa); schema chặt, không thuộc tính khác.
- **Q128 Chỗ kiểm:** `@exam/shared` chỉ kiểm hình dạng, ≤ 2.000 ký tự mỗi công thức, ≤ 50 công thức và ≤ 10.000 ký tự công thức mỗi Câu hỏi (để dựng thử KaTeX không tốn quá nhiều CPU; tính cả Phần dẫn, Phương án, Mệnh đề, hướng dẫn chấm), cùng danh sách lệnh bị cấm (`hasForbiddenLatex`, để web báo sớm). Dựng thử bằng KaTeX (`throwOnError`, không `trust`) chỉ ở `apps/api`, khi tạo và sửa; lỗi trả `VALIDATION_FAILED` với `issues: [{ path, code: math_invalid | math_forbidden }]`. Lệnh bị cấm: `\href`, `\url`, `\includegraphics`, `\input`, `\include` và nhóm `\html*`.
- **Q129 Tìm kiếm:** LaTeX nguyên văn nằm trong `search_text` (đã chuẩn hóa) nên tìm `frac` hay `x^2` đều ra; cũng tính vào số ký tự và bản xem trước trong danh sách.
- **Q130 Soạn:** nút Σ "Công thức" trên thanh công cụ (hoặc bấm vào công thức có sẵn) mở hộp thoại có ô MathLive, bàn phím toán ảo gắn vào `<dialog>`, ô "Hiện riêng một dòng", báo lỗi ngay bằng KaTeX; điện thoại hiện dạng bottom sheet.
- **Q131 Font và dung lượng:** KaTeX và MathLive tự host (font woff2 qua Vite), tải lười; gói chính tăng khoảng 0,3 KB gzip, KaTeX ~77 KB và hộp thoại MathLive ~218 KB gzip chỉ tải khi cần. Chuỗi của MathLive để tiếng Anh.

## PR 2e: Tài khoản của tôi (Q132–Q136)

Phát hiện sau PR 2a: đổi mật khẩu chỉ có ở luồng bắt buộc đổi mật khẩu tạm, và chưa ai xem hoặc sửa được thông tin của chính mình. Bổ sung cho mọi vai trò (Quản trị viên, Người ra đề, Người dự thi):

- **Trang `/account`** (mở từ menu tài khoản, mục "Tài khoản của tôi"): khối **Thông tin** (sửa được phần được phép, phần còn lại chỉ xem kèm ghi chú "liên hệ Quản trị viên"), khối **Đổi mật khẩu** (dùng lại API `POST /api/auth/change-password` và biểu mẫu của trang bắt buộc đổi), liên kết sang **Phiên đăng nhập**.
- **API:** `GET /api/account` (kèm `editable`: danh sách trường tự sửa được) và `PATCH /api/account`. Trường ngoài quyền, kể cả trường lạ, bị từ chối `VALIDATION_FAILED` với `{ path, code: 'not_editable' }`.
- **Quyền tự sửa (Q133):** Người ra đề: họ tên, ngày sinh, giới tính, học vị, học hàm. Quản trị viên: họ tên, ngày sinh, giới tính. Người dự thi: ngày sinh, giới tính. Mã định danh, lớp, email, tên đăng nhập, Đơn vị, Nhãn vai trò và họ tên của Người dự thi chỉ Quản trị viên sửa (họ tên in trên Phiếu tài khoản và Kết quả).
- **Email (Q134):** giai đoạn 1 chưa cho tự đổi vì chưa có email để xác minh.
- **Nhật ký (Q135):** `account.update` (chỉ các trường thật sự đổi, kèm trước và sau) và `account.change-password` (không ghi mật khẩu); không ghi gì nếu không có thay đổi.
- **Đổi mật khẩu (Q136):** giữ chính sách hiện có, thu hồi mọi phiên khác, phiên đang dùng giữ nguyên.

## PR 2c: Hình minh họa (Q122)

```text
Người ra đề chọn ảnh ─► trình duyệt thu nhỏ về ≤ 2.400 px (Q142) ─► POST /api/illustrations (≤ 5 MB)
   ─► API kiểm magic bytes + hạn mức + trùng SHA-256, lưu bản tạm (MediaStore), status = processing
   ─► job "illustration.process" (worker, sharp): xoay đúng chiều, bỏ EXIF, tạo WebP ≤ 1600 / 960 / 480 px,
      xóa bản tạm (không giữ bản gốc, Q140) ─► status = ready (hoặc failed + lý do)
Gắn vào Câu hỏi bằng node `image` ─► khi lưu, ghi question_illustrations ─► phục vụ qua /api/media (kiểm quyền)
```

- Không nhận SVG và GIF động (rủi ro XSS và hiệu năng); kiểm magic bytes, không tin đuôi file hay MIME của client; ảnh quá 8.000 px mỗi cạnh bị từ chối (chống nén bom).
- **Văn bản thay thế (`alt`) bắt buộc**, ≤ 250 ký tự, để trình đọc màn hình và người mất mạng vẫn hiểu hình.
- Một ảnh dùng lại được trong nhiều Câu hỏi của cùng chủ; chỉ xóa được khi không còn Câu hỏi nào dùng. Hạn mức mặc định 500 MB mỗi Người ra đề (cấu hình bằng biến môi trường).
- **Phục vụ:** `GET /api/media/:id/:variant` kiểm quyền rồi trả file; production dùng nginx `X-Accel-Redirect` để api không phải đọc file, môi trường dev api tự trả. Lát cắt 2 chỉ chủ sở hữu xem được; token ký 2 giờ cho Người dự thi thêm ở lát cắt 4.
- Ảnh được tải lười, chạm để phóng to (architecture.md mục 7).

### Chi tiết đã duyệt khi làm PR 2c (Q137–Q142)

- **Q137 Node `image`:** node khối `image` với `attrs: { illustrationId (uuid), alt (1–250 ký tự) }`, schema chặt. Đứng ở cấp ngoài cùng của Phần dẫn, Phương án, Mệnh đề và hướng dẫn chấm (không nằm trong mục danh sách). Tối đa 10 ảnh mỗi Câu hỏi (tính trên mọi nội dung); `alt` được cắt khoảng trắng hai đầu, nằm trong `search_text` và tính như chữ của trường chứa nó, nên Phần dẫn hay Phương án chỉ có ảnh vẫn hợp lệ (như chỉ có công thức).
- **Q138 Chọn ảnh khi soạn:** nút "Ảnh" trên thanh công cụ mở hộp thoại: tải ảnh mới (xem trước, bắt buộc nhập mô tả) hoặc chọn từ "Ảnh đã tải lên của tôi" (20 ảnh mỗi trang). Xóa được ngay trong hộp thoại nếu chưa Câu hỏi nào dùng. Bảng `question_illustrations (question_id, illustration_id)` được cập nhật mỗi lần tạo hoặc sửa Câu hỏi; khi lưu, mọi `illustrationId` phải là ảnh `ready` của chính chủ, nếu không trả `VALIDATION_FAILED` với `code: image_unavailable`.
- **Q139 Hạn mức và trùng ảnh:** 500 MB (`ILLUSTRATION_QUOTA_BYTES`) tính trên tổng dung lượng các biến thể đang lưu. Tải trùng nội dung (SHA-256 của file gửi lên, trong cùng chủ) thì trả lại ảnh có sẵn, không tốn thêm dung lượng; ảnh trùng đang `failed` thì xử lý lại.
- **Q140 Tải lên và tối ưu dung lượng (đã sửa):** API nhận multipart ≤ 5 MB, kiểm magic bytes (JPEG/PNG/WebP). Worker dùng sharp: giới hạn số điểm ảnh khi đọc, từ chối cạnh > 8.000 px, xoay theo EXIF rồi bỏ EXIF, mã hóa lại. **Không giữ bản gốc**, chỉ lưu các biến thể WebP có cạnh dài tối đa 1600 / 960 / 480 px; không phóng to (ảnh nhỏ chỉ có biến thể bằng cỡ thật). JPEG và WebP nén chất lượng ~80; PNG (sơ đồ, ảnh chụp màn hình có chữ) nén không mất dữ liệu để chữ không mờ. Ảnh hỏng, quá khổ hoặc lỗi xử lý bất ngờ: `status = failed` kèm lý do (`corrupt`, `dimensions_too_large`, `error`); tải lại đúng ảnh đó thì xử lý lại, nên không có ảnh kẹt ở `processing` vì lỗi. Giao diện hỏi lại trạng thái đến khi `ready`.
- **Q141 Phục vụ và hiển thị:** `GET /api/media/:id/:variant` (`variant` là 480, 960 hoặc 1600; trả biến thể lớn nhất không vượt quá cỡ xin, hoặc biến thể nhỏ nhất nếu ảnh nhỏ hơn), chỉ chủ sở hữu. Production dùng `X-Accel-Redirect`, dev api tự trả. Web dùng `srcset`/`sizes`, tải lười, chạm để phóng to trong hộp thoại.
- **Q142 Thu nhỏ ở trình duyệt:** hộp thoại Ảnh thu nhỏ ảnh về cạnh dài ≤ 2.400 px trước khi tải lên để tiết kiệm dữ liệu di động; không làm được thì gửi file gốc. Server vẫn kiểm tra và mã hóa lại, không tin client.

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

### Chi tiết đề xuất cho PR 2d (Q145–Q153, chờ duyệt)

Q143 và Q144 đã được duyệt (xem bảng quyết định); hai câu đó chỉ ghi lại, chưa làm gì ở lát cắt 2.

**Nhập Excel**

- **Q145 File mẫu và quy tắc đọc ô.**
  - Mẫu tạo bằng `exceljs` như mẫu của Yêu cầu cấp tài khoản. Hàng tiêu đề khớp không phân biệt hoa thường và dấu; cột thừa bị bỏ qua, thiếu cột bắt buộc (Nội dung, Phương án A, Phương án B, Đáp án) thì cả file bị từ chối `missing_columns`.
  - **Điểm trống = 1.** Điểm có mặt phải thuộc 0,25–100, bước 0,25 (cùng quy tắc `defaultPoints`).
  - **Quy tắc chấm:** trống thì câu chọn nhiều lấy Tỷ lệ. Điền ở dòng chọn một là lỗi `scoring_rule_not_allowed`, không bỏ qua im lặng.
  - **Công thức:** `$...$` thành node `math` trong dòng (`display: false`); `\$` là dấu đô la thật; không hỗ trợ `$$...$$`. Công thức đi qua đúng bước kiểm của lúc lưu (KaTeX ở api, lệnh cấm, ≤ 50 công thức mỗi Câu hỏi), lỗi báo `math_invalid` hoặc `math_forbidden` ở dòng đó.
  - Ô trống giữa các Phương án (A, C có, B trống) là lỗi `gap_in_options`, không tự dồn lên. Xuống dòng trong ô thành `hardBreak`. Tags tách bằng dấu phẩy, chuẩn hóa như lúc lưu.
  - Mã lỗi từng dòng (mở rộng danh sách ở Q123): `missing_content`, `too_few_options`, `answer_mismatch`, `invalid_points`, `scoring_rule_not_allowed`, `gap_in_options`, `math_invalid`, `math_forbidden`, `field_too_long`, `too_many_tags`.

- **Q146 Lô nhập (batch).**
  - Bảng `question_import_batches` (`id`, `owner_id`, `topic_id`, `original_filename`, `upload_key`, `status`, `parse_error`, `row_count`, `created_at`, `committed_at`, `expires_at` = tạo + 30 ngày) và `question_import_items` (`batch_id`, `row_number`, `payload jsonb` là đúng `QuestionInput` đã đổi xong, `error_code`, `duplicate_of_question_id`, `selected bool`, `outcome` `pending | created | skipped`).
  - Trạng thái: `parsing → parse_failed | ready → committing → committed`. File tải lên xóa ngay sau khi đọc xong (như Yêu cầu cấp tài khoản); phần còn lại là `payload`, đủ để xem lại 30 ngày.
  - **Chọn dòng:** mặc định chọn mọi dòng hợp lệ và bỏ chọn dòng nghi trùng; dòng lỗi không chọn được. `PATCH` cập nhật `selected` cho từng dòng hoặc cho cả nhóm. Không có dòng nào được chọn thì không xác nhận được.
  - **Xác nhận chạy một lần:** `POST .../commit` chuyển `ready → committing` bằng một câu `UPDATE ... WHERE status = 'ready'`; lần gọi thứ hai nhận `INVALID_STATE`. Job tạo mọi Câu hỏi đã chọn **trong một giao dịch** rồi đặt `committed`; job lỗi thì lô trở lại `ready` để thử lại, không tạo nửa chừng.
  - **Chủ đề đích** đổi sau khi tải lên: nếu đã bị Lưu trữ hoặc xóa lúc xác nhận thì `INVALID_STATE` (`topic_unavailable`), lô giữ nguyên. Nghi trùng chỉ tính theo `search_text` đã chuẩn hóa trong Chủ đề đích lúc đọc file, kèm trùng giữa các dòng trong file (dòng sau được đánh dấu trùng dòng trước).
  - Ghi **một** dòng `audit_logs` `question.import` mỗi lần xác nhận (số dòng tạo, số bỏ qua, Chủ đề đích). Job dọn hằng ngày (Q96) xóa lô quá 30 ngày.
  - Chỉ chủ lô thấy lô; người khác nhận `NOT_FOUND`.

- **Q147 Giao diện nhập.**
  - Nút "Nhập từ Excel" ở danh sách Câu hỏi → trang `/examiner/questions/import` với bốn bước: (1) chọn Chủ đề đích, tải file mẫu; (2) tải file lên; (3) xem trước; (4) kết quả kèm liên kết sang danh sách Chủ đề đó.
  - Bước 3 hỏi lại mỗi giây khi `parsing`. Bảng có bộ lọc Tất cả / Hợp lệ / Lỗi / Nghi trùng kèm số lượng, ô chọn từng dòng, cột lý do tiếng Việt; bấm một dòng để xem trước nội dung dựng sẵn (`RichTextView`, có đáp án đúng vì là nội dung của chính Người ra đề).
  - Dưới 768 px bảng thành danh sách thẻ, thanh "Tạo N câu hỏi" dính đáy màn hình.
  - Đóng trang giữa chừng thì lô còn đó: trang có danh sách "Lô nhập gần đây" (30 ngày) để mở lại.

**Chuyển giao và Xóa người dùng (PR 2f)**

- **Q148 Chuyển giao Chủ đề.**
  - API quản trị: `GET /api/admin/users/:id/content` trả tên Chủ đề, số Câu hỏi, trạng thái Lưu trữ (không trả nội dung, Q113); `POST /api/admin/users/:id/transfer { topicIds[], recipientId }`.
  - Chọn được cả Chủ đề đã Lưu trữ. Người nhận: Nhãn Người ra đề, không phải Quản trị viên, chưa Khóa, chưa Xóa, khác người cho; không hợp lệ thì `VALIDATION_FAILED recipientId`.
  - Tên trùng với Chủ đề chưa Lưu trữ của người nhận thì thêm " (từ <tên người cũ>)"; vẫn trùng thì thêm " (2)", " (3)"... Chủ đề đã Lưu trữ không cần đổi tên (không nằm trong ràng buộc duy nhất; Khôi phục sau đó đã có `CONFLICT`).
  - Một giao dịch; khóa dòng hai người dùng theo thứ tự `id` để tránh bế tắc. Ghi `topic.transfer` với số Chủ đề, số Câu hỏi, số ảnh, người cũ, người mới. Câu hỏi giữ nguyên `version`, trừ câu bị viết lại nội dung ảnh ở Q149.

- **Q149 Hình minh họa khi Chuyển giao.** Phần "đổi `illustrations.owner_id`" của Q124 chưa đủ vì gặp hai ca: ràng buộc `UNIQUE(owner_id, sha256)` (người nhận đã có ảnh trùng) và ảnh dùng chung với Câu hỏi không chuyển. Với mỗi ảnh mà các Câu hỏi đang chuyển tham chiếu:
  1. Chỉ các Câu hỏi đang chuyển dùng **và** người nhận chưa có ảnh cùng SHA-256: đổi `owner_id`.
  2. Người nhận đã có ảnh `ready` cùng SHA-256: dùng ảnh đó.
  3. Còn dùng chung với Câu hỏi không chuyển: tạo bản sao cho người nhận (`MediaStore.get` rồi `put` từng biến thể, không thêm phương thức mới).
  Ở ca 2 và 3, viết lại `illustrationId` trong nội dung các Câu hỏi đã chuyển và cập nhật `question_illustrations`, tăng `version` của những câu đó. Sao chép file làm **trước** giao dịch; giao dịch lỗi thì xóa các file vừa chép. Chuyển giao không bị hạn mức ảnh chặn (hạn mức mềm, hành động của Quản trị viên). Ảnh thư viện chưa dùng của người cho không chuyển; hệ quả: sau khi Xóa người dùng chúng nằm lại trong kho, việc dọn thuộc chính sách lưu trữ ở giai đoạn sau.

- **Q150 Xóa người dùng kèm người nhận.**
  - Giữ `DELETE /api/admin/users/:id`, thêm tham số tùy chọn `?recipientId=`. Còn Chủ đề mà không có `recipientId` thì `409 HAS_CONTENT` kèm `{ topics: [{ id, name, questionCount }] }`; có `recipientId` thì Chuyển giao **toàn bộ** (cả đã Lưu trữ) rồi Xóa trong cùng giao dịch, nhật ký `topic.transfer` rồi `user.remove`. Không còn nội dung mà vẫn gửi `recipientId` thì bỏ qua tham số.
  - `identity` không đọc bảng của `question-bank` và `question-bank` không import `identity`: `identity` định nghĩa cổng `OwnedContent` (`summaryOf(userId)`, `transfer(tx, from, to, topicIds)`), `question-bank` cung cấp bản cài đặt, nối ở `AppModule`, giống `JobQueue` (Q87).
  - Giới hạn đã biết: nếu Người ra đề đang tạo Chủ đề đúng lúc bị Xóa, Chủ đề mới có thể nằm lại dưới tài khoản đã Xóa (cửa sổ rất hẹp, vì mọi phiên bị thu hồi khi giao dịch xong). Quản trị viên chuyển tiếp được qua bộ lọc "Đã xóa".

- **Q151 Giao diện quản trị và thông báo.**
  - Trang chi tiết người dùng có Nhãn Người ra đề (kể cả đã Xóa thì chỉ xem) thêm thẻ "Nội dung": danh sách Chủ đề có ô chọn, nút "Chuyển giao…".
  - Hộp thoại chọn người nhận dùng chung cho Chuyển giao và Xóa: tìm theo tên, tên đăng nhập, chỉ hiện Người ra đề hợp lệ (dùng `GET /api/admin/users?roleTag=examiner&status=active&q=`), tóm tắt "N Chủ đề, M Câu hỏi, K ảnh", một nút xác nhận. Hộp thoại Xóa chỉ hiện phần chọn người nhận khi API trả `HAS_CONTENT`.
  - Người nhận nhận thông báo `topics.transferred` ("Quản trị viên đã chuyển giao N Chủ đề cho bạn"), thêm một loại vào bảng `notifications` (Q95); người cho không cần.

**Phạm vi và kiểm thử**

- **Q152 Seam test.**
  - *Unit (không DB):* đọc file Excel/CSV nhập câu hỏi với các file mẫu đúng và lỗi (từng mã lỗi ở Q145); bộ đổi ô sang node (`$...$`, `\$`, xuống dòng); hàm đặt tên khi trùng (hậu tố, đánh số); hàm viết lại `illustrationId` trong nội dung.
  - *Tích hợp (HTTP + PostgreSQL + Redis, `JobQueue` chạy tại chỗ, `MediaStore` thư mục tạm):* lô nhập từ tải lên đến xác nhận, xác nhận hai lần chỉ tạo một lần, Chủ đề đích đã Lưu trữ giữa chừng, người khác `NOT_FOUND`; Chuyển giao nguyên tử bằng `MediaStore` giả ném lỗi khi chép file (kiểm không đổi gì, file tạm được dọn), ba ca ảnh của Q149, người nhận không hợp lệ, `HAS_CONTENT` rồi Xóa kèm người nhận, nhật ký và thông báo.
  - *E2E (desktop và mobile):* nhập file Excel qua giao diện đến khi Câu hỏi hiện trong danh sách; Quản trị viên Chuyển giao một Chủ đề và Xóa người dùng kèm người nhận, rồi người nhận đăng nhập thấy Chủ đề và thông báo; kiểm "không cuộn ngang" ở các trang mới.

- **Q153 Tách PR.** 2d chỉ gồm Nhập Excel (Q145–Q147); 2f gồm Chuyển giao và Xóa người dùng (Q148–Q151). Hai phần không dùng chung mã, tách ra để mỗi PR đủ nhỏ để duyệt. Làm 2d trước.

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

## Bổ sung khi làm PR 2a

Những điểm PR 2a làm thêm hoặc khác so với văn bản trên, đều nhỏ và không đổi quyết định đã duyệt:
- Sửa Câu hỏi dùng khóa lạc quan: client gửi `version` đang sửa, lệch thì `CONFLICT` (tránh ghi đè khi sửa từ hai nơi); di chuyển Câu hỏi cũng tăng `version`.
- Chủ đề có thêm đổi tên và Khôi phục sau Lưu trữ (trùng tên với Chủ đề đang dùng thì `CONFLICT`).
- Bộ lọc tag được chuẩn hóa như lúc lưu (chữ thường, gộp khoảng trắng).
- "Ngăn bên" chưa tách thành thành phần riêng (xem ui-design mục 9).

## Ngoài phạm vi lát cắt 2

- Lưu trữ Câu hỏi: cần Bộ đề đã Phát hành (lát cắt 3).
- Chuyển các Bộ đề nháp và Phiên thi trong Chuyển giao: lát cắt 3 và 4.
- Rút ngẫu nhiên câu hỏi theo Chủ đề, thống kê câu hỏi, nhập từ Word, ảnh trong Câu tự luận: giai đoạn sau (architecture.md mục 9).
- Chia sẻ Chủ đề giữa các Người ra đề: ngoài giai đoạn 1 (GLOSSARY: mỗi Chủ đề chỉ có một chủ).

## Quyết định (Q111–Q144 đã duyệt; Q145–Q153 chờ duyệt)

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
| Q122 | Ảnh JPEG/PNG/WebP ≤ 5 MB, không SVG/GIF; worker bỏ EXIF và tạo WebP 480/960/1600 (không giữ bản gốc, Q140); `alt` bắt buộc; phục vụ có kiểm quyền |
| Q123 | Nhập Excel chỉ cho câu chọn một và chọn nhiều; xem trước từng dòng rồi mới tạo; công thức viết trong `$...$`; ≤ 500 dòng |
| Q124 | Chuyển giao nhiều Chủ đề trong một giao dịch, người nhận hợp lệ, trùng tên thì thêm hậu tố, ghi nhật ký |
| Q125 | Xóa người dùng còn Chủ đề thì từ chối `HAS_CONTENT`; hộp thoại cho chọn người nhận và Chuyển giao rồi Xóa trong một bước |
| Q126 | Giao diện theo ui-design: mục "Ngân hàng câu hỏi" ở thanh bên, danh sách hai cột trên laptop, mẫu Soạn dùng `staticData.wide`; xây đường dẫn, `Tabs`, ngăn bên |
| Q127 | Node `math` nhúng trong dòng, `attrs { latex, display }` |
| Q128 | Shared kiểm hình dạng, 2.000 ký tự, 50 công thức, lệnh cấm; KaTeX chỉ ở api khi lưu (`math_invalid`, `math_forbidden`) |
| Q129 | LaTeX nguyên văn nằm trong `search_text` |
| Q130 | Hộp thoại MathLive từ nút Σ hoặc bấm công thức có sẵn; bottom sheet trên điện thoại |
| Q131 | KaTeX và MathLive tự host, tải lười; MathLive tiếng Anh |
| Q132 | Trang `/account` cho mọi vai trò: Thông tin, Đổi mật khẩu, liên kết Phiên đăng nhập; lối vào ở menu tài khoản |
| Q133 | Quyền tự sửa theo vai trò; mã, lớp, email, tên đăng nhập, Đơn vị, họ tên Người dự thi do Quản trị viên sửa |
| Q134 | Chưa cho tự đổi email ở giai đoạn 1 |
| Q135 | Ghi `account.update` và `account.change-password`, không ghi mật khẩu, không ghi khi không đổi gì |
| Q136 | Đổi mật khẩu giữ phiên hiện tại, thu hồi phiên khác |
| Q137 | Node khối `image { illustrationId, alt ≤ 250 }`, ở cấp ngoài cùng, ≤ 10 ảnh mỗi Câu hỏi |
| Q138 | Hộp thoại Ảnh: tải mới (alt bắt buộc) hoặc chọn từ thư viện; xóa khi chưa dùng; `question_illustrations` cập nhật khi lưu; `image_unavailable` |
| Q139 | Hạn mức 500 MB tính trên biến thể; trùng SHA-256 trong cùng chủ thì dùng lại |
| Q140 | Multipart ≤ 5 MB, worker sharp: bỏ EXIF, từ chối > 8.000 px, chỉ lưu biến thể WebP ≤ 1600/960/480, không giữ bản gốc; `processing → ready/failed` |
| Q141 | `GET /api/media/:id/:variant` chỉ chủ; `X-Accel-Redirect` ở production; `srcset`, tải lười, chạm phóng to |
| Q142 | Trình duyệt thu nhỏ ≤ 2.400 px trước khi tải lên; server không tin client |
| Q143 | Người mang cả hai Nhãn vai trò chuyển khu "Soạn đề" ↔ "Làm bài" ở menu tài khoản; thanh bên chỉ hiện mục của khu đang xem. Làm ở lát cắt 4, khi có `/take` |
| Q144 | Người ra đề không được có tên trong Danh sách dự thi của Phiên thi do chính mình sở hữu (server từ chối `owner_cannot_sit`); vẫn thi được đề của Người ra đề khác. Làm ở lát cắt 4 |
| Q145 | File mẫu Nhập Excel: tiêu đề khớp không dấu, điểm trống = 1, `$...$` thành công thức trong dòng, `\$` là dấu đô la, Quy tắc chấm trên câu chọn một là lỗi |
| Q146 | Lô nhập: trạng thái `parsing → ready → committing → committed`; chọn dòng để tạo (mặc định hợp lệ, bỏ nghi trùng); xác nhận chỉ chạy một lần; Chủ đề đích đổi trạng thái thì từ chối |
| Q147 | Giao diện nhập: trang `/examiner/questions/import`, bốn bước, xem trước từng dòng có bộ lọc, điện thoại hiện thẻ |
| Q148 | Chuyển giao: Quản trị viên chọn Chủ đề (cả đã Lưu trữ) và người nhận; tên trùng thêm hậu tố; một giao dịch; ghi `topic.transfer` |
| Q149 | Hình minh họa khi Chuyển giao: chuyển chủ nếu chỉ các Câu hỏi đang chuyển dùng và người nhận chưa có ảnh trùng; ngược lại dùng ảnh sẵn có của người nhận hoặc sao chép rồi trỏ lại |
| Q150 | Xóa người dùng kèm người nhận: `DELETE ...?recipientId=`; `HAS_CONTENT` kèm danh sách Chủ đề; identity gọi question-bank qua cổng `OwnedContent` |
| Q151 | Giao diện quản trị: thẻ "Nội dung" ở trang người dùng, hộp thoại chọn người nhận dùng chung cho Chuyển giao và Xóa; người nhận được thông báo `topics.transferred` |
| Q152 | Seam test của PR 2d (xem mục "Chi tiết đề xuất cho PR 2d") |
| Q153 | Tách PR 2d thành 2d (Nhập Excel) và 2f (Chuyển giao + Xóa người dùng chọn người nhận) |
