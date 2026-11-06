# Lát cắt 5: Chấm, Công bố kết quả, Phúc khảo

> Trạng thái: **proposed** (6/11/2026). Chưa có dòng code nào; chờ chủ dự án duyệt Q285–Q307 (mỗi quyết định có đề xuất sẵn, đồng ý hoặc đổi từng mục). Thuật ngữ theo [GLOSSARY.md](../../GLOSSARY.md) (Chấm, Kết quả, Điểm thô, Điểm quy đổi, Công bố kết quả, Phúc khảo, Thời hạn phúc khảo, Chốt kết quả, Đính chính đáp án, Mức xử lý, Hủy kết quả). Nền tảng: [architecture.md](../architecture.md) mục 5.5–5.6, [data-model.md](../data-model.md) mục 4, [ADR-0005](../adr/0005-chup-noi-dung-khi-phat-hanh.md), [ADR-0008](../adr/0008-diem-nam-o-bang-rieng-cua-grading.md) (proposed).

## Mục tiêu

Sau lát cắt 5, vòng đời trọn vẹn của một kỳ thi chạy được:

1. Lượt làm bài vừa nộp là được **Chấm tự động** (câu chọn một, chọn nhiều, chùm đúng/sai) trong vài giây, không chờ ai bấm.
2. Người ra đề **chấm Câu tự luận** theo từng câu, ẩn tên, nhập điểm bằng bàn phím hoặc ngón tay, tự lưu.
3. Người ra đề quyết **Mức xử lý** cho các Vi phạm đã ghi ở lát cắt 4 (không, trừ phần trăm, Hủy kết quả).
4. Người ra đề xem **bảng Kết quả** cả Phiên thi, **Công bố kết quả**; Người dự thi xem điểm từng câu mà **không bao giờ thấy Đáp án đúng**.
5. Người dự thi gửi **Phúc khảo** trong Thời hạn phúc khảo; Người ra đề xử lý; hết hạn và hết Phúc khảo thì **Chốt**.
6. Phát hiện nhập sai đáp án thì **Đính chính đáp án**: chấm lại tự động cho các Phiên thi chưa Chốt.
7. **Xuất Excel** Kết quả.

**Ngoài phạm vi (ghi vào backlog):** đồng chấm nhiều giám khảo cho một Phiên thi; bỏ câu / cho mọi người điểm tối đa một câu; đổi Quy tắc chấm hay điểm của câu sau Phát hành; cho Người dự thi xem lại đề (xem Q297); Quản trị viên chấm thay; thống kê nâng cao (độ phân biệt, độ khó theo lý thuyết trắc nghiệm).

Bất biến vẫn giữ và được test: **Đáp án đúng chỉ ở server** (kể cả sau Công bố và Chốt); server quyết định điểm, client chỉ hiển thị; Chấm và Phúc khảo chỉ đọc `exam_items.snapshot` (cộng Đính chính đáp án, xem Q302); mọi thao tác ghi `audit_logs`.

## Hiện trạng (sau lát cắt 4)

- Lượt làm bài dừng ở `submitted`; `attempts` và `responses` khóa bằng trigger sau khi nộp (Q217).
- `sessions.attempt_scoring` (`highest` | `latest`) đã có; `violations.penalty_type/penalty_percent/penalty_decided_at` đã có, mặc định `none` (Q221).
- `packages/scoring` còn rỗng; `notifications` chạy (3 loại, Q211); `exceljs` đã dùng cho nhập/xuất khác; BullMQ worker đã có job quét tự nộp.
- Đã ghi sẵn ở lát cắt 4: Hoàn tác Buộc nộp "không làm được khi Lượt đã được Chấm" (Q276), nên lát cắt 5 phải định nghĩa "đã Chấm" (Q296).

## Ghi chú cho hướng dẫn sử dụng (nguồn viết tài liệu người dùng sau này)

Cập nhật khi mỗi quyết định được duyệt; viết bằng lời của người dùng, không có thuật ngữ kỹ thuật.

