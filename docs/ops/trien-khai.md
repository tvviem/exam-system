# Triển khai và vận hành pod `prod-exam`

Tài liệu cho người vận hành hệ thống trên máy WSL Ubuntu (ADR-0006). Thiết kế và các quyết định ở [docs/plan/slice-6.md](../plan/slice-6.md). Mọi lệnh chạy ở thư mục gốc của repo, qua `make -C infra …`; logic nằm ở [`infra/scripts/exam-ctl.sh`](../../infra/scripts/exam-ctl.sh).

> **Phạm vi hiện tại (PR 6a):** dựng lần đầu, đưa bản mới lên bằng tay, một hoặc hai bản api, dừng/bật, khôi phục Quản trị viên, tự dựng lại khi mở WSL. **Chưa có:** workflow deploy trên GitHub (6b), sao lưu và khôi phục dữ liệu (6c, 6d), diễn tập và checklist đưa lên chạy thật (6e). Trước khi có sao lưu **không dùng cho Phiên thi thật**.

## 1. Có gì trong pod

| Thành phần | Container | Ghi chú |
|---|---|---|
| web | `prod-exam-web` | nginx, cổng duy nhất mở ra máy: `127.0.0.1:8180`; chia tải giữa các bản api |
| api | `prod-exam-api` (và `prod-exam-api-2` khi chạy hai bản) | NestJS, chỉ nghe trong pod (`:3000`, `:3001`) |
| worker | `prod-exam-worker` | cùng ảnh với api |
| PostgreSQL 17 | `prod-exam-postgres` | `127.0.0.1:5436`; volume `exam_pgdata` |
| Redis 7 | `prod-exam-redis` | dữ liệu tạm, không cần sao lưu |

| Thứ | Ở đâu |
|---|---|
| Bí mật | `~/exam-prod-secrets/postgres.env`, `api.env` (quyền `600`); **không** nằm trong repo |
| Ảnh minh họa | volume `exam_media` |
| Nhật ký thao tác của bạn | `~/.local/state/exam-prod/operations.log` (mỗi lần up, scale, stop, ép khẩn cấp, khôi phục Quản trị viên) |
| Danh sách api cho nginx | `~/.local/state/exam-prod/upstream.conf` (do `prod-scale` quản lý, đừng sửa tay) |
| Dịch vụ systemd | `~/.config/systemd/user/exam-prod.service` |

Địa chỉ công khai: `https://exam.plotrackerbluni.site` (Q338). Ảnh `ghcr.io/tvviem/exam-api` và `exam-web` đã công khai, không cần đăng nhập để tải.

## 2. Dựng lần đầu

Điều kiện: Podman (đã có 4.9), systemd bật trong WSL và `Linger=yes` (`loginctl show-user $USER | grep Linger`), `curl`, `openssl`.

**Bước 1: chọn bản (TAG).** TAG là **mã commit đầy đủ (40 ký tự)** của một lần build xanh trên `main`:

```bash
git fetch origin && git rev-parse origin/main
# kiểm ảnh đã có chưa (không in gì và thoát 0 là có):
podman manifest inspect ghcr.io/tvviem/exam-api:<TAG> >/dev/null && echo "có ảnh api"
podman manifest inspect ghcr.io/tvviem/exam-web:<TAG> >/dev/null && echo "có ảnh web"
```

Chưa có ảnh: đợi job "Image api" và "Image web" của lần push `main` đó xong (tab Actions).

**Bước 2: dựng.**

```bash
make -C infra prod-bootstrap TAG=<TAG>
```

Lệnh hỏi họ tên và mật khẩu Quản trị viên đầu tiên (tên đăng nhập `quantri`; mật khẩu từ 10 ký tự, nhập hai lần, không lưu ở đâu). Rồi nó **in các khóa vừa sinh đúng một lần**: `POSTGRES_PASSWORD` và `SLIP_ENCRYPTION_KEY`. **Chép ngay vào trình quản lý mật khẩu dùng chung và bản giấy niêm phong** (Q327), sau đó nhấn Enter. Mất `SLIP_ENCRYPTION_KEY` thì các Phiếu tài khoản còn hạn (7 ngày) không mở lại được; mất `POSTGRES_PASSWORD` thì còn đọc được từ `~/exam-prod-secrets/postgres.env` nếu máy còn.

Lệnh tự làm: tạo `~/exam-prod-secrets/` (`700`), sinh khóa (chạy lại **không ghi đè** khóa đã có), tạo volume và pod, dựng PostgreSQL và Redis, chạy migration, dựng api, worker, web, tạo Quản trị viên và cài dịch vụ systemd. Xong thì in `Xong. Hệ thống chạy ở http://127.0.0.1:8180`.

**Bước 3: kiểm tra trong máy.**

