# Hiệu năng và sức tải

Tài liệu này giới thiệu hệ thống chạy nhanh đến đâu và chịu được bao nhiêu người, bằng số đo thật. Nguyên tắc của dự án: **phản hồi tức thời**. Chờ quá 2–3 giây là đã chậm; mục tiêu là cỡ mili giây; thao tác nào quá khoảng 300 ms là đáng xem lại, quá 1 giây là lỗi. Ngân sách chi tiết và mọi số đo gốc nằm ở [architecture.md](architecture.md), mục 11.

Mọi số dưới đây đo trên máy phát triển (WSL2, ưu tiên thấp `nice -n 19`), cổng HTTP và WebSocket thật, PostgreSQL và Redis thật, api chạy chế độ production; phòng thi là người dự thi giả do `pnpm -C apps/api load:exam` tạo. Chưa gồm đường truyền mạng của phòng học. Hai cột số: **100 người** (một api, một worker) và **500 người** (hai api, một worker).

## Người dự thi cảm nhận gì

| Việc | 100 người | 500 người | Ngưỡng của dự án |
|---|---|---|---|
| Vào thi, bắt đầu làm bài, mở đề (p50) | 15, 32, 15 ms | 16, 37, 17 ms | dưới 1 giây |
| Bài tự lưu mỗi lần chọn Phương án (p99) | 31 ms | 86 ms | dưới 100 ms |
| Nộp bài (p50) | 13 ms | 14 ms | dưới 1 giây |
| Người ra đề Cộng giờ cả phòng: Người dự thi nhận tin đẩy (p99) | 46 ms | 191 ms | dưới 1 giây |
| Cộng giờ cả phòng: màn hình người dự thi đổi (trình duyệt thật, 1 người) | 360–550 ms | | dưới 1 giây |
| Mở "Kết quả của tôi" sau Công bố, vào rải theo thời gian (p99) | 28 ms | 26 ms | dưới 300 ms |
| Gửi Phúc khảo (trình duyệt thật) | khoảng 170 ms | | dưới 1 giây |

## Người ra đề cảm nhận gì

| Việc | 100 người | 500 người | Ngưỡng |
|---|---|---|---|
| Màn Theo dõi cập nhật khi người dự thi lưu bài (trình duyệt thật) | 1,4–2,5 giây (gồm cửa sổ gộp tối đa 2 giây để khỏi giật) | | dưới 3 giây |
| Cộng giờ cả phòng | 37 ms | 150 ms | dưới 300 ms |
| **Chấm tự động sau Buộc nộp cả phòng** (đo 90 % Lượt bị Buộc nộp cùng lúc; 10 % người làm muộn chấm riêng sau 0,2–0,8 giây) | **442 ms** (90 Lượt, 3.600 dòng điểm) | **2,2 giây** (450 Lượt, 18.000 dòng điểm) | dưới 10 giây cho 500 Lượt |
| Chấm một bài tự luận, lần lượt (p99) | 42 ms | 22 ms | dưới 150 ms |
| Mở một bài tự luận để chấm (p99) | 54 ms | 115 ms | dưới 300 ms |
| Mở bảng Kết quả, Thống kê câu | 39 ms, 24 ms | 112 ms, 85 ms | dưới 500 ms |
| Công bố kết quả | 48 ms | 137 ms | dưới 1 giây |
| Xuất Excel Kết quả | 100 ms (23 KB) | 300 ms (83 KB) | dưới 1 giây |
| Xử lý một Phúc khảo (p99) | 36 ms | 31 ms | dưới 300 ms |
| Đính chính đáp án: xem trước, xác nhận | 41 ms, 37 ms | 123 ms, 18 ms | dưới 1 giây, 300 ms |
| Đính chính đáp án: chấm lại cả phòng ở nền | 265 ms (100 Lượt) | 571 ms (500 Lượt) | dưới 10 giây |
| Chấm tay trọn 2.000 bài (4 câu × 500 người, 8 luồng) | | 21,5 giây | |

Với dữ liệu lớn hơn (đo ở PR 5d, bộ test tích hợp và bản đo riêng, không nằm trong bài đo tải ở trên): chấm lại 5.000 Lượt sau Đính chính mất 1,7 giây; cơ sở dữ liệu được kiểm với 100.000 Lượt và 5 triệu dòng điểm, mọi truy vấn của Phúc khảo và Đính chính chạy trong 0,03–68 ms, không phụ thuộc kích thước bảng. Chấm tự động một Lượt tốn 0,7 ms (đo ở PR 5a; ngân sách 20 ms).