**Người ra đề**
- *Chấm tự động:* bài trắc nghiệm được chấm trong vài giây sau khi Người dự thi nộp bài (kể cả hết giờ hay Buộc nộp). Bạn xem được điểm trắc nghiệm sớm; Người dự thi chỉ thấy điểm sau khi bạn bấm **Công bố** (Q286).
- *Cách tính điểm:* chọn một đúng thì đủ điểm; chọn nhiều và chùm đúng/sai tính theo Quy tắc chấm bạn đặt khi soạn câu; chọn thừa đáp án sai ở câu chọn nhiều bị trừ (thấp nhất 0); Mệnh đề để trống tính là không đúng; câu trả lời lạ tính 0 (Q289).
- *Làm tròn:* điểm từng câu đến 0,01; Điểm thô là tổng các điểm đó; Điểm quy đổi thang 10 đến 0,1, từ 5 trở lên làm tròn lên, ví dụ 6,45 thành 6,5 (Q287). Nên đặt điểm các câu chẵn (40 câu × 0,25; 50 câu × 0,2) để tổng đúng 10.
- *Câu tự luận bỏ trống:* tự được 0 điểm và không xuất hiện trong danh sách chờ chấm; bạn vẫn sửa được ở bảng Kết quả (Q288).
- *Chấm tự luận:* chấm theo từng câu trên mọi bài (câu 1 của cả lớp, rồi câu 2…). Điểm từ 0 đến điểm của câu, bước 0,01, có nút nhanh 0 / một nửa / tối đa; nhận xét không bắt buộc (tối đa 1000 ký tự) và Người dự thi đọc được sau khi Công bố; điểm tự lưu khi sang bài kế (Q290).
- *Chấm ẩn tên:* mặc định bật. Khi chấm bạn chỉ thấy "Bài 17", không thấy tên, Mã định danh, Lớp; thứ tự bài được xáo để không đoán được người viết. Bảng Kết quả vẫn hiện tên nhưng **ẩn điểm các câu tự luận cho đến khi bạn chấm xong mọi câu tự luận**. Bật hoặc tắt được bất cứ lúc nào trước khi Công bố. Lưu ý: nếu bài tự nêu tên hoặc chữ viết nhận ra được thì ẩn tên không che được (Q291).
- *Màn Chấm:* trên máy tính chia đôi (bên trái danh sách bài và tiến độ "37/120 đã chấm", bên phải đề, hướng dẫn chấm, bài làm, ô điểm và nhận xét); phím J = bài kế, K = bài trước, gõ điểm rồi Enter để lưu và sang bài kế. Trên điện thoại mỗi màn một bài, có nút Trước/Sau. Mặc định chỉ hiện bài chưa chấm; điểm vượt điểm tối đa của câu bị báo lỗi, không lưu (Q293).
- *Mức xử lý Vi phạm:* ở tab "Vi phạm" của màn Kết quả, với mỗi Vi phạm đã ghi lúc theo dõi bạn chọn **Không xử lý** (mặc định), **Trừ x %** (1–100, nhiều Vi phạm cộng dồn tối đa 100 %) hoặc **Hủy kết quả** (điểm cả Phiên thi bằng 0, ghi "Hủy"). Ví dụ trừ 10 % và 20 % thì điểm 8,0 còn 5,6. Đổi tự do đến khi Công bố, sau đó chỉ đổi qua Phúc khảo. Vi phạm chưa quyết không chặn Công bố, chỉ có cảnh báo "còn N Vi phạm chưa quyết" (Q294).
- *Hoàn tác Buộc nộp và chấm:* điểm trắc nghiệm tự động không cản Hoàn tác 10 phút; Hoàn tác thành công thì điểm tự động của Lượt bị xóa và chấm lại khi người đó nộp lại. Hoàn tác bị chặn khi bạn đã chấm tay một câu của Lượt đó hoặc khi Phiên thi đã Công bố (Q296).
- *Chấm bài nào:* Phiên thi tính điểm lượt cuối thì chỉ chấm Lượt cuối của mỗi người; tính điểm lượt cao nhất thì chấm mọi Lượt (Q292).
- *Ai chấm được:* chủ Phiên thi, hoặc một Người ra đề khác được **Ủy quyền** khi chủ Phiên thi có sự cố (ví dụ ốm). Chủ Phiên thi hoặc Quản trị viên cấp và thu hồi; người nhận không được có tên trong Danh sách dự thi của Phiên thi đó; được chấm tự luận, quyết Mức xử lý, Công bố, xử lý Phúc khảo, xuất Excel, nhưng không sửa hay Hủy Phiên thi, không Đính chính đáp án, không xem Theo dõi trực tiếp; mọi thao tác ghi nhật ký kèm tên người làm (Q307).

## Quyết định cần duyệt (Q285–Q307)

Mỗi dòng: đề xuất của tôi. Chỗ có lựa chọn thật được đánh dấu **[chọn]**.

### Lưu điểm và Chấm tự động

