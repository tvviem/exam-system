# Dữ liệu demo

Ba file Excel để dựng nhanh một bộ dữ liệu thử sau khi reset database. Tất cả đi qua đúng chức năng nhập Excel của hệ thống, nên làm theo kịch bản dưới đây cũng là thử luôn các lát cắt 1 đến 3.

| File | Nội dung | Tải lên ở đâu |
|---|---|---|
| `cau-hoi-tin-hoc-can-ban.xlsx` | 20 Câu hỏi (5 Chọn một, 5 Chọn nhiều, 5 Chùm đúng sai, 5 Tự luận), tổng 22,5 điểm | Ngân hàng câu hỏi → **Nhập từ Excel**, vào Chủ đề *Tin học căn bản* |
| `cau-hoi-kien-truc-phan-mem.xlsx` | 20 Câu hỏi như trên, tổng 23 điểm | Như trên, vào Chủ đề *Thiết kế kiến trúc hệ thống phần mềm* |
| `danh-sach-nguoi-du-thi.xlsx` | 5 Người dự thi, lớp `CNTT-K26`, Mã định danh `SV26001` đến `SV26005` | Yêu cầu cấp tài khoản → **Gửi yêu cầu** |

Mỗi sheet câu hỏi dùng đủ các tính năng chấm: Quy tắc chấm Tỷ lệ, Đúng hết, Bậc thang; điểm từ 0,5 đến 2,5; Hướng dẫn chấm ở Tự luận; mỗi câu có 2 tag. Đáp án nằm trong file nên chỉ Người ra đề thấy; Người dự thi không bao giờ thấy.

## Kịch bản (khoảng 15 phút)

Làm sau `make -C infra dev-up`, `pnpm db:migrate`, `bootstrap-admin` và khi `pnpm dev` cùng worker (`pnpm -C apps/api dev:worker`) đang chạy. **Phải có worker**, nếu không việc đọc file Excel đứng ở "Đang đọc file".

**A. Quản trị viên (cửa sổ chính, tài khoản `quantri`)**
1. Mục **Đơn vị** → thêm `CNTT`, *Khoa Công nghệ thông tin*.
2. Mục **Lời mời** → **Mời Người ra đề**: họ tên tùy ý, email `giang.vien@example.edu.vn`, Đơn vị `CNTT`. Sao chép link.

**B. Người ra đề (cửa sổ ẩn danh)**
3. Dán link, đặt mật khẩu, vào hệ thống.
4. **Yêu cầu cấp tài khoản** → chọn `danh-sach-nguoi-du-thi.xlsx` → **Gửi yêu cầu**. Đợi trang chuyển sang "Chờ duyệt"; cả 5 dòng là **Người mới**.

**C. Quản trị viên: duyệt**
5. Chuông thông báo → mở yêu cầu → **Duyệt các dòng hợp lệ (5)**. Tải **Phiếu tài khoản** (có mật khẩu tạm của 5 người; phiếu sống 7 ngày). Mở phiếu trước khi qua bước G.

**D. Người ra đề: Ngân hàng câu hỏi**
6. Mục **Ngân hàng câu hỏi** → **Thêm Chủ đề** `Tin học căn bản`, rồi thêm `Thiết kế kiến trúc hệ thống phần mềm`.
7. **Nhập từ Excel** → chọn Chủ đề *Tin học căn bản*, chọn `cau-hoi-tin-hoc-can-ban.xlsx` → **Tải lên và xem trước**. Mong đợi 20 dòng hợp lệ, không dòng lỗi. Bấm **Chọn các dòng hợp lệ (20)** → **Tạo 20 câu hỏi**.
8. Lặp lại bước 7 cho Chủ đề thứ hai và file `cau-hoi-kien-truc-phan-mem.xlsx`.
9. Mở vài câu để xem: câu Chùm đúng sai có Quy tắc chấm Bậc thang; câu Tự luận có Hướng dẫn chấm.

**E. Người ra đề: Bộ đề**
10. Mục **Bộ đề** → **Tạo Bộ đề**: `Kiểm tra Tin học căn bản`. **Thêm Phần** bốn lần (một Phần cho mỗi Loại câu hỏi) rồi **Thêm câu hỏi** từ Chủ đề *Tin học căn bản* vào từng Phần. Cách nhanh hơn: một Phần duy nhất chứa cả 20 câu.
11. **Lưu**, rồi **Phát hành…** → **Phát hành**. Mong đợi "20 câu, 22,5 điểm".
12. Tạo thêm Bộ đề `Kiểm tra Kiến trúc phần mềm` từ Chủ đề thứ hai và Phát hành.

**F. Người ra đề: Phiên thi**
13. Mục **Phiên thi** → **Tạo Phiên thi**: Bộ đề `Kiểm tra Tin học căn bản`; Giờ mở là bây giờ; Giờ đóng là một ngày sau; Thời lượng **5** phút nếu muốn thử cảnh báo "còn 5 phút / 1 phút" (hoặc 30 để làm bài thong thả); Mã vào thi tự đặt, ví dụ `TIN101`; Số Lượt làm bài tối đa 1 hoặc 2.
14. Trong **Danh sách dự thi**: dán danh sách Mã định danh `SV26001 SV26002 SV26003 SV26004 SV26005` → **Kiểm tra** → **Thêm 5 người**. Hoặc **Thêm cả lớp CNTT-K26 (5 người)**.

**G. Người dự thi (cửa sổ ẩn danh hoặc trình duyệt khác, giả lập điện thoại 360 px)**
15. Đăng nhập `SV26001` bằng mật khẩu tạm trên Phiếu tài khoản, đổi mật khẩu lần đầu, rồi vào `/take`.
16. Nhập Mã vào thi `TIN101` và làm bài. Phần kiểm thử 4c-1 nằm trong `docs/plan/slice-4.md`, mục **Hướng dẫn thử 4c-1**.

Làm lại từ bước 15 với `SV26002` để thấy hai người dự thi độc lập, hoặc dùng cùng tài khoản trên trình duyệt thứ hai để thấy thông báo "đã vào trên một thiết bị khác".

## Sinh lại file

Các file `.xlsx` được sinh từ mã, không sửa tay. Dữ liệu nằm trong `apps/api/scripts/demo-data/`. Sửa xong chạy:

```bash
pnpm -C apps/api build && pnpm -C apps/api demo:data
```

Lệnh này lấy khung file từ chính file mẫu của hệ thống (đúng tên sheet, tiêu đề cột, ô chọn Quy tắc chấm), điền dữ liệu, rồi đọc lại từng file bằng bộ đọc thật. Báo lỗi và thoát mã 1 nếu có dòng nào bị từ chối.
