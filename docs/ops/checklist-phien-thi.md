# Checklist đưa lên chạy thật: trước, trong và sau mỗi Phiên thi

Một trang, **in ra và tick**. Dành cho người vận hành (chủ dự án). Lý do từng mục và cách xử lý khi một mục không đạt nằm ở [khoi-phuc.md](./khoi-phuc.md) và [trien-khai.md](./trien-khai.md). Thiết kế: [docs/plan/slice-6.md](../plan/slice-6.md) (Q369).

**Cách dùng nhanh:** các mục có chữ **(máy)** do lệnh `make -C infra prod-preflight` tự kiểm; chạy lệnh đó rồi chỉ tick tay các mục còn lại. Dòng cuối của lệnh nói "máy kiểm đạt hết" mới được coi là đạt phần máy.

```bash
make -C infra prod-preflight
```

Mỗi dòng ✓ là đạt, ⚠ là nên xem, ✗ là không đạt (lệnh thoát khác 0). Có ✗ thì **chưa mở Phiên thi thật** cho tới khi xử lý xong. Hướng dẫn đọc kết quả, bảng đầy đủ các mục máy kiểm, cách chỉnh ngưỡng và điều lệnh không đảm bảo: [khoi-phuc.md mục 3.6](./khoi-phuc.md).

## Trước 1 tuần

- [ ] **(máy)** Bản nền sao lưu mới nhất dưới 8 ngày (timer làm mỗi Chủ nhật 03:00 khi laptop bật).
- [ ] **(máy)** Lần thử khôi phục gần nhất **ĐẠT** và không quá 35 ngày.
- [ ] **(máy)** Có ít nhất **2 Quản trị viên** đang hoạt động.
- [ ] Quản trị viên thứ hai **đăng nhập thử được** (không chỉ có tài khoản).
- [ ] **(máy)** Mục "Thư" của `prod-preflight` không có ✗: nếu đã dùng kích hoạt hoặc quên mật khẩu bằng email thì phải đã cấu hình gửi thư, và không có thư chờ gửi quá 48 giờ ([gui-thu.md](./gui-thu.md) mục 6). Đã chạy `make -C infra prod-mail-test ADDRESS=<email của bạn>` và thư vào hộp thư đến.
- [ ] Ba tờ giấy (A khóa gpg, B mật khẩu khóa, C mã khôi phục 2FA Bitwarden) **còn đủ**, cất ở các nơi khác nhau ([khoi-phuc.md](./khoi-phuc.md) mục 4.1.1).
- [ ] Đã đọc email của healthchecks.io gần đây: không có thư LỖI hoặc IM LẶNG chưa xử lý.
- [ ] Đã diễn tập khôi phục sang máy khác từ R2 trong vòng 3 tháng qua (`make -C infra dr-drill`, [khoi-phuc.md](./khoi-phuc.md) mục 5.6), hoặc chấp nhận rủi ro ghi rõ.

## Trước 1 ngày

- [ ] **Không deploy nữa** từ giờ tới khi thi xong (không bấm workflow Deploy, không `prod-up`, không `prod-scale`).
- [ ] **(máy)** `make -C infra prod-backup-status` không có dòng **CHƯA** hoặc **LỖI**; bản đêm mới hơn 26 giờ.
- [ ] **(máy)** Ổ WSL và ổ D: còn ít nhất 5 GB trống.
- [ ] **(máy)** Lưu liên tục WAL bật, dãy WAL liền nhau, hàng chờ đẩy không quá 5 file, đủ 6 timer.
- [ ] **Cắm sạc** laptop; **tắt chế độ ngủ** khi cắm sạc (Windows: Cài đặt → Nguồn).
- [ ] Đặt **giờ hoạt động** cho Windows Update ngoài giờ thi, hoặc tạm dừng cập nhật tới sau kỳ thi.
- [ ] Biết ai ngồi cạnh máy trong lúc thi và có số điện thoại của người đó.
- [ ] Nếu phòng thi **từ khoảng 300 người trở lên**: đã quyết dùng hai bản api (`make -C infra prod-scale N=2`) và đã kiểm `make -C infra scale-drill-test` hoặc bài đo 500 người với hai api ([hieu-nang.md](../hieu-nang.md)). Dưới 100 người: một bản api là đủ.