| # | Đề xuất | Lý do |
|---|---|---|
| Q285 | **[đã duyệt 6/11/2026]** Điểm nằm ở **bảng riêng của `grading`** (`response_grades`, `attempt_grades`, `session_gradings`), không thêm cột vào `attempts`/`responses`/`sessions`. **ADR-0008 (proposed)** | Hai bảng đó bị trigger khóa sau khi nộp; thêm cột điểm buộc nới trigger. Tổng điểm tính khi đọc, một nguồn sự thật |
| Q286 | **[đã duyệt 6/11/2026]** Chấm tự động chạy **sau commit của mọi đường nộp** (Người dự thi nộp, hết giờ, Buộc nộp, Đình chỉ, Hủy Phiên thi, Khóa tài khoản) qua cổng `AttemptSubmittedHooks` (cùng mẫu `UserDeactivationHooks`, Q218) → đẩy job BullMQ `grading.autograde`; job quét lặp 30 giây bắt Lượt `submitted` mà chưa có `attempt_grades` (lưới an toàn khi mất job). Chấm **idempotent**, không nằm trong request Nộp bài | Nộp bài vẫn trả về trong vài chục ms như hôm nay; chấm 500 Lượt cùng lúc (Buộc nộp cả phòng) không giữ request nào. `attempt` không import `grading` |
| Q287 | **[đã duyệt 6/11/2026, sửa theo chủ dự án]** Công thức đúng như architecture 5.5. Mỗi câu một dòng `response_grades` (kể cả bỏ trống = 0). **Điểm từng câu làm tròn đến 0,01 (từ 5 trở lên làm tròn lên)**, tính bằng số nguyên đơn vị 0,01; **Điểm thô** = tổng các điểm đã làm tròn (đến 0,01); **Điểm quy đổi = `round(final / max × 10, 1)`, làm tròn đến 0,1** (ví dụ 7,2; 6,5). Điểm thô vẫn hiện cho Người ra đề và trong Excel | Người dự thi cộng tay các điểm câu ra đúng tổng. Hệ quả: hai bài chênh dưới 0,05 điểm có cùng Điểm quy đổi; nếu sau này có ngưỡng đỗ/trượt thì tính trên Điểm thô |
| Q288 | **[đã duyệt 6/11/2026]** Câu **tự luận bỏ trống** (không có câu trả lời hoặc chỉ khoảng trắng) tự được **0 điểm**, nguồn `auto`, không vào hàng đợi chấm | Giảm việc chấm; Người ra đề vẫn sửa được ở bảng Kết quả |
| Q289 | **[đã duyệt 6/11/2026]** `packages/scoring`: hàm thuần `scoreResponse(snapshotItem, value, effectiveKey?)` cho ba Loại câu có đáp án và `resultOf(attempts, attemptScoring, penalties)` cho Kết quả của một người trong Phiên thi. Không I/O. Quy tắc chốt: Mệnh đề để trống tính là *không đúng*; chọn thừa Phương án sai ở câu chọn nhiều bị trừ (tối thiểu 0 điểm); câu trả lời lạ (Phương án không còn trong đề, dữ liệu hỏng) tính 0 điểm và không làm hỏng việc chấm cả bài | Kiểm thử bằng bảng ví dụ và property test (điểm trong [0, max], đơn điệu theo số Mệnh đề đúng) |

### Chấm tự luận

| # | Đề xuất | Lý do |
|---|---|---|
| Q290 | **[đã duyệt 6/11/2026]** Chấm **theo từng câu** trên mọi bài ("chấm câu 5 của cả lớp rồi sang câu 6"), không theo từng bài. Điểm nhập trong `[0, điểm câu]`, bước 0,01; nhận xét tùy chọn ≤ 1000 ký tự. Tự lưu khi rời ô hoặc bấm Tiếp | Cùng một thước đo cho mọi người, theo [ui-design.md](../ui-design.md) mẫu **Chấm** |
| Q291 | **[đã duyệt 6/11/2026]** **Chấm ẩn tên** (thuật ngữ mới `BlindGrading`): mặc định bật, **server** không trả tên, Mã định danh, Lớp trong hàng đợi chấm (chỉ "Bài 17"); thứ tự hàng đợi ngẫu nhiên nhưng ổn định (băm theo mã Lượt) để không đoán người qua thứ tự nộp. Tắt/bật được trước khi Công bố. Bảng Kết quả vẫn hiện tên (đó là màn khác) nhưng khi Chấm ẩn tên đang bật thì **ẩn điểm các câu tự luận** cho đến khi chấm xong mọi câu tự luận, để không đoán được người viết từ điểm | Ẩn ở API chứ không chỉ ở giao diện |
| Q292 | **[đã duyệt 6/11/2026; Ủy quyền ở Q307]** Hàng đợi chứa các Lượt **có thể được tính**: `latest` → Lượt cuối của mỗi người; `highest` → mọi Lượt đã nộp. Chỉ **chủ Phiên thi** chấm (Phiên thi chuyển cho người nhận khi Xóa người dùng thì quyền đi theo, Q205/4e); đồng chấm là backlog | Không bắt chấm bài không bao giờ được tính |
| Q293 | **[đã duyệt 6/11/2026]** Giao diện: máy tính chia đôi (hàng đợi bên trái, bài làm + hướng dẫn chấm + ô điểm bên phải), phím tắt J/K chuyển bài, nút nhanh 0 / ½ / tối đa; điện thoại một bài mỗi màn, Trước/Sau, tiến độ "37/120 đã chấm". Mở bài kế dưới 300 ms (nạp trước bài kế). Hàng đợi mặc định chỉ hiện bài **chưa chấm** (có nút xem cả bài đã chấm để sửa); nhập điểm lớn hơn điểm tối đa của câu thì báo lỗi ngay tại ô và không lưu | Phản hồi tức thời là yêu cầu hàng đầu |

