# Chuyển hệ thống sang VPS hoặc máy chủ tự host tại nhà

Tài liệu cho người vận hành, dùng **khi đến lúc** chuyển `prod-exam` từ laptop WSL Ubuntu sang một máy chạy 24/7. Nền tảng: [ADR-0006](../adr/0006-podman-pod-tren-wsl-qua-cloudflare-tunnel.md) (giai đoạn 1 chạy ở WSL, chuyển VPS khi hệ thống đã ổn định), [trien-khai.md](./trien-khai.md) (vận hành hằng ngày), [docs/plan/slice-6.md](../plan/slice-6.md) (thiết kế).

> **Trạng thái: hướng dẫn chuẩn bị trước, CHƯA chạy thử trên máy thật.** Chủ dự án chốt hướng này ngày 9/11/2026: chạy ổn định trên WSL trước, khi có điều kiện thuê VPS hoặc mua máy chủ đặt tại nhà thì chuyển sang. Các lệnh dính đến phần mềm bên thứ ba (Cloudflare, GitHub runner, gói Ubuntu) có thể đổi theo phiên bản, nên **đối chiếu với tài liệu chính thức của họ ở thời điểm làm** (đường dẫn ở cuối mỗi mục). Khi thực sự chuyển, cập nhật tài liệu này theo những gì đã chạy đúng, và viết **ADR mới thay thế ADR-0006** (quy tắc của dự án: đổi quyết định đã ghi thì viết ADR mới).

## 0. Vì sao chuyển, và chọn VPS hay máy tại nhà

Lý do chính là độ sẵn sàng: laptop ngủ, Windows Update, mất điện hay đóng nắp đều làm gián đoạn Phiên thi (ADR-0006). Máy chạy 24/7 cũng làm sao lưu, chuông báo và healthchecks đơn giản hơn (không còn "máy tắt là bình thường", xem mục 9).

| | VPS thuê | Máy chủ tự host tại nhà |
|---|---|---|
| Tiền | Thuê theo tháng, không tốn vốn | Mua máy một lần; tiền điện; nên có UPS |
| Điện, mạng | Nhà cung cấp lo | Bạn lo. Mất điện hay mạng là mất dịch vụ |
| Cổng mạng | Có IP công khai; vẫn **không cần mở cổng web** vì dùng Cloudflare Tunnel | Không cần mở cổng modem, không cần IP tĩnh, qua được CGNAT, vì tunnel chỉ gọi **ra** ngoài |
| Hỏng phần cứng | Nhà cung cấp thay | Bạn tự xử; cần ổ cứng dự phòng và bản sao lưu ngoài máy (R2) đã thử khôi phục |
| Tốc độ thi | Đường truyền trung tâm dữ liệu, ổn định | Phụ thuộc đường upload của nhà mạng nhà bạn |
| Phù hợp khi | Cần ổn định cao, không muốn tự giữ phần cứng | Ngân sách thấp, đã có chỗ đặt máy an toàn |

**Cỡ máy tối thiểu gợi ý** (ước tính từ [hieu-nang.md](../hieu-nang.md): ca 500 người, hai api và worker, CPU trung bình 68 %, đỉnh 285 % của một lõi, RAM đỉnh khoảng 1,2 GB; cộng PostgreSQL, Redis, nginx và hệ điều hành): **4 vCPU, 4 GB RAM (nên 8 GB), SSD từ 40 GB** (dữ liệu và bản sao lưu cục bộ tăng dần, xem phần dung lượng ở slice-6). Hệ điều hành: **Ubuntu Server 24.04 LTS**, kiến trúc **amd64** (ảnh `exam-api`, `exam-web` của CI hiện chỉ build cho amd64; máy ARM cần build đa kiến trúc, chưa làm). Gói `podman` trong kho Ubuntu 24.04 là bản 4.9.x, **cùng dòng đang chạy ở WSL**, nên script `exam-ctl.sh` chạy y nguyên.

