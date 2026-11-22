# Mã đề của Phiên thi: cả Phiên thi dùng chung một hay nhiều bộ câu (thiết kế đề xuất)

**Trạng thái: `accepted`** (chủ dự án duyệt ngày 23/11/2026, gồm cả bốn điểm diễn giải ở mục 12; chưa viết mã, bắt đầu từ lát V1). Ngày đề xuất: 23/11/2026. Mọi câu hỏi nghiệp vụ **Q462–Q477** đã được chủ dự án trả lời từng câu trong phiên làm việc ngày 23/11/2026 (mục 2). Câu quyết định đánh số tiếp từ **Q478**.

## 1. Yêu cầu của chủ dự án

Hiện "Rút câu theo Phần" (bản `0.3.0`) cho **mỗi Người dự thi một bộ câu riêng** (hạt giống rút là băm của Phiên thi, người dự thi và Phần). Chủ dự án muốn thêm cách tổ chức khác, linh hoạt hơn:

> Khi tạo Phiên thi từ Bộ đề đã Phát hành, Phiên thi lấy ra một **bộ đề gốc** dựa trên tỷ lệ rút của từng Phần. Từ bộ đề gốc đó, **tất cả người dự thi của Phiên thi** dùng chung và hiển thị ngẫu nhiên các câu trong từng Phần. Phiên thi khác thì sinh ngẫu nhiên các câu theo tỷ lệ của Bộ đề, hoặc tùy chỉnh tỷ lệ ghi đè lại Bộ đề.

Kèm yêu cầu: tùy biến linh hoạt nhất có thể khi tổ chức đánh giá, nghiệp vụ rõ ràng, và **xuất Word được đúng đề của Phiên thi** (hiện tệp xuất là Bộ đề đầy đủ mọi câu, chưa theo tỷ lệ rút).

Cách hiểu tổng quát hóa: một Phiên thi có **K mã đề** (K từ 1 đến 10). Mỗi mã đề là một bộ câu rút theo tỷ lệ; mỗi Người dự thi được chia vào đúng một mã đề.
- **K = 1:** cả Phiên thi dùng chung một bộ câu (đúng ý chủ dự án; là mặc định, và là cách chủ dự án dự định dùng chủ yếu, Q477).
- **K = 2 trở lên:** như đề giấy A/B/C.
- **"Mỗi người một đề":** cách hiện có, giữ làm một lựa chọn riêng.

## 2. Quyết định của chủ dự án (Q462–Q477, chốt 23/11/2026)

| Câu | Quyết định |
|---|---|
| **Q462** thuật ngữ | **Mã đề** cho mỗi bộ câu; cả tập gọi là **Đề của Phiên thi**. Nhãn mặc định "Đề 1, Đề 2…", Người ra đề sửa được (ví dụ 101, 102) |
| **Q463** số mã đề | Mặc định **1**, tối đa **10** |
| **Q464** kiểu cũ | **Giữ** "mỗi người một đề" như một lựa chọn riêng; mọi Phiên thi đã tạo giữ nguyên hành vi cũ |
| **Q465, Q465b** cách chia | **Ngẫu nhiên cân bằng** (mặc định) và **gán tay từng người**. Chia theo Lớp: **để sau** (backlog) |
| **Q466** người thêm sau | Tự gán mã đề **đang có ít người nhất** |
| **Q467** chốt và khóa | Bộ câu của từng mã đề **rút ngay khi lưu Phiên thi** (xem được danh sách); số mã đề, tỷ lệ, "Rút lại" và việc chia người sửa được **cho tới khi có Lượt làm bài đầu tiên**, sau đó khóa |
| **Q468** làm lại | Giữ nguyên mã đề cho mọi Lượt (như Q389) |
| **Q469** điểm | (a) Phát hành Bộ đề **chỉ cảnh báo**, không chặn vì câu lệch điểm; (b) khi lưu Phiên thi, **chặn nếu các mã đề có tổng điểm khác nhau**; (c) kiểu "mỗi người một đề" **vẫn bắt buộc** các câu trong Phần rút cùng điểm như hiện nay |
| **Q470** tỷ lệ | **Cùng tỷ lệ** từng Phần cho mọi mã đề của một Phiên thi |
| **Q471** hiển thị | Người dự thi thấy **"Mã đề của bạn: Đề 2"** ở màn xác nhận và đầu màn hình làm bài, kèm "bài gồm N câu" (ẩn dòng mã đề khi Phiên thi chỉ có 1 mã đề) |
| **Q472** xem thử | Xem thử cho **chọn mã đề**; có danh sách câu của từng mã đề ngay trên màn Phiên thi |
| **Q473** xuất Word | Xuất **từng mã đề** hoặc **tất cả mã đề** (tệp nén); mỗi mã đề có tệp **Đề** và tệp **Đáp án**, ô "Mã đề" điền sẵn; kèm **Excel phân người dự thi theo mã đề**. Kiểu "mỗi người một đề" không xuất được (giao diện nêu rõ lý do) |
| **Q474** kết quả | Excel Kết quả và màn Theo dõi có cột **Mã đề** và lọc theo mã đề; **thống kê so sánh độ khó giữa các mã đề để sau** |
| **Q475** lát cắt | Làm lát (1) trước; "câu bắt buộc luôn có" và "rút cân theo tag" để sau (backlog) |
| **Q476** xáo trộn | Giữ hai công tắc hiện có (xáo câu trong từng Phần, xáo phương án); **không** xáo thứ tự Phần; chưa làm "xáo riêng từng Phần" |
| **Q477** nhu cầu | **Chủ yếu 1 mã đề cho cả Phiên thi**; nên ưu tiên đường đi K = 1 đầy đủ (rút, xem, xuất đúng đề) trước, rồi mới đến nhiều mã đề |

