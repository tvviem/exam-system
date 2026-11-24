# Kiểm tra Rút câu theo Phần trên production (bản 0.3.0)

Một trang, **in ra và tick**, dành cho người vận hành (chủ dự án). Dùng **một lần** để chắc bản `0.3.0` chạy đúng ở production trước khi gắn tag. Quy trình deploy chung ở [trien-khai.md](./trien-khai.md); kiểm tra trước mỗi Phiên thi thật ở [checklist-phien-thi.md](./checklist-phien-thi.md); cách dùng tính năng ở [rut-cau-theo-phan.md](../huong-dan/rut-cau-theo-phan.md).

**Hiện trạng ghi nhận khi soạn (22/11/2026):** production chạy `v0.2.0`; cơ sở dữ liệu có đúng 3 người dùng (2 Quản trị viên và 1 Người ra đề), **chưa có Người dự thi nào**. Danh sách Người dự thi thật nằm trong một file Excel, **chưa tải lên hệ thống** (chưa gửi Yêu cầu cấp tài khoản, nên chưa có tài khoản hay thư mời nào của danh sách đó). Bản mới chỉ thêm hai bảng (migration `0028`, `0029`), không đổi cột nào có dữ liệu, nên lùi về `v0.2.0` vẫn chạy được.

## Quy tắc an toàn cho đợt thử này (đọc trước)

- **Giữ nguyên trạng thái "chưa tải lên" của file Excel thật cho tới khi kiểm tra xong.** Khi file đó được tải lên rồi Quản trị viên duyệt, hệ thống tạo tài khoản **và tự xếp thư kích hoạt** cho từng người (gửi dần, tối đa 400 thư mỗi 24 giờ), theo tài liệu tài khoản ([tai-khoan-va-mat-khau.md](./tai-khoan-va-mat-khau.md) mục 1) thì **không có tùy chọn "chỉ tạo, chưa gửi"**. Nên đợt thử này **không dùng file thật**, và cũng đừng dùng vài dòng đầu của nó làm thử (thư sẽ tới thật sinh viên).
- **Tạo hai tài khoản Người dự thi thử riêng** (mục B2), là hai Người dự thi **đầu tiên** của hệ thống, dùng hai email của chính bạn (ví dụ `ten.ban+thu1@gmail.com` và `ten.ban+thu2@gmail.com`; nếu chưa cấu hình gửi thư thì dùng *Liên kết hỗ trợ*, không cần thư).
- Mọi thứ tạo ra để thử đặt tên bắt đầu bằng **`[THỬ]`**. Lưu ý cuối trang: Phiên thi đã có người làm và đã Công bố thì **không xóa được**, chỉ ẩn bằng cách Lưu trữ Bộ đề và đặt tên rõ.
- Chọn một **buổi không có Phiên thi thật** (`make -C infra prod-active-sessions` phải trống), vì deploy bị chốt chặn nếu có.

## A. Trước khi deploy (khoảng 10 phút)

- [ ] **CI của commit cần deploy xanh đủ bốn check**, gồm hai job *Image api* và *Image web* đã đẩy ảnh (chỉ chạy sau khi merge vào `main`). Commit mới nhất của `main`: ghi lại mã: `______`.
- [ ] `make -C infra prod-preflight` không có dòng ✗. Ghi các dòng ⚠ nếu có: `______`.
- [ ] `make -C infra prod-active-sessions` không có Phiên thi đang diễn ra hay sắp bắt đầu trong 60 phút.
- [ ] `make -C infra prod-backup-status` không có **CHƯA** hoặc **LỖI**; ghi lại tag đang chạy trước khi deploy (để lùi khi cần): `cat ~/.local/state/exam-prod/tag` → `______` (kỳ vọng commit `8c48220`, tức `v0.2.0`).
- [ ] WSL đang mở và runner `wsl-exam` ở trạng thái **Idle** (GitHub → Settings → Actions → Runners).

## B. Deploy và kiểm tra nền

**B1. Deploy** (theo [trien-khai.md](./trien-khai.md), mục "Deploy bằng GitHub"):

- [ ] Actions → **Deploy (bấm tay)** → **Run workflow**, Branch `main`, ô mã commit để trống (hoặc điền mã ghi ở mục A), ô lý do ép để trống. Duyệt bằng **Review deployments → Approve and deploy**.
- [ ] Mở **Summary** của lần chạy: ✅ Chốt chặn Phiên thi, ✅ Sao lưu trước deploy, ✅ Kiểm trong máy (`version` đúng bản vừa chọn), ✅ Địa chỉ công khai, ✅ Đã ghi `audit_logs`. Có ❌ hoặc 🛑 thì **dừng** và xem mục F.
- [ ] Ba container giám sát còn sống:
  ```bash
  for c in api worker web; do p=$(podman inspect -f '{{.State.ConmonPid}}' prod-exam-$c); echo "$c conmon=$p $(ps -p $p -o comm= || echo CHẾT)"; done
  ```
  Cả ba dòng phải ra `conmon`.
