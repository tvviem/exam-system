# Triển khai demo trên laptop WSL (pod `prod-exam`, tên miền giá rẻ, Cloudflare Tunnel)

> **Trạng thái: bản nháp 1 (2/11/2026), chưa chạy thử trên máy.** Các lệnh dưới đây viết theo cấu hình đã đọc trong repo và theo cách `plo-tracker-bluni` đang vận hành, nhưng chưa được chạy từ đầu đến cuối. Lần triển khai đầu tiên hãy làm từng bước, kiểm tra bằng mục 9, và sửa tài liệu này theo những gì thực tế khác. Workflow deploy tự động (kiến trúc mục 9) chưa được viết; lần đầu triển khai bằng tay, sẽ đề xuất workflow riêng sau.

Nền tảng: [ADR-0006](../adr/0006-podman-pod-tren-wsl-qua-cloudflare-tunnel.md) (accepted), [architecture.md mục 8](../architecture.md), [slice-4.md Q225](../plan/slice-4.md). Mẫu tham chiếu: `plo-tracker-bluni/docs/WSL_PRODUCTION_DEPLOYMENT.md`.

## 1. Mô hình

```text
Điện thoại / máy tính ──HTTPS──► Cloudflare ──tunnel──► cloudflared (systemd, trên WSL)
                                                              │ http://127.0.0.1:8180
                                           ┌──────────────────▼─────────────── pod prod-exam ───┐
                                           │ web (nginx :80)  ──/api, /ws──► api (:3000)        │
                                           │                                  worker            │
                                           │ postgres 17 (volume exam_pgdata)   redis 7         │
                                           └────────────────────────────────────────────────────┘
```

| Thành phần | Image | Ghi chú |
|---|---|---|
| web | `ghcr.io/tvviem/exam-web:<sha>` | Cổng duy nhất ra host, chỉ gắn vào `127.0.0.1:8180` (chỉ `cloudflared` cần vào) |
| api | `ghcr.io/tvviem/exam-api:<sha>` | Nghe trong pod ở `:3000` |
| worker | cùng image api | Lệnh `node dist/worker/main.js` |
| postgres | `docker.io/library/postgres:17` | Volume `exam_pgdata`; mở `127.0.0.1:5436` trên host để quản trị |
| redis | `docker.io/library/redis:7` | Chỉ dữ liệu tạm (ADR-0002); không mở ra host |

Image do workflow CI đẩy lên GHCR mỗi lần push `main`, thẻ là mã commit đầy đủ. Gói GHCR mặc định riêng tư: cần `podman login ghcr.io` bằng token có quyền `read:packages`.

## 2. Sức chứa đã đo (2/11/2026)

Đo trên chính laptop này (Ryzen 7 PRO 4750U, 8 lõi 16 luồng, RAM 15 GB), api đã build, Postgres 17 và Redis trong pod `dev-exam`, 500 tài khoản giả. Chỉ đo phía máy chủ qua loopback, không có mạng, không có trình duyệt.

| Việc | Kết quả |
|---|---|
| 500 người đăng nhập rải trong 60 giây | 0 lỗi, p50 45 ms, p99 75 ms |
| 500 người đăng nhập cùng một lúc | 0 lỗi, p50 3,5 giây, tối đa 6 giây (argon2 tốn ~19 ms CPU mỗi lần, ~115 lần/giây) |
| 500 người gọi API mỗi ~5 giây (113 yêu cầu/giây) | 0 lỗi, p50 5 ms, p99 9 ms; CPU api ~17% của một lõi |
| 500 yêu cầu API cùng lúc | p50 434 ms (một tiến trình Node chịu ~1.100 yêu cầu/giây) |
| Ghi bền Câu trả lời, 500 người mỗi ~10 giây (~55 lượt/giây) | p99 7 ms; Postgres chịu 2.700–6.200 lượt/giây |
| RAM api | ~300–350 MB; cả hệ thống dưới 1 GB |

