# Lát cắt 5: Chấm, Công bố kết quả, Phúc khảo

> Trạng thái: **accepted** (6/11/2026): chủ dự án đã duyệt từng quyết định Q285–Q307 qua hỏi đáp. Chưa có dòng code nào; mỗi PR 5a–5e vẫn cần thiết kế chi tiết và seam test được duyệt riêng. Thuật ngữ theo [GLOSSARY.md](../../GLOSSARY.md) (Chấm, Kết quả, Điểm thô, Điểm quy đổi, Công bố kết quả, Phúc khảo, Thời hạn phúc khảo, Chốt kết quả, Đính chính đáp án, Mức xử lý, Hủy kết quả). Nền tảng: [architecture.md](../architecture.md) mục 5.5–5.6, [data-model.md](../data-model.md) mục 4, [ADR-0005](../adr/0005-chup-noi-dung-khi-phat-hanh.md), [ADR-0008](../adr/0008-diem-nam-o-bang-rieng-cua-grading.md) (accepted).

## Mục tiêu

Sau lát cắt 5, vòng đời trọn vẹn của một kỳ thi chạy được:

1. Lượt làm bài vừa nộp là được **Chấm tự động** (câu chọn một, chọn nhiều, chùm đúng/sai) trong vài giây, không chờ ai bấm.
2. Người ra đề **chấm Câu tự luận** theo từng câu, ẩn tên, nhập điểm bằng bàn phím hoặc ngón tay, tự lưu.
3. Người ra đề quyết **Mức xử lý** cho các Vi phạm đã ghi ở lát cắt 4 (không, trừ phần trăm, Hủy kết quả).
4. Người ra đề xem **bảng Kết quả** cả Phiên thi, **Công bố kết quả**; Người dự thi xem điểm từng câu mà **không bao giờ thấy Đáp án đúng**.
5. Người dự thi gửi **Phúc khảo** trong Thời hạn phúc khảo; Người ra đề xử lý; hết hạn và hết Phúc khảo thì **Chốt**.
6. Phát hiện nhập sai đáp án thì **Đính chính đáp án**: chấm lại tự động cho các Phiên thi chưa Chốt.
7. **Xuất Excel** Kết quả.

**Ngoài phạm vi (ghi vào backlog):** đồng chấm nhiều giám khảo cho một Phiên thi; bỏ câu / cho mọi người điểm tối đa một câu; đổi Quy tắc chấm hay điểm của câu sau Phát hành; Quản trị viên chấm thay; thống kê nâng cao (độ phân biệt, độ khó theo lý thuyết trắc nghiệm).

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
- *Cho Người dự thi xem lại đề:* khi thiết lập Phiên thi có công tắc **"Cho xem lại đề sau Công bố"**, mặc định tắt. Tắt: sau Công bố Người dự thi chỉ thấy điểm từng câu, trạng thái (đúng / chưa đúng hoàn toàn / sai / bỏ trống), nhận xét và bài tự luận của chính họ. Bật: thấy thêm nội dung câu hỏi và lựa chọn của chính họ. Dù bật hay tắt, **không bao giờ** thấy Đáp án đúng. Nên tắt nếu bạn dùng lại đề cho kỳ sau, bật nếu không; đổi được đến lúc Công bố (Q297).
- *Sau khi Công bố:* không Hủy được Phiên thi; không sửa trực tiếp điểm tự luận hay Mức xử lý. Mọi thay đổi điểm đi qua Phúc khảo hoặc Đính chính đáp án, luôn có vết (Q299).
- *Đã Chốt:* hiện khi đã hết Thời hạn phúc khảo và không còn Phúc khảo chờ xử lý (trong vòng 1 phút); chọn "không nhận Phúc khảo" thì Chốt ngay sau khi Công bố. Hết hạn mà còn Phúc khảo chờ thì vẫn "Đã Công bố", danh sách hiện "N Phúc khảo chờ xử lý"; hệ thống không tự bác. Sau hạn Người dự thi không gửi Phúc khảo mới được. Sau khi Chốt điểm không đổi nữa (Q301).
- *Phúc khảo (Người dự thi gửi):* cho một câu hoặc một Mức xử lý của Lượt được tính, mỗi đối tượng một lần, kèm lý do 10–1000 ký tự, trong Thời hạn phúc khảo. Điểm có thể tăng hoặc giảm. Người ra đề xem lý do, bài làm, đặt điểm mới hoặc Mức xử lý mới và bắt buộc trả lời (1–1000 ký tự); điểm cũ và mới đều được lưu; Người dự thi nhận thông báo (Q300).
- *Đính chính đáp án:* khi nhập nhầm đáp án đúng của một câu, chủ Bộ đề đính chính (đáp án mới + lý do). Hệ thống chấm lại câu đó cho mọi Phiên thi dùng Bộ đề mà chưa Chốt; Phiên thi đã Chốt giữ nguyên. Điểm bạn đã chấm tay hay sửa qua Phúc khảo không bị đổi. Hộp xác nhận nêu trước bao nhiêu người tăng, bao nhiêu người giảm điểm; Phiên thi đã Công bố thì người đổi điểm nhận thông báo. Chỉ sửa được Đáp án đúng, không đổi điểm câu hay bỏ câu (Q302).
- *Thông báo (chuông):* Người dự thi nhận khi Kết quả được Công bố, khi Phúc khảo của mình được xử lý, và khi điểm đổi do Đính chính đáp án (nếu đã Công bố). Bạn nhận "Có Phúc khảo mới"; nhiều Phúc khảo cùng Phiên thi chưa đọc thì gộp thành một dòng và cập nhật số (số chính xác xem ở danh sách Phúc khảo) (Q303).
- *Xuất Excel:* tải được bất cứ lúc nào từ tab Kết quả. Trang *Tổng hợp* có phần đầu ghi thông tin chung (Tên Phiên thi, Ngày diễn ra, Thời gian làm bài, Tổng số câu), rồi bảng mỗi người một dòng (Mã định danh, Họ tên, Lớp, số Lượt, Điểm thô, Tổng điểm Bộ đề, Điểm quy đổi, Ghi chú: trừ x % / Hủy / chờ chấm); trang *Chi tiết* mỗi câu một cột. Chưa Công bố thì ghi "Chưa Công bố" ở đầu trang (Q304).
- *Thống kê câu:* bảng mỗi câu một dòng với số người đúng / một phần / sai / bỏ trống, sắp xếp được theo tỷ lệ đúng thấp nhất lên đầu. Câu có tỷ lệ đúng bất thường thấp là dấu hiệu nghi sai đáp án; kiểm tra trước khi Công bố, nếu nhập nhầm thì Đính chính đáp án (Q305).
- *Chấm bài nào:* Phiên thi tính điểm lượt cuối thì chỉ chấm Lượt cuối của mỗi người; tính điểm lượt cao nhất thì chấm mọi Lượt (Q292).
- *Ai chấm được:* chủ Phiên thi, hoặc một Người ra đề khác được **Ủy quyền** khi chủ Phiên thi có sự cố (ví dụ ốm). Chủ Phiên thi hoặc Quản trị viên cấp và thu hồi; người nhận không được có tên trong Danh sách dự thi của Phiên thi đó; được chấm tự luận, quyết Mức xử lý, Công bố, xử lý Phúc khảo, xuất Excel, nhưng không sửa hay Hủy Phiên thi, không Đính chính đáp án, không xem Theo dõi trực tiếp; mọi thao tác ghi nhật ký kèm tên người làm (Q307).

## Quyết định (Q285–Q307, đã duyệt)

Mỗi dòng: đề xuất của tôi. Chỗ có lựa chọn thật được đánh dấu **[chọn]**.

### Lưu điểm và Chấm tự động

| # | Đề xuất | Lý do |
|---|---|---|
| Q285 | **[đã duyệt 6/11/2026]** Điểm nằm ở **bảng riêng của `grading`** (`response_grades`, `attempt_grades`, `session_gradings`), không thêm cột vào `attempts`/`responses`/`sessions`. **ADR-0008 (accepted)** | Hai bảng đó bị trigger khóa sau khi nộp; thêm cột điểm buộc nới trigger. Tổng điểm tính khi đọc, một nguồn sự thật |
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
| Q297 | **[đã duyệt 6/11/2026: phương án C]** Người dự thi xem Kết quả gồm: Điểm thô, Điểm quy đổi, từng câu *số thứ tự theo đề của họ + Loại câu + điểm/tối đa + trạng thái đúng / chưa đúng hoàn toàn / sai / bỏ trống* (chùm: "đúng 3/4 Mệnh đề"), nhận xét và bài làm của chính họ với câu **tự luận**; Mức xử lý và lý do nếu có. **Mặc định không** hiện nội dung câu trắc nghiệm và lựa chọn của họ. Mỗi Phiên thi có **công tắc "Cho xem lại đề sau Công bố"** (thiết lập của Phiên thi, mặc định tắt, đổi được đến lúc Công bố); bật thì hiện thêm nội dung câu và lựa chọn của chính họ, vẫn **không bao giờ** hiện Đáp án đúng. Dữ liệu: cột `review_after_release bool DEFAULT false` ở `sessions` (cùng nhóm với `show_scoring_rules`) | Với câu chọn một, "đúng" kèm lựa chọn của họ đã lộ đáp án nên mặc định giữ ngân hàng câu hỏi dùng lại được; Phiên thi không dùng lại đề thì bật để Phúc khảo dễ hơn |
| Q298 | **[đã duyệt 6/11/2026]** **Công bố** một lần cho cả Phiên thi, **không hoàn tác**. Điều kiện bật nút: Phiên thi đã kết thúc (không còn Lượt đang làm, và đã quá Khung giờ hoặc đã Đóng cửa vào thi), mọi Lượt đã chấm tự động, mọi Câu tự luận có nội dung đã có điểm. Chọn **Thời hạn phúc khảo** lúc Công bố tính theo **ngày, từ 1 đến 14 ngày**, mặc định 3 ngày (72 giờ); hoặc chọn *không nhận Phúc khảo* (Chốt ngay). Lưu theo giờ: `0` hoặc 24–336. Hộp xác nhận nêu số người, số Vi phạm chưa quyết, hạn Phúc khảo | Cổng một chiều nên xác nhận kỹ nhưng không cần gõ lại |
| Q299 | **[đã duyệt 6/11/2026]** Sau Công bố: **Hủy Phiên thi** bị chặn (Hủy nghĩa là "không tính Kết quả"); sửa điểm tự luận và Mức xử lý chỉ qua Phúc khảo; thêm trạng thái Phiên thi **Đã Công bố**, **Đã Chốt** vào Q202 | Khớp GLOSSARY |

### Phúc khảo, Chốt, Đính chính

| # | Đề xuất | Lý do |
|---|---|---|
| Q300 | **[đã duyệt 6/11/2026]** **Phúc khảo**: Người dự thi gửi cho một *câu* hoặc một *Mức xử lý* của **Lượt được tính**, mỗi đối tượng một lần, lý do 10–1000 ký tự, chỉ trong Thời hạn phúc khảo (hạn do server tính từ `released_at`). Người ra đề trả lời bắt buộc (1–1000 ký tự) và đặt điểm mới / Mức xử lý mới (tăng, giảm hoặc giữ); điểm cũ và mới lưu ở `appeals.previous_value/new_value`. Người dự thi nhận thông báo. Hộp gửi Phúc khảo ghi rõ "Điểm có thể tăng hoặc giảm sau khi xem xét lại" | Đúng GLOSSARY; "có thể tăng hoặc giảm" |
| Q301 | **[đã duyệt 6/11/2026]** **Chốt** bằng job quét lặp 60 giây: `released_at + hạn` đã qua **và** không còn Phúc khảo `open` thì đặt `finalized_at`. Phúc khảo còn mở chặn Chốt (Người ra đề thấy "N chờ xử lý" trên danh sách Phiên thi); không có hạn xử lý tự động. Chốt ngay khi Công bố với "không nhận Phúc khảo"; xử lý xong Phúc khảo cuối cùng sau hạn thì kiểm tra Chốt ngay (không chờ job). Sau hạn không gửi được Phúc khảo mới dù Phiên thi chưa Chốt | Đúng architecture 5.6; tránh tự bác Phúc khảo ngầm |
| Q302 | **[đã duyệt 6/11/2026]** **Đính chính đáp án**: chỉ sửa **Đáp án đúng** của một câu (không đổi Quy tắc chấm, điểm, không bỏ câu). Ghi `key_corrections` (đáp án cũ/mới, lý do, người sửa) và bảng chỉ-thêm `key_correction_effects (correction_id, attempt_id, old_score, new_score)`. Chấm tự động dùng **đáp án hiệu lực** = bản đính chính mới nhất, nếu không có thì `snapshot`. Worker chấm lại câu đó cho mọi Lượt của mọi Phiên thi **chưa Chốt** dùng Bộ đề này; Phiên thi đã Chốt giữ nguyên. Chỉ chủ Bộ đề làm được; ghi `audit_logs`; điểm đã được Người ra đề sửa tay (`manual`/`appeal`) giữ nguyên. Hộp xác nhận nêu trước "N người tăng điểm, M người giảm điểm". "Câu sai hẳn, cho mọi người điểm tối đa" để backlog | Snapshot bất biến (ADR-0005) nên bản đính chính là lớp chồng lên; có vết để giải thích vì sao điểm đổi |
| Q303 | **[đã duyệt 6/11/2026]** **Thông báo** (mở rộng Q211, vốn chỉ 3 loại): cho Người dự thi *Kết quả đã được Công bố*, *Phúc khảo đã được xử lý*, *Điểm đổi do Đính chính đáp án* (chỉ khi Phiên thi đã Công bố); cho Người ra đề *Có Phúc khảo mới*, gộp: nếu thông báo cùng Phiên thi chưa đọc thì cập nhật số thay vì thêm dòng | 500 người cùng gửi Phúc khảo không làm ngập chuông |