## 3. Thuật ngữ (đề xuất thêm vào GLOSSARY, đã thêm ở PR này)

- **Mã đề** (`Variant`): một bộ câu cố định của Phiên thi, rút theo Tỷ lệ rút của từng Phần; Người dự thi được chia vào đúng một mã đề. Không phải mã in trên đề giấy. _Avoid_: phiên bản đề, đề A/B, bộ câu.
- **Đề của Phiên thi** (`Session paper`): tập các Mã đề của một Phiên thi. _Avoid_: đề gốc, đề thi.
- **Cách ra đề** (`Draw scope`): Phiên thi **dùng chung các Mã đề** (`shared`) hay **mỗi người một đề** (`per_candidate`, kiểu Rút câu hiện có).

Chủ dự án gọi trước đó là "bộ đề gốc của Phiên thi"; trong từ điển dự án **Bộ đề** là bản gốc đã Phát hành, nên mình dùng **Mã đề** để không nhầm.

## 4. Thiết kế

### 4.1 Nguyên tắc

- Mọi thứ ở dạng **cộng thêm**: không đổi cột đã có, không đổi dữ liệu cũ. Phiên thi đã tạo là `per_candidate`, chạy y như trước (kể cả Lượt, chấm, Phúc khảo, Excel).
- **Bộ câu của mã đề được lưu lại** (không tính lại từ hạt giống mỗi lần): xem thử, xuất và vào thi đều đọc cùng một danh sách, nên đổi thuật toán rút về sau cũng không làm đổi đề đã thi. Danh sách được ghi vào PostgreSQL trước khi báo thành công.
- Bất biến hệ thống giữ nguyên: đáp án chỉ ở server; mã đề và danh sách câu **không** chứa đáp án; server quyết định bộ câu và điểm; Lượt, Chấm, Phúc khảo chỉ đọc bản chụp `exam_items.snapshot`.

### 4.2 Dữ liệu (migration `0030`, chỉ thêm)

```sql
CREATE TYPE session_draw_scope AS ENUM ('shared', 'per_candidate');

ALTER TABLE sessions
  ADD COLUMN draw_scope session_draw_scope NOT NULL DEFAULT 'per_candidate';  -- hàng cũ: hành vi cũ
-- API tạo Phiên thi mới đặt 'shared' (mặc định của giao diện), kèm 1 Mã đề.

session_variants (                         -- Mã đề của Phiên thi (chỉ có khi draw_scope = 'shared')
  id uuid PK,
  session_id uuid NOT NULL → sessions ON DELETE CASCADE,
  number smallint NOT NULL CHECK (number BETWEEN 1 AND 10),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  draw_seed bigint NOT NULL,               -- hạt giống 48 bit lúc rút; "Rút lại" đổi hạt giống
  UNIQUE (session_id, number),
  UNIQUE (session_id, label)               -- không phân biệt hoa thường (chỉ mục trên lower(label))
)

session_variant_items (                    -- Bộ câu đã rút của một Mã đề: đọc lại, không tính lại
  variant_id uuid NOT NULL → session_variants ON DELETE CASCADE,
  item_id uuid NOT NULL → exam_items,
  PRIMARY KEY (variant_id, item_id)
)                                          -- trigger: câu phải thuộc Bộ đề của Phiên thi

ALTER TABLE session_roster
  ADD COLUMN variant_id uuid NULL → session_variants ON DELETE SET NULL;   -- Mã đề đã chia (draw_scope = 'shared')
ALTER TABLE attempts
  ADD COLUMN variant_id uuid NULL → session_variants;                      -- chụp lúc tạo Lượt, không đổi (cùng guard với layout)
```

