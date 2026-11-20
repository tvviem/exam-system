# Mảng kiến thức, tài liệu tham khảo và hồ sơ kiến thức của Người dự thi (thiết kế đề xuất)

Trạng thái: **proposed** (chờ chủ dự án duyệt; chưa có mã). Ngày đề xuất: 20/11/2026. Câu hỏi quyết định đánh số từ Q442.

**Phiên bản dự kiến:** `0.4.0` (MINOR) cho K1 đến K3, đặt sau "Rút câu theo Phần" (`0.3.0`). Chỉ thêm bảng mới, không đổi cột nào của bảng đã có dữ liệu (cùng lý do như [Rút câu theo Phần](rut-cau-theo-phan-thiet-ke.md)); quy tắc đánh số: [docs/ops/phat-hanh.md](../ops/phat-hanh.md).

## 1. Yêu cầu của chủ dự án

1. Mỗi Câu hỏi có thể thuộc một **mảng kiến thức**, kèm **ghi chú tài liệu tham khảo** dùng để biên soạn. Cả hai là **tùy chọn**, không bắt buộc.
2. Mục đích về sau: ghi nhận Người dự thi **hỏng kiến thức nào** (trả lời sai) và hệ thống **tự gợi ý lộ trình ôn tập**, để người dự thi biết mình đang thiếu phần nào và ngày càng hoàn thiện.
3. Xem xét thiết kế cơ sở dữ liệu hiện tại và đề xuất bổ sung, có cân nhắc hỗ trợ của trí tuệ nhân tạo (AI).

## 2. Hiện trạng cơ sở dữ liệu (đã đọc mã, 20/11/2026)

| Có sẵn | Đặc điểm | Dùng được cho mục đích này không |
|---|---|---|
| **Chủ đề** (`topics`) | Thuộc **một Người ra đề** (`owner_id`), tên duy nhất theo từng người; mỗi Câu hỏi **bắt buộc** thuộc đúng một Chủ đề; Chuyển giao khi người nghỉ việc | **Không.** Là "thư mục" để sắp xếp Ngân hàng của riêng từng người: hai giảng viên cùng dạy một Học phần có hai Chủ đề tên khác nhau, nên không cộng gộp được hồ sơ của Người dự thi qua nhiều Phiên thi, nhiều người ra đề |
| **Nhãn** (`questions.tags`, `text[]`, chỉ mục GIN) | Chữ tự do, không có danh mục chung | **Không đủ.** Gõ khác nhau ("Đạo hàm", "dao ham", "đạo hàm ") là khác nhau; không có cấu trúc cha con; không khóa theo bản chụp |
| **Bản chụp** (`exam_items.snapshot`) | Bất biến sau Phát hành (ADR-0005); không mang thông tin phân loại | Cần cách ghi **phân loại tại thời điểm Phát hành** để lịch sử không trôi khi Ngân hàng sửa về sau |
| **Kết luận từng câu** (`response_grades.verdict`, `score`) | Mỗi Lượt, mỗi câu đã có điểm và kết luận (đúng, đúng một phần, sai...), đã tính Đính chính và Phúc khảo | **Có.** Đây là nguồn dữ liệu "trả lời sai câu nào" |
| **Kết quả của tôi** | Người dự thi chỉ thấy kết quả của mình **sau Công bố**, không thấy Đáp án đúng | Là khuôn để làm hồ sơ kiến thức: cùng thời điểm Công bố, cùng nguyên tắc không lộ đáp án |
| **Học phần** | **Không phải thực thể** (chỉ là ô nhập khi xuất Bộ đề, [xuat-bo-de-thiet-ke.md](xuat-bo-de-thiet-ke.md) mục 4.2) | Chưa có "gốc" để gom các mảng kiến thức |
| Tiền lệ trong mã | Bảng `exam_item_illustrations` ghi **lúc Phát hành** những ảnh nào nằm trong bản chụp (Q176) | Mẫu để làm tương tự cho phân loại |

