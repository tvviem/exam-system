# Rút câu theo Phần cho từng Lượt làm bài (thiết kế đề xuất)

Trạng thái: **accepted** (chủ dự án đã chốt cả 11 câu Q385–Q395 ngày 18/11/2026: **Q388 (a), Q389 (a)**, các câu còn lại theo đề xuất; chưa có mã). Ngày đề xuất: 18/11/2026. Câu hỏi quyết định đánh số từ Q385.

**Mốc nền:** nâng cấp sau **phiên bản 0.1** (chủ dự án đánh dấu bản đã deploy và kiểm tra ngày 18/11/2026: nhánh `main` tại commit `3a1f971`, lần deploy run 44247392726). Thiết kế đã được duyệt; **chưa có mã** và **thứ tự làm do chủ dự án quyết** (cạnh tranh với [Xuất Bộ đề](xuat-bo-de-thiet-ke.md)). Bắt đầu làm thì nạp skill `tdd`, chốt các điểm kiểm thử (seam) với chủ dự án rồi mới viết bài kiểm thử đầu tiên.

**Phiên bản dự kiến: `0.2.0` (MINOR)**, chủ dự án đồng ý ngày 18/11/2026. Lý do: chỉ thêm một bảng (`session_section_draws`), không đổi cột nào của bảng đã có dữ liệu; không có dòng rút nghĩa là 100 % nên Phiên thi và Lượt cũ không đổi hành vi; bốn bất biến của hệ thống giữ nguyên; không có thành phần hạ tầng mới và không thay ADR nào. Quy tắc đánh số: [docs/ops/phat-hanh.md](../ops/phat-hanh.md). Xét lại (có thể thành MAJOR) nếu Q388 chọn phương án "mỗi người một điểm tối đa riêng", hoặc nếu lúc làm R3 phải thêm cột vào bảng đã có dữ liệu (ví dụ lưu điểm tối đa theo từng Lượt). Tag `v0.2.0` đặt sau R4 và R5, khi Người ra đề dùng được thật và đã kiểm trên prod, không đặt cho từng PR; từ lúc có Phiên thi rút dưới 100 % kèm Lượt làm bài, lùi về bản cũ sẽ chấm sai nên ghi rõ trong Release.

## 1. Yêu cầu của chủ dự án

Một Bộ đề có thể có nhiều câu (ví dụ 100 câu, 4 Phần), nhưng mỗi Người dự thi chỉ làm một phần của nó:

1. Người ra đề đặt **tỷ lệ lấy cho từng Phần** (ví dụ 40 % → 40 câu trên 100) **trước khi Phiên thi diễn ra**.
2. Khi Người dự thi vào phòng thi lần đầu, hệ thống **rút ngẫu nhiên** các câu theo tỷ lệ đó.
3. Bộ câu đã rút là **cố định** cho Người dự thi đó, kể cả thoát ra hay đăng nhập lại.
4. Mỗi Người dự thi nhận một bộ câu khác nhau, để hạn chế trao đổi bài trong phòng thi.
5. Giữ nguyên cách làm hiện tại: câu lấy từ Ngân hàng câu hỏi vào Bộ đề, bản chụp bất biến, xáo trộn câu và Phương án.

## 2. Đánh giá nghiệp vụ

**Hợp lý và phổ biến** (đề ngẫu nhiên theo cấu trúc từ một kho câu). Lợi ích:

- **Chống trao đổi bài**: hai người ngồi cạnh nhau thấy hai bộ câu khác nhau, nhưng cùng cấu trúc Phần.
- **Giảm lộ đề**: máy Người dự thi chỉ nhận 40 câu, không phải 100; câu không được rút không rời khỏi máy chủ.
- **Dùng lại Bộ đề**: cùng một Bộ đề đã Phát hành dùng cho nhiều Phiên thi với tỷ lệ khác nhau (ví dụ 40 % cho kiểm tra, 100 % cho ôn tập).
- **Hợp nguyên tắc hệ thống**: server quyết định bộ câu (rút ở server lúc bắt đầu Lượt); bộ câu được ghi vào PostgreSQL trước khi báo thành công; Đáp án đúng vẫn chỉ ở server; Lượt, Chấm và Phúc khảo vẫn chỉ đọc bản chụp `exam_items.snapshot`.

**Đánh đổi cần chấp nhận hoặc xử lý:**

