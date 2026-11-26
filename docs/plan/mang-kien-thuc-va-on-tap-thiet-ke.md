# Nguồn tham khảo của Câu hỏi và gợi ý ôn tập sau khi làm bài (thiết kế đề xuất, bản 2)

Trạng thái: **định hướng mở, làm sau** (ghi nhận 21/11/2026; chưa lên lịch, chưa có mã). Chủ dự án quyết định tạm chưa tạo khóa Claude API, và tập trung vào [Rút câu theo Phần](rut-cau-theo-phan-thiet-ke.md) trước. Tài liệu này giữ **đặc tả đã chốt** (Q451 đến Q460) để khi bắt đầu thì làm ngay, không phải hỏi lại; Q461 (khóa API, hạn mức, xác nhận với Trường) là điều kiện riêng của bước K3. Ngày đề xuất: 20/11/2026; viết lại ngày 21/11/2026 sau vòng trao đổi đặc tả Q451 đến Q459 (chủ dự án đã trả lời từng câu). Câu hỏi quyết định đánh số từ Q442.

**Phiên bản dự kiến khi bắt đầu:** một bản MINOR mới cho K1 đến K3 (dự kiến `0.7.0`; số `0.6.0` đã dùng cho quy mô lớn và mã lệnh, số `0.4.0` đã dùng cho đợt chỉnh giao diện soạn Bộ đề ngày 23/11/2026 và `0.5.0` cho Mã đề của Phiên thi, xem [phat-hanh.md](../ops/phat-hanh.md) mục 8). Chỉ thêm bảng mới và hai cột có giá trị mặc định (`exams.review_hints`, `sessions.review_hints`), không đổi cột nào đang có dữ liệu; quy tắc đánh số: [docs/ops/phat-hanh.md](../ops/phat-hanh.md).

> **Bản 1 (20/11) đề xuất cây mảng kiến thức, hồ sơ nhiều Lượt và AI tùy chọn. Bản 2 thu hẹp theo đúng yêu cầu của chủ dự án:** ghi nguồn tham khảo ở từng câu, và **sau khi làm bài xong** tổng hợp các câu chưa đạt thành gợi ý đọc lại tài liệu, có AI viết lời gợi mở. Những phần của bản 1 chưa cần cho yêu cầu này được chuyển sang mục "Làm sau" (cuối mục 9).

## 1. Yêu cầu của chủ dự án (nguyên văn ý, 21/11/2026)

1. Mỗi Câu hỏi, ngoài thông tin hiện có, Người ra đề có thể bổ sung **nguồn tham khảo dùng để soạn câu đó** (ví dụ "mục 3.3 của chương 3, chủ đề cây tìm kiếm nhị phân"). Tùy chọn.
2. **Trong lúc làm bài thì không hiển thị** thông tin này.
3. Khi Người dự thi làm bài xong, câu nào làm sai thì lấy nguồn này **tổng hợp thành gợi ý các mảng kiến thức nên xem lại**.
4. Dùng **AI sinh ngôn ngữ gợi mở** để Người dự thi tìm đọc các tài liệu liên quan.

## 2. Các quyết định đã chốt (vòng trao đổi 21/11/2026)