### Xuất Excel, thống kê, ngân sách

| # | Đề xuất | Lý do |
|---|---|---|
| Q304 | **[đã duyệt 6/11/2026, bổ sung theo chủ dự án]** **Xuất Excel** từ tab Kết quả, hai trang tính: *Tổng hợp* (phần đầu là **thông tin chung của Phiên thi**: Tên Phiên thi, Ngày diễn ra (ví dụ 16/11/2026; nếu Khung giờ kéo qua nhiều ngày thì ghi khoảng ngày), Thời gian làm bài (ví dụ 30 phút), Tổng số câu (ví dụ 40 câu); sau đó bảng từng người gồm Mã định danh, Họ tên, Lớp, số Lượt, Điểm thô, tối đa, Điểm quy đổi, ghi chú: Hủy / trừ x % / chờ chấm) và *Chi tiết* (một cột mỗi câu). Xuất được mọi lúc (chưa Công bố thì tiêu đề ghi "Chưa Công bố"). Tạo thẳng trong API, mục tiêu dưới 1 giây cho 500 người; vượt thì chuyển job worker. Chữ bắt đầu bằng `= + - @` được thêm dấu nháy để chống chèn công thức | ExcelJS đã có; 500 dòng nhỏ |
| Q305 | **[đã duyệt 6/11/2026]** **Thống kê câu** trên tab Kết quả: mỗi câu số người đúng / một phần / sai / bỏ trống (tính khi đọc). Mục đích chính là giúp Người ra đề *thấy câu nghi sai đáp án* rồi Đính chính; không làm độ phân biệt/độ khó nâng cao | Phát hiện lỗi đáp án trước khi Công bố rẻ hơn sau Phúc khảo |
| Q306 | **[đã duyệt 6/11/2026]** **Ngân sách thời gian** (đo và ghi vào architecture "Ngân sách phản hồi"): chấm tự động một Lượt dưới 20 ms CPU, 500 Lượt xong trong 10 giây kể từ lúc Buộc nộp cả phòng; mở bài tự luận kế dưới 300 ms; lưu điểm một bài dưới 150 ms; mở bảng Kết quả 500 người dưới 500 ms; Công bố dưới 1 giây; Người dự thi mở Kết quả dưới 300 ms; xuất Excel 500 người dưới 1 giây; không request nào trên 1 giây | Yêu cầu hiệu năng của chủ dự án |
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
  released_at NULL, released_by → users NULL, appeal_period_hours int NULL CHECK (appeal_period_hours = 0 OR appeal_period_hours BETWEEN 24 AND 336),
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
- **Mặc định không cho xem lại đề (Q297)** làm Phúc khảo khó hơn; Người ra đề bật công tắc "Cho xem lại đề" của Phiên thi khi không dùng lại đề.
- **Đính chính sau Công bố đổi điểm đã công khai**: đó là mục đích, nên có thông báo và vết (`key_correction_effects`); Phiên thi đã Chốt không đổi.
- **Chấm lại hàng loạt chạy cùng lúc với giờ thi** (Đính chính khi Phiên thi khác đang diễn ra) tải nền của worker; job chấm chạy theo lô nhỏ, ưu tiên thấp hơn job tự nộp (cùng hàng đợi nhưng giới hạn song song).
- **Số 500 Lượt chấm cùng lúc** chưa đo; Q306 và S7 là cách kiểm.
- **Quyền Quản trị viên**: chưa cho chấm hay xem Kết quả thay Người ra đề (giữ phân quyền hiện tại); thêm nếu thực tế cần.

## Việc cần làm ở tài liệu khác khi duyệt

- `data-model.md` mục 4–5: thay các dòng "lát cắt 5 thêm cột điểm" bằng `response_grades`, `attempt_grades`, `session_gradings`; bỏ `attempts.status = 'graded'`; thêm `key_correction_effects`.
- `architecture.md` 5.3 (chấm qua hook + job), 5.6 (trạng thái suy ra, Q296–Q302), mục 11 "Ngân sách phản hồi" (Q306).
- GLOSSARY: Chấm ẩn tên; sửa Hoàn tác Buộc nộp.
- README: bảng lát cắt và mục "Dùng thử lát cắt 5".

## PR 5a: thiết kế chi tiết (đã duyệt 6/11/2026)

**Phạm vi:** chấm tự động chạy đúng và có điểm trong cơ sở dữ liệu. **Chưa có màn hình nào** (màn Kết quả và Chấm là 5b); kiểm chứng bằng test tích hợp và đo thời gian. Không đụng giao diện web.

### 1. `packages/scoring` (hàm thuần, không I/O)

- `scoreResponse(item, value, keyOverride?) → { score, verdict }`: `item` là `{ type, points, payload }` lấy từ bản chụp; `value` là `value` của Câu trả lời (hình dạng đã có ở `responseSchemaFor`); `keyOverride` chỗ để 5d truyền Đáp án đúng đã Đính chính. `verdict` ∈ `correct | partial | wrong | blank | pending` (`pending` = tự luận có nội dung, chờ chấm tay).
- Điểm tính bằng **số nguyên đơn vị 0,01** rồi mới đổi ra số thập phân, làm tròn half-up (Q287). Câu trả lời không hợp lệ (Phương án không còn trong đề, kiểu sai) cho 0 điểm và `wrong`, không ném lỗi (Q289).
- `resultOf({ attempts, attemptScoring, penalties }) → { rawScore, maxScore, penaltyPercent, voided, scaledScore }` theo Q295. Dùng ở 5b nhưng viết và test ở 5a vì cùng gói và cùng quy tắc làm tròn.
- Chạy được ở cả Node và trình duyệt (không import gì ngoài `@exam/shared`).

### 2. Cơ sở dữ liệu (migration 0017)

Chỉ hai bảng của Q285; ba bảng còn lại của data-model làm ở PR sau.

- `response_grades (attempt_id, item_id, score numeric(6,2) NULL, source, graded_by NULL, graded_at, feedback NULL)`, khóa chính `(attempt_id, item_id)`, `attempt_id → attempts ON DELETE RESTRICT`.
- `attempt_grades (attempt_id PK → attempts ON DELETE RESTRICT, graded_at)`.
- Trigger `response_grades_guard`: chỉ INSERT/UPDATE khi Lượt đã `submitted`; `score` trong `[0, điểm câu]`; `source = 'manual'` phải có `graded_by`. (Chặn theo Phiên thi đã Chốt thêm ở 5c khi có `session_gradings`.)
- Chỉ mục: `response_grades (item_id) WHERE score IS NULL` (hàng đợi chấm ở 5b); `attempts (submitted_at) WHERE status = 'submitted'` cho job quét.
- `source` ở 5a chỉ ghi `auto`; các giá trị còn lại có sẵn trong kiểu enum cho 5b–5d.

### 3. Luồng chấm

```text
nộp (Người dự thi / hết giờ / Buộc nộp / Đình chỉ / Hủy Phiên thi / Khóa tài khoản)
  → sau commit: AttemptSubmittedHooks.onSubmitted(attemptIds)      [cổng, grading cài đặt]
      → enqueue job "grading.autograde" { attemptIds }             [theo lô ≤ 50]
  → worker: GradingService.autogradeAttempts(ids)
      1. đọc Lượt đã nộp + Câu trả lời + bản chụp Bộ đề (cổng EXAM_CONTENT)
      2. scoreResponse cho MỌI câu của Bộ đề → upsert response_grades (bỏ qua dòng source ≠ auto)
      3. ghi attempt_grades (cùng giao dịch)
job "grading.sweep" (lặp) → tìm Lượt submitted chưa có attempt_grades → autogradeAttempts
```

- **Idempotent:** chạy lại ra cùng kết quả; không ghi đè điểm `manual/appeal/correction` (có từ 5b).
- **Giao dịch:** mỗi lô trong một giao dịch; một Lượt lỗi (bản chụp thiếu) được ghi log và bỏ qua, không làm hỏng cả lô, lần quét sau thử lại.
- **Cổng mới** trong `apps/api/src/common`: `AttemptSubmittedHooks` (attempt gọi, grading cài), `AttemptGradeGuard` (xem mục 4). Test kiến trúc cấm `grading` đọc bảng của `attempt`/`exam` và ngược lại.
- Nơi gọi hook: `closeInProgress` đã trả về id Lượt vừa đóng; các nơi gọi (Nộp bài, Hủy Phiên thi, Khóa tài khoản, Buộc nộp, Đình chỉ) gọi hook **sau commit**; job tự nộp hết giờ gọi ngay sau lô của nó. Chỗ nào gọi trong giao dịch chưa commit thì job quét bắt (mục dưới).
- **Job quét chạy mỗi 5 giây** (đề xuất đổi từ 30 giây của Q286) và chỉ xét Lượt nộp trong **24 giờ gần nhất**, nên truy vấn luôn nhẹ dù lịch sử lớn. Lượt cũ hơn mà vẫn chưa chấm (job chết lâu) được chấm khi Người ra đề mở bảng Kết quả ở 5b (gọi `autogradeSession`).

### 4. Hoàn tác Buộc nộp (Q296)

Cổng `AttemptGradeGuard` do `grading` cài, `attempt` dùng:
- `canReopen(attemptId)` → `false` nếu Lượt đã có dòng `source = 'manual'` hoặc Phiên thi đã Công bố (điều kiện thứ hai chỉ có nghĩa từ 5c; ở 5a luôn `false` cho nó).
- `discard(tx, attemptId)` xóa `response_grades` và `attempt_grades` của Lượt trong cùng giao dịch Hoàn tác.
- Mã lỗi mới khi bị chặn: 409 `INVALID_STATE` với `reason: 'ALREADY_GRADED'`; thêm chữ tiếng Việt cho lý do này.

### 5. Seam test và ca cần có

| Seam | Ca chính |
|---|---|
| **S1 `packages/scoring`** | Bảng ví dụ mọi Loại câu và Quy tắc chấm: chọn một đúng/sai/bỏ trống; chọn nhiều tỷ lệ (đúng 2/3, đúng 2 + thừa 1, thừa nhiều không âm), đúng hết; chùm tỷ lệ, đúng hết, bậc thang (ví dụ `[0, 0,1, 0,25, 0,5, 1]`, Mệnh đề bỏ trống = không đúng); tự luận trống = 0 `blank`, có chữ `pending`, chỉ khoảng trắng = trống; làm tròn 1,33 / 0,67; giá trị lạ → 0 `wrong`; `keyOverride`. Property: điểm trong `[0, max]`; đúng thêm một Mệnh đề không làm giảm điểm. `resultOf`: highest/latest, trừ % cộng dồn tối đa 100, Hủy → 0, Điểm quy đổi 0,1 (6,45 → 6,5) |
| **S2 HTTP + PostgreSQL** | Nộp bài → trong vài giây có đủ `response_grades` cho mọi câu của Bộ đề (kể cả câu không trả lời) và `attempt_grades`; đúng điểm với Bộ đề bốn Loại câu; tự luận có chữ để `score NULL`; Buộc nộp cả phòng 20 Lượt → đều được chấm; Đình chỉ chấm phần đã lưu; chạy chấm hai lần cùng kết quả; hết giờ (job tự nộp) cũng được chấm |
| **S3 Trigger** | INSERT khi Lượt đang làm bị từ chối; `score` âm hoặc lớn hơn điểm câu bị từ chối; `manual` thiếu `graded_by` bị từ chối |
| **S4 Đồng thời** | Hai worker chấm cùng một lô không sinh dòng trùng hay lỗi; Hoàn tác Buộc nộp xen autograde (kết quả: hoặc Lượt đã mở lại và không còn điểm, hoặc Hoàn tác thấy điểm tự động và vẫn thành công rồi xóa); chấm xen Hoàn tác không để điểm mồ côi |
| **Kiến trúc** | `grading` không import bảng `attempt`/`exam`; chạy được trong `architecture.test.ts` |
| **Hoàn tác (S2)** | Hoàn tác thành công xóa điểm tự động, nộp lại thì chấm lại; bị chặn 409 `ALREADY_GRADED` khi đã có điểm `manual` (dựng bằng SQL vì chưa có API chấm tay) |

### 6. Ngân sách thời gian (ghi và đo)

- Chấm một Lượt 50 câu dưới 20 ms (đo trong test).
- 500 Lượt nộp cùng lúc (`load:exam` hiện có thêm bước nộp) xong chấm trong **10 giây**; ghi p95 của lưu bài và heartbeat trong lúc đó để chắc chấm nền không làm chậm.
- Request Nộp bài không chậm hơn so với trước 5a (đo trước/sau).

### 7. Không nằm trong 5a

API và màn hình cho Người ra đề (5b), `session_gradings`, Công bố, `review_after_release` (5c), Phúc khảo, Đính chính, `key_correction_effects` (5d), Ủy quyền chấm (cần cùng lúc có API ở 5b).

### PR 5a: ghi chú triển khai (6/11/2026)

