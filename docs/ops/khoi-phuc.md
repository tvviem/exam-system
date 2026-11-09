# Sao lưu và khôi phục dữ liệu của hệ thống thật

Tài liệu cho người vận hành (chủ dự án), để **tra cứu lâu dài và học**. Thiết kế và lý do từng quyết định ở [docs/plan/slice-6.md](../plan/slice-6.md) (Q323–Q328, Q351–Q361); triển khai hằng ngày ở [trien-khai.md](./trien-khai.md); chuyển sang máy chủ khác ở [chuyen-len-vps.md](./chuyen-len-vps.md). Mọi lệnh chạy ở thư mục gốc của repo qua `make -C infra …`; logic nằm ở [`infra/scripts/exam-backup.sh`](../../infra/scripts/exam-backup.sh) (và `exam-ctl.sh enable-archiving`, `pg-archive-wal.sh`).

> **Trạng thái (lát cắt 6, triển khai bản MVP; PR 6c):** công cụ đã thử trên pod `drill-exam` (`make -C infra backup-drill-test`, 61/61) và **đã bật thật trên `prod-exam` ngày 9/11/2026** với R2 thật, healthchecks.io thật, khóa gpg thật; lần thử khôi phục đầu tiên đạt trong 27 giây. Từng bước, lệnh, số đo và lỗi gặp phải ở [mục 4.9](#49-nhật-ký-bật-thật-9112026-laptop-wsl-ubuntu-prod-exam); việc còn lại ở mục 4.9.10. **Chưa thử:** khôi phục sang máy khác từ R2, `wsl --shutdown` giữa lúc đang đẩy, đĩa đầy thật, ảnh minh họa thật (làm ở 6e). Trước Phiên thi thật đầu tiên còn cần Quản trị viên thứ hai.

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

Các bước cần **tài khoản và quyết định của bạn** nên làm theo thứ tự (kết quả làm thật ngày 9/11/2026 ở [mục 4.9](#49-nhật-ký-bật-thật-9112026-laptop-wsl-ubuntu-prod-exam)), mỗi bước kiểm xong mới sang bước sau. Trợ lý hướng dẫn chi tiết từng thao tác và lệnh; đây là bản đồ để bạn biết mình đang ở đâu.

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

#### 4.1.1 Làm bản giấy (hướng dẫn từng bước)

Vì sao cần giấy dù Bitwarden đã có 2FA và Face ID: 2FA chống **người khác** vào, còn giấy cứu khi **chính bạn bị khóa bên ngoài** (điện thoại hỏng hoặc mất, Google Authenticator và Face ID đi theo điện thoại, không đăng nhập được Bitwarden đúng lúc cần khôi phục).

Cần **ba tờ giấy, cất ở hai hoặc ba nơi khác nhau**, mỗi tờ trong phong bì dán kín. Ai chỉ lấy được một tờ thì không dùng được.

| Tờ | Nội dung | Cách làm |
|---|---|---|
| A | Khối khóa bí mật gpg (17 dòng, từ `-----BEGIN PGP PRIVATE KEY BLOCK-----` đến `-----END …-----`) và dấu vân tay (ghi thêm bằng tay nếu muốn) | in |
| B | **Mật khẩu của khóa gpg** (chữ và số, không dấu) | chép tay từ Bitwarden |
| C | **Mã khôi phục 2FA của Bitwarden** (Settings → Security → Two-step login → View recovery code). Nếu bạn ghi cả mật khẩu chủ Bitwarden thì ghi trên tờ này | chép tay hoặc in |

**Cất ở đâu:** tờ A và tờ B **không bao giờ để chung một nơi**. Tờ C để cách xa tờ A (tờ C mở Bitwarden, tờ A và B mở khóa; ai có cả ba là có hết).

**Các bước (tờ A, in bằng Notepad của Windows):**

```bash
cp ~/khoa-bi-mat.asc /mnt/c/Users/Public/khoa-bi-mat.txt
notepad.exe 'C:\Users\Public\khoa-bi-mat.txt'      # in bằng Ctrl+P, cỡ chữ vừa để mỗi dòng không bị ngắt
rm /mnt/c/Users/Public/khoa-bi-mat.txt             # xóa bản tạm ở Windows ngay sau khi in
```

Kiểm tờ A đã in: đếm đủ 17 dòng, dòng cuối của khối (ngay trên `END`) bắt đầu bằng `=` và có 4 ký tự (ví dụ `=P22P`). Khi phải khôi phục từ giấy mà gõ lại 17 dòng khó và dễ nhầm, nên ưu tiên Bitwarden; giấy là phương án cuối cùng. Ai muốn chắc hơn có thể in thêm mã QR của khối khóa (làm sau, không bắt buộc).

**Kiểm tờ B bằng cách gõ lại từ giấy (làm TRƯỚC khi xóa khóa bí mật khỏi máy).** Chép tay dễ nhầm `l`, `I`, `1`, `O`, `0`. Bộ gõ để tiếng Anh, gõ **từng ký tự đọc từ tờ giấy** (không dán) vào phép thử này:

```bash
export GPG_TTY=$(tty)
gpgconf --kill gpg-agent
echo thu | gpg -u C03E6416CDACA6645710AA3E14C0007D328A40D9 --clearsign > /dev/null && echo "TO B DUNG"
```

In `TO B DUNG` là tờ B chép đúng. Không đúng thì viết lại cho rõ (chữ in hoa, chia nhóm 4 ký tự) rồi thử lại. Sau khi xóa khóa bí mật khỏi máy thì không còn phép thử này nữa.

**Những thứ KHÔNG cần ghi ra giấy** (đã nằm trong Bitwarden, và đã có đường khôi phục khác):
- Mật khẩu PostgreSQL, `SLIP_ENCRYPTION_KEY` và các bí mật khác của `api.env` / `postgres.env`: sau khi bật sao lưu (4.6), hai file này được gpg mã hóa và chép sang D: và R2 mỗi khi đổi (thư mục `khoa/`). Có tờ A và tờ B là mở được (mục 5.5).
- Tài khoản Quản trị viên đầu tiên: mất mật khẩu thì dùng `make -C infra prod-recover-admin ADMIN=<tên>` (trien-khai.md) hoặc nhờ Quản trị viên thứ hai cấp lại.
- Dấu vân tay: tính lại được từ khóa (có thể ghi thêm cho tiện).

Nghĩa là **tờ A và B là chìa mở mọi thứ còn lại**, nên giữ chúng cẩn thận nhất.

**Chỉ sau khi cả ba tờ đã cất** mới xóa khóa bí mật khỏi máy (mục 4.9.1, phần "Kiểm chứng trước khi xóa khóa").

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

### 4.9 Nhật ký bật thật (9/11/2026, laptop WSL Ubuntu, `prod-exam`)

Mục này ghi lại **đúng những gì đã làm trên máy thật**, theo thứ tự thời gian, kèm lệnh, kết quả đo được và lỗi gặp phải, để xem lại và học. Mục 4.1 đến 4.8 ở trên là **hướng dẫn** (làm lại ở máy khác được); mục 4.9 là **bằng chứng và kinh nghiệm** của lần làm đầu tiên. Số hiệu 4.9.N tương ứng mục 4.N (trừ 4.9.2 và các mục cuối).

**Trạng thái (9/11/2026): mục 4 hoàn tất, sao lưu đang chạy trên `prod-exam` thật.**

| Mục | Việc | Giờ (9/11) | Kết quả |
|---|---|---|---|
| 4.9.1 | Cặp khóa gpg, khóa bí mật cất Bitwarden và 3 tờ giấy, xóa khỏi máy | khoảng 12:00 đến 14:00 | đạt, đã giải mã thử bằng khóa từ Bitwarden |
| 4.9.2 | Tắt rồi mở lại WSL | khoảng 13:40 (giữa 4.9.1) | pod tự dựng lại, `/api/health` ok |
| 4.9.3 | Cloudflare R2: bucket, cảnh báo ngân sách, vòng đời, khóa API, thử xóa | khoảng 14:00 đến 15:30 | đạt; khóa **xóa được** file; 1 lỗi script sửa |
| 4.9.4 | healthchecks.io và `backup.env` | khoảng 15:30 đến 16:10 | đạt, báo động email thử thật |
| 4.9.5 | Bật lưu liên tục WAL | 16:13 | đạt, 11,9 giây |
| 4.9.6 | Cài và bật 6 timer, đẩy lần đầu | 16:15 đến 16:20 | đạt; 1 lỗi script sửa |
| 4.9.7 | Dump, bản nền, thử khôi phục lần đầu | 16:22 | đạt, **27 giây** (CSDL gần trống) |
| 4.9.8 | Giải mã thử bản `khoa/` trên R2 | khoảng 16:30 | dấu băm khớp |

#### 4.9.1 Cặp khóa gpg (mục 4.1)

| Bước | Việc | Lệnh | Kết quả |
|---|---|---|---|
| 1 | Kiểm trước | `gpg --list-keys` | chưa có khóa nào (lệnh tạo thư mục `~/.gnupg`) |
| 2 | Tạo khóa | `gpg --quick-gen-key "exam-backup <trieuvinhviem@gmail.com>" default default never` | tạo xong. Khóa chính ed25519 (ký) và khóa con cv25519 (mã hóa) |
| 3 | Lấy dấu vân tay | `gpg --list-keys --with-colons \| awk -F: '/^fpr/{print $10; exit}'` | **`C03E6416CDACA6645710AA3E14C0007D328A40D9`** (khóa con mã hóa: `FC009ABFF6411765`) |
| 4 | Xuất khóa bí mật | `gpg --armor --export-secret-keys <FPR> > ~/khoa-bi-mat.asc` (có `umask 077`) | 878 byte, 17 dòng, mở đầu `-----BEGIN PGP PRIVATE KEY BLOCK-----` |
| 5 | Cất vào Bitwarden | `clip.exe < ~/khoa-bi-mat.asc`, dán vào ghi chú bảo mật; mục riêng cho mật khẩu của khóa | hai mục: khóa bí mật và mật khẩu (tách riêng) |
| 6 | Kiểm bản Bitwarden | đọc lại clipboard (`powershell.exe Get-Clipboard`) rồi `diff -B` với bản gốc | xem "Lỗi gặp" bên dưới |
| 7 | Giải mã thử bằng khóa từ Bitwarden | nhập khóa vào keyring tạm (`gpg --homedir "$TMPG" --import …`), mã hóa một câu bằng khóa công khai rồi giải mã bằng keyring tạm | `secret key imported`, giải mã ra đúng câu thử |

**Lỗi gặp và cách xử lý (đáng nhớ):**

1. **`Inappropriate ioctl for device` khi ký hoặc giải mã.** gpg không mở được ô hỏi mật khẩu vì shell chưa đặt `GPG_TTY`. Sửa: `export GPG_TTY=$(tty)` trong **cửa sổ Ubuntu thật**. Không chạy qua dòng lệnh `!` của phiên làm việc này. Triệu chứng đi kèm là `Bad passphrase` ngay khi nhập khóa vào keyring tạm.
2. **Bộ gõ tiếng Việt bật khi nhập mật khẩu lúc tạo khóa** làm chữ gõ vào bị biến đổi (ví dụ `aw` thành `ă`), nên mật khẩu thật của khóa khác chuỗi lưu trong Bitwarden. Sửa: `gpg --change-passphrase <FPR>` (nhập mật khẩu cũ bằng đúng các phím như lần đầu, mật khẩu mới do Bitwarden sinh, chỉ chữ và số, **dán** vào lúc bộ gõ ở tiếng Anh). **Quy tắc rút ra:** mật khẩu của khóa luôn do Bitwarden sinh, chỉ gồm chữ và số, và luôn **dán**, không gõ tay.
3. **`diff` báo khác nhau dù đã "dán xong".** Mỗi lần xuất khóa bí mật, phần mã hóa bên trong đổi ngẫu nhiên (muối và vectơ khởi tạo), nên hai bản xuất ở hai thời điểm khác nhau luôn khác nhau. Ở đây ghi chú trong Bitwarden vẫn là bản xuất cũ (mật khẩu cũ). Cách tự kiểm nhanh không cần lộ khóa: so **dòng kiểm cuối của khối** (4 ký tự sau dấu `=`, ví dụ `=P22P`). Sau khi dán lại đúng bản, `diff` báo `GIONG NHAU` và giải mã thử thành công.

**Kiểm chứng trước khi xóa khóa, rồi xóa khóa (9/11/2026):**

1. Ba tờ giấy A, B, C đã làm và cất (chủ dự án xác nhận).
2. `gpgconf --kill gpg-agent` rồi ký thử bằng khóa trên máy: mật khẩu **dán từ Bitwarden** mở được (`BITWARDEN DUNG`); mật khẩu **gõ lại từ tờ B** cũng mở được (`TO B DUNG`).
3. Xuất khóa công khai: `~/khoa-cong-khai.asc` (652 byte, bắt đầu `-----BEGIN PGP PUBLIC KEY BLOCK-----`; không bí mật, có thể chép sang máy khác).
4. Xóa khóa bí mật: `gpg --batch --yes --delete-secret-keys C03E6416CDACA6645710AA3E14C0007D328A40D9` (thoát 0).
5. `shred -u` ba tệp tạm (`~/khoa-bi-mat.asc`, `~/khoa-tu-bitwarden.asc`, `~/thu.gpg`); không còn keyring tạm trong `/tmp` (WSL khởi động lại đã dọn); không còn bản tạm `khoa-bi-mat.txt` ở Windows; clipboard Windows xóa trắng.
6. Kiểm trạng thái cuối:
   - `gpg --list-secret-keys` **trống**, `~/.gnupg/private-keys-v1.d/` có 0 tệp.
   - `gpg --list-keys` còn khóa công khai `ed25519/14C0007D328A40D9` (`[SC]`) và khóa con `cv25519/FC009ABFF6411765` (`[E]`, dùng để mã hóa).
   - Mã hóa một câu bằng khóa công khai: được. Giải mã lại: `gpg: public key decryption failed: No secret key` (đúng ý: máy này chỉ mã hóa được, không giải mã được).

**Mục 4.1 hoàn tất.** Máy chỉ giữ khóa công khai. Dấu vân tay cho `EXAM_GPG_RECIPIENT` trong `backup.env` (mục 4.4): `C03E6416CDACA6645710AA3E14C0007D328A40D9`.

#### 4.9.2 Thử tắt rồi mở lại WSL (kiểm tra thêm, ngoài mục 4)

Chủ dự án tắt WSL Ubuntu giữa chừng và mở lại. Kết quả kiểm sau khi mở lại (uptime 10 phút):
- Pod `prod-exam` **tự dựng lại**: 6 container (`postgres`, `redis`, `api`, `worker`, `web`, `infra`) đều `Up 10 minutes`, bản đang chạy vẫn `75e57eb`.
- `/api/health` trong máy: `{"status":"ok","checks":{"postgres":"up","redis":"up"}}`, 200 trong 4 ms. Địa chỉ công khai `https://exam.plotrackerbluni.site/api/health`: 200 trong 0,55 giây.
- Kết luận: unit systemd của người dùng đưa pod lên lại sau khi WSL khởi động, đúng như thiết kế (Q cũ: pod chỉ chạy khi chủ dự án mở WSL). Lưu ý: lúc này lưu liên tục WAL **chưa bật** nên kết quả này là của pod chưa có sao lưu. Sau khi bật (4.5) cần thử lại một lần nữa (đặc biệt là việc PG khởi động lại với cờ lưu trữ).

#### 4.9.3 Cloudflare R2 (mục 4.2)

| Bước | Việc | Kết quả |
|---|---|---|
| 1 | Tạo bucket | `exam-backup`, vị trí Automatic, lớp Standard. **Cloudflare yêu cầu thêm phương thức thanh toán** (thẻ) mới bật được R2; chủ dự án đã thêm thẻ. Dữ liệu của ta nhỏ nên dự kiến vẫn trong gói miễn phí |
| 2 | Cảnh báo ngân sách | **Manage Account → Billing → Billable Usage**: hai cảnh báo thư **1 USD** và **5 USD**. Tra tài liệu Cloudflare: **không có trần chi tiêu cứng** cho R2 và cảnh báo chỉ để báo, không chặn; không có tài liệu nói rút thẻ thì R2 xử lý ra sao nên **không rút thẻ** (R2 dừng im lặng là rủi ro tệ hơn). Theo dõi dung lượng thật sau 1 đến 2 tuần |
| 3 | Quy tắc vòng đời | 5 quy tắc theo tiền tố: `daily/` 7 ngày, `weekly/` 28 ngày, `monthly/` 180 ngày, `wal/` 7 ngày, `base/` 15 ngày; không có quy tắc cho `media/`, `khoa/`, `selftest/` (chủ dự án báo đã tạo đủ 5; chưa đối chiếu lại từng dòng, việc này làm ở cuối mục 4.2) |
| 4 | Khóa API | token `exam-backup-prod`, quyền **Object Read & Write**, giới hạn bucket `exam-backup`, TTL vô hạn. Ba giá trị (Account ID, Access Key ID, Secret) cất ở Bitwarden, mục `exam-backup R2 key` |
| 5 | `backup.env` | `~/exam-prod-secrets/backup.env` (quyền 600, 15 dòng; độ dài Account ID 32, Access Key ID 32, Secret 64 ký tự). Chưa có hai địa chỉ healthchecks (4.3) |
| 6 | `make -C infra prod-backup-check` | ổ D: ghi được, gpg ổn; **R2 báo hỏng ở lần đầu** (xem lỗi 1); sau khi sửa: R2 ghi và đọc được |

**Phép thử "khóa có xóa được không" (kết quả thật):** tải 3 file nhỏ lên `selftest/xoa-thu/` rồi `rclone deletefile` một file bằng chính khóa này: **xóa được** (file biến mất, hai file kia còn). Kết luận: khóa Object Read & Write **có quyền xóa**. Vì vậy ở R2, "script không bao giờ xóa" chỉ là quy ước, chưa là chốt kỹ thuật: kẻ chiếm được máy này (đang giữ khóa) xóa được bản sao trên R2. Giảm thiểu hiện có: bản ở ổ D: và WSL (kẻ phải chiếm cả hai nơi); và quy tắc vòng đời không phải là chốt. Cân nhắc làm sau (6e): bật khóa đối tượng nếu Cloudflare hỗ trợ, hoặc dùng khóa tải lên riêng và khóa xóa riêng cất ngoài máy. Việc này đã dọn: các file thử trên R2 đã xóa, chỉ còn `selftest/ok.txt` (script ghi mỗi lần `check`).

**Lỗi gặp khi chạy với R2 thật (đáng nhớ):**

1. **`check` báo "R2 không ghi/đọc được" dù khóa đúng.** Nguyên nhân là lỗi trong script: các biến `RCLONE_CONFIG_EXAM_R2_*` được `export` bên trong hàm `r2_remote()`, mà hàm này luôn được gọi trong `$(...)` (shell con), nên biến không bao giờ tới lệnh `rclone` ở shell chính. Bài thử ở pod drill không lộ lỗi vì dùng thư mục giả qua `EXAM_R2_REMOTE`. Sửa: đặt các biến này một lần ở đầu `exam-backup.sh`, ngay sau khi nạp `backup.env`; `r2_remote()` chỉ in địa chỉ. **Bài học:** bài thử bằng đích giả không chứng minh đường dùng đích thật; luôn thử cả đường thật khi có thể.
2. **Mỗi lần tải lên, lần thử đầu của `rclone` (bản 1.60.1 của Ubuntu) bị R2 trả `501 Not Implemented`, lần thử thứ hai thành công** (rclone tự thử lại tối đa 3 lần, kết quả cuối vẫn đúng). Quan sát bằng `--dump headers`: HEAD 404, rồi PUT 501, rồi PUT 200. Hệ quả: số yêu cầu gấp đôi và mỗi lần đẩy chậm thêm chút; ở nhịp của ta (ước vài nghìn file mỗi tháng) vẫn rất xa hạn mức miễn phí 1 triệu thao tác loại A. Chưa sửa; hướng xử lý nếu muốn gọn: nâng `rclone` lên bản mới hơn (cần xin phép chủ dự án vì cài phần mềm ngoài kho Ubuntu). Ghi ở đây để khi đọc nhật ký rclone thấy dòng `501` thì biết là bình thường.
3. (Nhắc lại) zsh không có `read -p`: dùng `printf '…: '; read -r BIEN` (chạy được ở cả zsh và bash).

#### 4.9.4 healthchecks.io và `backup.env` (mục 4.3, 4.4)

| Bước | Việc | Kết quả |
|---|---|---|
| 1 | Đăng ký | gói **Hobbyist** (miễn phí, không thẻ): 20 việc theo dõi, 100 dòng nhật ký mỗi việc; SMS và gọi điện **0** (chỉ có ở gói trả tiền). Đang dùng 2 trên 20 |
| 2 | Tạo hai việc theo dõi | `exam-backup-nightly` (Period 1 ngày, Grace 3 ngày) và `exam-restore-test` (Period và Grace theo bảng thiết kế; xem mục 3.3) |
| 3 | Kênh báo | chủ dự án chọn **chỉ Email** (đã có Telegram nhưng không dùng; tài liệu Healthchecks không nói rõ gói Hobbyist có Telegram hay không, cũng chưa thử) |
| 4 | Địa chỉ ping | cất ở Bitwarden, mục `exam-backup healthchecks`; đưa vào `backup.env` bằng ô nhập ẩn (`stty -echo; read -r`), không qua cuộc trò chuyện |

**Cách thử báo động thật (không cần chờ hết hạn):** gọi `<địa-chỉ-ping>/fail` thì việc theo dõi chuyển sang **Down** ngay và gửi cảnh báo; gọi `<địa-chỉ-ping>` (không có `/fail`) thì trở lại **Up** và gửi thông báo hồi phục. Kết quả thật: cả hai việc đều Down rồi Up, thư **email nhận được đủ**. Nút *Test* ở trang Integrations chỉ thử kênh, không chứng minh địa chỉ ping và việc theo dõi nối đúng kênh, nên không thay được phép thử `/fail`.

`make -C infra prod-backup-check` sau khi điền xong: **tất cả ✓ trừ một mục**: lưu liên tục WAL chưa bật (việc của 4.5). Đã ✓: pod và PostgreSQL, `backup.env`, khóa công khai có, khóa bí mật không có, mã hóa thử, ổ D: ghi được, R2 ghi và đọc được, hai địa chỉ healthchecks, và đủ lệnh `jq rclone gpg flock curl`.

#### 4.9.5 Bật lưu liên tục WAL (mục 4.5, 16:13)

Điều kiện trước khi chạy: `prod-active-sessions` báo **0 Phiên thi** (đang diễn ra hoặc bắt đầu trong 60 phút tới) và 0 Lượt làm bài dở.

`make -C infra prod-enable-archiving` (Trợ lý chạy theo yêu cầu của chủ dự án), tổng **11,9 giây**:
1. Dump an toàn trước: `~/exam-prod-backups/truoc-deploy-20261109-161316-bat-luu-lien.dump`.
2. Dựng lại **chỉ container PostgreSQL** với `archive_mode=on`, `archive_command`, `archive_timeout=60` (volume `exam_pgdata` giữ nguyên).
3. Ép chuyển một đoạn WAL và đợi chép: thành công, lệnh báo "Đã bật lưu liên tục".

Kiểm sau đó:
- `prod-status`: `postgres` Up 16 giây, `worker` Up 18 giây (**worker khởi động lại một lần**, đúng như dự kiến), `api`, `web`, `redis` vẫn `Up 3 hours` (không bị động tới).
- `/api/health` trong máy báo `ok`; địa chỉ công khai `https://exam.plotrackerbluni.site/api/health`: **200 trong 0,68 giây** ngay sau đó.
- PostgreSQL: `archive_mode=on`, `archive_timeout=1min`, `wal_level=replica`; `pg_stat_archiver`: `archived_count=1`, `failed_count=0`, đoạn đầu `000000010000000000000001` lúc 09:13:25 UTC (16:13 giờ địa phương).
- Thư mục `~/exam-prod-backups/wal/` có `000000010000000000000001.gz` (3,8 MB; đoạn WAL đầu tiên chứa nhiều dữ liệu khởi tạo, các đoạn sau thường nhỏ hơn khi rảnh).
- `prod-backup-check`: **mục "lưu liên tục WAL đã bật" đã ✓**.
- Đợi thêm hơn 1 phút: **không có đoạn WAL mới** (`archived_count` vẫn 1, `failed_count` 0). Đúng thiết kế: `archive_timeout` chỉ ép chuyển đoạn khi **có ghi dữ liệu mới**; lúc rảnh không có gì thì không sinh file. Cần theo dõi tốc độ sinh WAL khi có người dùng và khi có Phiên thi (mục "Chưa thử" của slice-6.md).

#### 4.9.6 Cài và bật timer (mục 4.6, khoảng 16:15)

Trợ lý chạy theo đồng ý của chủ dự án: `make -C infra prod-backup-install` (chép script sang `~/.local/share/exam-prod/bin/`, chưa bật gì) rồi `make -C infra prod-backup-enable` (chạy `check` đạt hết rồi bật 6 timer).

Kết quả:
- `systemctl --user list-timers 'exam-backup-*'`: **6 timer**, lần chạy kế tiếp: `push` mỗi phút (16:18), `release` mỗi 5 phút, `nightly` **2:00 ngày 10/11**, `base` **Chủ nhật 15/11 03:00**, `restore-test` **1/12 04:00**; `catchup` chạy ngay một lần (máy đã bật quá 5 phút).
- **Lần đẩy đầu tiên** (16:18:04 đến 16:19:51, khoảng **1 phút 47 giây**, vì còn mã hóa và đẩy lần đầu): `ổ chép +3, R2 +3`: hai file bí mật (`khoa/api.env-…gpg`, `khoa/postgres.env-…gpg`, đã mã hóa vì hash vừa được ghi lần đầu) và đoạn WAL số 1. Lần sau (16:19:52, **1 giây**): `+1`: WAL số 2 (PostgreSQL đã sinh thêm một đoạn khi có hoạt động). Đối chiếu: `rclone lsf -R` trên R2 thấy đúng 5 file (`khoa/` 2, `wal/` 2 đuôi `.gz.gpg`, `selftest/ok.txt`); ổ D: có đúng 4 file (không có `.gpg` ở `wal/`, vì ổ D: giữ dạng thường).
- `status`: 6/6 timer, "Sức khỏe archive: ổn", "Dãy WAL: liền nhau", sổ đẩy có 4 file cho mỗi đích. Chưa có dump đêm, bản nền, hay thử khôi phục (làm ở 4.7).

**Lỗi thứ hai gặp khi chạy thật (sửa luôn):** `status` thoát lỗi, `catchup` báo `status=1/FAILURE`. Nguyên nhân: hàm `newest` (tìm file mới nhất trong thư mục) trả lỗi khi **thư mục chưa tồn tại** (máy mới, chưa có dump đêm nào nên chưa có `daily/`); với `set -o pipefail` lỗi này làm cả lệnh thoát. Bài thử ở pod drill không lộ vì thư mục luôn có sẵn. Sửa: `newest` trả rỗng khi thư mục chưa có. **Bài học (cùng loại với lỗi R2):** chạy thật trên **trạng thái trống** (lần đầu) lộ lỗi mà bài thử tái dùng trạng thái cũ không thấy; bài thử drill nên có thêm kịch bản "bắt đầu từ thư mục sao lưu hoàn toàn trống" (việc cho 6e).

**Lưu ý khi đọc nhật ký:** file `~/.local/state/exam-prod/push-errors.log` ghi các dòng `501 Not Implemented` ở lần thử đầu mỗi lần tải lên R2 (rclone 1.60.1), rồi `Attempt 2/3 succeeded`. Đó là chuyện đã biết (xem 4.9.3, lỗi 2), **không phải sự cố**. Chỉ cần lo khi thấy `Attempt 3/3 failed` hoặc `Failed to copy` mà không có `succeeded` ngay sau.

#### 4.9.7 Lần đầu thử khôi phục (mục 4.7, 16:22)

Trợ lý chạy ba lệnh theo đồng ý của chủ dự án, lúc không có Phiên thi:

| Lệnh | Kết quả |
|---|---|
| `make -C infra prod-backup-dump` | `daily/exam-20261109-162222-nightly.dump` (152 KB, **3 giây**) và file `.counts` (số dòng từng bảng lúc dump) |
| `make -C infra prod-backup-basebackup ARGS=--force` | `base/exam-20261109-162232-base.tar.gz` (4,2 MB, **2 giây**, bắt đầu từ WAL `000000010000000000000004`) và `.info` |
| `make -C infra prod-backup-restore-test` | **ĐẠT trong 27 giây**, pod tạm `rt-prod` đã tự xóa (không còn volume `rt*`) |

Chi tiết `restore-test` (`~/.local/state/exam-prod/restore-test.json`):

| Giai đoạn | Kết quả | Thời gian |
|---|---|---|
| dump: nạp dump vào PostgreSQL tạm, so số dòng 38 bảng với file `.counts` | đạt, số dòng khớp | 6 giây |
| pitr: bản nền + WAL đến `000000010000000000000005`, tìm dòng dấu `ops.backup_test` mới nhất | đạt | 8 giây |
| api: chạy ảnh `75e57eb` trên bản khôi phục, `/api/health` | đạt, `ok` | 9 giây |
| media: so mẫu ảnh với volume thật | đạt (**chưa có ảnh nào cần sao lưu**, nên giai đoạn này **chưa được thử thật**) | 0 giây |

**Đọc con số này đúng cách:** CSDL thật lúc đó gần như trống (0 đề thi, 0 Lượt làm bài; chỉ có 8 dòng nhật ký, 4 phiên đăng nhập, 5 sự kiện đăng nhập), nên **27 giây chỉ là cận dưới** của thời gian khôi phục. Thời gian thật sẽ tăng theo dữ liệu (dump, ảnh minh họa) và theo lượng WAL phải phát lại. Cần **đo lại sau khi có dữ liệu thật** (lần thử tự động ngày 1 mỗi tháng, hoặc chạy tay `prod-backup-restore-test`) và ghi lại để biết RTO thật. Giai đoạn media chỉ có nghĩa khi có ảnh minh họa trong volume.

`status` sau đó: "Bản đêm mới nhất: 1 phút trước", "Bản nền mới nhất: 0 phút trước", "Thử khôi phục cuối: ĐẠT trong 27s", "Sức khỏe archive: ổn", "Dãy WAL: liền nhau", "Chờ đẩy 8/8" (lần đẩy kế tiếp, trong 1 phút, sẽ chuyển dump và bản nền sang ổ D: và R2).

#### 4.9.8 Giải mã thử bản R2 bằng khóa từ Bitwarden (mục 4.8)

Trước đó, Trợ lý xóa `selftest/ok.txt` trên R2 (47 byte, do lệnh `check` ghi để chứng minh R2 ghi và đọc được; chỉ `check` dùng nó; **mỗi lần chạy `check` hoặc `prod-backup-enable` nó được tạo lại**, vô hại) và tải hai file `khoa/*.gpg` về `~/thu-giai-ma/`.

Chủ dự án làm tay: lấy khóa bí mật từ Bitwarden vào clipboard (`powershell.exe Get-Clipboard`, rồi xóa clipboard), nhập vào keyring tạm (`gpg --homedir "$TMPG" --import`, dán mật khẩu từ Bitwarden), giải mã hai file và chỉ in 12 ký tự đầu dấu băm SHA-256 của nội dung (không in bí mật ra màn hình):

| File trên R2 | Dấu băm sau giải mã | Khớp với |
|---|---|---|
| `khoa/postgres.env-20261109-302ff1a7.gpg` | `302ff1a7d6ae` | `~/exam-prod-secrets/postgres.env` |
| `khoa/api.env-20261109-574a33cb.gpg` | `574a33cbee2c` | `~/exam-prod-secrets/api.env` |

**Kết quả: khớp cả hai.** Chuỗi "bí mật trên máy, mã hóa bằng khóa công khai, lên R2, giải mã bằng khóa trong Bitwarden" đã được chứng minh trọn vẹn. (Tên file `khoa/` chứa 8 ký tự đầu của dấu băm nên có thể đối chiếu bằng mắt.) Dọn sau đó: `rm -rf "$TMPG" ~/thu-giai-ma`; `gpg --list-secret-keys` trống, thư mục `private-keys-v1.d` rỗng; clipboard Windows xóa trắng (Trợ lý kiểm lại và xóa thêm lần nữa vì thấy còn 63 ký tự).

#### 4.9.9 Bài học tổng hợp

Về thao tác (người vận hành):
1. **Mật khẩu của khóa gpg do Bitwarden sinh, chỉ chữ và số, luôn dán, không gõ tay.** Gõ khi bộ gõ tiếng Việt bật làm sai mật khẩu (4.9.1).
2. **gpg cần `export GPG_TTY=$(tty)` trong cửa sổ Ubuntu thật**, không chạy qua dòng lệnh `!` của phiên làm việc (4.9.1).
3. Shell là **zsh**: không có `read -p`; dùng `printf '…: '; read -r BIEN` (và `stty -echo` cho bí mật). `echo ======` làm zsh báo lỗi.
4. **Bí mật không đi qua cuộc trò chuyện:** nhập vào `backup.env` bằng ô nhập ẩn; kiểm bằng độ dài và 4 ký tự đầu, không in hết.
5. **Xóa clipboard Windows** (`echo -n "" | clip.exe`) sau mỗi lần dán bí mật; đã gặp lần còn sót 63 ký tự.
6. Mỗi lần xuất khóa bí mật có nội dung khác nhau; so bản lưu bằng **dòng kiểm cuối** (`=XXXX`) hoặc bằng giải mã thật, không so `diff` hai lần xuất.

Về thiết kế và kiểm thử (cho người sửa script):
7. **Bài thử bằng đích giả hoặc trạng thái cũ không bắt hết lỗi.** Hai lỗi chỉ lộ khi chạy thật lần đầu: biến `rclone` export trong `$(...)` (đích giả `EXAM_R2_REMOTE` bỏ qua đường này) và `newest` trên thư mục chưa có (pod drill luôn có sẵn thư mục). Việc cho 6e: thêm kịch bản "bắt đầu từ thư mục sao lưu hoàn toàn trống" và một lần thử với đích R2 thật.
8. Trước khi sửa script và cài lại, chạy `make -C infra backup-drill-test` (61 đạt, 0 lỗi sau cả hai chỗ sửa), rồi `prod-backup-install` để timer dùng bản mới.
9. Khóa Object Read & Write của R2 **xóa được** file: "không xóa trên R2" chỉ là quy ước (xem 4.9.3 và mục 6 về giới hạn).
10. rclone 1.60.1 trả `501` ở lần tải đầu mỗi lần rồi tự thành công: không phải sự cố (4.9.3, 4.9.6).

#### 4.9.10 Việc còn lại sau mục 4

| Việc | Khi nào | Ai |
|---|---|---|
| Đối chiếu từng dòng 5 quy tắc vòng đời trên R2 với bảng ở mục 4.2 | sớm | chủ dự án, kèm Trợ lý |
| Xem sao lưu đêm tự động đầu tiên (02:00 ngày 10/11) và việc `exam-backup-nightly` chuyển Up trên healthchecks.io | sáng 10/11 (laptop phải bật hoặc ngủ nhẹ lúc 02:00; tắt thì timer chạy bù khi mở WSL) | chủ dự án, Trợ lý chạy `status` |
| Đo lại thời gian khôi phục (RTO) khi đã có dữ liệu và ảnh thật; giai đoạn media chưa thử thật | sau khi có dữ liệu; lần tự động ngày 1 mỗi tháng (1/12) | tự động, Trợ lý ghi số |
| Đo tốc độ sinh WAL và dung lượng R2 sau 1 đến 2 tuần; xem hóa đơn và cảnh báo ngân sách | 1 đến 2 tuần | chủ dự án |
| Lặp lại giải mã thử bản R2 (4.8) | mỗi quý | chủ dự án |
| Cân nhắc nâng `rclone` (bớt `501`) và chặn xóa trên R2 (khóa tải lên riêng hoặc khóa đối tượng) | 6e | thảo luận |
| PR 6d (trạng thái sao lưu trong ứng dụng), 6e (diễn tập khôi phục sang máy khác, danh sách trước khi dùng thật) | tiếp theo | |
| **Quản trị viên thứ hai** trước Phiên thi thật đầu tiên | trước Phiên thi thật | chủ dự án |

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