- [ ] Đăng nhập Quản trị viên, vào **Nhật ký**: có dòng **Đưa bản mới lên** (bản cũ → bản mới).
- [ ] **Quản trị viên thứ hai** đăng nhập thử được (cũng là điều kiện của [checklist-phien-thi.md](./checklist-phien-thi.md)).
- [ ] `make -C infra prod-status`: `/api/health` ok, một bản api, không lỗi.

**B2. Tạo hai Người dự thi thử** (không dùng danh sách thật):

- [ ] Người ra đề: **Yêu cầu cấp tài khoản** → tải lên một file Excel hoặc CSV **hai dòng** (mẫu cột ở [yeu-cau-cap-tai-khoan-mau.csv](../samples/yeu-cau-cap-tai-khoan-mau.csv)): `[THỬ] Sinh viên 1` với email thử 1, mã `THU001`; `[THỬ] Sinh viên 2` với email thử 2, mã `THU002`; lớp `THU`.
- [ ] Quản trị viên **duyệt** yêu cầu này. Bảng **Theo dõi kích hoạt** hiện hai dòng ở nhóm Chờ kích hoạt, và **chỉ hai dòng này** (hệ thống chưa có Người dự thi nào khác).
- [ ] Kích hoạt hai tài khoản bằng thư tới hộp thư của bạn. **Nếu thư không tới trong vài phút** (hoặc chưa cấu hình gửi thư): ở trang Yêu cầu bấm **Liên kết hỗ trợ** cho từng dòng (nêu lý do "thử Rút câu"), mở liên kết trong trình duyệt riêng, tự đặt mật khẩu.
- [ ] Đăng nhập được cả hai tài khoản thử, mỗi tài khoản **trên một thiết bị riêng** (khuyến nghị: một cái là **điện thoại thật** qua địa chỉ công khai, cái kia là máy tính).

## C. Hồi quy: Bộ đề và Phiên thi KHÔNG dùng Rút câu phải chạy y như trước

Đây là yêu cầu số một: dùng nguyên Bộ đề (ví dụ 40 câu lấy đủ) phải y như hiện nay.

- [ ] Nếu đã có Bộ đề hoặc Phiên thi thật từ trước: mở ra, **không có ô nào bị đổi**; mỗi Phần hiện dòng **Rút câu từ Phần này = 100** với "→ lấy đủ N câu"; Phiên thi hiện "Dùng nguyên Bộ đề: mỗi Người dự thi nhận đủ N câu".
- [ ] Bộ đề Phát hành từ trước vẫn mở được (chỉ đọc), Xem thử vẫn ra đủ mọi câu, **Xuất Bộ đề ra Word** vẫn tải được.

## D. Kiểm tra Rút câu từ đầu đến cuối

Dùng file **[rut-cau-15-cau-chon-mot.xlsx](../samples/rut-cau-15-cau-chon-mot.xlsx)** (15 câu chọn một, đáp án đúng **luôn là C**, câu 1 đến 10 ghi "Phần I", câu 11 đến 15 ghi "Phần II"). Mục tiêu: **mỗi người nhận 9 câu** (4 câu của Phần I rút 40 % và đủ 5 câu Phần II), **tối đa 14 điểm**.

**D1. Nhập câu hỏi và soạn Bộ đề** (Người ra đề)

- [ ] **Ngân hàng câu hỏi → Nhập từ Excel** → chọn file mẫu trên; nhập thành công 15 câu.
- [ ] Tạo Bộ đề **`[THỬ] Rút câu 15 câu`**. **Chia Phần**: đặt tên Phần I và Phần II; **Thêm câu hỏi** câu 1 đến 10 vào Phần I và câu 11 đến 15 vào Phần II (tìm theo chữ "[THỬ] Câu").
- [ ] **Đặt điểm nhanh** cho riêng Phần II: mỗi câu **2 điểm**. Thanh dưới hiện "15 câu · 20 điểm".
- [ ] Ở Phần I gõ **40** vào ô *Rút câu từ Phần này*: bên cạnh hiện "→ mỗi người nhận 4/10 câu"; phía trên các Phần có dòng **"Mỗi Người dự thi nhận 9 câu, tối đa 14 điểm."**
- [ ] **Thử sai có chủ ý:** gõ `150` hoặc để trống ô tỷ lệ → báo lỗi ngay cạnh ô và nút **Lưu** bị khóa; gõ lại `40`.
- [ ] **Thử lệch điểm:** đổi điểm câu 1 thành `3`: hiện cảnh báo "Các câu trong Phần này đang khác điểm…" và dòng tóm tắt **bỏ số điểm tối đa**. **Lưu**, bấm **Phát hành…**: hộp thoại **chặn**, nêu đúng Phần I. Đóng, sửa điểm câu 1 về `1`, **Lưu**.
- [ ] **Phát hành**. Mở lại Bộ đề: chỉ đọc, hiện "40 %" ở Phần I, không còn ô nhập.

