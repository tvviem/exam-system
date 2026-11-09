# Sao lưu và khôi phục dữ liệu của hệ thống thật

Tài liệu cho người vận hành (chủ dự án), để **tra cứu lâu dài và học**. Thiết kế và lý do từng quyết định ở [docs/plan/slice-6.md](../plan/slice-6.md) (Q323–Q328, Q351–Q361); triển khai hằng ngày ở [trien-khai.md](./trien-khai.md); chuyển sang máy chủ khác ở [chuyen-len-vps.md](./chuyen-len-vps.md). Mọi lệnh chạy ở thư mục gốc của repo qua `make -C infra …`; logic nằm ở [`infra/scripts/exam-backup.sh`](../../infra/scripts/exam-backup.sh) (và `exam-ctl.sh enable-archiving`, `pg-archive-wal.sh`).

> **Trạng thái (PR 6c):** công cụ đã viết và đã thử trên pod `drill-exam` bằng `make -C infra backup-drill-test` (R2 giả, khóa gpg giả, healthchecks giả). **Chưa bật cho hệ thống thật** và **chưa thử với R2 thật, healthchecks.io thật**. Việc bật thật là mục 4, làm **cùng nhau từng bước**. Cho đến khi mục 4 xong và `make -C infra prod-backup-status` báo đủ, **không dùng cho Phiên thi thật**.

## 1. Mất gì thì cứu bằng gì

| Tình huống | Mất tối đa | Cứu bằng | Xem |
|---|---|---|---|
| Xóa nhầm, nhập sai hàng loạt, deploy làm hỏng dữ liệu; máy vẫn tốt | tới thời điểm bản dump gần nhất bạn chọn | bản `pg_dump` (`restore-dump`) | 5.2 |
| Muốn về đúng một thời điểm (ví dụ 10:04 trước khi xóa nhầm lúc 10:05) | khoảng 1 phút | bản nền + dãy WAL (`pitr`) | 5.3 |
| Ảnh minh họa mất | ảnh thêm trong khoảng 1 phút gần nhất | bản chép ảnh | 5.4 |
| Mất file bí mật (`api.env`, `postgres.env`) | không mất nếu có bản mã hóa | thư mục `khoa/` + khóa gpg bí mật (Bitwarden, giấy) | 5.5 |
| Laptop hỏng, mất ổ, mất cả WSL | khoảng 1 phút nếu R2 kịp nhận WAL | R2 (hoặc ổ D: nếu còn), dựng ở máy khác | 5.6 |

"Khoảng 1 phút" nghĩa là: PostgreSQL chép **mỗi đoạn WAL** sang thư mục sao lưu tối đa sau 60 giây (`archive_timeout=60`), và script đẩy file mới sang ổ D: và R2 **mỗi phút**. Máy tắt đột ngột thì mất phần chưa kịp chép (tối đa vài chục giây đến vài phút), **không mất cả ngày** như khi chỉ có sao lưu hằng đêm.

## 2. Cái gì được sao lưu, ở đâu, giữ bao lâu

```text
PostgreSQL ──archive_command──► ~/exam-prod-backups/wal/        (mỗi đoạn WAL, nén .gz, tối đa mỗi 60 giây)
     │                                     │ mỗi phút: chỉ file MỚI, không liệt kê R2
     ├─ pg_dump hằng đêm 02:00 ───────────►│ daily/ → weekly/ (CN), monthly/ (mùng 1)
     ├─ pg_dump sau mỗi lần Công bố ──────►│ daily/ (loại publish)
     ├─ pg_basebackup hằng tuần ──────────►│ base/
exam_media ─ file mới ───────────────────► media/        ▼
~/exam-prod-secrets (api.env, postgres.env) mã hóa, khi đổi ► khoa/      ├─► Ổ D: (bản thường, trừ khoa/ đã mã hóa)
                                                                          └─► R2 (mã hóa gpg, thêm đuôi .gpg)
```

| Thứ | Thư mục (ở WSL, ở D:, ở R2) | Giữ ở WSL | Giữ ở D: | Giữ ở R2 (quy tắc vòng đời, Q352) |
|---|---|---|---|---|
| Bản dump hằng đêm | `daily/` | 14 | 14 | 7 ngày |
| Bản dump sau Công bố | `daily/` (tên `-publish`) | 14 | 14 | 7 ngày |
| Bản đêm Chủ nhật | `weekly/` | 4 | 8 | 28 ngày |
| Bản đêm mùng 1 | `monthly/` | 2 (chỉ làm nguồn đẩy đi) | 12 | 180 ngày |
| Bản nền | `base/` | 2 | 3 | 15 ngày |
| WAL | `wal/` | 7 ngày (và không bao giờ xóa WAL mà bản nền mới nhất còn cần) | 14 ngày (cùng quy tắc) | 7 ngày |
| Ảnh minh họa | `media/` | mãi mãi | mãi mãi | mãi mãi (không đặt quy tắc xóa) |
| Khóa bí mật (đã mã hóa) | `khoa/` | mãi mãi | mãi mãi (**mã hóa**) | mãi mãi |
| Bản trước mỗi lần deploy (6b) | gốc `~/exam-prod-backups/` (`truoc-deploy-*`) | 10 | không đẩy đi | không đẩy đi |

Ghi chú:

- **Script không bao giờ xóa gì trên R2.** R2 tự xóa theo tuổi bằng quy tắc vòng đời bạn đặt trong bảng điều khiển Cloudflare (mục 4.2). Nhờ vậy khóa API nằm trên máy không cần quyền xóa, và máy bị chiếm hay script lỗi cũng không xóa sạch bản sao ngoài máy (Q352).
- **R2 chỉ nhận bản mã hóa** bằng **khóa công khai** gpg; khóa **bí mật** không nằm trên máy (Bitwarden và giấy). Bản ở WSL và D: dạng thường để máy tự thử khôi phục hằng tháng không cần khóa bí mật (Q354). `make prod-backup-check` báo lỗi nếu thấy khóa bí mật nằm trên máy.
- **Ảnh KHÔNG sao lưu mọi thư mục.** Chỉ `illustrations/` (ảnh minh họa câu hỏi) là dữ liệu bền. Ba thư mục tạm mà **ứng dụng tự xóa sau khi xử lý** thì bỏ qua: `tmp/` (ảnh tải lên chờ xử lý), `uploads/` (bảng tính danh sách thí sinh, có thông tin cá nhân) và `slips/` (Phiếu tài khoản, mã hóa, hạn giữ ngắn). Giữ chúng mãi ở ổ D: sẽ phá việc dọn của ứng dụng. Đổi bằng biến `MEDIA_EXCLUDE` trong `backup.env` (mặc định `tmp uploads slips`). Thư mục mới sau này (ứng dụng thêm loại file mới) **mặc định được sao lưu**; `status` liệt kê các thư mục có trong volume để bạn thấy.
- Số "7 ngày/15 ngày…" của R2 là tuổi file, không phải số bản. WAL ở R2 giữ 7 ngày, nên **bản nền ở R2 phải mới hơn 7 ngày** thì mới khôi phục về một thời điểm từ R2 được (xem mục 6).

## 3. Hằng ngày

### 3.1 Xem tình trạng

```bash
make -C infra prod-backup-status
```

In: bản đêm, bản sau Công bố, bản nền mới nhất (và tuổi), lưu liên tục WAL bật hay tắt, sức khỏe archive, dãy WAL có liền không, số file chờ đẩy (WSL → ổ chép / R2), lần thử khôi phục cuối, số timer đang bật, và 8 dòng gần nhất của sổ kết quả. Chỗ nào ghi **CHƯA** hoặc **LỖI** là việc cần làm.

Sổ kết quả đầy đủ: `~/.local/state/exam-prod/backup-runs.jsonl` (mỗi dòng một JSON: `at`, `kind`, `status`, `detail`). Đọc nhanh: `tail -n 20 ~/.local/state/exam-prod/backup-runs.jsonl | jq -r '"\(.at) \(.kind) \(.status) \(.detail)"'`. Sổ này **nằm ngoài cơ sở dữ liệu** nên còn khi cơ sở dữ liệu hỏng. Lỗi đẩy lặp lại chỉ ghi khi nội dung đổi hoặc mỗi giờ một lần, để sổ không đầy.

### 3.2 Việc nào chạy khi nào (timer của người dùng, tên `exam-backup-*`)

| Timer | Khi nào | Làm gì |
|---|---|---|
| `push` | mỗi phút | gom ảnh mới và khóa đổi vào thư mục sao lưu; đẩy file mới (WAL, dump, bản nền, ảnh, khóa) sang ổ chép và R2 |
| `release` | mỗi 5 phút | hỏi `audit_logs` có `session.released` mới thì dump ngay (loại `publish`) |
| `nightly` | 02:00, chạy bù khi bật máy | dump, bản tuần/tháng, kiểm WAL, đối chiếu đích, đẩy, dọn bản cũ, báo healthchecks |
| `base` | Chủ nhật 03:00, chạy bù | bản nền `pg_basebackup` (hoãn nếu đang có Phiên thi) |
| `restore-test` | mùng 1 hằng tháng 04:00, chạy bù | thử khôi phục đầy đủ trong pod tạm, ghi thời gian |
| `catchup` | 5 phút sau khi bật máy | việc nào quá hạn thì làm (bản đêm > 20 giờ; bản nền > 7 ngày; chưa thử khôi phục > 35 ngày) |

**Laptop không bật 24/7 là bình thường.** Timer `Persistent=true` chạy bù việc lỡ giờ ngay khi mở WSL, và `catchup` kiểm lần nữa. Việc không chạy lúc máy tắt **không báo lỗi**; các hạn báo động (dưới đây) đủ rộng để chịu được vài ngày tắt máy (Q353, Q358).

### 3.3 Báo động ngoài máy (healthchecks.io, Q358)

| Việc theo dõi | Chu kỳ | Hạn trễ | Báo thành công khi | Báo lỗi (`/fail`) khi |
|---|---|---|---|---|
| `exam-backup-nightly` | 1 ngày | 3 ngày | dump đạt, dãy WAL liền, archive khỏe, đã đẩy sang ổ chép **và** R2 | một trong các điều đó không đạt |
| `exam-restore-test` | 35 ngày | 7 ngày | cả 4 bước thử khôi phục đạt | có bước lỗi |

Hai kiểu thư báo: **lỗi** (script chạy và báo `/fail`, kèm lý do ngắn trong nội dung thư) và **im lặng** (quá hạn trễ không có tín hiệu: máy tắt lâu, hoặc script/timer hỏng). Nhận thư "im lặng" thì **mở WSL**, chạy `prod-backup-status`, xem timer có chạy không (`systemctl --user list-timers 'exam-backup-*'`), xem `journalctl --user -u exam-backup-nightly.service -n 50`.

Khi chuyển sang máy chủ chạy 24/7 thì thêm tín hiệu "còn sống" mỗi 5 phút (Q358); trước đó không đặt vì laptop tắt sẽ báo giả.

### 3.4 Các lệnh chạy tay