**Chưa đo, không được coi là đã đạt:** đường mạng (tunnel Cloudflare, đường upload của nhà mạng, 500 điện thoại thật trên 4G và Wi-Fi), luồng vào thi và làm bài thật (API có ở PR 4b), Socket.IO của màn Theo dõi (PR 4d). K6 500 người ở PR 4e sẽ thay các bài đo tạm này.

**Hai điều chỉnh bắt buộc cho 500 người cùng nơi** (đã duyệt, Q224):

1. `LOGIN_MAX_PER_IP=1000` (mặc định 20 mỗi 10 phút theo IP: cả lớp dùng chung Wi-Fi sẽ có chung một IP công cộng nên chỉ 20 người đăng nhập được).
2. `DB_POOL_MAX` (mặc định 10 kết nối mỗi tiến trình, tối đa 100) đã có từ PR 4b-1; đủ cho tải đã đo. api và worker mỗi bên một nhóm, tổng không được vượt `max_connections` của Postgres (đang đặt 200).

## 3. Chuẩn bị máy

**Windows** (làm một lần, PowerShell quản trị):

```powershell
powercfg /change standby-timeout-ac 0      # không ngủ khi cắm điện
powercfg /change hibernate-timeout-ac 0
powercfg /setactive SCHEME_MIN             # gói "Hiệu suất cao" nếu máy có
```

- Đặt Active Hours của Windows Update ngoài giờ thi, hoặc tạm dừng cập nhật trong tuần thi.
- Luôn cắm điện khi thi. CPU laptop 15 W có thể hạ xung khi chạy nặng liên tục.
- Đảm bảo WSL tự bật sau khi Windows khởi động lại (plo-tracker đã chạy trên máy này nên cách đang dùng tiếp tục áp dụng; nếu chưa chắc, kiểm tra Task Scheduler).

**Ubuntu WSL:**

```bash
sudo loginctl enable-linger "$USER"
systemctl --user enable --now podman-restart.service   # container --restart always tự lên lại sau khi WSL khởi động
```

Giới hạn tài nguyên (`--cpus`, `--memory`) của Podman rootless chỉ có tác dụng khi systemd ủy quyền controller `cpu` và `memory` cho user. Kiểm tra:

```bash
cat /sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/cgroup.controllers
```

Phải thấy `cpu` và `memory`. Nếu thiếu, Podman bỏ qua giới hạn và cảnh báo; xem `man podman-run` mục `--cpus`.

## 4. Mua tên miền và đưa vào Cloudflare

1. **Mua tên miền** ở nơi có giá gia hạn rõ ràng (ví dụ Cloudflare Registrar, Namecheap, Porkbun; tên miền `.vn` cần giấy tờ định danh nên không phù hợp để làm nhanh). Đuôi rẻ năm đầu có thể đắt hơn nhiều ở năm gia hạn: xem **giá gia hạn** trước khi mua. Bật tự động gia hạn và khóa chuyển nhượng.
2. **Thêm tên miền vào Cloudflare** (gói Free): *Add a domain*, chọn Free, rồi đổi **nameserver** tại nhà đăng ký sang hai nameserver Cloudflare cho. Chờ trạng thái *Active* (từ vài phút đến vài giờ).
3. Trong Cloudflare, mục SSL/TLS đặt chế độ **Full**. Tunnel mã hóa đến Cloudflare còn đoạn từ `cloudflared` đến nginx là HTTP nội bộ trên cùng máy.
4. Dành tên `exam.<tên-miền>` cho ứng dụng.

> Phương án tạm không tốn tiền: dùng một subdomain của tên miền đang có (ví dụ `exam.plotrackerbluni.site`), chỉ cần thêm ingress ở mục 7. Chuyển sang tên miền riêng sau chỉ là đổi hai chỗ: ingress và `APP_ORIGINS`.

## 5. Dừng plo-tracker-bluni (chủ dự án thực hiện)

Máy đang chạy pod `prod-plotracker` (Postgres, Redis, Ollama, backend, frontend, AI Assistant) trên cổng 8080 và 8000, ra Internet qua `demo.plotrackerbluni.site`. Chủ dự án quyết định dừng và xóa nó khi triển khai `prod-exam`.

