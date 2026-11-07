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

```bash
pnpm -C apps/api build
LOAD_USERS=100 nice -n 19 pnpm -C apps/api load:exam                          # khoảng 4 phút
LOAD_API_INSTANCES=2 LOAD_USERS=500 nice -n 19 pnpm -C apps/api load:exam     # khoảng 7 phút, hai api
```

Script tạo cơ sở dữ liệu tạm `exam_load_tmp`, chạy api và worker đã build, mô phỏng người dự thi và Người ra đề qua API thật, in bảng p50/p95/p99 và thoát mã 1 nếu vượt ngưỡng. Không chạy trong CI. Chạy 500 người khi máy không phải phục vụ việc khác.