| Lệnh | Làm gì |
|---|---|
| `make -C infra prod-backup-status` | tình trạng |
| `make -C infra prod-backup-check` | kiểm mọi điều kiện (gpg, R2, ổ chép, healthchecks, lưu liên tục, lệnh cần có) |
| `make -C infra prod-backup-dump` (`ARGS=publish` cho loại sau Công bố) | một bản dump ngay |
| `make -C infra prod-backup-nightly` | cả việc hằng đêm ngay |
| `make -C infra prod-backup-basebackup` (`ARGS=--force` khi có Phiên thi) | bản nền ngay |
| `make -C infra prod-backup-push` | đẩy file mới ngay |
| `make -C infra prod-backup-prune ARGS=--dry-run` | xem **sẽ** xóa gì (không xóa); bỏ `ARGS` để xóa thật |
| `make -C infra prod-backup-restore-test` | thử khôi phục ngay |
| `make -C infra prod-backup-install` / `-enable` / `-disable` | cài timer (chưa bật) / bật sau khi check đạt / tắt |
| `make -C infra prod-enable-archiving` / `prod-disable-archiving` | bật / tắt lưu liên tục WAL (dựng lại **chỉ** container PostgreSQL; từ chối nếu có Phiên thi) |
| `bash infra/scripts/exam-backup.sh pitr "2026-11-20 10:04:00"` | PostgreSQL tạm khôi phục về một thời điểm (mục 5.3) |
| `bash infra/scripts/exam-backup.sh restore-dump <file>` | thay cơ sở dữ liệu thật bằng một bản dump (mục 5.2) |

Thêm `EXAM_STAGE=drill` để thử trên pod `drill-exam` mà không đụng pod thật.

### 3.5 Sau khi sửa script trong repo

Timer chạy bản **chép cố định** ở `~/.local/share/exam-prod/bin/` (không trỏ vào cây mã nguồn, vì cây đó có thể đang ở nhánh khác). Sau khi merge thay đổi script, chạy lại `make -C infra prod-backup-install` để cập nhật bản chép (an toàn, chạy lại bao nhiêu lần cũng được; không đổi trạng thái bật/tắt của timer).

## 4. Cài đặt lần đầu (làm cùng nhau từng bước)

Các bước cần **tài khoản và quyết định của bạn** nên làm theo thứ tự, mỗi bước kiểm xong mới sang bước sau. Trợ lý hướng dẫn chi tiết từng thao tác và lệnh; đây là bản đồ để bạn biết mình đang ở đâu.

| # | Việc | Bạn làm | Kiểm bằng |
|---|---|---|---|
| 4.1 | Cặp khóa gpg | tạo cặp khóa, cất khóa bí mật (Bitwarden và giấy), chỉ để khóa **công khai** trên máy | `gpg --list-keys`, `gpg --list-secret-keys` (phải **không** thấy khóa bí mật) |
| 4.2 | Cloudflare R2 | tạo bucket, đặt quy tắc vòng đời, tạo khóa API, thử xem khóa có xóa được không | `check` báo R2 ghi/đọc được |
| 4.3 | healthchecks.io | tạo tài khoản và hai việc theo dõi, chọn kênh báo (thư điện tử), lấy hai địa chỉ ping | `check` báo có hai địa chỉ |
| 4.4 | `backup.env` | điền các giá trị vào file cấu hình riêng của máy | `check` |
| 4.5 | Bật lưu liên tục WAL | chạy `prod-enable-archiving` **lúc không có Phiên thi** | `status` báo lưu liên tục BẬT, sức khỏe archive ổn |
| 4.6 | Cài và bật timer | `prod-backup-install`, rồi `prod-backup-enable` | `status` báo 6/6 timer |
| 4.7 | Lần đầu thử khôi phục | `prod-backup-basebackup` rồi `prod-backup-restore-test`, ghi lại thời gian | `restore-test.json` có `"ok": true` |
| 4.8 | Giải mã thử bản R2 bằng tay | lấy một file từ R2, giải mã bằng khóa bí mật (lấy từ Bitwarden, tạm thời) | giải mã ra file đọc được |

### 4.1 Cặp khóa gpg (Q354)

Nguyên tắc: máy chỉ giữ khóa **công khai** (chỉ mã hóa được). Khóa **bí mật** (giải mã được) ở Bitwarden và một bản giấy trong phong bì dán kín (Q327). Nhờ vậy ai chiếm được máy hay R2 cũng không đọc được bản sao lưu.

Làm trên **một máy bạn tin cậy** (có thể chính laptop này, tạm thời, rồi xóa khóa bí mật khỏi máy sau khi cất xong):

```bash
gpg --quick-gen-key "exam-backup <ten-ban@example.com>" default default never
gpg --list-keys --with-colons | awk -F: '/^fpr/{print $10; exit}'      # dấu vân tay (40 ký tự): ghi lại, đây là EXAM_GPG_RECIPIENT
gpg --armor --export-secret-keys <dấu-vân-tay> > khoa-bi-mat.asc        # cất vào Bitwarden (ghi chú bảo mật) và in ra giấy
gpg --armor --export <dấu-vân-tay> > khoa-cong-khai.asc                 # file này không bí mật
gpg --delete-secret-keys <dấu-vân-tay>                                  # XÓA khóa bí mật khỏi máy (sau khi đã cất xong và kiểm bản cất đọc được)
shred -u khoa-bi-mat.asc
```

Nếu tạo ở máy khác: chép `khoa-cong-khai.asc` sang máy chạy hệ thống rồi `gpg --import khoa-cong-khai.asc`.

> **Đừng đặt mật khẩu cho khóa bí mật?** Nên đặt (mật khẩu cũng cất ở Bitwarden). Khóa công khai không cần mật khẩu. Mất cả hai bản khóa bí mật thì **mọi bản sao lưu trên R2 thành vô dụng** (bản ở WSL và D: vẫn đọc được vì là dạng thường); vì vậy bản giấy là bắt buộc.

### 4.2 Cloudflare R2 (Q352, chính sách đã kiểm 9/11/2026)