| Q | Quyết định |
|---|---|
| Q452 | **Hai ô tùy chọn** trên mỗi Câu hỏi: "Tài liệu" (gõ có gợi ý từ tên đã nhập trước) và "Vị trí / chủ đề" (một dòng, ví dụ "Chương 3, mục 3.3: Cây tìm kiếm nhị phân"). Các câu cùng (tài liệu, vị trí) sau khi chuẩn hóa (bỏ dấu, chữ thường, gộp khoảng trắng) gom thành **một nhóm gợi ý**. Chưa có danh mục tài liệu dùng chung. |
| Q453 | **Bỏ cây mảng kiến thức** ở giai đoạn đầu; nhóm (tài liệu, vị trí) đóng vai mảng kiến thức. Thêm cây sau nếu cần cộng điểm theo Học phần hay chương. |
| Q454 | "Làm sai" = **câu đã chấm xong mà chưa đạt trọn điểm** (kể cả đúng một phần), thuộc Lượt đã Công bố. Câu chưa chấm không tính. |
| Q455 | Gợi ý **gắn với từng Lượt**, hiện ở trang kết quả của Lượt đã Công bố. Không cần ngưỡng số câu. Tổng hợp nhiều Lượt làm sau. |
| Q456, Q460 | Công tắc **"Gợi ý ôn tập sau khi Công bố"**: Người ra đề đặt **mặc định ở Bộ đề** khi soạn (mặc định **bật**, đóng băng cùng Bộ đề lúc Phát hành); **Phiên thi kế thừa và có thể ghi đè**, cố định khi có Lượt đầu tiên. Cùng mẫu với tỷ lệ rút (Q438). |
| Q457 | **Quy tắc** quyết định nhóm nào cần ôn; **AI chỉ viết lời gợi mở**, sinh khi Người dự thi bấm nút, lưu đệm theo Lượt, có hạn mức theo ngày. AI lỗi hay hết hạn mức thì dùng **câu mẫu**. |
| Q458 | Gửi cho AI chỉ **tên tài liệu, vị trí, số câu chưa đạt trên tổng, tên Học phần hoặc Bộ đề**; dịch vụ **Claude API**, khóa ở máy chủ, hạn mức tháng do chủ dự án đặt. Chủ dự án xác nhận với Trường về việc dữ liệu ra ngoài máy chủ. |
| Q459 | Nguồn **sao vào bản chụp lúc Phát hành**, bất biến. Muốn đổi nguồn của Bộ đề đã Phát hành thì Nhân bản. |
| Q451 | **Chỉ gợi ý tài liệu để đọc**; "làm thử câu theo phần yếu" hoãn (có thể dùng Phiên thi 100 % câu sẵn có). |

Câu hỏi của bản 1 nay: Q442 và Q443 (cây, số mảng) và Q445 (ai tạo mảng) **hoãn** theo Q453; Q444 (một dòng tự do) **thay bằng Q452**; Q446 **xác nhận ở Q459**; Q447 phần Người dự thi chỉ thấy của chính mình **đã nằm trong Q455** (phần Người ra đề xem tổng hợp lớp: hoãn); Q448 (AI tùy chọn) **thay bằng Q457, Q458**; Q449 (thứ tự: sau Rút câu theo Phần) **giữ nguyên**; Q450 (ngưỡng 3 câu) **không cần ở bước này** (Q455), dùng khi làm tổng hợp nhiều Lượt.

## 3. Hiện trạng (đã đọc mã, 20/11/2026)

| Có sẵn | Đặc điểm | Dùng được không |
|---|---|---|
| **Chủ đề** (`topics`) và **Nhãn** (`questions.tags`) | Sắp xếp riêng của từng Người ra đề; chữ tự do | **Không**: không chuẩn hóa được để gom gợi ý |
| **Bản chụp** (`exam_items.snapshot`) | Bất biến sau Phát hành (ADR-0005) | Không chứa nguồn, cần bảng sao riêng lúc Phát hành (như `exam_item_illustrations`, Q176) |
| **Kết luận từng câu** (`response_grades.score`, `verdict`) | Mỗi Lượt, mỗi câu đã có điểm, đã tính Đính chính và Phúc khảo | **Có**: nguồn của "câu nào chưa đạt trọn điểm" |
| **Kết quả của tôi** | Người dự thi chỉ thấy sau Công bố, không thấy Đáp án đúng | **Có**: nơi đặt mục gợi ý, cùng thời điểm và cùng nguyên tắc |

## 4. Nguyên tắc thiết kế

