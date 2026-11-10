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

## PR 6b.1: sửa lỗi runner giết người giám sát container (phát hiện ở lần chạy thật đầu tiên)

**Sự cố (8/11/2026).** Lần deploy thật đầu tiên bằng workflow thành công. Lần thứ hai (lùi về `6c9d186`) lỗi và hệ thống ngừng khoảng 6 phút (502 từ 23:31 đến 23:37) cho đến khi chủ dự án chạy `make -C infra prod-up` bằng terminal.

**Nguyên nhân gốc.** Runner GitHub gắn biến `RUNNER_TRACKING_ID` vào mọi tiến trình của job và, khi job kết thúc, giết các tiến trình còn sót ("Terminate orphan process"). `conmon` (người giám sát của mỗi container Podman) do job sinh ra thừa hưởng biến này nên bị giết: log runner ghi `Terminate orphan process: pid (644252) (conmon)` và hai pid nữa, khớp đúng `ConmonPid` của container api, worker, web. Container vẫn chạy nhưng không còn ai giám sát, nên lần `podman stop` kế tiếp kẹt ở "stopping" và `podman rm` từ chối ("container state improper"); lần tự lùi cũng đi qua cùng chỗ kẹt đó nên lỗi theo.

**Vì sao lần thử trên pod `drill` không thấy.** Khi đó lệnh chạy từ terminal, không qua runner nên không có `RUNNER_TRACKING_ID` và không có bước dọn tiến trình mồ côi. Bài học: thử deploy trên pod tạm bằng terminal **không** thay được một lần chạy thật qua runner; phải thử qua runner trước khi coi là xong.

**Sửa:**
1. `exam-ctl.sh` chạy `unset RUNNER_TRACKING_ID` ngay đầu file, nên mọi caller đều an toàn.
2. Bước "Deploy" của workflow đặt `RUNNER_TRACKING_ID: ''` (hai lớp, phòng khi sửa một bên).
3. `replace` không còn kẹt khi container mất người giám sát: `stop -t 30` (bỏ qua lỗi) rồi `rm -f -t 5`. Lần tự lùi vì thế cũng đi qua được.

**Đã thử:**
- Tái hiện đúng lỗi bằng một container giả bị giết `conmon`: cách cũ (`stop` rồi `rm`) cho đúng lỗi `container state improper`, container kẹt "stopping"; cách mới xóa sạch trong 1,4 giây.
- Giả lập job của runner trên pod `drill`: chạy `deploy` với `RUNNER_TRACKING_ID` giả, rồi quét `/proc/*/environ` như runner: **0 tiến trình mang biến** (có đối chứng dương: một `sleep` mang biến thì bị quét thấy), conmon của api, worker, web đều **sống**, `/api/health` ok.
- Đối chiếu bằng chứng thật: ba pid conmon bị runner giết trong log khớp ba container bị hỏng.

**Đã thử qua runner thật sau khi sửa (8–9/11/2026, main = `75e57eb`).** Ba lần bấm workflow liên tiếp, cả ba thành công:

| Lần | Việc | Kết quả kiểm sau khi job kết thúc |
|---|---|---|
| 1 | Để trống tag: `87cb1b4` → `75e57eb` (đổi bản thật) | `/api/health` version `75e57eb`; conmon api, worker, web sống; dòng `ops.deploy` (`rolled_back=false`); có bản sao lưu `truoc-deploy-*.dump` |
| 2 | Nhập `87cb1b4` (lùi bản; đúng thao tác từng gây sự cố) | version `87cb1b4`; conmon cả ba sống (pid mới); không kẹt `Stopping` |
| 3 | Để trống tag: về lại `75e57eb` | version `75e57eb`; conmon cả ba sống; đủ 3 dòng `ops.deploy` |

Kết luận: lỗi đã sửa thật, không chỉ qua giả lập. Cách kiểm lặp lại được: `podman inspect -f '{{.State.ConmonPid}}' prod-exam-api` rồi `ps -p <pid> -o comm=` (phải ra `conmon`), cộng `curl https://exam.plotrackerbluni.site/api/health` xem `version`.

**Vẫn chưa thử (giữ trong checklist 6e):** WebSocket (không chỉ polling) qua tunnel bằng trình duyệt thật, hai bản api qua trình duyệt, `wsl --shutdown` rồi mở lại WSL, WSL có tự tắt khi đóng cửa sổ terminal không.

**Lưu ý cho 6e:** thêm vào checklist "kiểm sau mỗi deploy qua runner: conmon của mọi container phải sống" (kiểm tay như trên, hoặc xem để script `deploy` tự kiểm bước này).

## Định hướng của chủ dự án: sau này chuyển sang VPS hoặc máy chủ tại nhà (9/11/2026)

Hệ thống chạy ổn định trên WSL Ubuntu (laptop) trước; khi có điều kiện thuê VPS hoặc mua máy chủ đặt tại nhà thì chuyển sang để chạy 24/7. Đã viết sẵn hướng dẫn chuẩn bị, gồm cài từ đầu Podman rootless, pod, `cloudflared` tunnel, GitHub Actions runner để bấm tay chạy workflow, cắt chuyển dữ liệu và checklist: **[docs/ops/chuyen-len-vps.md](../ops/chuyen-len-vps.md)** (chưa chạy thử trên máy thật; sẽ cập nhật theo thực tế và viết ADR thay ADR-0006 khi chuyển).

**Ràng buộc cho mọi PR còn lại của lát cắt 6 (để việc chuyển sau này rẻ):**
- Script **không viết cứng** thứ chỉ có ở WSL: đường dẫn ổ `D:` (`/mnt/d`) phải là biến cấu hình, không giả định `wsl.exe`, không gọi lệnh Windows; chỉ dùng systemd người dùng, Podman rootless, `bash`, `rclone`, `gpg` (đều có trên Ubuntu máy chủ).
- Mọi thứ cấu hình theo máy (đường dẫn sao lưu, mã healthchecks, tên nhãn runner) nằm ở **env file hoặc biến môi trường**, không nằm trong mã.
- Câu chữ trong thông điệp và tài liệu phân biệt được "WSL (giai đoạn 1)" và "máy chủ 24/7" ở các chỗ khác nhau, ví dụ cách báo khi máy tắt (laptop: bình thường; máy chủ: sự cố).

## PR 6c: thiết kế chi tiết (đã duyệt Q351–Q361)

### Q351: cách lưu liên tục (lớp 2) và khôi phục về một thời điểm (ĐÃ DUYỆT 9/11/2026: phương án A)

**Quyết định.** Dùng công cụ **có sẵn của PostgreSQL** (`archive_command` cộng `pg_basebackup`), không cài `pgBackRest`. Script của dự án (bash, cùng phong cách `exam-ctl.sh`) lo phần còn lại: nén, mã hóa bằng `gpg`, đẩy bằng `rclone`, xóa bản cũ theo bảng Q325, kiểm tra.

**Phương án đã bỏ:**
- `pgBackRest` (B): mạnh hơn nhưng thêm một công cụ lớn vào ảnh hoặc thêm container, có cấu hình riêng phải học, thêm "hộp đen" cho hệ thống nhỏ. Nếu sau này dữ liệu lớn hoặc cần nhiều máy thì chuyển sang vẫn được, vì bản `pg_dump` và dữ liệu cũ không mất.
- Bỏ lớp 2 (C): mức mất dữ liệu tối đa lên tới một ngày, trái Q323 đã duyệt.

**Hiện trạng đo được (9/11/2026):** PostgreSQL 17.11 trong pod `prod-exam`; `wal_level=replica` (đủ để lưu liên tục, không cần đổi), `archive_mode=off` (chưa lưu), `max_wal_size=1GB`; máy đã có `rclone` và `gpg`; ổ D: còn khoảng 82 GB.

#### Ghi chú để tự học: cơ chế lưu liên tục (WAL) và khôi phục về một thời điểm (PITR)

**WAL là gì.** Mọi thay đổi trong PostgreSQL (thêm Câu trả lời, nộp bài…) trước hết được ghi vào một cuốn **nhật ký ghi trước** (Write-Ahead Log, WAL), rồi mới sửa vào file dữ liệu thật. Nhờ vậy khi mất điện, PostgreSQL đọc lại nhật ký để làm nốt. Nhật ký được cắt thành các file **16 MB** (gọi là "đoạn WAL") nối tiếp nhau.

**Ý tưởng sao lưu liên tục.** Giữ một **bản chụp đầy đủ** ở một thời điểm (bản nền) cộng **mọi đoạn WAL phát sinh sau đó**. Muốn quay về lúc 14:06: dựng bản nền lên rồi cho PostgreSQL "chạy lại" nhật ký từng bước cho tới đúng 14:06 thì dừng. So với `pg_dump` (một ảnh chụp mỗi đêm), cách này cho mất dữ liệu cỡ phút thay vì cỡ ngày.

```text
 bản nền (chủ nhật)        WAL đoạn 1 → 2 → 3 → … → N (mỗi phút một đoạn)
        │                                          │
        └──── dựng lên ──→ chạy lại WAL ──→ dừng đúng 14:06 ──→ mở cho dùng
```

**Ba bộ phận phải có:**
1. **Bật lưu**: `archive_mode = on`, `archive_command = '<lệnh chép đoạn WAL đi>'`, `archive_timeout = 60`. Mỗi khi đầy đoạn 16 MB, hoặc quá 60 giây mà đoạn chưa đầy, PostgreSQL gọi lệnh chép đoạn đó sang thư mục sao lưu. `archive_timeout` chính là cái làm **mức mất tối đa cỡ 1 phút** khi hệ thống vắng; lúc đông thí sinh đoạn đầy nhanh hơn nên chép nhanh hơn.
2. **Bản nền định kỳ** (`pg_basebackup`, mỗi tuần một lần theo Q323): chụp cả thư mục dữ liệu khi PostgreSQL vẫn đang chạy, không cần dừng hệ thống.
3. **Khôi phục**: dựng bản nền vào một thư mục dữ liệu **mới và rỗng**, tạo file `recovery.signal`, đặt `restore_command` (lệnh lấy đoạn WAL từ kho về) và `recovery_target_time` (thời điểm muốn quay về), khởi động PostgreSQL; nó tự chạy lại WAL rồi dừng ở mốc. Kiểm dữ liệu xong mới cho dùng (`pg_wal_replay_resume()` hoặc `recovery_target_action = 'promote'`).

**Quy tắc sống còn của `archive_command` (đã biết trước, đưa vào thiết kế):**
- Chỉ trả về **0 (thành công) khi đoạn WAL đã nằm an toàn ở nơi mới**; trả khác 0 thì PostgreSQL **giữ nguyên đoạn đó và thử lại**. Không bao giờ được "báo thành công giả".
- **Không ghi đè** file đã có cùng tên (tránh hỏng kho khi chạy lại).
- Ghi ra file tạm rồi **đổi tên** thành tên chính thức, để không bao giờ có file chép dở nằm trong kho.
- ⚠️ **Rủi ro lớn nhất:** nếu lệnh chép cứ thất bại (đầy đĩa, mất thư mục sao lưu…), PostgreSQL **không xóa** các đoạn WAL chưa chép, thư mục `pg_wal` phình ra tới khi **đầy ổ đĩa rồi PostgreSQL dừng hẳn**, tức cả hệ thống thi ngừng. Vì vậy thiết kế phải có: (a) kiểm số đoạn chờ chép (`pg_stat_archiver.failed_count`, số file `.ready` trong `pg_wal/archive_status`) trong script sao lưu hằng đêm và báo qua healthchecks và chuông; (b) giữ thư mục đích **ngay trên ổ WSL** (rất rộng, 859 GB trống) làm bước chép đầu, còn việc đẩy sang D: và R2 do script riêng làm sau, để mất mạng hay mất D: **không** làm nghẽn `archive_command`.

**Thứ tự chép (hai chặng, để chặng nào hỏng cũng không kéo sập PostgreSQL):**

```text
PostgreSQL ──archive_command (nhanh, chỉ chép nội bộ)──► ~/exam-prod-backups/wal/   (ổ WSL)
                                                              │ script chạy mỗi phút
                                                              ▼ nén + mã hóa + đẩy
                                              Ổ D: (/mnt/d)        Cloudflare R2
```

**Cách thử mà người vận hành lặp lại được (sẽ viết đầy đủ trong `docs/ops/khoi-phuc.md` ở 6c):**
1. Tạo dữ liệu mốc A, ghi giờ, tạo thêm dữ liệu mốc B.
2. Khôi phục bản nền cộng WAL, đặt `recovery_target_time` đúng giữa A và B.
3. Kiểm: thấy A, **không** thấy B. Đó là bằng chứng PITR hoạt động.