1. Tạo **bucket** (tên ví dụ `exam-backup`), vị trí tự động.
2. **Quy tắc vòng đời** (Object lifecycle rules, theo tiền tố, xóa theo tuổi). Tạo đủ bảng sau:

   | Tiền tố | Xóa sau |
   |---|---|
   | `daily/` | 7 ngày |
   | `weekly/` | 28 ngày |
   | `monthly/` | 180 ngày |
   | `wal/` | 7 ngày |
   | `base/` | 15 ngày |
   | `media/`, `khoa/`, `selftest/` | không đặt quy tắc |

   Cloudflare thường xóa trong vòng 24 giờ sau khi hết hạn. Quy tắc theo tiền tố tối đa 1.000 quy tắc; ta dùng 5.
3. **Khóa API** loại **Object Read & Write**, giới hạn bucket này nếu bảng điều khiển cho chọn. Ghi lại: Account ID, Access Key ID, Secret Access Key (chỉ hiện một lần). Cloudflare **không có khóa chỉ-ghi**; tài liệu cũng **không nói** khóa Object Read & Write có xóa được hay không, nên **thử**: tải một file nhỏ lên rồi thử xóa bằng chính khóa này (`rclone deletefile`). Kết quả ghi vào [slice-6.md](../plan/slice-6.md) mục "PR 6c: ghi chú triển khai". Dù xóa được hay không, thiết kế vẫn đúng (script không bao giờ gọi xóa trên R2).
4. Gói miễn phí (kiểm 9/11/2026): 10 GB-tháng lưu trữ Standard, 1 triệu thao tác loại A (ghi, liệt kê), 10 triệu loại B (đọc), **băng thông ra miễn phí**, xóa miễn phí, Standard không có thời hạn lưu tối thiểu. Script không liệt kê R2 mỗi phút chính vì liệt kê tốn thao tác loại A (Q355). **Kiểm lại chính sách của Cloudflare trước khi tin những số này lâu dài**; thay đổi chính sách là rủi ro có thật.

### 4.3 healthchecks.io (Q358)

Tạo hai việc theo dõi: `exam-backup-nightly` (chu kỳ 1 ngày, hạn trễ 3 ngày) và `exam-restore-test` (chu kỳ 35 ngày, hạn trễ 7 ngày). Chọn kênh báo là **thư điện tử** (khi đăng ký, kiểm gói miễn phí hiện có những kênh nào: chưa kiểm). Địa chỉ ping (dạng `https://hc-ping.com/<uuid>`) là **bí mật** (ai có địa chỉ gửi được tín hiệu giả): chỉ để trong `backup.env`.

### 4.4 `~/exam-prod-secrets/backup.env`

Quyền `600`, không vào repo. Mẫu:

```bash
# Ổ chép thứ hai. Trong WSL là ổ D: của Windows. Máy chủ 24/7 sau này đặt sang ổ khác (không có /mnt/d).
EXAM_BACKUP_MIRROR_DIR=/mnt/d/exam-prod-backups

# Khóa công khai gpg (dấu vân tay 40 ký tự). Máy KHÔNG được giữ khóa bí mật.
EXAM_GPG_RECIPIENT=<dấu-vân-tay>

# Cloudflare R2 (chỉ chứa thông tin của bucket sao lưu này)
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET=exam-backup

# Địa chỉ ping healthchecks.io (bí mật)
HC_NIGHTLY_URL=https://hc-ping.com/<uuid-nightly>
HC_RESTORE_URL=https://hc-ping.com/<uuid-restore-test>

# Tùy chọn (đổi khi cần):
# MEDIA_EXCLUDE="tmp uploads slips"
# KEEP_LOCAL_DAILY=14  KEEP_LOCAL_WEEKLY=4  KEEP_MIRROR_DAILY=14  KEEP_MIRROR_WEEKLY=8  KEEP_MIRROR_MONTHLY=12
```

`backup.env` **không được sao lưu** (nó chứa khóa R2). Cất bản của nó ở Bitwarden: khi dựng lại ở máy khác bạn cần nó để lấy bản sao lưu từ R2.

### 4.5 Bật lưu liên tục WAL

```bash
make -C infra prod-active-sessions        # phải báo không có Phiên thi
make -C infra prod-enable-archiving
```

Lệnh này: (1) từ chối nếu có Phiên thi (`FORCE_REASON="lý do"` để ép khẩn cấp); (2) sao lưu một bản trước (`truoc-deploy-…-bat-luu-lien…`); (3) dựng lại **chỉ container PostgreSQL** với `archive_mode=on`, `archive_command`, `archive_timeout=60` và thư mục `wal/` gắn vào (volume dữ liệu giữ nguyên); (4) ép chuyển một đoạn WAL và đợi nó được chép; **nếu không chép được thì tự trả PostgreSQL về như cũ** và báo lỗi. Mất khoảng 10–15 giây; trong lúc đó api mất kết nối cơ sở dữ liệu và **worker khởi động lại một lần** (đã thấy khi thử trên pod drill, api vẫn sống). Từ đó mọi lần dựng lại container PostgreSQL (kể cả `prod-up` sau này) tự giữ các tham số này (file đánh dấu `~/.local/state/exam-prod/archiving`).

**Rủi ro cần nhớ:** nếu sau này `archive_command` hỏng liên tục (đĩa đầy, thư mục `wal/` không ghi được), PostgreSQL **giữ lại mọi đoạn WAL chưa chép trong `pg_wal`**, và `pg_wal` đầy dần có thể làm đầy đĩa rồi **dừng PostgreSQL**. Đó là lý do `nightly` và `status` kiểm `pg_stat_archiver` và số đoạn đang chờ (`.ready`), và báo `/fail` khi có vấn đề (Q351). Gặp báo lỗi này thì xử lý **ngay**, đừng đợi.