**D2. Tạo Phiên thi** (Người ra đề)

- [ ] Tạo Phiên thi **`[THỬ] Ca rút câu`** từ Bộ đề trên. Bước 3 *Thiết lập làm bài* hiện "Dùng tỷ lệ của Bộ đề: Phần I 40 %" và "Mỗi Người dự thi nhận 9 câu, tối đa 14 điểm". Cột bên phải cũng nhắc 9 câu.
- [ ] **Giờ:** mở ngay (hoặc trước 1 phút), **đóng sau khoảng 25 phút**, thời lượng 10 phút. (Phiên thi chỉ Công bố được khi đã qua giờ đóng, nên đừng đặt khung giờ dài.) Số Lượt tối đa **2**. Ghi lại **Mã vào thi**: `______`.
- [ ] Bấm **Thay đổi cho Phiên thi này**: hai dòng Phần I (40) và Phần II (100). Đổi Phần I thành `70`: tóm tắt thành "12 câu, tối đa 17 điểm". Bấm **Dùng lại tỷ lệ của Bộ đề**: về "9 câu, tối đa 14 điểm" và bảng tự thu gọn. **Tạo Phiên thi.**
- [ ] Tab **Danh sách dự thi**: **Thêm người** `THU001` và `THU002` (**chỉ hai người thử**).
- [ ] **Xem thử** Phiên thi: khung trên cùng ghi "đây là một lượt rút mẫu gồm **9 câu trong 15 câu**"; chuyển **Từng câu**: "Câu 1/9". **Tải lại trang** vài lần: ra các bộ mẫu khác nhau.

**D3. Hai Người dự thi làm bài** (hai thiết bị)

- [ ] Mỗi người vào **Phiên thi của tôi**: dòng Phiên thi ghi "**9 câu · rút ngẫu nhiên**"; nhập **Mã vào thi**; màn xác nhận có khung "**Bài của bạn gồm 9 câu, rút ngẫu nhiên từ 15 câu của Bộ đề…**" và "Số câu: 9 câu".
- [ ] **Bắt đầu làm bài**: "Câu 1/9" (chế độ **Từng câu**; máy tính mở sẵn "Cả đề", bấm **Từng câu** để thấy) và "Đã làm 0/9 câu". Ghi **3 dòng đầu của mỗi người** (ví dụ "Câu 3, Câu 5, Câu 8" theo số trong đề gốc): `Sinh viên 1: ______` `Sinh viên 2: ______`. **Hai người nên ra bộ khác nhau** (có thể trùng một số câu; nếu hai bộ giống hệt cả 9 câu thì báo tôi).
- [ ] **Tải lại trang** trên một thiết bị: vẫn đúng bộ câu cũ và các câu đã trả lời.
- [ ] Cảm nhận tốc độ trên **điện thoại thật**: mở màn xác nhận, bấm Bắt đầu, chuyển câu: phản hồi gần như tức thì (ghi lại nếu chậm quá 2 giây): `______`.
- [ ] **Sinh viên 1** chọn **C ở mọi câu** (đúng hết: **14/14**), nộp bài. **Sinh viên 2** chọn **A ở mọi câu** (sai hết: **0/14**), nộp bài.
- [ ] (Tùy chọn, kiểm Lượt 2) Sinh viên 2 bấm làm lại: **đúng cùng bộ câu** như Lượt 1 (chỉ thứ tự có thể khác). Nộp lại.

**D4. Theo dõi, chấm và Công bố** (Người ra đề)

- [ ] Trong lúc làm bài, tab **Theo dõi** hiện tiến độ trên **9** câu mỗi người ("x/9"), không phải 15.
- [ ] Sau khi hai người nộp: tab **Kết quả** hiện **Điểm tối đa 14**, Sinh viên 1 **điểm thô 14, quy đổi 10,0**; Sinh viên 2 **0, quy đổi 0,0**. Chi tiết từng người chỉ liệt kê **9 câu**.
- [ ] **Đợi qua giờ đóng** của Phiên thi, rồi **Công bố kết quả** (đặt Thời hạn Phúc khảo ngắn, ví dụ 1 ngày).
- [ ] **Sinh viên 1** mở Kết quả: "**14/14**", vòng tròn **10,0 /10**, chỉ 9 câu của mình. Phần Phúc khảo cho phép tối đa **3 lượt** (hạn mức tối thiểu là 3, và tính theo 9 câu của họ chứ không theo 15).
- [ ] Người ra đề **Xuất Excel**: trang *Tổng hợp* có dòng **"Điểm tối đa mỗi người: 14"**, "Tổng số câu: 9 câu", các cột *Điểm thô, Điểm tối đa, Điểm sau Mức xử lý, Điểm quy đổi (thang 10)*; Sinh viên 1 ra `14, 14, 14, 10`; trang *Chi tiết* mỗi người **chỉ 9 ô có điểm, 6 ô trống** (câu không được rút).