Kết luận: **hệ thống đã có dữ liệu "đúng hay sai từng câu của từng người" nhưng chưa có "câu đó thuộc kiến thức nào" ở dạng dùng chung, ổn định và gom được**. Phần thiếu là danh mục mảng kiến thức và cách gắn nó vào Câu hỏi và bản chụp.

## 3. Nguyên tắc thiết kế

1. **Tùy chọn hoàn toàn.** Câu hỏi không phân loại vẫn dùng bình thường ở mọi nơi; không phân loại thì chỉ không có mặt trong hồ sơ kiến thức.
2. **Chỉ thêm bảng mới**, không đổi cột bảng cũ (giữ MINOR, không rủi ro cho dữ liệu đang chạy).
3. **Bản chụp vẫn bất biến.** Phân loại được **sao vào bảng riêng lúc Phát hành** như đã làm với ảnh; sửa phân loại ở Ngân hàng về sau không làm đổi lịch sử của Phiên thi đã diễn ra.
4. **Không lộ đáp án và câu.** Hồ sơ và gợi ý chỉ nói **mảng nào, tỷ lệ đúng, tài liệu nào để ôn**; tuyệt đối không đưa nội dung câu hỏi hay đáp án đúng cho Người dự thi (giữ bất biến của hệ thống).
5. **Chỉ dùng dữ liệu đã Công bố** (cùng thời điểm với Kết quả của tôi), đã tính Đính chính và Phúc khảo.
6. **AI là phần hỗ trợ tùy chọn, không phải điều kiện.** Hệ thống phải chạy đủ chức năng chỉ bằng quy tắc xác định; AI chỉ làm việc nhanh hơn hoặc dễ đọc hơn, và không thấy dữ liệu cá nhân hay nội dung câu (mục 7).
7. **Hiệu năng:** theo [AGENTS.md](../../AGENTS.md), thao tác nào quá khoảng 300 ms là đáng xem lại; hồ sơ tính theo yêu cầu bằng một truy vấn có chỉ mục, chỉ lưu sẵn (bảng tổng hợp) khi đo thấy chậm.

## 4. Mô hình dữ liệu đề xuất

```sql
knowledge_areas (                          -- Danh mục mảng kiến thức, một cây theo Đơn vị
  id,
  unit_id → units,                          -- Khoa, Bộ môn: cùng Đơn vị dùng chung danh mục
  parent_id → knowledge_areas NULL,         -- cây tối đa 3 mức (kiểm ở service)
  name text, name_key text,                 -- name_key: bỏ dấu, thường (như topics)
  sort int,
  archived_at NULL,                         -- Lưu trữ thay vì xóa; nút cũ vẫn hiện trong hồ sơ cũ
  created_at, updated_at,
  UNIQUE (unit_id, parent_id, name_key) WHERE archived_at IS NULL
)

question_classifications (                 -- Phân loại của Câu hỏi trong Ngân hàng; không có dòng = chưa phân loại
  question_id PRIMARY KEY → questions,
  knowledge_area_id → knowledge_areas NULL,
  reference_note text NULL CHECK (char_length <= 500),  -- "Giáo trình Giải tích 1, chương 3, mục 3.2"
  updated_at,
  CHECK (knowledge_area_id IS NOT NULL OR reference_note IS NOT NULL)
)

exam_item_knowledge (                      -- Sao lúc Phát hành, bất biến như bản chụp
  item_id PRIMARY KEY → exam_items,
  knowledge_area_id → knowledge_areas NULL,
  reference_note text NULL
)
-- Trigger như exam_children_guard: Bộ đề đã Phát hành thì không sửa. Điền trong cùng giao dịch Phát hành.
```

Giải thích các lựa chọn:

- **Cây theo Đơn vị, không có thực thể Học phần riêng.** Nút gốc chính là Học phần (ví dụ "Giải tích 1"), nút con là chương, nút cháu là mảng kiến thức cụ thể ("Đạo hàm của hàm hợp"). Nhờ vậy các giảng viên cùng Khoa dùng chung một danh mục (cần để cộng gộp hồ sơ), và về sau nếu muốn lưu Học phần thành dữ liệu (mục T8 của [xuat-bo-de-thiet-ke.md](xuat-bo-de-thiet-ke.md) mục 16) thì đã có sẵn nút gốc.
- **Mỗi câu 0 hoặc 1 mảng chính** (khóa chính là `question_id`). Câu "tổng hợp" nhiều mảng là hiếm và làm hồ sơ khó diễn giải (câu sai tính cho mảng nào?). Muốn nhiều mảng sau này chỉ đổi khóa chính; không phải làm lại dữ liệu.
- **Ghi chú tài liệu tham khảo là văn bản tự do** (tối đa 500 ký tự), gắn vào câu, đủ cho yêu cầu hiện tại ("tên tài liệu tham khảo biên soạn"). Danh mục tài liệu dùng chung (nhiều câu cùng một tài liệu, có đường dẫn) là mở rộng về sau, không cần ngay.
- **Hai bảng cho Câu hỏi và cho bản chụp.** Đúng như tách `questions` và `exam_items.snapshot`: bảng thứ nhất sửa được, bảng thứ hai bất biến và là nguồn của hồ sơ.
- **Không đụng `questions`, `topics`, `exam_items`:** Chủ đề và Nhãn giữ nguyên vai trò sắp xếp riêng của từng người.

## 5. Hồ sơ kiến thức và gợi ý ôn tập (quy tắc xác định, không cần AI)

### 5.1 Hồ sơ của một Người dự thi

Với mỗi mảng kiến thức, gom từ mọi Lượt **đã Công bố** của người đó:

```sql
-- ý tưởng truy vấn (tính theo yêu cầu, không lưu sẵn)
SELECT eik.knowledge_area_id,
       SUM(rg.score)            AS earned,
       SUM(ei.points)           AS possible,
       COUNT(*)                 AS answered,
       MAX(rg.graded_at)        AS last_at
FROM response_grades rg
JOIN attempts a            ON a.id = rg.attempt_id   -- của người này, đã Công bố
JOIN exam_items ei         ON ei.id = rg.item_id
JOIN exam_item_knowledge eik ON eik.item_id = ei.id
GROUP BY eik.knowledge_area_id;
```

- **Mức nắm vững** = `(earned + 1) / (possible + 2)` (làm mượt kiểu Laplace): mảng mới có ít câu không bị coi là 0 % hay 100 % vì may rủi.
- **Đủ bằng chứng:** chỉ kết luận "yếu" khi mảng có từ **3 câu** trở lên (ngưỡng cấu hình); dưới ngưỡng ghi "chưa đủ dữ liệu".
- **Cộng dồn lên cây:** điểm của nút cha là tổng của các nút con, để thấy ở mức chương hay mức Học phần.
- Tính **theo yêu cầu bằng truy vấn trên** (một người, vài chục mảng, vài trăm dòng). Chưa cần bảng tổng hợp; thêm khi đo thấy quá 300 ms.

### 5.2 Gợi ý lộ trình ôn tập (quy tắc)

Xếp các mảng **đủ bằng chứng** theo mức cần ôn giảm dần:

`ưu tiên = (1 − mức nắm vững) × trọng số gần đây`, trong đó trọng số gần đây giảm theo thời gian kể từ lần làm gần nhất (kiến thức lâu không kiểm tra cần xem lại).

Mỗi gợi ý hiển thị: tên mảng (kèm chương cha), tỷ lệ đúng và số câu, lần làm gần nhất, và **các ghi chú tài liệu tham khảo** của chính các câu người đó đã làm sai trong mảng. Ví dụ:

> **Đạo hàm của hàm hợp** (Chương 3): đúng 40 % trên 10 câu, lần gần nhất 12/11. Nên ôn: Giáo trình Giải tích 1, chương 3, mục 3.2.

Lịch nhắc ôn lại theo khoảng cách tăng dần (3, 7, 14 ngày) là mở rộng ở bước sau (K4).

### 5.3 Điều Người dự thi không bao giờ thấy