### Mức xử lý, Kết quả, Công bố

| # | Đề xuất | Lý do |
|---|---|---|
| Q294 | **[đã duyệt 6/11/2026]** **Mức xử lý** chọn ở tab "Vi phạm" của màn Kết quả cho từng Vi phạm đã ghi: *không* / *trừ x %* (1–100) / *Hủy kết quả*; đổi tự do đến lúc Công bố, sau đó chỉ qua Phúc khảo. Mặc định *không*; Vi phạm chưa quyết **không chặn** Công bố nhưng hiện cảnh báo "còn N Vi phạm chưa quyết". Ghi qua cổng `ViolationPenalties` do `attempt` cài đặt (bảng `violations` thuộc `attempt`) | Đúng GLOSSARY "Mức xử lý"; không ép quyết mọi cảnh cáo vặt |
| Q295 | **[đã duyệt 6/11/2026]** **Kết quả của một Người dự thi** = công thức data-model (base theo `attempt_scoring`, trừ phần trăm cộng dồn tối đa 100 %, Hủy → 0 ghi "Hủy"), **tính khi đọc**, không lưu bảng tổng hợp. Chốt chỉ đặt `finalized_at`; sau đó mọi đường ghi điểm bị chặn nên kết quả tự đóng băng | Một nguồn sự thật; 500 người là một `GROUP BY` vài mili giây |
| Q296 | **[đã duyệt 6/11/2026]** **Hoàn tác Buộc nộp vs Chấm** (nợ từ Q276): Lượt được coi là "đã Chấm" khi **đã có điểm thủ công của nó hoặc Phiên thi đã Công bố**. Điểm tự động thì không tính, vì nó sinh trong vài giây và sẽ làm cửa sổ 10 phút vô nghĩa. Hoàn tác thành công thì `grading` **xóa điểm tự động** của Lượt trong cùng giao dịch (cổng `AttemptGradeGuard`: `canReopen`, `discard`), nộp lại thì chấm lại | Giữ nguyên lời hứa Hoàn tác 10 phút của lát cắt 4 |
| Q297 **[chọn]** | Người dự thi xem Kết quả gồm: Điểm thô, Điểm quy đổi, từng câu *số thứ tự theo đề của họ + Loại câu + điểm/tối đa + trạng thái đúng / chưa đúng hoàn toàn / sai / bỏ trống* (chùm: "đúng 3/4 Mệnh đề"), nhận xét và bài làm của chính họ với câu **tự luận**; Mức xử lý và lý do nếu có. **Không** hiện nội dung câu trắc nghiệm và lựa chọn của họ. Phương án B: hiện thêm nội dung câu và lựa chọn của họ (vẫn không đáp án). Đề xuất A | Với câu chọn một, "đúng" kèm lựa chọn của họ đã lộ đáp án; A giữ ngân hàng câu hỏi dùng lại được (mục đích của bất biến). Hậu quả: Phúc khảo dựa vào trí nhớ và số thứ tự câu. Cho "xem lại đề" theo từng Phiên thi là backlog |
| Q298 | **Công bố** một lần cho cả Phiên thi, **không hoàn tác**. Điều kiện bật nút: Phiên thi đã kết thúc (không còn Lượt đang làm, và đã quá Khung giờ hoặc đã Đóng cửa vào thi), mọi Lượt đã chấm tự động, mọi Câu tự luận có nội dung đã có điểm. Chọn **Thời hạn phúc khảo** lúc Công bố: mặc định 72 giờ, tối đa 336 giờ, `0` = không nhận Phúc khảo (Chốt ngay). Hộp xác nhận nêu số người, số Vi phạm chưa quyết, hạn Phúc khảo | Cổng một chiều nên xác nhận kỹ nhưng không cần gõ lại |
| Q299 | Sau Công bố: **Hủy Phiên thi** bị chặn (Hủy nghĩa là "không tính Kết quả"); sửa điểm tự luận và Mức xử lý chỉ qua Phúc khảo; thêm trạng thái Phiên thi **Đã Công bố**, **Đã Chốt** vào Q202 | Khớp GLOSSARY |

### Phúc khảo, Chốt, Đính chính