## Sức tải

| Cỡ phòng thi | Cấu hình | Kết quả đo |
|---|---|---|
| 100 người, cả quy trình từ vào thi đến Đính chính | một api, một worker | **Đạt mọi ngưỡng, 0 lỗi** |
| 500 người, cả quy trình | hai api, một worker | **Đạt mọi ngưỡng, 0 lỗi, trừ một tình huống cực đoan** (500 người mở Kết quả trong cùng một khoảnh khắc: p99 2,6 giây, xem dưới). Nối lại đồng loạt 500 kết nối Socket.IO trong 1,2 giây. CPU trung bình 68 %, đỉnh 285 % của một lõi (cả hai api và worker), RAM đỉnh 1,2 GB |
| 500 người, giai đoạn làm bài | **một** api | Không đạt: một tiến trình Node chạy đầy một lõi quanh lúc Cộng giờ cả phòng (heartbeat p99 1,1 giây) |

**Khuyến nghị:** phòng thi từ khoảng **300 người** trở lên chạy **hai bản api** cùng một PostgreSQL và Redis (tin đẩy đi qua Redis nên đúng ở mọi bản). Dưới 300 người một bản api dư sức.

### Điểm cần biết khi đọc số

- **Cùng một khoảnh khắc khác với rải đều.** Mở "Kết quả của tôi" tốn khoảng 7 ms CPU mỗi yêu cầu, nên hai bản api xử lý được khoảng 190–200 yêu cầu mỗi giây. 100 người bấm cùng lúc: p99 0,9 giây (một api). **500 người bấm trong cùng một khoảnh khắc: p50 2,0 giây, p99 2,6 giây** (hai api), vì các yêu cầu xếp hàng chờ nhau; người cuối hàng chờ khoảng 500 ÷ 195 giây. Khi người dự thi mở rải rác (trường hợp thường) thì mỗi yêu cầu chỉ 20–30 ms. Bài đo cố ý giữ tình huống cực đoan này là điều kiện chưa đạt (ngưỡng 1 giây); cải thiện được bằng bản api thứ ba hoặc bằng bộ nhớ đệm cho Kết quả nếu thực tế cần.
- **Sửa nhờ đo tải.** Hai điểm chậm do bài đo tìm ra đã sửa: lưu điểm một bài nạp điểm cả Phiên thi mỗi lần (p50 85 ms ở 500 người, giờ p50 19 ms; chấm tay 2.000 bài từ 165 giây còn 21,5 giây), và gửi Phúc khảo cùng lúc làm api treo kết nối (xem [slice-5.md](plan/slice-5.md) mục "PR 5e").
- **Việc nặng chạy ở nền.** Chấm tự động và chấm lại sau Đính chính do worker làm theo lô; yêu cầu Nộp bài chỉ xếp hàng một job rồi trả lời ngay (không chờ chấm).
- **Đáp án chỉ ở server**, nên server tính điểm mọi lúc; trình duyệt chỉ hiển thị, nên không có việc nặng nào đổ về điện thoại.

## Đo lại trên máy của bạn

> **Trạng thái đo:** bài đo **500 người với hai api đã được chạy lại ngày 10/11/2026 trên chính máy chạy thật** (hai lần, kết quả ở mục "Đo lại 10/11/2026 trên máy chạy thật" bên dưới). Bài đo 100 người chưa chạy lại. Các số ở bảng "Sức tải" phía trên là số đo gốc trên máy phát triển.

```bash
pnpm -C apps/api build
LOAD_USERS=100 nice -n 19 pnpm -C apps/api load:exam                          # khoảng 4 phút
LOAD_API_INSTANCES=2 LOAD_USERS=500 nice -n 19 pnpm -C apps/api load:exam     # khoảng 7 phút, hai api
```

Script tạo cơ sở dữ liệu tạm `exam_load_tmp`, chạy api và worker đã build, mô phỏng người dự thi và Người ra đề qua API thật, in bảng p50/p95/p99 và thoát mã 1 nếu vượt ngưỡng. Không chạy trong CI. Chạy 500 người khi máy không phải phục vụ việc khác.

## Đo lại 10/11/2026 trên máy chạy thật (500 người, hai api)

Làm theo Q368 của [slice-6.md](plan/slice-6.md) (chủ dự án chạy bài 500 người khi máy rảnh). Ghi lại để làm cơ sở so sánh các lần đo sau.