1. **Tùy chọn hoàn toàn.** Câu không có nguồn dùng bình thường; chỉ không góp gợi ý (hiển thị "N câu chưa có nguồn tham khảo" để Người dự thi hiểu).
2. **Không hiện trong lúc làm bài.** Không API nào phục vụ Lượt đang làm trả trường nguồn; có bài quét kiểm (như bài quét tệp Đề). Gợi ý chỉ mở **sau Công bố**.
3. **Không lộ nội dung câu, đáp án hay câu cụ thể đã sai.** Chỉ có tên nhóm nguồn và số câu.
4. **Chỉ thêm bảng mới, hai cột mặc định ở `exams` và `sessions`**; bản chụp vẫn bất biến.
5. **Phần chắc chắn không phụ thuộc AI.** Danh sách nhóm cần xem lại do quy tắc tính và hiện ngay; AI chỉ viết lời. Không AI vẫn chạy đủ.
6. **Hiệu năng:** theo [AGENTS.md](../../AGENTS.md), quá khoảng 300 ms là đáng xem lại. Danh sách nhóm là một truy vấn có chỉ mục theo một Lượt (vài chục dòng); AI chạy ngoài đường chính, không chặn trang.

## 5. Mô hình dữ liệu đề xuất

```sql
question_references (                       -- nguồn tham khảo của Câu hỏi trong Ngân hàng; không có dòng = chưa ghi
  question_id PRIMARY KEY → questions ON DELETE CASCADE,
  source_title text NULL CHECK (char_length <= 200),     -- "Giáo trình Cấu trúc dữ liệu và giải thuật"
  location text NULL CHECK (char_length <= 200),         -- "Chương 3, mục 3.3: Cây tìm kiếm nhị phân"
  updated_at,
  CHECK (nullif(trim(source_title),'') IS NOT NULL OR nullif(trim(location),'') IS NOT NULL)
)

exam_item_references (                      -- sao lúc Phát hành, bất biến như bản chụp (Q459)
  item_id PRIMARY KEY → exam_items ON DELETE CASCADE,
  source_title text NULL,
  location text NULL,
  group_key text NOT NULL                   -- chuẩn hóa (tài liệu, vị trí): bỏ dấu, chữ thường, gộp khoảng trắng
)
-- Trigger như exam_children_guard (migration 0011): Bộ đề không còn nháp thì không thêm, sửa, xóa dòng. Điền trong cùng giao dịch Phát hành.

exams.review_hints boolean NOT NULL DEFAULT true      -- mặc định ở Bộ đề (Q460); đóng băng khi Phát hành như tiêu đề và hướng dẫn
sessions.review_hints boolean NULL                    -- ghi đè ở Phiên thi; NULL = kế thừa Bộ đề; sessions_guard khóa khi có Lượt đầu
-- Giá trị hiệu lực = Phiên thi ?? Bộ đề ?? true, tính ở MỘT hàm thuần dùng chung (như effectiveDrawPercents)

attempt_review_advice (                     -- lời gợi mở của AI hoặc câu mẫu, lưu đệm theo Lượt (Q457)
  attempt_id PRIMARY KEY → attempts ON DELETE CASCADE,
  text text NOT NULL,
  source text NOT NULL CHECK (source IN ('ai','template')),
  created_at
)
```

Cách sinh `group_key` đặt ở **một hàm thuần dùng chung** (cùng quy tắc bỏ dấu như `topics.name_key`) để Ngân hàng, Excel và Phát hành không sinh khác nhau.

## 6. Gợi ý sau khi làm bài

### 6.1 Danh sách nhóm cần xem lại (quy tắc, không AI)

Với một Lượt đã Công bố, các câu có `exam_item_references`, gom theo `group_key`; mỗi nhóm có:

- `thiếu` = số câu **đã chấm xong mà `score` < điểm tối đa của câu** (Q454);
- `tổng` = số câu của nhóm có trong Lượt đó (đã chấm xong);
- chỉ giữ nhóm có `thiếu` ≥ 1, xếp theo `thiếu` giảm dần, rồi tỷ lệ thiếu giảm dần, rồi theo tên.