| # | Đề xuất | Lý do |
|---|---|---|
| Q300 | **Phúc khảo**: Người dự thi gửi cho một *câu* hoặc một *Mức xử lý* của **Lượt được tính**, mỗi đối tượng một lần, lý do 10–1000 ký tự, chỉ trong Thời hạn phúc khảo (hạn do server tính từ `released_at`). Người ra đề trả lời bắt buộc (1–1000 ký tự) và đặt điểm mới / Mức xử lý mới (tăng, giảm hoặc giữ); điểm cũ và mới lưu ở `appeals.previous_value/new_value`. Người dự thi nhận thông báo | Đúng GLOSSARY; "có thể tăng hoặc giảm" |
| Q301 | **Chốt** bằng job quét lặp 60 giây: `released_at + hạn` đã qua **và** không còn Phúc khảo `open` thì đặt `finalized_at`. Phúc khảo còn mở chặn Chốt (Người ra đề thấy "N chờ xử lý" trên danh sách Phiên thi); không có hạn xử lý tự động | Đúng architecture 5.6; tránh tự bác Phúc khảo ngầm |
| Q302 | **Đính chính đáp án**: chỉ sửa **Đáp án đúng** của một câu (không đổi Quy tắc chấm, điểm, không bỏ câu). Ghi `key_corrections` (đáp án cũ/mới, lý do, người sửa) và bảng chỉ-thêm `key_correction_effects (correction_id, attempt_id, old_score, new_score)`. Chấm tự động dùng **đáp án hiệu lực** = bản đính chính mới nhất, nếu không có thì `snapshot`. Worker chấm lại câu đó cho mọi Lượt của mọi Phiên thi **chưa Chốt** dùng Bộ đề này; Phiên thi đã Chốt giữ nguyên. Chỉ chủ Bộ đề làm được; ghi `audit_logs`; điểm đã được Người ra đề sửa tay (`manual`/`appeal`) giữ nguyên | Snapshot bất biến (ADR-0005) nên bản đính chính là lớp chồng lên; có vết để giải thích vì sao điểm đổi |
| Q303 | **Thông báo** (mở rộng Q211, vốn chỉ 3 loại): cho Người dự thi *Kết quả đã được Công bố*, *Phúc khảo đã được xử lý*, *Điểm đổi do Đính chính đáp án* (chỉ khi Phiên thi đã Công bố); cho Người ra đề *Có Phúc khảo mới*, gộp: nếu thông báo cùng Phiên thi chưa đọc thì cập nhật số thay vì thêm dòng | 500 người cùng gửi Phúc khảo không làm ngập chuông |

### Xuất Excel, thống kê, ngân sách

| # | Đề xuất | Lý do |
|---|---|---|
| Q304 | **Xuất Excel** từ tab Kết quả, hai trang tính: *Tổng hợp* (Mã định danh, Họ tên, Lớp, số Lượt, Điểm thô, tối đa, Điểm quy đổi, ghi chú: Hủy / trừ x % / chờ chấm) và *Chi tiết* (một cột mỗi câu). Xuất được mọi lúc (chưa Công bố thì tiêu đề ghi "Chưa Công bố"). Tạo thẳng trong API, mục tiêu dưới 1 giây cho 500 người; vượt thì chuyển job worker. Chữ bắt đầu bằng `= + - @` được thêm dấu nháy để chống chèn công thức | ExcelJS đã có; 500 dòng nhỏ |
| Q305 | **Thống kê câu** trên tab Kết quả: mỗi câu số người đúng / một phần / sai / bỏ trống (tính khi đọc). Mục đích chính là giúp Người ra đề *thấy câu nghi sai đáp án* rồi Đính chính; không làm độ phân biệt/độ khó nâng cao | Phát hiện lỗi đáp án trước khi Công bố rẻ hơn sau Phúc khảo |
| Q306 | **Ngân sách thời gian** (đo và ghi vào architecture "Ngân sách phản hồi"): chấm tự động một Lượt dưới 20 ms CPU, 500 Lượt xong trong 10 giây kể từ lúc Buộc nộp cả phòng; mở bài tự luận kế dưới 300 ms; lưu điểm một bài dưới 150 ms; mở bảng Kết quả 500 người dưới 500 ms; Công bố dưới 1 giây; Người dự thi mở Kết quả dưới 300 ms; xuất Excel 500 người dưới 1 giây; không request nào trên 1 giây | Yêu cầu hiệu năng của chủ dự án |
| Q307 | **[đã duyệt 6/11/2026]** **Ủy quyền chấm** (thuật ngữ mới `GradingDelegate`): chủ Phiên thi hoặc Quản trị viên cấp cho **một Người ra đề khác** quyền thay chủ Phiên thi khi có sự cố. Người nhận **không được có tên trong Danh sách dự thi** của Phiên thi đó. Được làm: xem bảng Kết quả, chấm tự luận, quyết Mức xử lý Vi phạm, Công bố, xử lý Phúc khảo, xuất Excel. Không được: sửa hay Hủy Phiên thi, Đính chính đáp án (thuộc chủ Bộ đề), xem Theo dõi trực tiếp. Thu hồi bất cứ lúc nào bởi người cấp hoặc Quản trị viên; chủ Phiên thi vẫn giữ nguyên quyền. Mọi thao tác ghi `audit_logs` kèm tên người thực hiện | Xử lý sự cố sức khỏe của Người ra đề mà không phải Xóa tài khoản để chuyển Phiên thi; nhẹ hơn đồng chấm. Dữ liệu: bảng `session_grading_delegates (session_id, user_id, granted_by, granted_at, revoked_at)`; endpoint `PUT/DELETE /sessions/:id/grading-delegate` |

