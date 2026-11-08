# Lát cắt 6: đưa bản MVP đầu tiên lên chạy thật

Trạng thái: **đang thiết kế** (chưa có code). Mỗi quyết định được chủ dự án duyệt từng câu một và ghi lại ở đây.

Phạm vi dự kiến: pipeline deploy lên pod `prod-exam` (Podman trên WSL, Cloudflare Tunnel, xem ADR-0006), khởi tạo môi trường chạy thật, **sao lưu và khôi phục**, khuyến nghị chạy hai bản api cho phòng từ 300 người (xem `docs/hieu-nang.md`).

## Thiết kế sao lưu và khôi phục

Lý do: đề thi và bài làm của Người dự thi là dữ liệu không làm lại được. Bất biến của hệ thống là Câu trả lời được ghi vào PostgreSQL trước khi báo lưu thành công, nên mất cơ sở dữ liệu là mất bài thi.

### Cần sao lưu những gì

| Thành phần | Sao lưu | Ghi chú |
|---|---|---|
| PostgreSQL (volume `exam_pgdata`) | Có, quan trọng nhất | Đề thi, Lượt làm bài, Câu trả lời, điểm, Phúc khảo, nhật ký |
| Volume `exam_media` (ảnh) | Có | Chỉ thêm file mới, đồng bộ theo kiểu chỉ chép phần mới |
| Khóa bí mật (`SLIP_ENCRYPTION_KEY`, các file env trong `~/exam-prod-secrets/`) | Có, tách riêng | Mất khóa thì Phiếu tài khoản cũ không đọc được |
| Redis | Không | Chỉ chứa dữ liệu tạm (phiên, hàng đợi) |

### Q323: mức mất dữ liệu tối đa chấp nhận được (đã duyệt 8/11/2026)

Chọn **phương án A: khoảng 1 đến 5 phút**. Dùng đủ 4 lớp:

1. **Bản đầy đủ**: `pg_dump -Fc` hằng ngày lúc 2 giờ sáng, thêm một bản ngay trước mỗi lần deploy và ngay sau mỗi lần Công bố; kiểm tra file mở được; giữ 14 bản hằng ngày, 8 bản hằng tuần, 12 bản hằng tháng.
2. **Lưu liên tục**: lưu nhật ký ghi của PostgreSQL (WAL) theo từng phút, kèm bản nền định kỳ, để khôi phục về một thời điểm bất kỳ (PITR).
3. **Bản ngoài máy, đã mã hóa**: mỗi đêm mã hóa rồi đẩy sang nơi khác máy; chép cả `exam_media` và khóa bí mật.
4. **Thử khôi phục định kỳ**: mỗi tháng tự khôi phục bản gần nhất vào cơ sở dữ liệu tạm, kiểm tra số dòng, khởi động thử api, ghi lại thời gian khôi phục.

Thêm: chuông báo cho Quản trị viên nếu bản sao lưu mới nhất cũ hơn 26 giờ hoặc bị lỗi; sách hướng dẫn khôi phục `docs/ops/khoi-phuc.md`.

### Ai làm việc sao lưu và khôi phục (đã trao đổi 8/11/2026)

- Sao lưu, đẩy ra ngoài máy, thử khôi phục: **script chạy tự động** theo bộ hẹn giờ trên server (systemd timer), không có nút trong giao diện.
- Sao lưu thêm trước việc lớn: người vận hành gõ lệnh trên server.
- Khôi phục thật: **thủ công**, người vận hành làm theo sách hướng dẫn. Không làm nút "Khôi phục" trong ứng dụng (ghi đè cơ sở dữ liệu đang chạy, khóa và tài khoản kho ngoài máy không nên nằm trong ứng dụng, giao diện cũng hỏng khi hệ thống hỏng).
- Quản trị viên chỉ có màn hình **chỉ đọc** về tình trạng sao lưu (script ghi kết quả mỗi lần chạy vào một bảng nhỏ) và nhận chuông khi quá hạn.

### Cách tổ chức dữ liệu sao lưu và dung lượng (đã trao đổi 8/11/2026)

- Lớp 1 là bản đầy đủ mỗi lần, mỗi file đứng độc lập, dung lượng mỗi file tăng theo kho dữ liệu.
- Lớp 2 là kiểu cộng dồn (WAL) nhưng **không để chuỗi kéo dài vô hạn**: mỗi tuần làm một bản nền mới, xóa nhật ký cũ hơn bản nền cũ nhất còn giữ.
- `exam_media` đồng bộ theo kiểu chỉ chép file mới.
- Ước tính (chưa đo): năm đầu khoảng 1–2 GB cho 34 bản `pg_dump` và khoảng 1–2 GB cho bản nền cùng WAL một tuần; ba năm khoảng 7 GB và 3–5 GB. Trước khi chạy thật đo lại bằng ca đo tải 500 người và ghi số vào `docs/hieu-nang.md`.
- Gói miễn phí 10 GB của R2 đủ khoảng 1–2 năm; sau đó trả phí nhỏ hoặc giảm số bản giữ ở ngoài máy.

### Q324: nơi lưu bản sao (đã duyệt 8/11/2026)

Chọn **R2 cộng thêm một bản tại ổ D: của Windows**:

- **Bản ngoài máy:** Cloudflare R2, tận dụng 10 GB miễn phí. Dữ liệu mã hóa trước khi đẩy lên. Dùng một khóa R2 riêng chỉ được ghi, không được xóa; khóa dùng để đọc lại khi khôi phục cất riêng.
- **Bản tại chỗ:** thư mục trên ổ D: của máy Windows (WSL thấy qua `/mnt/d`), bên cạnh bản trong WSL.
- Lưu ý: nếu D: chỉ là một phân vùng của cùng một ổ cứng vật lý thì bản này chống được xóa nhầm và hỏng hệ thống tập tin WSL, nhưng **không** chống được hỏng ổ cứng. Phần đó do bản R2 đảm nhiệm. Khi viết script sẽ kiểm tra D: nằm trên ổ vật lý nào và ghi vào sách hướng dẫn.

### Q325: thời gian giữ bản sao ở từng nơi (đã duyệt 8/11/2026)

| Nơi | Giữ gì | Vì sao |
|---|---|---|
| WSL (trên máy) | 14 bản hằng ngày, 4 bản hằng tuần, WAL 7 ngày | Khôi phục nhanh nhất khi xóa nhầm hoặc deploy hỏng |
| Ổ D: (còn khoảng 82 GB) | 14 bản hằng ngày, 8 bản hằng tuần, 12 bản hằng tháng, WAL 14 ngày | Rộng chỗ, giữ lâu nhất để quay về mốc cũ |
| R2 (10 GB miễn phí) | 7 bản hằng ngày, 4 bản hằng tuần, 6 bản hằng tháng, WAL 7 ngày, bản nền gần nhất | Giữ gọn để nằm trong gói miễn phí; là chỗ cứu khi mất cả máy |

Mốc quay về xa nhất: 12 tháng ở D:, 6 tháng ở R2. Nếu R2 gần đầy thì giảm số bản hằng tháng trước, không giảm WAL và bản nền.

**Cách hiểu chữ "bản"** (làm rõ 8/11/2026): một bản là một file `pg_dump` đầy đủ, ứng với một thời điểm, có thể khôi phục độc lập. Script chỉ tạo **một bản mỗi đêm**. "Hằng tuần" và "hằng tháng" không phải bản làm thêm, mà là bản của đêm Chủ nhật (hằng tuần) và đêm mùng 1 (hằng tháng) được **giữ lại lâu hơn** thay vì bị xóa sau 14 ngày. Vì vậy tổng số file ở D: chỉ khoảng 14 + 8 + 12 = 34, không nhân đôi. Ngày không có ai thao tác vẫn có một bản, nội dung gần như giống bản hôm trước; chấp nhận vì file nhỏ, và bản đó còn chứng minh script vẫn chạy (quy tắc báo chuông 26 giờ dựa vào đó). Lưu liên tục (WAL) vào ngày không hoạt động gần như không phát sinh gì.

## Tóm tắt phương án sao lưu (để theo dõi và xem lại)

Mục tiêu: mất tối đa 1 đến 5 phút thao tác của Người dự thi khi máy hỏng giữa giờ thi (Q323).

```text
PostgreSQL ──┬─ pg_dump hằng ngày 02:00, trước deploy, sau Công bố   (lớp 1)
             ├─ WAL từng phút + bản nền hằng tuần                    (lớp 2, khôi phục về một thời điểm)
exam_media ──┤  chỉ chép file mới
khóa bí mật ─┘  chép riêng
                     │ mã hóa
        ┌────────────┼────────────┐
      WSL         Ổ D: (Windows)   Cloudflare R2     (lớp 3, Q324, Q325)
                     │
   mỗi tháng: khôi phục thử vào CSDL tạm, kiểm tra, ghi thời gian   (lớp 4)
   quá 26 giờ chưa có bản mới → chuông báo Quản trị viên
```