**Trigger bảo vệ** (cùng kiểu `session_section_draws_guard`):
- Phiên thi **đã có Lượt**: không thêm, xóa, đổi nhãn số lượng Mã đề; không đổi `draw_seed` hay `session_variant_items`; không đổi `session_section_draws`.
- `session_roster.variant_id` phải thuộc cùng Phiên thi.
- `attempts.variant_id` không đổi sau khi tạo.

### 4.3 Thuật toán (hàm thuần ở `@exam/shared`)

- `drawVariantItems(items, percent, seed)`: dùng lại `drawn()` hiện có (Fisher–Yates từng phần). **Tính chất:** cùng hạt giống mà tăng tỷ lệ thì chỉ **thêm** câu, không đổi những câu đã có (kiểm thử).
- **Hạt giống từng Phần:** `variantSeedOf(drawSeed, sectionId)` (băm, như `drawSeedOf` nhưng không có người dự thi).
- `assignBalanced(userIds, variantCount, random)`: xáo danh sách rồi xoay vòng; số người các mã đề lệch nhau không quá 1.
- `leastLoadedVariant(counts)`: mã đề ít người nhất, hòa thì số nhỏ hơn (Q466).
- **Vào thi (`attempts.service`):** `draw_scope = 'shared'`: lấy mã đề của người trong `session_roster` (chưa có thì gán `leastLoadedVariant` trong cùng giao dịch, khóa dòng để không chia lệch khi nhiều người vào cùng lúc), dựng bố cục bằng `layoutOf` với danh sách câu của mã đề, **không rút thêm**; xáo thứ tự câu và phương án như hiện nay bằng `seed` của Lượt. Ghi `attempts.variant_id`. `per_candidate`: không đổi.
- **Điểm tối đa của Lượt** tính theo `layout` như hiện nay, nên chấm, Phúc khảo, Đính chính và Excel không phải sửa phép tính.

### 4.4 Luồng cho Người ra đề

1. **Tạo Phiên thi:** mục mới **Cách ra đề**: *Dùng chung các Mã đề* (số Mã đề 1 đến 10, mặc định 1, nhãn sửa được) hoặc *Mỗi người một đề*. Tỷ lệ rút của từng Phần: kế thừa Bộ đề hoặc ghi đè (cơ chế đã có). Lưu Phiên thi là **rút luôn** các Mã đề.
2. **Tab Đề** (mới, trang Phiên thi): danh sách Mã đề, mỗi mã đề xem được danh sách câu theo Phần, số câu, tổng điểm; nút **Rút lại** (từng mã đề hoặc tất cả); nút **Chia mã đề** (ngẫu nhiên cân bằng). Chỉ hiện khi `shared`.
3. **Danh sách dự thi:** cột **Mã đề**, đổi tay từng người (hộp chọn). Người thêm sau được gán mã đề ít người nhất (Q466).
4. **Xem thử:** chọn mã đề để xem đúng bộ câu (thay "lượt rút mẫu" ngẫu nhiên ở kiểu `shared`; kiểu `per_candidate` giữ nguyên).
5. **Xuất Word:** từng Mã đề hoặc tất cả (tệp nén); tệp Đề và tệp Đáp án của mỗi Mã đề chỉ gồm câu của mã đề đó, ô "Mã đề" điền sẵn; kèm Excel người dự thi theo Mã đề. Kiểu `per_candidate`: nút bị khóa kèm lý do "mỗi người nhận một bộ câu riêng".
6. **Theo dõi, Kết quả:** cột và bộ lọc Mã đề; Excel Kết quả có cột Mã đề.

### 4.5 Điều Người dự thi thấy

Phiên thi `shared` có từ 2 mã đề: màn xác nhận và đầu màn hình làm bài có **"Mã đề của bạn: Đề 2"** và "bài gồm N câu". Chỉ 1 mã đề thì ẩn dòng mã đề (không có gì để phân biệt), vẫn có "bài gồm N câu" khi có rút. `per_candidate` giữ nguyên thông báo hiện có.

### 4.6 Quy tắc điểm (Q469)