- **`packages/scoring`** (29 test): `scoreResponse` (bốn Loại câu, ba Quy tắc chấm, `keyOverride` cho Đính chính ở 5d), `resultOf`, và số học theo đơn vị 0,01 (`centi.ts`) nên không có số lẻ nhị phân. Mệnh đề bỏ trống tính là không đúng; dữ liệu lạ cho 0 điểm và không ném lỗi; tự luận chỉ khoảng trắng là bỏ trống. Gói không phụ thuộc gói nào.
- **Migration 0017:** `response_grades`, `attempt_grades`, enum `response_grade_source`, chỉ mục `response_grades_pending_idx` (tự luận chờ chấm) và `attempts_submitted_idx` (job quét). Trigger `response_grades_guard` (Lượt phải đã nộp, khóa dòng Lượt `FOR SHARE`, câu thuộc Bộ đề, điểm không vượt điểm câu) và `attempt_grades_guard`. Ràng buộc `source ≠ auto` phải có `graded_by`, nhận xét ≤ 1000 ký tự.
- **Module `grading`** (`AutogradeService`, `GradingJobs`, `GradingHooksService`) nối với `attempt` và `exam` qua ba cổng mới trong `common/`: `GRADING_SOURCE` (attempt cài đặt), `ATTEMPT_SUBMITTED_HOOKS` và `ATTEMPT_GRADE_GUARD` (grading cài đặt). `architecture.test.ts` thêm `grading` vào danh sách cấm import bảng chéo module.
- **Báo Lượt vừa nộp:** gọi hook ngay sau commit ở Nộp bài của Người dự thi, đóng lười khi có request, job tự nộp hết giờ, Buộc nộp, Đình chỉ và Hủy Phiên thi. Riêng Khóa tài khoản (báo trong giao dịch của `identity`) để job quét bắt. **Job quét** mỗi 5 giây: quét nhanh (một trang, 15 phút gần nhất) và mỗi phút một lần quét sâu 24 giờ (phân trang 500, tối đa 10.000 Lượt gần nhất, tối đa 500 Lượt chấm mỗi lần); Lượt cũ hơn hoặc ngoài 10.000 được chấm bù khi Người ra đề mở bảng Kết quả (5b).
- **Idempotent và an toàn khi đồng thời:** chấm dùng `ON CONFLICT DO UPDATE ... WHERE source = 'auto'` nên không ghi đè điểm chấm tay. Mỗi lô 50 Lượt đọc bài làm và ghi điểm trong **cùng một giao dịch** với các dòng Lượt khóa `FOR SHARE` (theo thứ tự `id`): Hoàn tác Buộc nộp phải chờ lô chấm xong nên điểm của lần nộp cũ không thể đè lên bài đã mở lại rồi nộp lại. Một Lượt có bản chụp hỏng được log và bỏ qua, không làm hỏng cả lô; lỗi cả lô thì lần quét sau thử lại.
- **Hoàn tác Buộc nộp:** lý do mới `ALREADY_GRADED` (đã có điểm chấm tay; điều kiện "Phiên thi đã Công bố" thêm ở 5c); điểm tự động bị xóa trong cùng giao dịch Hoàn tác; hoàn tác cả lô bỏ qua riêng Lượt đã chấm tay. Chuỗi tiếng Việt `INVALID_STATE_ALREADY_GRADED` ở `vi.json`.
- **Thay đổi so với thiết kế (sau review):** hook báo thêm ở Buộc nộp, Đình chỉ, Hủy Phiên thi (thiết kế ban đầu để job quét lo); job quét chia hai tầng (nhanh và sâu) để mỗi 5 giây không phải đọc tới 10.000 id; chấm theo lô trong một giao dịch có khóa (thay vì mỗi Lượt một giao dịch) để đóng cửa sổ điểm cũ đè bài mở lại; `closeAll` của cổng `SESSION_ATTEMPTS` trả danh sách id thay vì số lượng; đổi tên `gradedIds` thành `manuallyGradedIds`; bộ test đo thời gian dựng Lượt bằng SQL (`grading-bench.int.test.ts`, chỉ chạy khi `GRADING_BENCH=1`).
- **Test:** `grading-auto.int.test.ts` 20 test (S2 chấm đủ Loại câu, câu bỏ trống, idempotent, không ghi đè điểm tay, Buộc nộp cả phòng, hết giờ, Hủy Phiên thi, ngoài cửa sổ 24 giờ, mất hàng đợi; S3 trigger; S4 hai lần chấm cùng lúc; Hoàn tác xóa điểm / bị chặn / cả lô); toàn bộ 775 test tích hợp qua.
- **Số đo:** chấm 500 Lượt (Bộ đề bốn Loại câu, theo lô 50) mất **0,36 giây**, 0,7 ms mỗi Lượt (ngân sách 10 giây và 20 ms). Request Nộp bài chỉ thêm một lệnh xếp job Redis (không chờ chấm).
- **Để ngỏ:** 5b thêm gọi `autogradeSession` khi mở bảng Kết quả để chấm bù Lượt cũ hơn 24 giờ; điều kiện "Phiên thi đã Công bố" của `canReopen` thêm ở 5c; thử tải 500 người nộp cùng lúc qua `load:exam` (S7) ở 5e.

## PR 5b: thiết kế chi tiết (đã duyệt 6/11/2026: chia 5b-1 API và 5b-2 giao diện; prototype màn Chấm giữa hai PR; trang quản trị Ủy quyền; thông báo chuông; điền bù `verdict`)

**Phạm vi:** Người ra đề (hoặc người được Ủy quyền) chấm Câu tự luận, quyết Mức xử lý Vi phạm, xem bảng Kết quả và Thống kê câu của một Phiên thi. **Chưa có Công bố** (5c), nên Người dự thi vẫn chỉ thấy "Đã nộp". Đề xuất **chia hai PR** như lát cắt 4: **5b-1** (API, dễ kiểm bằng test) và **5b-2** (giao diện), để mỗi PR nhỏ, CI nhanh và bạn xem được từng phần.

### 1. Quyền truy cập (Q291, Q292, Q307)

- Mọi API chấm và Kết quả cho **chủ Phiên thi hoặc người được Ủy quyền đang hiệu lực**; người khác nhận 404 (như Theo dõi).
- Cấp và thu hồi Ủy quyền: chủ Phiên thi hoặc Quản trị viên. Người được Ủy quyền không ủy quyền tiếp.
- Cổng mới `GRADING_SESSIONS` (do `session` cài đặt): cho `grading` biết chủ, Bộ đề, `attempt_scoring`, giờ mở/đóng/Đóng cửa vào thi, Phiên thi đã Hủy chưa, và người nào có trong Danh sách dự thi. Cổng `EXAMINER_DIRECTORY` (do `identity` cài đặt): "người này còn là Người ra đề đang hoạt động không" và gợi ý tìm Người ra đề để ủy quyền.
- Người nhận Ủy quyền phải: là Người ra đề đang hoạt động, khác chủ, **không có trong Danh sách dự thi** của Phiên thi đó (nếu sau này bị thêm vào Danh sách thì Ủy quyền không còn hiệu lực).
- Mỗi Phiên thi tối đa **một** người được Ủy quyền cùng lúc.

### 2. Cơ sở dữ liệu (migration 0018)

- `session_gradings (session_id PK → sessions RESTRICT, blind bool DEFAULT true, created_at, updated_at)`: ở 5b chỉ giữ công tắc Chấm ẩn tên; 5c thêm cột Công bố/Chốt bằng `ALTER`. Tạo dòng khi cần đầu tiên (mặc định `blind = true` nếu chưa có dòng).
- `session_grading_delegates (id, session_id → sessions RESTRICT, user_id → users, granted_by → users, granted_at, revoked_at NULL)`; chỉ mục duy nhất `(session_id) WHERE revoked_at IS NULL`; trigger chỉ cho đặt `revoked_at` (một lần) hoặc ghi mới, không xóa.
- `response_grades` thêm cột **`verdict`** (`correct | partial | wrong | blank | pending`): chấm tự động ghi lấy từ `scoreResponse`; chấm tay tính lại từ điểm. Cột này để Thống kê câu và bảng Kết quả phân biệt "sai" với "bỏ trống" mà không phải đọc bài làm. Dòng đã có (từ 5a) được điền bù: điểm trống → `pending`, đủ điểm → `correct`, giữa → `partial`, bằng 0 → `blank` nếu Lượt không có Câu trả lời cho câu đó hoặc giá trị rỗng, ngược lại `wrong`.
- Trigger `response_grades_guard` thêm: `source = 'manual'` chỉ cho câu **tự luận** (đọc `exam_items.snapshot->>'type'`). Chấm tay không ghi đè được điểm trắc nghiệm.
- Nhật ký `audit_logs`: `session.penalty_set`, `session.grading_delegated`, `session.grading_delegate_revoked`, `session.blind_grading_changed`. Điểm chấm tay không ghi nhật ký từng dòng (đã có `graded_by`, `graded_at`).

### 3. API (đề xuất)

Người ra đề hoặc người được Ủy quyền:

| Phương thức | Đường dẫn | Việc |
|---|---|---|
| GET | `/sessions/:id/grading/items` | Các câu tự luận: số thứ tự, đề, điểm, tổng bài, đã chấm, chờ chấm |
| GET | `/sessions/:id/grading/items/:itemId/queue?filter=pending\|all` | Hàng đợi nhẹ (tối đa 500 dòng): `attemptId`, nhãn "Bài N", đã chấm hay chưa, điểm; thứ tự ngẫu nhiên ổn định (băm theo mã Lượt); chỉ Lượt có thể được tính (Q292) và có chữ |
| GET | `/sessions/:id/grading/items/:itemId/attempts/:attemptId` | Một bài: đề, hướng dẫn chấm, bài làm, điểm hiện tại, nhận xét; kèm tên/mã/Lớp **chỉ khi** `blind = false` |
| PUT | `/sessions/:id/grading/attempts/:attemptId/items/:itemId` | `{ score \| null, feedback? }`: lưu điểm tay (idempotent); `score = null` đưa câu về chờ chấm; điểm trong `[0, điểm câu]`, 2 chữ số; chỉ câu tự luận; Lượt phải đã nộp |
| GET/PUT | `/sessions/:id/grading/blind` | Xem và bật/tắt Chấm ẩn tên |
| GET | `/sessions/:id/results` | Đầu trang (tên Phiên thi, ngày, Thời lượng, tổng số câu, tổng điểm); trạng thái (bài tự luận chờ chấm, Vi phạm chưa quyết; Lượt chưa chấm tự động được chấm bù ngay khi mở nên không cần báo); từng người (Mã, Tên, Lớp, số Lượt, Lượt được tính, Điểm thô, Điểm quy đổi, `state`/`penaltyPercent`/`voided` thay cho một nhãn) |
| GET | `/sessions/:id/results/people/:userId` | Điểm từng câu của một người: số thứ tự, Loại câu, điểm/tối đa, `verdict`, nguồn chấm, nhận xét |
| GET | `/sessions/:id/results/item-stats` | Thống kê câu (Q305): đúng / một phần / sai / bỏ trống / chờ chấm mỗi câu |
| GET | `/sessions/:id/violations` · PUT `/sessions/:id/violations/:violationId/penalty` | Danh sách Vi phạm kèm người, hành động, lý do, Mức xử lý; đặt `{ type: 'none' \| 'percent' \| 'void', percent? }` |
| GET | `/sessions/:id/grading-delegate` | Người đang được Ủy quyền (hoặc không) |

Chủ Phiên thi hoặc Quản trị viên: `PUT /sessions/:id/grading-delegate { userId }`, `DELETE /sessions/:id/grading-delegate`, `GET /sessions/:id/grading-delegate/candidates?q=` (gợi ý Người ra đề đủ điều kiện). Quản trị viên dùng cùng đường dẫn (không thuộc chủ nhưng được phép riêng cho ba đường này), kèm `GET /admin/sessions?q=` để tìm Phiên thi của mọi người. Người được Ủy quyền: `GET /grading/delegated-sessions` liệt kê các Phiên thi được giao (không dùng `/sessions/delegated` vì trùng `GET /sessions/:id`).

**Quy tắc bảng Kết quả khi Chấm ẩn tên bật (Q291):** còn bất kỳ bài tự luận chờ chấm thì trả **Điểm thô và Điểm quy đổi chỉ gồm phần trắc nghiệm**, đánh dấu `essayHidden = true`, và **không** trả `attemptId` của Lượt (để không nối "Bài 17" ở màn Chấm với tên người). Chấm xong mọi bài tự luận hoặc tắt Chấm ẩn tên thì trả đầy đủ.

**Chấm bù (`autogradeSession`):** mở bảng Kết quả thì chấm nốt các Lượt đã nộp của Phiên thi mà chưa có dấu "đã chấm" (Lượt cũ hơn cửa sổ quét 24 giờ, hoặc ngoài 10.000 Lượt gần nhất); chỉ chạy khi có Lượt thiếu, không làm chậm trường hợp thường.

### 4. Cổng và module

- `grading` thêm: `ResultsService` (bảng Kết quả, người, Thống kê), `ManualGradingService` (hàng đợi, bài, lưu điểm), `GradingAccessService` (chủ hoặc người được Ủy quyền, Ủy quyền), controller.
- Cổng `GRADING_SOURCE` (attempt) mở rộng: `attemptsOfSession(sessionId)` (Lượt đã nộp: id, người, số thứ tự, giờ nộp) để dựng danh sách "có thể được tính".
- Cổng mới `VIOLATION_PENALTIES` (attempt cài đặt): `list(sessionId)` và `setPenalty(...)` (chỉ ba cột hình phạt của `violations`).
- Tên, Mã, Lớp lấy qua `CANDIDATE_DIRECTORY` (đã có `page`); `resultOf` từ `@exam/scoring` tính Kết quả.
- Mở rộng `architecture.test.ts`: `grading` vẫn không import bảng module khác.

