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

## Câu hỏi còn mở

- Phần deploy của lát cắt 6: pipeline, `prod-bootstrap`, hai bản api cho phòng từ 300 người.