### 4.6 Cài và bật timer

```bash
make -C infra prod-backup-check           # phải không còn dòng ✗
make -C infra prod-backup-install         # cài script và 6 timer (chưa bật)
make -C infra prod-backup-enable          # chạy check lại rồi bật 6 timer
make -C infra prod-backup-status
```

### 4.7 Lần đầu thử khôi phục

```bash
make -C infra prod-backup-dump
make -C infra prod-backup-basebackup ARGS=--force
make -C infra prod-backup-restore-test
cat ~/.local/state/exam-prod/restore-test.json | jq
```

Ghi lại `total_seconds` và `phases.*.seconds`: đó là **thời gian khôi phục (RTO)** thật của máy bạn với dữ liệu hiện có; ghi vào [slice-6.md](../plan/slice-6.md) mục ghi chú triển khai để so sánh các lần sau.

### 4.8 Giải mã thử một bản R2 bằng tay (làm định kỳ, ví dụ mỗi quý)

Mục đích: chắc rằng bản trên R2 **giải mã được thật** bằng khóa bí mật bạn cất. Máy thường không có khóa bí mật nên làm tạm:

```bash
# 1. Lấy file nhỏ nhất gần nhất từ R2 (cần rclone cấu hình như trong backup.env), ví dụ một đoạn WAL:
set -a; . ~/exam-prod-secrets/backup.env; set +a
export RCLONE_CONFIG_EXAM_R2_TYPE=s3 RCLONE_CONFIG_EXAM_R2_PROVIDER=Cloudflare RCLONE_CONFIG_EXAM_R2_REGION=auto \
  RCLONE_CONFIG_EXAM_R2_NO_CHECK_BUCKET=true RCLONE_CONFIG_EXAM_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  RCLONE_CONFIG_EXAM_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_EXAM_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
rclone lsf exam_r2:$R2_BUCKET/wal | tail -3
rclone copy exam_r2:$R2_BUCKET/wal/<tên-file>.gz.gpg /tmp/thu-giai-ma/

# 2. Nhập khóa bí mật TẠM THỜI vào một keyring riêng (không đụng keyring của máy), lấy từ Bitwarden:
export GNUPGHOME=$(mktemp -d)
gpg --import khoa-bi-mat.asc
gpg -d /tmp/thu-giai-ma/<tên-file>.gz.gpg | gzip -dc | head -c 100 | xxd | head -3   # ra dữ liệu là đạt

# 3. Dọn sạch:
rm -rf "$GNUPGHOME" /tmp/thu-giai-ma khoa-bi-mat.asc; unset GNUPGHOME
```

## 5. Khôi phục (runbook)

> **Trước mọi việc: bình tĩnh, đừng xóa gì thêm.** Mọi bản sao lưu còn nguyên cho đến khi bạn xóa. Lệnh khôi phục luôn **tự dump bản "trước khi khôi phục"** nên làm sai vẫn quay lại được. Nếu đang trong Phiên thi và hệ thống chưa chết hẳn, cân nhắc để Phiên thi chạy xong rồi mới khôi phục (chốt chặn sẽ từ chối khi có Phiên thi; `FORCE_REASON="lý do"` mới ép được và ghi vào nhật ký).

### 5.1 Chọn kịch bản

| Triệu chứng | Kịch bản |
|---|---|
| Máy còn chạy, dữ liệu **sai** (xóa nhầm, nhập nhầm, lỗi phần mềm làm hỏng dữ liệu) và bạn **biết thời điểm** nó còn đúng | 5.3 (về một thời điểm) |
| Máy còn chạy, dữ liệu sai nhưng chấp nhận quay về **bản dump gần nhất** (đêm qua, hoặc sau lần Công bố gần nhất) | 5.2 |
| Chỉ ảnh minh họa mất hoặc hỏng | 5.4 |
| Mất `api.env`/`postgres.env` | 5.5 |
| WSL, laptop, ổ đĩa hỏng/mất | 5.6 |
| Đang khôi phục thì lỗi | 5.7 |

### 5.2 Thay cơ sở dữ liệu bằng một bản dump (`restore-dump`)

```bash
ls -lt ~/exam-prod-backups/daily/ | head                     # các bản dump gần nhất (nightly, publish)
ls -lt ~/exam-prod-backups/truoc-deploy-* | head -3          # bản chụp trước các lần deploy
bash infra/scripts/exam-backup.sh restore-dump ~/exam-prod-backups/daily/exam-<ngày>-<giờ>-nightly.dump
```

Lệnh in rõ nó sắp làm gì và đợi bạn **gõ `KHOI PHUC`**. Rồi: (1) từ chối nếu có Phiên thi; (2) dump an toàn "trước khi khôi phục"; (3) dừng api và worker (hệ thống ngừng phục vụ); (4) xóa và dựng lại cơ sở dữ liệu rồi nạp bản bạn chọn; (5) bật lại api và worker, kiểm `/api/health`; (6) ghi `ops.restore` vào `audit_logs` (dòng này nằm trong cơ sở dữ liệu **sau** khôi phục) và `operations.log`. Nạp hỏng thì tự nạp lại bản an toàn. Đã thử trên pod `drill-exam`: khoảng 19 giây với cơ sở dữ liệu nhỏ.

**Mất gì:** mọi thay đổi **sau thời điểm của bản dump đó** (bài làm, điểm, tài khoản tạo sau đó). Nếu còn cần phần đó thì dùng 5.3 để về thời điểm sát hơn, hoặc lấy lại riêng từ bản "trước khi khôi phục".

### 5.3 Về một thời điểm (`pitr`), rồi xem và lấy lại dữ liệu