| Quyết định | Nội dung | Câu |
|---|---|---|
| Mức mất dữ liệu tối đa | 1 đến 5 phút, dùng đủ 4 lớp | Q323 |
| Ai làm | Script tự động theo systemd timer; khôi phục thật làm thủ công theo sách hướng dẫn; Quản trị viên chỉ xem tình trạng | trao đổi 8/11 |
| Nơi lưu | WSL, ổ D: của Windows, Cloudflare R2 (khóa chỉ ghi, không xóa) | Q324 |
| Thời gian giữ | Theo bảng Q325 | Q325 |

Việc cần làm khi viết code lát cắt 6 (chưa làm):
- Script sao lưu, đẩy ra ngoài máy, khôi phục, thử khôi phục; timer systemd; thiết lập lưu WAL cho PostgreSQL trong pod.
- Bảng nhỏ ghi kết quả mỗi lần sao lưu; màn hình chỉ đọc cho Quản trị viên; job báo chuông khi quá 26 giờ.
- `docs/ops/khoi-phuc.md`: sách hướng dẫn khôi phục từng bước, gồm cả khôi phục về một thời điểm.
- Đo dung lượng thật bằng ca đo tải 500 người, ghi vào `docs/hieu-nang.md`; kiểm D: nằm trên ổ vật lý nào.
- Cập nhật `docs/architecture.md` mục 6 và 8, `docs/ops/demo-wsl.md` mục 8 theo phương án này.

### Q326: ai khôi phục khi sự cố (đã duyệt 8/11/2026)

Chọn **phương án A**: chủ dự án là người khôi phục chính, thêm **một người dự phòng**. Người dự phòng được đưa `docs/ops/khoi-phuc.md` (viết cho người biết dòng lệnh Linux cơ bản) và một bản chép các khóa cần để khôi phục (khóa đọc R2, khóa giải mã bản sao lưu, `SLIP_ENCRYPTION_KEY`). Nơi cất các khóa này sẽ chốt ở câu sau.

### Q327: nơi cất bản chép các khóa (đã duyệt 8/11/2026)

Chọn **phương án C: cả hai**.

- **Trình quản lý mật khẩu dùng chung** (ví dụ Bitwarden, gói miễn phí cho hai người): chủ dự án và người dự phòng cùng mở được từ điện thoại, không phụ thuộc máy WSL. Dùng hằng ngày.
- **Bản giấy trong phong bì niêm phong** cất ở nhà: dự phòng khi không vào được trình quản lý mật khẩu.
- Các khóa cần chép: khóa đọc R2, khóa giải mã bản sao lưu, `SLIP_ENCRYPTION_KEY`, thông tin đăng nhập R2 và mật khẩu cơ sở dữ liệu. Không đưa khóa vào repo, vào chat hay vào tài liệu.
- `docs/ops/khoi-phuc.md` ghi **tên** từng khóa và chỗ tìm, không ghi giá trị.
- Mỗi lần đổi khóa phải cập nhật cả hai nơi; việc này nằm trong checklist thử khôi phục hằng tháng.

### Q328: dịch vụ báo ngoài máy (đã duyệt 8/11/2026)

Chọn **phương án A: có dùng** một dịch vụ kiểu healthchecks.io (gói miễn phí).

- Một địa chỉ báo cho sao lưu hằng đêm: script gọi sau khi sao lưu và đẩy ra ngoài máy thành công; gọi địa chỉ "thất bại" khi lỗi.
- Một địa chỉ báo hệ thống còn trả lời, để biết khi cả máy tắt, ngủ, mất điện hoặc mất mạng.
- Email báo về hộp thư của chủ dự án, thêm người dự phòng nếu muốn.
- Chỉ gửi tín hiệu "còn sống", **không** gửi dữ liệu thi hay tên người dùng. Địa chỉ báo là bí mật nhỏ, cất trong env file như các khóa khác.
- Quyết định cuối cùng về nhà cung cấp cụ thể và hạn chờ (ví dụ quá 26 giờ thì báo) chốt khi viết script.

## Trạng thái thiết kế sao lưu

Đã duyệt xong Q323–Q328: mức mất dữ liệu, ai làm, nơi lưu, thời gian giữ, người khôi phục, nơi cất khóa, báo ngoài máy. Chưa có code.

## Thiết kế deploy

### Q330: địa chỉ công khai (đã duyệt 8/11/2026)

Chọn **phương án C**: bản MVP dùng một tên phụ của tên miền hiện có (`plotrackerbluni.site`, qua tunnel Cloudflare sẵn có, cổng `:8180`); mua tên miền riêng sau khi hệ thống ổn định. Tên phụ cụ thể chốt khi cấu hình tunnel.

**Đổi địa chỉ về sau (đã kiểm trong code 8/11/2026):**
- Địa chỉ chỉ xuất hiện ở biến `APP_ORIGINS` của api (chống CSRF, kiểm Origin của Socket.IO, địa chỉ trang đăng nhập trong mã QR của Phiếu tài khoản). **Không có địa chỉ nào được lưu trong PostgreSQL**, nên dữ liệu thật không bị ảnh hưởng.
- Các bước: thêm tên mới vào tunnel (cả hai tên cùng chạy được), đặt `APP_ORIGINS` gồm cả hai địa chỉ (cách nhau dấu phẩy), khởi động lại api; sau vài tuần bỏ tên cũ.
- Hệ quả cần biết: người dùng phải **đăng nhập lại** ở địa chỉ mới (cookie gắn theo tên miền); ai đã thêm trang vào màn hình chính điện thoại phải thêm lại; Phiếu tài khoản đã in trước đó có mã QR trỏ về địa chỉ cũ (phiếu chỉ sống 7 ngày, và nhờ giữ cả hai tên cùng chạy nên vẫn dùng được). `APP_ORIGINS[0]` là địa chỉ in vào phiếu mới, nên đặt địa chỉ mới đứng đầu.
- Nên đổi vào lúc không có Phiên thi.

**Chuyển từ WSL sang VPS về sau:**
- Khôi phục bản `pg_dump` (lớp 1) sang máy mới được: đây là bản **logic**, chạy được trên máy khác kiến trúc CPU hay hệ điều hành, miễn PostgreSQL mới **cùng bản chính hoặc mới hơn** (hiện là 17).
- Bản nền cộng WAL (lớp 2) là bản **vật lý**: chỉ khôi phục được trên máy cùng bản chính PostgreSQL và cùng kiến trúc CPU. Dùng cho sự cố trên chính máy này, không dựa vào để chuyển máy.
- Mang theo: `exam_media`, `SLIP_ENCRYPTION_KEY` (nếu mất chỉ các Phiếu tài khoản còn hạn không mở lại được), các env file. Phiên đăng nhập nằm ở Redis nên người dùng đăng nhập lại.
- Quy trình dự kiến: không có Phiên thi → dừng ghi → `pg_dump` cuối → khôi phục trên VPS → chép `exam_media` → chuyển tunnel/DNS → giữ nguyên dữ liệu trên WSL một thời gian để quay lại. Thử khôi phục sang máy khác là một lần diễn tập trước khi chuyển thật; thử khôi phục hằng tháng cũng chứng minh bản `pg_dump` còn dùng được.
- Ảnh sau `MediaStore` có thể chuyển sang R2/S3 khi lên VPS mà không sửa nghiệp vụ (ADR-0006).

### Q331: cách kích hoạt deploy (đã duyệt 8/11/2026)

Chọn **phương án A: bấm tay**. Merge vào `main` chỉ build image, **không** tự deploy.

- Chủ dự án vào GitHub, bấm "Run workflow" của workflow deploy và chọn bản cần đưa lên (mã commit đã build xanh).
- Workflow chạy trên runner riêng của exam-system (`~/actions-runner-exam-sys`, nhãn `wsl-exam`; kiểm đã đăng ký chưa khi làm pipeline) và làm các bước ở `architecture.md` mục 9: kiểm tra pod và env file, chặn nếu có Phiên thi, `pg_dump` trước khi deploy, migration, thay lần lượt api, worker, web kèm kiểm tra sức khỏe, smoke test qua địa chỉ công khai.
- **Quay lui** là chạy lại workflow với mã commit cũ (migration chỉ thêm theo kiểu expand, contract, nên bản cũ vẫn chạy được trên cơ sở dữ liệu mới).
- **Yêu cầu về tài liệu:** hướng dẫn vận hành phải đủ chi tiết để làm nguồn tham khảo lâu dài, viết bằng tiếng Việt, từng bước, kèm lệnh cụ thể, kết quả mong đợi và cách xử lý khi lỗi. Dự kiến `docs/ops/trien-khai.md` (lần đầu và các lần sau, kiểm tra trước giờ thi, quay lui, đổi khóa, đổi địa chỉ, chuyển sang VPS) cùng `docs/ops/khoi-phuc.md`; `docs/ops/demo-wsl.md` được thay hoặc trỏ về hai tài liệu này khi lát cắt 6 có code. Mỗi PR của lát cắt 6 đổi cách vận hành phải cập nhật các tài liệu đó trong cùng PR.