**Máy tại nhà, thêm các việc:** bật trong BIOS "tự bật khi có điện lại" (Restore on AC Power Loss), cắm dây mạng thay vì Wi-Fi, đặt trong chỗ thoáng, nên có UPS đủ để tắt êm khi mất điện, và đặt Ubuntu tự cập nhật bảo mật nhưng **không** tự khởi động lại vào giờ thi (mục 2).

## 1. Cái gì đổi, cái gì giữ nguyên

| Thành phần | Ở WSL hiện tại | Trên máy mới |
|---|---|---|
| Podman pod `prod-exam`, ảnh, `exam-ctl.sh`, `make -C infra prod-*` | có | **giữ nguyên** (đó là mục đích của thiết kế, ADR-0006) |
| Khởi động tự động | `exam-prod.service` (systemd người dùng) chạy khi mở WSL | cùng dịch vụ, chạy khi **máy khởi động** (cần `Linger=yes`, mục 3) |
| Cloudflare Tunnel | `cloudflared` dùng chung tunnel với plo-tracker | **tunnel riêng** cho máy mới (mục 5) |
| GitHub runner | `wsl-exam`, thư mục `~/actions-runner-exam-sys` | **runner mới** đăng ký lại, gỡ runner cũ (mục 6) |
| Bản sao lưu cục bộ | `~/exam-prod-backups/` và ổ `D:` của Windows | `~/exam-prod-backups/` và **ổ/phân vùng thứ hai** (hoặc thôi bản "D:") |
| Báo cáo "còn sống" | không có (laptop tắt là bình thường) | healthchecks.io **báo khi mất tín hiệu** |
| Tên công khai | `exam.plotrackerbluni.site` | **giữ nguyên tên**, chỉ đổi nơi tên trỏ tới |

## 2. Chuẩn bị máy chủ

Chạy trên máy mới, với tài khoản quản trị tạm thời. **Không** dùng `root` đăng nhập hằng ngày.

1. **Cài Ubuntu Server 24.04 LTS**, đặt múi giờ và cập nhật:
   ```bash
   sudo timedatectl set-timezone Asia/Ho_Chi_Minh
   sudo apt update && sudo apt full-upgrade -y
   ```
   Phiên thi tính thời gian bằng **giờ server**, nên đồng hồ phải đúng: `timedatectl` phải báo `System clock synchronized: yes`.
2. **Tạo người dùng vận hành** (ví dụ `tvviem`, **cùng tên** với người dùng WSL để các đường dẫn và tài liệu cũ vẫn đúng), có `sudo`:
   ```bash
   sudo adduser tvviem
   sudo usermod -aG sudo tvviem
   ```
3. **SSH chỉ dùng khóa, không dùng mật khẩu.** Từ máy của bạn: `ssh-copy-id tvviem@<địa-chỉ-máy>`. Rồi trên máy chủ sửa `/etc/ssh/sshd_config.d/` (một file riêng, ví dụ `50-exam.conf`) với:
   ```text
   PasswordAuthentication no
   PermitRootLogin no
   ```
   rồi `sudo systemctl restart ssh`. **Giữ nguyên một cửa sổ SSH đang mở** khi thử, để lỡ sai còn sửa được.