## Mô hình dữ liệu (đề xuất, thay đổi so với data-model mục 4)

```sql
-- migration 0017 (PR 5a): chấm tự động
response_grades (                          -- một dòng cho MỖI câu của Bộ đề trong mỗi Lượt đã chấm
  attempt_id → attempts ON DELETE RESTRICT, item_id → exam_items ON DELETE RESTRICT,
  score numeric(6,2) NULL,                 -- NULL = Câu tự luận có nội dung, chờ chấm
  source enum('auto','manual','appeal','correction'),
  graded_by → users NULL, graded_at, feedback text NULL CHECK (char_length <= 1000),
  PRIMARY KEY (attempt_id, item_id)
)
attempt_grades (attempt_id PK → attempts ON DELETE RESTRICT, graded_at)   -- dấu "đã chấm tự động xong"
session_gradings (
  session_id PK → sessions ON DELETE RESTRICT,
  blind bool DEFAULT true,                 -- Chấm ẩn tên (Q291)
  released_at NULL, released_by → users NULL, appeal_period_hours int NULL CHECK (0..336),
  finalized_at NULL
)

-- migration 0018 (PR 5d): Phúc khảo và Đính chính
appeals, key_corrections                  -- như data-model, thêm CHECK khớp target; UNIQUE như data-model
key_correction_effects (correction_id → key_corrections, attempt_id → attempts, old_score, new_score)  -- chỉ ghi thêm
```

- Trigger: `response_grades` chỉ INSERT/UPDATE khi Lượt `submitted`; `score` trong `[0, điểm câu]`; `source = 'manual'` phải có `graded_by`; `session_gradings.released_at` và `finalized_at` chỉ đặt một lần, không xóa; sau `finalized_at` mọi ghi `response_grades` của Phiên thi đó bị từ chối (đóng băng ở lớp cơ sở dữ liệu, như Q172, Q217).
- Chỉ mục: `response_grades (attempt_id)`; `response_grades (item_id) WHERE score IS NULL` cho hàng đợi chấm; `attempts (status, id) WHERE status = 'submitted'` đã có thể dùng cho job quét kèm `NOT EXISTS attempt_grades`.
- Không đổi `attempts.status` (không thêm `graded`): "Đã chấm" suy ra (Q285).

## Module và seam

```text
grading/                     (module mới)
  autograde.service          chấm một lô Lượt (idempotent), dùng packages/scoring
  manual-grading.service     hàng đợi theo câu, lưu điểm, ẩn tên ở server
  results.service            bảng Kết quả, Kết quả một người, Thống kê câu, xuất Excel
  release.service           Công bố, Chốt (job), trạng thái Phiên thi
  appeals.service           Người dự thi gửi, Người ra đề xử lý
  key-corrections.service   Đính chính đáp án + chấm lại
cổng (apps/api/src/common):
  AttemptSubmittedHooks     attempt → grading (sau commit)               [grading cài đặt]
  AttemptGradeGuard         session/attempt hỏi canReopen, discard       [grading cài đặt]
  ViolationPenalties        grading đọc/ghi Mức xử lý                    [attempt cài đặt]
  GradedExamContent         grading đọc snapshot, đáp án hiệu lực        [exam cài đặt]
  SessionGradingStatus      session hiện nhãn Đã Công bố/Đã Chốt, chặn Hủy [grading cài đặt]
```

`architecture.test.ts` mở rộng: `grading` không import bảng của `attempt`/`exam`/`session` ngoài qua cổng; ngược lại cũng thế.

**Seam test (đề nghị duyệt theo quy trình tdd):**