**Việc kéo theo (làm trong 6c):**
- Thêm các tham số `archive_*` vào lệnh dựng container PostgreSQL trong `exam-ctl.sh` (cho pod prod, và pod `drill` để thử) cùng một thư mục gắn vào container; vì phải dựng lại container PostgreSQL nên làm đúng lúc **chưa có Phiên thi**.
- Bản nền và WAL là **một cặp**: xóa bản nền cũ thì chỉ xóa WAL cũ hơn bản nền cũ nhất còn giữ (Q325 đã ghi quy tắc này).
- Đo thật: kích thước 1 đoạn WAL đã nén lúc vắng và lúc đông (tải 500 người), ghi vào `docs/hieu-nang.md`.

### Q352: xóa bản cũ trên R2 bằng quy tắc vòng đời, script không có việc xóa (ĐÃ DUYỆT 9/11/2026: phương án A)

**Vấn đề.** Q324 muốn khóa R2 trên máy "chỉ ghi, không xóa" để người chiếm được máy hoặc script lỗi cũng không xóa nổi bản sao lưu ngoài máy. Nhưng Q325 cần dọn bản cũ trên R2 để nằm trong 10 GB miễn phí. Hai yêu cầu va nhau nếu chính script phải xóa.

**Quyết định.** **R2 tự xóa theo tuổi** bằng **quy tắc vòng đời** (lifecycle rule) do chủ dự án đặt **một lần** trên trang quản lý R2. Script chỉ **tải lên**, không có dòng lệnh xóa nào nhắm vào R2.

**Phương án đã bỏ:**
- Script có quyền xóa và tự dọn theo "giữ N bản" (B): đúng ý Q325 nhất nhưng khóa nằm trên máy có quyền xóa; máy bị chiếm hay script lỗi có thể xóa sạch bản ngoài máy, mất đúng lớp bảo vệ mà lớp 3 sinh ra để có.
- Hai khóa, khóa xóa cất ở Bitwarden và dọn tay hằng tháng (C): an toàn nhất nhưng thêm một việc tay phải nhớ; quên thì R2 đầy.

**Cách tổ chức thư mục (tiền tố) trên R2 và quy tắc xóa:**

| Thư mục trên R2 | Chứa | Xóa sau | Vì sao |
|---|---|---|---|
| `daily/` | bản `pg_dump` mỗi đêm (đã mã hóa) | 7 ngày | Q325: 7 bản hằng ngày |
| `weekly/` | bản đêm Chủ nhật, **chép thêm** vào đây | 28 ngày | Q325: 4 bản hằng tuần |
| `monthly/` | bản đêm mùng 1, chép thêm vào đây | 180 ngày | Q325: 6 bản hằng tháng |
| `wal/` | các đoạn WAL (đã nén, mã hóa) | 7 ngày | Q325: WAL 7 ngày |
| `base/` | bản nền hằng tuần (`pg_basebackup`) | 15 ngày | luôn còn ít nhất **hai** bản nền (xem chú thích bên dưới) |
| `media/`, `khoa/` | ảnh `exam_media`, khóa bí mật (đã mã hóa) | **không đặt xóa** | ảnh chỉ thêm; khóa chỉ đổi thỉnh thoảng, dung lượng nhỏ |

Script tải **thẳng** vào từng thư mục (đêm Chủ nhật tải thêm bản vào `weekly/`, mùng 1 tải thêm vào `monthly/`), nên không cần quyền sao chép hay đổi tên trên R2. Lượng dùng thêm chỉ vài chục MB mỗi tháng.

**Chú thích: vì sao `base/` giữ 15 ngày mà `wal/` chỉ 7 ngày.** Một bản nền chỉ dùng được cho khôi phục thời điểm (PITR) khi còn **đủ mọi đoạn WAL từ lúc chụp bản nền trở đi**. Bản nền chụp hằng tuần, WAL giữ 7 ngày, nên bản nền cũ nhất sẽ dần mất WAL đầu của nó và hết dùng được. Nếu chỉ giữ một bản nền mà tuần đó chụp hỏng, ta sẽ **không có bản nền nào dùng được**. Giữ khoảng hai tuần để luôn có bản nền dùng được ngay cả khi lần chụp tuần này hỏng, trong lúc chuông 26 giờ và healthchecks kịp báo. Bản nền nào hết hạn thì chỉ cần mất; khôi phục luôn bắt đầu từ bản nền **mới nhất còn đủ WAL**.

**Điểm yếu đã biết và cách bù:**
- Xóa theo **tuổi**, không theo **số bản**. Nếu script ngừng chạy cả tuần, bản cũ vẫn tự mất mà không có bản mới thay. Bù: healthchecks.io (Q328) và chuông Quản trị viên báo ngay khi quá 26 giờ không có bản mới, sớm hơn nhiều so với hạn 7 ngày.
- Quy tắc vòng đời của R2 chạy nền theo lịch của Cloudflare, **không xóa đúng giây**; đủ cho mục tiêu dọn dung lượng.
- **Chưa kiểm được trước:** khóa R2 mức "Object Read & Write" có tự xóa được file hay không. Cloudflare không có mức chỉ-ghi thật sự; tài liệu không nói rõ. Khi bạn tạo khóa ở bước hướng dẫn tay, ta **thử thật**: tải một file lên rồi thử xóa bằng chính khóa đó. Nếu **xóa được** thì ghi rõ trong tài liệu rằng "chống xóa" ở R2 chỉ là quy ước (script không gọi xóa) chứ chưa là chốt kỹ thuật, và cân nhắc bước thêm ở câu sau (ví dụ khóa tải lên riêng, hoặc bật khóa đối tượng nếu có).

#### Ghi chú để tự học: vì sao tách người ghi khỏi người xóa

Nguyên tắc chung của sao lưu ngoài máy: **kẻ làm hỏng dữ liệu gốc không được có khả năng làm hỏng luôn bản sao**. Hỏng gốc có thể do lỗi phần mềm, xóa nhầm, mã độc tống tiền hoặc kẻ xâm nhập. Nếu bản sao nằm trong tầm xóa của cùng một tài khoản thì mọi thứ mất cùng lúc. Có ba cách làm cho bản sao khó bị xóa: (1) quyền riêng không có chữ "xóa" (nhưng không phải dịch vụ nào cũng cho); (2) để chính nhà cung cấp tự xóa theo tuổi, như ở đây; (3) bật **khóa đối tượng** (object lock) để file không xóa được trong một thời hạn. Dự án chọn (2) vì gói miễn phí, ít phần chuyển động, và dễ giải thích: "dọn dẹp là việc của R2, không phải của script".

#### Hướng dẫn tay cho chủ dự án (sẽ làm từng bước cùng nhau khi viết code 6c)

Đây là phác thảo; từng bước chi tiết kèm ảnh chụp màn hình cần bấm gì sẽ làm khi tới lúc:
1. Có tài khoản Cloudflare (đã có, dùng chung với tunnel); vào **R2**, bật R2 (tài liệu Cloudflare không nói rõ có bắt buộc thêm phương thức thanh toán hay không; khi bật, làm theo màn hình hiện ra. Dùng trong gói miễn phí thì không tính tiền, xem mục "Chính sách R2 đã kiểm" bên dưới).
2. Tạo **bucket** riêng cho dự án, ví dụ `exam-backup`. Không bật truy cập công khai.
3. Đặt **quy tắc vòng đời** cho từng thư mục theo bảng trên (mỗi dòng một quy tắc: tiền tố, xóa sau N ngày).
4. Tạo **khóa API R2** (Access Key ID và Secret) với quyền thấp nhất cho đúng bucket đó, **thử ghi rồi thử xóa** để biết khóa có xóa được không, rồi cất vào Bitwarden (Q327).
5. Đưa khóa vào `~/exam-prod-secrets/` (file riêng, quyền 600) để script đọc, không đưa vào repo.

### Q353: sao lưu hằng đêm có chạy bù khi bật máy (ĐÃ DUYỆT 9/11/2026: phương án A)

**Bối cảnh do chủ dự án nêu thêm:** pod `prod-exam` chạy trong WSL Ubuntu trên **laptop**, không mở 24/7; WSL mở lên thì pod mới tự dựng lại (Q334). Vì vậy "02:00 mỗi đêm" không phải lúc nào cũng có máy để chạy.

**Quyết định.**
1. Hẹn giờ bằng **systemd timer của người dùng** với `OnCalendar=*-*-* 02:00` và `Persistent=true`: lỡ giờ vì máy tắt thì khi WSL mở lên timer **chạy bù ngay**.
2. Lớp kiểm thứ hai, chạy khoảng **5 phút sau khi pod lên**: nếu bản `pg_dump` mới nhất cũ hơn **20 giờ** thì sao lưu ngay. Phòng trường hợp `Persistent` không bù được (ví dụ WSL bị tắt cưỡng bức, mất file ghi nhớ).
3. Hai đường chạy cùng một script và dùng **một khóa chống chạy trùng** (`flock`), để timer bù và lớp kiểm không sao lưu chồng lên nhau.

**Phương án đã bỏ:** hẹn giờ cứng không bù (B; có thể vào Phiên thi với bản sao cũ vài ngày); thêm tác vụ Windows giữ WSL bật suốt (C; đảo ngược Q334, laptop phải bật 24/7).

**Ràng buộc rút ra cho các câu sau (rất quan trọng khi máy là laptop):**
- **"Máy tắt" là bình thường, không phải sự cố.** Cảnh báo "quá 26 giờ" (Q323) và cảnh báo của healthchecks.io (Q328) phải được thiết kế để **không kêu oan** mỗi lần bạn tắt máy qua đêm. Trong ứng dụng, chuông chỉ có thể kêu **khi hệ thống đang chạy** (do chính ứng dụng gửi), nên đã hợp lý. Với healthchecks.io, cách báo dựa vào "tín hiệu còn sống" phải khác "bản sao lưu đêm" (sẽ chốt ở câu riêng).
- Mức mất dữ liệu 1–5 phút (Q323) **chỉ có nghĩa lúc máy đang bật**: khi tắt máy thì không có thao tác nào để mất. Mối nguy thật là **tắt đột ngột giữa Phiên thi** (gập laptop, hết pin, Windows tự khởi động lại): PostgreSQL tự phục hồi sau mất điện nhờ WAL, và các đoạn WAL đã chép ra vẫn nằm đó; phần mất tối đa là những thao tác chưa kịp chép, cỡ 1 phút. Phần "laptop ngủ giữa giờ thi" là chuyện vận hành (ghi vào checklist 6e: cắm sạc, tắt chế độ ngủ khi có Phiên thi), không phải việc của sao lưu.

#### Ghi chú để tự học: systemd timer và `Persistent=true`

- **Timer là gì.** systemd có hai loại file đi đôi: `*.service` (việc cần làm) và `*.timer` (khi nào làm). Timer thay cho `cron`, có thêm ưu điểm: có nhật ký chuẩn (`journalctl`), xem được lần chạy kế tiếp, và nhớ được lần lỡ.
- **`OnCalendar=*-*-* 02:00`** nghĩa là mỗi ngày lúc 02:00 (giờ máy).
- **`Persistent=true`**: systemd ghi giờ chạy lần cuối vào một file nhỏ trên đĩa (với timer của người dùng nằm ở `~/.local/share/systemd/timers/`). Khi timer được bật lại mà phát hiện đã lỡ ít nhất một lần hẹn trong lúc tắt, nó **chạy ngay một lần** (chỉ một lần, không chạy bù từng đêm bị lỡ).
- Timer của **người dùng** chỉ chạy khi **phiên của người dùng đó còn sống**; điều này khớp cách pod prod-exam đang dựng lại khi mở WSL (Q334).
- **Xem lịch:** `systemctl --user list-timers`. **Xem nhật ký lần chạy:** `journalctl --user -u <tên-service> -n 50`.
- **`flock`**: lệnh khóa file; script thứ hai gặp khóa đang giữ thì chờ hoặc thoát, tránh hai bản sao lưu chạy đồng thời tranh nhau đĩa và làm hỏng nhau.

### Q354: mã hóa bản gửi lên R2 bằng khóa công khai gpg, khóa bí mật không nằm trên máy (ĐÃ DUYỆT 9/11/2026: phương án A)

**Quyết định.**
- Bản gửi **ra ngoài máy (R2)** mã hóa bằng **khóa công khai gpg**. Máy chỉ giữ **khóa công khai** (chỉ mã hóa được). **Khóa bí mật** (giải mã) cất ở Bitwarden và bản giấy niêm phong (Q327), **không bao giờ để trên laptop hay máy chủ**.
- Bản chép ở **WSL và ổ D:** **không mã hóa** (cùng máy nên mã hóa không tăng bảo vệ, mà làm khó khôi phục nhanh). Điều này cũng cho phép **khôi phục thử hằng tháng tự động** (Q323, lớp 4) dùng bản trong WSL mà không cần khóa bí mật.
- Phần giải mã **bản R2** do chủ dự án thử **tay** mỗi vài tháng, bằng khóa bí mật lấy từ Bitwarden. Đây là bài kiểm duy nhất chứng minh bản ngoài máy dùng được khi mất cả máy.