### 5. Giao diện (5b-2)

- Tab/đường dẫn **Kết quả** ở chi tiết Phiên thi: thanh bước, bảng người (lọc, sắp xếp, tìm, thẻ trên điện thoại), ngăn chi tiết từng người, tab con Vi phạm, tab con Thống kê câu, công tắc Chấm ẩn tên, Ủy quyền chấm (hộp chọn người), nút vào màn Chấm. Màn Kết quả là một **component dùng chung**: chủ Phiên thi mở trong tab, người được Ủy quyền mở ở `/examiner/sessions/:id/results`; danh sách Phiên thi của Người ra đề có thêm mục **"Được ủy quyền chấm"**.
- **Màn Chấm** theo Q293: chia đôi ở máy tính, một bài mỗi màn ở điện thoại; phím J/K, Enter lưu và sang bài kế, nút nhanh 0 / ½ / tối đa; mặc định chỉ bài chưa chấm; lỗi nhập điểm ngay tại ô; nạp trước bài kế; trạng thái "Đã lưu" như màn soạn câu; không dùng `localStorage` cho điểm (mọi thứ ghi lên server ngay).
- Trang quản trị **"Ủy quyền chấm"** (Quản trị viên): tìm Phiên thi, xem ai đang được ủy quyền, cấp/thu hồi.
- Thông báo trên chuông cho người được Ủy quyền ("Bạn được ủy quyền chấm Phiên thi X") và khi bị thu hồi.

### 6. Seam test

| Seam | Ca chính |
|---|---|
| **S1 hàm thuần** | Thứ tự ngẫu nhiên ổn định (cùng đầu vào cùng thứ tự, khác Phiên thi khác thứ tự); chọn Lượt có thể được tính (latest/highest); quy tắc ẩn điểm tự luận khi Chấm ẩn tên; tính `verdict` từ điểm |
| **S2 HTTP + PostgreSQL** | Hàng đợi chỉ có bài tự luận có chữ của Lượt có thể được tính; lưu điểm trong khoảng, ngoài khoảng bị từ chối, `null` đưa về chờ chấm; idempotent; chấm tay không đụng điểm trắc nghiệm; bảng Kết quả khớp `resultOf` (highest/latest, trừ %, Hủy, quy đổi 0,1); Thống kê câu đếm đúng kể cả bỏ trống; chấm bù khi Lượt thiếu dấu; Mức xử lý đặt/đổi, phần trăm ngoài 0–100 bị từ chối |
| **S3 Trigger** | `manual` trên câu trắc nghiệm bị từ chối; `session_grading_delegates` hai người hiệu lực cùng lúc bị từ chối, xóa/sửa trái phép bị từ chối; điền bù `verdict` đúng |
| **S4 Đồng thời** | Hai Người chấm cùng lưu một bài: một giá trị cuối, không lỗi; chấm tay xen chấm tự động của Hoàn tác (Hoàn tác bị chặn đúng); thu hồi Ủy quyền xen lúc đang lưu điểm (thao tác sau bị 404) |
| **S5 Bảo mật** | Người ra đề khác chủ và không được Ủy quyền nhận 404 ở mọi đường; Người dự thi nhận 403/404; **JSON hàng đợi và bài (Chấm ẩn tên bật) không chứa tên, Mã định danh, Lớp, `userId`**; bảng Kết quả khi ẩn không chứa `attemptId` và không lộ điểm tự luận; Người nhận Ủy quyền nằm trong Danh sách dự thi bị từ chối; Quản trị viên cấp/thu hồi được, người được Ủy quyền không ủy quyền tiếp được |
| **S6 Playwright (5b-2)** | Chấm tự luận bằng phím trên máy tính và bằng nút trên điện thoại; tắt Chấm ẩn tên hiện tên; Mức xử lý đổi Kết quả; Ủy quyền: Quản trị viên cấp, người được Ủy quyền vào chấm và Chủ Phiên thi thấy điểm; đo thời gian |

### 7. Ngân sách thời gian (Q306, đo ở 5b)

Mở bài kế dưới 300 ms (nạp trước bài kế nên người dùng thấy gần như tức thì); lưu điểm một bài dưới 150 ms; hàng đợi 500 bài dưới 300 ms; bảng Kết quả 500 người dưới 500 ms; Thống kê câu dưới 500 ms; đặt Mức xử lý dưới 150 ms; cấp Ủy quyền dưới 300 ms.

### 8. Các điểm đã quyết (chủ dự án đồng ý cả 5 đề xuất, 6/11/2026)

1. **Chia 5b-1 (API) rồi 5b-2 (giao diện)**: đề xuất chia (như lát cắt 4).
2. **Prototype màn Chấm trước khi lập trình giao diện** (ui-design Q110 ghi mẫu Chấm cần prototype riêng để chọn). Đề xuất dựng 1–2 bản prototype trên nhánh `prototype/cham-bai` (máy tính và điện thoại, dữ liệu giả) giữa 5b-1 và 5b-2, bạn chọn rồi mới làm giao diện thật. Hay bạn thấy bố cục đã duyệt ở Q293 là đủ, bỏ prototype?
3. **Trang quản trị "Ủy quyền chấm"** trong 5b-2 (Quản trị viên hiện chưa có màn nào về Phiên thi): đề xuất một trang nhỏ tìm Phiên thi và cấp/thu hồi.
4. **Thông báo chuông cho người được Ủy quyền** (thêm loại thông báo mới ngoài danh sách Q303): đề xuất có.
5. **Điền bù `verdict`** cho dữ liệu chấm đã có từ 5a như mục 2 (chỉ ảnh hưởng dữ liệu thử của bạn).

### PR 5b-1: ghi chú triển khai (6/11/2026)

- **API** (migration 0018, module `grading`): `ManualGradingService` (câu tự luận kèm tiến độ, hàng đợi, một bài, lưu điểm, Chấm ẩn tên), `ResultsService` (bảng Kết quả, chi tiết từng người, Thống kê câu, danh sách Vi phạm), `PenaltiesService` (Mức xử lý), `DelegationService` (Ủy quyền), `GradingAccessService` (chủ hoặc người được Ủy quyền), `GradingContextService` (nạp Bộ đề, Lượt, điểm; chấm bù Lượt thiếu dấu "đã chấm"). Ba controller: `GradingController`, `OwnerDelegateController`, `AdminDelegateController` (đường dẫn như mục 3).
- **Cổng mới** (`apps/api/src/common`): `GRADING_SESSIONS` (session cài đặt), `EXAMINER_DIRECTORY` (identity), `VIOLATION_PENALTIES` (attempt); `GRADING_SOURCE.attemptsOfSession`; `closeAll` của `SESSION_ATTEMPTS` đã trả id từ 5a.
- **Cơ sở dữ liệu:** `session_gradings`, `session_grading_delegates` (một người hiệu lực mỗi Phiên thi, trigger chỉ cho thu hồi một lần, không xóa), cột `response_grades.verdict` (điền bù từ dữ liệu 5a), trigger chấm tay chỉ cho câu tự luận.
- **Chấm ẩn tên giữ ở server (S5):** hàng đợi và bài không có tên, mã, Lớp hay `userId`; bảng Kết quả khi còn bài chờ chấm chỉ trả điểm trắc nghiệm và không trả mã Lượt; danh sách Vi phạm và chi tiết từng người không trả mã Lượt (nối mã Lượt với tên sẽ lộ người viết bài).
- **Quyền:** người khác chủ và không được Ủy quyền nhận 404 ở mọi đường; Người dự thi bị chặn; người được Ủy quyền không quản lý Ủy quyền (404 ở đường của chủ); Ủy quyền mất hiệu lực nếu người nhận bị thêm vào Danh sách dự thi; cấp Ủy quyền mới thì thay người cũ (có thông báo cho cả hai).
- **Test:** `grading-manual.int.test.ts` 20 test (hàng đợi, ẩn tên và quét JSON không lộ danh tính, lưu điểm và biên, hai người lưu cùng lúc, bảng Kết quả 3,5/4 → 8,8, Mức xử lý 10 % → 7,9 / Hủy / bỏ, Thống kê câu, quyền, Ủy quyền đủ chiều kể cả Quản trị viên, trigger); `grading-queue.test.ts` 6 test cho hàm thuần; toàn bộ 799 test tích hợp qua.
- **Số đo** (500 Lượt, PostgreSQL thật, một tiến trình): bảng Kết quả **48 ms**, hàng đợi 500 bài **30 ms**, mở một bài **33 ms**, lưu điểm **32 ms**, Thống kê câu **24 ms** (ngân sách 500, 300, 300, 150, 500 ms).
- **Để ngỏ:** điều kiện "Phiên thi đã Công bố" của chặn Hoàn tác và của đổi Mức xử lý thêm ở 5c; giao diện (tab/đường dẫn Kết quả, màn Chấm, trang quản trị Ủy quyền) ở 5b-2 sau khi chủ dự án chọn prototype màn Chấm.
- **Sau review (6/11/2026):** bảng Kết quả khi che điểm tự luận trả `state = 'hidden'` và `pendingEssays = null` cho từng người (đếm theo người nối được "Bài N" với tên: chấm một bài rồi xem ai đổi); chi tiết từng người che cả `source`; `save` chỉ nhận Lượt có thể được tính (như hàng đợi) và thử lại một lần sau khi chấm bù; hàng đợi cắt ở 500 dòng; điền bù `verdict` coi bài tự luận chỉ khoảng trắng là bỏ trống; cấp lại Ủy quyền cho cùng người không làm gì; danh sách "Được ủy quyền" bỏ Phiên thi mà người này nay nằm trong Danh sách dự thi. **Giới hạn đã biết:** Chấm ẩn tên chặn thiên vị vô tình, không chặn chủ Phiên thi cố tình dò: màn Theo dõi (đường khác của chính chủ) trả mã Lượt cạnh tên, nên chủ khớp được "Bài N" với tên nếu chủ động ghép. Người được Ủy quyền không vào được Theo dõi nên không có đường này.

### PR 5b-2: ghi chú triển khai (7/11/2026)

- **Chủ dự án chọn** (7/11/2026): phương án **D** của prototype màn Chấm (nhánh `prototype/cham-bai`: A chia đôi, B một bài mỗi màn, C bảng, D kết hợp A và B), thêm **thanh chọn câu** khi Bộ đề có nhiều câu tự luận, và **ghi chú đối chiếu số câu** ngắn gọn. Câu tự luận ở cuối đề thì tách thành một Phần riêng (xáo trộn chỉ trong từng Phần); không thêm cờ "giữ nguyên thứ tự" (Q308 không làm).
- **Màn Chấm** (`lib/ui/grading/grading-screen.tsx`, đường dẫn `/examiner/sessions/:id/grading?item=`): máy tính chia đôi (danh sách bài bên trái, bài và bảng điểm bên phải); điện thoại một bài mỗi màn, năm nút điểm cố định ở đáy, phần đầu gọn (tiến độ, bộ lọc, một nút danh sách). Nút điểm nhanh 0, ¼, ½, ¾, tối đa theo điểm của từng câu; "Điểm khác…" nhận dấu phẩy và báo lỗi ngay; chấm xong tự sang bài chưa chấm kế tiếp, **Hoàn tác** một bước; nạp trước bài kế; phím 1–5, J/K; ô nhận xét ẩn mặc định. Lưu lạc quan (giao diện đổi trước, lỗi thì trả lại và báo).
- **Thanh chọn câu:** mỗi câu tự luận một ô kèm tiến độ riêng (`Câu 7 · 12/36`, dấu ✓ khi xong), cuộn ngang ở điện thoại, ẩn khi chỉ có một câu; chấm xong câu thì gợi ý "Sang Câu X (còn N bài)", không tự chuyển.
- **Màn Kết quả** (`lib/ui/grading/results-screen.tsx`): tab "Kết quả" ở chi tiết Phiên thi (chủ) và đường dẫn `/examiner/sessions/:id/results` (người được Ủy quyền). Tóm tắt (đang che điểm tự luận, Vi phạm chưa quyết), bảng người (thẻ ở điện thoại) có tìm và lọc, chi tiết từng người, **Thống kê câu** (sắp "câu khó nhất trước", gắn nhãn "Nên kiểm tra đáp án" khi tỷ lệ đúng dưới 30 %), **Vi phạm** với Mức xử lý (không / trừ % / Hủy), Chấm ẩn tên bật/tắt, hộp **Ủy quyền chấm**.
- **Ghi chú đối chiếu số câu:** ở chi tiết từng người, dòng nhỏ "(thấy là Câu 2)" chỉ hiện khi đề được xáo và số Người dự thi thấy khác số gốc; ẩn hoàn toàn khi đang che danh tính. API `results/people/:userId` thêm `seenAs` (đọc bố cục đã chốt của Lượt qua cổng `GRADING_SOURCE.displayNumbers`). Ở màn Chấm không hiện số này (người chấm làm việc theo số gốc).
- **Quản trị:** trang `/admin/grading-delegates` (tìm Phiên thi của mọi chủ, cấp và thu hồi Ủy quyền); danh sách Phiên thi của Người ra đề có mục "Được ủy quyền chấm".
- **Test:** `grading.spec.ts` (Playwright desktop và mobile: Kết quả che điểm, chấm bằng nút và phím 5, hết bài, Mức xử lý trừ 10 %, Thống kê, Quản trị viên cấp Ủy quyền, người được Ủy quyền thấy Phiên thi); `grading-screen.test.ts` (nút điểm nhanh, ô "Điểm khác"); test API `seenAs`. Đo: bấm nút điểm đến lúc tiến độ đổi **71–100 ms**.
- **Để ngỏ:** Công bố và xem Kết quả của Người dự thi (5c); chặn đổi Mức xử lý và Hủy Phiên thi sau Công bố; xuất Excel (5c).
- **Sau review (7/11/2026):** màn Chấm lưu lạc quan an toàn hơn (lỗi lưu thì bỏ điểm lạc quan của bài và quay lại bài đó; Hoàn tác đặt lại bộ nhớ đệm của bài rồi hỏi lại sau khi lưu; sửa nhận xét không ghi đè dấu Hoàn tác; nhận xét gõ dở được giữ theo từng bài và gửi kèm điểm dù chấm bằng nút, phím hay "Điểm khác"; giữ phím không chấm liên tiếp; làm tươi tiến độ một lần khi hết lượt lưu đang bay); câu đang chấm được ghim lên địa chỉ để chấm hết bài cuối không nhảy sang câu khác làm mất bảng "đã chấm hết"; vùng đọc màn hình (đã lưu, Hoàn tác) nằm ngoài phần dựng lại mỗi lần sang bài, và tiêu điểm đưa về bài mới sau khi chấm; thanh chọn câu là nút `aria-current` thay cho tab đủ bộ; nạp trước cả bài liền kề lẫn bài chưa chấm kế tiếp. Bảng người có **sắp xếp** (theo tên, điểm cao đến thấp, thấp đến cao); tab Vi phạm có dòng giải thích cộng dồn tối đa 100 %; bấm chuông "được ủy quyền" dẫn thẳng tới Kết quả. **Ghi chú đối chiếu số câu chỉ hiện khi Chấm ẩn tên tắt** (theo ý chủ dự án: bật thì đối chiếu số câu lộ bài nào của ai). Giới hạn: gõ điểm bằng bàn phím cần bấm "Điểm khác…" trước (phím 1–5 và nút điểm thay phần lớn nhu cầu).


