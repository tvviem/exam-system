# Lát cắt 3: Bộ đề

> Trạng thái: **proposed** (1/11/2026), chờ chủ dự án duyệt Q159–Q191 và các seam test. Làm theo [GLOSSARY.md](../../GLOSSARY.md) mục Bộ đề và Phiên thi, [data-model.md](../data-model.md) mục 3, [architecture.md](../architecture.md) mục 3, 6 và 12, [ADR-0005](../adr/0005-chup-noi-dung-khi-phat-hanh.md) và [ui-design.md](../ui-design.md). Quyết định đánh số tiếp từ Q159 ([lát cắt 2](slice-2.md) dừng ở Q158). Mỗi quyết định nêu lý do ngắn, phương án đã loại và điều cần kiểm.

## Mục tiêu

Sau lát cắt 3, Người ra đề:
- Soạn Bộ đề từ ngân hàng Câu hỏi của mình: chia Phần, sắp thứ tự, đặt điểm từng câu hoặc đặt nhanh theo nhóm.
- Xem thử Bộ đề đúng như Người dự thi thấy (không có Đáp án).
- **Phát hành**: nội dung được chụp vào `exam_items.snapshot` (ADR-0005), từ đó sửa hay Lưu trữ Câu hỏi không đổi Bộ đề đã Phát hành.
- Nhân bản, Lưu trữ Bộ đề; Lưu trữ Câu hỏi đã dùng (hứa ở Q117).
- Chuyển giao và Xóa người dùng mang theo cả Bộ đề (phần còn lại của Q124 và Q125).

Chưa có Phiên thi, Lượt làm bài, đồng hồ, chấm điểm: đó là lát cắt 4 và 5. Bất biến vẫn giữ: Đáp án đúng chỉ ở server, Lượt làm bài, Chấm và Phúc khảo chỉ đọc `exam_items.snapshot`.

## Chia PR

```text
3a Bộ đề nháp: bảng, CRUD, trình soạn (Phần, thêm/gỡ/sắp xếp câu, điểm tay), danh sách, mục "Bộ đề" ở menu
 ├──► 3b Đặt điểm nhanh + Xem thử (hàm thuần của shared; làm sạch Đáp án)
 └──► 3c Phát hành + bản chụp + Lưu trữ Câu hỏi + Nhân bản/Lưu trữ/Khôi phục Bộ đề + quyền xem ảnh theo Bộ đề
        └──► 3d Chuyển giao Chủ đề và Xóa người dùng mang theo Bộ đề
```

| PR | Đưa vào dùng được |
|---|---|
| 3a | Người ra đề soạn và lưu Bộ đề nháp từ ngân hàng Câu hỏi |
| 3b | Đặt điểm hàng loạt; xem thử toàn bộ Bộ đề như Người dự thi |
| 3c | Phát hành Bộ đề, Lưu trữ Câu hỏi đã dùng, vòng đời Bộ đề |
| 3d | Đổi người không làm mất hay kẹt Bộ đề |

## Mô hình và vòng đời

### Bộ đề, Phần, câu (Q160–Q165)

```text
draft ──Phát hành──► published ◄──Khôi phục──┐
  │                      │                    │
  └─Xóa hẳn              └──Lưu trữ──► archived ┘      (không có đường từ published về draft)
```

- **Q159 Chia 4 PR** như sơ đồ trên. Xem thử qua Phiên thi (tương tác, đồng hồ) lùi sang lát cắt 4; lát cắt 3 chỉ có Xem thử Bộ đề dạng chỉ đọc. *Loại:* gộp 3a–3c thành một PR (quá lớn để duyệt); đưa Chuyển giao vào 3c (làm 3d sau khi vòng đời Bộ đề đã ổn định).
- **Q160 Bộ đề và vòng đời.**
  - Trường: `title` (1–200 ký tự, không bắt buộc duy nhất, vì Nhân bản sinh tên gần giống), `instructions` (Q165), `status`, `version` (khóa lạc quan, Q163), `published_at`, `archived_at`.
  - Chỉ Bộ đề `draft` sửa được; ghi vào Bộ đề khác nháp trả `INVALID_STATE` với `reason: EXAM_NOT_DRAFT`.
  - **Không có "hủy Phát hành"**: sai sót nhỏ thì Nhân bản thành nháp mới (Q177); sai Đáp án sau khi đã thi thì có Đính chính đáp án (lát cắt 5). *Loại:* mở lại về nháp khi chưa có Phiên thi, vì để làm đúng phải biết Phiên thi đã tồn tại ở lát cắt 4 và tạo hai đường sửa cho cùng một việc.
  - Kiểm: mọi thao tác ghi bị từ chối ở trạng thái khác `draft`; chuyển trạng thái đúng sơ đồ, đường khác là `INVALID_STATE`.