| # | Vấn đề | Hệ quả | Hướng xử lý đề xuất |
|---|---|---|---|
| 1 | Độ khó giữa các bộ câu không đều | Người này có thể gặp bộ dễ hơn | Rút theo Phần (cấu trúc cân bằng); ghi rõ trong hướng dẫn; về sau rút theo Chủ đề hoặc độ khó (backlog) |
| 2 | Điểm tối đa có thể khác nhau nếu điểm các câu khác nhau | Điểm quy đổi thang 10 không so sánh được | **Quy tắc điểm đồng nhất trong Phần** (mục 4.4) |
| 3 | Người dự thi thắc mắc "bạn tôi có câu dễ hơn" | Khiếu nại | Thông báo minh bạch trước khi làm bài (Q390) |
| 4 | Đính chính đáp án và Phúc khảo chỉ tác động người có câu đó | Đúng về nghiệp vụ, cần giải thích | Ghi rõ trong tài liệu và giao diện |
| 5 | Thống kê câu hỏi về sau có mẫu không đều | Số người gặp mỗi câu khác nhau | Chấp nhận; thống kê vốn ở backlog |

## 3. Điều hệ thống đã có (kế thừa, không làm lại)

- **Bộ đề đã Phát hành bất biến** (trigger migration 0011, ADR-0005).
- **Xáo trộn là thiết lập của Phiên thi** (Q161), bị khóa sau khi có Lượt đầu (`sessions_guard`).
- **`attempts.layout` đã cố định** sau khi tạo (trigger `attempts_guard`), nên "thoát rồi vào lại vẫn đúng bộ câu cũ" đã được bảo đảm sẵn; `layoutOf(seed, input, flags)` là hàm thuần ở `@exam/shared`, kết quả đã là danh sách câu **theo từng Phần**.
- Backlog đã có mục "Rút ngẫu nhiên câu hỏi theo Chủ đề" (`docs/architecture.md`): tính năng này là bước nền cho mục đó.

## 4. Thiết kế đề xuất

### 4.1 Thuật ngữ (đề xuất thêm vào GLOSSARY, Q385)

- **Rút câu** (`Draw`): cách một Phiên thi chọn ngẫu nhiên một số câu của mỗi Phần cho từng Lượt làm bài. _Avoid_: ngẫu nhiên hóa, random, bốc câu.
- **Tỷ lệ rút** (`Draw ratio`): phần trăm số câu của một Phần được rút cho mỗi Lượt. Mặc định 100 % (lấy đủ).
- Chủ dự án nói "Bộ câu hỏi": trong từ điển dự án đó là **Bộ đề** (Ngân hàng câu hỏi là kho chứa Câu hỏi).

### 4.2 Dữ liệu

```sql
session_section_draws (                    -- Tỷ lệ rút của một Phiên thi; không có dòng = 100 % (Phiên thi cũ không đổi)
  session_id → sessions ON DELETE CASCADE,
  section_id → exam_sections,               -- trigger: Phần phải thuộc Bộ đề của Phiên thi
  percent numeric(5,2) CHECK (percent BETWEEN 0 AND 100),
  PRIMARY KEY (session_id, section_id)
)
-- Trigger như sessions_guard (Q161): Phiên thi đã có Lượt thì không thêm, sửa, xóa dòng nào.
```

`attempts` **không đổi cột**: `layout` chỉ chứa các câu đã rút, và trigger `attempts_guard` đã cố định nó.

### 4.3 Thuật toán (hàm thuần ở `@exam/shared`, kiểm thử bằng thuộc tính)

- `drawCountOf(percent, n)`: làm tròn nửa lên của `percent × n / 100`, tối thiểu 1 nếu `percent > 0`, tối đa `n`.
- `layoutOf(seed, input, flags, draw?)`: với mỗi Phần chọn `k` câu bằng luồng ngẫu nhiên **riêng cho việc rút**, rồi mới xáo thứ tự nếu công tắc bật. **Hạt giống rút (`drawSeed`) không phải `seed` của Lượt** mà băm từ **mã Phiên thi và mã người dự thi** (và mã Phần), nên **cố định cho người đó qua mọi Lượt** (Q389 (a): giữ nguyên bộ câu), không cần bảng lưu riêng; còn thứ tự xáo vẫn theo `seed` của từng Lượt, đúng hành vi hiện nay. Nhờ luồng riêng, bật hay tắt xáo trộn **không làm đổi tập câu được rút**.
- Rút không lặp, đều (mỗi câu của Phần có cùng xác suất `k / n`), xác định theo `drawSeed`: cùng người trong cùng Phiên thi luôn ra cùng một tập câu.
- Không có `draw` hoặc tỷ lệ 100 %: kết quả **giống hệt** hiện nay (Phiên thi cũ và Lượt cũ không đổi).

### 4.4 Quy tắc điểm (Q388)

Khi một Phần có tỷ lệ rút dưới 100 %, **mọi câu trong Phần đó phải có cùng điểm** (kiểm khi lưu thiết lập; báo rõ câu nào lệch; "Đặt điểm nhanh" sẵn có để sửa ở Bộ đề nháp trước khi Phát hành). Khi đó mọi Người dự thi có **cùng điểm tối đa** `Σ (số câu rút của Phần × điểm mỗi câu)`, nên kết quả, quy đổi thang 10 và xuất Excel giữ nguyên cách làm "một điểm tối đa cho cả Phiên thi", chỉ đổi cách tính điểm tối đa đó.