| Chỗ | Hiện nay | Đề xuất |
|---|---|---|
| Phát hành Bộ đề, Phần rút dưới 100 % mà câu lệch điểm | Chặn (`draw_points_uneven`) | **Cảnh báo**, không chặn (lúc Phát hành chưa biết Phiên thi dùng kiểu nào) |
| Lưu Phiên thi `shared` | Không có | **Chặn** nếu các mã đề có **tổng điểm khác nhau** (`variant_points_uneven`, nêu mã đề nào và tổng bao nhiêu; hướng dẫn Rút lại hoặc đổi tỷ lệ) |
| Lưu Phiên thi `per_candidate` | Chặn khi Phần rút lệch điểm | **Giữ nguyên** (Q441) |

Phiên thi `shared` với 1 mã đề: không cần kiểm gì thêm.

### 4.7 Tương thích và lùi bản

- Phiên thi đã có: `draw_scope = 'per_candidate'` tự động nhờ giá trị mặc định cột; không dòng nào trong `session_variants`.
- **Nhân bản Phiên thi:** sao chép Cách ra đề, số Mã đề, nhãn; **rút mới** (hạt giống mới), không sao chép danh sách chia người.
- Lùi bản: migration chỉ thêm cột, bảng; mã cũ bỏ qua các cột thừa. Phiên thi `shared` đã có người thi mà lùi về bản cũ thì sẽ bị mã cũ hiểu như `per_candidate` (kết quả đã nộp không đổi vì `attempts.layout` giữ nguyên), nên **không lùi về `0.3.x` sau khi đã có Phiên thi `shared` đang chạy**; ghi vào `docs/ops/phat-hanh.md` khi phát hành.

## 5. Ảnh hưởng tới các phần khác

| Phần | Thay đổi |
|---|---|
| Phát hành Bộ đề (`publish-check`) | `draw_points_uneven` thành cảnh báo (mục 4.6); hộp Phát hành và bản cập nhật test |
| Form Phiên thi (`session-draw.tsx`) | Thêm Cách ra đề, số và nhãn Mã đề; khóa theo Lượt đầu |
| Vào thi, Lượt | Dùng mã đề; ghi `attempts.variant_id` |
| Xem thử (`session-preview.service`) | Chọn mã đề |
| Xuất Word (`paper.service`) | Nhận `variantId` hoặc `all`; lọc câu theo mã đề; zip; Excel phân mã đề |
| Excel Kết quả, Theo dõi | Cột và lọc Mã đề |
| GLOSSARY, `data-model.md`, `architecture.md`, hướng dẫn | Cập nhật theo lát cắt cuối |

## 6. Lát cắt triển khai (theo Q475, Q477)

Mỗi lát một PR nhỏ có kiểm thử, kèm ảnh chụp thật; chủ dự án duyệt trước khi sang lát kế.

| Lát | Nội dung | Kết quả nhìn thấy |
|---|---|---|
| **V1** | Migration `0030`, hàm thuần (rút, chia cân bằng, ít người nhất), tạo Phiên thi `shared` với 1 mã đề, quy tắc điểm (4.6), vào thi dùng mã đề | Phiên thi rút một lần, mọi người dùng chung bộ câu; Phát hành Bộ đề có tự luận 2 điểm qua được |
| **V2** | Tab Đề: xem danh sách câu, Rút lại; Xem thử theo mã đề; **xuất Word đúng đề của Phiên thi (1 mã đề)** | Trả lời xong câu hỏi "xuất bộ đề đã rút" |
| **V3** | Nhiều mã đề (2 đến 10), Chia mã đề, cột và đổi tay trong Danh sách dự thi, người thêm sau | Đề A/B/C |
| **V4** | Người dự thi thấy mã đề; Excel Kết quả, Theo dõi: cột và lọc | Đối chiếu, khiếu nại |
| **V5** | Xuất tất cả mã đề (zip) và Excel phân mã đề; tài liệu, đo, tag `0.5.0` | Hoàn tất |

Bộ đề `per_candidate` không đổi ở mọi lát. Phiên bản dự kiến: **`0.5.0` (MINOR)** (thêm bảng và cột), sau `0.4.0` của PR #143.

## 7. Kế hoạch kiểm thử