**Phương án đã bỏ:**
- Mã hóa bằng mật khẩu (gpg đối xứng, B): mật khẩu phải nằm trên máy để script chạy tự động, nên ai chiếm được máy cũng giải mã được bản ngoài máy.
- `rclone crypt` (C): khóa mã hóa và giải mã là một, nằm trên máy (cùng điểm yếu B); ngoài ra mã hóa cả **tên file** làm quy tắc vòng đời theo tiền tố thư mục của Q352 không dùng được.

#### Ghi chú để tự học: mã hóa khóa công khai (bất đối xứng)

- **Hai khóa đi đôi.** Khóa công khai khóa "chiếc hộp" lại, ai có nó cũng khóa được nhưng **không mở được**; chỉ khóa bí mật mới mở. Như một thùng thư: ai cũng bỏ thư vào được, chỉ người giữ chìa mới lấy thư ra.
- **Vì sao hợp với sao lưu tự động.** Script chạy hằng đêm, không có người gõ mật khẩu, nên mọi thứ script cần phải nằm sẵn trên máy. Nếu thứ đó cũng là thứ giải mã được (như mật khẩu), kẻ chiếm máy lấy luôn. Với khóa công khai, thứ nằm trên máy **chỉ dùng để khóa**, nên máy bị chiếm vẫn không đọc được các bản đã gửi đi.
- **Cái giá:** mất khóa bí mật là mất khả năng đọc **mọi** bản trên R2. Vì vậy khóa bí mật cất hai nơi (Bitwarden và giấy) và **thử giải mã thật định kỳ**. Nếu sau này đổi cặp khóa, bản cũ vẫn cần khóa bí mật **cũ**: giữ lại mọi khóa bí mật đã dùng.
- **Khóa bí mật nên đặt thêm cụm mật khẩu bảo vệ** (passphrase), cất cụm mật khẩu ở nơi khác với file khóa khi có thể.
- **Người dự phòng (Q326):** gpg cho mã hóa cho **nhiều người nhận** cùng lúc. Muốn người dự phòng giải mã bằng khóa riêng của họ thì thêm khóa công khai của họ làm người nhận thứ hai (không bắt buộc, quyết ở bước làm thật).

#### Hướng dẫn thao tác (phác thảo; sẽ làm từng bước cùng chủ dự án khi viết code 6c)

1. **Tạo cặp khóa trong một thư mục gpg tạm** (không dùng kho khóa thường ngày):
   ```bash
   export GNUPGHOME="$(mktemp -d)"; chmod 700 "$GNUPGHOME"
   gpg --quick-generate-key "exam-system backup" default default never   # hỏi cụm mật khẩu cho khóa bí mật
   gpg --list-keys --fingerprint                                          # ghi lại dấu vân tay (fingerprint)
   ```
2. **Xuất hai khóa:**
   ```bash
   gpg --armor --export <FINGERPRINT> > exam-backup-public.asc
   gpg --armor --export-secret-keys <FINGERPRINT> > exam-backup-SECRET.asc   # CHỈ cất ở Bitwarden và bản giấy
   ```
3. **Cất khóa bí mật** vào Bitwarden (Secure note đã có, đính kèm hoặc dán nội dung) và in bản giấy; cất cụm mật khẩu tách riêng. **Sau đó xóa file bí mật khỏi máy và xóa thư mục `GNUPGHOME` tạm.**
4. **Nhập khóa công khai vào máy** (kho khóa của người dùng vận hành): `gpg --import exam-backup-public.asc`, rồi đánh dấu tin cậy hoặc dùng `--trust-model always` trong script.
5. **Script mã hóa** (ví dụ): `gpg --encrypt --recipient <FINGERPRINT> --trust-model always -o file.gpg file`. gpg tự nén nên không cần nén riêng.
6. **Thử giải mã (làm tay, định kỳ):** trên một máy khác (hoặc thư mục `GNUPGHOME` tạm), nhập khóa bí mật từ Bitwarden, tải một file từ R2 và `gpg --decrypt file.gpg > file`, rồi `pg_restore --list file` để chắc file đọc được. Ghi ngày thử vào checklist hằng tháng.

**Việc kéo theo trong 6c:** script chỉ mã hóa các thứ **đi ra R2**; thư mục `wal/`, `base/`, `daily/`, `weekly/`, `monthly/`, `media/`, `khoa/` trên R2 đều chứa file `.gpg`. Tên file **không** mã hóa (cần cho quy tắc vòng đời Q352) nên **không đặt thông tin nhạy cảm vào tên file** (chỉ ngày giờ, loại và số thứ tự).

### Chính sách R2 đã kiểm (9/11/2026) để bảo đảm sao lưu liên tục