```bash
make -C infra prod-status
curl -s http://127.0.0.1:8180/api/health
```

Mong đợi: pod `Running`, 5 container `Up`, `/api/health` trả `{"status":"ok",…}`.

**Bước 4: cho hệ thống ra Internet (tunnel Cloudflare, dùng chung tunnel với plo-tracker; Q339).** Các lệnh `sudo` do bạn chạy. **Lúc khởi động lại `cloudflared`, `demo.plotrackerbluni.site` bị ngắt vài giây**, nên chọn lúc plo-tracker ít người dùng.

```bash
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak     # để quay lui
sudo nano /etc/cloudflared/config.yml
```

Thêm quy tắc **trước** dòng `- service: http_status:404`:

```yaml
  - hostname: exam.plotrackerbluni.site
    service: http://127.0.0.1:8180
```

```bash
cloudflared tunnel ingress validate                 # phải báo OK
cloudflared tunnel route dns <tên-hoặc-ID-tunnel> exam.plotrackerbluni.site   # tạo bản ghi DNS (ID có ở dòng `tunnel:` của config.yml)
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager        # phải là active (running)
curl -s https://exam.plotrackerbluni.site/api/health
```

Quay lui nếu lỗi: `sudo cp /etc/cloudflared/config.yml.bak /etc/cloudflared/config.yml && sudo systemctl restart cloudflared`.

Nếu Cloudflare chặn: trong mục Security của tên miền, **tắt Bot Fight Mode và Under Attack Mode trong giờ thi** và không đặt giới hạn tần suất theo IP cho `/api/*` (hàng trăm người cùng một IP của trường dễ bị coi là bot).

**Bước 5: đăng nhập và tạo Quản trị viên thứ hai.** Vào `https://exam.plotrackerbluni.site`, đăng nhập `quantri`, đổi mật khẩu (hệ thống buộc). Nên tạo thêm **một Quản trị viên thứ hai** (mục Người dùng, "Tạo Quản trị viên") làm người dự phòng khi quên mật khẩu (Q326).

## 3. Dùng hằng ngày

| Việc | Lệnh |
|---|---|
| Xem tình trạng (pod, container, `/api/health`, số bản api, Phiên thi) | `make -C infra prod-status` |
| Xem log | `make -C infra prod-logs C=api` (`api-2`, `worker`, `web`, `postgres`, `redis`) |
| Có Phiên thi đang diễn ra hoặc sắp bắt đầu không | `make -C infra prod-active-sessions` |
| Dừng pod (giữ dữ liệu) | `make -C infra prod-stop` |
| Bật lại pod | `make -C infra prod-start` |
| Xóa pod và container (**giữ volume dữ liệu**) | `make -C infra prod-down` rồi `prod-up` để dựng lại |

### Phiên thi và chốt chặn (Q332)

`prod-up`, `prod-stop`, `prod-down` và `prod-scale N=1` **từ chối chạy** nếu có Phiên thi chưa hủy đang diễn ra, sắp bắt đầu trong 60 phút, hoặc có Lượt làm bài đang làm dở. Thay hệ thống giữa giờ thi làm Người dự thi mất kết nối vài giây.

Chỉ ép khi thật sự khẩn cấp (ví dụ lỗi bảo mật nghiêm trọng cần vá ngay) và nhớ báo cho người đang thi:

```bash
FORCE_REASON="vá lỗi bảo mật CVE-…" make -C infra prod-up TAG=<TAG>
```

Lý do được ghi vào `operations.log`.

### Một hay hai bản api (Q335)

Mặc định một bản. **Từ 300 người dự thi trở lên cùng lúc thì bật hai bản** (ca đo 500 người cùng mở kết quả một khoảnh khắc chậm hơn 1 giây khi chỉ một bản; xem [docs/hieu-nang.md](../hieu-nang.md)). Mỗi bản thêm khoảng 0,5 GB bộ nhớ.

```bash
make -C infra prod-scale N=2     # trước buổi thi lớn, lúc chưa có Phiên thi
make -C infra prod-scale N=1     # sau khi xong (bị chốt chặn nếu còn Phiên thi)
```

### Đưa bản mới lên (tay, Q331)

```bash
make -C infra prod-up TAG=<TAG>
```

Lệnh tải ảnh, chạy migration, thay api (rồi api thứ hai nếu có), worker, web, đợi `/api/health`, ghi bản đang chạy vào `~/.local/state/exam-prod/tag`. Api thay lần lượt, đợi từng bản sẵn sàng nên không có khoảng hở; riêng web (một container giữ cổng) mất khoảng 1 giây không kết nối được lúc thay. Lỗi thì in log và thoát khác 0. **Quay lui** là chạy lại với TAG cũ (migration chỉ thêm theo kiểu expand, nên bản cũ vẫn chạy trên cơ sở dữ liệu mới). Workflow GitHub bấm tay sẽ bọc lệnh này ở PR 6b.