**Xóa là không hoàn tác.** Trước khi xóa, sao lưu theo `plo-tracker-bluni/docs/BACKUP_OPERATOR_RUNBOOK.md`, kiểm tra file sao lưu mở được, rồi mới xóa:

```bash
podman pod stop prod-plotracker              # dừng (còn khởi động lại được)
podman pod rm prod-plotracker                # xóa container; volume dữ liệu CÒN
podman volume ls                             # prod_pgdata, prod_appdata, volume Ollama...
# Chỉ khi đã chắc chắn không cần dữ liệu và model nữa:
# podman volume rm prod_pgdata ...
```

Nếu xóa pod plo, nhớ dừng luôn runner `~/actions-runner` của plo và bỏ hostname `demo.plotrackerbluni.site` khỏi ingress (mục 7) để tránh lỗi 404 khó hiểu.

## 6. Tạo bí mật, volume và pod

```bash
mkdir -p ~/exam-prod-secrets ~/exam-prod-backups
chmod 700 ~/exam-prod-secrets ~/exam-prod-backups
```

`~/exam-prod-secrets/postgres.env` (đổi mật khẩu bằng `openssl rand -hex 24`):

```dotenv
POSTGRES_USER=exam
POSTGRES_PASSWORD=<mật khẩu mạnh>
POSTGRES_DB=exam
```

`~/exam-prod-secrets/api.env`:

```dotenv
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgres://exam:<mật khẩu mạnh>@127.0.0.1:5432/exam
REDIS_URL=redis://127.0.0.1:6379/0
APP_ORIGINS=https://exam.<tên-miền>
LOGIN_MAX_PER_IP=1000
DB_POOL_MAX=10
# Mặc định `loopback` là đúng khi nginx cùng pod (nginx tự đặt X-Forwarded-For từ CF-Connecting-IP).
TRUST_PROXY=loopback
# openssl rand -base64 32. Mất khóa này thì các Phiếu tài khoản còn hạn (7 ngày) không mở lại được.
SLIP_ENCRYPTION_KEY=<32 byte base64>
MEDIA_DIR=/var/lib/exam/media
MEDIA_ACCEL_PREFIX=/_media
```

```bash
chmod 600 ~/exam-prod-secrets/*.env
```

Tạo pod và hạ tầng. Chỉ `127.0.0.1` được gắn ra host:

```bash
podman volume create exam_pgdata
podman volume create exam_media

podman pod create --name prod-exam \
  -p 127.0.0.1:8180:80 \
  -p 127.0.0.1:5436:5432

podman run -d --name prod-exam-postgres --pod prod-exam --restart always \
  --memory 3g --cpus 4 \
  --env-file ~/exam-prod-secrets/postgres.env \
  -v exam_pgdata:/var/lib/postgresql/data \
  docker.io/library/postgres:17 \
  postgres -c shared_buffers=1GB -c effective_cache_size=3GB -c max_connections=200

podman run -d --name prod-exam-redis --pod prod-exam --restart always \
  --memory 256m docker.io/library/redis:7
```

Migration, rồi api, worker, web (thay `<sha>` bằng mã commit của lần build trên `main`):

```bash
TAG=<sha>
podman login ghcr.io -u tvviem        # nhập token read:packages

podman run --rm --pod prod-exam --env-file ~/exam-prod-secrets/api.env \
  ghcr.io/tvviem/exam-api:$TAG node dist/db/migrate.js

podman run -d --name prod-exam-api --pod prod-exam --restart always \
  --memory 1g --cpus 4 -e APP_VERSION=$TAG \
  --env-file ~/exam-prod-secrets/api.env -v exam_media:/var/lib/exam/media \
  ghcr.io/tvviem/exam-api:$TAG

podman run -d --name prod-exam-worker --pod prod-exam --restart always \
  --memory 512m --cpus 2 \
  --env-file ~/exam-prod-secrets/api.env -v exam_media:/var/lib/exam/media \
  ghcr.io/tvviem/exam-api:$TAG node dist/worker/main.js

podman run -d --name prod-exam-web --pod prod-exam --restart always \
  --memory 256m -v exam_media:/var/lib/exam/media:ro \
  ghcr.io/tvviem/exam-web:$TAG
```

