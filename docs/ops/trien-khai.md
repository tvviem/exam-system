# Triển khai và vận hành pod `prod-exam`

Tài liệu cho người vận hành hệ thống trên máy WSL Ubuntu (ADR-0006). Thiết kế và các quyết định ở [docs/plan/slice-6.md](../plan/slice-6.md). Khi chuyển sang VPS hoặc máy chủ tại nhà: [chuyen-len-vps.md](./chuyen-len-vps.md). Mọi lệnh chạy ở thư mục gốc của repo, qua `make -C infra …`; logic nằm ở [`infra/scripts/exam-ctl.sh`](../../infra/scripts/exam-ctl.sh).

> **Phạm vi hiện tại (PR 6a đến 6e):** dựng lần đầu, đưa bản mới lên bằng tay hoặc bằng workflow GitHub bấm tay (có sao lưu trước, kiểm sau, tự lùi), một hoặc hai bản api, dừng/bật, khôi phục Quản trị viên, tự dựng lại khi mở WSL, và **công cụ sao lưu và khôi phục** ([khoi-phuc.md](./khoi-phuc.md)): bản dump hằng đêm, lưu liên tục WAL, đẩy sang ổ D: và R2 mã hóa, thử khôi phục hằng tháng, báo ngoài máy. **Sao lưu đã bật thật từ 9/11/2026** (nhật ký: [khoi-phuc.md mục 4.9](./khoi-phuc.md)), có màn hình "Sao lưu dữ liệu" và chuông trong ứng dụng (6d). **Trước mỗi Phiên thi thật:** chạy `make -C infra prod-preflight` và làm theo [checklist-phien-thi.md](./checklist-phien-thi.md) (6e). Thử hai bản api trên pod thử: `make -C infra scale-drill-test`.
>
> **Quy mô dự kiến giai đoạn đầu (chủ dự án, 9/11/2026):** chạy thật trên WSL Ubuntu của laptop cho tiết kiệm nhất, phục vụ **dưới 100 sinh viên dự thi cùng lúc**. Số đo ở [hieu-nang.md](../hieu-nang.md) cho thấy **một bản api và một worker đủ** cho 100 người (đạt mọi ngưỡng, 0 lỗi), nên giữ mặc định một bản api; chỉ bật hai bản (`prod-scale N=2`) từ khoảng 300 người trở lên. Việc sao lưu chạy ở mức ưu tiên thấp để không làm chậm phòng thi trên cùng máy.

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
| Sao lưu (PR 6c) | bản sao ở `~/exam-prod-backups/` (`daily`, `weekly`, `monthly`, `base`, `wal`, `media`, `khoa`, `truoc-deploy-*`); cấu hình riêng của máy `~/exam-prod-secrets/backup.env`; sổ kết quả `~/.local/state/exam-prod/backup-runs.jsonl`; timer `exam-backup-*` trong `~/.config/systemd/user/`. Chi tiết: [khoi-phuc.md](./khoi-phuc.md) |

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
| Tình trạng sao lưu (bản mới nhất, dãy WAL, hàng chờ đẩy, timer) | `make -C infra prod-backup-status` |
| Bật lưu liên tục WAL (dựng lại **chỉ** PostgreSQL, từ chối nếu có Phiên thi) | `make -C infra prod-enable-archiving` |

Mọi việc sao lưu và khôi phục (cài đặt lần đầu, các lệnh chạy tay, khôi phục theo từng kịch bản, báo động): **[khoi-phuc.md](./khoi-phuc.md)**. Hai điểm liên quan đến deploy: (1) container PostgreSQL chỉ bị dựng lại bởi `prod-enable-archiving`/`prod-disable-archiving` và khi `prod-down` rồi dựng lại; `prod-up` và workflow deploy **không** đụng nó, nên các tham số lưu liên tục được giữ qua mọi lần deploy; (2) sau khi merge thay đổi script sao lưu, chạy `make -C infra prod-backup-install` để cập nhật bản chép mà timer dùng.

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

