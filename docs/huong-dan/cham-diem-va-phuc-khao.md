# Hướng dẫn: chấm điểm, Công bố, Phúc khảo, Đính chính đáp án

Dành cho **Người ra đề** (tổ chức Phiên thi) và **Người dự thi**. Viết bằng lời của người dùng; nguồn quyết định chi tiết nằm ở [docs/plan/slice-5.md](../plan/slice-5.md). Thuật ngữ in hoa theo [GLOSSARY.md](../../GLOSSARY.md). Muốn tập dượt không cần dữ liệu thật: xem "Thử nhanh" cuối trang.

## Vòng đời của một kỳ thi sau giờ làm bài

```
Nộp bài ─► Chấm tự động (vài giây) ─► Chấm Tự luận ─► Công bố kết quả
                                                          │
                          Người dự thi xem Kết quả ◄──────┤
                          Phúc khảo (trong Thời hạn)      │
                          Đính chính đáp án (nếu nhập sai)│
                                                          ▼
                              Hết hạn, hết Phúc khảo ─► Chốt (điểm không đổi nữa)
```

## Dành cho Người ra đề

**1. Chấm tự động.** Bài trắc nghiệm (Chọn một, Chọn nhiều, Chùm đúng/sai) được chấm trong vài giây sau khi nộp, kể cả hết giờ hay bị Buộc nộp. Người dự thi chưa thấy điểm cho đến khi bạn **Công bố**. Cả phòng 100 người xong trong chưa tới một giây.

**2. Chấm Câu tự luận** (mở Phiên thi → tab **Kết quả** → **Chấm câu Tự luận**).
- Chấm theo từng câu trên mọi bài (câu 1 của cả lớp, rồi câu 2…). Mặc định **ẩn tên**: bạn chỉ thấy "Bài 17", không thấy tên, Mã định danh, Lớp.
- Nhập điểm từ 0 đến điểm của câu (bước 0,01) hoặc bấm nút nhanh 0 / một nửa / tối đa; nhận xét không bắt buộc và Người dự thi đọc được sau Công bố. Điểm tự lưu khi sang bài kế.
- Máy tính: **J** bài kế, **K** bài trước, gõ điểm rồi **Enter**. Điện thoại: mỗi màn một bài, nút Trước/Sau. Mặc định chỉ hiện bài chưa chấm.
- Câu tự luận bỏ trống tự được 0 điểm và không nằm trong danh sách chờ.

**3. Kiểm tra trước khi Công bố.**
- Tab **Thống kê câu**: câu có tỷ lệ đúng bất thường thấp là dấu hiệu nghi sai đáp án; sửa bằng **Đính chính** (mục 6).
- Tab **Vi phạm**: với mỗi Vi phạm đã ghi lúc theo dõi, chọn **Không xử lý** (mặc định), **Trừ x %** (nhiều Vi phạm cộng dồn tối đa 100 %) hay **Hủy kết quả**. Đổi tự do đến lúc Công bố.
- Công tắc **"Cho xem lại đề sau Công bố"** (mặc định tắt): bật thì Người dự thi xem thêm nội dung câu và lựa chọn của chính họ. Dù bật hay tắt, họ **không bao giờ** thấy Đáp án đúng.

**4. Công bố kết quả.** Chọn **Thời hạn phúc khảo** từ 0 đến 14 ngày (0 = không nhận Phúc khảo, Chốt ngay) rồi xác nhận. Công bố không thu hồi được. Nút bị khóa kèm lý do nếu còn bài tự luận chưa chấm, còn Lượt chưa nộp, hoặc đang chấm lại sau Đính chính. Sau Công bố không Hủy Phiên thi và không sửa trực tiếp điểm; mọi thay đổi đi qua Phúc khảo hoặc Đính chính và đều có vết. **Xuất Excel** được bất cứ lúc nào (hai trang *Tổng hợp* và *Chi tiết*).

**5. Xử lý Phúc khảo.** Chuông thông báo báo "Có Phúc khảo mới" (nhiều cái gộp một dòng); vào tab **Phúc khảo** hoặc bấm **Xử lý Phúc khảo**.
- Mỗi màn một Phúc khảo: lý do của Người dự thi, câu hỏi, đáp án, bài làm. Chọn **Giữ nguyên** hoặc **Đặt điểm khác** (hoặc Mức xử lý khác với Phúc khảo về Vi phạm) và **viết câu trả lời** (bắt buộc). Điểm có thể tăng, giữ hoặc giảm. **J/K** sang Phúc khảo kế.
- Gửi nhầm đáp án cho cả lớp? Bấm **Đính chính cho cả lớp** ngay ở màn xử lý.
- **Gia hạn** Thời hạn phúc khảo khi cần (chỉ tăng, tổng tối đa 14 ngày, không được sau khi Chốt).
- Hết hạn mà còn Phúc khảo chờ: hệ thống **không tự bác**, chỉ nhắc bạn lúc hết hạn rồi mỗi ngày trên chuông. Hết hạn và hết Phúc khảo thì Phiên thi tự **Đã Chốt** trong vòng một phút, điểm không đổi nữa.