Tạo Quản trị viên đầu tiên (nhập mật khẩu không để lại trong lịch sử lệnh):

```bash
read -rs -p "Mật khẩu quản trị (≥ 10 ký tự): " BOOT_PW; echo
podman run --rm --pod prod-exam --env-file ~/exam-prod-secrets/api.env \
  -e BOOTSTRAP_ADMIN_USERNAME=quantri -e BOOTSTRAP_ADMIN_PASSWORD="$BOOT_PW" \
  ghcr.io/tvviem/exam-api:$TAG node dist/cli/main.js bootstrap-admin
unset BOOT_PW
```

> **Ảnh minh họa:** api ghi file với quyền `0600` còn nginx đọc volume `exam_media`; nếu hai bên chạy khác uid thì ảnh trả 403 (xem chú thích trong `infra/containers/nginx.conf`). Mục 9 có bước kiểm; nếu lỗi, chạy hai container cùng uid hoặc đặt ACL cho volume.

## 7. Cloudflare Tunnel

`cloudflared` đã chạy như dịch vụ systemd với `/etc/cloudflared/config.yml`. Thêm một quy tắc ingress **trước** dòng chốt chặn `http_status:404`:

```yaml
ingress:
  - hostname: exam.<tên-miền>
    service: http://127.0.0.1:8180
  # (bỏ quy tắc demo.plotrackerbluni.site khi đã xóa pod plo)
  - service: http_status:404
```