| Seam | Bắt được gì | Bỏ sót |
|---|---|---|
| S1 `packages/scoring` hàm thuần: bảng ví dụ cho mọi Loại câu và Quy tắc chấm, làm tròn, `resultOf` (highest/latest, trừ %, Hủy), property test | Sai công thức, sai làm tròn | Ghép dữ liệu thật |
| S2 HTTP + PostgreSQL: nộp → có điểm; chấm lại idempotent; tự luận bỏ trống = 0; Đình chỉ/Buộc nộp vẫn chấm phần đã lưu | Luồng đủ, hook + job + job quét | Đồng thời |
| S3 Trigger: sửa điểm sau Chốt, `score` ngoài khoảng, `manual` thiếu người chấm, đặt `released_at` hai lần | Lớp bảo vệ cơ sở dữ liệu | Logic nghiệp vụ |
| S4 Đồng thời: Hoàn tác Buộc nộp xen autograde; hai Người dự thi cùng Phúc khảo; Đính chính xen Công bố; Chốt xen Phúc khảo mới | Đua nhau | Tải |
| S5 Bảo mật: quét JSON mọi response của Người dự thi tìm `key`, `correctKey`, `rubric`, đáp án; Người ra đề khác chủ Phiên thi nhận 404; Chấm ẩn tên không lộ tên/mã trong JSON hàng đợi | Lộ đáp án và danh tính | — |
| S6 Playwright (desktop và mobile): chấm tự luận bằng phím, Công bố, Người dự thi xem Kết quả và gửi Phúc khảo, Người ra đề xử lý, Đính chính; đo thời gian | Luồng người dùng | — |
| S7 Tải: 500 Lượt nộp cùng lúc → thời gian chấm xong, ảnh hưởng tới p95 lưu bài; 500 người mở Kết quả | Ngân sách Q306 | — |

## API (đề xuất)

Người ra đề (chủ Phiên thi, người khác 404):

| Phương thức | Đường dẫn | Việc |
|---|---|---|
| GET | `/sessions/:id/results` | Bảng Kết quả + trạng thái Chấm/Công bố/Chốt + cảnh báo (chờ chấm, Vi phạm chưa quyết, Phúc khảo mở) |
| GET | `/sessions/:id/grading/items` | Danh sách câu tự luận kèm tiến độ chấm |
| GET | `/sessions/:id/grading/items/:itemId/queue` | Hàng đợi (ẩn tên nếu `blind`); trả cả bài kế để nạp trước |
| PUT | `/sessions/:id/grading/attempts/:attemptId/items/:itemId` | Lưu điểm + nhận xét (idempotent) |
| PUT | `/sessions/:id/grading/blind` | Bật/tắt Chấm ẩn tên (trước Công bố) |
| PUT | `/sessions/:id/violations/:violationId/penalty` | Mức xử lý (trước Công bố) |
| GET | `/sessions/:id/results/item-stats` | Thống kê câu |
| POST | `/sessions/:id/release` | Công bố `{ appealPeriodHours }` |
| GET | `/sessions/:id/appeals` · POST `/sessions/:id/appeals/:appealId/resolve` | Danh sách và xử lý Phúc khảo |
| POST | `/exams/:examId/items/:itemId/key-correction` | Đính chính đáp án |
| GET | `/sessions/:id/results.xlsx` | Xuất Excel |

Người dự thi (đúng người, đã Công bố):

| Phương thức | Đường dẫn | Việc |
|---|---|---|
| GET | `/take/sessions/:id/result` | Kết quả của chính họ (Q297); trước Công bố trả 409 `NOT_RELEASED` |
| POST | `/take/sessions/:id/appeals` | Gửi Phúc khảo `{ target, itemId \| violationId, reason }` |

## Giao diện

- **Người ra đề:** thêm tab **Kết quả** vào chi tiết Phiên thi (cạnh Theo dõi). Đầu tab là thanh bước *Đã nộp → Đã chấm → Công bố → Phúc khảo → Chốt* với việc kế tiếp nổi bật ("Còn 37 bài tự luận chưa chấm"). Bảng người (Mã, Tên, Lớp, Điểm thô, Điểm quy đổi, nhãn *chờ chấm / Hủy / trừ x %*), lọc, sắp xếp; ngăn chi tiết từng người (điểm từng câu). Nút Chấm tự luận, Vi phạm, Thống kê câu, Phúc khảo (kèm số chờ), Công bố, Xuất Excel. Điện thoại: bảng thành thẻ, cùng chức năng.
- **Màn Chấm:** như Q293.
- **Người dự thi:** thẻ Phiên thi ở "Phiên thi của tôi" có nhãn *Đã có Kết quả* và nút Xem Kết quả; màn Kết quả như Q297 với nút Phúc khảo cạnh từng câu còn trong hạn (đếm ngược "còn 41 giờ"). Gõ lý do ở hộp thoại, đã gửi thì hiện trạng thái *Chờ xử lý / Đã xử lý + câu trả lời*.
- Mọi thao tác kéo dài (Công bố, xuất Excel, Đính chính) hiện trạng thái đang làm bằng nút `loading` như các màn hiện có, không chặn phần còn lại.