**6. Đính chính đáp án** (chủ Bộ đề; người được Ủy quyền không làm được). Phát hiện nhập sai đáp án đúng:
1. Ở tab **Thống kê câu** bấm **Đính chính câu này** (hoặc ở trang Bộ đề đã Phát hành).
2. Chọn đáp án mới, ghi lý do (ít nhất 10 ký tự), bấm **Xem trước**: hộp thoại nêu bao nhiêu người tăng điểm, bao nhiêu giảm, bao nhiêu Phiên thi đã Chốt giữ nguyên.
3. Xác nhận. Đáp án mới có hiệu lực ngay; điểm các bài đã nộp tự chấm lại ở nền trong vài giây (có thanh tiến độ). Người dự thi ở Phiên thi đã Công bố nhận thông báo nếu điểm họ đổi.
4. Điểm bạn chấm tay, điểm sau Phúc khảo và Phiên thi đã Chốt **không bị đổi**. Trong lúc chấm lại chưa Công bố được. Đáp án mới áp cho mọi lần dùng Bộ đề này từ giờ về sau. **Câu gốc trong Ngân hàng câu hỏi không tự sửa**: nhớ sửa tay nếu còn dùng lại.
5. Đính chính nhầm: đính chính lại lần nữa (không có nút hoàn tác); mỗi lần đều có vết.

**7. Ủy quyền chấm.** Chủ Phiên thi hoặc Quản trị viên có thể giao cho một Người ra đề khác (không có tên trong Danh sách dự thi) quyền chấm tự luận, quyết Mức xử lý, Công bố, xử lý Phúc khảo, xuất Excel khi chủ Phiên thi có sự cố. Người nhận không sửa hay Hủy Phiên thi, không Đính chính, không xem Theo dõi trực tiếp. Mọi thao tác ghi nhật ký kèm tên người làm.

## Dành cho Người dự thi

**Xem Kết quả.** Khi Người ra đề Công bố, bạn nhận thông báo trên chuông. Mở **Kết quả của tôi**:
- Thẻ điểm gọn ở đầu: điểm, điểm tối đa, điểm quy đổi thang 10 (làm tròn đến 0,1).
- **Bản đồ câu**: mỗi câu một ô ✓ (đúng) ◐ (đúng một phần) ✗ (sai) – (bỏ trống). Nút lọc có đếm (Tất cả, Sai, Một phần, Bỏ trống) và nút **Câu sai kế tiếp**.
- Mỗi lần xem **một câu**: mũi tên hoặc phím **← →**; trên điện thoại bấm ô vuông ở thanh dưới để nhảy nhanh. Bạn thấy điểm từng câu, nhận xét của Người ra đề và bài tự luận của chính mình; nếu Người ra đề cho xem lại đề thì thấy cả nội dung câu và lựa chọn của bạn. **Đáp án đúng không bao giờ hiện.**

**Gửi Phúc khảo** (khi cho rằng một câu chấm chưa đúng, hoặc một Mức xử lý áp lên điểm của bạn là không đúng).
1. Mở câu đó trong Kết quả của tôi, bấm **Phúc khảo Câu N**.
2. Ghi lý do cụ thể (ít nhất 10 ký tự), xác nhận. **Gửi rồi không rút lại được**; mỗi câu chỉ một lần; điểm sau khi xem xét có thể tăng, giữ nguyên hoặc **giảm**.
3. Số lượt tối đa bằng 10 % số câu của đề (làm tròn lên, ít nhất 3); dòng "đã dùng x/y lượt" luôn hiện. Phải gửi trong Thời hạn phúc khảo; hết hạn thì không gửi mới được.
4. Câu trả lời của Người ra đề hiện ngay dưới câu đó và trong mục "Phúc khảo của tôi", kèm "từ … thành …"; bạn cũng nhận thông báo.

**Khi điểm đổi vì Đính chính.** Nếu Người ra đề đính chính đáp án một câu mà điểm bạn đổi, bạn nhận thông báo và thấy điểm mới trong Kết quả của tôi.

## Thử nhanh bằng dữ liệu giả

Cần `pnpm db:migrate`, `pnpm dev` và worker (`pnpm -C apps/api dev:worker`) đang chạy.

```bash
pnpm -C apps/api build
pnpm -C apps/api demo:room --users 20 --through appeal   # Phiên thi đã Công bố, 10 Phúc khảo gửi sẵn
pnpm -C apps/api demo:room --clean                       # dọn khi xong
```

Đăng nhập Người ra đề `demo-gv` hoặc Người dự thi `demo-sv001`…, mật khẩu `Demo-Phong-Thi-123`. Các mức `--through grade` và `--through release`, cùng kịch bản từng bước, ở [demo-data/README.md](../../demo-data/README.md) (Kịch bản 3).