```bash
cloudflared tunnel ingress validate
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

**DNS:** thêm bản ghi CNAME `exam` trỏ đến `<TUNNEL_ID>.cfargotunnel.com` (đã bật proxy, mây cam) trong bảng điều khiển Cloudflare của tên miền mới. `cloudflared tunnel route dns` chỉ tạo bản ghi trong vùng (zone) đã chọn lúc `cloudflared tunnel login`, nên với tên miền mới tạo bản ghi bằng tay là đường chắc chắn nhất. `<TUNNEL_ID>` có trong dòng `tunnel:` của `config.yml`.

**Cloudflare bảo vệ có thể chặn cả lớp:** hàng trăm thí sinh cùng một IP trường có thể bị coi là bot. Trong mục Security của tên miền, tắt *Bot Fight Mode* và *Under Attack Mode* trong giờ thi, và không đặt quy tắc giới hạn tần suất theo IP cho `/api/*`.

## 8. Sao lưu

Sao lưu hằng ngày và ngay trước mỗi lần deploy, giữ 14 bản, thỉnh thoảng thử khôi phục:

```bash
# ~/exam-prod-backups/backup.sh
set -euo pipefail
out=~/exam-prod-backups/exam_$(date +%Y%m%d_%H%M%S).dump
podman exec prod-exam-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$out"
test -s "$out" && sha256sum "$out" > "$out.sha256"
ls -1t ~/exam-prod-backups/exam_*.dump | tail -n +15 | xargs -r rm --
```

Đặt chạy hằng ngày bằng timer systemd của user (`~/.config/systemd/user/exam-backup.{service,timer}`, `OnCalendar=*-*-* 02:00`). Thử khôi phục vào một database tạm trước khi tin vào bản sao lưu:

```bash
podman exec -i prod-exam-postgres sh -c 'createdb -U "$POSTGRES_USER" restore_test && pg_restore -U "$POSTGRES_USER" -d restore_test' < ~/exam-prod-backups/<file>.dump
```

Ngoài Postgres còn có hai thứ cần giữ: `~/exam-prod-secrets/` (đặc biệt `SLIP_ENCRYPTION_KEY`) và volume `exam_media` (ảnh minh họa). Chép chúng ra ổ khác hoặc máy khác định kỳ; cùng một laptop thì không phải là sao lưu thật.

## 9. Kiểm tra sau triển khai

- [ ] `curl -s http://127.0.0.1:8180/api/health` trả `ok` (trong WSL), và `https://exam.<tên-miền>/api/health` cũng `ok` từ điện thoại dùng 4G.
- [ ] Đăng nhập Quản trị viên qua HTTPS; cookie có thuộc tính `Secure`, `HttpOnly`.
- [ ] **Địa chỉ IP thật:** đăng nhập từ điện thoại dùng 4G rồi xem danh sách phiên đăng nhập (`/api/auth/auth-sessions` hoặc màn Tài khoản). IP ghi nhận phải là IP của điện thoại, không phải `127.0.0.1` hay địa chỉ của podman. `nginx.conf` (PR 4b-1) đặt `X-Forwarded-For` bằng `CF-Connecting-IP`, bỏ giá trị khách tự gửi, và đã được thử với nginx thật cùng máy chủ giả. Nếu vẫn thấy mọi người cùng một IP nội bộ thì chỉnh `TRUST_PROXY` (danh sách địa chỉ/dải được tin, không nhận số bước) rồi khởi động lại api.
- [ ] Tải lên một Hình minh họa rồi mở lại (kiểm tra `X-Accel-Redirect` và uid, xem ghi chú mục 6).
- [ ] Khởi động lại Windows, đợi WSL, kiểm tra pod tự lên và trang vẫn mở được.
- [ ] Chạy `backup.sh` một lần, thử khôi phục vào database tạm.
- [ ] Từ PR 4d: kiểm tra WebSocket qua tunnel (`/ws/`).

## 10. Cập nhật phiên bản và quay lui

Thay lần lượt api, worker, web bằng thẻ mới (sau khi sao lưu và **không có Phiên thi đang diễn ra**):

```bash
~/exam-prod-backups/backup.sh
podman run --rm --pod prod-exam --env-file ~/exam-prod-secrets/api.env ghcr.io/tvviem/exam-api:$NEW node dist/db/migrate.js
for c in api worker web; do podman rm -f prod-exam-$c; done
# chạy lại ba lệnh podman run ở mục 6 với TAG=$NEW
curl -fsS http://127.0.0.1:8180/api/health
```

Migration chỉ thêm (expand-only), nên quay lui mã về thẻ cũ là an toàn: chạy lại ba lệnh `podman run` với thẻ trước đó, không chạy migration ngược.

## 11. Checklist trước mỗi Phiên thi quan trọng

- [ ] Laptop cắm điện, không ngủ, không có cập nhật Windows chờ khởi động lại.
- [ ] Không có build CI hay tác vụ nặng khác trên máy (runner self-hosted nếu có thì dừng).
- [ ] Đã sao lưu; `curl` kiểm tra health qua tên miền công khai.
- [ ] `LOGIN_MAX_PER_IP` ≥ 1000; Cloudflare Bot Fight Mode tắt.
- [ ] Thông báo thí sinh **đăng nhập sớm** trước giờ mở vài phút. Đăng nhập tốn CPU nhất: 500 người cùng một giây chờ 3–6 giây, rải đều chỉ ~45 ms.
- [ ] Người ra đề biết cách Cộng giờ, Đóng cửa vào thi và Hủy Phiên thi nếu máy gặp sự cố.

## 12. Giới hạn đã biết

- Một máy Windows duy nhất: sleep, cập nhật, mất điện hay mất mạng đều làm gián đoạn (ADR-0006). Phù hợp để demo và thi quy mô lớp; thi quan trọng nên chuyển sang VPS, dùng nguyên image và các lệnh trên, chỉ đổi env và nơi chạy.
- Băng thông upload của đường truyền nhà mạng quyết định tốc độ tải đề khi 500 người mở cùng lúc: cần đo bằng điện thoại thật trước khi tin vào số liệu mục 2.
- Chưa có workflow deploy tự động, chưa có cảnh báo khi pod chết. Cần ít nhất một cách báo (ví dụ kiểm tra health định kỳ từ bên ngoài) trước khi dùng cho thi thật.