## PR 5c: thiết kế chi tiết (đã duyệt 7/11/2026: chia 5c-1 API và 5c-2 giao diện; người được Ủy quyền Công bố được; chặn Công bố khi chưa có Lượt; "Kết quả của tôi" làm thẳng, tô màu theo mức đạt)

**Phạm vi:** Người ra đề **Công bố kết quả**; Người dự thi **xem Kết quả** của mình; **xuất Excel**; các chặn sau Công bố. Chưa có Phúc khảo và job Chốt (5d). Các quyết định đã duyệt dùng nguyên: Q297 (nội dung Kết quả và công tắc xem lại đề), Q298 (điều kiện và hạn Phúc khảo 1–14 ngày hoặc không nhận), Q299 (sau Công bố), Q301 (Chốt ngay nếu không nhận Phúc khảo), Q303 (thông báo), Q304 (Excel). Đề xuất **chia 5c-1 (API) và 5c-2 (giao diện)** như 5b.

### 1. Cơ sở dữ liệu (migration 0019)

- `session_gradings` thêm `released_at`, `released_by → users`, `appeal_period_hours` (CHECK `0` hoặc 24–336), `finalized_at`. Trigger: `released_at` và `finalized_at` chỉ đặt một lần, không xóa; `finalized_at` chỉ đặt khi đã Công bố; `appeal_period_hours` đi cùng `released_at`.
- `sessions` thêm `review_after_release bool DEFAULT false` (Q297); sửa được đến lúc Công bố (kiểm ở service, vì cột thuộc `session`).
- `response_grades_guard` thêm: Phiên thi **đã Công bố** thì không ghi điểm `manual` mới (Q299: chỉ qua Phúc khảo/Đính chính, nguồn `appeal`, `correction` ở 5d); **đã Chốt** thì không đổi điểm nào. Ghi lại điểm tự động giữ nguyên giá trị (chấm bù idempotent) vẫn qua.

### 2. Công bố (`POST /sessions/:id/release { appealPeriodDays: 0 | 1..14 }`)

- **Ai:** chủ Phiên thi hoặc người được Ủy quyền (đúng Q307: Công bố nằm trong quyền được giao).
- **Điều kiện** (Q298), kiểm trong cùng giao dịch, trả `409 INVALID_STATE` kèm `reason` và, nếu thiếu, số liệu: `SESSION_NOT_FINISHED` (còn Lượt đang làm, hoặc chưa quá Khung giờ và chưa Đóng cửa vào thi), `UNGRADED_ATTEMPTS`, `ESSAYS_PENDING` (kèm số bài), `ALREADY_RELEASED`, `SESSION_CANCELLED`. Phiên thi không có Lượt nào cũng chặn (`NO_ATTEMPTS`).
- **Làm gì:** khóa dòng Phiên thi (nối đuôi với Hoàn tác, Hủy, chấm tay), đặt `released_at`, `released_by`, `appeal_period_hours = days × 24`; nếu `0` thì đặt `finalized_at = released_at` ngay (Q301). Ghi `audit_logs` (`session.released`). Gửi thông báo cho mọi Người dự thi **đã có Lượt** (`results.released`, Q303). Đẩy tin `monitor.changed`.
- **Trạng thái cho Người ra đề:** `GET /sessions/:id/results` thêm `release: { ready, blockers, releasedAt, appealUntil, finalizedAt }` để nút Công bố tự báo lý do chưa bật.

### 3. Người dự thi xem Kết quả

- `GET /take/sessions/:id/result` (đúng người trong Danh sách, đã Công bố, trên mọi thiết bị: không đòi Thiết bị dự thi vì không làm bài), 409 `NOT_RELEASED` trước đó. Trả: Điểm thô và tối đa, Điểm quy đổi (0,1), Mức xử lý và lý do (Hủy, trừ x %, kèm lý do Vi phạm), hạn Phúc khảo còn lại, và từng câu **theo thứ tự họ đã thấy** (số "Câu N" của họ): Loại câu, điểm/tối đa, `verdict` (đúng, một phần, sai, bỏ trống), với chùm đúng/sai "đúng 3/4 Mệnh đề"; câu **tự luận** kèm bài làm và nhận xét của chính họ. Nếu `review_after_release` bật: thêm nội dung câu và lựa chọn/đáp án **của chính họ** (dựng bằng `candidateViewOf`, vẫn không có `key`, `rubric`, bậc thang).
- **Chỉ Lượt được tính** (highest hoặc latest); nhiều Lượt thì ghi "Lượt được tính: lượt 2".
- Cổng mới `SESSION_RESULTS` do `grading` cài đặt cho `attempt` để `GET /take/sessions` thêm `resultReleased` và `resultUntil` mà `attempt` không đọc bảng của `grading`.
- **Bảo mật (S5):** quét JSON mọi response của Người dự thi tìm `key`, `correct`, `rubric`, `ladder`, `scoringRule` khi tắt xem lại đề; người ngoài Danh sách nhận 404.

### 4. Các chặn sau Công bố (Q299, Q294, Q296)

Hủy Phiên thi: `409 SESSION_RELEASED`. Hoàn tác Buộc nộp: cổng `AttemptGradeGuard.manuallyGradedIds` thêm điều kiện "Phiên thi đã Công bố" (đã chuẩn bị ở 5a). Lưu điểm tay, đặt Mức xử lý, bật/tắt Chấm ẩn tên và đổi `review_after_release`: `409 ALREADY_RELEASED`. Cổng `SessionGradingStatus` cho `session` đọc trạng thái Đã Công bố/Đã Chốt để hiện nhãn và chặn Hủy.

### 5. Xuất Excel (`GET /sessions/:id/results.xlsx`, Q304)

Chủ hoặc người được Ủy quyền; hai trang tính: *Tổng hợp* (phần đầu: Tên Phiên thi, Ngày diễn ra, Thời gian làm bài, Tổng số câu; bảng: Mã định danh, Họ tên, Lớp, Số Lượt, Điểm thô, Tổng điểm, Điểm quy đổi, Ghi chú) và *Chi tiết* (mỗi câu một cột). Tạo bằng ExcelJS, ô bắt đầu `= + - @` thêm dấu nháy (chống chèn công thức). Chưa Công bố thì ghi "Chưa Công bố"; còn bài chờ chấm thì Ghi chú "chờ chấm". Mục tiêu dưới 1 giây cho 500 người.

### 6. Giao diện (5c-2)

- Màn Kết quả: khối **Công bố** (chọn hạn Phúc khảo 1–14 ngày hoặc "không nhận Phúc khảo", nút Công bố tự tắt kèm lý do, hộp xác nhận nêu số người nhận, số Vi phạm chưa quyết, hạn Phúc khảo), thẻ trạng thái *Đã Công bố đến …* / *Đã Chốt*, nút **Xuất Excel**; sau Công bố các điều khiển chấm bị khóa kèm lời giải thích.
- Form Phiên thi thêm ô **"Cho xem lại đề sau Công bố"** (mặc định tắt).
- **Màn "Kết quả của tôi"** cho Người dự thi: thẻ Phiên thi ở "Phiên thi của tôi" có nhãn *Đã có Kết quả* và nút Xem Kết quả; màn gồm đầu trang điểm (thô, quy đổi, Mức xử lý nếu có), danh sách câu theo thứ tự họ đã thấy (điểm và kết luận, bài và nhận xét tự luận), bật xem lại đề thì mở rộng từng câu. Phần Phúc khảo để 5d. Tối ưu cho điện thoại; mở dưới 300 ms.
- Chuông: *Kết quả đã được Công bố* dẫn thẳng tới màn Kết quả của tôi.

### 7. Seam test

S1 hàm thuần (điều kiện sẵn sàng Công bố, thứ tự câu theo bố cục của Người dự thi, tính "đúng 3/4 Mệnh đề"); S2 HTTP + PostgreSQL (từng lý do chặn Công bố; Công bố đặt đúng ngày/hạn, `0` Chốt ngay; Hủy bị chặn; lưu điểm tay, Mức xử lý, Hoàn tác bị chặn; Kết quả của Người dự thi khớp `resultOf` kể cả nhiều Lượt, Hủy, trừ %; thông báo; xuất Excel đúng nội dung, chống công thức); S3 trigger (đặt `released_at` hai lần, Chốt trước Công bố, ghi điểm tay sau Công bố, đổi điểm sau Chốt); S4 đồng thời (Công bố xen chấm tay hoặc Hoàn tác: một bên thắng, không điểm mồ côi; hai lần Công bố cùng lúc: một lần thành công); S5 bảo mật như trên; S6 Playwright (Công bố, Người dự thi thấy Kết quả, tắt/bật xem lại đề, xuất Excel); ngân sách: Công bố dưới 1 giây (500 người), Kết quả của Người dự thi dưới 300 ms, Excel dưới 1 giây.

### 8. Các điểm đã quyết (chủ dự án đồng ý cả bốn, 7/11/2026)

1. **Chia 5c-1 (API) rồi 5c-2 (giao diện)**: đề xuất chia.
2. **Người được Ủy quyền được Công bố** (như Q307 đã duyệt): xác nhận giữ.
3. **Chặn Công bố khi Phiên thi chưa có Lượt nào** (`NO_ATTEMPTS`): đề xuất có.
4. **Màn "Kết quả của tôi" không cần prototype** (nội dung đã chốt ở Q297, bố cục đơn giản): đề xuất làm thẳng.

### PR 5c-1: ghi chú triển khai (7/11/2026)