4. **Tường lửa:** chỉ cho SSH vào; web **không cần mở cổng** vì dùng tunnel:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow OpenSSH
   sudo ufw enable
   ```
   Cổng `8180` của pod chỉ gắn vào `127.0.0.1`, người ngoài không chạm tới được.
5. **Cập nhật bảo mật tự động nhưng không tự khởi động lại:**
   ```bash
   sudo apt install -y unattended-upgrades
   sudo dpkg-reconfigure --priority=low unattended-upgrades
   ```
   Đảm bảo `Unattended-Upgrade::Automatic-Reboot "false";` trong `/etc/apt/apt.conf.d/50unattended-upgrades` (mặc định là `false`). Khi bản vá kernel cần khởi động lại, **bạn** chọn lúc không có Phiên thi (`make -C infra prod-active-sessions` trước), rồi `sudo reboot`.
6. **Bộ nhớ ảo (swap)** nếu RAM ≤ 4 GB: một file swap 2 GB để tránh bị ép tắt tiến trình khi đỉnh tải.
7. **Công cụ cần có:** `sudo apt install -y git make curl openssl jq rclone gnupg`.

## 3. Cài Podman và chế độ rootless

Điều kiện y như ở WSL (xem trien-khai.md mục 2): Podman, systemd, `Linger=yes`.

```bash
sudo apt install -y podman uidmap slirp4netns   # tên gói có thể đổi theo bản Ubuntu; podman --version phải là 4.x trở lên
podman --version
grep "^$USER:" /etc/subuid /etc/subgid          # phải có một dòng mỗi file (dải ID cho container rootless)
sudo loginctl enable-linger "$USER"             # để dịch vụ của bạn chạy từ lúc máy khởi động, không cần đăng nhập
loginctl show-user "$USER" | grep Linger        # phải là Linger=yes
```

Đăng nhập lại SSH một lần để `XDG_RUNTIME_DIR` (`/run/user/<uid>`) có hiệu lực, rồi thử:

```bash
podman run --rm docker.io/library/alpine:3 echo "podman rootless chạy được"
```

Tham chiếu: tài liệu Podman rootless (`rootless_tutorial.md` trong kho `containers/podman`).

## 4. Lấy mã nguồn và dựng pod

```bash
mkdir -p ~/myprojects && cd ~/myprojects
git clone https://github.com/tvviem/exam-system.git
cd exam-system
```

Ảnh `ghcr.io/tvviem/exam-api` và `exam-web` đã công khai, **không cần đăng nhập** để tải.

Hai trường hợp:

**4A. Cài mới, không mang dữ liệu cũ** (ví dụ dựng thêm môi trường thử): làm đúng [trien-khai.md mục 2](./trien-khai.md) từ bước 1, `make -C infra prod-bootstrap TAG=<mã commit đầy đủ>`. Lệnh sinh khóa mới, hỏi mật khẩu Quản trị viên và cài `exam-prod.service`.

**4B. Chuyển hệ thống đang chạy, mang theo dữ liệu thi** (trường hợp của tài liệu này): **không** chạy `prod-bootstrap` trước, vì nó sinh khóa mới và tạo Quản trị viên mới. Làm theo mục 7 (có thứ tự quan trọng).

## 5. Cloudflare Tunnel cho máy mới

**Khuyến nghị: tạo tunnel riêng cho máy mới** (tách khỏi plo-tracker và khỏi tunnel `8ab9c776-…` đang dùng ở WSL), rồi chuyển tên `exam.plotrackerbluni.site` sang tunnel mới vào lúc cắt chuyển (mục 7).

> ⚠️ **Không chạy hai `cloudflared` cùng một tunnel ID trên hai máy trừ khi cố ý.** Cloudflare coi chúng là hai bản của cùng một tunnel và **chia lưu lượng cho cả hai**; một nửa người dự thi có thể vào máy cũ (WSL) nơi dữ liệu đã cũ. Vì vậy dùng tunnel riêng và chỉ **đổi bản ghi DNS** khi sẵn sàng.

Các bước (tham chiếu: tài liệu "Cloudflare Tunnel", mục "Create a locally-managed tunnel"; đối chiếu lệnh với `cloudflared --help` của phiên bản đang cài):

1. Cài `cloudflared` từ kho gói của Cloudflare (đối chiếu hướng dẫn "Downloads" của họ cho Ubuntu), kiểm `cloudflared --version`.
2. Đăng nhập một lần, chọn đúng vùng `plotrackerbluni.site`, rồi tạo tunnel:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create exam-prod       # in ra TUNNEL_ID và ghi file credentials JSON vào ~/.cloudflared/
   ```