`pitr` dựng một PostgreSQL **tạm** (không đụng hệ thống thật) khôi phục từ bản nền và dãy WAL đến đúng giây bạn chọn. Giờ bạn gõ là **giờ của máy** (WSL, giờ Việt Nam).

```bash
bash infra/scripts/exam-backup.sh pitr "2026-11-20 10:04:00"
# in địa chỉ của PostgreSQL tạm (127.0.0.1:5439) và các lệnh gợi ý.
podman exec -it pitr-prod sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'     # xem dữ liệu ở thời điểm đó
```

Hai cách lấy lại:

- **Lấy lại cả cơ sở dữ liệu** (mất mọi thứ sau 10:04): `podman exec pitr-prod sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ~/khoi-phuc-pitr.dump`, rồi `restore-dump ~/khoi-phuc-pitr.dump` như 5.2.
- **Chỉ lấy lại một phần** (an toàn hơn khi chỉ xóa nhầm vài dòng): `pg_dump -t <bảng>` hoặc `psql -c "\copy (select …) to …"` từ PostgreSQL tạm, rồi đưa phần đó vào hệ thống thật bằng `psql` ở container `prod-exam-postgres`. Cách này **không dừng** hệ thống.

Xong việc: `bash infra/scripts/exam-backup.sh pitr-stop`. Nhập `latest` thay cho giờ để khôi phục đến đoạn WAL cuối đã chép.

Lưu ý:
- `pitr` chọn **bản nền mới nhất làm xong trước thời điểm bạn chọn**; nếu không có bản nền nào trước thời điểm đó (ví dụ muốn về 3 tuần trước mà chỉ giữ 2 bản nền) thì báo lỗi. Mốc xa hơn: lấy bản nền cũ hơn từ ổ D: (giữ 3 bản) và chạy `pitr` với `EXAM_BACKUP_DIR` trỏ vào thư mục D: (cấu trúc giống nhau): `EXAM_BACKUP_DIR=/mnt/d/exam-prod-backups bash infra/scripts/exam-backup.sh pitr "…"`.
- Thời điểm sau đoạn WAL cuối đã chép thì PostgreSQL tạm báo `recovery ended before configured recovery target was reached`: chọn thời điểm sớm hơn, hoặc `latest`.
- Dãy WAL đứt thì `pitr` từ chối và chỉ ra chỗ đứt (chỉ khôi phục được đến chỗ đứt).
- PostgreSQL tạm **phải** chạy với `max_connections` **không nhỏ hơn** máy gốc (200), nếu không từ chối khởi động (`recovery aborted because of insufficient parameter settings`). Script đã đặt đúng; ghi lại để bạn hiểu nếu dựng tay.
- Đã thử trên pod `drill-exam`: khoảng 6 giây.

### 5.4 Khôi phục ảnh minh họa

Ảnh nằm trong volume `exam_media`, do người dùng bên trong container (uid 1000) sở hữu; Podman rootless ánh xạ người dùng nên **không chép bằng `cp` thường** được. Dùng `podman unshare` (vào không gian người dùng của Podman, ở đó bạn là root):

```bash
src="$(podman volume inspect exam_media -f '{{.Mountpoint}}')"
podman unshare cp -a --update=none ~/exam-prod-backups/media/. "$src"/     # không ghi đè file đang có
podman unshare chown -R 1000:1000 "$src"                                  # trả quyền cho người dùng của api
podman unshare find "$src" -type f | head                                 # kiểm
```

Nếu `~/exam-prod-backups/media` cũng mất: lấy từ ổ D: (`/mnt/d/exam-prod-backups/media`, dạng thường) hoặc R2 (`media/…​.gpg`, giải mã như mục 4.8).

### 5.5 Khôi phục file bí mật

Bản mã hóa nằm ở `~/exam-prod-backups/khoa/`, `/mnt/d/exam-prod-backups/khoa/` và R2 `khoa/`. Tên dạng `api.env-<ngày>-<8 ký tự mã băm>.gpg`: bản **mới nhất** theo ngày thường là cái cần; nhiều bản vì mỗi lần nội dung đổi lưu một bản. Giải mã **bằng khóa bí mật** (Bitwarden), như mục 4.8:

```bash
export GNUPGHOME=$(mktemp -d); gpg --import khoa-bi-mat.asc
gpg -d api.env-<…>.gpg > ~/exam-prod-secrets/api.env && chmod 600 ~/exam-prod-secrets/api.env
gpg -d postgres.env-<…>.gpg > ~/exam-prod-secrets/postgres.env && chmod 600 ~/exam-prod-secrets/postgres.env
rm -rf "$GNUPGHOME"; unset GNUPGHOME
```

**`SLIP_ENCRYPTION_KEY` trong `api.env` đặc biệt quan trọng:** mất nó thì mọi Phiếu tài khoản đã mã hóa không mở lại được. Bitwarden vẫn là nơi lưu chính; đây là lớp thứ ba.

### 5.6 Mất cả máy: dựng ở máy khác

Đây là kịch bản mà R2 sinh ra để cứu. Tóm tắt các bước (chi tiết cài đặt máy mới: [chuyen-len-vps.md](./chuyen-len-vps.md) mục 2–6: máy, Podman, mã nguồn, tunnel, runner):