- **Chủ dự án thêm yêu cầu cho màn "Kết quả của tôi" (5c-2):** tô màu nổi bật theo mức đạt, bốn dải: dưới 50 % (cảnh báo), 50 đến dưới 70 %, 70 đến dưới 90 %, 90 đến 100 %; phối màu theo bộ màu giao diện hiện tại. Mức đạt tính theo **điểm sau Mức xử lý chia cho tổng điểm Bộ đề** (`percent`, tính sẵn ở server; Hủy kết quả là 0 %) vì phản ánh cả câu được điểm một phần; hàm `resultBandOf` ở `@exam/shared`.
- **Migration 0019:** `session_gradings` thêm `released_at`, `released_by`, `appeal_period_hours` (0 hoặc 24–336, CHECK đi cùng `released_at`), `finalized_at` (chỉ khi đã Công bố); `sessions.review_after_release`. Trigger `session_gradings_guard` (đã Công bố/Chốt thì không đổi, không xóa); `response_grades_guard` thêm: sau Công bố không ghi điểm `auto`/`manual` đổi giá trị (chỉ `appeal`, `correction` ở 5d), sau Chốt không đổi gì; ghi lại giá trị cũ (chấm bù) vẫn qua.
- **Công bố** (`POST /sessions/:id/release { appealPeriodDays }`, chủ hoặc người được Ủy quyền): khóa dòng Phiên thi `FOR UPDATE` rồi dòng thiết lập chấm (nối đuôi với Hoàn tác, Hủy và chấm tay: chấm tay, Mức xử lý, Chấm ẩn tên, xem lại đề lấy khóa chia sẻ dòng thiết lập qua `GradingStatusService.lockForWrite` và bị `409 ALREADY_RELEASED` nếu đã Công bố). Lý do chặn theo thứ tự `ALREADY_RELEASED`, `SESSION_CANCELLED`, `SESSION_NOT_FINISHED`, `NO_ATTEMPTS`, `UNGRADED_ATTEMPTS`, `ESSAYS_PENDING` (hàm thuần `releaseBlockers`, `isSessionFinished` ở `@exam/shared`); lỗi trả kèm `blockers` và `pendingEssays`. `0` ngày thì Chốt ngay. Ghi `audit_logs` `session.released`, thông báo `results.released` cho mọi Người dự thi đã có Lượt.
- **Kết quả của Người dự thi** (`GET /take/sessions/:id/result`): `CandidateResultService`; điểm thô, tối đa, sau Mức xử lý, quy đổi 0,1, `percent`; từng câu theo số họ đã thấy (`displayNumbers`), `verdict`, chùm "đúng k/n Mệnh đề" (chỉ số đếm), bài tự luận và nhận xét; Mức xử lý kèm lý do; xem lại đề (`reviewAfterRelease`) thêm nội dung câu và đáp án của chính họ qua `candidateViewOf`. 404 cho người ngoài Danh sách hoặc chưa làm bài, 409 `NOT_RELEASED` trước Công bố. `GET /take/sessions` thêm `resultReleased`, `resultAppealUntil` qua cổng `SESSION_GRADING_STATUS`.
- **Chặn sau Công bố:** Hủy Phiên thi (`SESSION_RELEASED`), Hoàn tác Buộc nộp (cổng `AttemptGradeGuard` coi mọi Lượt của Phiên thi đã Công bố là đã chấm), đổi `reviewAfterRelease` ở form hay `PUT /sessions/:id/grading/review`.
- **Xuất Excel** (`GET /sessions/:id/results.xlsx`): `ResultsExportService` (ExcelJS): *Tổng hợp* (Tên, Ngày diễn ra, Thời gian làm bài, Tổng số câu, Tổng điểm, "Chưa Công bố", lưu ý chờ chấm, bảng người) và *Chi tiết* (mỗi câu một cột); `safeCell` thêm dấu nháy cho ô bắt đầu `= + - @`. Chấm ẩn tên còn che điểm tự luận thì file cũng che như bảng Kết quả.
- **Form Phiên thi** thêm ô "Cho xem lại đề sau Công bố" (mặc định tắt; sửa được ở mọi trạng thái trừ Đã hủy, và khóa sau Công bố).
- **Test:** `grading-release.int.test.ts` 22 test (lý do chặn từng cái, hạn Phúc khảo 0 và 3 ngày, Công bố hai lần cùng lúc, Công bố xen chấm tay không để điểm lọt sau lúc Công bố, người được Ủy quyền Công bố, các chặn sau Công bố, trigger, Kết quả của Người dự thi và quét JSON không lộ đáp án, xem lại đề, Mức xử lý, cờ ở "Phiên thi của tôi", thông báo, Excel); `grading-release.test.ts` ở shared (blockers, kết thúc, dải màu).
- **Để ngỏ (5c-2):** giao diện (khối Công bố, màn "Kết quả của tôi" tô màu theo mức đạt, nhãn ở "Phiên thi của tôi", nút Xuất Excel, chuông dẫn tới Kết quả).

### PR 5c-2: ghi chú triển khai (7/11/2026)

Làm cùng nhánh với 5c-1 nên hai phần đi chung một PR (API và giao diện), khác đề xuất chia hai PR vì phần giao diện nhỏ và API cần giao diện để dùng thử.

- **"Kết quả của tôi"** (`/take/results/:sessionId`, `lib/ui/grading/my-result.tsx`): khối điểm lớn có vòng điểm (SVG), điểm quy đổi to, mức đạt %, lời nhận xét và biểu tượng riêng từng dải; rồi Mức xử lý (nếu có), từng câu theo số đã thấy (điểm/tối đa, kết luận; chùm "đúng k/n Mệnh đề"; bài tự luận mở ra thấy bài làm và nhận xét), hạn Phúc khảo. Mở rộng câu để xem lại đề khi Phiên thi bật (chỉ đánh dấu lựa chọn của chính họ, không có đáp án đúng).
- **Dải màu theo mức đạt** (`resultBandOf` ở `@exam/shared`, kiểu ở `result-band.ts`), phối trên bộ màu giao diện hiện tại, cả sáng và tối: dưới 50 % → đỏ cảnh báo (`danger`, nền `danger-soft`); 50–<70 % → hổ phách (`warning`); 70–<90 % → màu chủ đạo (`primary`, nền `primary-soft`); từ 90 % → xanh lá đặc (`success`, chữ `on-success`, nổi nhất). Thêm token `--c-on-success` (có kiểm tương phản WCAG ở `tokens.test.ts`). Không chỉ dựa vào màu: mỗi dải có biểu tượng (CircleAlert, Gauge, ThumbsUp, Trophy) và nhãn ("Cần cố gắng thêm", "Đạt mức trung bình", "Khá tốt", "Xuất sắc"). Mức đạt tính theo điểm sau Mức xử lý chia tổng điểm.
- **Người ra đề (màn Kết quả):** khối Công bố (`release-panel.tsx`): nút bật khi đủ điều kiện, nếu chưa thì liệt kê từng lý do (còn N bài tự luận chưa chấm, chưa kết thúc…); hộp xác nhận nêu số người nhận, Vi phạm chưa quyết, chọn hạn Phúc khảo (không nhận, 1–14 ngày, mặc định 3), cảnh báo không hoàn tác; sau Công bố hiện trạng thái Đã Công bố/Đã Chốt, khóa nút Chấm tự luận, Chấm ẩn tên, Mức xử lý và ô xem lại đề; nút **Xuất Excel**; ô "Cho xem lại đề sau Công bố" (cũng có ở form Phiên thi).
- **"Phiên thi của tôi":** Phiên thi đã Công bố hiện "Kết quả đã được Công bố" và nút **Xem Kết quả** (xếp ở nhóm "Đã xong"); bấm chuông "Kết quả đã được Công bố" dẫn thẳng tới Kết quả.
- **Test:** E2E `release.spec.ts` (desktop và mobile: Công bố qua giao diện, khóa chấm sau Công bố, xuất Excel, Người dự thi 100 % thấy "Xuất sắc" `data-band=excellent`, người 0 % thấy "Cần cố gắng thêm" `data-band=low`, không có đáp án trên màn); unit web (`entry`: hành động xem Kết quả; `tokens`: tương phản `on-success`); đã chụp ảnh bốn dải ở cả giao diện sáng và tối để kiểm bằng mắt.
- **Sau review (7/11/2026):** trang *Chi tiết* của Excel che điểm tự luận khi Chấm ẩn tên còn che (trước đó lộ); "Ngày diễn ra" ghi khoảng ngày khi Khung giờ nhiều ngày; Mã định danh cũng qua `safeCell`; chữ ghi chú và tiêu đề Excel khớp Q304; **bế tắc** giữa "Cho xem lại đề" và Công bố được loại bằng thứ tự khóa thống nhất (dòng Phiên thi trước, dòng thiết lập chấm sau) và `FOR NO KEY UPDATE` ở khóa Phiên thi của Công bố (vẫn loại trừ Hoàn tác và Hủy); Công bố đẩy `monitor.changed`; "Phiên thi của tôi" chỉ báo có Kết quả cho người đã có Lượt; Kết quả của tôi chỉ tải Lượt và Vi phạm của chính người đó và chỉ dựng nội dung câu khi bật xem lại; nhãn **Đã Công bố/Đã Chốt** ở danh sách và chi tiết Phiên thi, nút Hủy khóa kèm lời giải thích; vòng điểm không còn ẩn điểm khỏi trình đọc màn hình, màu chữ dải đạt dùng màu đầy đủ (đã có kiểm tương phản). **Số đo (500 người):** Công bố 98 ms, Kết quả của một Người dự thi 14 ms, xuất Excel 145 ms. **Giới hạn:** ở chế độ xem lại đề, các Phương án hiện theo thứ tự gốc của Bộ đề (không phải thứ tự đã xáo của riêng người đó); nút Xuất Excel là liên kết tải trực tiếp nên lỗi quyền hiện như trang lỗi của trình duyệt.


## PR 5d: thiết kế chi tiết (Q309–Q317 đã duyệt 7/11/2026; phần "Điểm tôi tự quyết" chờ chủ dự án xem; Q308 đã bỏ)

Chủ dự án duyệt từng Q; nội dung dưới đây ghi theo thứ tự duyệt. Chưa có dòng code nào.

| # | Quyết định |
|---|---|
| Q309 | **[đã duyệt 7/11/2026]** Chia 3 PR: **5d-1** API Phúc khảo và job Chốt (migration 0020); **5d-2** giao diện Phúc khảo cho cả Người dự thi và Người ra đề; **5d-3** Đính chính đáp án (API, giao diện, chấm lại hàng loạt). Tách Đính chính vì rủi ro nhất (chấm lại nhiều bài cùng lúc) |
| Q310 | **[đã duyệt 7/11/2026]** Phúc khảo một câu trắc nghiệm (chấm tự động): Người ra đề chọn **Giữ điểm** hoặc **Đặt điểm khác** (0 đến điểm của câu, chỉ áp cho riêng Người dự thi đó, nguồn `appeal`). Nếu nghi đáp án sai cho cả lớp: đường tắt sang Đính chính đáp án (5d-3), chỉ chủ Bộ đề thấy; người được Ủy quyền chỉ thấy gợi ý "Báo chủ Bộ đề để đính chính" |
| Q311 | **[đã duyệt 7/11/2026, sửa theo đề nghị của chủ dự án]** Hạn mức Phúc khảo của mỗi Người dự thi trong một Phiên thi = **10 % số câu của Bộ đề, làm tròn lên, ít nhất 3** (đề 5 hoặc 10 câu: 3; 50 câu: 5; 100 câu: 10). "Số câu" là số câu của Bộ đề: một Chùm đúng/sai tính là 1 câu. Phúc khảo về Mức xử lý tính chung vào hạn mức. Server tính bằng một hàm thuần ở `@exam/shared` (`appealLimitOf(itemCount)`), không thêm cột, Người ra đề không chỉnh được; màn Kết quả của Người dự thi hiện "đã dùng 3/5" |
| Q312 | **[đã duyệt 7/11/2026]** Người dự thi **không rút được** Phúc khảo đã gửi. Trước khi gửi có hộp xác nhận nêu câu và số lượt còn lại ("Gửi Phúc khảo Câu 7? Bạn còn 4/5 lượt.") để tránh bấm nhầm. Không có trạng thái "đã rút" |
| Q313 | **[đã duyệt 7/11/2026, đồng ý cả ba ý]** Màn xử lý Phúc khảo của Người ra đề: (1) tab **Phúc khảo** trong màn Kết quả, có số chờ xử lý, chờ xử lý lên đầu, lọc theo trạng thái và theo câu; (2) bấm một dòng thì mở màn **một Phúc khảo một màn** như màn Chấm: bài làm, điểm cũ, lý do, nút nhanh ¼ ½ ¾ tối đa, ô trả lời bắt buộc, phím J/K sang Phúc khảo kế tiếp, ghi chú đối chiếu ngắn "Câu 4 · Người dự thi thấy: Câu 7"; (3) **hiện tên** Người dự thi (không ẩn danh: Phúc khảo do chính họ yêu cầu; Chấm ẩn tên chỉ cho vòng chấm đầu) |
| Q314 | **[đã duyệt 7/11/2026]** **Gia hạn Thời hạn phúc khảo**: Người ra đề (chủ Phiên thi hoặc người được Ủy quyền) gia hạn khi Phiên thi **chưa Chốt**; chỉ tăng, không rút ngắn; tổng không quá 14 ngày kể từ lúc Công bố; mỗi lần gia hạn gửi chuông cho Người dự thi ("Thời hạn Phúc khảo kéo dài đến …"). Phiên thi "không nhận Phúc khảo" đã Chốt ngay nên không gia hạn được. Cài đặt: khóa dòng Phiên thi rồi dòng `session_gradings` như Công bố, so `finalized_at` trong cùng giao dịch (gia hạn xen job Chốt: bên nào khóa trước thì thắng, bên sau nhận 409 `ALREADY_FINALIZED`); trigger cho phép đổi `appeal_period_hours` chỉ khi tăng và còn trong 336 giờ |
| Q315 | **[đã duyệt 7/11/2026]** **Nhắc Phúc khảo bị bỏ quên**: khi quá Thời hạn phúc khảo mà còn Phúc khảo chờ, job Chốt gửi chuông cho Người ra đề và người được Ủy quyền **một lần lúc hết hạn rồi mỗi 24 giờ** cho đến khi xử lý hết. Chuông gộp một dòng và cập nhật số ("Còn 3 Phúc khảo chờ xử lý", như Q303), không thêm dòng mới mỗi ngày. Hệ thống không tự bác. Xử lý xong Phúc khảo cuối thì dừng nhắc và Chốt ngay |
| Q316 | **[đã duyệt 7/11/2026, đồng ý cả bốn ý]** **Đính chính đáp án, lối vào và xem trước**: (1) hai lối vào, chỉ chủ Bộ đề thấy (người được Ủy quyền không, theo Q307): nút *Đính chính đáp án* ở hàng câu của tab Thống kê câu, và ở trang Bộ đề đã Phát hành cạnh từng câu; (2) hộp thoại: chọn đáp án mới bằng giao diện chọn đáp án như lúc soạn câu, lý do bắt buộc, bảng **xem trước** ("12 người tăng điểm, 3 người giảm, 20 không đổi; 2 Phiên thi đã Chốt giữ nguyên"); (3) bấm xác nhận mới chấm lại; (4) câu tự luận không có đáp án nên không đính chính được |
| Q317 | **[đã duyệt 7/11/2026]** **Đính chính nhiều lần một câu**: được Đính chính lại nhiều lần, lần mới nhất là đáp án hiệu lực và hệ thống chấm lại theo đó; mỗi lần đều có vết (đáp án cũ → mới, người sửa, lúc nào, lý do). **Không có nút hoàn tác riêng** (muốn quay lại thì Đính chính lại). Phiên thi đã Chốt giữ nguyên điểm kể cả khi đính chính lại |