Lệnh tải ảnh, chạy migration, thay api (rồi api thứ hai nếu có), worker, web, đợi `/api/health`, ghi bản đang chạy vào `~/.local/state/exam-prod/tag`. Api thay lần lượt, đợi từng bản sẵn sàng nên không có khoảng hở; riêng web (một container giữ cổng) mất khoảng 1 giây không kết nối được lúc thay. Lỗi thì in log và thoát khác 0. **Quay lui** là chạy lại với TAG cũ (migration chỉ thêm theo kiểu expand, nên bản cũ vẫn chạy trên cơ sở dữ liệu mới). `prod-up` chỉ làm phần thay bản; **đủ quy trình** (sao lưu trước, kiểm sau, tự lùi, ghi `audit_logs`, dọn ảnh cũ) là `prod-deploy` hoặc workflow GitHub ở mục bên dưới.

### Deploy bằng GitHub (cách dùng hằng ngày, PR 6b)

Workflow `Deploy (bấm tay)` ([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)) chạy trên máy WSL này (runner `wsl-exam`), gọi `exam-ctl.sh deploy`. Đây là cách nên dùng: có đủ chốt chặn và để lại dấu vết.

**Điều kiện (làm một lần, đã xong nếu theo mục 2):**
- Pod `prod-exam` đã `prod-bootstrap`.
- **WSL đang mở** và runner `wsl-exam` đang chạy. Kiểm: GitHub → repo → Settings → Actions → Runners: `wsl-exam` phải là **Idle** (xanh). Kiểm trong máy: `systemctl status actions.runner.tvviem-exam-system.wsl-exam.service` thấy `active (running)`. Runner tắt khi tắt WSL, nên deploy chỉ làm được lúc bạn đang mở Ubuntu.
- Environment `production` đã có (người duyệt là bạn, chỉ cho nhánh `main`), và chính sách duyệt PR từ fork là `all_external_contributors`. Kiểm bằng:
  ```bash
  gh api repos/tvviem/exam-system/environments/production --jq '{rules:[.protection_rules[]|.type],policy:.deployment_branch_policy}'
  gh api repos/tvviem/exam-system/actions/permissions/fork-pr-contributor-approval
  ```
  Kết quả đúng: có `required_reviewers` và `branch_policy`; `approval_policy` là `all_external_contributors`.

**Các bước mỗi lần deploy:**

1. **Chờ CI của commit cần deploy xanh đủ.** Ảnh chỉ được đẩy lên GHCR khi kiểm tra và integration xanh, và chỉ ở lần chạy sau khi merge vào `main`. Vừa merge xong thì đợi vài phút cho job "Image api" và "Image web" của lần chạy trên `main` xanh.
2. Vào GitHub → tab **Actions** → chọn **Deploy (bấm tay)** ở cột trái → **Run workflow**.
3. Ô **Branch** để `main`. Ô **Mã commit** để **trống** (= commit mới nhất của `main`). Ô **lý do ép** để **trống** (chỉ điền khi khẩn cấp, xem bên dưới). Bấm **Run workflow** màu xanh.
4. Lần chạy hiện trạng thái vàng "Waiting" kèm **Review deployments**. Mở lần chạy, bấm **Review deployments**, tick `production`, bấm **Approve and deploy**. (Bước này có chủ đích: để bạn xem lại trước khi chạy lệnh thật trên máy.)
5. Theo dõi log. Bình thường mất khoảng 30–60 giây. Xong thì mở **Summary** của lần chạy để đọc tóm tắt (bảng dưới).
6. Kiểm bằng trình duyệt: mở địa chỉ hệ thống, đăng nhập Quản trị viên, vào **Nhật ký** (Nhật ký thao tác): có dòng **Đưa bản mới lên** với bản cũ → bản mới, người bấm và đường dẫn lần chạy.
7. Kiểm "người giám sát" của container còn sống (nên làm sau mỗi deploy qua GitHub; giải thích ở mục "Lỗi thường gặp", dòng 502 + `Stopping`):
   ```bash
   for c in api worker web; do p=$(podman inspect -f '{{.State.ConmonPid}}' prod-exam-$c); echo "$c conmon=$p $(ps -p $p -o comm= || echo CHẾT)"; done
   ```
   Cả ba dòng phải ra `conmon`. Có dòng `CHẾT` thì lần deploy kế tiếp sẽ kẹt: chạy khôi phục ở mục "Lỗi thường gặp" ngay lúc không có Phiên thi.