## Trước 1 giờ

- [ ] `make -C infra prod-preflight` chạy lại: **máy kiểm đạt hết**.
- [ ] **(máy)** `make -C infra prod-active-sessions` hiện đúng Phiên thi dự kiến (không thừa, không thiếu).
- [ ] **(máy)** Địa chỉ công khai (https://exam.plotrackerbluni.site) trả ok và đúng bản đang chạy.
- [ ] **(máy)** Người giám sát (conmon) của api, worker, web còn sống.
- [ ] Chạy tay một bản dump mới nhất: `make -C infra prod-backup-dump`.
- [ ] Mở trang bằng điện thoại thật (4G, không phải Wi-Fi nhà) đăng nhập bằng một tài khoản Người dự thi thử.
- [ ] Đóng các chương trình nặng khác trên laptop (trình duyệt nhiều thẻ, cập nhật, tải file).

## Trong thi

- [ ] **Không** deploy, `prod-stop`, `prod-down`, `prod-scale`, `enable-archiving`, và **không** `wsl --shutdown` hay đóng nắp laptop.
- [ ] Có người ngồi cạnh máy; laptop cắm sạc.
- [ ] Màn hình **Theo dõi** của Người ra đề mở; nếu thấy "mất kết nối" hàng loạt, kiểm `prod-status` và địa chỉ công khai trước, đừng khởi động lại vội.
- [ ] Máy nặng bất thường: **đừng** chạy việc nặng (thử khôi phục, bản nền). Các việc đó tự hoãn khi có Phiên thi đang diễn ra.

## Sau thi

- [ ] Người ra đề **Công bố** kết quả: kiểm trong vòng 10 phút có bản **sau Công bố** mới (`prod-backup-status`, dòng "Bản sau Công bố").
- [ ] Mở màn hình **Sao lưu dữ liệu**: không có dải đỏ, bản đêm còn mới.
- [ ] Nếu đã bật hai bản api: `make -C infra prod-scale N=1` khi hết Phiên thi.
- [ ] Ghi nhanh số liệu thật (số người, sự cố, thời gian chậm nhất) vào sổ vận hành để lần sau so sánh ([hieu-nang.md](../hieu-nang.md)).
- [ ] Sau mỗi lần deploy qua GitHub (không phải lúc thi): người giám sát của api, worker, web còn sống (`prod-preflight` kiểm giúp).

## Khi có việc không đạt

| Dấu hiệu | Làm gì |
|---|---|
| ✗ bản đêm quá cũ | `make -C infra prod-backup-dump`; xem `prod-backup-status` và email healthchecks |
| ✗ bản nền quá cũ | `make -C infra prod-backup-basebackup ARGS=--force` (lúc không có Phiên thi) |
| ✗ thử khôi phục không đạt hoặc quá cũ | `make -C infra prod-backup-restore-test` rồi đọc kết quả ([khoi-phuc.md](./khoi-phuc.md) mục 5.7) |
| ✗ archive lỗi hoặc dãy WAL đứt | **xử lý ngay** (đĩa có thể đầy): [khoi-phuc.md](./khoi-phuc.md) mục 4.5 "Rủi ro cần nhớ" |
| ✗ chỉ 1 Quản trị viên | tạo người thứ hai trước khi mở Phiên thi |
| ✗ thư chờ gửi quá 48 giờ, hoặc chưa cấu hình gửi thư mà đã có thư bị bỏ qua | xem [gui-thu.md](./gui-thu.md) mục 6 và 8 |
| ✗ conmon CHẾT | khôi phục theo [trien-khai.md](./trien-khai.md) mục "Lỗi thường gặp" (dòng 502 và `Stopping`), lúc không có Phiên thi |
| ✗ địa chỉ công khai không trả ok | kiểm Cloudflare tunnel ([trien-khai.md](./trien-khai.md) mục 2); hệ thống trong máy vẫn chạy |