### Q332: chốt chặn khi deploy gặp Phiên thi (đã duyệt 8/11/2026)

Chọn **phương án B**:

- Script deploy **từ chối chạy** nếu có Phiên thi đang diễn ra hoặc sẽ bắt đầu trong 60 phút tới.
- Có tùy chọn **ép khẩn cấp**: mặc định vẫn chặn; muốn ép, người bấm chạy phải nhập lý do. Lý do được ghi vào nhật ký (`audit_logs`) và hiện ở đầu báo cáo deploy. Dùng cho lỗi bảo mật nghiêm trọng cần vá ngay giữa giờ thi.
- Hướng dẫn trong `docs/ops/trien-khai.md` nói rõ khi nào nên và không nên ép, và việc báo cho Người dự thi đang thi.

### Q333: ai tạo các khóa bí mật lần đầu (đã duyệt 8/11/2026)

Chọn **phương án A**: `make prod-bootstrap` tự sinh ngẫu nhiên.

- Tạo `~/exam-prod-secrets/*.env` (quyền `600`, thư mục `700`) với giá trị ngẫu nhiên đủ mạnh: `SLIP_ENCRYPTION_KEY`, mật khẩu PostgreSQL, khóa mã hóa bản sao lưu, địa chỉ báo ngoài máy (điền tay vì do dịch vụ cấp), các giá trị tương tự.
- Hiện các khóa **một lần duy nhất** lên màn hình để người vận hành chép vào trình quản lý mật khẩu và bản giấy (Q327). Không ghi khóa vào log, vào repo hay vào báo cáo của workflow.
- Chạy lại **không ghi đè** khóa đã có (ghi đè `SLIP_ENCRYPTION_KEY` hay mật khẩu cơ sở dữ liệu làm hỏng hệ thống đang chạy); muốn đổi khóa phải theo quy trình đổi khóa trong `docs/ops/trien-khai.md`.

### Q334: khi nào hệ thống tự dựng lại (đã duyệt 8/11/2026)

Chủ dự án chọn: **hệ thống chỉ dựng lại khi chủ dự án bật WSL Ubuntu lên**. Quyền chủ động mở hệ thống cho người dùng thuộc về lúc bật WSL.

- Làm bằng một dịch vụ systemd của user chạy `make prod-up` (phương án A đã đề xuất, bỏ phần Windows). Máy đã có systemd bật, `Linger=yes`, Podman 4.9.3; `prod-bootstrap` cài dịch vụ này.
- **Không** tạo tác vụ Windows (Task Scheduler) tự bật WSL khi máy khởi động. Windows tự khởi động lại thì hệ thống ngừng cho đến khi chủ dự án mở Ubuntu.
- Tắt WSL (hoặc `wsl --shutdown`) là tắt hệ thống. Hướng dẫn vận hành nhắc: kiểm tra không có Phiên thi đang diễn ra hoặc sắp bắt đầu trước khi tắt, tắt chế độ ngủ và đặt giờ hoạt động cho Windows Update (đã có ở `architecture.md` mục 8).
- **Việc kiểm khi làm code:** (1) pod tự dựng lại sau `wsl --shutdown` rồi mở Ubuntu; (2) WSL không tự tắt khi đóng hết cửa sổ terminal (hiện máy chạy liên tục 20 giờ với container đang chạy, `.wslconfig` chưa đặt `vmIdleTimeout`); nếu có tự tắt thì cấu hình giữ WSL chạy và ghi vào hướng dẫn. (3) Thời gian từ lúc mở Ubuntu đến khi hệ thống phục vụ được, ghi vào tài liệu.

### Q335: hai bản api cho phòng đông người (đã duyệt 8/11/2026)

Chọn **phương án A**: mặc định **một bản api**; chủ dự án bật **hai bản** khi có Phiên thi từ 300 người trở lên.

- Lệnh `make prod-scale 2` và `make prod-scale 1`, kèm hướng dẫn trong `docs/ops/trien-khai.md`. Quyết định theo số người dự thi của từng buổi.
- Cơ sở: ca đo 500 người (`docs/hieu-nang.md`) cho thấy lúc làm bài một bản vẫn nhanh; chỉ ca 500 người cùng mở kết quả một khoảnh khắc vượt 1 giây. Mỗi bản api thêm khoảng 0,5 GB bộ nhớ, máy còn chia cho plo-tracker.
- Khi chạy hai bản, nginx của pod phải chia tải giữa hai bản và Socket.IO phải chạy đúng qua cả hai (tin đẩy đi qua kênh Redis đã có). Kiểm bằng ca đo hai bản khi viết code.

### Q336: chia lát cắt 6 thành 5 PR (đã duyệt 8/11/2026)

Chọn **phương án A**: 5 PR nhỏ, làm theo thứ tự dưới đây. **Sao lưu (6c, 6d) phải xong trước Phiên thi thật đầu tiên.** Mỗi PR cập nhật tài liệu vận hành liên quan trong cùng PR (Q331); thử nghiệm dùng pod tạm, không đụng dữ liệu thật.

| PR | Nội dung |
|---|---|
| 6a | `prod-bootstrap` (tự sinh khóa, Q333), `prod-up`, `prod-scale` (Q335), dịch vụ systemd dựng lại khi bật WSL (Q334), cấu hình tunnel (Q330) |
| 6b | Workflow deploy bấm tay (Q331): kiểm Phiên thi, chặn và ép khẩn cấp (Q332), sao lưu trước deploy, migration, thay lần lượt, quay lui, đăng ký runner |
| 6c | Script sao lưu: `pg_dump`, WAL, bản nền, ảnh và khóa, mã hóa, đẩy sang D: và R2, giữ theo bảng Q325, khôi phục thử, báo ngoài máy (Q323–Q328) |
| 6d | Trong ứng dụng: bảng ghi kết quả sao lưu, màn hình chỉ đọc cho Quản trị viên, chuông khi quá 26 giờ, xóa thông báo đã đọc quá 90 ngày |
| 6e | Hoàn tất: `trien-khai.md`, `khoi-phuc.md`, diễn tập khôi phục sang máy khác, đo hai bản api, checklist đưa lên chạy thật, cập nhật README và số đo |

**Dọn máy trước khi bắt đầu (8/11/2026):** máy 16 GB RAM, đang dùng khoảng 2 GB. Pod đang chạy: `dev-exam` (dev của dự án này) và `prod-plotracker`. Pod đã dừng: `devadh` (11 ngày), `devplotracker` (4 tháng), `devapp` (8 tháng). Pod dừng không tốn RAM, chỉ tốn đĩa. Ổ WSL còn 859 GB trống. Phần đáng dọn nhất là ảnh không dùng (khoảng 25 GB) và volume Ollama (`ollamadata` 8 GB, `prod_ollamadata` 2,8 GB). Chủ dự án tự quyết xóa gì; thao tác xóa không hoàn tác.

## PR 6a: thiết kế chi tiết (đã duyệt, đã merge #78)

Khung (8/11/2026): 6a thay các bước gõ tay ở `docs/ops/demo-wsl.md` mục 6 và 7 bằng lệnh `make`, thử trước trên pod tạm (cổng khác), không đụng `prod-exam` thật.

| Phần | Việc | Dựa trên |
|---|---|---|
| `make prod-bootstrap` | Chạy một lần: thư mục bí mật, sinh khóa và in một lần, volume, pod `prod-exam` (web `:8180`, PostgreSQL `127.0.0.1:5436`), hỏi mật khẩu Quản trị viên đầu tiên, cài dịch vụ systemd | Q333, Q334 |
| `make prod-up TAG=<mã commit>` | Chạy migration, dựng api, worker, web từ ảnh GHCR của đúng mã commit | Q331 |
| Dịch vụ systemd | Mở Ubuntu thì dựng lại pod | Q334 |
| `make prod-scale 1\|2` | Bật hoặc tắt bản api thứ hai, nginx chia tải | Q335 |
| `make prod-status`, `prod-logs`, `prod-stop` | Xem tình trạng, log; dừng có kiểm Phiên thi | Q332 |