**Đã thử qua runner thật (8–9/11/2026):** deploy bản mới → lùi bản bằng mã cũ → deploy lại, cả ba lần đạt và conmon sống sau mỗi lần (chi tiết ở `docs/plan/slice-6.md`, mục PR 6b.1).

**Đọc tóm tắt (Summary):**

| Dòng | Ý nghĩa | Cần làm |
|---|---|---|
| ✅ Chốt chặn Phiên thi | Không có Phiên thi đang diễn ra hay sắp bắt đầu (trong 60 phút) | không |
| ⚠️ Chốt chặn Phiên thi: ép | Bạn đã điền lý do ép | đảm bảo thật sự cần |
| ✅ Sao lưu trước deploy | Đã chụp `pg_dump` vào `~/exam-prod-backups/truoc-deploy-…dump` và kiểm đọc được | giữ nguyên |
| ✅ Kiểm trong máy | `/api/health` ok, PostgreSQL và Redis up, `version` đúng bằng bản vừa chọn | không |
| ✅ / ⚠️ Địa chỉ công khai | ✅ người dự thi vào được bằng tên miền; ⚠️ chưa vào được (thường do tunnel Cloudflare), **không phải lỗi của bản mới** | ⚠️: xem mục 2 (tunnel) và bảng lỗi bên dưới |
| ✅ Đã ghi `audit_logs` | Có dòng lịch sử trong cơ sở dữ liệu | không |
| ❌ Bản mới lỗi … ✅ Đã **lùi về bản …** | Bản mới không lên, workflow đã **tự lùi một lần** về bản trước; lần chạy báo đỏ để bạn không bỏ sót | đọc log cuối trong Summary, sửa lỗi rồi deploy lại bản mới |
| 🛑 Lùi … cũng lỗi | Cả hai bản đều không lên: hệ thống có thể đang ngừng | xem bảng lỗi bên dưới |

**Lùi bản (rollback) có chủ đích:**
1. Tìm mã của bản tốt trước đó: trong **Summary** của lần chạy trước, dòng "Tag đang chạy trước đó"; hoặc trên máy `cat ~/.local/state/exam-prod/deployed-tags` (mỗi dòng một bản, dòng cuối là bản đang chạy).
2. **Run workflow** như trên nhưng điền mã đó vào ô **Mã commit** (7–40 ký tự `0-9a-f`; mã rút gọn được). Workflow từ chối nếu mã không thuộc `main` hoặc ảnh không còn.
3. Chỉ lùi **mã** ứng dụng, không lùi dữ liệu. Migration chỉ thêm (kiểu expand) nên bản cũ vẫn chạy trên cơ sở dữ liệu mới. Ảnh của 3 bản gần nhất được giữ sẵn trên máy nên lùi rất nhanh; bản cũ hơn sẽ được tải lại từ GHCR.

**Ép khi khẩn cấp:** điền **lý do ép** (một dòng) khi có lỗi nghiêm trọng cần sửa ngay mà đang có Phiên thi, hoặc sao lưu trước deploy hỏng nhưng bắt buộc phải deploy. Lý do được ghi vào Summary, `operations.log` và `audit_logs`. Deploy lúc có Phiên thi làm thí sinh gián đoạn vài giây đến khoảng 25 giây (Socket.IO tự nối lại, bài đã lưu không mất); chỉ dùng khi lợi hơn hại.