- **Hàm thuần:** rút giữ tính chất "tăng tỷ lệ chỉ thêm câu"; chia cân bằng lệch ≤ 1 với mọi K và số người; ít người nhất xử lý hòa; `layoutOf` với danh sách câu của mã đề cho kết quả như `layoutOf` có rút khi cùng tập câu; kiểu `per_candidate` **không đổi** (kiểm thử hiện có giữ nguyên, không sửa).
- **Tích hợp (PostgreSQL thật):** tạo Phiên thi K = 1, 3 sinh đúng số mã đề và bộ câu theo tỷ lệ; Rút lại đổi bộ câu; chia người; vào thi dùng đúng mã đề, ghi `attempts.variant_id`; hai người vào cùng lúc không chia lệch; sau Lượt đầu mọi thay đổi bị khóa (trigger); `variant_points_uneven` chặn đúng; Nhân bản; Phiên thi cũ chạy y như trước.
- **Bảo mật:** mã đề và danh sách câu không chứa đáp án; người khác không đọc được mã đề của Phiên thi không phải của mình.
- **E2E (desktop và mobile):** form Cách ra đề; tab Đề; cột Mã đề trong Danh sách; Người dự thi thấy Mã đề; xuất Word.
- **Hiệu năng:** bắt đầu Lượt đọc bộ câu đã lưu nên không chậm hơn rút tại chỗ; đo lại 500 người bấm bắt đầu cùng lúc (mục tiêu giữ p95 ≈ 4 s như bản `0.3.0`).

## 8. Vì sao lưu bộ câu của mã đề thay vì tính lại từ hạt giống

Tính lại cho gọn dữ liệu nhưng có ba rủi ro: đổi thuật toán sẽ âm thầm đổi đề của Phiên thi đã thi; xem thử, xuất Word và vào thi phải tính ba lần và phải luôn khớp; không kiểm toán được "đề đã thi gồm câu nào". Lưu `session_variant_items` chỉ tốn khoảng K × (số câu rút) dòng cho mỗi Phiên thi, và mọi nơi đọc cùng một nguồn.

## 9. Phương án đã cân nhắc

- **Chỉ đổi hạt giống (bỏ người dự thi khỏi phép băm):** đúng ý "cả Phiên thi một bộ", rất nhỏ, nhưng không có K mã đề, không lưu bộ câu, và không có chỗ gắn "mã đề" cho xuất Word và đối chiếu. Bị loại vì chủ dự án muốn linh hoạt nhất có thể.
- **Thay hẳn kiểu cũ:** đơn giản hơn nhưng mất khả năng mỗi người một bộ câu (chống chép bài); chủ dự án chọn giữ (Q464).

## 10. Việc để sau (backlog, đã ghi theo Q465b, Q474, Q475, Q476)

- Chia mã đề **theo Lớp**.
- **Thống kê so sánh độ khó** giữa các mã đề.
- **Câu bắt buộc luôn có** trong mọi mã đề (đánh dấu ở Bộ đề khi soạn).
- **Rút cân theo tag** (ví dụ theo mức nhận biết, thông hiểu, vận dụng).
- **Xáo riêng từng Phần** (ví dụ Phần tự luận không xáo).
- Xuất **đề đúng như từng Lượt đã nhận** khi `per_candidate` (cần mã đề dễ đọc cho từng người; hiện chưa có).

## 11. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Người dự thi cùng mã đề ngồi cạnh nhau có cùng tập câu, chống chép bài kém hơn kiểu mỗi người một bộ | Ghi rõ trong giao diện và hướng dẫn; chỉ còn khác thứ tự câu và phương án (đã xáo riêng); thi cần chống chép bài chặt thì dùng nhiều mã đề hoặc "mỗi người một đề" |
| Chia người lệch khi nhiều người vào cùng lúc | Gán mã đề trong giao dịch có khóa dòng; kiểm thử đồng thời |
| Đổi tỷ lệ làm đổi bộ câu sau khi Người ra đề đã xem | Hạt giống giữ nguyên nên tăng tỷ lệ chỉ **thêm** câu; "Rút lại" chỉ do Người ra đề chủ động |
| Điểm tối đa lệch giữa các mã đề | Chặn khi lưu (4.6) |

## 12. Điểm diễn giải thêm (chủ dự án đã duyệt cùng tài liệu ngày 23/11/2026)

1. **Khóa sau Lượt đầu tiên (Q467):** mình hiểu là khóa **số Mã đề, tỷ lệ, "Rút lại" và "Chia mã đề" hàng loạt**; còn **gán mã đề cho từng người chưa có Lượt** (người mới thêm, hoặc đổi tay một người chưa thi) **vẫn được**, vì không ảnh hưởng ai đã thi. Người đã có Lượt thì không đổi mã đề (Q468).
2. **Mặc định Phiên thi mới:** `shared` với 1 mã đề (theo Q463). Tỷ lệ rút kế thừa Bộ đề; Bộ đề không đặt tỷ lệ (100 %) thì mã đề gồm đủ mọi câu và Phiên thi chạy như trước.
3. **Nhân bản Phiên thi** rút mới, không sao chép danh sách chia người.
4. **Không lùi `0.3.x`** sau khi có Phiên thi `shared` đang chạy (mục 4.7).