Nội dung câu hỏi, đáp án đúng, hay câu cụ thể đã sai. Chỉ có tên mảng, phần trăm, số câu, ngày và ghi chú tài liệu của Người ra đề. Ghi chú tài liệu là chữ do Người ra đề soạn; Người ra đề cần biết rằng nó có thể hiện cho Người dự thi (hướng dẫn ở giao diện nhập).

## 6. Giao diện (tóm tắt, chi tiết ở từng PR)

- **Người ra đề, form Câu hỏi:** hai ô tùy chọn "Mảng kiến thức" (chọn từ cây, có ô tìm, gõ để thêm mới nếu chưa có) và "Tài liệu tham khảo" (một dòng). Nhập hàng loạt từ Excel có thêm hai cột tùy chọn cùng tên.
- **Người ra đề, quản lý danh mục:** màn cây mảng kiến thức theo Đơn vị (thêm, đổi tên, kéo vào nút khác, Lưu trữ).
- **Người dự thi, "Kiến thức của tôi"** (sau Công bố): danh sách mảng theo mức cần ôn, thanh tiến độ có chữ (không chỉ màu), gợi ý ôn kèm tài liệu.
- **Người ra đề, kết quả Phiên thi:** thêm khối "Lỗ hổng kiến thức của lớp" (tổng hợp theo mảng của cả Phiên thi, không nêu tên Người dự thi), cùng chỗ với Thống kê câu.

## 7. Vai trò của AI (đúng chỗ, có ranh giới)

Nguyên tắc: **AI chỉ ở ba chỗ, đều tùy chọn, đều có đường chạy không cần AI.**

| # | Chỗ dùng AI | Ai được lợi | Cách làm an toàn | Khi không có AI |
|---|---|---|---|---|
| A1 | **Gợi ý phân loại**: đọc đề bài của Câu hỏi và đề xuất mảng kiến thức và tài liệu từ danh mục sẵn có | Người ra đề có hàng trăm câu cần phân loại (nút nghẽn thật của tính năng này: dữ liệu thưa thì hồ sơ vô nghĩa) | Chỉ **đề xuất**, Người ra đề duyệt từng câu (người quyết); chỉ gửi nội dung câu của chính họ, không có thông tin người dùng; chọn trong danh mục có sẵn, không tự tạo mảng | Gõ tay, chọn theo Nhãn đang có, hoặc nhập từ Excel |
| A2 | **Diễn giải lộ trình ôn tập** bằng lời tự nhiên, thân thiện, theo mức nắm vững | Người dự thi | Chỉ gửi **tên mảng, tỷ lệ, số câu, ngày**; không gửi họ tên, mã, nội dung câu, đáp án; lưu đệm kết quả theo hồ sơ; có hạn mức và thời gian chờ | Dùng đúng câu mẫu ở mục 5.2 (đã đủ dùng) |
| A3 | **Gợi ý gom mảng trùng nhau** khi danh mục phình to (ví dụ "Đạo hàm" và "Phép đạo hàm") | Người quản lý danh mục | Chỉ đề xuất gộp, người duyệt | Rà tay |

Điều **không** làm: không để AI chấm điểm, không để AI quyết định ai "yếu", không sinh đề hay đáp án mới (rủi ro đáp án sai và lộ nội dung), không gửi dữ liệu cá nhân ra ngoài, không dùng dữ liệu của Trường để huấn luyện mô hình.

Về kiến trúc: tạo **cổng** (`QuestionClassifier`, `ReviewAdvisor`) khi có bộ cài đặt thứ hai. Bước đầu chỉ có bộ cài đặt theo quy tắc (không AI); khi thêm AI ở K5 thì thêm bộ cài đặt thứ hai sau cùng một cổng, bật bằng cấu hình, có hạn mức chi phí, thời gian chờ và ghi nhật ký (không ghi nội dung). Đúng nguyên tắc "một bộ cài đặt là cổng giả định, hai bộ mới là cổng thật" của skill `codebase-design`.

## 8. Quyền riêng tư và đạo đức