3. Viết cấu hình (đường dẫn dùng chung cho dịch vụ hệ thống: `/etc/cloudflared/config.yml`):
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /etc/cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: exam.plotrackerbluni.site
       service: http://127.0.0.1:8180
     - service: http_status:404
   ```
   Chép file credentials sang `/etc/cloudflared/` (`sudo cp`, quyền `600`, chủ sở hữu `root`).
4. Kiểm cấu hình và cài làm dịch vụ systemd (chạy từ lúc khởi động):
   ```bash
   cloudflared tunnel ingress validate
   sudo cloudflared --config /etc/cloudflared/config.yml service install
   sudo systemctl enable --now cloudflared
   sudo systemctl status cloudflared --no-pager      # phải là active (running)
   ```
5. **Chưa trỏ DNS ở bước này** (tên vẫn trỏ về tunnel cũ ở WSL). Bản ghi DNS chỉ đổi ở mục 7, lúc cắt chuyển:
   ```bash
   cloudflared tunnel route dns --overwrite-dns <TUNNEL_ID> exam.plotrackerbluni.site
   ```
   Nếu lệnh này tạo bản ghi sai vùng (nó theo vùng chọn lúc `tunnel login`), sửa tay trong bảng điều khiển Cloudflare: bản ghi `CNAME` tên `exam` trỏ tới `<TUNNEL_ID>.cfargotunnel.com`, bật proxy (mây cam). Xem ghi chú tương tự ở [demo-wsl.md](./demo-wsl.md) mục 7.

Giữ nguyên cài đặt Cloudflare đã làm cho giờ thi: SSL/TLS chế độ **Full**; tắt Bot Fight Mode và Under Attack Mode trong giờ thi; không giới hạn tần suất theo IP cho `/api/*` (trien-khai.md mục 2, bước 4).

## 6. GitHub Actions runner trên máy mới (để bấm tay chạy workflow deploy)

Workflow `Deploy (bấm tay)` ([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)) chạy lệnh thật trên máy có pod, nên cần một **runner self-hosted** trên máy mới. Repo công khai, nên **giữ nguyên ba lớp bảo vệ** ở [trien-khai.md](./trien-khai.md) (workflow chỉ bấm tay, Environment `production` bắt Approve và chỉ nhận nhánh `main`, PR từ người ngoài phải chờ duyệt). Chúng nằm ở cấu hình **repo GitHub**, không phải trên máy, nên không mất khi đổi máy; vẫn nên kiểm lại bằng hai lệnh `gh api` ở trien-khai.md.

**Bước 1: nhãn (label) của runner.** `deploy.yml` đang có `runs-on: [self-hosted, wsl-exam]`. Có hai cách:
- *Cách đơn giản, không sửa workflow:* đăng ký runner mới với nhãn `wsl-exam` (tên nhãn sẽ sai nghĩa nhưng chạy được). Chỉ làm vậy nếu **đã gỡ runner cũ** (bước 4), kẻo job rơi vào máy cũ.
- *Cách sạch (khuyến nghị):* mở một PR đổi `wsl-exam` thành `exam-prod` ở `deploy.yml`, `docs/architecture.md` §9 và các tài liệu nhắc tới, và đăng ký runner mới với **cả hai nhãn** `wsl-exam,exam-prod` trong thời gian chuyển; gỡ nhãn cũ sau khi xong.

**Bước 2: lấy mã đăng ký.** GitHub → repo `exam-system` → **Settings → Actions → Runners → New self-hosted runner** → chọn Linux x64. Trang này hiện **đúng các lệnh tải bản runner mới nhất** và một **mã đăng ký (token) dùng một lần, hết hạn sau khoảng một giờ**. Làm theo trang đó để tải và giải nén vào thư mục riêng, ví dụ:

```bash
mkdir -p ~/actions-runner-exam && cd ~/actions-runner-exam
# chép lệnh curl và tar từ trang "New self-hosted runner" (phiên bản trong lệnh là bản mới nhất)
```

**Bước 3: đăng ký và cài làm dịch vụ hệ thống.**

```bash
./config.sh --url https://github.com/tvviem/exam-system --token <MÃ-ĐĂNG-KÝ> \
  --name exam-prod-vps --labels exam-prod,wsl-exam --unattended   # chỉ giữ nhãn cần dùng (bước 1)
sudo ./svc.sh install tvviem      # tên người dùng chạy dịch vụ: người dùng vận hành, KHÔNG phải root
sudo ./svc.sh start
sudo ./svc.sh status
```

Dịch vụ hệ thống có tên dạng `actions.runner.tvviem-exam-system.<tên-runner>.service` (xem tên đúng bằng `systemctl list-units 'actions.runner.*'`). Kiểm trên GitHub: runner phải **Idle** (xanh).

Ba điều rút ra từ lần chạy thật ở WSL (xem slice-6, mục PR 6b.1), **đã được workflow và `exam-ctl.sh` xử lý sẵn**, chỉ cần biết để khỏi bất ngờ:
- Dịch vụ runner **không có phiên đăng nhập**, nên workflow tự đặt `XDG_RUNTIME_DIR` và `DBUS_SESSION_BUS_ADDRESS` cho Podman (nhờ `Linger=yes` thư mục `/run/user/<uid>` có sẵn).
- Runner **giết các tiến trình mồ côi** khi job kết thúc; `conmon` của container dựng trong job từng bị giết. `exam-ctl.sh` đã `unset RUNNER_TRACKING_ID` và `workflow` đặt rỗng biến này. **Sau lần deploy đầu tiên trên máy mới, kiểm tay** rằng conmon còn sống (trien-khai.md mục 3, bước 7).
- Dịch vụ runner phải giữ `KillMode=process` (mặc định của `svc.sh`), để dừng dịch vụ không kéo chết container. Kiểm: `systemctl cat <tên-dịch-vụ> | grep KillMode`.

**Bước 4: gỡ runner cũ (WSL)** ngay sau khi runner mới Idle, **trước** khi bấm workflow đầu tiên:
- GitHub → Settings → Actions → Runners → runner `wsl-exam` → **Remove**; và trên WSL: `sudo ./svc.sh stop && sudo ./svc.sh uninstall` rồi `./config.sh remove --token <mã-gỡ>` trong `~/actions-runner-exam-sys`.
- Nếu không gỡ, workflow có thể chạy nhầm lên máy cũ.

**Bước 5: thử** đúng như đã thử ở WSL: bấm workflow ba lần (bản mới nhất, lùi về một bản cũ, deploy lại) và kiểm sau mỗi lần: `/api/health` đúng `version`, conmon của api, worker, web còn sống, có dòng `ops.deploy` trong Nhật ký.

Tham chiếu: tài liệu GitHub "Adding self-hosted runners" và "Configuring the self-hosted runner application as a service".

## 7. Cắt chuyển: mang dữ liệu từ WSL sang máy mới

**Làm lúc không có Phiên thi** (`make -C infra prod-active-sessions` ở WSL phải báo không có), nên chọn đêm hoặc cuối tuần. Dự trù khoảng 1 đến 2 giờ cho lần đầu. Mục tiêu: **tại mọi thời điểm chỉ một máy nhận người dùng**.

### 7.1. Chuẩn bị trước (máy mới đã sẵn sàng từ mục 2 đến 6, hệ thống cũ vẫn chạy)

- Mở trình quản lý mật khẩu (Bitwarden): lấy `POSTGRES_PASSWORD` và `SLIP_ENCRYPTION_KEY`. **Phải dùng đúng các giá trị cũ**: đổi `SLIP_ENCRYPTION_KEY` thì Phiếu tài khoản còn hạn không mở lại được; đổi mật khẩu PostgreSQL thì phải khớp với dữ liệu đã khôi phục.
- Trên máy mới, tạo thư mục bí mật và **đặt trước hai file env** giống file ở WSL (cách nhanh nhất là chép nguyên từ WSL qua `scp`, rồi `chmod 600`):
  ```bash
  mkdir -p ~/exam-prod-secrets && chmod 700 ~/exam-prod-secrets
  scp tvviem@<máy-WSL-hoặc-qua-USB>:~/exam-prod-secrets/{postgres,api}.env ~/exam-prod-secrets/
  chmod 600 ~/exam-prod-secrets/*.env
  ```
  Nếu không chép được trực tiếp, tạo lại hai file theo đúng mẫu mà `exam-ctl.sh` tạo (hàm `create_secrets`: `postgres.env` có `POSTGRES_USER=exam`, `POSTGRES_PASSWORD`, `POSTGRES_DB=exam`; `api.env` có các biến `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `APP_ORIGINS`, `SLIP_ENCRYPTION_KEY`, `MEDIA_DIR`, …), điền giá trị từ Bitwarden. `APP_ORIGINS` phải là `https://exam.plotrackerbluni.site`.
- Kiểm ảnh của bản đang chạy có sẵn: `cat ~/.local/state/exam-prod/tag` ở WSL cho biết `TAG` đang chạy; dùng **cùng TAG** cho máy mới để dữ liệu và mã khớp nhau.

### 7.2. Đóng băng máy cũ và chụp dữ liệu (bắt đầu thời gian ngừng dịch vụ)

Ở **WSL**:

```bash
make -C infra prod-active-sessions      # phải không có Phiên thi
make -C infra prod-stop                 # dừng pod êm; PostgreSQL tắt sạch; người dùng thấy 502 từ lúc này
```

Bật lại **chỉ PostgreSQL** để chụp (hoặc dùng bản `pg_dump` sao lưu mới nhất nếu 6c đã có và vừa chạy xong): đường chắc chắn nhất là một bản `pg_dump -Fc` mới, kiểm `pg_restore --list`, cùng một bản chép volume `exam_media`:

```bash
# Ví dụ khái niệm; lệnh chính xác sẽ nằm ở docs/ops/khoi-phuc.md (PR 6c) và đã thử trên pod drill
podman volume export exam_media -o ~/exam-media-chuyen.tar
```

Chép hai file (bản dump và `exam-media-chuyen.tar`) sang máy mới bằng `scp` hoặc qua R2 (mã hóa trước). **Chưa xóa gì ở WSL.**

### 7.3. Dựng và khôi phục trên máy mới

Trên **máy mới**:

1. Dựng pod và hạ tầng với `TAG` cũ nhưng **chưa cho người dùng vào**: `make -C infra prod-up TAG=<TAG>` (đã có hai file env nên không sinh khóa mới). *Chưa thử trên máy thật; nếu `prod-up` yêu cầu pod đã có, dựng bằng bước tương ứng của `prod-bootstrap` rồi ngắt phần tạo Quản trị viên. Ghi lại cách đúng vào tài liệu này.*
2. **Dừng api, worker, web** trong lúc khôi phục (chỉ để PostgreSQL và Redis chạy).
3. Khôi phục dữ liệu vào CSDL trống theo [khoi-phuc.md](./khoi-phuc.md) mục 5.2 (`restore-dump` bản dump vừa chụp ở bước 7.2; cần pod đã có, nên làm sau bước 1) và nạp ảnh theo mục 5.4 (`podman unshare` chép vào volume `exam_media` rồi trả quyền cho uid 1000; `podman volume import` cũng dùng được nếu bạn đã xuất volume thành `.tar`).
4. **Đối chiếu số dòng** trên cả hai máy trước khi đi tiếp (đề thi, Lượt làm bài, Câu trả lời, người dùng): các số phải bằng nhau. Chỉ bước tiếp khi khớp.
5. Bật api, worker, web: `make -C infra prod-start`. Kiểm trong máy: `curl -s http://127.0.0.1:8180/api/health` trả `ok` và `version` đúng `TAG`.
6. Đăng nhập thử bằng một tài khoản thật **qua địa chỉ nội bộ** (SSH tunnel hoặc `curl`) trước khi đổi DNS; mật khẩu `quantri` là mật khẩu **hiện tại** (đã đổi ở bước 5 của lần dựng đầu), vì dữ liệu được khôi phục chứ không tạo mới.

### 7.4. Đổi DNS (kết thúc thời gian ngừng dịch vụ)

1. Ở **WSL**, dừng luôn `cloudflared` nếu nó chỉ phục vụ tên này (ở WSL nó còn phục vụ plo-tracker nên **không dừng**; chỉ gỡ quy tắc `exam.plotrackerbluni.site` khỏi `/etc/cloudflared/config.yml`, `sudo systemctl restart cloudflared`). Bước này **đảm bảo máy cũ không còn nhận người dùng**.
2. Trỏ tên về tunnel mới (mục 5, bước 5): `cloudflared tunnel route dns --overwrite-dns <TUNNEL_ID> exam.plotrackerbluni.site`.
3. Đợi tối đa vài phút để DNS cập nhật, rồi kiểm từ **mạng ngoài** (điện thoại dùng 4G): `curl -s https://exam.plotrackerbluni.site/api/health`.
4. Kiểm Socket.IO qua tunnel bằng trình duyệt thật (vào trang Theo dõi một Phiên thi thử, xem dấu "trực tiếp"; xem checklist 6e).

### 7.5. Sau khi chuyển

- **Giữ nguyên dữ liệu ở WSL ít nhất hai tuần**, pod ở trạng thái dừng. Đừng xóa volume (chính sách của dự án: không có lệnh make nào xóa volume).
- **Không bật lại pod ở WSL** khi máy mới đã nhận ghi: hai bản dữ liệu sẽ lệch nhau. Quay lui chỉ an toàn nếu máy mới **chưa nhận thao tác ghi nào** (đổi DNS về tunnel cũ và `prod-start` ở WSL).
- Tắt `exam-prod.service` ở WSL để lần mở WSL sau không dựng lại pod: `systemctl --user disable --now exam-prod.service`.

## 8. Sao lưu trên máy mới

Công cụ và cách dùng: [khoi-phuc.md](./khoi-phuc.md). Trên máy mới làm lại mục 4 của tài liệu đó (khóa gpg công khai, `backup.env`, `prod-enable-archiving`, `prod-backup-install`, `prod-backup-enable`). Điểm khác so với laptop WSL:

- Bản chép "ổ D:" của Windows không còn. Thay bằng **một ổ hoặc phân vùng thứ hai** (nếu có) gắn tại một thư mục cố định rồi đặt `EXAM_BACKUP_MIRROR_DIR` trong `backup.env` trỏ vào đó (script **không** viết cứng `/mnt/d`). Nếu chỉ có một ổ, bản này chỉ chống được xóa nhầm chứ không chống hỏng ổ; bản còn lại (R2 mã hóa ngoài máy) vẫn là chỗ cứu. Lưu ý `prod-backup-check` báo lỗi nếu thư mục này không tạo/ghi được.
- **Khóa giải mã bản sao ở R2** (Q354) vẫn do bạn giữ ngoài máy (Bitwarden và bản giấy); máy mới chỉ có khóa **công khai** (nhập bằng `gpg --import`). `prod-backup-check` báo lỗi nếu khóa bí mật nằm trên máy.
- Tạo mã báo mới ở healthchecks.io cho máy mới (hoặc đổi địa chỉ ping trong `backup.env`), và **đóng** hoặc tạm dừng mã cũ của laptop để không báo oan.
- **Chuyển bucket R2 hay dùng bucket mới?** Dùng **cùng bucket** thì bản sao lưu cũ của laptop còn đó (hữu ích khi khôi phục), nhưng hai máy ghi cùng lúc sẽ lẫn WAL của hai hệ thống. Khi cắt chuyển, **tắt hẳn timer sao lưu của laptop** (`make -C infra prod-backup-disable`) trước khi bật ở máy mới; hoặc dùng bucket/tiền tố mới và giữ bucket cũ làm bản lưu trữ.
- **Bản nền và WAL không dùng lẫn giữa hai hệ thống:** WAL của máy mới thuộc một dòng thời gian (timeline) khác nếu bạn khôi phục bằng `pitr`; sau khi khôi phục thành công hãy chạy một **bản nền mới** ở máy mới (`make -C infra prod-backup-basebackup`).
- **Thử khôi phục sang máy khác** (bài diễn tập của PR 6e) chính là bài kiểm cho cuộc chuyển này: nếu đã diễn tập tốt thì mục 7 chỉ là làm lại có kiểm soát.
- Hẹn giờ ở máy chủ 24/7: timer `Persistent=true` vẫn giữ (phòng máy khởi động lại); nhưng "máy tắt là bình thường" không còn đúng, xem mục 9.

## 9. Việc vận hành khác đi khi chạy 24/7

- "Máy tắt là bình thường" (Q353) **không còn đúng**: healthchecks.io phải báo **ngay** khi mất tín hiệu "còn sống", và chuông "bản sao lưu cũ hơn 26 giờ" là sự cố thật. Cập nhật cách báo theo đó.
- Hẹn giờ sao lưu 02:00 chạy đúng giờ mỗi đêm; lớp "chạy bù khi bật máy" vẫn giữ để phòng máy khởi động lại.
- Thử một lần **khởi động lại máy** (`sudo reboot`, lúc không có Phiên thi): sau vài phút, `systemctl --user status exam-prod.service` là `active (exited)`, `make -C infra prod-status` thấy đủ container, `/api/health` ok, runner Idle, tunnel `active`. Đây là bài thử "tự dựng lại" thay cho `wsl --shutdown` ở WSL.
- Không còn lời dặn cắm sạc, tắt chế độ ngủ, giờ hoạt động của Windows Update (nay là cập nhật Ubuntu, mục 2 bước 5).
- Theo dõi dung lượng đĩa (WAL và bản sao lưu cục bộ), RAM, nhiệt độ (máy tại nhà): đặt một kiểm tra đơn giản gửi vào healthchecks hoặc email khi đĩa trên 80 %.

## 10. Phần trong repo còn gắn với WSL (sửa khi thực sự chuyển)

Danh sách để không bỏ sót khi làm; chưa sửa vì hiện còn chạy ở WSL:

| Chỗ | Việc |
|---|---|
| [ADR-0006](../adr/0006-podman-pod-tren-wsl-qua-cloudflare-tunnel.md) | Viết ADR mới (VPS hoặc tự host), đánh dấu ADR-0006 là `superseded` |
| `exam-ctl.sh` (thông điệp, `install_service`, usage) | Câu chữ "mở WSL thì pod tự dựng lại" → "khi máy khởi động" |
| `.github/workflows/deploy.yml`, `docs/architecture.md` §9 | Đổi nhãn runner `wsl-exam` → `exam-prod` (mục 6, bước 1) |
| `docs/ops/trien-khai.md` | Mục 4 ("Mở WSL thì hệ thống tự dựng lại"), các nhắc "WSL đang mở"; trỏ về tài liệu này |
| `docs/ops/demo-wsl.md` | Giữ làm lịch sử của môi trường demo; không dùng cho prod |
| Script sao lưu (6c) | Đường dẫn ổ `D:` phải cấu hình được, không viết cứng `/mnt/d` (ràng buộc thiết kế đã ghi ở slice-6) |
| `docs/hieu-nang.md` | Đo lại một lần trên máy mới (nhất là đường qua tunnel và upload của nhà mạng nếu tự host tại nhà) |

## 11. Checklist tổng cho cuộc chuyển

- [ ] Chạy ổn định ở WSL; sao lưu (6c, 6d) đã chạy và **đã thử khôi phục sang máy khác** (6e)
- [ ] Máy mới: Ubuntu 24.04, đồng hồ đúng, SSH khóa, ufw, cập nhật bảo mật tự động không tự khởi động lại (mục 2)
- [ ] Podman 4.x rootless chạy được, `Linger=yes` (mục 3)
- [ ] Mã nguồn đã clone; hai file env đặt đúng, quyền 600, đúng giá trị cũ (mục 4, 7.1)
- [ ] Tunnel riêng đã tạo, dịch vụ `active`, **chưa** trỏ DNS (mục 5)
- [ ] Runner mới Idle; đã thử bấm workflow 3 lần; runner cũ đã gỡ (mục 6)
- [ ] Cắt chuyển lúc không có Phiên thi; đối chiếu số dòng khớp; đổi DNS; kiểm từ mạng ngoài và Socket.IO (mục 7)
- [ ] Khởi động lại máy thử một lần; mọi thứ tự lên (mục 9)
- [ ] Healthchecks mới, mã cũ đã đóng; timer sao lưu chạy; một bản khôi phục thử thành công trên máy mới (mục 8)
- [ ] Giữ WSL (pod dừng, dữ liệu nguyên) hai tuần rồi mới dọn
- [ ] Cập nhật tài liệu theo thực tế; viết ADR mới thay ADR-0006 (mục 10)