1. Máy mới: cài Podman, `rclone`, `gpg`, `jq`, clone repo (theo chuyen-len-vps.md).
2. Lấy từ Bitwarden: **khóa bí mật gpg** và bản `backup.env`.
3. Lấy từ **R2** (hoặc **ổ D:** nếu còn, dạng thường và không cần giải mã): `khoa/` (mới nhất), `base/` (bản nền mới nhất kèm `.info`), `wal/` (mọi đoạn sau điểm bắt đầu của bản nền), `daily/` (dump mới nhất, để dự phòng), `media/`. Giải mã từng file `.gpg` (mục 4.8). Mỗi đoạn WAL phải giải mã **riêng** ra file `.gz` đúng tên.
4. Đặt file bí mật đã giải mã vào `~/exam-prod-secrets/` (mục 5.5).
5. Dựng pod mới theo chuyen-len-vps.md mục 7.3 (dựng pod, đừng cho người dùng vào, rồi khôi phục dữ liệu), rồi `pitr latest` với `EXAM_BACKUP_DIR` trỏ vào thư mục vừa tải để **kiểm** dữ liệu khôi phục được; nếu đạt, lấy dump từ PostgreSQL tạm và `restore-dump`. Nếu chỉ có dump hằng đêm (không có bản nền/WAL): `restore-dump` thẳng bản dump mới nhất.
6. Khôi phục ảnh (mục 5.4), bật lại tunnel và đổi DNS (chuyen-len-vps.md mục 5 và 7.4).
7. Cài lại timer sao lưu và bật lưu liên tục WAL ở máy mới (mục 4.5–4.6).

**Chưa diễn tập đầy đủ bằng R2 thật:** diễn tập "khôi phục ở máy khác từ R2" nằm trong PR 6e; trước đó coi kịch bản này là **chưa được chứng minh**.

### 5.7 Khi khôi phục hỏng

- `restore-dump` hỏng ở bước nạp: tự nạp lại bản "trước khi khôi phục" và báo. Nếu cả hai đều hỏng, nó **dừng và không làm gì thêm**, in đường dẫn bản an toàn. Khi đó: giữ nguyên, `podman logs prod-exam-postgres --tail 50`, thử nạp bản an toàn bằng tay vào cơ sở dữ liệu mới (`createdb`, `pg_restore -d …`), và hỏi trước khi xóa bất kỳ thứ gì.
- PostgreSQL không lên sau `enable-archiving`: lệnh tự trả về như cũ; nếu vẫn không lên, xóa file `~/.local/state/exam-prod/archiving` rồi `prod-disable-archiving`.
- Mọi bản sao lưu cũ vẫn còn: đừng chạy `prune` thật khi đang xử lý sự cố; dùng `--dry-run` để xem.

## 6. Giới hạn và rủi ro đã biết

| Giới hạn | Hệ quả | Giảm nhẹ |
|---|---|---|
| Laptop tắt là không có sao lưu nào chạy | thay đổi lúc máy tắt không tồn tại, nên không mất; nhưng khi máy hỏng đột ngột ngay lúc bật, phần vài phút chưa kịp đẩy sẽ mất | R2 nhận WAL mỗi phút khi máy bật; chuyển sang máy chủ 24/7 sau này |
| WAL ở R2 chỉ giữ 7 ngày, bản nền ở R2 giữ 15 ngày | nếu bản nền mới nhất ở R2 **cũ hơn 7 ngày** thì từ R2 không khôi phục về thời điểm gần nhất được, chỉ về bản dump | bản nền hằng tuần + `catchup` tự làm bản nền khi quá 7 ngày; xem tuổi bản nền ở `status`; nếu laptop hay tắt cả tuần, tăng quy tắc `wal/` ở R2 lên 14 ngày (file nhỏ) |
| Chưa biết khóa R2 Object Read & Write có xóa được không | không ảnh hưởng thiết kế | thử khi tạo khóa (mục 4.2) |
| `pg_wal` có thể đầy đĩa nếu `archive_command` hỏng lâu | PostgreSQL dừng | `nightly` và `status` kiểm; báo `/fail` |
| Bản trên R2 phụ thuộc khóa bí mật gpg | mất khóa bí mật thì bản R2 vô dụng | Bitwarden + giấy; thử giải mã định kỳ (mục 4.8) |
| Ảnh chỉ sao lưu thêm, không xóa; không sao lưu `tmp/`, `uploads/`, `slips/` | ảnh đã xóa khỏi hệ thống vẫn còn ở bản sao; Phiếu tài khoản không được sao lưu | chấp nhận (ảnh nhẹ; Phiếu có hạn giữ ngắn và có thể phát hành lại) |
| Thử khôi phục bỏ qua khi có Phiên thi | tháng nhiều Phiên thi thì thử trễ | `catchup` và `Persistent` làm bù; báo động sau 35 + 7 ngày |
| Khi `enable-archiving`, worker khởi động lại một lần | vài giây | làm lúc không có Phiên thi (lệnh tự chặn) |
| `restore-test` ghi một dòng `ops.backup_test` vào `audit_logs` của hệ thống thật mỗi lần | thêm 1 dòng mỗi tháng | chấp nhận; làm bằng chứng WAL cuối đã vào bản khôi phục |

## 7. Thử bằng pod `drill-exam` (không đụng dữ liệu thật)

```bash
make -C infra backup-drill-test        # khoảng 6 phút
```

Dựng khóa gpg giả, "R2" là một thư mục (rclone kiểu local), healthchecks giả là một máy chủ nhỏ ghi lại các lần gọi. Thử: bật lưu liên tục, dump, bản nền, đẩy và mã hóa, giải mã bản "R2", R2 hỏng rồi hồi phục, ảnh (chỉ thư mục bền) và khóa bí mật mã hóa, dãy WAL đứt, sao lưu đêm trọn vẹn, báo healthchecks, Công bố mới thì dump, dọn bản cũ không xóa bản mới nhất, thử khôi phục 4 bước và các tình huống hỏng (dump hỏng, WAL đứt), `pitr` và `restore-dump`, timer systemd. In ✓/✗ từng bước, thoát mã 1 nếu có ✗. Cần pod drill đã dựng (xem đầu `infra/scripts/test-backup-drill.sh`).

