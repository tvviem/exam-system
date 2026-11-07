# Hiệu năng và sức tải

Tài liệu này giới thiệu hệ thống chạy nhanh đến đâu và chịu được bao nhiêu người, bằng số đo thật. Nguyên tắc của dự án: **phản hồi tức thời**. Chờ quá 2–3 giây là đã chậm; mục tiêu là cỡ mili giây; thao tác nào quá khoảng 300 ms là đáng xem lại, quá 1 giây là lỗi. Ngân sách chi tiết và mọi số đo gốc nằm ở [architecture.md](architecture.md), mục 11.

Mọi số dưới đây đo trên máy phát triển (WSL2, ưu tiên thấp `nice -n 19`), cổng HTTP và WebSocket thật, PostgreSQL và Redis thật, api chạy chế độ production; phòng thi là người dự thi giả do `pnpm -C apps/api load:exam` tạo. Chưa gồm đường truyền mạng của phòng học.

## Người dự thi cảm nhận gì

| Việc | Thời gian đo được | Ngưỡng của dự án |
|---|---|---|
| Vào thi, bắt đầu làm bài, mở đề (100 người) | 15 ms, 32 ms, 15 ms (p50) | dưới 1 giây |
| Bài tự lưu mỗi lần chọn đáp án | p50 17 ms, p99 31 ms | dưới 100 ms |
| Người ra đề Cộng giờ, Buộc nộp, Thu hồi: màn hình người dự thi đổi (trình duyệt thật) | 170–550 ms | dưới 1 giây |
| Nộp bài | p50 13 ms | dưới 1 giây |
| Mở "Kết quả của tôi" sau khi Công bố (vào rải theo thời gian) | p99 28 ms | dưới 300 ms |
| Gửi Phúc khảo | khoảng 170 ms (trình duyệt thật) | dưới 1 giây |

## Người ra đề cảm nhận gì

| Việc | Thời gian đo được | Ngưỡng |
|---|---|---|
| Màn Theo dõi cập nhật khi người dự thi lưu bài | 1,4–2,5 giây (gồm cửa sổ gộp tối đa 2 giây để khỏi giật) | dưới 3 giây |
| Cộng giờ cả phòng 100 người | 37 ms | dưới 300 ms |
| **Chấm tự động cả phòng sau Buộc nộp** (90 Lượt, 3.600 câu trả lời) | **442 ms** | dưới 10 giây |
| Chấm một bài tự luận (lưu điểm) | p99 42 ms | dưới 150 ms |
| Mở bảng Kết quả, Thống kê câu | 39 ms, 24 ms | dưới 500 ms |
| Công bố kết quả | 48 ms | dưới 1 giây |
| Xuất Excel Kết quả | 100 ms | dưới 1 giây |
| Xử lý một Phúc khảo | p99 36 ms | dưới 300 ms |
| Đính chính đáp án: xem trước, xác nhận | 41 ms, 37 ms | dưới 1 giây, 300 ms |
| Đính chính đáp án: chấm lại cả phòng 100 Lượt (ở nền) | 265 ms | dưới 10 giây |

Với dữ liệu lớn hơn: đo trong bộ test tích hợp với 500 Lượt đã chấm (bảng Kết quả 48 ms, Công bố 98 ms, Excel 145 ms), và chấm lại 5.000 Lượt sau Đính chính mất 1,7 giây. Cơ sở dữ liệu đã được kiểm với 100.000 Lượt và 5 triệu dòng điểm: mọi truy vấn của Phúc khảo và Đính chính chạy trong 0,03–68 ms, không phụ thuộc kích thước bảng.

## Sức tải

| Cỡ phòng thi | Cấu hình | Kết quả đo |
|---|---|---|
| 100 người, cả quy trình từ vào thi đến Đính chính | một api, một worker | **Đạt mọi ngưỡng, 0 lỗi** (bảng trên) |
| 500 người, giai đoạn làm bài (Cộng giờ cả phòng, ngắt rồi nối lại đồng loạt 500 kết nối) | hai api | Đạt mọi ngưỡng, 0 lỗi; nối lại 500 kết nối trong 1,3 giây |
| 500 người, giai đoạn làm bài | **một** api | Không đạt: một tiến trình Node chạy đầy một lõi quanh lúc Cộng giờ cả phòng (heartbeat p99 1,1 giây) |
| 500 người, sau giờ thi (chấm, Công bố, Phúc khảo, Đính chính) | hai api | Xem mục "Bản 500 người sau giờ thi" ở cuối |

**Khuyến nghị:** phòng thi từ khoảng **300 người** trở lên chạy **hai bản api** cùng một PostgreSQL và Redis (tin đẩy đi qua Redis nên đúng ở mọi bản). Dưới 300 người một bản api dư sức.

### Điểm cần biết khi đọc số

- **Cùng một khoảnh khắc khác với rải đều.** 100 người bấm mở Kết quả *trong cùng một lúc* khiến yêu cầu chậm nhất mất 0,9 giây (p50 0,7 giây), vì một tiến trình xử lý lần lượt khoảng 7 ms CPU mỗi yêu cầu. Khi người dự thi nhận thông báo và mở rải rác (trường hợp thường) thì mỗi yêu cầu chỉ 20–30 ms. Ở 500 người cùng bấm một lúc, một bản api sẽ vượt 1 giây; hai bản chia đôi.
- **Việc nặng chạy ở nền.** Chấm tự động và chấm lại sau Đính chính do worker làm theo lô; yêu cầu Nộp bài chỉ xếp hàng một job rồi trả lời ngay (không chờ chấm).
- **Đáp án chỉ ở server**, nên server tính điểm mọi lúc; trình duyệt chỉ hiển thị, nên không có việc nặng nào đổ về điện thoại.

## Đo lại trên máy của bạn

```bash
pnpm -C apps/api build
LOAD_USERS=100 nice -n 19 pnpm -C apps/api load:exam                          # khoảng 4 phút
LOAD_API_INSTANCES=2 LOAD_USERS=500 nice -n 19 pnpm -C apps/api load:exam     # khoảng 7 phút, hai api
```

Script tạo cơ sở dữ liệu tạm `exam_load_tmp`, chạy api và worker đã build, mô phỏng người dự thi và Người ra đề qua API thật, in bảng p50/p95/p99 và thoát mã 1 nếu vượt ngưỡng. Không chạy trong CI. Chạy 500 người khi máy không phải phục vụ việc khác.

## Bản 500 người sau giờ thi

*Chưa đo (chờ chạy khi máy rảnh).*