**Chạy từ terminal (khi GitHub hoặc runner không dùng được):**
```bash
make -C infra prod-deploy TAG=<mã commit đầy đủ>        # đủ quy trình như workflow
FORCE_REASON="lý do" make -C infra prod-deploy TAG=...   # ép khẩn cấp
```
Tóm tắt ghi ở `~/.local/state/exam-prod/last-deploy-summary.md`, log lỗi ở `last-failure.log`.

**Sao lưu trước deploy:** file `~/exam-prod-backups/truoc-deploy-<ngày-giờ>-<bản cũ>.dump` (định dạng `pg_dump -Fc`), mỗi lần deploy một file, giữ 10 file mới nhất. Chỉ chống được lỗi phần mềm/migration, **không** chống hỏng ổ đĩa; sao lưu định kỳ và ngoài máy là phần của [khoi-phuc.md](./khoi-phuc.md). Khôi phục từ file này: `bash infra/scripts/exam-backup.sh restore-dump ~/exam-prod-backups/truoc-deploy-….dump` (khoi-phuc.md mục 5.2).

**Quy ước cho người sửa script (Q349):** workflow luôn dùng `infra/scripts/exam-ctl.sh` của commit `main` lúc bấm, kể cả khi lùi ảnh về bản cũ. Vì vậy script vận hành chỉ được gọi những lệnh mà **ảnh cũ cũng có** (hiện: `node dist/db/migrate.js`, `node dist/cli/main.js bootstrap-admin|recover-admin`). Cần lệnh mới trong ảnh thì phát hành lệnh đó trước một lần rồi mới dùng trong script, hoặc script dò xem có lệnh rồi mới gọi. Mỗi lần sửa script, chạy thử `prod-deploy` trên pod `drill` (mục 7) với một ảnh cũ.

**Ba lớp bảo vệ máy (vì repo công khai và runner chạy lệnh thật trên máy này):** (1) workflow chỉ có sự kiện bấm tay, `ci.yml` không dùng runner `wsl-exam`; (2) PR từ người ngoài phải chờ bạn duyệt mới chạy CI; (3) mỗi lần deploy cần bạn bấm Approve, và Environment chỉ nhận lần chạy từ nhánh `main`. Giải thích và lý do ở [docs/plan/slice-6.md](../plan/slice-6.md), Q342–Q343. Đừng nới các lớp này; nếu thêm người cộng tác, bật `prevent_self_review` cho Environment.

## 4. Mở WSL thì hệ thống tự dựng lại (Q334)

`prod-bootstrap` cài dịch vụ `exam-prod.service` (systemd của user). Mở Ubuntu thì WSL khởi động systemd và dịch vụ chạy `podman pod start prod-exam`; tắt WSL thì dịch vụ dừng pod êm (PostgreSQL tắt sạch).

- **Không** có tác vụ Windows tự bật WSL: Windows tự khởi động lại thì hệ thống ngừng đến khi bạn mở Ubuntu.
- Kiểm: `systemctl --user status exam-prod.service` (phải `active (exited)`).
- **Trước khi tắt WSL hoặc chạy `wsl --shutdown`**: chạy `make -C infra prod-active-sessions`; không tắt khi có Phiên thi. Tắt chế độ ngủ của Windows và đặt giờ hoạt động cho Windows Update.

## 5. Quên mật khẩu Quản trị viên

