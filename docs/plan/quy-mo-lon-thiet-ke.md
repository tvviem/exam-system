# Quy mô lớn: hàng triệu Câu hỏi và hàng triệu tài khoản (thiết kế đề xuất)

**Trạng thái: `accepted`** (chủ dự án duyệt ngày 26/11/2026: Q487 khoảng **500 người thi cùng lúc**, các câu còn lại theo đề xuất, mục 10). Tiến độ: **L1** (#171, số đo ở 6.3) và **L2** (migration `0031`, số đo ở 6.4) xong về mã ngày 26/11/2026; L3 đến L5 chưa làm.

## 1. Yêu cầu và phạm vi

Chủ dự án: tối ưu cho trường hợp **mỗi Người ra đề có hàng triệu Câu hỏi**, và bổ sung trường hợp **nhiều người dùng (1.000.000)**. Cơ sở dữ liệu prod **đã có dữ liệu** nên thay đổi phải an toàn.

"1 triệu người dùng" có hai nghĩa khác hẳn nhau:

| Nghĩa | Là bài toán gì | Trong thiết kế này |
|---|---|---|
| **1.000.000 tài khoản** (đã đăng ký, mỗi lúc chỉ một phần đang dùng) | dữ liệu lớn: truy vấn, chỉ mục | **Có**, mục 4 |
| **1.000.000 người dùng cùng lúc** | kiến trúc nhiều máy | **Không**; mục 5 nêu vì sao |

Ngoài phạm vi: nhập Excel khối lượng lớn, tìm kiếm toàn văn nâng cao, tách cơ sở dữ liệu. Giả định hiện hành ở [architecture.md](../architecture.md) là khoảng 2.000 người dùng.

## 2. Cách đo và kết luận chung

Máy phát triển (cũng là máy chạy prod, lúc không có Phiên thi, ưu tiên thấp), PostgreSQL 17, cơ sở dữ liệu tạm đã xóa sau khi đo, **dữ liệu giả**, một tiến trình api, gọi HTTP thật (p50).

**Dữ liệu prod hiện tại** (đọc ngày 26/11/2026, chỉ đọc): 150 Câu hỏi, 3 Chủ đề, 1 Bộ đề, cơ sở dữ liệu 12 MB; PostgreSQL 17.11, vai trò của ứng dụng đủ quyền tạo chỉ mục. **Đây là lúc rẻ nhất để thay đổi.**

**Điểm yếu chung của cả hai bài toán:** một tiến trình api chỉ có **10 kết nối** cơ sở dữ liệu dùng chung cho mọi việc, và **không có gì ngăn một truy vấn chậm chiếm hết**. Mỗi trang danh sách dùng hai kết nối (đếm và lấy dòng), nên **5 lượt chậm cùng lúc là đủ làm cả hệ thống đứng chờ**, kể cả Người dự thi.

| Tình huống (1.000.000) | Người khác phải chờ |
|---|---|
| 40 lượt tìm Câu hỏi của một Người ra đề; người ra đề khác mở trang | 10,5 giây |
| **5 lượt tìm Người dùng** của Quản trị viên; Người dự thi gọi yêu cầu kiểm tra Phiên đăng nhập | **5,2 giây** |
| 20 lượt tìm Người dùng; như trên | 16 giây |
| 40 lượt tìm Người dùng; như trên | 72 giây |
| Đối chứng 2.000 tài khoản, 40 lượt | 0,13 giây |

Yêu cầu kiểm tra Phiên đăng nhập đi trước **mọi** yêu cầu (gồm lưu câu trả lời), nên bài đang thi bị chậm theo. Một người gõ liên tục vào ô tìm cũng đủ tạo 5 lượt chồng nhau khi mỗi lượt mất 2,5 giây.

## 3. Ngân hàng câu hỏi (1.000.000 Câu hỏi mỗi Người ra đề)

### 3.1. Hiện trạng

| Thao tác | 10.000 | 100.000 | 1.000.000 |
|---|---|---|---|
| Danh sách, trang 1 | 19 ms | 51 ms | 370 ms |
| Tìm kiếm | 17 ms | 90 ms | 370 ms |
| Danh sách Chủ đề kèm số câu | 12 ms | 57 ms | 540 ms |
| Trang cuối | 26 ms | 120 ms | 1,3 s |
| 20 lượt tìm cùng lúc | 72 ms | 1,0 s | 4,8 s |
| Người khác (500 câu) mở trang 1 giữa 40 lượt tìm | 0,12 s | 1,4 s | 10,5 s |
| Lưu Bộ đề 200 câu | 63 ms | 59 ms | 73 ms |

Hộp chọn câu trên trình duyệt (máy tính và điện thoại giả lập): không giật (không đổi kích thước khi sang trang hay tìm, không tác vụ giao diện nào quá 50 ms); chỉ chậm vì chờ api.

Nguyên nhân: không có chỉ mục theo thứ tự "mới nhất"; mỗi yêu cầu **đếm toàn bộ** kết quả, lật trang sâu dùng `OFFSET`; đếm theo Chủ đề và tìm `LIKE '%…%'` quét cả bảng; `exam_items.question_id` không có chỉ mục.

### 3.2. Ba chỉ mục mới (chỉ thêm)

```sql
CREATE INDEX questions_owner_recent_idx   ON questions (owner_id, updated_at, id) WHERE archived_at IS NULL;
CREATE INDEX questions_owner_archived_idx ON questions (owner_id, updated_at, id) WHERE archived_at IS NOT NULL;
CREATE INDEX exam_items_question_idx      ON exam_items (question_id);
```

| Truy vấn (tầng cơ sở dữ liệu) | Hiện tại | Có chỉ mục |
|---|---|---|
| Trang 1 | 336 ms | 0,2 ms |
| Trang 500 | 542 ms | 6 ms |
| Đếm toàn bộ | 212 ms | 90 ms |
| Danh sách câu Lưu trữ | 192 ms | 0,05 ms |
| "Câu đang dùng ở đâu" (20 câu, 300.000 dòng `exam_items`) | 290 ms | 0,6 ms |
| Kiểm khóa ngoại khi xóa một câu | 271 ms | 0,07 ms |
| Thêm 500 câu / sửa 500 câu | 21 / 21 ms | 23 / 19 ms |

Thêm khoảng 57 MB cho mỗi triệu câu.

### 3.3. Sửa truy vấn (phải đi cùng chỉ mục, cùng một PR)

> **Cảnh báo từ phép đo:** chỉ thêm chỉ mục mà không sửa truy vấn thì **tìm kiếm chậm đi 3 đến 4 lần** với từ hiếm hoặc không có (khoảng 270 ms thành 900–1.000 ms), vì PostgreSQL đi dọc chỉ mục "mới nhất" rồi lọc từng dòng.

| Truy vấn | Thay đổi | Đo được |
|---|---|---|
| Danh sách **có từ khóa** | Sắp theo `updated_at + interval '0'` để không đi dọc chỉ mục (thứ tự kết quả giữ nguyên) | tìm 250–340 ms, ngang hiện nay |
| Danh sách **không từ khóa** | Giữ nguyên, tự dùng chỉ mục mới | trang 1 khoảng 14 ms qua api |
| Chủ đề kèm số câu | Đếm một lần theo `owner_id`, nhóm theo Chủ đề, rồi nối với Chủ đề | 540 ms thành khoảng 95–100 ms qua api |

Chỉ mục có ích khi bảng được `VACUUM` định kỳ (autovacuum mặc định); ngay sau đợt ghi lớn, đếm theo Chủ đề tạm chậm hơn.

### 3.4. Chỉ mục tìm kiếm trigram cho Câu hỏi: đề xuất **chưa làm**

| Tìm ở 1.000.000 câu | Không trigram | Có trigram |
|---|---|---|
| Từ rất hiếm, từ không có | 250–280 ms | dưới 1 ms |
| Cụm 3 từ | 250 ms | 70–80 ms |
| Cụm phổ biến (khoảng 7.000 câu khớp) | 295 ms | **520 ms (chậm hơn)** |
| Từ khóa 2 ký tự, không né | 250 ms | **2,3 s (chậm hơn 9 lần)** |
| Thêm 500 câu / sửa 500 câu | 23 / 19 ms | 39–44 / 52–98 ms |
| Dung lượng, thời gian tạo | | 125 MB, 42 s |

Lợi ích không đều, cần đường né cho từ khóa ngắn. **Điều kiện xem lại:** một Người ra đề vượt **200.000** câu, hoặc tìm kiếm trên prod thường xuyên quá 300 ms.

## 4. Người dùng (1.000.000 tài khoản)

Dữ liệu đo: 1.000.000 Người dự thi, 20.000 Lớp, 3.000.000 dòng lịch sử đăng nhập, 1.000.000 dòng nhật ký; cơ sở dữ liệu 1,4 GB (`login_events` 722 MB, `users` 434 MB).

### 4.1. Hiện trạng

| Thao tác | 2.000 | 1.000.000 | Đánh giá |
|---|---|---|---|
| Đăng nhập (lần lượt) | 42 ms | 50 ms | tốt |
| Kiểm tra Phiên đăng nhập, thông báo | 6, 8 ms | 7, 9 ms | tốt |
| 300 người đăng nhập cùng lúc (p95) | 3,4 s | 3,3 s | giới hạn CPU băm mật khẩu, không phụ thuộc số tài khoản |
| Người dùng: trang 1 / trang cuối | 10 / 10 ms | 253 / 935 ms | chậm |
| Người dùng: lọc Nhãn vai trò / Chờ kích hoạt | 12 / 10 ms | 890 / 144 ms | chậm |
| **Người dùng: tìm theo mã / theo tên** | 19 / 21 ms | **2,4 / 3,0 s** | **không đạt** |
| Chi tiết một người | 11 ms | 12 ms | tốt |
| Lịch sử đăng nhập, Nhật ký | 6–9 ms | 67–126 ms | chấp nhận được |
| Gợi ý người khi lập Danh sách dự thi | 14 ms | 870 ms | chậm |
| Thêm cả lớp (xem trước) | 14 ms | 206 ms | chấp nhận được |
| Dán 500 Mã định danh | 17 ms | 520 ms | chậm |
| Một trang Danh sách dự thi 500 người | 21 ms | 26 ms | tốt |

**Đường của Người dự thi (đăng nhập, phiên, thông báo, Danh sách dự thi) gần như không phụ thuộc số tài khoản.** Chậm nằm ở màn Quản trị viên và lúc lập Danh sách; nguy hiểm vì chúng chiếm kết nối chung (mục 2).

### 4.2. Ba chỉ mục và một thống kê (chỉ thêm)

```sql
CREATE INDEX users_created_idx     ON users (created_at, id)     WHERE removed_at IS NULL;
CREATE INDEX users_code_lower_idx  ON users (lower(code))        WHERE removed_at IS NULL;
CREATE INDEX users_class_lower_idx ON users (lower(class_label)) WHERE removed_at IS NULL;
CREATE STATISTICS users_code_lower_stat ON (lower(code)) FROM users;
ANALYZE users;
```

| Truy vấn | Hiện tại | Sau |
|---|---|---|
| Người dùng, trang 1 | 143 ms | 0,08 ms |
| Thêm cả lớp | 173 ms | 0,07 ms |
| Dán 500 mã | 457 ms | 1,3 ms |

**Dòng `CREATE STATISTICS` là bắt buộc:** chỉ có chỉ mục thì PostgreSQL ước lượng sai (tưởng 92 % bảng khớp) và vẫn quét cả bảng (506 ms). Chưa đo chi phí ghi và thời gian tạo của ba chỉ mục này.

Đếm có chặn (mục 6) áp dụng thêm cho danh sách Người dùng, Lịch sử đăng nhập và Nhật ký thao tác. Lịch sử đăng nhập đã tự xóa sau 12 tháng; Nhật ký thao tác chưa có chỉ mục theo thời gian (thêm khi quá vài triệu dòng).

### 4.3. Tìm Người dùng: cột tìm kiếm và chỉ mục trigram

Hiện nay tìm bằng `unaccent(...) ILIKE` trên 5 cột, không chỉ mục nào dùng được. Đề xuất cột `users.search_text` (họ tên, tên đăng nhập, email, Mã định danh, Lớp; bỏ dấu, chữ thường) do **trigger** giữ đồng bộ, kèm chỉ mục `GIN (search_text gin_trgm_ops)`.

| Tìm (tầng cơ sở dữ liệu) | Hiện tại (qua api) | Thử nghiệm |
|---|---|---|
| Mã đầy đủ | 2,4 s | 12 ms |
| Họ tên đầy đủ | 3,0 s | 21 ms |
| Tên phổ biến | | 107 ms |
| Từ khóa 2 ký tự | | **1,2 s** nên yêu cầu **ít nhất 3 ký tự** |

Chi phí: cột mới, trigger, 83 MB; ở 1.000.000 dòng điền dữ liệu mất 86 giây và tạo chỉ mục 16 giây; ở quy mô prod hiện nay là tức thời. Khác với Câu hỏi (3.4), ở đây lợi ích rõ ràng, và làm lúc dữ liệu còn nhỏ thì rẻ. Gợi ý người khi lập Danh sách dự thi (chỉ tìm họ tên và mã) cần một chỉ mục tương tự riêng; **chưa thử**.

## 5. Một triệu người dùng **cùng lúc**: ngoài khả năng hiện tại

| Việc | Đã đo | 1.000.000 cùng lúc cần |
|---|---|---|
| Làm bài đồng thời | 500 người với hai api, đạt ([hieu-nang.md](../hieu-nang.md)) | gấp 2.000 lần |
| Heartbeat mỗi 15 giây | trong bài đo 500 người (khoảng 33 yêu cầu/giây) | khoảng 66.700 yêu cầu/giây |
| Đăng nhập | khoảng 85 lượt/giây mỗi api (300 người trong 3,5 giây) | hơn 3 giờ để mọi người đăng nhập một lượt trên một api |

Chỉ mục không giải quyết được. Cần nhiều máy api, cơ sở dữ liệu có bản đọc và phần ghi chịu tải, Redis cụm, hạ tầng mạng và chỗ đặt máy khác hẳn một máy WSL sau Cloudflare Tunnel (ADR-0006). Đó là dự án kiến trúc riêng (ADR mới, bản `1.x`). Nếu mục tiêu thực tế là vài nghìn người thi cùng lúc thì bước đầu là **đo tải** ở 1.000 và 2.000 người.

**Hai trở ngại vận hành cho 1.000.000 tài khoản, không sửa được bằng mã trong thiết kế này:**

- **Thư kích hoạt:** hạn mức mặc định 300 thư hàng loạt mỗi ngày (Gmail). Kích hoạt 1.000.000 người mất khoảng **9 năm**. Cần dịch vụ gửi thư hàng loạt.
- **Yêu cầu cấp tài khoản:** tối đa 2.000 dòng mỗi file, tức ít nhất 500 file phải gửi và duyệt.

## 6. Thay đổi chung

### 6.1. Số đếm có chặn

Đếm tối đa **10.000** kết quả (đếm trên truy vấn con `LIMIT 10001`: 2–6 ms thay vì 90–900 ms).

- API danh sách thêm cờ `totalCapped`; khi bị chặn, `total = 10000`.
- Giao diện ghi **"hơn 10.000 — hãy lọc hoặc tìm để thu hẹp"**.
- Không lật quá 10.000 kết quả đầu (trang 500 với 20 dòng mỗi trang).
- Dưới 10.000 mọi thứ hiển thị như hiện nay. Số câu theo từng Chủ đề **giữ chính xác**.
- Áp dụng cho: Câu hỏi (cả hộp chọn câu), Người dùng, Lịch sử đăng nhập, Nhật ký thao tác.

### 6.2. Giới hạn truy vấn nặng đồng thời (quan trọng nhất)

- Một mô-đun nhỏ trong `common/` (giao diện một hàm `run(key, job)`) bọc **mọi truy vấn danh sách và tìm kiếm** có thể chậm: Câu hỏi, Người dùng, gợi ý người khi lập Danh sách dự thi, Lịch sử đăng nhập, Nhật ký thao tác.
- Mỗi người tối đa **1** trang đang chạy cho Người dùng và nhật ký, **2** cho Câu hỏi; **tổng tối đa 3** trang đang chạy trên một tiến trình api (mỗi trang tới 2 kết nối, tức tối đa 6), luôn chừa ít nhất 4 kết nối cho đường làm bài.
- Hàng đợi tối đa 20 yêu cầu mỗi người, chờ tối đa 10 giây; quá thì trả mã lỗi sẵn có `SERVER_BUSY` (HTTP 503, "Máy chủ đang bận. Hãy đợi vài giây rồi thử lại."). Giao diện không tự gửi lại khi gặp mã này. *(Bản đề xuất ghi 429; khi làm dùng lại mã đã có cho đợt đăng nhập dồn dập.)*
- Giao diện chờ gõ xong rồi mới tìm và **hủy yêu cầu cũ** khi có yêu cầu mới.

Thử nghiệm (chỉ giới hạn 2 mỗi người cho Câu hỏi, sửa tạm trên bản biên dịch): người khác mở trang **từ 10,6 s còn 87 ms**; người tìm dồn dập tự xếp hàng (20 lượt của họ vẫn mất 4–6 s). **Giới hạn tổng, hàng đợi và đường Người dùng chưa đo**; con số 3 phải được xác nhận bằng bài đo. Phương án thay thế nếu không đạt: một nhóm kết nối riêng cho truy vấn nặng, kèm `statement_timeout`.

### 6.3. Kết quả đo L1 (26/11/2026, mã trong kho)

1.000.000 tài khoản, một tiến trình api; một Người dự thi lưu câu trả lời liên tục (mỗi 250 ms) trong lúc Quản trị viên tìm Người dùng dồn dập. Không tải: lưu câu trả lời p50 20 ms.

| Đợt tìm | Lưu câu trả lời chậm nhất: **không** giới hạn | **có** giới hạn | Lượt tìm khi có giới hạn |
|---|---|---|---|
| 1 Quản trị viên, 1 lượt | 56 ms | 48 ms | 1 xong |
| 1 Quản trị viên, 5 lượt | **5,2 s** | 69 ms | 5 xong |
| 1 Quản trị viên, 20 lượt | **33 s** | 37 ms | 5 xong, 15 báo bận |
| 1 Quản trị viên, 40 lượt | **73 s** | 44 ms | 4 xong, 36 báo bận |
| 5 Quản trị viên, mỗi người 1 lượt | **5,2 s** | 58 ms | 5 xong |
| 5 Quản trị viên, mỗi người 8 lượt | **74 s** | 45 ms | 6 xong, 34 báo bận |

Đạt ngưỡng "lưu câu trả lời dưới 100 ms giữa đợt tìm dồn dập", nên giữ con số tổng 3. Lượt tìm vẫn mất khoảng 2,4 giây mỗi lượt và xếp hàng (chờ L2, L4). Số lượt "báo bận" ở đây là do bài đo gửi nhiều lượt cùng lúc và không hủy lượt cũ; trên giao diện, lượt cũ bị hủy khi người dùng gõ tiếp. Phép đo mới có **một** Người dự thi; phòng thi 500 người đồng thời với tìm dồn dập chưa đo.

### 6.4. Kết quả đo L2 (26/11/2026, mã trong kho)

Cùng một bộ dữ liệu, đo qua api trước và sau (p50), gồm cả các bộ lọc hiếm.

| 1.000.000 Câu hỏi của một người | Trước | Sau |
|---|---|---|
| Chủ đề kèm số câu | 597 ms | 178 ms |
| Trang 1 / trang giữa | 430 / 1.012 ms | 96 / 569 ms |
| Danh sách Lưu trữ | 291 ms | 12 ms |
| Lọc Loại phổ biến | 383 ms | 216 ms |
| Lọc Loại hiếm, tag, Chủ đề | 8–311 ms | 10–284 ms (không đổi) |
| Tìm kiếm (phổ biến, hiếm, không có) | 357–415 ms | 362–419 ms (không đổi) |

| 1.000.000 tài khoản | Trước | Sau |
|---|---|---|
| Người dùng: trang 1 / trang cuối | 274 / 952 ms | 48 / 360 ms |
| Lọc Nhãn Người dự thi | 1.060 ms | 368 ms |
| Dán 500 mã / thêm cả lớp | 507 / 222 ms | 24 / 16 ms |
| Khóa, Đã Xóa, Chờ kích hoạt, Email chưa xác thực, Thư lỗi | 8–154 ms | 11–138 ms |
| Tìm Người dùng | 2,7–3,3 s | không đổi (chờ L4) |

- Lần đo đầu, bộ lọc **Email chưa xác thực** chậm đi (141 thành 355 ms) vì PostgreSQL ước lượng sai và đi dọc chỉ mục mới; đã sửa bằng cách sắp theo biểu thức cho bộ lọc này và cho truy vấn có từ khóa (cùng cách ở 3.3).
- Phần còn lại của trang 1 Câu hỏi (96 ms) và của trang Người dùng là **đếm toàn bộ** (L3).
- Migration chạy 1,3 giây ở 1.000.000 Câu hỏi và 5,2 giây ở 1.000.000 tài khoản (chặn ghi trong lúc đó); ở dữ liệu prod hiện nay là vài mili giây.
- Cùng mã L1: người ra đề khác mở trang giữa 5, 20, 40 lượt tìm Câu hỏi dồn dập chờ 22–64 ms (trước L1: tới 10,5 giây).

## 7. Triển khai trên prod đang có dữ liệu

1. Dùng đường deploy hiện có: **sao lưu trước deploy** (`pg_dump`), chạy migration, rồi thay api. Không bước làm tay, không biến môi trường mới.
2. Migration chạy trong một giao dịch nên dùng `CREATE INDEX` thường; lệnh này **chặn ghi** (không chặn đọc) trong lúc tạo: ở quy mô hiện nay là vài mili giây; ba chỉ mục Câu hỏi ở 1.000.000 dòng tổng khoảng 2 giây. Không cần `CONCURRENTLY`.
3. Chỉ thêm (chỉ mục, thống kê, một cột có trigger): không đổi và không xóa dữ liệu. Điền `search_text` cho dữ liệu cũ ngay trong migration.
4. Deploy ngoài giờ thi.
5. **Lùi bản:** bản cũ chạy được trên cơ sở dữ liệu mới. Nếu lùi khi ngân hàng đã lớn, tìm Câu hỏi của bản cũ sẽ chậm như cảnh báo ở 3.3; xử lý bằng `DROP INDEX questions_owner_recent_idx;`.
6. Sau deploy: `prod-status`, `prod-preflight`, kiểm chỉ mục có và hợp lệ, mở Ngân hàng câu hỏi, hộp chọn câu, trang Người dùng.

Cơ sở dữ liệu lớn còn kéo dài sao lưu và khôi phục; **chưa đo** ở quy mô này.

## 8. Kiểm thử và ngưỡng nghiệm thu

| Mối nối (seam) | Bắt được | Bỏ sót |
|---|---|---|
| Integration các API danh sách | đếm chặn và cờ; giới hạn trang; thứ tự và kết quả tìm không đổi; tìm không dấu; từ khóa ngắn; quyền xem | tốc độ |
| Integration `GET /topics` | số câu theo Chủ đề đúng, kể cả câu Lưu trữ, Chủ đề trống; không thấy dữ liệu người khác | tốc độ |
| Integration trigger `search_text` | đồng bộ khi tạo, sửa, duyệt Yêu cầu, đổi email | |
| Đơn vị mô-đun giới hạn đồng thời | giới hạn mỗi người và tổng; thả chỗ khi lỗi; hàng đợi đầy, quá hạn | hành vi dưới tải thật |
| E2E desktop và mobile | nhãn "hơn 10.000" (dữ liệu gieo thẳng vào cơ sở dữ liệu) | |
| Bài đo `quy-mo-bench.int.test.ts` (đặt `QUY_MO_BENCH=1`, không chạy CI) | các ngưỡng dưới, gồm đường làm bài (lưu câu trả lời) giữa đợt tìm dồn dập | phần cứng khác máy đo |

Ngưỡng ở 1.000.000, một tiến trình api, máy phát triển:

| Thao tác | Hiện tại | Ngưỡng |
|---|---|---|
| Câu hỏi: trang 1, lọc | 20–370 ms | dưới 100 ms |
| Chủ đề kèm số câu | 540 ms | dưới 200 ms |
| Tìm Câu hỏi | 370 ms | dưới 500 ms |
| Người dùng: danh sách, lọc | 144–890 ms | dưới 200 ms |
| Tìm Người dùng | 2,4–3,0 s | dưới 500 ms |
| Dán 500 mã; thêm cả lớp | 520; 206 ms | dưới 200 ms |
| Người khác mở trang giữa đợt tìm dồn dập | 5–72 s | **dưới 300 ms** |
| Người dự thi lưu câu trả lời giữa đợt tìm dồn dập | chưa đo | **dưới 100 ms (p99)** |

Giới hạn của các số đo: dữ liệu giả phân bố đều; máy đo cũng chạy prod; phần sửa truy vấn, đếm chặn, giới hạn đồng thời, cột tìm kiếm được thử bằng bản tạm, **không phải mã sẽ đưa vào kho**; chưa đo nhiều tiến trình api, nhiều người dùng nặng cùng lúc, hàng nghìn Chủ đề, nhập Excel liên tục.

## 9. Lát cắt

| Lát | Nội dung | Ghi chú |
|---|---|---|
| L1 | Giới hạn truy vấn nặng đồng thời (6.2) | **làm trước**: bảo vệ bài thi, không đổi dữ liệu |
| L2 | Migration chỉ mục và thống kê (3.2, 4.2) + sửa truy vấn (3.3) | một PR, không đổi giao diện |
| L3 | Số đếm có chặn và giao diện (6.1) | đổi hành vi người dùng thấy |
| L4 | Cột tìm kiếm Người dùng và trigram (4.3) | cột mới, trigger |
| L5 | Bài đo trong kho; cập nhật `data-model.md`, `architecture.md`, `hieu-nang.md` | |

Phát hành: có migration và đổi hành vi nên là **MINOR** (`0.6.0`).

## 10. Quyết định của chủ dự án (Q480–Q489, chốt 26/11/2026)

| Câu | Câu hỏi | Quyết định |
|---|---|---|
| **Q480** mục tiêu | 1.000.000 Câu hỏi mỗi Người ra đề và 1.000.000 tài khoản, ngưỡng ở mục 8 | **Đồng ý** |
| **Q481** số đếm | Hiện "hơn 10.000", không lật quá 10.000 kết quả đầu | **Đồng ý** |
| **Q482** giới hạn đồng thời | 2 trang mỗi người cho Câu hỏi, 1 cho Người dùng và nhật ký; tổng 3; hàng đợi 20; chờ 10 giây rồi báo bận | **Đồng ý** |
| **Q483** trigram Câu hỏi | Chưa làm, xem lại khi có người vượt 200.000 câu | **Đồng ý** (tìm ở 1.000.000 câu vẫn 250–400 ms) |
| **Q484** tạo chỉ mục | `CREATE INDEX` thường trong migration khi deploy | **Đồng ý** |
| **Q485** bài đo | Đưa vào kho, chạy tay bằng cờ, không chạy CI | **Đồng ý** |
| **Q486** phát hành | Thứ tự L1 đến L5, chung `0.6.0` | **Đồng ý** |
| **Q487** đồng thời | Số người thi cùng lúc cần đáp ứng | **Khoảng 500** (mức đã đo tải với hai api; hơn nữa phải đo riêng trước) |
| **Q488** tìm Người dùng | Cột tìm kiếm và trigram ngay, tìm từ 3 ký tự | **Đồng ý** |
| **Q489** thư | Dịch vụ gửi thư cho quy mô lớn để ngoài thiết kế này | **Đồng ý** |