### Q338: tên phụ (đã duyệt 8/11/2026)

Chọn **A**: `exam.plotrackerbluni.site`. `APP_ORIGINS=https://exam.plotrackerbluni.site`.

Sự thật đã kiểm về tunnel: dịch vụ `cloudflared` chạy bằng `/etc/cloudflared/config.yml` (thuộc root, cần `sudo` để sửa và khởi động lại; `~/.cloudflared/config.yml` là bản giống hệt nhưng dịch vụ **không** đọc). Tunnel hiện chỉ có `demo.plotrackerbluni.site` → `localhost:8080`. `~/.cloudflared/cert.pem` có sẵn nên `cloudflared tunnel route dns` có thể tạo bản ghi DNS cho tên mới.

### Q339: cách thêm tên vào tunnel (đã duyệt 8/11/2026)

Chọn **A: dùng chung tunnel hiện có** (đúng ADR-0006).

- Thêm vào `/etc/cloudflared/config.yml`, **trước** dòng chốt chặn `http_status:404`: `exam.plotrackerbluni.site` → `http://127.0.0.1:8180`.
- Tạo DNS: `cloudflared tunnel route dns <tên-hoặc-id-tunnel> exam.plotrackerbluni.site`.
- Kiểm: `cloudflared tunnel ingress validate`, rồi `sudo systemctl restart cloudflared`. Lúc khởi động lại, `demo.plotrackerbluni.site` bị ngắt vài giây.
- Các lệnh cần `sudo` do **chủ dự án** chạy (tác nhân không có quyền `sudo`), nên chọn lúc plo-tracker ít người dùng. `docs/ops/trien-khai.md` viết từng lệnh và kết quả mong đợi, kèm cách quay lui (khôi phục `config.yml` cũ).

### Q340: lệnh có xóa dữ liệu thật hay không (đã duyệt 8/11/2026)

Chọn **A: không có lệnh `make` nào xóa dữ liệu**.

- `make prod-down` chỉ xóa container và pod, **giữ nguyên** volume `exam_pgdata` và `exam_media`; `prod-up` dựng lại là có đủ dữ liệu.
- Xóa volume chỉ làm tay bằng `podman volume rm`, theo một mục riêng trong `docs/ops/trien-khai.md` có cảnh báo: kiểm tra bản sao lưu mở được (khôi phục thử thành công) trước khi xóa.

### Q341: các mặc định kỹ thuật của 6a (đã duyệt 8/11/2026)

| Mục | Mặc định |
|---|---|
| Tên container | `prod-exam-postgres`, `prod-exam-redis`, `prod-exam-api` (bản thứ hai `prod-exam-api-2`), `prod-exam-worker`, `prod-exam-web` |
| Giới hạn tài nguyên | PostgreSQL 3 GB, api 1 GB mỗi bản, worker 512 MB, web 256 MB, Redis 256 MB (tổng khoảng 5 GB với một api, 6 GB với hai api) |
| Khi container lỗi | Tự khởi động lại (`--restart always`) |
| Log container | Tối đa 10 MB mỗi file, giữ 3 file mỗi container |
| Quản trị viên đầu tiên | Tên đăng nhập `quantri`; `prod-bootstrap` hỏi **họ tên** và mật khẩu (từ 10 ký tự), không lưu vào lịch sử lệnh hay file. Lệnh `bootstrap-admin` đòi `BOOTSTRAP_ADMIN_FULL_NAME`, bản nháp `demo-wsl.md` mục 6 còn thiếu biến này |
| Tải ảnh | `ghcr.io/tvviem/exam-api` và `exam-web` theo mã commit, không cần đăng nhập (ảnh đã công khai) |
| Kiểm tra sau khi dựng | `prod-up` chờ `/api/health` qua `127.0.0.1:8180`; không xong sau 60 giây thì báo lỗi và in log |
| Thử nghiệm | Pod tạm `drill-exam` dùng cổng khác, xóa sau khi thử |

**Quên mật khẩu Quản trị viên (hỏi thêm 8/11/2026):** hệ thống đã có sẵn lệnh `recover-admin --username <tên>` (Q60, `docs/data-model.md`): mở Khóa đăng nhập, gỡ khóa tạm, cấp mật khẩu tạm mới (in ra một lần, hạn 7 ngày, buộc đổi khi đăng nhập), thu hồi mọi phiên, ghi `audit_logs` (`cli.recover-admin`). Chạy được trên server. Hệ thống không có email nên không có "quên mật khẩu" tự phục vụ. 6a thêm:
- `make prod-recover-admin ADMIN=<tên>` bọc lệnh đó trong pod `prod-exam`; hướng dẫn từng bước trong `docs/ops/trien-khai.md`.
- Khuyến nghị trong hướng dẫn: tạo thêm một **Quản trị viên thứ hai** (chức năng "Tạo Quản trị viên" có sẵn) để có người dự phòng; người dự phòng của Q326 là ứng viên.

### PR 6a: ghi chú triển khai (8/11/2026)

**Đã làm:** `infra/scripts/exam-ctl.sh` (một script, nhiều lệnh) và các mục `make -C infra prod-*` ở `infra/Makefile`; nginx chia tải qua file `upstream` mount từ máy chủ; `docs/ops/trien-khai.md` (hướng dẫn vận hành); `demo-wsl.md` mục 6 và 7 được thay bằng tài liệu mới.

**Khác với khung đã duyệt (cần biết):**
- Dịch vụ systemd gọi `podman pod start prod-exam` (lệnh `prod-start` tương đương), **không** gọi `make prod-up`: `prod-up` cần `TAG` và chạy migration, còn mở WSL chỉ cần bật lại pod đã có. Dịch vụ cũng dừng pod êm (`pod stop --time 30`) khi tắt WSL.
- Chốt chặn Phiên thi (Q332) đặt ngay trong `prod-up`, `prod-stop`, `prod-down` và `prod-scale N=1`, để mọi đường vào đều được bảo vệ (6b chỉ gọi lại). Có `FORCE_REASON` thì cho qua và ghi `~/.local/state/exam-prod/operations.log` trên máy (còn khi cơ sở dữ liệu hỏng). Ghi vào `audit_logs` để dành cho 6b, khi có workflow.
- "Có Phiên thi" = Phiên thi chưa hủy có `opens_at - 60 phút <= now < closes_at`, **hoặc** còn Lượt làm bài `in_progress` (Lượt chưa hết hạn sau giờ đóng Khung giờ vẫn tính).
- Thêm lệnh `prod-install-service` (cài lại dịch vụ), `prod-start`, `prod-active-sessions`.
- Ảnh web đổi: nginx worker chạy `user node` (uid 1000, cùng uid với api) để đọc ảnh `0600` trên volume dùng chung; nginx dùng hai `upstream` (`/api/` chia vòng tròn, `/ws/` chia theo địa chỉ khách bằng `hash $client_ip consistent` để Socket.IO polling luôn vào cùng một bản api). `test-nginx-xff.sh` cập nhật theo.

**Đã thử** trên pod tạm `drill-exam` (ảnh api của commit `c348cc6`, ảnh web build tay từ nhánh này), có Phiên thi thật do `demo:room` dựng với 10 người dự thi giả:

| Kiểm | Kết quả |
|---|---|
| `prod-bootstrap` từ đầu (tải ảnh, migration, Quản trị viên) | 20 giây |
| Chốt chặn khi có Phiên thi | `prod-up`, `prod-stop`, `prod-down` từ chối; `prod-scale N=1` khi chỉ có một bản thì không cần chặn; ép bằng `FORCE_REASON` chạy và ghi log |
| `prod-scale N=2` | 8 giây; 40 yêu cầu chia 19 / 21 cho hai bản |
| Một bản api dừng giữa chừng | 30/30 yêu cầu vẫn thành công (nginx chuyển sang bản còn lại), cả hai chiều |
| `prod-up` khi chạy hai bản api, 24–27 giây | thay lần lượt có đợi từng bản sẵn sàng: 0 lỗi 502; chỉ khi thay web có khoảng 0,6 giây không kết nối được (6 yêu cầu trong 240) |
| Dừng một container (SIGTERM) | dưới 1,2 giây |
| Dịch vụ systemd: dừng, bật | dừng 0,8 giây; bật đến khi `/api/health` trả lời 2,8 giây |
| Ảnh `0600` do api ghi | nginx worker (`user node`) đọc được |
| `prod-recover-admin` | in mật khẩu tạm một lần |

Lần chạy đầu phát hiện: thay api thứ hai khi api thứ nhất chưa sẵn sàng làm 8 lần 502 (đã sửa bằng đợi từng bản).