### 4.5 Những chỗ phải đổi: từ "mọi câu của Bộ đề" sang "tập câu của Lượt"

Đã đọc mã; các nơi đang giả định mọi Lượt có đủ mọi câu của Bộ đề:

| Nơi | Hiện nay | Cần |
|---|---|---|
| `attempt` bắt đầu Lượt (`attempts.service`, `layoutOf`) | Bố cục toàn bộ câu | Rút rồi lưu layout |
| `attempt` lưu Câu trả lời (`saveResponses`) | Kiểm câu thuộc Bộ đề | Kiểm câu **thuộc layout của Lượt** |
| `attempt` xem thử, xem lại sau Công bố (`session-preview`, `attempt-view`) | Đủ câu | Theo layout |
| `grading/autograde.service` `scoreAttempt` | Chấm **mọi câu của Bộ đề** cho mọi Lượt | Chỉ các câu trong layout của Lượt (nếu không sẽ sinh điểm cho câu chưa từng hiện) |
| `grading/grading-context` `maxScoreCenti` | Tổng điểm mọi câu | Tổng theo cấu hình rút (mục 4.4) |
| `grading/results`, `candidate-result` | `maxScore` toàn Bộ đề | Điểm tối đa theo cấu hình rút |
| `grading/candidate-appeals` hạn mức Phúc khảo | `max(3, ceil(10 % × số câu Bộ đề))` | Theo số câu của **Lượt** (40 câu thì 4) |
| `session/session-monitor` tiến độ | `totalItems` của cả Bộ đề | Tổng câu của từng Lượt |
| `grading/results-export` sheet "Chi tiết" | Một cột "Câu N" cho mỗi câu Bộ đề | Giữ cột; ô để trống cho câu không được rút |
| `grading/key-corrections`, `key-recorrect` (Đính chính) | Mọi Lượt | Chỉ Lượt có câu đó |
| Chấm Câu tự luận theo câu | Hàng đợi đủ người | Hàng đợi thưa hơn, số "chưa chấm" theo câu |
| Web: form Phiên thi, màn làm bài, kết quả | Không có | Xem 4.6 |

Để các nơi trên **không tự dò layout mỗi nơi một kiểu** (xem skill `codebase-design`, mô-đun sâu): đề xuất một giao diện nhỏ "tập câu của Lượt" ở module `attempt` (qua cổng đã có `GRADING_SOURCE`), trả danh sách `itemId` của một Lượt; chấm điểm, Phúc khảo, theo dõi và xuất Excel đều dùng nó, nên quy tắc "câu nào thuộc Lượt này" nằm **một chỗ**.

### 4.6 Giao diện Người ra đề (trong form Phiên thi)

```
Rút câu theo Phần                                  (khóa khi đã có Lượt làm bài)
┌──────────────┬──────────┬─────────┬───────────┐
│ Phần         │ Số câu có│ Tỷ lệ % │ Mỗi người │
│ Phần I       │   25     │ [ 40 ]  │ → 10 câu  │
│ Phần II      │   25     │ [ 40 ]  │ → 10 câu  │
│ Phần III     │   30     │ [ 40 ]  │ → 12 câu  │
│ Phần IV      │   20     │ [ 40 ]  │ →  8 câu  │
└──────────────┴──────────┴─────────┴───────────┘
Mỗi Người dự thi nhận 40 câu, tối đa 40 điểm.   ⚠ Phần III: các câu điểm khác nhau
[Xem thử một lượt rút ngẫu nhiên]
```

Màu và cảnh báo theo skill UX/UI (không chỉ dùng màu, có chữ và biểu tượng). Màn làm bài hiển thị "câu x / 40", và trước khi bắt đầu có một dòng nêu rõ "Bài của bạn gồm 40 câu rút ngẫu nhiên; mỗi người có thể có bộ câu khác nhau" (Q390).

## 5. Lộ trình phát triển (PR nhỏ, TDD, mỗi PR một lát dọc)