### Điểm tôi tự quyết (chờ chủ dự án xem; phản đối ý nào thì sửa ý đó)

**Cơ sở dữ liệu (migration 0020, 5d-1; bảng Đính chính ở 5d-3).**
- `appeals`: như data-model, thêm `session_id` và `user_id` (lặp lại từ Lượt để đếm hạn mức và liệt kê theo Phiên thi không phải nối bảng; trigger kiểm khớp Lượt như `violations_guard`), lý do 10–1000 ký tự, trả lời 1–1000 ký tự khi `resolved`, CHECK `target` khớp `item_id`/`violation_id`. Chỉ mục: UNIQUE từng phần `(attempt_id, item_id) WHERE item_id IS NOT NULL` và `(violation_id) WHERE violation_id IS NOT NULL`; `(session_id, status, created_at)` cho danh sách, số chờ và kiểm Chốt; `(session_id, user_id)` cho hạn mức. Trigger `appeals_guard`: chỉ INSERT khi Phiên thi đã Công bố, chưa Chốt và còn trong hạn (so giờ cơ sở dữ liệu, không tin client); `open → resolved` một lần, đã `resolved` thì không sửa, không xóa.
- `session_gradings` thêm `appeal_reminded_at` (job nhắc Q315 dùng để biết đã nhắc lúc nào; không suy từ bảng thông báo).
- `response_grades_guard` và `violations_guard` (Mức xử lý): sau Công bố chỉ cho ghi nguồn `appeal` khi có Phúc khảo `open` đúng đối tượng; sau Chốt vẫn chặn mọi ghi.
- Chỉ mục khác của 0020: `session_gradings (released_at) WHERE released_at IS NOT NULL AND finalized_at IS NULL` (job Chốt chỉ nhìn Phiên thi đang chờ Chốt, không quét lịch sử); `notifications (user_id, type) WHERE read_at IS NULL` (gộp chuông chỉ tìm trong chuông chưa đọc).
- Số câu của Bộ đề để tính hạn mức (Q311) đọc từ `exam_items`; đếm Phúc khảo của người đó dưới khóa tư vấn theo `(session, user)` để hai lần gửi cùng lúc không vượt hạn mức.

**API (5d-1).**
| Phương thức | Đường dẫn | Việc |
|---|---|---|
| POST | `/take/sessions/:id/appeals` | Gửi `{ target, itemId \| violationId, reason }`; 409 hết hạn / đã Chốt / vượt hạn mức / đã Phúc khảo đối tượng này |
| GET | `/take/sessions/:id/appeals` | Phúc khảo của tôi + `{ used, limit }` + hạn còn lại |
| GET | `/sessions/:id/appeals?status=&itemId=` | Danh sách cho Người ra đề (chủ hoặc người được Ủy quyền) + số chờ |
| GET | `/sessions/:id/appeals/:appealId` | Chi tiết: lý do, nội dung câu và bài làm từ `exam_items.snapshot`, điểm hiện tại, `seenAs` ("Người dự thi thấy Câu 7") |
| POST | `/sessions/:id/appeals/:appealId/resolve` | `{ score? \| penalty?, response }`; ghi `response_grades` nguồn `appeal` hoặc Mức xử lý mới; kiểm Chốt ngay nếu là Phúc khảo cuối sau hạn |
| POST | `/sessions/:id/appeal-period/extend` | Gia hạn `{ appealPeriodDays }` (tổng ≤ 14 ngày, chỉ tăng; Q314) |

**Job Chốt (`grading.finalize`, lặp 60 giây).** Chọn Phiên thi có `released_at`, chưa `finalized_at`, đã quá hạn; dùng `FOR UPDATE SKIP LOCKED`, kiểm lại không còn Phúc khảo `open` rồi đặt `finalized_at`. Cùng lượt quét: Phiên thi quá hạn mà còn Phúc khảo chờ và `appeal_reminded_at` null hoặc cách đây ≥ 24 giờ thì gửi chuông nhắc rồi đặt `appeal_reminded_at`. Chỉ mục riêng cho phần chọn để quét 1.000 Phiên thi dưới 100 ms.

**Thông báo (loại mới, `type` là text nên không đổi bảng).** Người ra đề: `appeal.new` (gộp theo Phiên thi, cập nhật số), `appeal.overdue` (nhắc, gộp). Người dự thi: `appeal.resolved`, `appeal.period_extended`; `result.corrected` ở 5d-3. Nhãn thêm vào `vi.json`.

**Giao diện (5d-2).** Người dự thi: nút *Phúc khảo* cạnh từng câu và từng Mức xử lý trong "Kết quả của tôi" khi còn hạn (đếm ngược), hộp thoại gõ lý do kèm "Điểm có thể tăng hoặc giảm sau khi xem xét lại" và "Bạn còn 4/5 lượt", mục *Phúc khảo của tôi* hiện trạng thái và câu trả lời. Người ra đề: tab *Phúc khảo* và màn xử lý như Q313; khối Công bố ở tab Kết quả thêm nút *Gia hạn*; thanh bước hiện "Phúc khảo (N chờ)". Hết hạn thì nút Phúc khảo biến mất, không để nút bấm rồi báo lỗi.

**Ngân sách phản hồi (đo và ghi ở 5d-1/5d-2).** Gửi Phúc khảo, mở danh sách, xử lý một Phúc khảo: mỗi việc dưới 300 ms với 500 Người dự thi; job Chốt quét 1.000 Phiên thi dưới 100 ms; E2E đo từ lúc bấm đến lúc thấy trạng thái đổi.

**Test (seam).** S1 hàm thuần: `appealLimitOf`, trạng thái hạn (còn hạn, hết hạn, đã gia hạn). S2 HTTP + PostgreSQL: gửi → xử lý → điểm và Kết quả đổi; hết hạn / vượt hạn mức / trùng đối tượng đều bị chặn; Chốt ngay khi xử lý xong Phúc khảo cuối sau hạn. S3 trigger: ghi sau Chốt, ghi `appeal` khi không có Phúc khảo mở, sửa Phúc khảo đã `resolved`. S4 đồng thời: hai lần gửi cùng lúc ở sát hạn mức, gia hạn xen job Chốt, hai người xử lý cùng một Phúc khảo. S5 bảo mật: response cho Người dự thi không có đáp án; Người dự thi khác không đọc/ gửi Phúc khảo của người khác (404); Người ra đề khác chủ và không được Ủy quyền nhận 404. S6 Playwright desktop và mobile: Người dự thi gửi, Người ra đề xử lý, Người dự thi thấy câu trả lời; gia hạn; nhắc.

**5d-3 (Đính chính)** sẽ có thiết kế chi tiết riêng (chấm lại theo lô, `key_correction_effects`, xem trước, thông báo `result.corrected`) trước khi code, vì còn vài quyết định về chấm lại hàng loạt.

### Kiểm tra thiết kế cơ sở dữ liệu với số dòng lớn (7/11/2026, chủ dự án yêu cầu)

Dựng cơ sở dữ liệu thử PostgreSQL 17: **100 000 Lượt đã nộp** (200 Phiên thi × 500 Người dự thi, 20 Bộ đề × 50 câu), **5 triệu dòng `responses`**, **5 triệu dòng `response_grades`** (771 MB, khoảng 150 byte mỗi dòng gồm cả chỉ mục), 50 000 Phúc khảo, 40 000 thông báo; áp bản nháp 0020. Đo `EXPLAIN ANALYZE` trên Phiên thi 500 Lượt (máy dev, nguội sau khi nạp):

| Truy vấn | Kế hoạch | Thời gian |
|---|---|---|
| Lượt đã nộp của một Phiên thi (500 dòng) | quét chỉ mục `attempts_session_user_no_unique` | 0,2 ms |
| Điểm từng câu của 500 Lượt (25 000 dòng) | 500 lần tra khóa chính `response_grades` | 25 ms |
| Dấu "đã chấm" của 500 Lượt | quét chỉ mục `attempt_grades_pkey` | 2,5 ms |
| Kết quả của một Người dự thi (Lượt + 50 điểm) | tra chỉ mục | 0,2 ms |
| "Phiên thi của tôi" (200 Lượt của một người + trạng thái Công bố) | `attempts_user_idx` | 0,4 ms |
| Job Chốt: Phiên thi quá hạn chưa Chốt | bảng 200 dòng | 0,07 ms |
| Hạn mức Phúc khảo của một người | `appeals_session_user_idx` (chỉ quét chỉ mục) | 0,03 ms |
| Danh sách Phúc khảo chờ của Phiên thi, kiểm "còn Phúc khảo mở" | `appeals_session_status_idx` | 0,03 ms |
| Đếm Phúc khảo chờ trên toàn bộ danh sách Phiên thi (12 500 dòng) | quét bảng (khớp 25 %) | 10 ms |
| Job quét chấm bù, cửa sổ 15 phút | `attempts_submitted_idx` | 0,04 ms |
| Job quét chấm bù, toàn bộ 31 ngày (cả 100 000 Lượt, trường hợp xấu nhất) | quét bảng | 68 ms |
| Đính chính: một câu của 1 000 Lượt (Phiên thi chưa Chốt của một Bộ đề) | `sessions.exam_id` → `attempts` → khóa chính `response_grades` | 32 ms |
| Đính chính: một câu của cả 5 000 Lượt (10 Phiên thi) | như trên | 67 ms |
| Gộp chuông: chuông chưa đọc của một người theo loại | `notifications_unread_idx` | 2,6 ms (đã gồm tra người dùng bằng quét bảng của phép thử) |

**Kết luận:**
- Mọi truy vấn của 5d đều đi theo `attempt_id` hoặc `session_id` nên thời gian không phụ thuộc tổng số dòng của bảng; mỗi Phiên thi thêm vào chỉ thêm đúng 25 000 dòng điểm (khoảng 4 GB cho 1 000 Phiên thi, 25 triệu dòng). Chưa cần chia bảng (partition); xem lại khi bảng điểm vượt khoảng 100 triệu dòng.
- **Không thêm chỉ mục `response_grades (item_id)`** cho Đính chính: đi từ Bộ đề → Phiên thi → Lượt rồi tra khóa chính nhanh hơn và không làm chậm mỗi lần ghi điểm.
- **Phúc khảo không được dùng `GradingContextService.load`** (nạp điểm cả Phiên thi, 25 000 dòng mỗi lần gọi): gửi và xử lý một Phúc khảo chỉ đọc đúng một Lượt bằng khóa chính (dưới 1 ms ở cơ sở dữ liệu). Đây là ràng buộc cho code 5d-1.
- Đính chính chấm lại theo lô (ví dụ 100 Lượt mỗi lô), mỗi lô một giao dịch, để không giữ khóa lâu và không chặn Chấm tay của Phiên thi khác.
- `notifications` và `attempts_submitted_idx` lớn dần theo thời gian (mỗi Lượt đã nộp mãi nằm trong chỉ mục từng phần); truy vấn dùng khoảng thời gian gần nên không chậm. Việc dọn thông báo đã đọc cũ hơn 90 ngày để backlog.
- 5d-1 thêm một bản đo nạp dữ liệu lớn vào `grading-bench.int.test.ts` (đã có cờ `GRADING_BENCH`): nạp nền 20 Phiên thi trước khi đo Phúc khảo để bắt chậm do bảng lớn.

### Giao diện duyệt Kết quả từng câu của Người dự thi (Q318, đã duyệt và làm 7/11/2026)

Chủ dự án thử "Kết quả của tôi" thấy danh sách thu gọn dọc 40–50 câu khó duyệt, nhất là khi Người ra đề cho xem lại đề. Thiết kế lại theo khung màn làm bài, chỉ xem, không chọn được:

- **Bản đồ câu**: mỗi ô có số, biểu tượng và màu (✓ Đúng, ◐ Chưa đúng hoàn toàn, ✗ Sai, – Bỏ trống; không chỉ dựa vào màu). Máy tính (từ 1024 px): cột trái dính khi cuộn, ô 40 px. Điện thoại: mở từ thanh dưới, ô 48 px như bảng chọn câu ở màn làm bài.
- **Dải tổng quan** một vạch mỗi câu và **bốn nút lọc có đếm** (Đúng, Chưa đúng hoàn toàn, Sai, Bỏ trống). Bật lọc thì nhảy tới câu khớp đầu tiên; nút câu trước/sau chỉ đi qua các câu khớp; ô ngoài bộ lọc mờ đi (không ẩn, để vị trí không nhảy). Nút **Câu sai kế tiếp** quay vòng.
- **Một câu một màn**: đầu thẻ là dải kết quả to (biểu tượng, chữ, màu, điểm, "đúng 3/4 Mệnh đề"). Khi Người ra đề cho xem lại đề: nội dung câu và Phương án/Mệnh đề giống màn làm bài nhưng không bấm được, đánh dấu "Bạn đã chọn", **không bao giờ hiện Đáp án đúng**. Mặc định (không xem lại đề): thẻ chỉ có kết quả và dòng "Người ra đề không mở xem lại nội dung câu này"; câu tự luận hiện bài làm và nhận xét.
- **Điều hướng**: phím ← →; `?cau=` trên địa chỉ để tải lại hay Back vẫn đúng câu (thay thế, không đẩy lịch sử). Bỏ hẳn chế độ danh sách dọc.
- Mã: `lib/result-review.ts` (hàm thuần: đếm, bước theo bộ lọc, câu sai kế tiếp; 11 test), `lib/ui/grading/result-review.tsx`, `my-result.tsx` chỉ còn khối điểm. E2E `result-review.spec.ts` (desktop và mobile): bốn kết quả, lọc, câu sai kế tiếp, tải lại giữ chỗ, bản đồ, phím, không có ô chọn, không lộ đáp án; lọc → đổi thẻ câu 87–113 ms. Chừa chỗ nút Phúc khảo từng câu cho 5d-2.

**Ghi chú cho hướng dẫn sử dụng (Người dự thi):** mở *Kết quả của tôi*, nhìn dải màu và các nút đếm để biết bao nhiêu câu đúng, sai; bấm nút lọc rồi dùng mũi tên hoặc "Câu sai kế tiếp" để xem lại từng câu; trên điện thoại bấm ô vuông ở thanh dưới để chọn nhanh một câu.

**Chỉnh lại sau khi chủ dự án thử (7/11/2026):** (1) chuyển câu làm trang nhảy về đầu như tải lại do router mặc định cuộn lên đầu khi đổi địa chỉ → điều hướng `?cau=` dùng `resetScroll: false`, và chỉ cuộn khi đầu thẻ câu đã trôi lên khỏi màn hình; E2E giữ vị trí cuộn (gỡ bản sửa thì vị trí về 0 và test đỏ). (2) Khối điểm quá to và ở chế độ tối chữ/vòng điểm khó đọc trên nền màu đặc → thẻ điểm gọn một hàng (vòng 96 px, tên Phiên thi, nhãn mức đạt, Điểm thô, Mức đạt), số điểm luôn chữ `fg` trên nền thẻ trung tính, màu dải chỉ ở vạch trên thẻ, nét vòng và nhãn (các cặp token đã có trong `tokens.test.ts`); câu đầu tiên hiện ngay màn đầu trên điện thoại. (3) Nút lọc xếp một hàng bốn ô trên điện thoại (biểu tượng + số, nhãn ngắn "Một phần" bên dưới).

### PR 5d-1: ghi chú triển khai (7/11/2026)

- **Migration 0020:** bảng `appeals` (kiểu `appeal_target`, `appeal_status`; `session_id` và `user_id` lặp lại từ Lượt; CHECK lý do 10–1000, trả lời 1–1000, đối tượng khớp, đã xử lý đủ trường; UNIQUE từng phần `(attempt_id, item_id)` và `(violation_id)`; chỉ mục `(session_id, status, created_at)` và `(session_id, user_id)`), `session_gradings.appeal_reminded_at`, chỉ mục `session_gradings_finalize_idx` (chỉ Phiên thi đang chờ Chốt), `notifications_unread_idx`. Trigger mới/thay: `appeals_guard` (chỉ chèn khi đã Công bố và chưa Chốt, khớp Lượt/Bộ đề/Vi phạm, khóa chia sẻ dòng thiết lập chấm; đã xử lý bất biến; không xóa), `session_gradings_guard` (chỉ tăng `appeal_period_hours`, chỉ khi chưa Chốt), `response_grades_guard` (sau Công bố nguồn `appeal` chỉ ghi khi có Phúc khảo mở đúng câu), `violations_guard` (Mức xử lý sau Công bố chỉ đổi khi có Phúc khảo mở đúng Vi phạm, sau Chốt không đổi). **Giờ hạn do service kiểm bằng đồng hồ của ứng dụng, trigger không so với `now()`** (đồng hồ giả trong test; khác bản thiết kế dự kiến ban đầu).
- **`@exam/shared`:** `appealLimitOf` (10 % số câu làm tròn lên, tối thiểu 3), `createAppealSchema`, `resolveAppealSchema`, `extendAppealPeriodSchema`, hằng số (`APPEAL_MAX_DAYS`, độ dài lý do/trả lời).
- **Người dự thi** (`CandidateAppealsService`): `POST /take/sessions/:id/appeals` (câu theo số "Câu N" đã thấy hoặc `violationId`; Lượt được tính chọn bằng `CandidateResultService.countedAttempt`, chỉ đọc tổng điểm vài Lượt của người đó), `GET /take/sessions/:id/appeals` (`limit`, `used`, `appealUntil`, danh sách). Lỗi `409 INVALID_STATE` với `reason`: `NOT_RELEASED`, `ALREADY_FINALIZED`, `APPEAL_PERIOD_ENDED`, `APPEAL_LIMIT_REACHED`, `ALREADY_APPEALED`. Hai lần gửi cùng lúc của một người nối đuôi bằng khóa tư vấn theo (Phiên thi, người). Kết quả của tôi: danh sách Mức xử lý thêm `id` để Phúc khảo được.
- **Người ra đề** (`AppealsService`, `AppealsController`): `GET /sessions/:id/appeals?status=&no=` (chờ xử lý lên đầu, kèm `no` theo đề và `seenAs` theo Người dự thi, tối đa 500 dòng), `GET .../appeals/:appealId` (nội dung câu có đáp án, bài làm, điểm hiện tại hoặc Vi phạm), `POST .../appeals/:appealId/resolve` (`{response, score}` hoặc `{response, penalty}`; điểm ghi nguồn `appeal`, vết trước/sau ở `appeals.previous_value/new_value`, nhật ký `appeal.resolved`, báo `appeal.resolved` cho Người dự thi), `POST .../appeal-period/extend` (gia hạn). Không dùng `GradingContextService.load`. `GET .../results` thêm `release.appeals: {open, resolved}`.
- **Chốt và nhắc** (`AppealFinalizeService`, job `grading.finalize` mỗi phút): Chốt Phiên thi quá hạn không còn Phúc khảo chờ (khóa độc quyền dòng thiết lập chấm), xử lý xong Phúc khảo cuối sau hạn thì Chốt ngay; nhắc `appeal.overdue` lúc hết hạn rồi mỗi 24 giờ (`appeal_reminded_at`); gia hạn đặt lại bộ nhắc.
- **Thông báo:** `NotificationsService.upsertUnread`/`clearUnread` gộp một dòng theo (người, loại, Phiên thi) với khóa tư vấn; loại mới `appeal.new`, `appeal.overdue` (Người ra đề và người được Ủy quyền), `appeal.resolved`, `appeal.period_extended` (Người dự thi); nhãn và đường dẫn ở chuông.
- **Test:** `grading-appeals.int.test.ts` 20 test (gửi/xem, các lý do 409, hạn mức, người ngoài 404, xử lý đặt điểm và Mức xử lý, Giữ điểm, người được Ủy quyền, Chốt, nhắc, gia hạn, đua nhau: bốn Phúc khảo cùng lúc, hai người cùng xử lý, gia hạn xen Chốt, các trigger), `appeal.test.ts` (`@exam/shared`, 11 test). Toàn bộ 849 test integration xanh.
- **Số đo** (500 người, 600 Phúc khảo, máy dev): danh sách 16 ms, mở một Phúc khảo 9 ms, xử lý 29 ms, "Phúc khảo của tôi" 9 ms, gửi một Phúc khảo 30 ms, một lượt quét job Chốt 4 ms (`GRADING_BENCH=1`, thêm `--reporter=verbose --silent=false` để thấy các dòng `[đo]`).
- **Chưa làm (5d-2):** giao diện Phúc khảo cho Người dự thi (nút theo câu, hộp xác nhận, mục Phúc khảo của tôi) và Người ra đề (tab Phúc khảo, màn xử lý, Gia hạn, thanh bước). Tạm thời `appeal.new` dẫn tới màn Kết quả.
- **Ghi chú cho hướng dẫn sử dụng (Người dự thi):** Phúc khảo gửi được cho một câu hoặc một Mức xử lý bị áp lên điểm của bạn, trong Thời hạn phúc khảo; mỗi đối tượng một lần, không rút được; tối đa bằng 10 % số câu của đề (ít nhất 3); điểm có thể tăng, giữ nguyên hoặc giảm sau khi xem xét. Bạn nhận thông báo khi Phúc khảo được xử lý kèm câu trả lời. **(Người ra đề):** mỗi Phúc khảo cần câu trả lời bắt buộc; có thể gia hạn Thời hạn phúc khảo (chỉ tăng, tối đa 14 ngày); còn Phúc khảo chờ thì Phiên thi chưa được Chốt, hệ thống nhắc bạn lúc hết hạn rồi mỗi ngày.

### PR 5d-2: ghi chú triển khai (7/11/2026)

- **Người dự thi** (`lib/ui/grading/appeal-box.tsx`, nối vào `my-result.tsx` và `result-review.tsx`): dòng tóm tắt đầu màn ("Bạn có thể gửi Phúc khảo trong 3 ngày nữa · đã dùng 0/3 lượt", hoặc đã hết hạn / đã Chốt / không nhận Phúc khảo); nút **Phúc khảo Câu N** ở cuối thẻ câu và nút cho từng Mức xử lý; hộp xác nhận nêu "Bạn còn 3/3 lượt", "Điểm có thể tăng hoặc giảm sau khi xem xét lại", ô lý do (≥ 10 ký tự, đếm ký tự), nút gửi khóa đến khi đủ; sau khi gửi thẻ câu hiện trạng thái (chờ xử lý hoặc câu trả lời và "Từ 0 thành 1"), ô trên bản đồ có chấm và nhãn "đã Phúc khảo"; mục gấp "Phúc khảo của tôi (N)" liệt kê mọi Phúc khảo (kể cả Mức xử lý đã được bỏ). Gửi xong cập nhật bộ nhớ đệm ngay bằng phản hồi của server.
- **Người ra đề:** tab **Phúc khảo (N)** ở màn Kết quả (sau Công bố): lọc Chờ xử lý / Đã xử lý / Tất cả, mỗi dòng nêu tên, mã, "Câu 4 · Người dự thi thấy: Câu 7", lý do; nút **Xử lý Phúc khảo (N)** cạnh nút Chấm tự luận; màn xử lý `/examiner/sessions/:id/appeals?appeal=` (chủ và người được Ủy quyền): danh sách bên trái (máy tính) hoặc nút Trước/Sau (điện thoại), phím J/K, đầu thẻ nêu tên Người dự thi, lý do, nội dung câu kèm đáp án (tái dùng `QuestionView`), bài làm của họ, điểm hiện tại và nguồn, ô điểm mới + nút nhanh 0 ¼ ½ ¾ Tối đa, hoặc ba mức xử lý (Không xử lý, Trừ x %, Hủy kết quả), ô trả lời bắt buộc, nút "Giữ nguyên và trả lời" / "Đổi và trả lời" (đổi nhãn theo giá trị), xử lý xong sang Phúc khảo chờ kế tiếp. Phúc khảo đã xử lý hiện chỉ đọc kèm câu trả lời và "Từ … thành …".
- **Gia hạn** ở khối Công bố: số Phúc khảo chờ/đã xử lý (bấm mở tab Phúc khảo) và nút **Gia hạn** (chỉ khi chưa Chốt và dưới 14 ngày) với danh sách tổng số ngày mới > hiện tại.
- **Chuông:** `appeal.resolved` và `appeal.period_extended` dẫn tới Kết quả của tôi, `appeal.new` và `appeal.overdue` dẫn tới màn Kết quả của Phiên thi.
- **Test:** E2E `appeals.spec.ts` (desktop và mobile): Người dự thi mở câu sai, hộp xác nhận (nút khóa khi lý do ngắn), gửi (166–183 ms đến lúc thấy trạng thái), mỗi câu một lần, Người ra đề thấy số chờ, mở màn xử lý, đặt tối đa và trả lời (138–209 ms), Gia hạn 3 → 5 ngày, Người dự thi thấy điểm 9/9 và câu trả lời. `grading.spec`, `release.spec`, `result-review.spec` vẫn xanh.
- **Chưa làm:** đường tắt sang Đính chính đáp án ở màn xử lý (cần 5d-3); thanh bước "Phúc khảo (N chờ)".
- **Ghi chú cho hướng dẫn sử dụng (Người dự thi):** mở Kết quả của tôi, chọn câu muốn xem lại rồi bấm *Phúc khảo Câu N*; ghi lý do cụ thể (ít nhất 10 ký tự); sau khi gửi không rút lại được. Câu trả lời của Người ra đề hiện ngay dưới câu đó và trong mục "Phúc khảo của tôi", bạn cũng nhận thông báo. **(Người ra đề):** vào tab *Phúc khảo* hoặc bấm *Xử lý Phúc khảo*; mỗi Phúc khảo cần câu trả lời; nút đổi nhãn "Giữ nguyên" khi bạn không đổi điểm; dùng J/K để sang Phúc khảo kế tiếp.
