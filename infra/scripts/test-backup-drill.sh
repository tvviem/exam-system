#!/usr/bin/env bash
# Thử toàn bộ chuỗi sao lưu trên pod thử `drill-exam` (PR 6c, docs/plan/slice-6.md Q361 điểm 8). KHÔNG đụng pod thật.
#
#   make -C infra backup-drill-test
#
# Cần pod drill đã dựng (dựng bằng: EXAM_STAGE=drill TAG=<mã commit> EXAM_ADMIN_FULL_NAME=Thử EXAM_ADMIN_PASSWORD=<10+ ký tự>
# bash scripts/exam-ctl.sh bootstrap). R2 được thay bằng một thư mục (rclone kiểu local), khóa gpg và healthchecks là đồ giả
# dựng trong thư mục tạm, nên chạy được khi chưa có tài khoản R2 thật. Mất khoảng 4–5 phút. In từng bước đạt/lỗi, thoát 1 nếu có lỗi.
set -uo pipefail
cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
[ "${EXAM_STAGE:-drill}" = drill ] || {
  echo "Chỉ chạy trên pod drill (EXAM_STAGE=drill)." >&2
  exit 2
}
export EXAM_STAGE=drill
SCRIPT="$PWD/exam-backup.sh"
CTL="$PWD/exam-ctl.sh"
PODMAN="${PODMAN:-podman}"
WORK="$(mktemp -d)"
BACKUP="$HOME/exam-drill-backups"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/exam-drill"
SECRETS="$HOME/exam-drill-secrets"
HC_PORT=18081
PASS=0 FAIL=0