Kèm riêng: "N câu chưa có nguồn tham khảo", "M câu chưa chấm xong, chưa tính". Tên hiển thị của nhóm lấy từ câu đầu tiên của nhóm (văn bản gốc, không phải `group_key`).

Câu mẫu khi không có AI:

> Bạn nên xem lại **Giáo trình Cấu trúc dữ liệu và giải thuật, Chương 3, mục 3.3: Cây tìm kiếm nhị phân** (chưa đạt trọn điểm 3 trên 4 câu).

### 6.2 Điều kiện hiện

- Chỉ chủ của Lượt (Người dự thi đó), chỉ **sau Công bố** của chính Lượt, và chỉ khi giá trị hiệu lực của `review_hints` là bật. Ngược lại: không có mục này (trả 404, không nói rõ lý do, như quy ước quyền hiện có).
- Đính chính đáp án và Phúc khảo đổi `response_grades` nên danh sách **tự khớp** (tính theo yêu cầu).

### 6.3 Lời gợi mở của AI (Q457, Q458)

- Người dự thi bấm "Gợi ý ôn tập"; nếu `attempt_review_advice` đã có thì trả lại ngay (không tốn thêm); chưa có thì gọi AI, lưu kết quả.
- **Cổng** `ReviewAdvisor` với hai bộ cài đặt: bộ **mẫu** (6.1) và bộ **Claude API**. Cổng thật vì có hai bộ cài đặt ngay từ đầu.
- Dữ liệu gửi đi **chỉ**: tên Học phần hoặc Bộ đề, và với mỗi nhóm: tên tài liệu, vị trí, `thiếu` trên `tổng`. Không họ tên, mã người dùng, nội dung câu, đáp án, câu trả lời (có bài kiểm bắt buộc kiểm nội dung yêu cầu gửi đi).
- Chỉ dẫn cho AI: giọng khích lệ, nêu đúng các nhóm đã cho, **không bịa tài liệu hay số trang**, không nhắc câu hỏi cụ thể, tiếng Việt, ngắn. Lời AI trả về chỉ hiển thị dưới dạng chữ thuần (không HTML), có giới hạn độ dài, và kiểm tra tối thiểu (không rỗng, không quá dài).
- **Thời gian chờ** ngắn (vài giây); hết thời gian, lỗi hay hết hạn mức (theo ngày, đếm bằng Redis; hạn mức tháng ở cấu hình) thì **dùng câu mẫu** và lưu `source='template'` để trang không bao giờ trống. Danh sách nhóm (6.1) luôn hiện ngay, AI chỉ thêm lời.
- Khóa API ở máy chủ (biến môi trường), không bao giờ ở trình duyệt; ghi nhật ký (số lần gọi, thời gian, kết quả; **không** ghi nội dung gửi đi).
- Dữ liệu ra ngoài Trường: cần chủ dự án xác nhận với Trường (Q458). Hệ thống mặc định **tắt AI** cho đến khi có khóa và bật trong cấu hình, nên không có AI thì dùng câu mẫu.

## 7. Giao diện (tóm tắt, chi tiết ở từng PR)

- **Người ra đề, form Câu hỏi:** hai ô tùy chọn "Tài liệu" (gõ có gợi ý) và "Vị trí / chủ đề"; chú thích rõ **"Nội dung này có thể hiện cho Người dự thi sau khi Công bố kết quả"**. Nhập hàng loạt từ Excel có hai cột tùy chọn cùng tên; sửa hàng loạt (chọn nhiều câu, gán nguồn) để dùng được cho Ngân hàng đã có.
- **Người ra đề, soạn Bộ đề:** công tắc "Gợi ý ôn tập sau khi Công bố" ở phần thuộc tính Bộ đề (mặc định bật).
- **Người ra đề, Phiên thi:** hiện giá trị kế thừa từ Bộ đề, đổi được cho riêng Phiên thi đó, khóa khi có Lượt đầu.
- **Người dự thi, trang kết quả của Lượt:** mục "Từ bài này, bạn nên xem lại", danh sách nhóm, nút "Gợi ý ôn tập" để AI viết lời; chữ rõ, không chỉ dùng màu; hoạt động tốt trên điện thoại.