Điều bài thử **không** thay thế được: R2 thật (khóa API, quy tắc vòng đời, giới hạn), healthchecks.io thật, `wsl --shutdown` giữa chừng, đĩa đầy thật, khôi phục sang máy khác.

## 8. Học thêm: vì sao thiết kế như vậy

- **Ba lớp, ba mục đích.** Bản dump (`pg_dump`) là ảnh logic của dữ liệu tại một thời điểm: nhỏ, dễ kiểm, dễ nạp vào máy khác, nhưng chỉ về được đúng các mốc đã dump. Lưu liên tục (WAL cộng bản nền) ghi lại **từng thay đổi** nên về được **bất kỳ thời điểm nào** và mất tối đa một phút, nhưng phải đúng phiên bản PostgreSQL và nặng hơn. Bản chép ngoài máy (ổ D:, R2) cứu khi mất cả máy. Một lớp không thay được lớp khác.
- **WAL là gì.** Trước khi đổi dữ liệu thật, PostgreSQL ghi thay đổi vào "nhật ký ghi trước" (Write-Ahead Log) theo từng đoạn 16 MB. Có **bản nền** (ảnh cả thư mục dữ liệu lúc đó) cộng **mọi đoạn WAL sau đó**, PostgreSQL "phát lại" nhật ký và dừng ở giây bạn muốn: đó là khôi phục về một thời điểm (PITR, point-in-time recovery). Thiếu **một** đoạn WAL ở giữa là phát lại dừng ở đó; vì vậy script kiểm dãy WAL **liền nhau** mỗi đêm.
- **Vì sao `archive_command` phải "không bao giờ báo thành công giả".** PostgreSQL xóa đoạn WAL gốc ngay khi `archive_command` trả 0. Báo 0 khi chưa thật sự lưu là mất dữ liệu không thể lấy lại. Script `pg-archive-wal.sh` nén ra file tạm, đọc lại so khớp, `sync` xuống đĩa, đổi tên, `sync` thư mục, rồi mới trả 0; không ghi đè; file đã có thì chỉ trả 0 nếu nội dung **giống hệt**.
- **Vì sao chép hai chặng.** PostgreSQL chỉ chép vào thư mục cục bộ (nhanh, gần như không thể hỏng); việc đẩy sang ổ D: và R2 do script riêng làm mỗi phút. R2 hay mạng hỏng thì chỉ việc đẩy trễ, **không bao giờ chặn PostgreSQL**.
- **Vì sao không liệt kê R2 mỗi phút.** `rclone sync` liệt kê toàn bộ R2 mỗi lần chạy; mỗi phút là hàng trăm nghìn thao tác loại A một tháng, gần cạn hạn mức miễn phí. Thay vào đó mỗi file **đẩy một lần** rồi ghi vào sổ cục bộ (`~/.local/state/exam-prod/push-ledger/`); chỉ mỗi đêm một lần mới liệt kê để đối chiếu (file trong sổ mà đích không có thì đẩy lại).
- **Vì sao quy tắc vòng đời của R2 thay cho lệnh xóa.** Muốn khóa trên máy "không xóa được" để máy bị chiếm cũng không xóa sạch bản sao ngoài máy; nhưng vẫn phải dọn bản cũ để nằm trong 10 GB. Giải pháp: để **Cloudflare tự xóa theo tuổi**, script chỉ ghi.
- **Vì sao mã hóa bằng khóa công khai.** Khóa công khai chỉ **mã hóa** được; ai chiếm được máy cũng không đọc được bản sao lưu đã gửi đi. Giải mã cần khóa bí mật mà máy **không có**. Đổi lại phải giữ khóa bí mật cẩn thận (mất nó là mất bản R2).
- **Vì sao thử khôi phục hằng tháng.** "Có sao lưu" chưa phải "khôi phục được". Mỗi tháng máy tự dựng pod tạm, khôi phục dump và so số dòng từng bảng, phát lại WAL đến cuối và tìm thấy dòng dấu vừa ghi, chạy đúng ảnh ứng dụng đang chạy trên cơ sở dữ liệu vừa khôi phục, và so mẫu ảnh. Thất bại thì báo, không đợi đến ngày cần.
- **Vì sao "chậm mà chắc" (nice).** Mọi việc nặng chạy mức ưu tiên thấp nhất (`nice -n 19`, `ionice -c 3`) để không làm chậm phòng thi trên cùng máy. Bản nền và thử khôi phục còn tự **hoãn khi có Phiên thi**.
- **Bẫy đã gặp khi làm, ghi để khỏi gặp lại:** (1) `archive_command` chạy bằng người dùng `postgres` trong container, ánh xạ rootless khiến file nó tạo thuộc người dùng khác của máy, nên thư mục `wal/` phải cho ghi chung (`1777`, thư mục cha `700` vẫn chặn người ngoài) và file chép ra phải `644`; (2) ảnh trong volume quyền `600` thuộc uid của container nên chỉ đọc được qua `podman unshare` (và `cp -p` làm file chép ra mang chủ lạ, nên dùng `--preserve=timestamps`); (3) PostgreSQL khôi phục từ WAL đòi `max_connections` không nhỏ hơn máy gốc; (4) `date -u -d "giờ"` hiểu chuỗi là UTC (sai 7 giờ khi đổi giờ máy sang giờ PostgreSQL), phải đổi sang giây trước; (5) **khóa `flock` bị container chạy lâu thừa hưởng** nếu khởi động container khi đang giữ khóa, làm mọi việc sao lưu sau đó "bỏ qua êm": mọi lệnh khởi động container trong script đều đóng fd khóa (`9>&-`); (6) bước "ứng dụng chạy trên bản khôi phục" phải **không chạy khi bước dump lỗi**, nếu không migration dựng cơ sở dữ liệu trống và ứng dụng "khỏe giả".