**Chưa thử (cần máy thật, ghi vào checklist 6e):** tunnel Cloudflare thật và tên `exam.plotrackerbluni.site`; `wsl --shutdown` thật rồi mở Ubuntu; WSL có tự tắt khi đóng hết cửa sổ terminal không; ảnh minh họa qua X-Accel từ api thật; Socket.IO qua hai bản api bằng trình duyệt.

## PR 6b: thiết kế chi tiết (đã duyệt Q342–Q350)

PR 6a đã merge (#78). PR 6b thêm workflow GitHub để chủ dự án bấm tay deploy lên máy WSL (Q331), gọi lại `exam-ctl.sh` của 6a.

### Q342: bảo vệ máy khi repo công khai và runner tự dựng (ĐÃ DUYỆT: phương án A)

**Bối cảnh.** Workflow deploy phải chạy trên runner `wsl-exam`, tức là chạy lệnh thật trên máy WSL của chủ dự án, nơi có dữ liệu thi và `~/exam-prod-secrets/`. Repo đang công khai (ai cũng xem và fork được).

**Rủi ro.** Một người lạ fork repo rồi gửi Pull Request có sửa file workflow, ghi `runs-on: self-hosted`. Nếu GitHub tự chạy workflow đó thì người lạ chạy được lệnh bất kỳ trên máy chủ dự án. Chính sách cũ `first_time_contributors` chỉ bắt chủ dự án duyệt tay người đóng góp **lần đầu**; người đã được duyệt một lần thì các PR sau chạy tự động.

**Quyết định (hai lớp bảo vệ):**
1. Workflow deploy chỉ có sự kiện `workflow_dispatch` (bấm tay). Người không có quyền ghi vào repo không bấm được. `ci.yml` giữ `ubuntu-latest`, không bao giờ dùng runner `wsl-exam`.
2. Chính sách "Fork pull request workflows" đổi từ `first_time_contributors` sang `all_external_contributors`: mọi PR từ người ngoài đều phải chờ chủ dự án bấm duyệt mới chạy workflow. Đã đổi ngày 8/11/2026 bằng `gh api -X PUT repos/tvviem/exam-system/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_external_contributors` (đọc lại cho kết quả `all_external_contributors`).

**Phương án đã bỏ:** chỉ lớp 1 (giữ chính sách cũ): còn lỗ hổng người đã được duyệt một lần rồi gửi PR sửa workflow.

**Ghi chú để tự học (vì sao cẩn thận với runner tự dựng):**
- Runner của GitHub (`ubuntu-latest`) là máy ảo dùng một lần, chạy xong bị hủy, nên workflow lạ chạy ở đó không hại máy của mình. Runner tự dựng (`self-hosted`) là máy thật của mình, giữ nguyên ổ đĩa, khóa, mạng nội bộ giữa các lần chạy: workflow lạ chạy ở đó là chạy mã lạ trên máy của mình.
- Vì vậy GitHub khuyến cáo không dùng runner tự dựng cho repo công khai nếu chưa chặn PR từ fork. Hai lớp trên là cách chặn: (1) chỉ cho kích hoạt bằng sự kiện mà người ngoài không bấm được; (2) mọi PR người ngoài phải qua tay người duyệt.
- Sự kiện `pull_request` từ fork vốn bị GitHub giới hạn (không đọc được secret, token chỉ đọc), nhưng giới hạn đó không cứu được runner tự dựng vì lệnh vẫn chạy trên máy thật. Nên chặn từ gốc là việc nên làm.
- Lớp thứ ba (xác nhận trước mỗi lần deploy) ở Q343 bên dưới.

### Q343: Environment `production` bắt xác nhận trước mỗi lần deploy (ĐÃ DUYỆT: phương án A)

**Hai tình huống lớp 1 và 2 chưa che:** (1) bấm nhầm "Run workflow" với tag sai; (2) chạy `workflow_dispatch` từ một nhánh chưa duyệt có sửa file workflow, mã đó sẽ chạy trên máy WSL.

**Quyết định:** workflow deploy khai báo `environment: production`. Environment `production` đã tạo ngày 8/11/2026 với:
- người duyệt bắt buộc: `tvviem` (chủ dự án tự duyệt, `prevent_self_review: false` vì dự án một người);
- chỉ cho vào từ nhánh `main` (chính sách nhánh tùy chỉnh, một mục `main`).

Mỗi lần deploy: bấm "Run workflow", rồi bấm "Review deployments → Approve". Nhánh khác `main` bị GitHub từ chối trước khi job chạy.

**Phương án đã bỏ:** không dùng Environment (bấm một lần là deploy, không chốt chặn nhánh).

**Tạo bằng lệnh (để dựng lại khi cần):**
```bash
UID_=$(gh api user --jq .id)
echo "{\"reviewers\":[{\"type\":\"User\",\"id\":$UID_}],\"prevent_self_review\":false,\"deployment_branch_policy\":{\"protected_branches\":false,\"custom_branch_policies\":true}}" > env.json
gh api -X PUT repos/tvviem/exam-system/environments/production --input env.json
gh api -X POST repos/tvviem/exam-system/environments/production/deployment-branch-policies -f name=main -f type=branch
```

**Ghi chú để tự học:**
- Environment là "cổng" gắn tên cho một nơi triển khai. Job khai báo `environment: production` sẽ dừng ở trạng thái chờ cho đến khi người duyệt bấm Approve; chỉ khi đó runner mới nhận job và chạy lệnh.
- Giới hạn nhánh bảo vệ khỏi việc sửa workflow ở nhánh phụ rồi chạy: nhánh đó không vào được `production`, nên runner `wsl-exam` không nhận job. Mã vào `main` thì đã qua PR, CI và lệnh merge của chủ dự án.
- Nếu về sau thêm người cộng tác: bật `prevent_self_review` để người bấm chạy không tự duyệt cho mình.

### Q344: chọn phiên bản (tag) để deploy (ĐÃ DUYỆT: phương án A)

**Vấn đề.** Ảnh trên GHCR gắn nhãn bằng mã commit đầy đủ (40 ký tự). Gõ tay dễ sai; nhưng "tự đoán" phiên bản cũng nguy hiểm nếu đoán nhầm.

**Quyết định.** Workflow có ô nhập `tag`:
- **Để trống** = commit mới nhất của `main` (`origin/main` lúc chạy). Đây là đường deploy thường ngày.
- **Dán mã commit** = deploy đúng bản đó. Đây là đường **rollback** (lùi bản): dán mã của lần deploy tốt trước đó (xem `previous tag` ở tóm tắt lần chạy trước hoặc `~/.local/state/exam-prod/tag` trên máy).
- Mã có thể là rút gọn (từ 7 ký tự); workflow đổi ra mã đầy đủ bằng `git rev-parse` và dùng mã đầy đủ ở mọi bước sau.

**Kiểm tra trước khi đụng vào hệ thống đang chạy (dừng ngay nếu trượt, nói rõ lý do):**
1. Mã là commit của `main`: `git merge-base --is-ancestor <tag> origin/main`. Chặn deploy nhầm mã từ nhánh khác.
2. Cả hai ảnh `ghcr.io/tvviem/exam-api:<tag>` và `exam-web:<tag>` có trên GHCR (`podman manifest inspect` hoặc `skopeo inspect`). Vì ảnh chỉ được đẩy khi cả `check` và `integration` xanh (`images` có `needs`), ảnh tồn tại nghĩa là mã đó đã qua kiểm thử. Chưa có ảnh thường nghĩa là CI chưa xong hoặc đỏ.
3. Phần tóm tắt lần chạy (job summary) luôn ghi: tag đã chọn, tag trước đó, tiêu đề commit, và nguồn của tag (mặc định hay tự nhập).

**Phương án đã bỏ:** luôn bắt gõ mã (không có mặc định): an toàn kiểu không đoán hộ nhưng dễ dán sai; đã có bước Approve của Environment (Q343) để xem lại tag trước khi chạy thật nên mặc định đủ an toàn.

**Ghi chú để tự học (deploy bằng "mã bất biến"):**
- Dùng mã commit làm nhãn ảnh (thay vì `latest`) nghĩa là một nhãn luôn trỏ tới đúng một bản dựng, không bao giờ đổi. Nhờ vậy "bản đang chạy" và "bản cần lùi về" đều chỉ ra chính xác được, và rollback chỉ là chạy lại cùng lệnh với mã cũ.
- Nhãn `latest` có thể bị ghi đè nên không biết bản nào đang chạy; vì thế không dùng cho sản phẩm thật.
- Nguyên tắc chung khi deploy an toàn: kiểm điều kiện trước (kiểm thử, ảnh có chưa, đúng nhánh), chỉ khi qua hết mới đụng vào hệ thống đang chạy; và luôn giữ được đường lùi bản.
- Rollback chỉ lùi **mã**, không lùi dữ liệu. Dự án giữ quy ước migration chỉ **thêm** (kiểu expand: thêm cột/bảng, không xóa hay đổi nghĩa), nên bản mã cũ vẫn chạy được trên cơ sở dữ liệu đã lên bản mới (đã ghi ở `docs/ops/trien-khai.md`, mục "Đưa bản mới lên"). Nếu một migration tương lai phá quy ước này thì không được lùi bằng cách chạy lại mã cũ mà phải khôi phục từ bản sao lưu trước deploy (xem `khoi-phuc.md`, PR 6c); khi đó chốt chặn ở Q345 trở đi cần ghi rõ.

### Q345: sao lưu trước mỗi lần deploy; sao lưu hỏng thì dừng (ĐÃ DUYỆT: phương án A)

**Vì sao có bước này.** Migration chạy ngay trong lần deploy và là bước dễ gây hại dữ liệu nhất. Dữ liệu bài thi không làm lại được, máy chỉ có một. Nên trước khi đụng vào hệ thống đang chạy phải có một bản chụp kiểm được (lớp 1 của thiết kế sao lưu).

**Quyết định.** Trước migration, `exam-ctl.sh up` (do workflow gọi):
1. `pg_dump -Fc` vào `~/exam-prod-backups/truoc-deploy-<ngày-giờ>-<tag cũ>.dump` (tag cũ lấy từ `~/.local/state/exam-prod/tag`).
2. Kiểm bằng `pg_restore --list`: file rỗng hoặc hỏng thì đọc không ra.
3. Qua kiểm mới chạy migration và thay api; trượt thì **dừng**, báo rõ "không sao lưu được, chưa đụng vào hệ thống", hệ thống đang chạy giữ nguyên.
4. Lần deploy đầu tiên (chưa có cơ sở dữ liệu, tức `prod-bootstrap`) bỏ qua bước này.
5. Lối thoát khi buộc phải deploy khẩn mà sao lưu hỏng: `FORCE_REASON` (cùng cơ chế chốt chặn Phiên thi của Q332): ghi lý do vào nhật ký rồi mới cho qua.
6. PR 6c thay bước tối thiểu này bằng script sao lưu chính thức (cùng một chỗ gọi, thêm bản sao sang D: và R2).

**Phương án đã bỏ:** sao lưu hỏng chỉ cảnh báo rồi vẫn deploy: không bao giờ kẹt vì lỗi sao lưu, nhưng nếu migration hỏng đúng lúc đó thì không có bản để quay lại.

**Ghi chú để tự học (thay đổi nguy hiểm thì phải có đường lùi trước khi bước):**
- Nguyên tắc "đường lùi đi trước": trước một thao tác không đảo ngược được (migration thay đổi cơ sở dữ liệu thật), phải chắc chắn đã có thứ để quay lại, và chắc chắn bằng cách **kiểm** (đọc được bản sao), không phải bằng niềm tin "chắc đã sao lưu rồi".
- Dừng sớm khi điều kiện an toàn trượt ("fail closed") tốn thời gian hơn (bạn phải dọn ổ rồi chạy lại) nhưng không làm hỏng gì. Cho qua khi trượt ("fail open") nhanh hơn nhưng đẩy rủi ro sang lần sau. Với dữ liệu không làm lại được thì chọn dừng.
- Lối thoát có ghi lý do (`FORCE_REASON`) cho phép người có trách nhiệm vượt chốt trong tình huống khẩn nhưng để lại dấu vết, giống cách các hệ thống thật dùng "break-glass".
- Bản sao nằm cùng ổ đĩa với dữ liệu chỉ chống được lỗi phần mềm (migration hỏng), không chống được hỏng ổ. Chống hỏng ổ là việc của các bản sao ngoài máy ở 6c (D: và R2).

### Q346: ghi mọi lần deploy vào `audit_logs` (ĐÃ DUYỆT: phương án A)

**Vì sao.** `operations.log` trên máy mất khi mất ổ đĩa; `audit_logs` đi theo bản sao lưu và Quản trị viên xem được. Cần một dòng thời gian đầy đủ "ai đưa bản nào lên lúc nào" để tìm nguyên nhân sự cố ("lỗi bắt đầu từ sau lần deploy nào?").

**Quyết định.**
- Mỗi lần deploy **thành công** (sau khi `/api/health` trả lời) thêm một dòng `audit_logs` với `action = 'ops.deploy'`, ép hay không đều ghi.
- `actor_id` để trống (thao tác của hệ thống, như `cli.*`); `entity_type = 'system'`, `entity_id` trống.
- `before` = `{"tag": "<tag cũ>"}`; `after` = `{"tag": "<tag mới>", "commit_title": "...", "triggered_by": "<tài khoản GitHub bấm>", "run_url": "<đường dẫn lần chạy>", "forced": true|false, "force_reason": "..."}`.
- Dòng do `exam-ctl.sh` chèn trực tiếp bằng `psql` trong container postgres (tham số truyền qua biến, không ghép chuỗi SQL từ lý do do người nhập).
- Ghi thất bại thì chỉ cảnh báo trong tóm tắt lần chạy, **không** làm hỏng lần deploy đã xong.
- Lần ép vẫn ghi cả vào `operations.log` như 6a (đường dự phòng khi cơ sở dữ liệu hỏng).

**Phương án đã bỏ:** chỉ ghi lần ép (mất lịch sử các lần thường); không ghi vào cơ sở dữ liệu (không đi theo bản sao lưu, không xem được trong ứng dụng).

**Ghi chú để tự học (nhật ký kiểm toán cho thao tác vận hành):**
- Nhật ký kiểm toán trả lời "ai, làm gì, khi nào, trên cái gì, trước và sau ra sao". Ở đây "trên cái gì" là hệ thống, "trước/sau" là tag cũ và mới.
- Chèn bằng tham số (`psql -v` rồi dùng `:'biến'`), không nối lý do vào câu SQL, để tránh SQL injection ngay cả khi người nhập là chính mình hoặc người sau này được thêm quyền.
- Ghi **sau** khi thành công để nhật ký không nói dối ("đã deploy" khi thực ra chưa lên); đổi lại lần deploy hỏng giữa chừng không có dòng nào, và lúc đó dấu vết nằm ở log lần chạy trên GitHub và `operations.log`.
- Bảng chỉ cho thêm (không sửa, không xóa) nên đây là bằng chứng đáng tin khi cần tra lại.

### Q347: deploy lỗi thì tự lùi về bản cũ một lần (ĐÃ DUYỆT: phương án A)

**Vấn đề.** Với một bản api, `up` phải dừng bản cũ rồi mới chạy bản mới (cùng cổng trong pod). Bản mới lỗi lúc khởi động thì hệ thống ngừng phục vụ cho đến khi có người xử lý.

**Quyết định.**
- Workflow đọc tag đang chạy (`~/.local/state/exam-prod/tag`) **trước** khi bắt đầu, giữ làm tag lùi.
- Nếu `up` thất bại (không qua `/api/health` trong 60 giây, hoặc migration/thay container lỗi), workflow tự chạy lại `up` với tag cũ **đúng một lần**. Hệ thống trở lại sau khoảng 25 giây.
- Lần chạy vẫn **đỏ**. Tóm tắt ghi "bản mới lỗi, đã lùi về bản cũ", kèm 50 dòng log cuối của container lỗi (lấy **trước** khi lùi vì lùi sẽ thay mất container).
- Lùi cũng lỗi thì dừng và in hướng dẫn xử lý tay (`docs/ops/trien-khai.md`, mục lỗi thường gặp). Không lùi lần hai.
- Lùi thành công **không** ghi `ops.deploy` (không có bản mới nào lên); ghi `ops.deploy-failed` vào `audit_logs` (`before` = tag cũ, `after` = tag lỗi, `rolled_back: true`, lý do lỗi ngắn) và vào `operations.log`.
- Lần ép bằng `FORCE_REASON` cũng đi qua cùng đường lùi.
- Điều kiện để lùi an toàn: migration chỉ thêm (kiểu expand), bản mã cũ chạy được trên cơ sở dữ liệu đã lên bản mới. Nếu phát hiện một migration phá quy ước này thì **không** tự lùi, phải khôi phục từ bản sao lưu trước deploy (Q345).

**Phương án đã bỏ:** chỉ báo lỗi, không tự lùi. Đơn giản, dễ đoán, nhưng hệ thống ngừng cho đến khi chủ dự án ngồi xử lý, có thể cả giờ nếu bấm deploy rồi đi làm việc khác.

**Ghi chú để tự học (tự phục hồi khi deploy lỗi):**
- "Rollback tự động" nhằm rút ngắn thời gian ngừng phục vụ (MTTR: thời gian khôi phục trung bình), không nhằm che lỗi: lần chạy vẫn đỏ để bạn không bỏ sót.
- Chỉ lùi **một lần**: lùi vô hạn dễ thành vòng lặp (bản cũ cũng hỏng vì nguyên nhân môi trường, workflow cứ lùi qua lại). Một lần thất bại thì cần con người.
- Lấy log lỗi **trước** khi lùi vì lùi sẽ dọn mất container lỗi và mất bằng chứng. Thứ tự chuẩn: thu bằng chứng → khôi phục → báo cáo.
- Lùi tự động chỉ an toàn khi mọi thay đổi cơ sở dữ liệu tương thích ngược. Đó là lý do dự án giữ quy ước migration "chỉ thêm" (expand/contract: thêm trước, chỉ xóa phần cũ ở một lần phát hành sau khi không còn mã nào dùng).
- Người dùng chạm vào hệ thống đúng lúc deploy lỗi chỉ thấy ngừng khoảng 25 giây; chốt chặn Phiên thi (Q332) làm cho trường hợp này gần như không xảy ra trong giờ thi.

### Q348: kiểm tra sau deploy (smoke test): lỗi trong máy thì lùi, lỗi địa chỉ công khai chỉ cảnh báo (ĐÃ DUYỆT: phương án A)

**Dữ kiện.** `/api/health` trả `status` (`ok`/`degraded`), `version` (mã commit nhúng lúc build qua `APP_VERSION`) và `checks.postgres`/`checks.redis` (`up`/`down`); HTTP 200 khi `ok`, 503 khi `degraded` (`apps/api/src/health/health.controller.ts`, `packages/shared/src/health.ts`).

**Quyết định.** Sau `up`, workflow kiểm hai nơi:
1. **Trong máy** (`http://127.0.0.1:<cổng web>/api/health`): phải `status: ok`, `postgres` và `redis` đều `up`, và `version` **bằng đúng tag vừa deploy**. Trượt thì coi là deploy lỗi và đi đường tự lùi (Q347).
2. **Địa chỉ công khai** (`https://<tên miền>/api/health`, đường người dự thi đi qua Cloudflare tunnel): thử 3 lần cách nhau 5 giây. Trượt thì **chỉ cảnh báo** trong tóm tắt (lần chạy vẫn xanh), ghi rõ "Địa chỉ công khai chưa trả lời: kiểm tunnel (xem `docs/ops/trien-khai.md` mục 2)", **không** lùi.
- Tên miền công khai lấy từ `APP_ORIGINS` (phần tử đầu) trong `~/exam-prod-secrets/api.env`, không viết cứng trong workflow, nên đổi tên miền sau này không phải sửa workflow.

**Phương án đã bỏ:** coi cả hai đều bắt buộc, trượt chỗ nào cũng lùi. Chặt hơn nhưng dễ lùi nhầm vì lỗi hạ tầng nằm ngoài pod (tunnel chưa chạy, DNS chưa lan, WSL vừa mở), và không deploy nổi lần nào trước khi tunnel xong.

**Ghi chú để tự học (phân biệt "lỗi của mình" với "lỗi của môi trường"):**
- Smoke test là phép kiểm nhanh, nông nhưng đủ để biết hệ thống còn sống sau thay đổi. Nó không thay kiểm thử đầy đủ (đã chạy ở CI trước khi có ảnh).
- Điều kiện `version == tag` bắt được một lỗi âm thầm: container cũ vẫn trả lời `ok` nhưng thực ra bản mới chưa lên. Nếu chỉ kiểm `status: ok` thì lần deploy "thành công giả" vẫn qua.
- Quy tắc chọn hành động khi kiểm trượt: lùi chỉ có ích khi **nguyên nhân nằm ở bản mới**. Lỗi ngoài pod thì lùi không sửa được gì mà còn tốn thêm một lần thay container, nên chỉ cảnh báo.
- Thử lại vài lần (3 lần × 5 giây) trước khi báo lỗi là cách chống cảnh báo giả do độ trễ ngắn, thường dùng cho các kiểm tra qua mạng.

### Q349: script lấy từ `main` mới nhất, chỉ ảnh theo tag (ĐÃ DUYỆT: phương án A)

**Vấn đề.** Workflow cần `infra/scripts/exam-ctl.sh`, `infra/Makefile`, `nginx.conf`... Khi lùi về tag cũ (chưa có sao lưu trước deploy, chốt chặn mới, ghi nhật ký) phải chọn lấy script từ commit nào.

**Quyết định.**
- Workflow checkout nhánh `main` (đúng nhánh Environment `production` cho phép, Q343) và chạy `exam-ctl.sh` **mới nhất** với `TAG=<tag đã chọn>`. Cái lùi là **ảnh** api và web; cách vận hành luôn là bản mới nhất, đã qua thử nghiệm.
- Lùi bản vì vậy vẫn có sao lưu trước deploy, chốt chặn Phiên thi và ghi `audit_logs`.
- **Quy ước tương thích ngược** (ghi vào `docs/ops/trien-khai.md`): script vận hành chỉ gọi những lệnh trong ảnh mà ảnh cũ cũng có (hiện: `node dist/db/migrate.js`, `node dist/cli/main.js bootstrap-admin|recover-admin`). Khi một thay đổi script cần lệnh mới trong ảnh thì script phải dò xem có lệnh đó không rồi mới gọi, hoặc thêm lệnh trước một phát hành rồi mới dùng ở phát hành sau.

**Phương án đã bỏ:** script theo đúng tag. Nhất quán "y như hôm đó" nhưng lùi bản lại mất sao lưu trước deploy, chốt chặn và nhật ký mới, tức là đúng lúc rủi ro cao lại dùng quy trình kém an toàn.

**Ghi chú để tự học (tách "quy trình" khỏi "hàng hóa"):**
- Phiên bản của **thứ được triển khai** (ảnh) và phiên bản của **cách triển khai** (script, workflow) là hai thứ khác nhau. Ở đây chọn cho cái đầu theo tag, cái sau luôn mới nhất.
- Khi quy trình luôn mới nhất thì lỗi quy trình đã được sửa sẽ không bị "sống lại" khi lùi ảnh.
- Đổi lại, quy trình mới phải chạy được với ảnh cũ. Đây là tương thích ngược giữa script và ảnh, giống nguyên tắc migration chỉ thêm (Q344, Q347): thay đổi ở một đầu không được làm hỏng đầu kia.
- Thử bằng cách: mỗi khi sửa script, chạy `make prod-up` với một ảnh cũ trên pod `drill` để chắc nó vẫn chạy.

### Q350: thiết lập kỹ thuật còn lại của workflow (ĐÃ DUYỆT: đồng ý cả 8 điểm)

1. **Không chạy chồng:** `concurrency: group: deploy-production, cancel-in-progress: false`. Lần bấm thứ hai xếp hàng chờ, không hủy lần đang chạy (hủy giữa chừng có thể bỏ dở migration hoặc thay container).
2. **Giới hạn thời gian:** `timeout-minutes: 15` cho cả job (bình thường khoảng 1 phút).
3. **Quyền tối thiểu:** `permissions: contents: read`, không dùng secret của GitHub. Mọi khóa của hệ thống nằm sẵn ở `~/exam-prod-secrets/`; workflow chỉ gọi script trên máy.
4. **Runner:** `runs-on: [self-hosted, wsl-exam]`, `environment: production`; checkout nhánh `main` chỉ lấy `infra/` (`sparse-checkout`), dọn thư mục làm việc sau khi chạy.
5. **Chỉ gõ tay:** sự kiện duy nhất là `workflow_dispatch`, hai ô nhập `tag` (Q344) và `force_reason` (để trống = không ép; Q332).
6. **Tóm tắt lần chạy (job summary)** luôn hiện: tag đã chọn và nguồn (mặc định hay tự nhập), tag trước đó, tiêu đề commit, kết quả chốt chặn Phiên thi, đường dẫn bản sao lưu trước deploy, kết quả smoke test hai nơi (Q348), và nếu có lùi thì 50 dòng log lỗi (Q347).
7. **Dọn ảnh cũ** sau deploy thành công: giữ ảnh bản đang chạy và **2 bản gần nhất trước đó** (để lùi nhanh không phải tải lại); xóa ảnh `exam-api` / `exam-web` đời cũ hơn của chính dự án, không đụng ảnh khác trên máy (như `plo-backend-baseline`).
8. **Tài liệu cùng PR:** `docs/ops/trien-khai.md` thêm mục "Deploy bằng GitHub" từng bước (bấm ở đâu, Approve, đọc tóm tắt, lùi bản, xử lý khi lỗi, quy ước tương thích ngược của Q349).

**Ghi chú để tự học:**
- `cancel-in-progress: false` cho deploy khác với CI (`ci.yml` hủy lần cũ khi có commit mới): CI hủy được vì không để lại gì; deploy hủy giữa chừng có thể để hệ thống ở trạng thái nửa vời.
- Giới hạn thời gian chống job treo giữ runner (và cổng deploy) mãi.
- Quyền tối thiểu (`contents: read`) nghĩa là dù ai đó chèn được mã vào workflow thì `GITHUB_TOKEN` cũng không ghi được gì lên repo.

### Tổng kết thiết kế PR 6b (đã duyệt Q342–Q350)

Luồng một lần deploy, theo thứ tự:
```
bấm "Run workflow" (main)  →  Approve (Environment production, Q343)
 → checkout infra/ từ main (Q349)
 → chọn tag: để trống = main mới nhất; kiểm là commit của main (Q344)
 → kiểm ảnh api + web có trên GHCR
 → chốt chặn Phiên thi (FORCE_REASON nếu ép) (Q332)
 → đọc tag đang chạy (để lùi)
 → pg_dump -Fc + pg_restore --list; trượt thì dừng (Q345)
 → migration → thay api / worker / web
 → smoke test trong máy (version == tag): trượt thì thu log, tự lùi một lần, báo đỏ (Q347, Q348)
 → smoke test địa chỉ công khai: trượt chỉ cảnh báo (Q348)
 → ghi audit_logs "ops.deploy" (Q346), dọn ảnh cũ (Q350)
 → tóm tắt lần chạy
```
Đã làm ngoài mã: chính sách duyệt PR từ fork `all_external_contributors` (Q342) và Environment `production` (Q343).

## PR 6b: ghi chú triển khai

**Đã làm:**
- `.github/workflows/deploy.yml`: `workflow_dispatch` hai ô nhập (`tag`, `force_reason`), `environment: production`, `concurrency` không hủy, `timeout-minutes: 15`, `permissions: contents: read`, chạy trên `[self-hosted, wsl-exam]`. Các bước: chỉ nhánh `main` → checkout `infra/` (sparse, đúng commit lúc bấm) → đặt `XDG_RUNTIME_DIR` và `DBUS_SESSION_BUS_ADDRESS` cho Podman (dịch vụ runner không có phiên đăng nhập) và kiểm pod `prod-exam` có → chọn và kiểm tag (định dạng, thuộc `main`, ảnh api + web có trên GHCR bằng `podman manifest inspect`) → deploy → dọn thư mục làm việc.
- `infra/scripts/exam-ctl.sh deploy` (lệnh mới) chứa toàn bộ luồng, workflow chỉ gọi. Lý do: thử được ngay trên pod `drill` bằng `make -C infra prod-deploy`, và dùng được từ terminal khi GitHub hay runner hỏng. Có thêm các hàm `backup_before_deploy`, `audit_deploy`, `smoke_inside`, `smoke_public`, `prune_old_images`, `collect_failure_logs`; `die` ghi lý do vào tóm tắt; file có thể `source` để thử từng hàm (không chạy lệnh khi được `source`).
- `infra/Makefile`: `prod-deploy`.
- Giao diện Quản trị viên, trang Nhật ký: thêm nhãn tiếng Việt cho `ops.deploy` ("Đưa bản mới lên") và `ops.deploy-failed` và hai mục trong bộ lọc hành động (hành động lạ vẫn hiện mã thô nên đây chỉ là cho dễ đọc).
- Tài liệu: `docs/ops/trien-khai.md` mục "Deploy bằng GitHub" từng bước, đọc tóm tắt, lùi bản, ép khẩn cấp, ba lớp bảo vệ, quy ước script–ảnh, bảng lỗi mới; `docs/architecture.md` mục 9 (luồng deploy và runner); `README.md`.

**Khác với khung đã duyệt (cần biết):**
- Tag mặc định (ô để trống) là `github.sha` của lần bấm, tức commit `main` **lúc bấm**, không phải `origin/main` lúc job bắt đầu chạy. Hai giá trị khác nhau chỉ khi có commit mới vào `main` trong lúc chờ Approve; dùng commit lúc bấm để script và ảnh khớp với cái bạn đã thấy, và ảnh của commit mới hơn có thể chưa build xong.
- Chốt chặn Phiên thi chạy **sau** bước tải ảnh (thiếu ảnh thì dừng sớm, rẻ hơn), nhưng vẫn trước sao lưu và trước mọi thay đổi.
- Thêm một chi tiết nhỏ chưa hỏi: giữ 10 file `truoc-deploy-*.dump` mới nhất trong `~/exam-prod-backups/` để ổ đĩa không đầy dần; 6c sẽ thay bằng retention chính thức.
- Dọn ảnh theo lịch sử `~/.local/state/exam-prod/deployed-tags` (bản đang chạy và 2 bản trước đó); chỉ xét đúng tên kho `ghcr.io/<chủ>/exam-api` và `exam-web`, không xóa tên khác của cùng ảnh (phát hiện ở lần thử đầu: `podman images` liệt kê mọi tên của ảnh khớp).
- Bản không có tag trước (`?`) hoặc trùng tag mới thì không tự lùi được; tóm tắt nói rõ và trỏ sang bảng lỗi.

**Đã thử** trên pod tạm `drill-exam` (ảnh `good` / `good2` / `bad` cùng kho `localhost/exam-api`, và ảnh thật của commit `6c9d186` từ GHCR), có chạy dưới `env -i` để giống dịch vụ runner:

| Ca | Kết quả |
|---|---|
| Deploy thường (có sao lưu, kiểm, audit) | 18–26 giây; tóm tắt đủ 5 dấu ✅; `audit_logs` có `ops.deploy` (before/after, người bấm, đường dẫn) |
| Bản mới lỗi (container thoát ngay) | api không sẵn sàng sau 60 giây → thu log → tự lùi → hệ thống chạy lại bản cũ, `version` đúng; tổng khoảng 2 phút 10 giây; thoát mã 1; `audit_logs` có `ops.deploy-failed` với `rolled_back: true` |
| Sao lưu hỏng, không ép | dừng ngay ở bước sao lưu, nói rõ "chưa đụng vào hệ thống", bản đang chạy giữ nguyên |
| Sao lưu hỏng, có `FORCE_REASON` | đi tiếp, ghi `operations.log` và `audit_logs` `forced: true` |
| Ảnh không tồn tại | dừng ở bước tải ảnh, chưa đụng hệ thống |
| Có Phiên thi (5 người dự thi giả đang làm) | từ chối, thoát mã 1; có `FORCE_REASON` thì chạy và ghi lại |
| Chọn tag và kiểm trong workflow (chạy lại đúng đoạn script của workflow trên máy) | để trống → `main` mới nhất; mã rút gọn `cd436ad` → mã đầy đủ; `abc; rm -rf` → từ chối; mã không tồn tại → từ chối; ảnh api/web của `6c9d186` và `c348cc6` có trên GHCR |
| `podman` dưới `env -i` (giống dịch vụ runner) | chạy được cả khi thiếu và khi có `XDG_RUNTIME_DIR` |

**Chưa thử được (cần chạy thật trên GitHub sau khi merge; ghi vào checklist 6e):** lần bấm thật đầu tiên (Approve của Environment, runner nhận job, quyền thư mục `_work`), `actions/checkout` với `sparse-checkout` trên runner này, smoke test địa chỉ công khai qua tunnel thật, ⚠️ khi tunnel chưa có. Hướng dẫn lần chạy thật đầu tiên:
1. Merge PR 6b vào `main`, chờ job "Image api/web" xanh.
2. Chưa bootstrap `prod-exam` thì làm theo `docs/ops/trien-khai.md` mục 2 trước (đó là điều kiện của workflow).
3. Bấm **Run workflow** (ô để trống), Approve, đọc Summary; kiểm Nhật ký trong ứng dụng.
4. Bấm lần hai với mã cũ để thử đường lùi bản.

## Câu hỏi còn mở

- PR 6b: thiết kế Q342–Q350 đã duyệt, mã đã viết và thử trên pod `drill`; chờ PR được mở, CI xanh và chủ dự án duyệt.
- Sau 6b: 6c (script sao lưu), 6d (phần trong ứng dụng), 6e (hoàn tất); mỗi PR có thiết kế chi tiết riêng nếu còn điểm chưa duyệt.