## 8. Quyền riêng tư

- Gợi ý chỉ hiện cho **chính chủ Lượt**, không có màn xem của người khác, Quản trị viên không có màn xem gợi ý cá nhân.
- Không dùng để chấm điểm, xếp hạng hay phạt; ghi rõ ở giao diện.
- Dữ liệu gửi AI không chứa dữ liệu cá nhân (6.3). Lời gợi mở lưu theo Lượt nên đi theo Lượt khi xóa.
- Khuyến nghị: thông báo ngắn lúc vào thi (như thông báo Rút câu, Q390) rằng sau khi Công bố sẽ có gợi ý ôn tập từ kết quả của chính người đó.

## 9. Lộ trình đề xuất (PR nhỏ, TDD, mỗi PR một lát dọc)

> **Làm sau, chưa lên lịch.** K1 và K2 không cần AI nên bắt đầu được bất cứ lúc nào chủ dự án muốn (gợi ý dùng câu mẫu). K3 chỉ làm khi có khóa Claude API (Q461). Cho đến khi bắt đầu, không đổi gì ở mã.

| PR | Nội dung | Điểm kiểm thử (seam) |
|---|---|---|
| K1 | Bảng `question_references`, `exam_item_references`, hàm chuẩn hóa `group_key` dùng chung; hai ô ở form Câu hỏi; hai cột Excel; sửa hàng loạt; **sao lúc Phát hành** | Hàm thuần theo tính chất (bỏ dấu, hoa thường, khoảng trắng, hai câu cùng nguồn cùng khóa); tích hợp: lưu, đọc, xóa nguồn; câu không có nguồn dùng như cũ; Phát hành sao đúng và bất biến (SQL ghi trực tiếp cũng bị chặn); sửa nguồn ở Ngân hàng sau Phát hành không đổi Bộ đề đã Phát hành; **API làm bài không trả nguồn** (bài quét) |
| K2 | Công tắc `exams.review_hints` (mặc định) và `sessions.review_hints` (ghi đè), hàm giá trị hiệu lực; hàm thuần gom nhóm và xếp; API gợi ý theo Lượt; mục trên trang kết quả (câu mẫu) | Hàm thuần: chỉ câu chưa đạt trọn điểm, đúng một phần có tính, câu chưa chấm không tính, câu không nguồn đếm riêng, thứ tự; tích hợp: chỉ chủ Lượt, chỉ sau Công bố, tắt công tắc (ở Bộ đề hoặc ghi đè ở Phiên thi) thì 404, Phiên thi ghi đè thắng Bộ đề, Bộ đề đã Phát hành không đổi được mặc định, Đính chính đổi danh sách, **không lộ nội dung câu, đáp án** (bài quét); E2E desktop và mobile |
| K3 | Cổng `ReviewAdvisor` + bộ cài Claude API, lưu đệm `attempt_review_advice`, hạn mức ngày, thời gian chờ, dự phòng câu mẫu | Bộ cài giả lập: lỗi, hết giờ, hết hạn mức đều ra câu mẫu; bấm lại không gọi lần hai (lưu đệm); nội dung gửi đi **chỉ** các trường đã duyệt (kiểm chuỗi yêu cầu); lời AI hiển thị chữ thuần; tắt AI thì chạy đủ |

Mỗi PR có kiểm đột biến. K1 đến K3 cùng thuộc một bản MINOR (dự kiến `0.7.0`); tag đặt khi dùng được thật và đã kiểm trên production.

### Làm sau (đã bàn, chưa làm)