## 4. Mở WSL thì hệ thống tự dựng lại (Q334)

`prod-bootstrap` cài dịch vụ `exam-prod.service` (systemd của user). Mở Ubuntu thì WSL khởi động systemd và dịch vụ chạy `podman pod start prod-exam`; tắt WSL thì dịch vụ dừng pod êm (PostgreSQL tắt sạch).

- **Không** có tác vụ Windows tự bật WSL: Windows tự khởi động lại thì hệ thống ngừng đến khi bạn mở Ubuntu.
- Kiểm: `systemctl --user status exam-prod.service` (phải `active (exited)`).
- **Trước khi tắt WSL hoặc chạy `wsl --shutdown`**: chạy `make -C infra prod-active-sessions`; không tắt khi có Phiên thi. Tắt chế độ ngủ của Windows và đặt giờ hoạt động cho Windows Update.

## 5. Quên mật khẩu Quản trị viên

Hệ thống không có email nên không có "quên mật khẩu" tự phục vụ; người có quyền vào máy khôi phục:

```bash
make -C infra prod-recover-admin ADMIN=quantri
```

Lệnh mở Khóa đăng nhập, gỡ khóa tạm, in **một lần** mật khẩu tạm (hạn 7 ngày, buộc đổi khi đăng nhập), thu hồi mọi phiên đăng nhập và ghi nhật ký (`cli.recover-admin`). Có Quản trị viên thứ hai thì chính người đó dùng "Cấp lại mật khẩu tạm" trong giao diện cũng được.

## 6. Xóa dữ liệu thật (làm tay, không có lệnh make)

Chỉ làm khi chắc chắn không cần dữ liệu nữa. **Không hoàn tác.** Trước đó phải có bản sao lưu đã khôi phục thử thành công (chưa có trước PR 6c).

```bash
make -C infra prod-down
podman volume rm exam_pgdata exam_media
```

## 7. Thử trên pod tạm (`drill-exam`)

Muốn thử script hoặc ảnh mà không đụng dữ liệu thật, thêm `EXAM_STAGE=drill`: pod `drill-exam`, web `127.0.0.1:8190`, PostgreSQL `127.0.0.1:5437`, volume `drill_exam_*`, bí mật ở `~/exam-drill-secrets/`, không cài dịch vụ systemd (trừ khi đặt `EXAM_INSTALL_SERVICE=1`). Đặt `EXAM_ADMIN_FULL_NAME` và `EXAM_ADMIN_PASSWORD` để khỏi bị hỏi. Ảnh tự build dùng `API_IMAGE=…` và `WEB_IMAGE=…`.

```bash
EXAM_STAGE=drill EXAM_ADMIN_FULL_NAME="Thử" EXAM_ADMIN_PASSWORD="mat-khau-thu-10" \
  make -C infra prod-bootstrap TAG=<TAG>
# …thử…
EXAM_STAGE=drill make -C infra prod-down
podman volume rm drill_exam_pgdata drill_exam_media && rm -rf ~/exam-drill-secrets ~/.local/state/exam-drill
```

## 8. Lỗi thường gặp

| Triệu chứng | Nguyên nhân và cách xử lý |
|---|---|
| `Thiếu TAG` | Đưa `TAG=<mã commit đầy đủ>` vào lệnh |
| Tải ảnh lỗi `manifest unknown` | Ảnh của commit đó chưa build xong (hoặc commit không nằm trên `main`); đợi job "Image api/web" trong Actions |
| `Từ chối … vì có Phiên thi` | Đúng thiết kế (Q332); đợi hết giờ hoặc ép khẩn cấp theo mục 3 |
| `/api/health` không trả lời sau 60 giây | Xem log in ra; `make -C infra prod-logs C=api` và `C=postgres` |
| `/_media/` (ảnh) trả 403 | api ghi file `0600` bằng uid 1000, nginx phải chạy cùng uid (ảnh web đã cấu hình `user node`); kiểm bản web đang chạy là bản mới |
| `prod-bootstrap` lỗi giữa chừng | Lần dựng đầu chưa có dữ liệu thật nên làm lại được: `make -C infra prod-down`, `podman volume rm exam_pgdata exam_media`, chạy lại `prod-bootstrap` (các file bí mật cũ được giữ, **không** sinh lại). Đã có dữ liệu thật thì **không** xóa volume |
| Mở WSL mà hệ thống không lên | `systemctl --user status exam-prod.service`; chạy tay `make -C infra prod-start` |
| Hết chỗ đĩa | `podman system df`; log container giới hạn 10 MB mỗi cái |