| PR | Nội dung | Điểm kiểm thử (seam) |
|---|---|---|
| R1 | `drawCountOf` và `layoutOf` có rút (hàm thuần) | Tính chất: đúng số câu mỗi Phần, không lặp, tập con của Phần, xác định theo `drawSeed` (cùng `drawSeed` thì cùng tập câu dù `seed` của Lượt khác nhau; khác người thì khác tập), đều (kiểm thống kê với hạt giống cố định), đổi cờ xáo không đổi tập rút, không `draw` thì kết quả y hệt hiện nay |
| R2 | Bảng `session_section_draws`, API Phiên thi (kiểm điểm đồng nhất, khóa), bắt đầu Lượt rút thật, `saveResponses` kiểm layout | API tích hợp: hai người khác bộ câu; vào lại vẫn đúng bộ; **Lượt 2 của cùng một người có cùng tập câu với Lượt 1** (chỉ đổi thứ tự); câu ngoài layout bị từ chối; sau Lượt đầu không sửa được |
| R3 | Chấm điểm và kết quả theo tập câu của Lượt (autograde, điểm tối đa, hạn mức Phúc khảo, theo dõi, xuất Excel, Đính chính) | Tích hợp: không sinh điểm cho câu không được rút; điểm tối đa đúng; Đính chính chỉ tác động Lượt có câu |
| R4 | Giao diện (form Phiên thi, màn làm bài, kết quả, Xem thử) | E2E desktop và mobile, ảnh chụp thật, bộ quét `ui-layout` |
| R5 | E2E toàn luồng, đo tải (500 người), tài liệu, hướng dẫn Người ra đề, GLOSSARY, data-model, architecture 5.1 | Đo thời gian bắt đầu Lượt (ngân sách phản hồi) |

Mỗi PR có kiểm đột biến. Tính năng này **không đổi hành vi** của Phiên thi cũ (không có dòng rút nghĩa là 100 %).

## 6. Quyết định của chủ dự án (Q385–Q395, chốt 18/11/2026)

**Đã chốt cả 11 câu:** Q388 chọn **(a)** (các câu cùng Phần phải cùng điểm), Q389 chọn **(a)** (giữ nguyên bộ câu của người đó cho mọi Lượt), các câu còn lại **đồng ý** theo đề xuất. Nội dung từng câu giữ nguyên bên dưới để biết lý do.

1. **Q385, thuật ngữ:** dùng **Rút câu** và **Tỷ lệ rút**, và gọi chung là **Bộ đề** (không "Bộ câu hỏi")? *(đã đồng ý)*
2. **Q386, nơi thiết lập:** tỷ lệ rút đặt ở **Phiên thi**, không ở Bộ đề (vì Bộ đề đã Phát hành bất biến và nhiều Phiên thi dùng chung)? *(đã đồng ý)*
3. **Q387, cách nhập và làm tròn:** nhập theo **%** (như anh nói), giao diện hiện số câu kết quả; làm tròn nửa lên, tối thiểu 1 câu nếu tỷ lệ lớn hơn 0 (ví dụ 33 câu × 40 % = 13,2 thành 13)? *(đã đồng ý)*
4. **Q388, điểm:** khi Phần có rút, **các câu trong Phần phải cùng điểm** để mọi người cùng điểm tối đa? *(Phương án khác: cho điểm khác nhau, mỗi người có điểm tối đa riêng và quy đổi theo từng người; không đề xuất vì khó so sánh công bằng.)* *(đã đồng ý)*
5. **Q389, nhiều Lượt:** khi Phiên thi cho làm lại (tối đa 5 Lượt), **giữ nguyên bộ câu của người đó** cho mọi Lượt, không rút lại? *(Phương án khác: mỗi Lượt rút lại độc lập. Đề xuất giữ nguyên vì "lấy Lượt cao nhất" không nên phụ thuộc vận may bộ câu.)* *(đã chốt: giữ nguyên)*
6. **Q390, minh bạch:** hiển thị trước khi làm bài rằng "bài gồm 40 câu rút ngẫu nhiên, mỗi người có thể khác nhau"? *(đã đồng ý)*
7. **Q391, Xem thử:** Xem thử của Người ra đề mặc định **rút như Người dự thi** (mỗi lần một bộ mới), kèm lựa chọn xem đủ mọi câu? *(đã đồng ý)*
8. **Q392, khóa:** tỷ lệ rút **khóa sau khi có Lượt đầu** (giống xáo trộn)? *(đã đồng ý)*
9. **Q393, Đính chính và Phúc khảo:** chỉ tác động người có câu đó; hạn mức Phúc khảo tính theo số câu của **Lượt** (40 câu thì 4)? *(đã đồng ý)*
10. **Q394, phạm vi lát này:** chỉ rút đều ngẫu nhiên **theo Phần**; chưa làm rút theo Chủ đề, Loại hay độ khó, và chưa có "câu bắt buộc luôn có" (ghi backlog)? *(đã đồng ý)*
11. **Q395, xuất Excel:** sheet "Chi tiết" giữ cột theo câu của Bộ đề, ô để trống cho câu không được rút? *(đã đồng ý)*

## 7. Ngoài phạm vi

Không đổi Bộ đề đã Phát hành, không đổi bản chụp, không rút theo Chủ đề hay độ khó, không "câu bắt buộc", không thống kê câu hỏi; không đổi hành vi Phiên thi cũ.