- **Q161 Phần và giới hạn.**
  - Bộ đề luôn có ít nhất một Phần. Bộ đề không chia Phần có đúng một Phần mặc định không tiêu đề; giao diện ẩn khối Phần cho tới khi bấm "Chia Phần" (đúng GLOSSARY).
  - Tối đa **20 Phần** và **200 câu** mỗi Bộ đề (đủ cho đề thi thật; chặn payload và bản chụp phình). Tiêu đề Phần ≤ 200 ký tự, tùy chọn; hướng dẫn Phần theo Q165.
  - **Bỏ cột `exam_sections.shuffle_items`** khỏi data-model: kiến trúc đã chốt "danh sách câu cố định" ở Bộ đề, còn xáo trộn là thiết lập của Phiên thi (`sessions.shuffle_items`, lát cắt 4). Cột này chỉ làm hai nơi cùng quyết định một việc. Nếu lát cắt 4 cần xáo theo Phần thì thêm cột lúc đó.
  - Kiểm: vượt giới hạn là `VALIDATION_FAILED`.
- **Q162 Câu trong Bộ đề.**
  - Chỉ chọn Câu hỏi của chính mình và **chưa Lưu trữ**; mỗi câu xuất hiện một lần trong một Bộ đề (`UNIQUE (exam_id, question_id)`, đúng data-model).
  - Thứ tự toàn Bộ đề là thứ tự Phần rồi thứ tự trong Phần. `exam_items.points` khởi tạo bằng `default_points` của câu lúc thêm; từ đó độc lập (sửa điểm mặc định của câu không đổi Bộ đề).
  - Câu của người khác hoặc không tồn tại: `VALIDATION_FAILED` với `questionId: unknown_question` (không lộ câu đó có thật).
  - Kiểm: tích hợp với hai Người ra đề.