- **Tổng hợp nhiều Lượt** ("Kiến thức của tôi"), dùng mức nắm vững làm mượt và ngưỡng bằng chứng 3 câu (Q450), cộng dồn theo thời gian.
- **Cây mảng kiến thức theo Đơn vị** (`knowledge_areas`, tối đa 3 mức, gộp và Lưu trữ) khi cần cộng điểm theo chương hay Học phần (bản 1 mục 4).
- **Góc nhìn Người ra đề:** "Lỗ hổng kiến thức của lớp" theo Phiên thi, không tên người.
- **AI gợi ý phân loại** cho Người ra đề có hàng trăm câu (đọc đề bài, đề xuất tài liệu và vị trí; người duyệt từng câu), **AI gợi ý gộp nhóm trùng nhau** khi danh sách tên phình to.
- **Ôn tập tự thân** (làm thử câu theo phần yếu, lịch nhắc 3, 7, 14 ngày), cần quyết riêng vì Người dự thi hiện không vào Ngân hàng câu hỏi (Q451).
- **Rút câu theo mảng kiến thức** (backlog Q394 của [Rút câu theo Phần](rut-cau-theo-phan-thiet-ke.md)).

## 10. Rủi ro và cách giảm

| Rủi ro | Hệ quả | Cách giảm |
|---|---|---|
| **Dữ liệu thưa** (nguồn là tùy chọn) | Nhiều câu không có nguồn, gợi ý nghèo | Hiện "N câu chưa có nguồn"; nhập Excel và sửa hàng loạt; AI gợi ý phân loại ở bước sau |
| Mỗi người ghi nguồn một kiểu | Một mục bị tách thành nhiều nhóm | Gõ có gợi ý từ tên đã nhập; chuẩn hóa `group_key`; hướng dẫn mẫu ở giao diện |
| Gợi ý tiết lộ mục kiến thức của câu sai | Không mong muốn với kỳ thi chính thức | Công tắc ở Bộ đề và Phiên thi (Q456, Q460); chỉ hiện sau Công bố; không nêu câu cụ thể |
| Rò rỉ nội dung qua gợi ý hay qua API làm bài | Phá bất biến "đáp án chỉ ở server" | Chỉ nhóm nguồn và số câu; bài quét kiểm API làm bài và API gợi ý |
| Lời AI sai hoặc bịa tài liệu | Người học tìm sách không có | Chỉ dẫn "không bịa"; AI chỉ nhận đúng các nhóm đã có; nhóm chắc chắn hiện riêng; chữ thuần; câu mẫu dự phòng |
| Chi phí và độ trễ AI | Tốn tiền, chậm | Sinh khi bấm, lưu đệm theo Lượt, hạn mức ngày và tháng, thời gian chờ, chạy ngoài đường chính |
| Dữ liệu ra ngoài Trường | Quy định của Trường | Chỉ gửi các trường không cá nhân; mặc định tắt đến khi chủ dự án bật; chủ dự án xác nhận với Trường |
| Tiêm lệnh qua chữ nguồn tham khảo (Người ra đề nhập chữ đưa vào lời nhắc) | AI làm theo chỉ dẫn lạ | Chữ nguồn đặt trong khối dữ liệu có phân tách rõ, chỉ dẫn hệ thống nằm riêng; đầu ra chỉ hiển thị chữ thuần nên tác hại nhỏ |

## 11. Còn cần chủ dự án quyết

1. **Duyệt bản 2 này** (hoặc nêu điểm cần sửa).
2. **Q461, đường chạy AI:** tạo khóa Claude API và đặt hạn mức tháng khi tới K3; xác nhận với Trường về việc gửi dữ liệu không cá nhân ra ngoài (Q458).
3. **Thứ tự làm (Q449):** sau Rút câu theo Phần (R2 đến R5), bắt đầu bằng K1, **đã đồng ý** theo chỉ đạo "tập trung Rút câu trước".

## 12. Ngoài phạm vi (lát này)

Không sinh câu hỏi hay đáp án bằng AI; không để AI chấm điểm hay quyết định ai yếu; không ôn tập tự thân; không danh mục tài liệu dùng chung; không tổng hợp nhiều Lượt; không cây mảng kiến thức; không xếp hạng hay so sánh giữa Người dự thi; không đổi cách chấm; không đổi Chủ đề và Nhãn hiện có.