**D5. Kiểm tra phụ**

- [ ] Phần mềm trên điện thoại: khối **Rút câu** ở form Phiên thi không tràn ngang, ô tỷ lệ chạm được bằng ngón tay.
- [ ] Nhật ký (Quản trị viên) ghi đủ các thao tác vừa làm, không có lỗi lạ ở `make -C infra prod-logs C=api` (xem 50 dòng cuối).

## E. Dọn dẹp và ghi nhận

- [ ] Bộ đề **`[THỬ]`**: **Lưu trữ** (không xóa được vì đã có Phiên thi).
- [ ] Phiên thi `[THỬ] Ca rút câu`: **giữ lại** (đã có người làm và đã Công bố nên không xóa hay Hủy được). Đặt tên đã có `[THỬ]`; không đụng tới.
- [ ] Hai tài khoản thử: **cứ để nguyên** cho tới khi xong mọi thử nghiệm. **Hỏi tôi trước khi Xóa người dùng**, vì tôi chưa kiểm hậu quả của việc xóa với Phiên thi đã Công bố.
- [ ] File Excel thật **vẫn chưa tải lên**: trang Người dùng chỉ có 3 người dùng ban đầu cộng hai tài khoản thử, không có thư kích hoạt nào gửi cho người thật (Quản trị viên xem màn **Hàng đợi thư**: chỉ có thư của hai email thử).
- [ ] Ghi kết quả đợt kiểm tra (ngày, mã commit, mục nào không đạt) và gửi cho tôi. Nếu **mọi mục đạt**, nhắn "gắn tag v0.3.0": tôi gắn tag lên đúng commit đang chạy, rồi soạn bản nháp GitHub Release cho cả bốn tag (`v0.1.0`, `v0.1.1`, `v0.2.0`, `v0.3.0`) để bạn xem trước khi đăng.

## F. Nếu có mục không đạt

1. **Đừng mở Phiên thi thật** cho tới khi xử lý. Ghi lại màn hình, giờ và bước đang làm, gửi cho tôi.
2. **Lùi bản** nếu hệ thống lỗi: Actions → **Deploy (bấm tay)** → điền vào ô **Mã commit** mã của bản cũ ghi ở mục A (`v0.2.0` = `8c48220`). Lùi chỉ đổi mã, không đổi dữ liệu; migration `0028`, `0029` chỉ thêm bảng nên bản cũ vẫn chạy. Sau khi lùi, Phiên thi `[THỬ]` có tỷ lệ rút dưới 100 % sẽ **không còn rút câu** (bản cũ làm đủ mọi câu), nên chỉ lùi khi chưa có Phiên thi thật dùng Rút câu.
3. Lỗi gửi thư hay kích hoạt tài khoản thử không liên quan Rút câu: dùng **Liên kết hỗ trợ** để đi tiếp, ghi lại để xử lý riêng ([gui-thu.md](./gui-thu.md)).

## G. Sau khi đạt: đưa danh sách Người dự thi thật vào hệ thống

Chỉ làm **sau** khi gắn tag. Người ra đề tải file Excel thật lên mục **Yêu cầu cấp tài khoản** (mỗi dòng bắt buộc có email; cột mẫu ở [yeu-cau-cap-tai-khoan-mau.csv](../samples/yeu-cau-cap-tai-khoan-mau.csv)), Quản trị viên duyệt, rồi hệ thống tạo tài khoản và **tự xếp thư kích hoạt**. Lên kế hoạch theo hạn mức **400 thư mỗi 24 giờ**: danh sách N người cần khoảng N chia 400 ngày (làm tròn lên) để gửi hết. Nên tải lên và duyệt **ít nhất 2 đến 3 ngày trước ngày thi**, rồi theo dõi bảng **Theo dõi kích hoạt** (Thư lỗi, Cần kiểm tra) và xử lý từng người bằng *Gửi lại*, *Sửa email*, *Liên kết hỗ trợ* ([tai-khoan-va-mat-khau.md](./tai-khoan-va-mat-khau.md) mục 1b, 1c). Trước buổi thi thật chạy lại [checklist-phien-thi.md](./checklist-phien-thi.md).