### Cách đo

```bash
pnpm -C apps/api build
make -C infra dev-up                                        # PostgreSQL và Redis của dev-exam (127.0.0.1:5434, :6381)
LOAD_API_INSTANCES=2 LOAD_USERS=500 nice -n 19 pnpm -C apps/api load:exam    # khoảng 5 phút mỗi lần
```

Script `apps/api/scripts/load-exam.cjs` (cộng `load-grading.cjs`) tạo cơ sở dữ liệu tạm `exam_load_tmp` (xóa sau khi đo), chạy **hai bản api đã build** ở cổng 3101 và 3102 cùng một worker, một Redis và một PostgreSQL; 500 Người dự thi giả chia đều cho hai bản api. Trình tự một lần đo:

1. 500 người **vào rải trong 60 giây**: đăng nhập, vào thi, bắt đầu Lượt, nối Socket.IO.
2. **Làm bài 180 giây**: mỗi người lưu bài và gửi heartbeat mỗi 15 giây; 3 Người ra đề xem màn Theo dõi (nhận tin đẩy, hỏi lại an toàn mỗi 10 giây).
3. Giữa chừng: một lần **Cộng giờ cả phòng** (đo tin đẩy tới 500 người) và một đợt **ngắt rồi nối lại đồng loạt toàn bộ 500 kết nối Socket.IO**.
4. **Sau giờ thi:** Buộc nộp 450 Lượt cùng lúc (50 người còn làm muộn), chấm tự động; chấm tay 4 câu Tự luận × 500 bài bằng 8 luồng; Công bố; xuất Excel; **500 người cùng mở Kết quả trong một khoảnh khắc** (`myResultSpike`); 50 Phúc khảo gửi và xử lý; Đính chính đáp án chấm lại 500 Lượt.
5. In bảng p50/p95/p99 cho từng thao tác; **thoát mã 1 nếu bất kỳ ngưỡng nào bị vượt**, nên chữ "KHÔNG ĐẠT" ở cuối **không có nghĩa là có lỗi**: dòng "Lỗi: 0" mới là số yêu cầu thất bại.

**Điều kiện đo:** AMD Ryzen 7 PRO 4750U (8 lõi, 16 luồng), RAM 15,6 GB, WSL 3.0.5.0, kernel 6.18.58.1, Node 24.13.0; **cắm sạc, pin 100 %, gói nguồn "Balanced"**; chạy với `nice -n 19`; lúc đó `prod-exam` và `drill-exam` đang chạy **rảnh** (CPU gần 0), không có Phiên thi, tải trung bình của máy 0,5; chủ dự án báo máy rảnh. **Không đo:** đường truyền mạng thật (không qua Cloudflare, không qua nginx của pod, người dự thi giả nối thẳng vào cổng api), trình duyệt thật (không có dựng giao diện).

### Kết quả (hai lần chạy liên tiếp)

| Chỉ số | Số đo gốc (máy phát triển) | Lần 1 (15:29) | Lần 2 (15:36) |
|---|---|---|---|
| Yêu cầu lỗi | 0 | **0** | **0** |
| CPU api và worker: trung bình / đỉnh (của 1 lõi) | 68 % / 285 % | 66 % / 263 % | 69 % / 311 % |
| RAM đỉnh | 1,2 GB | 1.263 MB | 1.206 MB |
| Nối lại đồng loạt 500 kết nối Socket.IO | 1,2 giây | 1.057 ms | 1.193 ms |
| Tin Cộng giờ đến 500 người (`visible`) p99 (ngưỡng 3 giây) | | 2.134 ms | 2.176 ms |
| `nudge` p99 (ngưỡng 1 giây) | | 150 ms | 139 ms |
| Chấm tự động 450 Lượt sau Buộc nộp (ngưỡng 10 giây) | | 2.158 ms | 2.129 ms |
| Chấm tay 2.000 bài Tự luận | 21,5 giây | 21,8 giây | 22,2 giây |
| Đính chính chấm lại 500 Lượt (ngưỡng 10 giây) | 571 ms | 578 ms | 577 ms |
| `myResultSpike` (500 người mở Kết quả cùng lúc) p50 / p99 (ngưỡng p99 1 giây) | 2,0 s / 2,6 s | 1.853 / 2.269 ms | 1.834 / 2.408 ms |

Thao tác thường ngày (p99, ngưỡng của dự án), lần 1 và lần 2:

| Thao tác | Lần 1 | Lần 2 | Ngưỡng |
|---|---|---|---|
| đăng nhập | 70 ms | 85 ms | |
| bắt đầu Lượt (`start`) | 56 ms | 79 ms | 1.000 ms |
| xem đề (`view`) | 27 ms | 42 ms | 500 ms |
| lưu bài (`save`) | **73 ms** | **145 ms** | 100 ms |
| heartbeat | **73 ms** | **129 ms** | 100 ms |
| burst (nhiều người cùng lưu) | 197 ms | **338 ms** | 300 ms |
| lưu bài của người làm muộn lúc đang chấm (`saveBusy`) | **309 ms** | 212 ms | 300 ms |

**Ngưỡng bị vượt:** lần 1: `saveBusy` p99 309 ms (ngưỡng 300, hơn 9 ms) và `myResultSpike`. Lần 2: `save` p99 145 ms, `heartbeat` p99 129 ms, `burst` p99 338 ms, một yêu cầu Theo dõi mất 1.059 ms (ngưỡng 1 giây), và `myResultSpike`. Số đo gốc chỉ vượt `myResultSpike`.

### Cách đọc kết quả

1. **Chức năng và độ tin cậy tốt:** 0 lỗi ở cả hai lần; 500 kết nối nối lại trong khoảng 1,1 giây; chấm, Đính chính, Phúc khảo đều đúng và nhanh (giống số gốc); RAM và CPU tương đương số gốc. Hai bản api chia việc đúng, tin đẩy đến đủ 500 người.
2. **Phần đuôi (p99) dao động giữa các lần chạy và có lúc vượt ngưỡng nội bộ**, chủ yếu ở các **khoảnh khắc cực đoan chủ ý**. Hai lần cho cùng một dấu vết: yêu cầu chậm hơn 500 ms dồn vào đúng ba nhóm giây: lúc **nối lại đồng loạt 500 kết nối** (giây 158 đến 159: 66 đến 80 yêu cầu) và lúc **500 người mở Kết quả cùng một khoảnh khắc** (giây 306 đến 308: 400 đến 440 yêu cầu); phần còn lại của bài thì p50 chỉ 9 đến 36 ms. Mức dao động giữa hai lần là đáng kể (`save` p99 73 ms rồi 145 ms; `burst` 197 ms rồi 338 ms), nghĩa là **một lần đo không đủ để kết luận "đạt" hay "không đạt" ở sát ngưỡng**.
3. **`myResultSpike` vẫn là điểm yếu đã biết**, không đổi: 500 yêu cầu xếp hàng chờ nhau (khoảng 7 ms CPU mỗi yêu cầu, hai bản api xử lý khoảng 190 đến 200 yêu cầu mỗi giây), nên người cuối hàng chờ khoảng 2 giây. Người dự thi thật mở rải rác thì mỗi yêu cầu chỉ 20 đến 30 ms (`myResult` p99 31 ms trong bài này).
4. **Chưa biết nguyên nhân của dao động giữa hai lần**, nên đây chỉ là các giả thuyết chưa kiểm: nhiễu nền của Windows hoặc WSL (WSL vừa tự cập nhật sáng 10/11), gói nguồn "Balanced" của Windows, hoặc khác biệt so với điều kiện lúc đo gốc. Chưa có bằng chứng thiên về giả thuyết nào.
5. **Với quy mô hiện tại (dưới 100 người, một api)** kết quả này không đụng tới: bài 100 người một api đã đạt mọi ngưỡng ở số đo gốc (chưa chạy lại hôm nay). Kết quả này chỉ liên quan khi dùng phòng từ khoảng 300 người trở lên và hai bản api.

### Nên làm tiếp (nếu muốn chắc hơn)

- Lặp lại 3 đến 5 lần và lấy trung vị, nhất là sát ngưỡng; thử với gói nguồn "Hiệu năng cao" và khi Windows rảnh, để tách nhiễu nền khỏi giới hạn thật của hệ thống.
- Chạy lại bài **100 người một api** trên máy chạy thật để có cơ sở cho quy mô thật của bản MVP: `LOAD_USERS=100 nice -n 19 pnpm -C apps/api load:exam` (khoảng 4 phút).
- Chưa kiểm: **Socket.IO qua hai bản api bằng trình duyệt thật** và qua Cloudflare Tunnel; đường truyền mạng thật của phòng học. Bài `make -C infra scale-drill-test` chỉ kiểm chức năng (nginx chia yêu cầu, kênh Redis có đủ hai bên nghe).