- Hồ sơ kiến thức là **dữ liệu cá nhân về năng lực học tập**: Người dự thi chỉ thấy **của chính mình**. Người ra đề chỉ thấy **tổng hợp theo Phiên thi của mình**, không thấy hồ sơ xuyên các Phiên thi của người khác. Quản trị viên không có màn xem hồ sơ cá nhân.
- **Không dùng để chấm điểm, xếp hạng hay phạt.** Hồ sơ chỉ để người học tự cải thiện; ghi rõ ở giao diện.
- Hồ sơ **không có bản lưu riêng** (tính theo yêu cầu từ các Lượt của người đó), nên không có thêm dữ liệu cá nhân nào cần dọn; người dùng đã Xóa thì không còn ai xem được hồ sơ của họ.
- Khuyến nghị: thông báo ngắn lúc vào thi rằng kết quả sẽ được dùng để gợi ý ôn tập cho chính người đó (minh bạch, như thông báo Rút câu Q390).

## 9. Liên hệ với các tính năng khác

- **Rút câu theo Phần** ([rut-cau-theo-phan-thiet-ke.md](rut-cau-theo-phan-thiet-ke.md)): mục backlog "rút theo Chủ đề" (Q394) nay có nền tốt hơn: **rút theo mảng kiến thức** (ví dụ mỗi người nhận đủ mọi mảng), thay vì theo Phần. Hàm `layoutOf` có rút hiện làm theo Phần; mở rộng về sau là thay đơn vị gom.
- **Thống kê câu hỏi** (backlog): độ khó theo mảng là bước tự nhiên.
- **Đính chính đáp án, Phúc khảo:** hồ sơ lấy `response_grades` đã có nên **tự khớp**, không cần xử lý riêng.
- **Xuất Bộ đề:** có thể in mảng kiến thức ở tệp Đáp án (tùy chọn, chưa cần).

## 10. Lộ trình đề xuất (PR nhỏ, TDD, mỗi PR một lát dọc)

| PR | Nội dung | Điểm kiểm thử (seam) |
|---|---|---|
| K1 | Danh mục `knowledge_areas`, `question_classifications`, `exam_item_knowledge`; API quản lý danh mục; chọn mảng và ghi chú ở form Câu hỏi; hai cột Excel tùy chọn; **sao vào `exam_item_knowledge` lúc Phát hành** | Tích hợp: cây (3 mức, tên không trùng, Lưu trữ); phân loại tùy chọn (câu không phân loại vẫn dùng như cũ); Phát hành sao đúng và bất biến; sửa phân loại sau Phát hành không đổi Bộ đề đã Phát hành; quyền theo Đơn vị |
| K2 | Hồ sơ kiến thức: hàm thuần tính mức nắm vững và xếp ưu tiên; truy vấn; API và màn "Kiến thức của tôi" (sau Công bố) | Hàm thuần theo tính chất (làm mượt, ngưỡng, cộng dồn cây, xếp thứ tự); tích hợp: chỉ dữ liệu đã Công bố, Đính chính đổi hồ sơ, không lộ nội dung câu hay đáp án (bài quét như tệp Đề); E2E desktop và mobile |
| K3 | Góc nhìn Người ra đề: "Lỗ hổng kiến thức của lớp" trong kết quả Phiên thi | Tích hợp: chỉ Phiên thi của mình, không có tên người; E2E |
| K4 | Ôn tập tự thân (chế độ ôn, lịch nhắc ôn 3, 7, 14 ngày) | Cần quyết riêng: Người dự thi hiện **không** có quyền vào Ngân hàng câu hỏi của Người ra đề (mục 11) |
| K5 | AI hỗ trợ: A1 gợi ý phân loại (trước), A2 diễn giải lộ trình, A3 gợi ý gộp mảng | Bộ cài đặt thứ hai sau cổng; kiểm: không gửi dữ liệu cá nhân, có thời gian chờ và hạn mức, không có AI vẫn chạy đủ |

Mỗi PR có kiểm đột biến. K1 đến K3 cùng thuộc `0.4.0`; tag đặt khi Người ra đề và Người dự thi dùng được thật và đã kiểm trên production.

## 11. Rủi ro và cách giảm