Chủ dự án yêu cầu kiểm chính sách mới nhất của Cloudflare R2 trước khi chốt tần suất. Số liệu lấy từ tài liệu chính thức ngày 9/11/2026; **chính sách có thể đổi, kiểm lại trước khi chạy thật và mỗi khi R2 thông báo thay đổi** (nguồn: [Pricing](https://developers.cloudflare.com/r2/pricing/), [Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), [API tokens](https://developers.cloudflare.com/r2/api/tokens/), [S3 API](https://developers.cloudflare.com/r2/get-started/s3/)).

| Hạng mục | Chính sách ghi trong tài liệu | Ảnh hưởng đến thiết kế |
|---|---|---|
| Gói miễn phí (chỉ lớp lưu trữ Standard) | 10 GB-tháng lưu trữ; 1 triệu thao tác loại A mỗi tháng; 10 triệu thao tác loại B mỗi tháng | Khớp ước tính dung lượng Q325. **Không dùng lớp Infrequent Access**: không thuộc gói miễn phí |
| Thao tác loại A | `PutObject` (tải lên) và `ListObjects` (liệt kê) | Tải lên mỗi phút **và liệt kê** tốn hạn mức này (xem tính toán bên dưới) |
| Thao tác loại B | `GetObject` (tải về) | Khôi phục và thử giải mã dùng loại này, rẻ |
| Xóa | `DeleteObject` miễn phí | Quy tắc vòng đời xóa không tốn phí |
| Tải dữ liệu ra (egress) | Miễn phí | Khôi phục từ R2 không tốn tiền băng thông |
| Thời gian giữ tối thiểu | Standard: không có. Infrequent Access: 30 ngày | Không bị tính phí khi xóa sớm file Standard |
| Quy tắc vòng đời | Xóa sau N ngày hoặc vào một ngày; lọc theo **tiền tố**; tối đa 1000 quy tắc | Đúng thứ Q352 cần. Dùng khoảng 6 quy tắc |
| Độ trễ xóa | "thường xóa trong vòng 24 giờ sau thời điểm hết hạn"; file có sẵn khi mới đặt quy tắc có thể lâu hơn | Dung lượng thực tế có thể cao hơn bảng tính tới một ngày dữ liệu; ước tính đã có dư |
| Quyền cấu hình vòng đời | Là thao tác cấp bucket, cần quyền "Workers R2 Storage Write" | **Chủ dự án đặt quy tắc bằng tài khoản Cloudflare của mình** (trang quản lý hoặc `wrangler`), **không** dùng khóa trên máy. Điều này đúng ý Q352 |
| Mức quyền khóa API R2 | Chỉ có 4 mức: Admin Read & Write, Admin Read only, Object Read & Write, Object Read only; **không có mức chỉ-ghi** | Khóa trên máy dùng **Object Read & Write, giới hạn đúng một bucket** |
| Khóa Object Read & Write có xóa được file không | **Tài liệu không nói** (chỉ ghi "đọc, ghi, liệt kê") | **Vẫn phải thử thật** (Q352): tải file lên rồi thử xóa bằng chính khóa. Coi như xóa được cho tới khi thử |
| Tiền tố trong khóa | Tài liệu không nhắc giới hạn khóa theo tiền tố | Không dựa vào việc khóa chỉ được ghi vào `wal/` |
| Địa chỉ S3 | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, vùng `auto` | Cấu hình `rclone` kiểu S3 (nhà cung cấp Cloudflare), vùng `auto` |
| Phương thức thanh toán khi bật R2 | **Tài liệu không nói rõ** | Làm theo màn hình khi bật; ghi lại thực tế vào tài liệu |

**Tính hạn mức loại A cho tần suất "mỗi phút" (Q355).** Một tháng có khoảng 43 200 phút.
- Tải lên: tối đa 1 lần mỗi phút lúc có thao tác, thường ít hơn nhiều: chặn trên khoảng **43 200** thao tác mỗi tháng, cộng vài chục lần cho bản đêm và bản nền. Chỉ khoảng 4 % hạn mức 1 triệu.
- **Cạm bẫy: liệt kê.** Cách "so sánh thư mục" mặc định của `rclone` (`rclone copy`, `rclone sync`) **liệt kê toàn bộ thư mục đích mỗi lần chạy**, một trang tối đa 1000 file mỗi lần gọi. Thư mục `wal/` giữ 7 ngày × tối đa 1440 đoạn = hơn **10 000 file**, tức khoảng 11 lần liệt kê mỗi phút, khoảng **475 000** thao tác mỗi tháng, tương đương gần một nửa hạn mức, **chỉ để biết đã có gì**. Không chấp nhận được.
- **Cách tránh (đã đưa vào thiết kế Q355):** script **không liệt kê R2**. Nó giữ một **sổ ghi cục bộ** các file đã đẩy xong; mỗi phút chỉ đẩy các file mới chưa có trong sổ, bằng danh sách file cụ thể (`rclone copy --files-from <danh-sách> --no-traverse`, kiểm lại tùy chọn trong tài liệu `rclone` bản đang cài). Kiểm bằng cách đếm: một lần chạy bình thường chỉ gọi vài thao tác loại B/A, không phải hàng chục.
- Việc đối chiếu toàn bộ giữa sổ và R2 (liệt kê thật) làm **hiếm**, ví dụ mỗi đêm một lần (khoảng 30 lần liệt kê mỗi tháng) để phát hiện file thiếu.

### Q355: chép sang ổ D: và R2 mỗi phút, chỉ file mới, không liệt kê R2 (ĐÃ DUYỆT 9/11/2026: phương án A)

**Quyết định.**
- Một **timer chạy mỗi phút** (systemd timer của người dùng) gọi một script "đẩy". Script chép các đoạn WAL **mới** (chưa có trong sổ ghi) từ thư mục `wal/` trên ổ WSL sang **ổ D:** và sang **R2** (đã nén, mã hóa gpg theo Q354 với bản R2).
- Phút nào không có file mới thì chạy rất nhanh, không tải lên gì.
- Mất mạng hoặc D: chưa gắn thì file vẫn nằm ở thư mục WSL và được chép bù theo thứ tự ở lần chạy sau. Hai đích chép **độc lập**: R2 lỗi không ngăn D:, và ngược lại. Không đường nào làm nghẽn `archive_command` của PostgreSQL (hai chặng, Q351).
- Mức mất dữ liệu nếu mất cả máy: khoảng **1 phút** của thao tác (Q323, mức chặt nhất).
- **Bảo đảm liên tục (không đứt mắt xích):** tên đoạn WAL là chuỗi 24 ký tự hex gồm nhánh thời gian, và số thứ tự tăng dần. Script kiểm **dãy số liền nhau** ở thư mục WSL và ở sổ đã đẩy; thấy **lỗ hổng** (thiếu một đoạn giữa hai đoạn có mặt) thì ghi lỗi, gọi địa chỉ "thất bại" của healthchecks.io (Q328) và hiện chuông ở 6d. Lỗ hổng trong WAL nghĩa là **không khôi phục được qua chỗ đó**, nên đây là cảnh báo nghiêm trọng, và bản `pg_dump` đêm đó là chỗ dựa.
- Sổ ghi cục bộ nằm cạnh thư mục sao lưu (một file danh sách đơn giản). Mất sổ thì script dựng lại bằng một lần đối chiếu có liệt kê (chấp nhận tốn vài chục thao tác một lần).

**Phương án đã bỏ:** mỗi 5 phút (B; mất tối đa 5 phút khi mất cả máy, sát mức trên Q323), D: mỗi phút nhưng R2 chỉ mỗi đêm (C; mất tới một ngày khi mất cả máy, trái Q323).

**Nếu laptop thấy nặng:** chuyển sang 5 phút chỉ cần sửa `OnCalendar` của timer (một dòng cấu hình), không đổi thiết kế.

#### Ghi chú để tự học: vì sao tính "số thao tác" của dịch vụ lưu trữ

Dịch vụ lưu trữ đối tượng (S3, R2) tính phí và đặt hạn mức theo **số yêu cầu**, không chỉ theo dung lượng. Một công cụ "đồng bộ" tiện lợi có thể âm thầm gọi hàng nghìn yêu cầu liệt kê mỗi lần chạy. Với việc chạy mỗi phút, nhân lên 43 200 lần mỗi tháng. Bài học chung: **tính trước số yêu cầu mỗi chu kỳ × số chu kỳ mỗi tháng** và thiết kế để mỗi chu kỳ chỉ làm đúng phần việc mới (ghi nhớ cục bộ cái đã làm), thay vì hỏi dịch vụ "có gì rồi" mỗi lần.

### Q356: ảnh chép từng file mới; khóa bí mật mã hóa rồi chép khi có thay đổi (ĐÃ DUYỆT 9/11/2026: phương án A)

**Hiện trạng (9/11/2026):** volume `exam_media` còn trống (0 file); `~/exam-prod-secrets/` có hai file `postgres.env` (103 byte) và `api.env` (404 byte), quyền `600`.

**Quyết định.**

*Ảnh minh họa (`exam_media`):*
- Mỗi đêm (cùng đợt sao lưu hằng đêm) và sau mỗi lần sao lưu, script chép các **file ảnh mới** chưa có trong **sổ ghi cục bộ** sang **ổ D:** (không mã hóa, giống các bản chép khác ở D:) và **R2** (mã hóa gpg theo Q354, thư mục `media/`), theo cách "chỉ file mới, không liệt kê R2" của Q355. Ảnh đã đẩy không chép lại.
- Ảnh chỉ **thêm mới, không sửa**, nên mỗi file chép một lần. **Chống chép dở:** chỉ lấy file có thời điểm sửa cuối **cũ hơn 60 giây** và kích thước không đổi giữa hai lần đo, tránh chép đúng lúc API đang ghi.
- Đường dẫn volume lấy bằng `podman volume inspect exam_media -f '{{.Mountpoint}}'` (không viết cứng, để chạy được cả trên VPS).
- **Sao lưu chỉ thêm, không xóa:** nếu một ảnh bị xóa khỏi hệ thống thì bản sao vẫn còn (chấp nhận; ảnh nhẹ, và lỡ xóa nhầm thì còn gốc). Thư mục `media/` trên R2 **không đặt quy tắc xóa** (Q352). *Khi làm 6c kiểm xem ứng dụng có đường nào xóa ảnh không và ghi vào tài liệu.*

*Khóa bí mật (`postgres.env`, `api.env`):*
- Mã hóa bằng **khóa công khai** (Q354) rồi chép khi **nội dung đổi** (so mã băm `sha256` với lần chép trước, lưu trong sổ ghi). Mỗi bản có tên theo ngày và đoạn đầu của mã băm.
- Chép ở **cả D: lẫn R2 đều ở dạng mã hóa**: D: là ổ Windows, mọi chương trình Windows đọc được, nên khóa không được nằm dạng thường ở đó. Chỉ file gốc trong `~/exam-prod-secrets/` (quyền 600) là dạng thường.
- Thư mục `khoa/` trên R2 và D: **không xóa**: file nhỏ, và có thể cần bản **cũ** để mở dữ liệu cũ (ví dụ sau khi đổi khóa).
- Bitwarden và bản giấy (Q327) vẫn là nơi lưu chính, đây chỉ là lớp thứ ba.

**Phương án đã bỏ:** gộp ảnh và khóa vào gói hằng đêm (B; đẩy lại toàn bộ ảnh mỗi đêm, nhanh chạm 10 GB miễn phí); chỉ chép ảnh, bỏ khóa (C; thiếu dự phòng khi không vào được Bitwarden, mà khóa chỉ cỡ 500 byte).

#### Ghi chú để tự học: sao lưu "chỉ thêm" cho dữ liệu bất biến

Với dữ liệu **ghi một lần, không bao giờ sửa** (ảnh, file đính kèm), sao lưu đơn giản nhất và rẻ nhất là: nhìn thấy file mới thì chép đúng một lần, không đụng tới file cũ. Cái cần ghi nhớ là **danh sách đã chép** (sổ ghi), để lần sau biết file nào còn thiếu mà không phải hỏi nơi lưu. Đổi lại ta chấp nhận sao lưu không tự dọn: file bị xóa ở nguồn vẫn còn ở bản sao. Với dữ liệu thi, giữ thừa an toàn hơn xóa nhầm.

#### Khôi phục ảnh và khóa (phác thảo, viết đủ trong `docs/ops/khoi-phuc.md`)

- **Ảnh:** chép ngược các file vào volume `exam_media`. Vì Podman rootless ánh xạ người dùng (user namespace), file chép vào volume phải đúng chủ sở hữu bên trong container; dùng `podman unshare` để chép hoặc `podman volume import` từ một file `.tar` đã dựng từ thư mục ảnh.
- **Khóa:** giải mã bằng khóa bí mật (Bitwarden), đặt lại vào `~/exam-prod-secrets/` với quyền `600`.
- Cả hai đã nằm trong checklist thử khôi phục hằng tháng (câu sau).

### Q357: thử khôi phục đầy đủ mỗi tháng, tự động, trong pod tạm (ĐÃ DUYỆT 9/11/2026: phương án A)

**Vì sao cần:** bản sao lưu chưa từng khôi phục thử thì chưa chắc dùng được. Lỗi chỉ lộ khi thử: file dump mở được nhưng thiếu bảng; chuỗi WAL đứt nên chỉ khôi phục được tới giữa tuần; ảnh chép về sai chủ sở hữu nên API không đọc được; khóa không khớp dữ liệu.

**Quyết định.** Mỗi tháng một lần, script `restore-test` chạy **tự động** trong một **pod tạm** `restore-test`, cô lập hoàn toàn với `prod-exam`:

1. **Cô lập:** pod, thư mục dữ liệu và cổng riêng (chỉ gắn `127.0.0.1`, không trùng 8180 và 5436), thư mục làm việc `~/exam-prod-backups/restore-test/` xóa sạch sau khi chạy. **Không đọc hay ghi** vào volume và pod của prod.
2. **Chốt chặn trước khi chạy:** không có Phiên thi đang diễn ra hoặc sắp bắt đầu (dùng lại kiểm tra của Q332); đĩa còn trống ít nhất gấp đôi kích thước bản dump; không có sao lưu khác đang chạy (`flock`, Q353). Đặt **giới hạn thời gian** (ví dụ 20 phút); quá hạn thì dừng, dọn và báo lỗi.
3. **Kiểm tra A: bản `pg_dump` mới nhất.** Khôi phục vào PostgreSQL tạm, đếm số dòng các bảng chính và so với **số đếm ghi lúc làm bản dump** (cùng một ảnh chụp dữ liệu, không so với cơ sở dữ liệu đang chạy vì dữ liệu thật đã thêm sau đó). *Cách lấy số đếm cùng ảnh chụp (ví dụ `pg_dump --snapshot` với ảnh chụp xuất bằng `pg_export_snapshot()`) cân nhắc khi viết code.*
4. **Kiểm tra B: khôi phục về một thời điểm (PITR).** Bản nền mới nhất cộng WAL tới một mốc gần đây (ví dụ 10 phút trước); kiểm **dãy WAL liền nhau**, PostgreSQL báo đã dừng đúng mốc (log "recovery stopping"), thoát chế độ khôi phục, số dòng không **ít hơn** số của bản dump.
5. **Kiểm tra C: ứng dụng chạy được.** Khởi động **chỉ ảnh `exam-api`** của bản đang chạy (đọc tag ở `~/.local/state/exam-prod/tag`) với cơ sở dữ liệu vừa khôi phục: `/api/health` trả `ok`; `node dist/db/migrate.js` báo không còn migration chờ (dữ liệu và mã khớp phiên bản); một ảnh mẫu chép từ bản sao ảnh đọc được qua cùng cấu hình. **Không** khởi động worker (tránh gửi thông báo hay chạy việc nền trên dữ liệu thử).
6. **Ghi kết quả** vào sổ ghi (`state/restore-test.json`): giờ bắt đầu, giờ xong, **thời gian khôi phục** (chính là số "máy hỏng thì dựng lại mất bao lâu"), tên bản dump, các số đếm, WAL có đứt không, đúng hay sai từng kiểm tra, tổng kết `ok`. Gọi healthchecks.io (địa chỉ thành công hoặc thất bại, Q328); 6d đọc sổ này cho màn hình chỉ đọc và chuông.

**Chạy khi nào (laptop, Q353):** timer của người dùng `OnCalendar=monthly` kèm `Persistent=true`, cộng lớp kiểm sau khi pod lên: nếu lần thử gần nhất cũ hơn 35 ngày thì chạy. Tháng nào laptop không mở thì lần mở sau chạy bù; **nếu lúc đó có Phiên thi thì hoãn** đến khi hết.

**Dùng bản trong WSL (không mã hóa)**, nên không cần khóa bí mật. Phần **giải mã bản R2 vẫn do chủ dự án thử tay** (Q354), vì khóa bí mật không nằm trên máy. Checklist thử tay vài tháng một lần, ghi vào `khoi-phuc.md`: tải một bản từ R2, giải mã bằng khóa ở Bitwarden, `pg_restore --list`.

**Phương án đã bỏ:** thử nhẹ mỗi tuần và đầy đủ mỗi quý (B; phát hiện lỗi chậm tới 3 tháng); thử tay khi nhớ (C; dễ quên).

**Chi phí:** vài phút CPU và đĩa mỗi tháng với dữ liệu hiện nay; đo lại ở ca 500 người và ghi vào `docs/hieu-nang.md` (kích thước dump, thời gian khôi phục, thời gian dựng pod tạm).

#### Ghi chú để tự học: "bản sao chưa thử khôi phục thì chưa phải bản sao"

Câu quen thuộc của người làm vận hành: **sao lưu chỉ có giá trị khi khôi phục được**. Hai nguyên tắc trong thiết kế này:
- Thử ở **môi trường tách biệt**, không bao giờ thử trên hệ thống đang chạy: lỡ tay xóa nhầm thì mất dữ liệu thật.
- Đo **thời gian khôi phục (RTO)** cùng với **mức mất dữ liệu (RPO)**. RPO (Q323: 1 đến 5 phút) trả lời "mất bao nhiêu"; RTO trả lời "mất bao lâu để chạy lại". Phiên thi đang diễn ra thì cả hai đều quan trọng, và RTO chỉ biết thật nhờ lần thử này.

### Q358: healthchecks.io báo "sao lưu đêm" và "thử khôi phục" với hạn trễ rộng; tín hiệu "còn sống" để dành cho máy chủ 24/7 (ĐÃ DUYỆT 9/11/2026: phương án A)

**Điều chỉnh Q328 theo hoàn cảnh laptop.** Q328 duyệt hai thứ: báo sao lưu hằng đêm và báo "hệ thống còn trả lời". Q353 xác định laptop tắt là bình thường. Tín hiệu "còn sống" gửi mỗi 5 phút sẽ gây **email báo giả mỗi lần gập máy**, làm người vận hành quen bỏ qua cảnh báo, nguy hiểm hơn không có cảnh báo. Vì vậy: giữ phần báo sao lưu, **hoãn** phần "còn sống" tới khi chạy ở máy chủ 24/7 (xem [chuyen-len-vps.md](../ops/chuyen-len-vps.md), mục 9).

**Số liệu đã kiểm (trang giá và tài liệu của healthchecks.io, 9/11/2026):** gói miễn phí theo dõi **20 việc**, mỗi việc lưu **100 dòng nhật ký** (việc chạy mỗi 5 phút chỉ giữ lịch sử khoảng 8 giờ, việc chạy hằng ngày giữ khoảng 3 tháng). Mỗi việc nhận tín hiệu thành công (gọi địa chỉ gốc), `/start` (đo thời gian chạy), `/fail` (thất bại ngay), `/log` (ghi chú, không đổi trạng thái), hoặc đuôi mã thoát `/0` đến `/255`. Phần thân yêu cầu lưu 100 kB đầu. **Trang giá không nêu gói miễn phí có những kênh báo nào**; email thường có sẵn nhưng chưa xác nhận, **kiểm khi tạo tài khoản** và ghi kết quả vào tài liệu. Không đặt dữ liệu thi hay tên người dùng vào thân tín hiệu (Q328).

**Quyết định: hai việc theo dõi, dùng 2 trên 20.**

| Việc | Chu kỳ | Cho phép trễ | Khi nào báo thành công | Khi nào báo thất bại |
|---|---|---|---|---|
| `exam-backup-nightly` ("sao lưu hằng đêm") | 1 ngày | **3 ngày** | Chỉ khi **cả ba** đúng: bản `pg_dump` xong và đọc được; dãy WAL liền nhau; đã chép sang D: và R2 | Gọi `/fail` ngay khi một trong ba sai (kèm một dòng lý do ngắn trong thân) |
| `exam-restore-test` ("thử khôi phục hằng tháng") | 35 ngày | 7 ngày | Lần thử Q357 đạt cả ba kiểm tra | `/fail` khi một kiểm tra sai hoặc quá giờ |

- Hạn trễ 3 ngày để cuối tuần tắt máy không báo; tắt hơn 3 ngày thì có đúng một email nhắc (chấp nhận được).
- **Chưa tạo** việc "còn sống mỗi 5 phút". Khi chuyển sang máy chủ 24/7 thì bật, với hạn trễ ngắn (cỡ 10 phút), vì lúc đó "máy ngừng trả lời" là sự cố thật.
- Có chỗ trống trong 20 việc để thêm sau (ví dụ việc riêng cho lỗi WAL nghiêm trọng).
- **Địa chỉ báo là bí mật nhỏ:** cất trong env file riêng của máy (`~/exam-prod-secrets/backup.env`, quyền 600), không đưa vào repo, vào log công khai hay tài liệu. Chép vào Bitwarden (Q327) để dựng lại khi chuyển máy.
- Script luôn gọi `/start` trước khi chạy để healthchecks đo được thời gian sao lưu và phát hiện lần chạy treo.
- **Gọi báo lỗi không được làm hỏng việc chính:** thiếu mạng hoặc healthchecks.io lỗi thì ghi cảnh báo vào log và đi tiếp (hết thời gian chờ ngắn, vài giây); không bao giờ để lỗi gọi báo làm sao lưu thất bại hay nghẽn `archive_command`.

**Điểm yếu đã biết và cách bù:** máy **tắt đột ngột giữa Phiên thi** thì healthchecks không báo ngay. Lớp bảo vệ chính là chuông trong ứng dụng (chỉ kêu khi hệ thống đang chạy, chỉ thấy khi Quản trị viên đăng nhập) và người ngồi cạnh máy; checklist 6e dặn cắm sạc, tắt chế độ ngủ, đặt giờ hoạt động cho Windows Update trong giờ thi. Chấp nhận cho giai đoạn laptop.

**Phương án đã bỏ:** thêm việc "còn sống mỗi 5 phút" ngay (B; email giả mỗi lần gập máy); chưa dùng healthchecks khi còn laptop (C; sao lưu đêm lỗi thì chỉ phát hiện khi tình cờ mở màn hình chỉ đọc).

#### Ghi chú để tự học: cảnh báo giả và "mệt mỏi vì cảnh báo"

Hệ thống giám sát tốt báo **ít nhưng đúng**. Mỗi cảnh báo giả làm người nhận giảm một chút sự chú ý, và khi cảnh báo thật đến thì bị coi như giả. Hai cách giảm cảnh báo giả đã dùng ở đây: (1) **chỉnh hạn trễ theo thói quen thật** của hệ thống (laptop tắt cuối tuần thì cho trễ 3 ngày); (2) **báo theo kết quả** (script tự gọi `/fail` khi biết lỗi) thay vì chỉ báo theo **sự im lặng**. Báo theo kết quả nhanh và chính xác hơn; báo theo im lặng cần để bắt trường hợp script chết hẳn không kịp báo gì, nên vẫn giữ làm lưới an toàn với hạn trễ rộng.

### Q359: script ghi sổ kết quả cục bộ (luôn có) và chèn vào bảng trong cơ sở dữ liệu khi có bảng (ĐÃ DUYỆT 9/11/2026: phương án A)

**Bài toán.** Q323 muốn Quản trị viên xem tình trạng sao lưu trong ứng dụng và có chuông khi bản mới nhất cũ hơn 26 giờ. Script sao lưu chạy ở máy (ngoài container), ứng dụng chạy trong pod, nên kết quả phải đi từ script vào ứng dụng.

**Quyết định.**
- **PR 6c:** mỗi lần chạy, script **luôn** ghi một dòng JSON vào sổ `~/.local/state/exam-prod/backup-runs.jsonl` (mỗi dòng một lần chạy). Mỗi dòng có: loại việc (dump đêm, dump trước deploy, bản nền, đẩy WAL, đẩy ảnh và khóa, thử khôi phục), giờ bắt đầu và kết thúc, kích thước, nơi đã chép (WSL, D:, R2), kết quả (`ok` hoặc `failed`), lý do lỗi ngắn. **Sổ này là nguồn gốc**, tồn tại kể cả khi cơ sở dữ liệu hỏng, tức đúng lúc cần biết bản sao cuối là khi nào.
- **PR 6d:** thêm bảng `backup_runs` bằng migration, màn hình chỉ đọc cho Quản trị viên và chuông quá 26 giờ. Script thêm bước: **nếu bảng tồn tại** thì chèn dòng bằng `psql` qua `podman exec`, đúng cách `audit_deploy` đang chèn vào `audit_logs`. Cơ sở dữ liệu hỏng, đang khôi phục, hoặc chưa có bảng thì **bỏ qua và chèn bù** ở lần chạy sau (script so sổ với bảng và chèn những dòng còn thiếu).
- Sổ và bảng **không lưu bí mật** (không có địa chỉ healthchecks, không có khóa); chỉ tên loại việc, số liệu và lý do lỗi ngắn.
- Chia việc: 6c độc lập, chạy được mà không cần ứng dụng thay đổi. 6d chỉ thêm phần hiển thị và chuông.

**Phương án đã bỏ:** chỉ ghi vào cơ sở dữ liệu (B; hỏng cơ sở dữ liệu là mất luôn sổ ghi đúng lúc cần); ứng dụng tự đọc file qua thư mục gắn vào container (C; mở thêm đường vào hệ thống file của máy chủ, phải dựng lại container, cần thiết kế bảo mật riêng).

#### Ghi chú để tự học: "sổ gốc" ngoài hệ thống được theo dõi

Nguyên tắc chung: **thứ dùng để theo dõi một hệ thống không nên sống phụ thuộc vào chính hệ thống đó**. Nếu sổ kết quả sao lưu chỉ nằm trong cơ sở dữ liệu thì cơ sở dữ liệu hỏng làm mất cả sổ lẫn khả năng biết bản sao còn dùng được không. Vì vậy sổ gốc là file thường trên máy chủ; bảng trong cơ sở dữ liệu chỉ là **bản sao để hiển thị**, mất thì dựng lại từ file.

### Q360: timer ở máy hỏi `audit_logs` mỗi 5 phút để chạy bản dump sau mỗi lần Công bố (ĐÃ DUYỆT 9/11/2026: phương án A)

**Bài toán.** Q323 muốn có một bản `pg_dump` ngay sau mỗi lần Công bố. Công bố xảy ra trong ứng dụng (trong container), còn script sao lưu chạy ở máy; ứng dụng không gọi được script của máy.

**Quyết định.** Khi Công bố, mã hiện tại đã ghi dòng `session.released` vào `audit_logs` trong **cùng giao dịch** (`apps/api/src/modules/grading/release.service.ts`). Một timer của người dùng chạy **mỗi 5 phút**: script nhớ mốc thời gian của dòng `session.released` cuối cùng đã sao lưu (trong sổ cục bộ), hỏi cơ sở dữ liệu có dòng mới hơn không; nếu có thì chạy `pg_dump` (loại `publish`) rồi lưu mốc mới. Nhiều lần Công bố trong 5 phút chỉ cần một bản (một ảnh chụp phủ tất cả). Công bố lúc máy tắt thì không có gì để sao lưu.
- Không sửa mã ứng dụng, không mở đường kết nối mới giữa container và máy; dùng cùng khuôn với `ops.deploy` (script đọc và ghi `audit_logs` bằng `psql` qua `podman exec`).
- Độ trễ tối đa 5 phút; mỗi lần hỏi là một truy vấn nhẹ trên `audit_logs`.

**Phương án đã bỏ:** bỏ bản dump riêng, dựa vào PITR (B; PITR phụ thuộc chuỗi bản nền cộng WAL, bản dump độc lập là chỗ dựa thứ hai); ứng dụng ghi file cờ cho script đọc (C; cần đường dùng chung giữa container và máy, tức thiết kế bảo mật riêng).

**Còn mở của 6c:** tên lệnh và cấu trúc script; thứ tự các bước làm; bản tổng kết thiết kế 6c để duyệt một lần (câu tiếp theo).

### Q361: các thiết lập kỹ thuật còn lại của 6c (ĐÃ DUYỆT 9/11/2026: đồng ý cả 9 điểm)

**Bối cảnh quy mô do chủ dự án nêu (9/11/2026).** Giai đoạn đầu chạy thật **trên WSL Ubuntu của laptop cho tiết kiệm nhất**, chủ yếu phục vụ **dưới 100 sinh viên dự thi cùng lúc**. Số đo ở [hieu-nang.md](../hieu-nang.md) cho thấy cấu hình này **đạt mọi ngưỡng với một api và một worker** (100 người, 0 lỗi), nên:

- Mặc định giữ **một bản api** (`make -C infra prod-scale N=2` chỉ dành cho phòng khoảng 300 người trở lên, chưa cần ở giai đoạn này).
- Sao lưu phải **nhẹ**: chạy dưới `nice -n 19` / `ionice` để không làm chậm phòng thi trên cùng máy. `pg_dump` (nhỏ, nhanh, không khóa ghi) vẫn chạy khi có Phiên thi; **bản nền `pg_basebackup` và thử khôi phục hằng tháng thì hoãn khi có Phiên thi** (nặng hơn; lần chạy bù sau sẽ làm).
- Dung lượng sao lưu của một trường học nhỏ rất bé (cơ sở dữ liệu cỡ vài chục MB đến vài trăm MB, ảnh đề thi cỡ MB), nên 10 GB R2 và 82 GB ổ D: dư rộng.
- Laptop tắt là bình thường (Q353); khi chuyển sang máy chủ 24/7 thì đổi hạn báo chứ không đổi thiết kế (xem [chuyen-len-vps.md](../ops/chuyen-len-vps.md)).

**Chín điểm đã duyệt.**

| # | Điểm | Nội dung đã duyệt |
|---|---|---|
| 1 | Script và lệnh | Một file `infra/scripts/exam-backup.sh` (cùng phong cách `exam-ctl.sh`), lệnh con: `dump`, `basebackup`, `push`, `release-check`, `restore-test`, `status`, `enable`, `disable`. Đích `make -C infra prod-backup-*` tương ứng, dùng cho cả việc hằng ngày lẫn chạy tay |
| 2 | Timer | Các timer **của người dùng**, tên bắt đầu `exam-backup-`: `push` mỗi phút, `release` mỗi 5 phút, `nightly` 02:00, `base` hằng tuần (Chủ nhật), `restore-test` hằng tháng, và dịch vụ chạy bù ~5 phút sau khi pod lên. Tất cả `Persistent=true`, dùng chung một khóa `flock` (không hai việc nặng cùng lúc) |
| 3 | Thư mục ổ WSL | `~/exam-prod-backups/{daily,weekly,monthly,base,wal,restore-test}` cộng các file `truoc-deploy-*.dump` đang có (giữ 10). Bản chép ở D: cùng cấu trúc, đường dẫn lấy từ biến `EXAM_BACKUP_MIRROR_DIR` (mặc định `/mnt/d/exam-prod-backups`), **không viết cứng** |
| 4 | Cấu hình theo máy | `~/exam-prod-secrets/backup.env` (quyền 600, không vào repo): thông tin R2, địa chỉ healthchecks, dấu vân tay khóa gpg công khai, `EXAM_BACKUP_MIRROR_DIR` |
| 5 | Tên dump | `exam-<YYYYMMDD>-<HHMMSS>-<loại>.dump`, loại: `nightly`, `publish` (sau Công bố), `deploy` (trước deploy, giữ tên cũ `truoc-deploy-*` cho tương thích). Tạo bằng `pg_dump -Fc` chạy **trong container PostgreSQL**, kiểm bằng `pg_restore --list` |
| 6 | Bật lưu liên tục | Lệnh riêng `exam-ctl.sh enable-archiving`: dựng lại **chỉ container PostgreSQL** (volume giữ nguyên) với `archive_mode=on`, `archive_command`, `archive_timeout=60` và thư mục WAL gắn vào. **Chốt chặn: không chạy khi có Phiên thi.** Mỗi lần `prod-up` về sau tự giữ các tham số này |
| 7 | Dọn bản cũ ở WSL và D: | Script làm theo bảng Q325, có chế độ chạy thử `--dry-run` in ra sẽ xóa gì. **Không bao giờ xóa bản mới nhất**; chỉ xóa WAL cũ hơn bản nền cũ nhất còn giữ. R2 vẫn do quy tắc vòng đời (Q352) |
| 8 | Cách thử trong 6c | Thử trên pod `drill`, dùng `rclone` kiểu `local` làm "R2 giả" (chưa cần tài khoản R2 thật). Tình huống: đầy đĩa, mất đích chép, WAL đứt, khôi phục thời điểm A rồi B (PITR), chạy bù. Viết `docs/ops/khoi-phuc.md` và cập nhật `trien-khai.md` **trong cùng PR** |
| 9 | Bật thật là bước riêng | PR 6c chỉ **cài sẵn** script và timer ở trạng thái **chưa bật**. Sau merge, hướng dẫn chủ dự án từng bước: tài khoản R2, bucket, quy tắc vòng đời, khóa API (kèm thử xóa), cặp khóa gpg + Bitwarden + giấy, tài khoản healthchecks (kiểm kênh báo của gói miễn phí). Cuối cùng `make -C infra prod-backup-enable`, rồi `enable-archiving` lúc không có Phiên thi, rồi thử một lần khôi phục thật |

**Vì sao chia "cài sẵn" và "bật thật" (điểm 9).** Bật lưu liên tục dựng lại container PostgreSQL và bắt đầu chép ra ngoài; nếu khóa R2/gpg chưa sẵn sàng thì sao lưu "bật nửa chừng" còn nguy hơn chưa bật (đĩa đầy WAL, báo giả). Vì vậy PR chỉ giao công cụ đã thử trên `drill`, còn việc cần tài khoản thật (người chủ làm) đi theo một danh sách có thứ tự, kiểm từng bước.

**Tự học: một lần chạy `exam-backup.sh nightly` làm gì (thứ tự).**

1. Lấy khóa `flock`; không lấy được (việc khác đang chạy) thì thoát êm, ghi sổ "bỏ qua".
2. Gọi healthchecks `/start`.
3. `pg_dump -Fc` trong container, kiểm `pg_restore --list`, ghi tên file + kích thước + số dòng các bảng chính.
4. Xếp bản tuần (Chủ nhật) hoặc tháng (mùng 1) bằng cách **chép thêm** file.
5. Kiểm dãy WAL liền nhau (không đứt số).
6. Đẩy các file mới sang D: và R2 (xem Q355, Q356), mã hóa gpg cho R2 (Q354).
7. Dọn bản cũ ở WSL và D: (điểm 7).
8. Ghi một dòng vào `~/.local/state/exam-prod/backup-runs.jsonl` (Q359).
9. Gọi healthchecks thành công, hoặc `/fail` kèm lý do nếu bất kỳ bước 3 đến 6 hỏng. Việc báo hỏng **không bao giờ** làm hỏng việc chính.

**Các tên và đường dẫn dự kiến để tra lại:**

| Thứ | Tên / chỗ |
|---|---|
| Script | `infra/scripts/exam-backup.sh` |
| Make | `make -C infra prod-backup-dump`, `prod-backup-push`, `prod-backup-status`, `prod-backup-restore-test`, `prod-backup-enable`, `prod-backup-disable` |
| Timer | `exam-backup-push.timer`, `exam-backup-release.timer`, `exam-backup-nightly.timer`, `exam-backup-base.timer`, `exam-backup-restore-test.timer`, `exam-backup-catchup.service` (trong `~/.config/systemd/user/`) |
| Cấu hình | `~/exam-prod-secrets/backup.env` |
| Sổ kết quả | `~/.local/state/exam-prod/backup-runs.jsonl`, `~/.local/state/exam-prod/restore-test.json` |
| Ổ WSL | `~/exam-prod-backups/` |
| Ổ D: | `$EXAM_BACKUP_MIRROR_DIR` (mặc định `/mnt/d/exam-prod-backups`) |

**Thứ tự làm PR 6c (ước lượng, mỗi bước thử trên pod `drill`):** (1) khung script + `dump` + sổ kết quả + dọn bản cũ; (2) `enable-archiving` + `push` với "R2 giả"; (3) `basebackup` + kiểm dãy WAL + PITR; (4) ảnh và khóa bí mật; (5) `release-check`; (6) `restore-test` trong pod tạm; (7) timer, `catchup`, healthchecks (có thể giả); (8) tài liệu `khoi-phuc.md`, `trien-khai.md`; (9) soát mã hai trục rồi mở PR.

### Tổng kết thiết kế sao lưu 6c (Q351–Q361, để theo dõi và học lại)

**Mục tiêu:** mất tối đa khoảng 1 phút thao tác khi máy hỏng giữa giờ thi (Q323), khôi phục được về một thời điểm, mọi bản sao ngoài máy đều mã hóa và khóa giải mã không nằm trên máy, và biết sớm khi sao lưu hỏng.

```text
PostgreSQL ──archive_command (nội bộ, nhanh)──► ~/exam-prod-backups/wal/      (Q351)
     │                                                │ mỗi phút: chỉ file mới, sổ ghi, không liệt kê R2 (Q355)
     │                                                ▼
     │                                    Ổ D: (dạng thường)     R2 wal/ (gpg, công khai Q354)
     ├─ pg_dump hằng đêm 02:00 (chạy bù khi bật máy, Q353) ──► daily/ → weekly/ (CN), monthly/ (mùng 1)
     ├─ pg_dump trước deploy (6b) và sau Công bố (hỏi audit_logs mỗi 5 phút, Q360)
     ├─ bản nền pg_basebackup hằng tuần ──► base/
exam_media ─ file mới, đợi nguội 60 giây (Q356) ──► D: (thường), R2 media/ (gpg)
~/exam-prod-secrets ─ gpg, chỉ khi mã băm đổi (Q356) ──► D: và R2 khoa/ (đều mã hóa)

R2 tự xóa theo tuổi bằng quy tắc vòng đời (Q352); script không có lệnh xóa trên R2.
Mỗi tháng: khôi phục thử trong pod tạm restore-test (dump + PITR + api), ghi thời gian khôi phục (Q357).
Mỗi lần chạy: ghi sổ backup-runs.jsonl (Q359); gọi healthchecks.io: sao lưu đêm (trễ 3 ngày), thử khôi phục (trễ 7 ngày) (Q358).
```

| Câu | Quyết định | Tóm tắt |
|---|---|---|
| Q351 | Lưu liên tục bằng công cụ có sẵn của PostgreSQL | `archive_command` chép WAL nội bộ, `pg_basebackup` hằng tuần; chép hai chặng để R2 hay D: hỏng không làm nghẽn PostgreSQL |
| Q352 | R2 tự xóa theo tuổi | Quy tắc vòng đời theo thư mục con; script chỉ tải lên; thử xem khóa có xóa được không khi tạo khóa |
| Q353 | Chạy bù khi bật máy | systemd timer 02:00 `Persistent=true`, lớp kiểm 20 giờ sau khi pod lên, `flock`; laptop tắt là bình thường |
| Q354 | Mã hóa bằng khóa công khai gpg | Chỉ bản gửi R2; khóa bí mật ở Bitwarden và giấy; bản WSL và D: dạng thường |
| Q355 | Chép mỗi phút, chỉ file mới | Sổ ghi cục bộ, không liệt kê R2 (tránh cạn hạn mức loại A); kiểm dãy WAL liền nhau |
| Q356 | Ảnh chép từng file mới; khóa mã hóa khi đổi | Chỉ thêm, không xóa; khóa ở D: cũng mã hóa |
| Q357 | Thử khôi phục hằng tháng trong pod tạm | Dump + PITR + ứng dụng chạy được; đo thời gian khôi phục |
| Q358 | Hai việc theo dõi với hạn trễ rộng | "Còn sống" để dành cho máy chủ 24/7 |
| Q359 | Sổ cục bộ luôn có; bảng trong CSDL khi có (6d) | Sổ gốc ngoài hệ thống được theo dõi |
| Q360 | Hỏi `audit_logs` mỗi 5 phút để dump sau Công bố | Không sửa ứng dụng |
| Q361 | Chín thiết lập kỹ thuật | Tên script/timer/thư mục, cài sẵn rồi mới bật thật; quy mô đầu: laptop WSL, dưới 100 người, một api |
| Q362 | `backup_runs` ghi việc quan trọng và mọi lỗi | Đẩy thành công mỗi phút không ghi (khỏi 1.440 dòng mỗi ngày) |
| Q363 | Chuông "bản đêm quá 26 giờ" | Kiểm mỗi 30 phút; chỉ kêu khi quá 26 giờ và ứng dụng đã chạy ít nhất 30 phút (tránh kêu oan sau khi bật máy); một chuông, tự tắt |
| Q364 | Chuông khi việc sao lưu lỗi | Việc nghiêm trọng kêu ngay; đẩy D:/R2 chỉ kêu khi lỗi liên tục từ 30 phút; tự tắt khi phục hồi |
| Q365 | Màn hình "Sao lưu" chỉ đọc | Dải cảnh báo, ba ô tóm tắt, danh sách phân trang, không bộ lọc |
| Q366 | Sáu thiết lập kỹ thuật của 6d | Migration 0022, script chèn qua psql có chèn bù, giữ 12 tháng và 90 ngày, API GET admin, job `backup.check`, kiểm thử |

**Lịch chạy (đều là systemd timer của người dùng, có chạy bù):**

| Việc | Khi nào |
|---|---|
| Đẩy WAL, ảnh, khóa sang D: và R2 | mỗi phút |
| Kiểm Công bố mới, chạy `pg_dump` nếu có | mỗi 5 phút |
| `pg_dump` đêm, giữ theo tuần/tháng, ảnh, khóa, kiểm dãy WAL, báo healthchecks | 02:00 mỗi đêm |
| Bản nền `pg_basebackup` | mỗi tuần |
| Thử khôi phục | mỗi tháng |
| Lớp kiểm sau khi pod lên (chạy bù) | 5 phút sau khi pod lên |

**Các tài liệu liên quan để tham khảo lại:** deploy hằng ngày [trien-khai.md](../ops/trien-khai.md); khôi phục dữ liệu `khoi-phuc.md` (viết trong 6c); chuyển máy chủ [chuyen-len-vps.md](../ops/chuyen-len-vps.md); thiết kế và lý do ở chính file này (deploy: Q330–Q350; sao lưu: Q323–Q328, Q351–Q360).

## PR 6c: ghi chú triển khai (9/11/2026)

**Đã viết (nhánh `feat/sao-luu-6c`, chưa commit):**

| File | Vai trò |
|---|---|
| `infra/scripts/exam-backup.sh` | Mọi việc sao lưu và khôi phục: `status`, `dump`, `nightly`, `basebackup`, `push`, `release-check`, `restore-test`, `catchup`, `prune`, `wal-gaps`, `check`, `install`, `enable`, `disable`, `pitr`, `pitr-stop`, `restore-dump` |
| `infra/scripts/pg-archive-wal.sh` | `archive_command` của PostgreSQL (chạy trong container): nén, đọc lại so khớp, `sync`, đổi tên, không ghi đè |
| `infra/scripts/exam-ctl.sh` | thêm `enable-archiving`, `disable-archiving`; `run_postgres` giữ tham số lưu liên tục qua mọi lần dựng lại container |
| `infra/scripts/test-backup-drill.sh` | bài thử tự động trên pod `drill-exam` (`make -C infra backup-drill-test`) |
| `infra/Makefile` | các đích `prod-backup-*`, `prod-enable-archiving`, `backup-drill-test` |
| `docs/ops/khoi-phuc.md` (mới) | tài liệu vận hành sao lưu và khôi phục (tra cứu lâu dài) |
| `docs/ops/trien-khai.md`, `docs/ops/chuyen-len-vps.md` | cập nhật liên kết, mục sao lưu, quy mô giai đoạn đầu |

**Điều chỉnh so với thiết kế đã duyệt, phát sinh khi làm (chủ dự án xem lại; đều dễ đổi):**

1. **Ảnh: KHÔNG sao lưu `tmp/`, `uploads/`, `slips/`** (Q356 nói chép "file ảnh mới"). Đọc mã nguồn thấy volume media chứa cả file **tạm mà ứng dụng chủ động xóa**: `uploads/…` (bảng tính danh sách thí sinh, có thông tin cá nhân), `slips/*.enc` (Phiếu tài khoản mã hóa, có hạn giữ), `tmp/illustrations/…`. Sao lưu "chỉ thêm" bản **thường** sang ổ D: sẽ giữ mãi dữ liệu mà ứng dụng định xóa. Chỉ `illustrations/` là dữ liệu bền. Đặt bằng biến `MEDIA_EXCLUDE` (mặc định `tmp uploads slips`). Thư mục mới sau này mặc định được sao lưu; `status` liệt kê các thư mục để dễ thấy.
2. **Ảnh và khóa bí mật quét mỗi phút cùng đợt `push`** (không chỉ hằng đêm), vì ảnh mới là dữ liệu mà bản WAL đã trỏ tới; quét chỉ tốn một lệnh `find`. Vẫn "chỉ file mới, cũ hơn 60 giây, kiểm kích thước sau khi chép".
3. **WAL nén gzip mức 1 ngay lúc lưu** (`<tên>.gz`): mỗi đoạn WAL dài 16 MB dù ít ghi, với `archive_timeout=60` thì không nén sẽ đầy ổ và R2. Đọc lại bản nén để so khớp trước khi báo thành công.
4. **Bản nền là một file `base/exam-<ngày>-<giờ>-base.tar.gz`** làm bằng `pg_basebackup -Ft -z -X fetch -c fast` (đã kèm WAL cần để tự nhất quán), cộng sổ phụ `.info` (đoạn WAL bắt đầu, giờ làm xong). Quy tắc dọn WAL: xóa khi quá hạn ngày **và** cũ hơn điểm bắt đầu của bản nền **mới nhất**, hoặc khi cũ hơn bản nền **cũ nhất** còn giữ (vô dụng); không bao giờ xóa file chưa vào sổ đẩy của mọi đích.
5. **Số dòng lúc dump lưu thành khoảng** `[trước, sau]` (đếm trước và sau `pg_dump`, sổ phụ `.counts`): vì đếm và dump không cùng một khoảnh khắc nên bản khôi phục phải nằm **trong khoảng** đó mới tính khớp.
6. **Thử khôi phục ghi một dòng dấu `ops.backup_test` vào `audit_logs` thật** mỗi tháng (rồi ép chuyển đoạn WAL) để chứng minh WAL cuối đã vào bản khôi phục. Một dòng mỗi tháng.
7. **Thêm các lệnh chưa nằm trong chín điểm của Q361 vì tài liệu khôi phục cần**: `pitr`/`pitr-stop` (PostgreSQL tạm về một thời điểm), `restore-dump` (thay cơ sở dữ liệu thật bằng một bản dump, có xác nhận, tự dump trước, tự nạp lại nếu hỏng), `check` (kiểm điều kiện trước khi bật), `catchup`, `wal-gaps`, `install`. Dựng các bước khôi phục bằng lệnh tay rất dễ sai (xem "bẫy đã gặp" trong khoi-phuc.md mục 8), nên đóng gói và thử.
8. **Tên timer** `exam-backup-<việc>` cho pod thật, `exam-backup-drill-<việc>` cho pod thử; timer chạy **bản chép cố định** ở `~/.local/share/exam-<stage>/bin/` (cập nhật bằng `prod-backup-install`), không trỏ vào cây mã nguồn. `push` và `release` đặt `AccuracySec=5s` (mặc định systemd cho phép trễ tới 1 phút).
9. **Tham số khi khôi phục:** PostgreSQL khôi phục từ WAL đòi các tham số ảnh hưởng WAL không nhỏ hơn máy gốc (`max_connections=200` ở `run_postgres`); `pitr` và `restore-test` đã đặt đúng.

**Bẫy đã gặp khi làm (đã sửa, có bài thử giữ lại):** `date -u -d "giờ máy"` hiểu chuỗi là UTC nên `pitr` sai 7 giờ; khóa `flock` (fd 9) bị container chạy lâu thừa hưởng khiến mọi việc sau đó "bỏ qua êm" (đã thấy: `restore-dump` rồi `dump` bị bỏ qua); bước "ứng dụng chạy trên bản khôi phục" báo khỏe giả khi bước dump lỗi vì migration dựng cơ sở dữ liệu trống; `cp -p` trong `podman unshare` làm file chép ra mang chủ lạ; reconcile đếm cả file mới chưa từng đẩy là "thiếu".

**Kết quả thử trên pod `drill-exam`** (cơ sở dữ liệu rất nhỏ nên thời gian chỉ là mốc so sánh; số thật đo sau khi bật ở hệ thống thật, ghi vào đây):

| Việc | Thời gian / kích thước |
|---|---|
| `enable-archiving` (dựng lại PostgreSQL, ép chuyển WAL, kiểm đã chép) | 13 giây |
| `dump` (nice 19) | 5 giây, 150 KB |
| `basebackup` | 2 giây, 4,2 MB |
| `push` (không có gì mới) | dưới 1 giây |
| `restore-test` đủ 4 bước | 28–31 giây (dump 6, pitr 9, api 8, ảnh 3) |
| `pitr` về một thời điểm | 6 giây |
| `restore-dump` | 19 giây (api và worker dừng khoảng 15 giây) |

`make -C infra backup-drill-test` (xem kết quả cuối ở mục dưới): bài thử chạy được các kịch bản chính, gồm các tình huống hỏng (R2 hỏng, ổ chép chỉ đọc, WAL đứt, dump hỏng, file ảnh không đọc được, nạp khôi phục hỏng giữa chừng → tự trả về).

**Chưa thử / chưa biết (ghi để làm ở bước bật thật và 6e):**

- ~~R2 **thật**~~ Đã thử 9/11/2026 (xem khoi-phuc.md mục 4.9): ghi và đọc được; khóa Object Read & Write **xóa được file** (nên "R2 không bao giờ bị xóa" chỉ là quy ước của script); phát hiện và sửa lỗi export biến rclone trong `$(...)`; rclone 1.60.1 gặp 501 ở lần thử đầu mỗi lần tải lên rồi tự thành công ở lần hai. Quy tắc vòng đời: chưa đối chiếu từng dòng.
- healthchecks.io **thật** (gói miễn phí có kênh báo nào).
- Tốc độ sinh WAL khi rảnh và khi có Phiên thi trên máy thật (ảnh hưởng dung lượng R2 và ổ D:); xem `status` sau vài ngày bật.
- `wsl --shutdown` giữa lúc đang đẩy hay đang dump; đĩa đầy thật.
- Khôi phục sang máy khác từ R2 (diễn tập của 6e).
- Timer chạy sau khi mở WSL từ trạng thái tắt hoàn toàn (đã thử `enable` và chạy một dịch vụ bằng systemd, chưa thử qua một lần tắt/mở WSL).
- Số thật của thử khôi phục trên dữ liệu thật (RTO).

### PR 6c: kết quả bật thật trên `prod-exam` (9/11/2026)

Toàn bộ nhật ký (lệnh, số đo, lỗi) ở [khoi-phuc.md mục 4.9](../ops/khoi-phuc.md). Tóm tắt những gì thay đổi so với thiết kế và bài thử ở pod drill:

| Điểm | Kết quả thật |
|---|---|
| Cặp khóa gpg | `C03E6416CDACA6645710AA3E14C0007D328A40D9`; khóa bí mật chỉ ở Bitwarden và 3 tờ giấy (A khóa, B mật khẩu, C mã khôi phục 2FA của Bitwarden); máy chỉ giữ khóa công khai; đã giải mã thử bản `khoa/` trên R2 bằng khóa lấy từ Bitwarden, dấu băm khớp |
| R2 | cần thêm thẻ thanh toán mới bật được; **không có trần chi tiêu cứng**, chỉ cảnh báo ngân sách (đặt 1 và 5 USD); khóa **Object Read & Write xóa được file** (đã thử thật), nên "script không xóa trên R2" chỉ là quy ước |
| healthchecks.io | gói Hobbyist đủ (20 việc, email); thử `/fail` báo Down rồi Up, email nhận được |
| Bật WAL | 11,9 giây, worker khởi động lại một lần, api không đứt |
| Đẩy lần đầu | R2 và ổ D: khớp nhau; lần đầu 1 phút 47 giây, các lần sau 1 giây; rclone 1.60.1 gặp `501` ở lần tải đầu rồi tự thành công (vô hại) |
| Thử khôi phục | **27 giây** (dump 6, pitr 8, api 9, media 0); CSDL gần trống nên là cận dưới; giai đoạn media chưa thử thật (chưa có ảnh) |
| Lỗi script phát hiện khi chạy thật (đã sửa) | (1) biến `RCLONE_CONFIG_EXAM_R2_*` được export trong `r2_remote()` gọi qua `$(...)` nên mất; (2) `newest()` lỗi khi thư mục chưa tồn tại (với `pipefail`) làm `status` và `catchup` thoát lỗi |
| Bài học | bài thử bằng đích giả và trạng thái cũ không bắt hết lỗi lần chạy đầu; 6e thêm kịch bản "thư mục sao lưu trống" và một lần thử với đích thật |

## PR 6d: thiết kế chi tiết (đang duyệt từng câu từ Q362, 9/11/2026)

**Phạm vi (từ Q323 và Q359):** trong ứng dụng, thêm (1) bảng `backup_runs` bằng migration, (2) script `exam-backup.sh` chèn dòng vào bảng, (3) màn hình **chỉ đọc** về tình trạng sao lưu cho Quản trị viên, (4) chuông khi bản đêm mới nhất quá 26 giờ hoặc có lỗi, (5) job xóa thông báo đã đọc quá 90 ngày. Bối cảnh: lát cắt 6 của bản MVP, nên giữ phạm vi gọn. Sổ gốc vẫn là file `~/.local/state/exam-prod/backup-runs.jsonl` (Q359); bảng chỉ là bản sao để hiển thị.

### Q362: bảng `backup_runs` ghi những việc nào (ĐÃ DUYỆT 9/11/2026: phương án A)

**Bài toán.** Script đẩy sang ổ D: và R2 mỗi phút. Ghi mọi lần đẩy thành công vào bảng thì thêm khoảng 1.440 dòng mỗi ngày (khoảng 130.000 dòng mỗi quý), màn hình ngập dòng vô nghĩa và dòng quan trọng bị chìm.

**Quyết định (A): chỉ ghi việc quan trọng và mọi lỗi.**
- Ghi: dump đêm, dump sau Công bố, bản nền, thử khôi phục, đổi file bí mật, chạy bù (catchup), và **bất kỳ lần đẩy hay kiểm tra nào lỗi** (đẩy hỏng, WAL đứt quãng, archive lỗi).
- **Không** ghi: lần đẩy thành công mỗi phút. Chỉ vài dòng mỗi ngày; màn hình gọn; "quá 26 giờ" chỉ cần bản đêm thành công gần nhất.
- Chỉ số sống (hàng chờ đẩy, WAL liền hay không) vẫn xem bằng lệnh `make -C infra prod-backup-status`; thêm vào màn hình sau nếu thực tế thấy thiếu.

**Phương án đã bỏ:** B (ghi tất cả kể cả đẩy mỗi phút: đầy đủ nhưng phình bảng, cần bộ lọc, mỗi phút thêm một lệnh ghi vào cơ sở dữ liệu); C (như A thêm một dòng "tình trạng hiện tại" cập nhật mỗi phút: phức tạp hơn, chưa cần cho MVP).

### Q363: chuông "bản đêm quá 26 giờ" kêu khi nào (ĐÃ DUYỆT 9/11/2026: phương án A)

**Bài toán.** Chuông trong ứng dụng chỉ kêu khi hệ thống đang chạy, nhưng laptop không bật 24/7. Ví dụ kêu oan: tắt máy lúc 17:00, bật lại 07:30; bản đêm cuối là 02:00 hôm qua nên đã 29,5 giờ (quá 26 giờ); 5 phút sau (07:35) `catchup` tự chạy bù và tạo bản mới. Nếu ứng dụng kiểm ngay lúc 07:30 thì Quản trị viên nhận chuông báo lỗi rồi vài phút sau mọi thứ lại ổn. Vài lần như vậy người nhận sẽ bỏ qua chuông (cảnh báo giả, xem ghi chú ở Q358).

**Quyết định (A).** Một job trong worker kiểm **mỗi 30 phút**. Chỉ kêu khi **cả hai** điều kiện đúng: (1) bản đêm thành công mới nhất (dòng `backup_runs` loại dump đêm, `ok`) cũ hơn **26 giờ**; (2) **ứng dụng đã chạy liên tục ít nhất 30 phút** (đủ để `catchup` chạy xong). Chỉ **một** chuông chưa đọc (gộp theo loại, không nhân lên mỗi 30 phút), **tự tắt** khi có bản đêm thành công mới. Gửi cho **mọi Quản trị viên**.

**Phương án đã bỏ:** B (kiểm mỗi 30 phút, kêu ngay khi quá 26 giờ: kêu oan sau mỗi đêm tắt máy); C (chỉ kiểm lúc 09:00 mỗi ngày: bản đêm lỗi thì tới 9 giờ mới biết, bật máy sau 9 giờ thì hôm đó không có lần kiểm nào).

### Q364: chuông khi một việc sao lưu báo lỗi (ĐÃ DUYỆT 9/11/2026: phương án A)

**Bài toán.** Khác Q363 ("bản đêm quá cũ"): ở đây là một việc sao lưu **tự báo lỗi** dù bản đêm vẫn còn mới (bản nền lỗi, thử khôi phục lỗi, WAL đứt, đẩy sang R2 hỏng). Có lỗi thoáng qua (mạng chập chờn một phút, phút sau tự ổn) và lỗi thật. Mỗi lỗi thoáng qua đều kêu thì chuông kêu oan vài lần mỗi tuần và người nhận dần phớt lờ.

**Quyết định (A): phân loại.**
- **Kêu chuông ngay khi lỗi:** dump đêm, dump sau Công bố, bản nền, thử khôi phục, WAL đứt quãng, archive lỗi.
- **Đẩy sang ổ D: hoặc R2 lỗi: chỉ kêu nếu lỗi liên tục từ 30 phút trở lên.** Script chỉ ghi dòng lỗi vào `backup_runs` khi đã lỗi đủ 30 phút liên tục, và ghi một dòng "đã phục hồi" (`ok`) khi đẩy lại được (khớp với Q362: đẩy thành công bình thường không ghi, chỉ ghi lúc chuyển từ lỗi sang ổn).
- Mỗi **loại việc** một chuông chưa đọc (gộp, không nhân lên), **tự tắt** khi có dòng thành công hoặc phục hồi sau đó cùng loại. Gửi cho mọi Quản trị viên.

**Phương án đã bỏ:** B (mọi dòng lỗi kêu ngay: lỗi mạng thoáng qua làm chuông kêu oan); C (không kêu chuông khi lỗi, chỉ hiện trên màn hình: thử khôi phục hỏng hay bản nền lỗi không ai biết cho đến khi tình cờ mở màn hình).

### Q365: màn hình "Sao lưu" của Quản trị viên (ĐÃ DUYỆT 9/11/2026: phương án A)

**Quyết định (A).** Một màn hình **chỉ đọc** trong menu quản trị (cạnh "Nhật ký" và "Đăng nhập"), theo kiểu các màn hiện có (ưu tiên điện thoại, danh sách phân trang): (1) **dải cảnh báo** chỉ hiện khi có vấn đề chưa xử lý (ví dụ "Đẩy sang R2 lỗi từ 14:05"); (2) **ba ô tóm tắt**: bản đêm gần nhất (tuổi, kết quả, dung lượng), bản nền gần nhất, thử khôi phục gần nhất (kết quả, số giây); (3) **danh sách lần chạy gần đây**, mới nhất trước, phân trang, **không có bộ lọc**. Không có nút nào làm thay đổi hệ thống (khôi phục vẫn làm tay theo sách hướng dẫn, Q323).

**Phương án đã bỏ:** B (chỉ danh sách như màn Nhật ký: muốn biết bản đêm gần nhất phải tự dò); C (thêm bộ lọc và tải file: thừa cho MVP, danh sách chỉ vài dòng mỗi ngày; thêm sau nếu thực tế cần).

### Q366: các thiết lập kỹ thuật còn lại của 6d (ĐÃ DUYỆT 9/11/2026: đồng ý cả 6 điểm)

1. **Bảng `backup_runs`** (migration `0022`): loại việc, kết quả (`ok` hoặc `failed`), giờ bắt đầu và xong, dung lượng, lý do ngắn (tối đa 200 ký tự, **không chứa bí mật**), và **mã chạy** duy nhất lấy từ sổ file để chèn bù không trùng.
2. **Script chèn bằng `psql` qua `podman exec`**, đúng cách `audit_deploy` đang làm. Bảng chưa có, hoặc cơ sở dữ liệu hỏng hay đang khôi phục thì **bỏ qua**, lần chạy sau **chèn bù** các dòng còn thiếu từ sổ file (Q359). Lỗi ghi bảng **không bao giờ** làm hỏng việc sao lưu.
3. **Giữ dữ liệu:** `backup_runs` giữ **12 tháng** (cùng mức `login_events`); thông báo **đã đọc** quá **90 ngày** bị xóa, thông báo **chưa đọc** giữ. Cả hai là thêm bước (độc lập) vào job `maintenance.cleanup` hằng ngày 03:00 đang có.
4. **API chỉ đọc:** một đường `GET` cho Quản trị viên (cả phần tóm tắt và một trang danh sách, 20 dòng mỗi trang); người khác nhận 403; không có đường ghi nào từ ứng dụng.
5. **Chuông:** job `backup.check` trong worker, mỗi 30 phút, theo Q363 và Q364. Hai loại thông báo: `backup.stale` (bản đêm quá 26 giờ) và `backup.failed` (kèm loại việc lỗi). Dùng lại `upsertUnread` và `clearUnread`.
6. **Kiểm thử và tài liệu:** kiểm thử đơn vị cho quy tắc 26 giờ cộng "ứng dụng chạy chưa đủ 30 phút" (đồng hồ giả); kiểm thử tích hợp cho API (đúng quyền), chuông gộp và tự tắt, job dọn dẹp mới; một bài E2E ngắn mở màn hình "Sao lưu"; bài thử drill của script (chèn, chèn bù, thiếu bảng); cập nhật `data-model.md`, `khoi-phuc.md`, `architecture.md`.

**Thiết kế 6d hoàn tất (Q362–Q366).**

## PR 6d: ghi chú triển khai (9/11/2026)

**Đã làm theo Q362–Q366:**

| Phần | Nơi | Ghi chú |
|---|---|---|
| Bảng `backup_runs` | `apps/api/drizzle/0022_sao_luu.sql`, `modules/backup/backup.schema.ts` | enum `backup_run_status`, `run_key` duy nhất, chỉ mục theo `finished_at` và `(kind, finished_at)` |
| API chỉ đọc | `GET /api/admin/backup` (`modules/backup/backup.controller.ts`) | trả `summary` (bản đêm, bản nền, thử khôi phục, `issues`) và `runs` (20 dòng mỗi trang); `@AdminOnly`; không có đường ghi |
| Chuông | job `backup.check` (`backup-check.job.ts`, mỗi 30 phút trong worker), `BackupService.check` | hai loại `backup.stale` và `backup.failed`; dùng `upsertUnreadKeyed` và `clearUnreadKeyed` mới của `NotificationsService` (khái quát hóa `upsertUnread` và `clearUnread` theo một khóa tùy ý trong `data`; hai hàm cũ gọi lại hàm mới) |
| Dọn dữ liệu | `NotificationsService.deleteReadBefore` gọi từ `maintenance.cleanup` (thông báo đã đọc quá 90 ngày); `BackupService.purgeOld` gọi từ `backup.check` (kết quả quá 12 tháng) | xem sai khác 2 bên dưới |
| Màn hình | `apps/web/src/routes/_authed/admin/backup.tsx`, `lib/backup.ts`, mục "Sao lưu dữ liệu" trong menu quản trị, chuỗi trong `vi.json`, chuông bấm vào mở màn hình | dải cảnh báo, 3 ô tóm tắt, danh sách phân trang, chỉ đọc, hỏi lại mỗi phút |
| Script | `exam-backup.sh`: `report_consider`, `report_add`, `report_flush`, `report_seed`, `report_push_failing`, `report_push_ok` | lọc theo Q362 và Q364, chèn bằng `psql` qua `podman exec`, chèn bù, sổ báo cáo `backup-report.jsonl` và con trỏ `backup-report.cursor`, cờ lỗi trong `backup-failing/` |

**Sai khác so với thiết kế (ghi để biết):**

1. **Cột giờ:** bảng lưu `finished_at` và `seconds` (giờ bắt đầu suy ra được), không lưu cả `started_at` như Q366 điểm 1 viết. Đủ cho màn hình và chuông, đơn giản hơn cho script.
2. **Xóa kết quả quá 12 tháng nằm ở job `backup.check`, không ở `maintenance.cleanup`** (Q366 điểm 3 nói thêm vào job dọn dẹp hằng ngày). Lý do: `maintenance.cleanup` nằm trong module `identity`; muốn xóa bảng của `backup` thì `identity` phải import bảng của module khác, vi phạm ranh giới module (`architecture.test.ts`, A1). Xóa thông báo đã đọc vẫn ở `maintenance.cleanup` nhưng đi qua `NotificationsService` (module `identity` đã dùng service này).
3. **Cổng mới `ADMIN_DIRECTORY`** (`common/admin-directory.ts`, cài đặt `identity/admin-directory.service.ts`, nối ở `AttemptPortsWiringModule`): để `backup` biết gửi chuông cho Quản trị viên nào mà không đọc bảng `users`. Cùng kiểu `EXAMINER_DIRECTORY`.
4. **Loại việc ghi vào bảng:** `dump-nightly`, `dump-publish`, `basebackup`, `restore-test`, `nightly` (kiểm hằng đêm: WAL đứt, archive lỗi, đồng bộ), `secrets`, `catchup`, `push`. `release` (hỏi `audit_logs` mỗi 5 phút), `media` và `reconcile` không vào bảng (lỗi `release` lặp mỗi 5 phút khi cơ sở dữ liệu hỏng, không có dòng ok tương ứng để tự tắt chuông).
5. **Quy tắc chuông "quá 26 giờ" khi chưa có bản đêm ok nào:** tính từ dòng đầu tiên trong bảng; bảng trống hẳn (script chưa báo) thì không báo.

**Lỗi tìm được khi thử (đã sửa):** (1) `check` lấy mốc "bản đêm gần nhất" từ dòng mới nhất của loại đó, nên khi dòng mới nhất là lỗi thì mốc bị lệch (bắt bởi bài integration "bản đêm lỗi không tính là bản đêm"); sửa bằng truy vấn riêng lấy bản đêm **thành công** gần nhất. (2) Lần đầu chèn bù từ sổ gốc không chạy vì dòng báo cáo đầu tiên tạo file trước khi `report_seed` kịp kiểm tra (bắt bởi bài drill 9c); sửa bằng cách dựng sổ báo cáo từ sổ gốc trước khi thêm dòng đầu. (3) `architecture.test.ts` chặn lần đầu vì `backup` và `identity` import bảng của nhau; sửa bằng cổng và đường qua service (sai khác 2 và 3).

**Kiểm thử:** `apps/api/test/backup.int.test.ts` (18 bài: API đúng quyền, tóm tắt, phân trang, không có đường ghi, quy tắc 26 giờ và 30 phút chạy, chuông gộp một cái và tự tắt, chuông lỗi theo loại việc, dọn dẹp 90 ngày và 12 tháng); `apps/web/e2e/backup.spec.ts` (màn hình đủ phần, chỉ đọc, không cuộn ngang; thêm vào `themes.spec.ts` kiểm sáng/tối ở 4 cỡ); bài drill mục 9c của `test-backup-drill.sh` (chưa có bảng thì sao lưu vẫn chạy; chèn bù từ sổ gốc; chạy lại không trùng; đợt lỗi chỉ một dòng; dòng ok tự tắt; đẩy lỗi chỉ ghi khi đủ ngưỡng; dòng "đã phục hồi"; chi tiết không chứa bí mật).

**Cách bật thật sau khi merge:** deploy bản mới bằng workflow (chạy migration 0022), rồi `make -C infra prod-backup-install` để timer dùng script mới; lần chạy `release-check` đầu tiên (trong 5 phút) chèn bù toàn bộ lịch sử từ sổ gốc. Kiểm: mở "Sao lưu dữ liệu" thấy bản đêm và bản nền đã có từ 9/11/2026.

**Đã bật thật ngày 10/11/2026** (PR #82 merge, `main` = `87d86f7`; workflow deploy xanh; migration `0022` chạy; chèn bù 6 dòng; màn hình "Sao lưu dữ liệu" đúng, chủ dự án xác nhận). Từng bước ở [khoi-phuc.md mục 4.9.11](../ops/khoi-phuc.md). Chuông chưa được thử trên máy thật (chưa có lỗi hay bản đêm quá hạn), quy tắc đã được bài integration chứng minh.

## Câu hỏi còn mở

- PR 6b (#79) và 6b.1 (#80) đã merge; workflow deploy đã chạy thật qua runner (deploy, lùi bản, deploy lại) và đạt. Hệ thống đang chạy thật ở `exam.plotrackerbluni.site`, bản `75e57eb`.
- Tiếp theo: 6c (script sao lưu): thiết kế đã duyệt (Q351–Q361), **mã đã viết, thử trên pod drill (61/61), mở PR #81 và đã bật thật trên `prod-exam` ngày 9/11/2026** (nhật ký từng bước ở [khoi-phuc.md mục 4.9](../ops/khoi-phuc.md)) (xem "PR 6c: ghi chú triển khai"); việc bật thật theo [khoi-phuc.md mục 4](../ops/khoi-phuc.md). Sau đó 6d (phần trong ứng dụng) và 6e (hoàn tất); mỗi PR có thiết kế chi tiết riêng nếu còn điểm chưa duyệt.
- Trước Phiên thi thật đầu tiên: sao lưu chạy được (6c), người quản trị thứ hai (chủ dự án hoãn), bản giấy các khóa trong phong bì dán kín.