Hệ thống không có email nên không có "quên mật khẩu" tự phục vụ. **Người ra đề và Người dự thi quên mật khẩu:** Quản trị viên dùng "Cấp lại mật khẩu tạm" trong giao diện; cách làm từng bước, quy trình xác minh danh tính và giới hạn của cách này: [tai-khoan-va-mat-khau.md](./tai-khoan-va-mat-khau.md). **Quản trị viên quên mật khẩu** (hoặc không còn ai đăng nhập được): người có quyền vào máy khôi phục:

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
podman volume rm drill_exam_pgdata drill_exam_media && rm -rf ~/exam-drill-secrets ~/.local/state/exam-drill ~/exam-drill-backups
```

Thử quy trình deploy đủ bước (không đụng dữ liệu thật): `EXAM_STAGE=drill make -C infra prod-deploy TAG=<TAG>`. Muốn thử ca bản mới lỗi thì dựng một ảnh cố tình hỏng (ví dụ `FROM <ảnh api tốt>` rồi `CMD ["node","-e","process.exit(1)"]`), gắn tên cùng kho với ảnh tốt (`localhost/exam-api:bad` và `localhost/exam-api:good`) và chạy `API_IMAGE=… WEB_IMAGE=… EXAM_STAGE=drill make -C infra prod-deploy`: workflow phải báo đỏ và tự lùi về bản trước. Thư mục sao lưu của pod thử là `~/exam-drill-backups`.

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
| Workflow deploy kẹt ở "Waiting" mãi | Chưa bấm **Review deployments → Approve**; hoặc runner `wsl-exam` đang offline (WSL tắt): mở Ubuntu rồi `systemctl status actions.runner.tvviem-exam-system.wsl-exam.service` |
| Workflow báo "Chưa có ảnh …" | CI của commit đó chưa xong hoặc đỏ; chờ job "Image api/web" trên `main` xanh rồi bấm lại |
| Workflow báo "Commit … không nằm trong nhánh main" | Chỉ deploy được commit của `main`; dán mã đúng hoặc để trống ô mã |
| "Không sao lưu được trước deploy nên dừng" | Hệ thống đang chạy chưa bị đụng. Kiểm chỗ đĩa (`df -h ~`, `du -sh ~/exam-prod-backups`) và `make -C infra prod-status`; xử lý xong thì bấm lại. Khẩn cấp thì điền lý do ép |
| Summary ⚠️ "Địa chỉ công khai chưa trả lời" | Hệ thống trong máy chạy tốt; lỗi nằm ở đường ra ngoài: kiểm tunnel (`systemctl status cloudflared`, `/etc/cloudflared/config.yml` có host `exam.…`), rồi `curl -fsS https://<tên miền>/api/health` |
| Summary 🛑 "Lùi … cũng lỗi" | `make -C infra prod-status`, `prod-logs C=api`, `C=postgres`. Thường do PostgreSQL hoặc Redis chết: `podman pod restart prod-exam`. Dữ liệu còn nguyên; bản sao lưu trước deploy nằm ở `~/exam-prod-backups` |
| Trang trả 502, `prod-status` thấy container ở trạng thái `Stopping` (hoặc `podman rm` báo `container state improper`) | Container mất người giám sát (`conmon` chết). Khôi phục: `podman rm -f -t 5 prod-exam-api prod-exam-worker prod-exam-web` (không đụng PostgreSQL, Redis và volume), rồi `make -C infra prod-up TAG=<bản tốt>` (tag đang chạy xem ở `cat ~/.local/state/exam-prod/tag`). Nguyên nhân đã sửa ở PR 6b.1 (runner GitHub giết `conmon`), xem `docs/plan/slice-6.md` |
| `prod-backup-status` ghi CHƯA/LỖI, hoặc nhận thư "im lặng" từ healthchecks | Xem [khoi-phuc.md mục 3](./khoi-phuc.md): timer có chạy không (`systemctl --user list-timers 'exam-backup-*'`), `journalctl --user -u exam-backup-nightly.service -n 50`, sổ `backup-runs.jsonl` |
| Workflow đỏ ở bước "Chuẩn bị Podman" | Không thấy pod `prod-exam`: chưa bootstrap hoặc runner chạy bằng người dùng khác `tvviem` |