| Rủi ro | Hệ quả | Cách giảm |
|---|---|---|
| **Dữ liệu thưa** (phân loại tùy chọn nên nhiều câu bỏ trống) | Hồ sơ nghèo, gợi ý vô nghĩa | Hiện rõ "đã phân loại bao nhiêu % câu" ở hồ sơ; chỉ gợi ý khi đủ bằng chứng; Excel và A1 (AI) để giảm công phân loại |
| Mảng quá nhỏ, ít câu | Kết luận ngẫu nhiên | Ngưỡng 3 câu, làm mượt |
| Mỗi giảng viên đặt tên mảng một kiểu | Hồ sơ rời rạc | Danh mục chung theo Đơn vị, ô tìm khi chọn, Quản trị viên gộp và Lưu trữ |
| Người học áp lực hay bị so sánh | Tác dụng ngược | Chỉ thấy của mình, không xếp hạng, ngôn ngữ khích lệ |
| Rò rỉ nội dung qua gợi ý | Phá bất biến "đáp án chỉ ở server" | Gợi ý chỉ chứa tên mảng, tỷ lệ, ghi chú tài liệu; bài quét kiểm như ở tệp Đề |
| Chi phí và độ tin cậy của AI | Tốn tiền, sai | AI chỉ đề xuất và người duyệt; hạn mức; thời gian chờ; đường chạy không AI |
| Người dự thi chưa có chỗ thực hành (K4) | Gợi ý "ôn gì" mà không có chỗ làm | K2 và K3 chỉ chỉ ra **tài liệu để đọc** (đã có nhờ ghi chú tham khảo); K4 bàn riêng |

## 12. Câu cần chủ dự án quyết (vòng 1)

Mỗi câu kèm đề xuất; trả lời "đồng ý" là nhận đề xuất.

1. **Q442, danh mục:** một **cây theo Đơn vị**, tối đa 3 mức, nút gốc là Học phần, không thêm thực thể Học phần riêng? *(đề xuất: đồng ý)*
2. **Q443, số mảng mỗi câu:** **0 hoặc 1** mảng chính (mở rộng nhiều mảng sau nếu cần)? *(đề xuất: đồng ý)*
3. **Q444, tài liệu tham khảo:** **một dòng văn bản tự do** (tối đa 500 ký tự) gắn vào từng câu, tùy chọn; chưa làm danh mục tài liệu dùng chung? *(đề xuất: đồng ý)*
4. **Q445, ai tạo mảng:** Người ra đề tự thêm trong **Đơn vị của mình**; Quản trị viên được đổi tên, gộp, Lưu trữ? *(đề xuất: đồng ý)*
5. **Q446, bất biến:** sao phân loại vào `exam_item_knowledge` **lúc Phát hành**, bất biến như bản chụp? *(đề xuất: đồng ý)*
6. **Q447, quyền riêng tư:** hồ sơ chỉ tính từ kết quả **đã Công bố**; Người dự thi chỉ thấy hồ sơ của mình; Người ra đề chỉ thấy tổng hợp theo Phiên thi của mình, không tên người? *(đề xuất: đồng ý)*
7. **Q448, AI:** chỉ là hỗ trợ tùy chọn ở K5; làm **quy tắc xác định trước**, hệ thống chạy đủ không cần AI; AI không thấy dữ liệu cá nhân hay nội dung câu của người khác? *(đề xuất: đồng ý)*
8. **Q449, thứ tự làm:** sau **Rút câu theo Phần** (R2 đến R5 trước), bắt đầu bằng K1? *(đề xuất: đồng ý)*
9. **Q450, ngưỡng bằng chứng:** chỉ kết luận "cần ôn" khi mảng có từ **3 câu** đã làm (cấu hình được)? *(đề xuất: đồng ý)*

## 13. Ngoài phạm vi (lát này)

Không sinh câu hỏi hay đáp án bằng AI; không chế độ ôn tập tự thân (K4, cần quyết riêng); không danh mục tài liệu dùng chung; không nhiều mảng cho một câu; không xếp hạng hay so sánh giữa Người dự thi; không đổi cách chấm; không đổi Chủ đề và Nhãn hiện có.