cleanup() {
  [ -z "${HC_PID:-}" ] || kill "$HC_PID" 2>/dev/null
  rm -f "$SECRETS/backup.env"
  EXAM_STAGE=drill bash "$SCRIPT" disable >/dev/null 2>&1 || true
  rm -f "$HOME"/.config/systemd/user/exam-backup-drill-*.{service,timer}
  systemctl --user daemon-reload 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

ok() { PASS=$((PASS + 1)); printf '  ✓ %s\n' "$*"; }
bad() { FAIL=$((FAIL + 1)); printf '  ✗ %s\n' "$*"; }
check() { # mô tả, lệnh...
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then ok "$desc"; else bad "$desc"; fi
}
check_fail() { # mô tả, lệnh... (phải thất bại)
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then bad "$desc"; else ok "$desc"; fi
}
backup() { bash "$SCRIPT" "$@"; }
pg() { "$PODMAN" exec drill-exam-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"' _ "$1"; }
gen_wal() { pg "create table zz_t as select generate_series(1,1000) a; select pg_switch_wal(); drop table zz_t" >/dev/null; sleep 3; }
step() { printf '\n== %s\n' "$*"; }

"$PODMAN" pod exists drill-exam || {
  echo "Chưa có pod drill-exam. Dựng bằng exam-ctl.sh bootstrap (xem đầu file này)." >&2
  exit 2
}

step "Chuẩn bị: xóa sạch trạng thái sao lưu CŨ của pod drill, dựng khóa gpg giả, R2 giả, healthchecks giả"
bash "$CTL" disable-archiving >/dev/null 2>&1
"$PODMAN" unshare rm -rf "$BACKUP" 2>/dev/null
rm -rf "$STATE/backup-failing" "$STATE/backup-report.jsonl" "$STATE/backup-report.cursor"
rm -rf "$BACKUP" "$STATE/push-ledger" "$STATE/backup-runs.jsonl" "$STATE/release-last" "$STATE/secrets-hashes.txt" "$STATE/restore-test.json" "$STATE/push-last-failure" "$STATE/push-errors.log"
export GNUPGHOME="$WORK/gnupg-full"
mkdir -m 700 "$GNUPGHOME" "$WORK/gnupg-pub"
gpg --batch --passphrase '' --quick-gen-key 'exam-test <test@example.invalid>' default default never >/dev/null 2>&1
FPR="$(gpg --list-keys --with-colons | awk -F: '/^fpr/{print $10; exit}')"
gpg --export "$FPR" | GNUPGHOME="$WORK/gnupg-pub" gpg --import >/dev/null 2>&1
FULL_HOME="$WORK/gnupg-full"
MIRROR="$WORK/mirror" FAKE_R2="$WORK/fake-r2"
cat >"$WORK/hc_mock.py" <<'PY'
import http.server, sys
class H(http.server.BaseHTTPRequestHandler):
    def _r(self):
        n = int(self.headers.get('Content-Length') or 0)
        b = self.rfile.read(n).decode()[:300] if n else ''
        open(sys.argv[2], 'a').write(f"{self.command} {self.path} {b}\n")
        self.send_response(200); self.end_headers(); self.wfile.write(b'OK')
    do_GET = do_POST = _r
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
PY
: >"$WORK/hc.log"
python3 "$WORK/hc_mock.py" "$HC_PORT" "$WORK/hc.log" >/dev/null 2>&1 &
HC_PID=$!
umask 077
cat >"$SECRETS/backup.env" <<EOF
GNUPGHOME=$WORK/gnupg-pub
EXAM_GPG_RECIPIENT=$FPR
EXAM_BACKUP_MIRROR_DIR=$MIRROR
: "\${EXAM_R2_REMOTE:=$FAKE_R2}" # biến môi trường đặt trước thì thắng (để bài thử giả lập R2 hỏng)
HC_NIGHTLY_URL=http://127.0.0.1:$HC_PORT/nightly
HC_RESTORE_URL=http://127.0.0.1:$HC_PORT/restore
EOF
umask 022
ok "chuẩn bị xong (khóa gpg $FPR; R2 giả $FAKE_R2)"

step "0. Bắt đầu từ trạng thái HOÀN TOÀN TRỐNG (chưa có thư mục sao lưu, sổ, bản nào): các lệnh đọc không được hỏng"
# Bài học 9/11/2026 (khoi-phuc.md 4.9.9): máy mới chưa có daily/, base/, wal/ làm hỏng status và catchup, mà bài thử cũ luôn có sẵn thư mục.
check "thư mục sao lưu chưa tồn tại" test ! -e "$BACKUP"
check "status chạy được trên trạng thái trống (thoát 0)" backup status
check "status nói chưa có bản nào" bash -c "bash '$SCRIPT' status 2>&1 | grep -q 'Bản đêm mới nhất:     chưa có'"
check "wal-gaps trên trạng thái trống không lỗi" backup wal-gaps
check "prune --dry-run trên trạng thái trống không lỗi" backup prune --dry-run
check "push trên trạng thái trống không lỗi (chưa có gì để đẩy)" backup push
PF_OUT="$(bash "$SCRIPT" preflight 2>&1)"
check "preflight chạy hết trên trạng thái trống (không lỗi cú pháp, không biến chưa đặt)" bash -c "! printf '%s' '$PF_OUT' | grep -Eq 'unbound variable|command not found|syntax error|: line [0-9]+:'"
check "preflight báo KHÔNG ĐẠT khi chưa có sao lưu (mục ✗), không im lặng" bash -c "printf '%s' '$PF_OUT' | grep -q 'KHÔNG ĐẠT'"
rm -rf "$STATE/backup-failing" "$STATE/backup-report.jsonl" "$STATE/backup-report.cursor"

step "1. Điều kiện trước khi bật lưu liên tục"
check_fail "check báo chưa đủ (lưu liên tục chưa bật)" backup check
check "enable-archiving dựng lại PostgreSQL với archive_mode=on" bash "$CTL" enable-archiving
check "archive_mode đang bật" test "$(pg 'SHOW archive_mode')" = on
check "check đạt đủ sau khi bật" backup check

step "2. Dump, bản nền, đẩy sang ổ chép và R2 (mã hóa)"
check "dump đêm" backup dump
check "dump sau Công bố" backup dump publish
check "bản nền pg_basebackup" backup basebackup --force
gen_wal
check "đẩy file mới" backup push
check "ổ chép có WAL" bash -c "ls '$MIRROR'/wal/*.gz"
check "R2 có WAL dạng mã hóa .gpg" bash -c "ls '$FAKE_R2'/wal/*.gz.gpg"
WAL1="$(ls "$BACKUP"/wal/*[0-9A-F].gz | head -1)"
check "giải mã bản R2 (bằng khóa bí mật của bài thử) khớp bản gốc" bash -c "GNUPGHOME='$FULL_HOME' gpg --batch -q -d '$FAKE_R2/wal/$(basename "$WAL1").gpg' | cmp - '$WAL1'"
check "đẩy lần hai không có gì mới (êm lặng)" test -z "$(backup push 2>&1)"

step "3. Một đích hỏng không chặn đích kia, và hồi phục khi đích khỏe lại"
gen_wal
GOOD_R2="$FAKE_R2"
check_fail "R2 hỏng thì push báo lỗi" env EXAM_R2_REMOTE=/proc/khong-co/r2 bash "$SCRIPT" push
check "ổ chép vẫn nhận WAL mới" bash -c "test \$(ls '$MIRROR'/wal/*.gz | wc -l) -ge \$(ls '$BACKUP'/wal/*.gz | wc -l)"
check "R2 khỏe lại thì đẩy bù" env EXAM_R2_REMOTE="$GOOD_R2" bash "$SCRIPT" push
check "R2 đủ WAL sau khi bù" bash -c "test \$(ls '$FAKE_R2'/wal/*.gz.gpg | wc -l) -ge \$(ls '$BACKUP'/wal/*[0-9A-F].gz | wc -l)"

step "4. Ảnh: chỉ chép thư mục bền, bỏ thư mục tạm; khóa bí mật mã hóa khi đổi"
"$PODMAN" run --rm --user 1000 -v drill_exam_media:/m docker.io/library/postgres:17 sh -c 'umask 077; mkdir -p /m/illustrations/t1 /m/uploads/q /m/slips /m/tmp/x; echo anh > /m/illustrations/t1/1.webp; echo pii > /m/uploads/q/b; echo slip > /m/slips/s.enc; echo t > /m/tmp/x/y' >/dev/null 2>&1
# File trong volume do người dùng của container sở hữu: sửa giờ qua `podman unshare` để vượt ngưỡng 60 giây.
"$PODMAN" unshare touch -d '2 minutes ago' "$("$PODMAN" volume inspect drill_exam_media -f '{{.Mountpoint}}')/illustrations/t1/1.webp"
backup push >/dev/null 2>&1
check "ảnh illustrations được chép" test -f "$BACKUP/media/illustrations/t1/1.webp"
check_fail "uploads/ KHÔNG được chép" test -e "$BACKUP/media/uploads"
check_fail "slips/ KHÔNG được chép" test -e "$BACKUP/media/slips"
check_fail "tmp/ KHÔNG được chép" test -e "$BACKUP/media/tmp"
check "khóa bí mật được mã hóa và lưu" bash -c "ls '$BACKUP'/khoa/api.env-*.gpg '$BACKUP'/khoa/postgres.env-*.gpg"
check_fail "không có file khóa dạng thường trong thư mục sao lưu" bash -c "ls '$BACKUP'/khoa/*.env"
check "R2 có ảnh (mã hóa) và khóa" bash -c "ls '$FAKE_R2'/media/illustrations/t1/1.webp.gpg '$FAKE_R2'/khoa/api.env-*.gpg"
echo "X=1" >>"$SECRETS/api.env"
backup push >/dev/null 2>&1
sed -i '$d' "$SECRETS/api.env"
check "đổi khóa thì có bản mới (2 bản api.env)" test "$(ls "$BACKUP"/khoa/api.env-*.gpg | wc -l)" = 2

step "5. Dãy WAL: đứt thì phát hiện"
gen_wal
gen_wal
gen_wal
check "dãy WAL liền ban đầu" test -z "$(backup wal-gaps)"
MID="$(ls "$BACKUP"/wal/*[0-9A-F].gz | tail -2 | head -1)"
mv "$MID" "$WORK/wal-saved.gz"
check "wal-gaps thấy chỗ đứt" test -n "$(backup wal-gaps)"
check_fail "nightly báo lỗi khi WAL đứt" backup nightly
check "healthchecks nhận /fail khi WAL đứt" grep -q 'POST /nightly/fail' "$WORK/hc.log"
mv "$WORK/wal-saved.gz" "$MID"
check "dãy liền lại sau khi trả file" test -z "$(backup wal-gaps)"

step "6. Sao lưu đêm trọn vẹn, báo healthchecks"
: >"$WORK/hc.log"
check "nightly đạt" backup nightly
check "healthchecks nhận /start rồi thành công" bash -c "grep -q 'POST /nightly/start' '$WORK/hc.log' && grep -q 'POST /nightly ' '$WORK/hc.log'"

step "7. Công bố mới thì dump ngay"
backup release-check >/dev/null 2>&1
N0="$(ls "$BACKUP"/daily/*-publish.dump | wc -l)"
backup release-check >/dev/null 2>&1
check "chưa có Công bố mới thì không dump" test "$(ls "$BACKUP"/daily/*-publish.dump | wc -l)" = "$N0"
pg "insert into audit_logs(actor_id,action,entity_type,before,after,at) values (NULL,\$\$session.released\$\$,\$\$session\$\$,\$\${}\$\$::jsonb,\$\${}\$\$::jsonb,now())" >/dev/null
backup release-check >/dev/null 2>&1
check "có Công bố mới thì dump loại publish" test "$(ls "$BACKUP"/daily/*-publish.dump | wc -l)" = $((N0 + 1))

step "8. Dọn bản cũ: giữ bản mới nhất, chạy thử không xóa"
for i in $(seq 1 20); do
  f="$BACKUP/daily/exam-202601$(printf '%02d' "$i")-020000-nightly.dump"
  echo x >"$f"
  echo x >"$f.counts"
done
backup push >/dev/null 2>&1 # file giả phải vào sổ đẩy thì mới được phép xóa (chốt "chưa đẩy xong thì chưa xóa")
N1="$(ls "$BACKUP"/daily/*-nightly.dump | wc -l)"
backup prune --dry-run >/dev/null 2>&1
check "--dry-run không xóa gì" test "$(ls "$BACKUP"/daily/*-nightly.dump | wc -l)" = "$N1"
KEEP_LOCAL_DAILY=0 bash "$SCRIPT" prune >/dev/null 2>&1
check "giữ đúng 1 bản đêm khi đặt giữ 0 (không bao giờ xóa bản mới nhất)" test "$(ls "$BACKUP"/daily/*-nightly.dump | wc -l)" = 1
# Các bản giả dựng ở trên đều đặt tên tháng 1 năm 2026; bản thật còn lại phải mang ngày hôm nay (không phụ thuộc ngày trong tháng).
check "bản còn lại là bản mới nhất (không phải một trong các bản giả cũ)" bash -c "ls '$BACKUP'/daily/*-nightly.dump | grep -q \"exam-$(date +%Y%m%d)-\""
# Làm lại một bản đêm thật để các bước sau (thử khôi phục) có bản dump hợp lệ.
backup dump >/dev/null 2>&1

step "9. Thử khôi phục đầy đủ (dump, WAL đến cuối, ứng dụng, ảnh) và các tình huống hỏng"
backup basebackup --force >/dev/null 2>&1
check "restore-test đạt cả 4 bước" backup restore-test
check "restore-test.json ghi ok" test "$(jq -r .ok "$STATE/restore-test.json")" = true
check "pod và volume tạm đã dọn" test -z "$("$PODMAN" pod ls --format '{{.Name}}' | grep '^rt-drill')$("$PODMAN" volume ls --format '{{.Name}}' | grep '^rt_drill')"
DUMP="$(ls "$BACKUP"/daily/*-nightly.dump | tail -1)"
cp "$DUMP" "$WORK/dump.saved"
head -c 1000 "$WORK/dump.saved" >"$DUMP"
check_fail "dump hỏng thì restore-test báo lỗi" backup restore-test
check "...và ứng dụng không được tính 'khỏe giả'" test "$(jq -r .phases.api.status "$STATE/restore-test.json")" = fail
cp "$WORK/dump.saved" "$DUMP"
BASE_START="$(sed -n 's/^start_wal=//p' "$(ls "$BACKUP"/base/*.info | tail -1)")"
gen_wal
gen_wal
GAPF=""
for f in "$BACKUP"/wal/*[0-9A-F].gz; do
  n="$(basename "$f" .gz)"
  if [[ "$n" > "$BASE_START" ]]; then GAPF="$f"; break; fi
done
mv "$GAPF" "$WORK/wal-saved2.gz"
check_fail "WAL sau bản nền đứt thì restore-test báo lỗi" backup restore-test
mv "$WORK/wal-saved2.gz" "$GAPF"
check "...và pod tạm vẫn được dọn" test -z "$("$PODMAN" pod ls --format '{{.Name}}' | grep '^rt-drill')"

step "9b. Khôi phục về một thời điểm (pitr) và thay cơ sở dữ liệu bằng một bản dump (restore-dump)"
pg "drop table if exists pitr_demo; create table pitr_demo(id int, note text); insert into pitr_demo values (1,'A truoc moc')" >/dev/null
sleep 3
T="$(date '+%Y-%m-%d %H:%M:%S')"
sleep 3
pg "insert into pitr_demo values (2,'B sau moc')" >/dev/null
SEG="$(pg "select pg_walfile_name(pg_current_wal_insert_lsn())")"
pg "select pg_switch_wal()" >/dev/null
for _ in $(seq 1 30); do [ -e "$BACKUP/wal/$SEG.gz" ] && break; sleep 1; done
check "pitr dựng PostgreSQL tạm đến thời điểm giờ máy $T" backup pitr "$T"
check "bản tạm chỉ có dòng trước mốc (không có dòng sau mốc)" test "$("$PODMAN" exec pitr-drill sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "select string_agg(id::text, \$\$,\$\$ order by id) from pitr_demo"')" = 1
"$PODMAN" exec pitr-drill sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$WORK/pitr.dump"
backup pitr-stop >/dev/null 2>&1
check "pitr-stop dọn container và volume tạm" test -z "$("$PODMAN" ps -a --format '{{.Names}}' | grep '^pitr-drill')$("$PODMAN" volume ls --format '{{.Name}}' | grep '^pitr_drill')"
pg "insert into pitr_demo values (9,'C: se mat sau khi khoi phuc')" >/dev/null
check_fail "restore-dump không có --yes và không có bàn phím thì từ chối" bash -c "bash '$SCRIPT' restore-dump '$WORK/pitr.dump' </dev/null"
check_fail "restore-dump từ chối file không phải bản dump" bash "$SCRIPT" restore-dump /etc/hostname --yes
check "restore-dump --yes thay cơ sở dữ liệu" backup restore-dump "$WORK/pitr.dump" --yes
check "sau khôi phục chỉ còn dòng A (dòng C đã mất theo đúng cảnh báo)" test "$(pg 'select string_agg(id::text, $$,$$ order by id) from pitr_demo')" = 1
check "audit_logs ghi ops.restore" test "$(pg "select count(*) from audit_logs where action = 'ops.restore'")" -ge 1
check "ứng dụng chạy lại khỏe" bash -c "curl -fsS http://127.0.0.1:8190/api/health | grep -q '\"status\":\"ok\"'"
check "có bản an toàn 'trước khi khôi phục'" bash -c "ls '$BACKUP'/truoc-deploy-*truoc-khoi-p*.dump"
check "khóa sao lưu không bị container api/worker giữ (việc khác chạy được ngay)" backup dump

step "9c. Báo sang bảng backup_runs của ứng dụng (PR 6d, Q362 đến Q366)"
# Pod drill chạy ảnh cũ chưa có bảng này nên dựng bảng bằng chính file migration 0022 (bỏ dấu ngắt câu của drizzle).
SQL_FILE="$PWD/../../apps/api/drizzle/0022_sao_luu.sql"
runs() { pg "select $1 from backup_runs $2"; }
rm -rf "$STATE/backup-failing" "$STATE/backup-report.jsonl" "$STATE/backup-report.cursor"
pg "drop table if exists backup_runs; drop type if exists backup_run_status" >/dev/null
check "chưa có bảng backup_runs: dump vẫn đạt (việc báo bảng bị bỏ qua, không làm hỏng sao lưu)" backup dump
check "sổ báo cáo được dựng từ sổ gốc và có dòng dump-nightly chờ chèn" bash -c "grep -q '\"kind\":\"dump-nightly\"' '$STATE/backup-report.jsonl'"
check "con trỏ chưa dịch vì chưa chèn được" test "$(cat "$STATE/backup-report.cursor" 2>/dev/null || echo 0)" = 0
sed 's/--> statement-breakpoint//' "$SQL_FILE" | "$PODMAN" exec -i drill-exam-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' >/dev/null 2>&1
check "có bảng rồi: release-check chèn bù các dòng cũ" backup release-check
check "bảng có bản đêm ok" test "$(runs 'count(*)' "where kind='dump-nightly' and status='ok'")" -ge 1
check "chèn bù cả việc cũ từ sổ gốc (bản nền)" test "$(runs 'count(*)' "where kind='basebackup' and status='ok'")" -ge 1
N0="$(runs 'count(*)')"
backup release-check >/dev/null 2>&1
check "chạy lại không chèn trùng" test "$(runs 'count(*)')" = "$N0"
check "đẩy thành công bình thường KHÔNG vào bảng (Q362)" test "$(runs 'count(*)' "where kind in ('push','media')")" = 0
chmod a-w "$BACKUP/daily"
check_fail "dump hỏng (thư mục đích chỉ đọc) báo lỗi" backup dump
check_fail "dump hỏng lần hai cũng báo lỗi" backup dump
chmod u+w "$BACKUP/daily"
check "cả đợt lỗi chỉ có MỘT dòng lỗi trong bảng (không lặp)" test "$(runs 'count(*)' "where kind='dump-nightly' and status='failed'")" = 1
check "dump lại được" backup dump
check "dòng mới nhất của loại này là ok (chuông tự tắt nhờ dòng này)" test "$(runs 'status' "where kind='dump-nightly' order by finished_at desc limit 1")" = ok
gen_wal
check_fail "R2 hỏng: push báo lỗi" env EXAM_PUSH_ALERT_SECONDS=3600 EXAM_R2_REMOTE=/proc/khong-co/r2 bash "$SCRIPT" push
check "lỗi đẩy mới ngắn (dưới ngưỡng 30 phút) CHƯA ghi vào bảng (Q364)" test "$(runs 'count(*)' "where kind='push'")" = 0
check_fail "R2 vẫn hỏng, ngưỡng 0 giây" env EXAM_PUSH_ALERT_SECONDS=0 EXAM_R2_REMOTE=/proc/khong-co/r2 bash "$SCRIPT" push
check_fail "R2 vẫn hỏng, lần nữa" env EXAM_PUSH_ALERT_SECONDS=0 EXAM_R2_REMOTE=/proc/khong-co/r2 bash "$SCRIPT" push
check "đủ ngưỡng thì ghi đúng một dòng lỗi đẩy (không lặp mỗi phút)" test "$(runs 'count(*)' "where kind='push' and status='failed'")" = 1
check "R2 khỏe lại: đẩy bù" env EXAM_R2_REMOTE="$FAKE_R2" bash "$SCRIPT" push
check "ghi dòng 'đã phục hồi' (ok) sau đợt lỗi" test "$(runs 'status' "where kind='push' order by finished_at desc limit 1")" = ok
gen_wal
backup push >/dev/null 2>&1
check "sau phục hồi, đẩy thành công bình thường không ghi thêm" test "$(runs 'count(*)' "where kind='push'")" = 2
check "chi tiết ngắn, không chứa bí mật (không có địa chỉ healthchecks hay khóa)" test "$(runs 'count(*)' "where detail ~* '(hc-ping|SECRET|PASSWORD|BEGIN PGP)'")" = 0
pg "drop table if exists backup_runs; drop type if exists backup_run_status" >/dev/null

step "9d. fetch-r2 (máy mới giả định): lấy từ R2 giả và giải mã bằng khóa giả (PR 6e, Q370 điểm 1)"
FETCH="$WORK/fetched"
# Ở bước 4 bài thử sửa rồi trả lại api.env; ngoài đời timer đẩy mỗi phút sẽ lưu bản đã trả lại. Ở đây đẩy tay để bản MỚI NHẤT trên R2 giả
# đúng bằng file hiện tại (fetch-r2 lấy bản mới nhất theo giờ ghi trên R2).
sleep 2
backup push >/dev/null 2>&1
check_fail "fetch-r2 từ chối khi keyring không có khóa BÍ MẬT (chỉ có khóa công khai)" env GNUPGHOME="$WORK/gnupg-pub" bash "$SCRIPT" fetch-r2 "$WORK/fetched-khong-khoa"
# Keyring có khóa BÍ MẬT giả ($FULL_HOME), giống lúc chủ dự án nhập tạm khóa từ Bitwarden ở máy mới. backup.env của bài thử đặt
# GNUPGHOME vào keyring chỉ-có-khóa-công-khai (mô phỏng máy chạy thật), nên tạm đổi dòng đó rồi trả lại sau phần này.
cp "$SECRETS/backup.env" "$SECRETS/backup.env.pub"
sed -i "s#^GNUPGHOME=.*#GNUPGHOME=$FULL_HOME#" "$SECRETS/backup.env"
if backup fetch-r2 "$FETCH" >"$WORK/fetch.out" 2>&1; then
  ok "fetch-r2 lấy về và giải mã"
else
  bad "fetch-r2 lấy về và giải mã"
  tail -15 "$WORK/fetch.out" | sed 's/^/     /'
  tail -5 "$FETCH/fetch-errors.log" 2>/dev/null | sed 's/^/     /'
fi
check "lấy về api.env giống hệt file thật" cmp -s "$FETCH/secrets/api.env" "$SECRETS/api.env"
check "lấy về postgres.env giống hệt file thật" cmp -s "$FETCH/secrets/postgres.env" "$SECRETS/postgres.env"
check "file bí mật lấy về quyền 600" test "$(stat -c %a "$FETCH/secrets/api.env")" = 600
check "có bản nền và sổ phụ .info đã giải mã" bash -c "ls '$FETCH'/base/exam-*-base.tar.gz '$FETCH'/base/exam-*-base.tar.gz.info >/dev/null 2>&1"
START_WAL="$(sed -n 's/^start_wal=//p' "$(ls "$FETCH"/base/exam-*-base.tar.gz.info | tail -1)")"
check "có ít nhất một đoạn WAL .gz đúng tên" bash -c "ls '$FETCH'/wal/*.gz >/dev/null 2>&1"
check "WAL lấy về liền nhau từ điểm bắt đầu của bản nền ($START_WAL)" test -z "$(EXAM_BACKUP_DIR="$FETCH" bash -c "source '$SCRIPT'; wal_gaps '$START_WAL'")"
check "dump lấy về và sổ phụ .counts đọc được" bash -c "ls '$FETCH'/daily/exam-*.dump '$FETCH'/daily/exam-*.dump.counts >/dev/null 2>&1"
check "không còn file .gpg hay .dl- tạm trong thư mục lấy về" bash -c "test -z \"\$(find '$FETCH' -name '*.gpg' -o -name '.dl-*')\""
check "pitr dựng được PostgreSQL tạm TỪ THƯ MỤC LẤY VỀ (không dùng thư mục sao lưu gốc)" env EXAM_BACKUP_DIR="$FETCH" bash "$SCRIPT" pitr latest
check "bản khôi phục từ thư mục lấy về có dữ liệu (bảng users)" test "$("$PODMAN" exec pitr-drill sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from users"')" -ge 1
env EXAM_BACKUP_DIR="$FETCH" bash "$SCRIPT" pitr-stop >/dev/null 2>&1
mv -f "$SECRETS/backup.env.pub" "$SECRETS/backup.env"
rm -rf "$FETCH" "$WORK/fetched-khong-khoa"

step "10. Timer systemd: cài, bật, chạy một dịch vụ bằng systemd, tắt"
backup install >/dev/null 2>&1
check "install tạo 6 timer (chưa bật)" test "$(ls "$HOME"/.config/systemd/user/exam-backup-drill-*.timer | wc -l)" = 6
check "enable (check đạt) bật 6 timer" bash "$SCRIPT" enable
check "6 timer đang chạy" test "$(systemctl --user list-timers 'exam-backup-drill-*' --no-legend | grep -c .)" = 6
: >"$WORK/hc.log"
check "chạy nightly bằng systemd đạt" systemctl --user start --wait exam-backup-drill-nightly.service
check "healthchecks nhận báo thành công từ systemd" grep -q 'POST /nightly ' "$WORK/hc.log"
check "disable tắt hết timer" bash -c "bash '$SCRIPT' disable >/dev/null 2>&1; test \$(systemctl --user list-timers 'exam-backup-drill-*' --no-legend | grep -c .) = 0"

printf '\nKết quả: %d đạt, %d lỗi.\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