## Chia PR (đề xuất)

| PR | Phạm vi | Migration | Seam |
|---|---|---|---|
| **5a** Chấm tự động | `packages/scoring` (ba Loại câu + `resultOf`), `grading` autograde + hook + job + job quét, `AttemptGradeGuard` (Q296), migration 0017 (không gồm Phúc khảo), test kiến trúc | 0017 | S1, S2, S3, S4 (một phần) |
| **5b** Chấm tự luận và bảng Kết quả | hàng đợi ẩn tên, lưu điểm, Mức xử lý Vi phạm, bảng Kết quả, Thống kê câu; tab Kết quả; màn Chấm | không | S2, S5, S6 |
| **5c** Công bố và xem Kết quả | `session_gradings` hoạt động, Công bố, Kết quả cho Người dự thi, thông báo, chặn Hủy sau Công bố, xuất Excel | không | S2, S5, S6 |
| **5d** Phúc khảo, Chốt, Đính chính | migration 0018, Phúc khảo hai phía, job Chốt, Đính chính + chấm lại + `key_correction_effects` | 0018 | S2, S3, S4, S6 |
| **5e** Hoàn thiện | đo tải 500 (S7), kịch bản `demo:room` có chấm, `demo-data/README.md`, README, cập nhật architecture/data-model/GLOSSARY | không | S7 |

Quy trình mỗi PR như lát cắt 4: thiết kế chi tiết và seam test của PR đó chốt với chủ dự án trước; làm theo lát dọc đỏ-xanh; `code-review` hai trục; PR bằng skill `pr`; chờ CI xanh; chỉ merge khi chủ dự án ra lệnh nêu số PR.

## Thuật ngữ mới (sẽ vào GLOSSARY khi duyệt)

- **Chấm ẩn tên** (`BlindGrading`): Người ra đề chấm Câu tự luận mà không thấy tên, Mã định danh, Lớp của người làm bài; bật mặc định.
- **Ủy quyền chấm** (`GradingDelegate`): Người ra đề được chủ Phiên thi hoặc Quản trị viên giao quyền chấm và Công bố thay khi chủ Phiên thi có sự cố; không phải chuyển quyền sở hữu.
- Sửa mục **Hoàn tác Buộc nộp** ("khi Lượt đã được Chấm" → "khi đã có điểm thủ công của Lượt hoặc Phiên thi đã Công bố", Q296).
- Bổ sung trạng thái Phiên thi **Đã Công bố**, **Đã Chốt** (đã dự kiến ở Q202).

## Rủi ro và giới hạn đã biết

- **Chấm ẩn tên không che được danh tính nếu bài tự luận tự nêu tên** hoặc chữ viết nhận ra được; đây là hạn chế chấp nhận, không phải lỗi.
- **Phúc khảo mở chặn Chốt vô hạn** nếu Người ra đề bỏ quên (Q301); cân nhắc nhắc việc ở backlog.
- **Q297 phương án A** làm Phúc khảo khó hơn (không xem lại đề). Nếu thực tế than phiền, thêm công tắc "Cho xem lại đề" theo Phiên thi mà không đổi mô hình.
- **Đính chính sau Công bố đổi điểm đã công khai**: đó là mục đích, nên có thông báo và vết (`key_correction_effects`); Phiên thi đã Chốt không đổi.
- **Chấm lại hàng loạt chạy cùng lúc với giờ thi** (Đính chính khi Phiên thi khác đang diễn ra) tải nền của worker; job chấm chạy theo lô nhỏ, ưu tiên thấp hơn job tự nộp (cùng hàng đợi nhưng giới hạn song song).
- **Số 500 Lượt chấm cùng lúc** chưa đo; Q306 và S7 là cách kiểm.
- **Quyền Quản trị viên**: chưa cho chấm hay xem Kết quả thay Người ra đề (giữ phân quyền hiện tại); thêm nếu thực tế cần.

## Việc cần làm ở tài liệu khác khi duyệt

- `data-model.md` mục 4–5: thay các dòng "lát cắt 5 thêm cột điểm" bằng `response_grades`, `attempt_grades`, `session_gradings`; bỏ `attempts.status = 'graded'`; thêm `key_correction_effects`.
- `architecture.md` 5.3 (chấm qua hook + job), 5.6 (trạng thái suy ra, Q296–Q302), mục 11 "Ngân sách phản hồi" (Q306).
- GLOSSARY: Chấm ẩn tên; sửa Hoàn tác Buộc nộp.
- README: bảng lát cắt và mục "Dùng thử lát cắt 5".