- **Q163 Mô hình soạn: lưu cả tài liệu một lần.**
  - `PUT /api/exams/:id` nhận `{ title, instructions, version, sections: [{ id?, title, instructions, items: [{ questionId, points }] }] }` và thay toàn bộ nội dung bản nháp trong một giao dịch; `version` lệch trả `CONFLICT` với `reason: version` (như Câu hỏi). Phần có `id` thì giữ, không có thì tạo mới; Phần vắng mặt bị xóa cùng câu trong nó.
  - Giao diện giữ bản nháp trên màn hình, có nút Lưu và hộp hỏi "chưa lưu" khi rời trang (cùng mẫu trình soạn Câu hỏi, đã sửa lỗi baseline ở PR #21: mốc "đã lưu" là bản vừa gửi).
  - *Loại:* mỗi thao tác một request (thêm, xóa, đổi thứ tự, đổi điểm). Nhiều round-trip trên mạng yếu, khó hoàn tác, và đổi thứ tự 100 câu thành 100 request.
  - Kiểm: lưu hai lần liên tiếp với cùng `version` thì lần hai `CONFLICT`; mất kết nối giữa chừng không để lại Bộ đề nửa vời (giao dịch).
- **Q164 Sắp xếp bằng nút, không chỉ kéo thả.** Mỗi câu có "Lên", "Xuống", "Chuyển sang Phần…"; mỗi Phần có "Lên", "Xuống" (WCAG 2.2: phải có thao tác một con trỏ thay cho kéo, kết quả tìm của ui-ux-pro-max cho "drag drop reorder"). Kéo thả là cải tiến sau, ngoài lát cắt.
- **Q165 Hướng dẫn Bộ đề và Phần.** Nội dung có định dạng theo schema chung (đoạn, đậm, nghiêng, danh sách, công thức; **không** có ảnh), ≤ 5.000 ký tự chữ. Tái dùng `richTextSchema` với phép kiểm không ảnh, không viết schema mới. Hiển thị cho Người dự thi ở đầu Bộ đề và đầu Phần (lát cắt 4).

### Bộ đề nháp và ngân hàng Câu hỏi (Q166)

- **Q166 Nháp tham chiếu bản hiện tại của Câu hỏi** (đúng Q116). Hệ quả đã chốt:
  - Sửa Câu hỏi: nháp thấy bản mới ngay (đó là ý nghĩa của "chưa Phát hành"); trình soạn Câu hỏi hiện "Đang dùng trong N Bộ đề nháp (đổi theo) và M Bộ đề đã Phát hành (không đổi)" (Q175).
  - **Xóa Câu hỏi đang nằm trong một Bộ đề nháp bị chặn**: `INVALID_STATE` với `reason: QUESTION_IN_EXAM` kèm tên các Bộ đề nháp; xóa nhiều câu thì cả lô bị từ chối và nêu các câu vướng. *Loại:* tự gỡ câu khỏi nháp khi xóa (im lặng làm mất nội dung nháp của người khác trong tab khác); xóa kèm hộp xác nhận liệt kê (tốt hơn nhưng làm xóa hàng loạt phức tạp, để sau nếu cần).
  - Lưu trữ Câu hỏi nằm trong nháp thì được phép; câu vẫn ở nháp nhưng **Phát hành bị chặn** (Q171) cho tới khi gỡ câu hoặc Khôi phục.

## Điểm

- **Q167 Điểm câu trong Bộ đề.** 0,05–100, bước 0,05 (Q154), dùng chung `POINTS_MIN/STEP/MAX`. Tổng điểm là tổng điểm các câu, hiện luôn ở thanh dưới; không giới hạn tổng (quy đổi thang 10 hay 100 là việc của Kết quả, lát cắt 5).
- **Q168 Đặt điểm nhanh** (data-model đã nêu: thao tác giao diện, không thêm bảng).
  - Hàm thuần `distributePoints` trong `@exam/shared`; tính bằng **đơn vị nguyên 0,05** để không dính sai số số thực.
  - Phạm vi: cả Bộ đề, một Phần, một Loại câu hỏi, hoặc các câu đang tick. Cách đặt: (a) mỗi câu `P` điểm; (b) **chia đều tổng `T`**: `U = T/0,05` phải nguyên, `base = ⌊U/n⌋`, phần dư `r = U mod n` cộng thêm một đơn vị cho `r` câu đầu theo thứ tự; lỗi nếu `T` không là bội 0,05 hoặc `base < 1`.
  - Hộp thoại xem trước điểm mới và tổng, bấm Áp dụng mới ghi vào bản nháp trên màn hình; lưu bằng Lưu như mọi thay đổi khác.
  - Kiểm (unit): tổng luôn đúng bằng `T`; không câu nào dưới 0,05; chênh lệch giữa hai câu không quá 0,05; thứ tự ổn định; ca biên (`n = 1`, `T = n × 0,05`, `T` lẻ).

## Xem thử

- **Q169 Xem thử Bộ đề (chỉ đọc).**
  - Trang tab "Xem thử" cạnh "Soạn": hiện tiêu đề, hướng dẫn, từng Phần, đánh số câu, Phương án hoặc Mệnh đề, điểm từng câu, tổng điểm, **không có Đáp án**, đúng như Người dự thi sẽ thấy. Bộ đề nháp lấy nội dung hiện tại của Câu hỏi, Bộ đề đã Phát hành lấy `snapshot`.
  - Dữ liệu qua `GET /api/exams/:id/preview`, **server làm sạch** (Q170); không dùng lại API chi tiết Câu hỏi (có Đáp án).
  - Xem thử tương tác (làm thử như Người dự thi, đồng hồ, không lưu) là "Xem thử qua Phiên thi" của GLOSSARY, thuộc lát cắt 4. Hai thứ cùng tên "Xem thử" nên GLOSSARY giữ một định nghĩa; tài liệu ghi rõ lát cắt 3 chỉ làm phần dựng nội dung.
- **Q170 `candidateViewOf`: làm sạch bằng danh sách cho phép.**
  - Hàm thuần trong `@exam/shared`, **xây mới** đối tượng chỉ từ các trường được liệt kê, không "xóa trường khóa" khỏi bản gốc. Vì thế thêm trường mới vào `payload` sau này không vô tình lộ ra.
  - Giữ: Phần dẫn, Phương án (id, nội dung), Mệnh đề (id, nội dung), `shuffleOptions`, `maxLength`, `scoringRule` và `ladder` (giải thích cách tính điểm, không tiết lộ Đáp án), ảnh. Bỏ: `key` của mọi Loại, `rubric`.
  - Kiểm (bất biến "Đáp án đúng không có trong response gửi Người dự thi"): unit cho cả 4 Loại; test tích hợp quét toàn bộ JSON của `/preview` và khẳng định không chứa khóa Đáp án; đây cũng là hàm lát cắt 4 dùng cho API làm bài.

## Phát hành và bản chụp

- **Q171 Kiểm tra trước khi Phát hành.**
  - `GET /api/exams/:id/publish-check` trả danh sách vấn đề `[{ code, itemId?, sectionId? }]`; `POST /api/exams/:id/publish` chạy lại cùng phép kiểm **trong giao dịch có khóa dòng Bộ đề**, vì vậy phép kiểm trước chỉ để hiện cho người dùng, không phải nguồn sự thật.
  - Mã: `title_missing`, `empty_exam` (không có câu), `empty_section` (Phần không có câu, không tự xóa), `question_missing`, `question_archived`, `question_invalid` (chạy lại `questionInputSchema` trên nội dung hiện tại), `illustration_not_ready` (ảnh còn xử lý hoặc lỗi), `points_invalid`.
  - Phát hành đòi bản nháp đã lưu (`version` khớp): giao diện khóa nút khi còn thay đổi chưa lưu.
  - Kiểm: mỗi mã có một test; Phát hành khi có vấn đề trả `INVALID_STATE` với `reason: PUBLISH_BLOCKED` kèm danh sách.
- **Q172 Bản chụp.**
  - Một giao dịch, đồng bộ (không job, tối đa 200 câu): với mỗi `exam_items` ghi `snapshot = { questionId, questionVersion, type, stem, payload, illustrations: [{ id, width, height, variants }] }` rồi đặt `status = published`, `published_at`. Điểm nằm ở `exam_items.points`, không lặp trong bản chụp. `payload` có Đáp án đúng, `scoringRule`, `ladder`, `shuffleOptions` (ADR-0005).
  - **Ngăn sửa ở tầng cơ sở dữ liệu**: trigger từ chối `UPDATE` và `DELETE` trên `exam_items`, `exam_sections` và `exams` (trừ chuyển trạng thái, `archived_at` và `owner_id`) khi Bộ đề không còn `draft`. Service đã chặn trước; trigger là lớp thứ hai cho bất biến lõi của hệ thống (chấm điểm chỉ tin bản chụp). *Loại:* chỉ dựa vào service.
  - Kiểm: tích hợp ghi trực tiếp bằng SQL vào Bộ đề đã Phát hành bị từ chối; sửa Câu hỏi sau Phát hành không đổi `snapshot`; hai lần Phát hành đồng thời chỉ một lần thành công.
- **Q173 Sửa lỗi sau Phát hành** (Q160): Nhân bản.
- **Q174 Dùng và Lưu trữ Câu hỏi (hoàn thành Q117).**
  - Cổng `ExamUsage` trong `src/common` (như `OwnedContent`, Q150), module `exam` cài đặt, nối ở cấp ứng dụng: `questionUsage(questionIds)` → với mỗi câu: các Bộ đề nháp chứa nó (id, tên) và số Bộ đề đã Phát hành hoặc Lưu trữ chứa nó; `illustrationUsage(illustrationIds)` (Q176). `question-bank` không import `exam`.
  - Quy tắc: câu còn trong Bộ đề nháp thì không xóa (Q166); câu có trong Bộ đề đã Phát hành hoặc Lưu trữ thì **chỉ Lưu trữ** (`questions.archived_at`, cột đã có từ PR 2a); còn lại xóa hẳn như hiện nay.
  - Giao diện: nút "Lưu trữ" thay "Xóa" cho câu đã dùng (hàng loạt như Xóa); bộ lọc "Đã lưu trữ" và **Khôi phục**; câu đã Lưu trữ mặc định ẩn khỏi danh sách và bảng chọn câu của Bộ đề.
  - Kiểm: tích hợp cho từng nhánh (xóa được, bị chặn bởi nháp, chỉ Lưu trữ vì đã Phát hành); Lưu trữ rồi Khôi phục; Bộ đề đã Phát hành không đổi khi Lưu trữ câu.
- **Q175 Cảnh báo khi sửa Câu hỏi đang dùng.** `GET /api/questions/:id` trả thêm `usage: { draftExams: [{ id, title }], publishedCount }`; trình soạn hiện một dòng thông tin ở đầu trang. Chỉ báo, không chặn (Q116).
- **Q176 Ảnh của Bộ đề đã Phát hành.**
  - Bảng `exam_item_illustrations (exam_item_id, illustration_id)` ghi lúc Phát hành (suy từ bản chụp), giống `question_illustrations`; ảnh có dòng ở đây **không xóa được** và được tính vào `inUse`.
  - **Quyền xem ảnh** (`GET /api/media/:id/:side`): chủ ảnh, hoặc chủ của một Bộ đề dùng ảnh đó (để Bộ đề đã Phát hành xem lại được sau Chuyển giao Câu hỏi). Người dự thi xem ảnh qua Phiên thi: lát cắt 4.
  - **Chuyển giao Chủ đề** (Q149): ảnh nào còn được một Bộ đề đã Phát hành của người cho dùng thì coi như "còn dùng chung với phần ở lại", tức **sao chép** cho người nhận thay vì đổi chủ, để ảnh của bản chụp luôn nằm với chủ Bộ đề. Kiểm: tích hợp thêm ca này vào bộ test Chuyển giao.

## Vòng đời Bộ đề

- **Q177 Nhân bản.** Bộ đề ở trạng thái nào cũng nhân bản thành **nháp mới** của cùng chủ: sao chép Phần, thứ tự, điểm; câu lấy theo **bản hiện tại** của ngân hàng (không lấy từ bản chụp, vì nháp là để sửa tiếp), tên thêm " (bản sao)" cắt ở 200 ký tự. Câu đã Lưu trữ vẫn vào bản sao nhưng sẽ chặn Phát hành (Q171).
- **Q178 Xóa Bộ đề.** Nháp: xóa hẳn có xác nhận. **Đã Phát hành hoặc Lưu trữ: không xóa** ở lát cắt 3; lát cắt 4 xét lại khi biết Bộ đề nào đã có Phiên thi. *Loại:* cho xóa Bộ đề đã Phát hành chưa có Phiên thi: có ích cho dữ liệu thử nhưng mở cửa mất dấu "đã từng dùng" của Câu hỏi.
- **Q179 Lưu trữ và Khôi phục Bộ đề.** `published ↔ archived`: Bộ đề Lưu trữ không còn chọn được cho Phiên thi mới (lát cắt 4), vẫn xem và nhân bản được, không sửa; Khôi phục đưa về `published`. Nháp không Lưu trữ (xóa).
- **Q180 Danh sách Bộ đề.** Lọc theo trạng thái (mặc định Nháp và Đã phát hành), tìm theo tên không dấu (như Q69/Q118), cột: tên, trạng thái, số câu, tổng điểm, cập nhật lần cuối; 20 mỗi trang; thẻ dưới 768 px.

## Quyền và đổi người

- **Q181 Quyền.** `@RequireTag('examiner')`; mọi truy cập lọc theo `owner_id`, của người khác là `NOT_FOUND`; Quản trị viên không đọc Bộ đề (như Q113, chỉ thấy số liệu để Chuyển giao). Ràng buộc `questions.owner_id = exams.owner_id` kiểm ở service lúc lưu và Phát hành (data-model đề xuất thêm trigger; bản chụp làm trigger này không còn quan trọng sau Phát hành, nên lát cắt 3 chỉ kiểm ở service để không trùng).
- **Q182 Chuyển giao Chủ đề mang theo Bộ đề nháp (3d)** (phần còn lại của Q124).
  - Bộ đề nháp có chứa câu thuộc Chủ đề được chuyển **chuyển cả Bộ đề** cho người nhận; các câu **không** thuộc Chủ đề được chuyển bị gỡ khỏi Bộ đề đó (vì người nhận không sở hữu chúng và ràng buộc sở hữu của Q181). Phần thành rỗng thì giữ nguyên (người nhận tự xử lý).
  - Hộp thoại xác nhận nêu trước: "P Bộ đề nháp sẽ chuyển, G câu sẽ bị gỡ" (số liệu từ `summaryOf`). Đây là điểm đánh đổi: người cho mất các câu còn lại của nháp, nên phải nói trước.
  - Bộ đề đã Phát hành hoặc Lưu trữ **ở lại người cho** (độc lập nhờ bản chụp) cho tới khi Xóa người dùng.
  - *Loại:* chặn Chuyển giao khi có nháp trộn (gây kẹt: Quản trị viên không đọc được nháp để gỡ giúp); chuyển nháp nguyên vẹn kèm mọi câu (phá ràng buộc sở hữu).
- **Q183 Xóa người dùng mang theo mọi Bộ đề (3d)** (Q125).
  - Mọi Bộ đề (nháp, đã Phát hành, Lưu trữ) đổi sang người nhận trong cùng giao dịch Chuyển giao và Xóa. Câu của nháp đều thuộc người cho nên đều đã được chuyển cùng Chủ đề, không còn câu bị gỡ.
  - Cổng `OwnedContent` (Q150) thành **danh sách nhà cung cấp** do `OwnedContentWiringModule` ghép: `question-bank` chạy trước, rồi `exam` (đọc quyền sở hữu Câu hỏi vừa đổi trong cùng giao dịch để biết nháp nào chuyển). `summaryOf` gộp thêm số Bộ đề; `prepareTransfer`, `apply`, `finish` gọi lần lượt.
  - Kiểm: tích hợp với người cho có nháp trộn, nháp thuần, Bộ đề đã Phát hành, Bộ đề Lưu trữ; Xóa kèm người nhận; giao dịch lỗi thì không đổi gì (mở rộng bộ test 2f).
- **Q184 Thông báo.** `topics.transferred` có thêm `exams` (số Bộ đề); lời nhắn: "Quản trị viên đã chuyển giao N Chủ đề và P Bộ đề cho bạn" khi P > 0.

## Giao diện

- **Q185 Điều hướng và trang soạn** (ui-ux-pro-max: thao tác thay thế cho kéo thả ở Q164; phản hồi sau lưu).
  - Menu Người ra đề: Ngân hàng câu hỏi, **Bộ đề**, Yêu cầu cấp tài khoản (đúng thứ tự tần suất của ui-design; mục thứ 4 trở đi dồn vào "Khác"). Đường dẫn `/examiner/exams` và `/examiner/exams/$examId`.
  - Trang soạn (tuyến rộng như trình soạn Câu hỏi, Q107): tiêu đề và hướng dẫn ở đầu; mỗi Phần là một khối thu gọn được; mỗi câu là một hàng (thẻ trên điện thoại): số thứ tự, trích Phần dẫn, Loại, Chủ đề, ô điểm (`inputmode="decimal"`), Lên/Xuống/Chuyển Phần/Gỡ. Thanh dưới dính: số câu, tổng điểm, "Đặt điểm nhanh", Lưu, "Phát hành…". Tab "Soạn" và "Xem thử".
  - Bộ đề đã Phát hành mở ở chế độ chỉ đọc kèm huy hiệu và thao tác Nhân bản, Lưu trữ.
- **Q186 Chọn câu từ ngân hàng.** Hộp thoại (toàn màn hình trên điện thoại) dùng cùng bộ lọc và ô tìm của danh sách Câu hỏi (Chủ đề, Loại, tag, từ khóa); tick nhiều, nút "Thêm N câu vào <Phần>"; câu đã có trong Bộ đề hiện "Đã có" và không tick được; câu Lưu trữ không hiện; thêm tối đa số chỗ còn lại (≤ 200 câu).
- **Q187 Hộp thoại Phát hành.** Mở bằng "Phát hành…": chạy `publish-check`; có vấn đề thì liệt kê, mỗi dòng dẫn tới câu hay Phần đó; không vấn đề thì hiện tên, số câu, tổng điểm và dòng cảnh báo "Sau khi Phát hành không sửa được Bộ đề này; muốn đổi hãy Nhân bản". Xác nhận gọi `POST /publish`; thành công thì toast và chuyển sang chế độ chỉ đọc.

## Kiểm thử và thuật ngữ

- **Q188 Seam test** (cần chủ dự án xác nhận trước khi viết test).
  - *Unit (không DB):* `distributePoints` (Q168); `candidateViewOf` cho 4 Loại và với trường lạ (Q170); xây `snapshot` từ Câu hỏi (Q172); kiểm bố cục Bộ đề (giới hạn, trùng câu, Phần rỗng; Q161–Q163); tên Nhân bản (Q177).
  - *Tích hợp (HTTP + PostgreSQL + Redis; `MediaStore` thư mục tạm):*
    - 3a: CRUD, `PUT` toàn tài liệu và xung đột `version`, câu của người khác, giới hạn, quyền chủ sở hữu, Quản trị viên `403`.
    - 3b: `/preview` không chứa Đáp án (quét JSON).
    - 3c: từng mã `publish-check`, Phát hành nguyên tử và đồng thời, trigger chặn ghi SQL trực tiếp, sửa Câu hỏi sau Phát hành không đổi bản chụp, xóa hay Lưu trữ Câu hỏi theo từng nhánh, `usage`, ảnh không xóa được, quyền xem ảnh theo Bộ đề, Nhân bản, Lưu trữ và Khôi phục.
    - 3d: Chuyển giao và Xóa với nháp trộn, nháp thuần, Bộ đề đã Phát hành, ảnh của Bộ đề khi Chuyển giao (sao chép), thông báo.
  - *E2E (desktop và mobile, kiểm không cuộn ngang):* tạo Bộ đề từ ngân hàng, chia Phần, sắp xếp bằng nút, đặt điểm nhanh, xem thử, rời trang khi chưa lưu, Phát hành (kể cả bị chặn vì câu Lưu trữ), sửa câu sau Phát hành rồi xem thử thấy bản cũ, Nhân bản, Lưu trữ; Quản trị viên Chuyển giao và Xóa người dùng có Bộ đề.
- **Q189 Thuật ngữ cần đồng ý để thêm vào GLOSSARY.** **Bản chụp** (`Snapshot`: ADR-0005 đã dùng, GLOSSARY chưa có); **Đặt điểm nhanh** (data-model đã dùng, GLOSSARY chưa có); **Lưu trữ Bộ đề** (mở rộng "Lưu trữ" của Câu hỏi: ẩn khỏi lựa chọn mới nhưng giữ để xem và nhân bản). Không đặt thêm thuật ngữ "hủy Phát hành" vì không có thao tác đó (Q160).
- **Q190 Dữ liệu** (đề xuất đổi data-model mục 3 khi được duyệt).

```sql
exams (
  id, owner_id → users, title, instructions jsonb NULL,
  status enum('draft','published','archived'),
  version int DEFAULT 1,                      -- khóa lạc quan của PUT (Q163)
  published_at, archived_at
)
exam_sections (                               -- bỏ shuffle_items (Q161)
  id, exam_id → exams ON DELETE CASCADE, title NULL, instructions jsonb NULL, sort int
)
exam_items (
  id, exam_id → exams ON DELETE CASCADE, section_id → exam_sections ON DELETE CASCADE,
  question_id → questions ON DELETE RESTRICT, points numeric(6,2), sort int,
  snapshot jsonb NULL,
  UNIQUE (exam_id, question_id)
)
exam_item_illustrations (                     -- ghi lúc Phát hành (Q176)
  exam_item_id → exam_items ON DELETE CASCADE, illustration_id → illustrations,
  PK (exam_item_id, illustration_id)
)
-- Trigger chặn sửa và xóa exam_items, exam_sections, exams khi exams.status <> 'draft' (Q172)
```

  Migration: 3a (`exams`, `exam_sections`, `exam_items`), 3c (`exam_item_illustrations` và các trigger). Không đổi bảng của lát cắt 2 ngoài việc dùng `questions.archived_at` đã có.
- **Q191 Ngoài phạm vi lát cắt 3.** Xem thử qua Phiên thi, Phiên thi và Lượt làm bài (lát cắt 4); Chuyển giao Phiên thi (lát cắt 4); xáo trộn theo Phần; kéo thả; xóa Bộ đề đã Phát hành (xét lại ở lát cắt 4); nhập Bộ đề từ file; rút ngẫu nhiên câu theo Chủ đề và thống kê câu hỏi (backlog, architecture.md mục 12).

## Quyết định cần chủ dự án cân nhắc kỹ

Các điểm tôi đã chọn một hướng nhưng có phương án hợp lý khác:

| Điểm | Đề xuất | Phương án khác |
|---|---|---|
| Q160 Hủy Phát hành | Không có; sửa bằng Nhân bản | Cho mở lại về nháp khi chưa có Phiên thi |
| Q161 Cột `shuffle_items` của Phần | Bỏ, xáo trộn là của Phiên thi | Giữ cột, mặc định tắt |
| Q166 Xóa câu đang ở nháp | Chặn, nêu tên Bộ đề | Tự gỡ khỏi nháp sau xác nhận |
| Q170 Người dự thi thấy `scoringRule` và `ladder` | Thấy (giải thích cách tính điểm) | Ẩn hoàn toàn, chỉ hiện điểm tối đa |
| Q172 Trigger chặn ghi | Có, lớp thứ hai ngoài service | Chỉ service |
| Q178 Xóa Bộ đề đã Phát hành | Không xóa, chỉ Lưu trữ | Cho xóa khi chưa có Phiên thi |
| Q182 Nháp trộn khi Chuyển giao | Chuyển nháp, gỡ các câu không chuyển, nói trước | Chặn Chuyển giao |

## Quyết định (Q159–Q191, đề xuất)

| Q | Nội dung |
|---|---|
| Q159 | Chia 4 PR 3a–3d; Xem thử qua Phiên thi lùi sang lát cắt 4 |
| Q160 | Vòng đời `draft → published ↔ archived`; chỉ nháp sửa được; không hủy Phát hành |
| Q161 | Luôn có ≥ 1 Phần; ≤ 20 Phần, ≤ 200 câu; bỏ `exam_sections.shuffle_items` |
| Q162 | Chỉ câu của mình, chưa Lưu trữ, mỗi câu một lần; điểm khởi tạo = điểm mặc định |
| Q163 | `PUT` cả tài liệu một giao dịch, khóa lạc quan `version`, hộp hỏi chưa lưu |
| Q164 | Sắp xếp bằng nút Lên/Xuống/Chuyển Phần, không chỉ kéo thả |
| Q165 | Hướng dẫn Bộ đề và Phần là nội dung có định dạng không ảnh, ≤ 5.000 ký tự |
| Q166 | Nháp tham chiếu bản hiện tại; xóa câu đang ở nháp bị chặn; Lưu trữ cho phép nhưng chặn Phát hành |
| Q167 | Điểm 0,05–100 bước 0,05; tổng điểm không giới hạn |
| Q168 | Đặt điểm nhanh: hàm thuần theo đơn vị 0,05, phạm vi × cách đặt, chia đều có phần dư, xem trước |
| Q169 | Xem thử Bộ đề chỉ đọc qua `/preview` do server làm sạch |
| Q170 | `candidateViewOf` xây bằng danh sách cho phép; bỏ `key` và `rubric`; test quét JSON |
| Q171 | `publish-check` và `publish` chạy cùng phép kiểm trong giao dịch khóa dòng; 8 mã vấn đề |
| Q172 | Bản chụp một giao dịch đồng bộ; trigger chặn ghi khi không còn nháp |
| Q173 | Sửa lỗi sau Phát hành bằng Nhân bản |
| Q174 | Cổng `ExamUsage`; xóa, chỉ Lưu trữ hay chặn theo nơi dùng; Khôi phục câu |
| Q175 | Trình soạn Câu hỏi hiện số Bộ đề đang dùng (chỉ báo) |
| Q176 | `exam_item_illustrations`; ảnh không xóa được; quyền xem ảnh cho chủ Bộ đề; Chuyển giao sao chép ảnh còn được Bộ đề đã Phát hành dùng |
| Q177 | Nhân bản thành nháp mới, lấy câu theo bản hiện tại |
| Q178 | Chỉ xóa Bộ đề nháp |
| Q179 | Lưu trữ và Khôi phục Bộ đề `published ↔ archived` |
| Q180 | Danh sách Bộ đề: lọc trạng thái, tìm không dấu, 20 mỗi trang |
| Q181 | Chỉ chủ sở hữu; Quản trị viên không đọc Bộ đề |
| Q182 | Chuyển giao Chủ đề mang theo Bộ đề nháp, gỡ câu không chuyển, nói trước; Bộ đề đã Phát hành ở lại |
| Q183 | Xóa người dùng mang theo mọi Bộ đề; `OwnedContent` thành danh sách nhà cung cấp |
| Q184 | Thông báo `topics.transferred` thêm số Bộ đề |
| Q185 | Menu "Bộ đề", trang soạn rộng, thanh dưới dính, tab Soạn và Xem thử |
| Q186 | Hộp thoại chọn câu dùng bộ lọc của ngân hàng, "Đã có" không tick được |
| Q187 | Hộp thoại Phát hành: danh sách vấn đề hoặc xác nhận không-sửa-được-sau-đó |
| Q188 | Seam test (unit, tích hợp, E2E) như mục trên |
| Q189 | Thuật ngữ mới: Bản chụp, Đặt điểm nhanh, Lưu trữ Bộ đề |
| Q190 | Thay đổi data-model mục 3 và kế hoạch migration |
| Q191 | Ngoài phạm vi lát cắt 3 |
