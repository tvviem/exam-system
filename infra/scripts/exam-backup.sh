#!/usr/bin/env bash
# Sao lưu pod exam (docs/plan/slice-6.md, PR 6c, Q351–Q361). Gọi qua Makefile: `make -C infra prod-backup-<lệnh>`.
#
#   exam-backup.sh status                  Tình trạng sao lưu: bản mới nhất, dãy WAL, hàng chờ đẩy, timer, sổ kết quả
#   exam-backup.sh dump [nightly|publish]  pg_dump một bản vào daily/, kiểm file, ghi sổ
#   exam-backup.sh nightly                 Việc hằng đêm: dump, bản tuần/tháng, kiểm WAL, đẩy, dọn bản cũ, báo healthchecks
#   exam-backup.sh basebackup [--force]    Bản nền pg_basebackup (hoãn nếu đang có Phiên thi); hằng tuần
#   exam-backup.sh push                    Đẩy file mới (WAL, dump, bản nền, ảnh, khóa) sang ổ chép và R2; chạy mỗi phút
#   exam-backup.sh release-check           Có Công bố mới thì dump ngay (loại publish); chạy mỗi 5 phút
#   exam-backup.sh restore-test [--force]  Thử khôi phục đầy đủ trong pod tạm (dump, WAL, ứng dụng, ảnh); hằng tháng
#   exam-backup.sh catchup                 Chạy bù việc quá hạn (5 phút sau khi bật máy)
#   exam-backup.sh pitr "<giờ>"|latest      Dựng PostgreSQL TẠM khôi phục đến một thời điểm, để xem và lấy lại dữ liệu
#   exam-backup.sh pitr-stop               Dọn PostgreSQL tạm của pitr
#   exam-backup.sh restore-dump <file>     THAY cơ sở dữ liệu thật bằng một bản dump (có lưới an toàn, xác nhận, tự dump trước)
#   exam-backup.sh prune [--dry-run]       Dọn bản cũ ở WSL và ổ chép theo bảng Q325 (--dry-run: chỉ in sẽ xóa gì)
#   exam-backup.sh wal-gaps [từ-WAL]       In các chỗ đứt của dãy WAL (không in gì là liền nhau)
#   exam-backup.sh check                   Kiểm mọi điều kiện cần trước khi bật (gpg, R2, ổ chép, healthchecks, archive)
#   exam-backup.sh install                 Cài script và timer (CHƯA bật)
#   exam-backup.sh enable | disable        Bật (sau khi check đạt) hoặc tắt các timer
#
# EXAM_STAGE=prod (mặc định) là hệ thống thật; EXAM_STAGE=drill là pod thử drill-exam. Mọi việc nặng chạy ở mức ưu tiên
# thấp (nice) để không làm chậm phòng thi trên cùng máy. Cấu hình theo máy nằm ở $SECRETS_DIR/backup.env (quyền 600,
# không vào repo): EXAM_BACKUP_MIRROR_DIR, địa chỉ healthchecks, thông tin R2, dấu vân tay gpg (xem docs/ops/khoi-phuc.md).
set -euo pipefail

BACKUP_SELF="$(readlink -f "${BASH_SOURCE[0]}")"
# Dùng lại cấu hình pod, hàm podman, chốt chặn của exam-ctl.sh (file đó an toàn khi `source`: không tự chạy).
# shellcheck source=exam-ctl.sh
. "$(dirname "$BACKUP_SELF")/exam-ctl.sh"

# ---------- Cấu hình ----------
if [ -f "$SECRETS_DIR/backup.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SECRETS_DIR/backup.env"
  set +a
fi

# Cấu hình rclone cho R2 bằng biến môi trường. PHẢI đặt ở đây (shell chính): đặt bên trong r2_remote() thì mất,
# vì r2_remote được gọi qua $(...) (shell con) nên biến export trong đó không tới các lệnh rclone ở shell chính.
# Lỗi này lọt qua bài thử trên pod drill (dùng thư mục giả qua EXAM_R2_REMOTE), lộ ra khi chạy với R2 thật ngày 9/11/2026.
if [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]; then
  export RCLONE_CONFIG_EXAM_R2_TYPE=s3 RCLONE_CONFIG_EXAM_R2_PROVIDER=Cloudflare RCLONE_CONFIG_EXAM_R2_REGION=auto
  export RCLONE_CONFIG_EXAM_R2_NO_CHECK_BUCKET=true RCLONE_CONFIG_EXAM_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_EXAM_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_EXAM_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
fi

# Ổ chép thứ hai (Windows D: khi chạy trong WSL). KHÔNG viết cứng: máy chủ 24/7 sau này đặt biến này sang ổ khác.
MIRROR_DIR="${EXAM_BACKUP_MIRROR_DIR:-/mnt/d/exam-$EXAM_STAGE-backups}"
RUN_LOG="$STATE_DIR/backup-runs.jsonl"
# Bản sao để hiển thị trong ứng dụng (PR 6d, Q362 đến Q366): chỉ các dòng đáng báo, đã lọc; con trỏ cho biết đã chèn vào
# bảng backup_runs tới dòng nào. FAILING_DIR: mỗi loại việc đang lỗi có một file cờ để không ghi lỗi lặp lại.
REPORT_LOG="$STATE_DIR/backup-report.jsonl"
REPORT_CURSOR="$STATE_DIR/backup-report.cursor"
FAILING_DIR="$STATE_DIR/backup-failing"
# Đẩy sang ổ chép hoặc R2 lỗi liên tục từng này giây mới ghi một dòng lỗi (Q364); đặt nhỏ khi thử.
PUSH_ALERT_SECONDS="${EXAM_PUSH_ALERT_SECONDS:-1800}"
LOCK_FILE="$STATE_DIR/backup.lock"

# Số bản giữ theo bảng Q325. WSL không cần bản tháng (Q325) nhưng giữ 2 bản để chắc chắn đã đẩy đi trước khi xóa.
KEEP_LOCAL_DAILY="${KEEP_LOCAL_DAILY:-14}" KEEP_LOCAL_WEEKLY="${KEEP_LOCAL_WEEKLY:-4}" KEEP_LOCAL_MONTHLY="${KEEP_LOCAL_MONTHLY:-2}"
KEEP_MIRROR_DAILY="${KEEP_MIRROR_DAILY:-14}" KEEP_MIRROR_WEEKLY="${KEEP_MIRROR_WEEKLY:-8}" KEEP_MIRROR_MONTHLY="${KEEP_MIRROR_MONTHLY:-12}"
# Bản "sau Công bố" (publish) nằm chung thư mục daily nhưng đếm riêng để không đẩy bản đêm ra khỏi hạn giữ.
KEEP_PUBLISH="${KEEP_PUBLISH:-14}"
# Bản nền (pg_basebackup) và WAL (Q325, Q351). WAL xóa khi quá hạn ngày VÀ cũ hơn điểm bắt đầu của bản nền MỚI NHẤT
# (luôn khôi phục về thời điểm bất kỳ từ bản nền mới nhất được), hoặc khi cũ hơn bản nền cũ nhất còn giữ (vô dụng).
KEEP_LOCAL_BASE="${KEEP_LOCAL_BASE:-2}" KEEP_MIRROR_BASE="${KEEP_MIRROR_BASE:-3}"
KEEP_LOCAL_WAL_DAYS="${KEEP_LOCAL_WAL_DAYS:-7}" KEEP_MIRROR_WAL_DAYS="${KEEP_MIRROR_WAL_DAYS:-14}"
# Bản nền quá tuổi này (ngày) thì việc hằng đêm tự làm bản mới (khi không có Phiên thi).
BASE_MAX_AGE_DAYS="${BASE_MAX_AGE_DAYS:-7}"

SUBDIRS=(daily weekly monthly base wal restore-test)

# ---------- Tiện ích ----------
now_iso() { date -Is; }

# Ghi một dòng JSON vào sổ kết quả (Q359). Sổ nằm ngoài cơ sở dữ liệu nên còn khi cơ sở dữ liệu hỏng.
# Cách dùng: run_log <việc> <ok|fail|skip> <chi tiết> [khóa=giá trị ...] (giá trị số nhận dạng bằng tiền tố n:)
run_log() {
  local kind="$1" status="$2" detail="$3" args=() pair key val r_seconds="" r_bytes=""
  shift 3
  for pair in "$@"; do
    key="${pair%%=*}" val="${pair#*=}"
    case "$val" in
      n:*) args+=(--argjson "$key" "${val#n:}") ;;
      *) args+=(--arg "$key" "$val") ;;
    esac
    case "$key" in seconds) r_seconds="${val#n:}" ;; bytes) r_bytes="${val#n:}" ;; esac
  done
  mkdir -p "$STATE_DIR"
  jq -nc --arg at "$(now_iso)" --arg kind "$kind" --arg status "$status" --arg detail "$detail" "${args[@]}" \
    '{at: $at, kind: $kind, status: $status, detail: $detail} + ($ARGS.named | del(.at, .kind, .status, .detail))' \
    >>"$RUN_LOG"
  # Báo sang bảng trong ứng dụng (lọc theo Q362). Lỗi ở đây KHÔNG bao giờ làm hỏng việc chính.
  report_consider "$kind" "$status" "$detail" "$r_seconds" "$r_bytes" || true
}

# ---------- Báo kết quả sang bảng backup_runs của ứng dụng (PR 6d, Q362 đến Q366) ----------
# Sổ gốc vẫn là $RUN_LOG (Q359). Ở đây chọn dòng nào đáng báo: việc quan trọng thành công, mọi lỗi (mỗi đợt lỗi một dòng),
# và dòng "đã phục hồi" khi đẩy lại được sau một đợt lỗi. Đẩy thành công bình thường mỗi phút KHÔNG ghi.
REPORT_KINDS=" dump-nightly dump-publish basebackup restore-test nightly secrets catchup "

# Thêm một dòng vào $REPORT_LOG rồi thử chèn ngay vào bảng. Tham số: loại, ok|failed, chi tiết, giây, byte (giây và byte có thể rỗng).
report_add() {
  local at
  at="$(date +%Y-%m-%dT%H:%M:%S.%6N%:z)" # có micro giây: hai dòng cùng loại trong một giây không trùng run_key
  mkdir -p "$STATE_DIR"
  jq -nc --arg at "$at" --arg kind "$1" --arg status "$2" --arg detail "$3" --arg seconds "${4:-}" --arg bytes "${5:-}" \
    '{run_key: ($at + "|" + $kind), kind: $kind, status: $status, finished_at: $at,
      seconds: (if $seconds == "" then null else ($seconds | tonumber? // null) end),
      bytes: (if $bytes == "" then null else ($bytes | tonumber? // null) end),
      detail: ($detail | .[0:200])}' >>"$REPORT_LOG"
  report_flush || true
}

# Lọc một dòng sổ gốc: có đáng báo không (Q362, Q364). Cờ trong $FAILING_DIR tránh ghi lỗi lặp lại cho tới khi có dòng ok.
report_consider() { # loại, ok|fail|skip, chi tiết, giây, byte
  local kind="$1" status="$2" detail="$3" seconds="${4:-}" bytes="${5:-}"
  case "$REPORT_KINDS" in *" $kind "*) ;; *) return 0 ;; esac
  mkdir -p "$FAILING_DIR" "$STATE_DIR"
  [ -f "$REPORT_LOG" ] || report_seed 1 # lần đầu: dựng từ sổ gốc TRƯỚC khi thêm dòng này (dòng này vừa vào sổ gốc)
  case "$status" in
    ok)
      rm -f "$FAILING_DIR/$kind"
      report_add "$kind" ok "$detail" "$seconds" "$bytes"
      ;;
    fail)
      [ -e "$FAILING_DIR/$kind" ] && return 0
      : >"$FAILING_DIR/$kind"
      report_add "$kind" failed "$detail" "$seconds" "$bytes"
      ;;
  esac
  return 0
}

# Đẩy sang ổ chép hoặc R2 đang lỗi (gọi mỗi phút khi lỗi): chỉ ghi một dòng lỗi khi đã lỗi liên tục >= PUSH_ALERT_SECONDS (Q364).
report_push_failing() { # chi tiết
  mkdir -p "$FAILING_DIR" "$STATE_DIR"
  [ -f "$REPORT_LOG" ] || report_seed 0
  local since="$FAILING_DIR/push.since" reported="$FAILING_DIR/push"
  [ -e "$since" ] || date +%s >"$since"
  if [ ! -e "$reported" ] && [ $(($(date +%s) - $(cat "$since"))) -ge "$PUSH_ALERT_SECONDS" ]; then
    : >"$reported"
    report_add push failed "$1" "" ""
  fi
  return 0
}

# Đẩy lại được: nếu trước đó đã ghi lỗi thì ghi dòng "đã phục hồi". Đường nhanh mỗi phút: không có cờ thì không làm gì.
report_push_ok() {
  [ -e "$FAILING_DIR/push.since" ] || return 0
  [ -f "$REPORT_LOG" ] || report_seed 0
  local was_reported=0
  [ -e "$FAILING_DIR/push" ] && was_reported=1
  rm -f "$FAILING_DIR/push" "$FAILING_DIR/push.since"
  [ "$was_reported" = 1 ] && report_add push ok "đã phục hồi, đẩy lại được" "" ""
  return 0
}

# Lần đầu (chưa có $REPORT_LOG): dựng từ sổ gốc những dòng đáng báo, để chèn bù các lần chạy trước khi có bảng (Q359, Q366).
# Tham số 1: đặt 1 khi vừa ghi dòng sổ gốc của chính việc đang báo (dòng cuối), để không đếm dòng đó hai lần.
report_seed() {
  : >"$REPORT_LOG"
  [ -s "$RUN_LOG" ] || return 0
  { if [ "${1:-0}" = 1 ]; then head -n -1 "$RUN_LOG"; else cat "$RUN_LOG"; fi; } | jq -c --arg kinds "$REPORT_KINDS" \
    'select((.status == "ok" or .status == "fail") and (. as $r | $kinds | contains(" " + $r.kind + " ")))
     | {run_key: (.at + "|" + .kind), kind: .kind, status: (if .status == "ok" then "ok" else "failed" end), finished_at: .at,
        seconds: (.seconds // null), bytes: (.bytes // null), detail: ((.detail // "") | .[0:200])}' \
    >>"$REPORT_LOG" 2>/dev/null || true
}

# Chèn các dòng chưa chèn của $REPORT_LOG vào bảng backup_runs bằng psql qua podman exec (như audit_deploy). Cơ sở dữ liệu hỏng,
# đang khôi phục, hoặc chưa có bảng thì im lặng bỏ qua và để lần sau chèn bù; chạy lại bao nhiêu lần cũng không trùng (run_key duy nhất).
report_flush() {
  [ -f "$REPORT_LOG" ] || report_seed 0
  local cursor total batch rows n
  cursor="$(cat "$REPORT_CURSOR" 2>/dev/null || echo 0)"
  total="$(wc -l <"$REPORT_LOG")"
  while [ "$total" -gt "$cursor" ]; do
    batch="$(tail -n +$((cursor + 1)) "$REPORT_LOG" | head -n 200)"
    n="$(printf '%s\n' "$batch" | wc -l)"
    rows="$(printf '%s\n' "$batch" | jq -cs .)" || return 0
    "$PODMAN" exec -i "$C_PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -1 -v ON_ERROR_STOP=1 -v rows="$1"' _ "$rows" 9>&- >/dev/null 2>&1 <<'SQL' || return 0
DO $$ BEGIN
  IF to_regclass('public.backup_runs') IS NULL THEN RAISE EXCEPTION 'chưa có bảng backup_runs'; END IF;
END $$;
INSERT INTO backup_runs (id, run_key, kind, status, finished_at, seconds, bytes, detail)
SELECT gen_random_uuid(), x.run_key, x.kind, x.status::backup_run_status, x.finished_at, x.seconds, x.bytes, x.detail
FROM jsonb_to_recordset(:'rows'::jsonb)
  AS x(run_key text, kind text, status text, finished_at timestamptz, seconds integer, bytes bigint, detail text)
ON CONFLICT (run_key) DO NOTHING;
SQL
    cursor=$((cursor + n))
    printf '%s\n' "$cursor" >"$REPORT_CURSOR"
  done
  return 0
}

# Báo healthchecks.io (Q358). Lỗi báo KHÔNG bao giờ làm hỏng việc chính: luôn trả 0.
# Cách dùng: hc_ping <TÊN> <start|ok|fail> [nội dung]; địa chỉ lấy từ biến HC_<TÊN>_URL trong backup.env.
hc_ping() {
  local var="HC_${1}_URL" suffix="" url
  url="${!var:-}"
  [ -n "$url" ] || return 0
  case "$2" in start) suffix=/start ;; fail) suffix=/fail ;; esac
  curl -fsS -m 10 --retry 2 --retry-delay 2 -o /dev/null --data-raw "${3:-}" "$url$suffix" 2>/dev/null || true
  return 0
}

# QUAN TRỌNG: khóa flock nằm ở fd 9 và mọi tiến trình con thừa hưởng nó. Container chạy lâu (podman run -d / podman start,
# conmon của chúng sống mãi) mà thừa hưởng fd 9 thì GIỮ KHÓA VĨNH VIỄN, mọi việc sao lưu sau đó bị "bỏ qua êm".
# Vì vậy mọi lệnh khởi động container trong file này đều đóng fd 9 (9>&-).
# Một việc nặng tại một thời điểm (Q353): không lấy được khóa thì bỏ qua êm, việc đang chạy sẽ lo.
take_lock() { # tên việc, [quiet: không ghi gì khi bỏ qua (việc chạy mỗi phút)]
  mkdir -p "$STATE_DIR"
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    if [ "${2:-}" != quiet ]; then
      say "Bỏ qua $1: đang có việc sao lưu khác chạy."
      run_log "$1" skip "đang có việc sao lưu khác chạy"
    fi
    exit 0
  fi
}

ensure_dirs() {
  local d
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  for d in "${SUBDIRS[@]}"; do mkdir -p "$BACKUP_DIR/$d"; done
}

pg_running() { "$PODMAN" exec "$C_PG" true 2>/dev/null; }

# Đếm số dòng mọi bảng của lược đồ public: "tên<TAB>số dòng" (để thử khôi phục so sánh, Q357).
table_counts() { # [container, mặc định PostgreSQL thật]
  "$PODMAN" exec -i "${1:-$C_PG}" sh -c 'psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -F "	"' <<'SQL'
SELECT table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY 1;
SQL
}

size_of() { if [ -n "${1:-}" ] && [ -f "$1" ]; then stat -c %s "$1"; else echo 0; fi; }
human_bytes() { numfmt --to=iec --suffix=B "$1" 2>/dev/null || echo "${1}B"; }

# ---------- dump ----------
# Tạo một bản pg_dump trong daily/ (Q361 điểm 5). Đặt DUMP_FILE khi xong. Trả khác 0 nếu hỏng (đã dọn file dở).
make_dump() { # loại
  local type="$1" dir="$BACKUP_DIR/daily" stamp tmp file started before after
  started="$(date +%s)"
  stamp="$(date +%Y%m%d-%H%M%S)"
  file="$dir/exam-$stamp-$type.dump"
  tmp="$dir/.exam-$stamp-$type.dump.tmp"
  ensure_dirs
  pg_running || {
    echo "PostgreSQL ($C_PG) không chạy, không dump được." >&2
    return 1
  }
  before="$(table_counts)" || return 1
  say "Dump ($type): $file"
  if (umask 077 && "$PODMAN" exec "$C_PG" sh -c 'nice -n 19 pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$tmp") &&
    [ -s "$tmp" ] &&
    "$PODMAN" exec -i "$C_PG" pg_restore --list <"$tmp" >/dev/null; then
    after="$(table_counts)" || {
      rm -f "$tmp"
      return 1
    }
    # Sổ phụ: số dòng mỗi bảng trước và sau khi dump. Bản khôi phục phải nằm giữa hai số này (Q357).
    join -t "$(printf '\t')" <(printf '%s\n' "$before") <(printf '%s\n' "$after") >"$file.counts"
    chmod 600 "$file.counts"
    mv -f "$tmp" "$file"
    DUMP_FILE="$file"
    DUMP_BYTES="$(stat -c %s "$file")"
    DUMP_SECONDS=$(($(date +%s) - started))
    return 0
  fi
  rm -f "$tmp"
  return 1
}

cmd_dump() {
  local type="${1:-nightly}"
  case "$type" in nightly | publish) ;; *) die "Loại dump phải là nightly hoặc publish (nhận: $type). Bản trước deploy do exam-ctl.sh deploy tạo." ;; esac
  wait_pg_up 180 || die "Pod $POD hoặc PostgreSQL chưa chạy (máy mới bật? thử lại sau vài phút)."
  take_lock "dump-$type"
  if make_dump "$type"; then
    run_log "dump-$type" ok "$(basename "$DUMP_FILE")" "file=$DUMP_FILE" "bytes=n:$DUMP_BYTES" "seconds=n:$DUMP_SECONDS"
    say "Xong: $DUMP_FILE ($(human_bytes "$DUMP_BYTES"), ${DUMP_SECONDS}s)"
  else
    run_log "dump-$type" fail "pg_dump hoặc kiểm file hỏng"
    die "Dump ($type) hỏng. Xem thông báo ở trên."
  fi
}

# ---------- Xếp bản tuần, bản tháng ----------
# Bản tuần = bản đêm của Chủ nhật, bản tháng = bản đêm mùng 1, CHÉP THÊM (không phải bản làm thêm, Q325).
rotate_copies() { # file bản đêm vừa tạo
  local file="$1" name
  name="$(basename "$file")"
  if [ "$(date +%u)" = 7 ] && [ ! -e "$BACKUP_DIR/weekly/$name" ]; then
    cp -p "$file" "$BACKUP_DIR/weekly/$name" && cp -p "$file.counts" "$BACKUP_DIR/weekly/$name.counts"
  fi
  if [ "$(date +%d)" = 01 ] && [ ! -e "$BACKUP_DIR/monthly/$name" ]; then
    cp -p "$file" "$BACKUP_DIR/monthly/$name" && cp -p "$file.counts" "$BACKUP_DIR/monthly/$name.counts"
  fi
  return 0
}

# ---------- Dọn bản cũ (Q361 điểm 7) ----------
# Giữ n bản MỚI NHẤT khớp mẫu (tên có dấu thời gian nên xếp theo tên là xếp theo thời gian). Không bao giờ xóa bản
# mới nhất: n nhỏ hơn 1 được nâng lên 1. Xóa kèm file .counts đi cùng.
prune_keep() { # thư mục, mẫu, n, dry(0|1), [gốc cây nếu cần kiểm đã đẩy đi]
  local dir="$1" pattern="$2" keep="$3" dry="$4" root="${5:-}" f
  [ "$keep" -ge 1 ] || keep=1
  [ -d "$dir" ] || return 0
  while IFS= read -r f; do
    # Ở WSL: file chưa nằm trong sổ đẩy của đích nào thì CHƯA xóa (còn là bản duy nhất), dù đã quá hạn giữ.
    if [ -n "$root" ] && ! safely_pushed "${f#"$root"/}"; then
      echo "  giữ lại $f (chưa đẩy xong sang mọi đích)"
      continue
    fi
    if [ "$dry" = 1 ]; then
      echo "  [chạy thử] sẽ xóa $f"
    else
      rm -f -- "$f" "$f.counts" "$f.info"
      say "Đã xóa bản cũ: $f"
    fi
  done < <(find "$dir" -maxdepth 1 -type f -name "$pattern" ! -name '*.counts' ! -name '*.info' -printf '%f\n' | sort -r | tail -n +"$((keep + 1))" | sed "s|^|$dir/|")
}

# File (đường dẫn tương đối) đã nằm trong sổ của ổ chép, và của R2 nếu R2 đã cấu hình?
safely_pushed() {
  local rel="$1"
  grep -qxF -- "$rel" "$LEDGER_DIR/mirror.txt" 2>/dev/null || return 1
  if r2_ready; then grep -qxF -- "$rel" "$LEDGER_DIR/r2.txt" 2>/dev/null || return 1; fi
  return 0
}

prune_tree() { # gốc, giữ daily, giữ weekly, giữ monthly, giữ base, ngày giữ WAL, dry, [kiểm đã đẩy: local]
  local root="$1" kd="$2" kw="$3" km="$4" kb="$5" wal_days="$6" dry="$7" check=""
  [ "${8:-}" = local ] && check="$root"
  prune_keep "$root/daily" 'exam-*-nightly.dump' "$kd" "$dry" "$check"
  prune_keep "$root/daily" 'exam-*-publish.dump' "$KEEP_PUBLISH" "$dry" "$check"
  prune_keep "$root/weekly" 'exam-*.dump' "$kw" "$dry" "$check"
  prune_keep "$root/monthly" 'exam-*.dump' "$km" "$dry" "$check"
  prune_keep "$root/base" 'exam-*-base.tar.gz' "$kb" "$dry" "$check"
  prune_wal "$root" "$wal_days" "$dry" "$check"
}

# Tên đoạn WAL bắt đầu của một bản nền (đọc từ sổ phụ .info; rỗng nếu không có).
base_start_wal() { # file bản nền
  sed -n 's/^start_wal=//p' "$1.info" 2>/dev/null | head -1
}

# Dọn WAL của một cây (WSL hoặc ổ chép). Không bao giờ xóa đoạn WAL mà bản nền mới nhất cần để khôi phục về mốc bất kỳ.
prune_wal() { # gốc, ngày giữ, dry, [kiểm đã đẩy: gốc]
  local root="$1" days="$2" dry="$3" check="${4:-}" delete newest_base oldest_base newest_start="" oldest_start="" f name
  [ -d "$root/wal" ] || return 0
  newest_base="$(find "$root/base" -maxdepth 1 -type f -name 'exam-*-base.tar.gz' 2>/dev/null | sort | tail -1)"
  oldest_base="$(find "$root/base" -maxdepth 1 -type f -name 'exam-*-base.tar.gz' 2>/dev/null | sort | head -1)"
  [ -z "$newest_base" ] || newest_start="$(base_start_wal "$newest_base")"
  [ -z "$oldest_base" ] || oldest_start="$(base_start_wal "$oldest_base")"
  while IFS= read -r f; do
    name="${f%.gz}"
    delete=0
    # Có bản nền nhưng chưa biết điểm bắt đầu (thiếu .info) thì không dám xóa WAL nào.
    if [ -n "$newest_base" ] && [ -z "$newest_start" ]; then continue; fi
    if [ -n "$oldest_start" ] && [[ "$name" < "$oldest_start" ]]; then delete=1; fi
    if [ "$delete" = 0 ] && [ -z "$(find "$root/wal/$f" -mtime "-$days" 2>/dev/null)" ]; then
      if [ -z "$newest_start" ] || [[ "$name" < "$newest_start" ]]; then delete=1; fi
    fi
    [ "$delete" = 1 ] || continue
    if [ -n "$check" ] && ! safely_pushed "wal/$f"; then
      echo "  giữ lại wal/$f (chưa đẩy xong sang mọi đích)"
      continue
    fi
    if [ "$dry" = 1 ]; then echo "  [chạy thử] sẽ xóa wal/$f"; else rm -f -- "$root/wal/$f" && say "Đã xóa WAL cũ: wal/$f"; fi
  done < <(find "$root/wal" -maxdepth 1 -type f -regextype posix-extended -regex '.*/[0-9A-F]{24}\.gz' -printf '%f\n' | LC_ALL=C sort)
}

cmd_prune() {
  local dry=0
  case "${1:-}" in --dry-run) dry=1 ;; "") ;; *) die "Cách dùng: prune [--dry-run]" ;; esac
  say "Dọn ở WSL ($BACKUP_DIR)"
  prune_tree "$BACKUP_DIR" "$KEEP_LOCAL_DAILY" "$KEEP_LOCAL_WEEKLY" "$KEEP_LOCAL_MONTHLY" "$KEEP_LOCAL_BASE" "$KEEP_LOCAL_WAL_DAYS" "$dry" local
  if [ -d "$MIRROR_DIR" ]; then
    say "Dọn ở ổ chép ($MIRROR_DIR)"
    prune_tree "$MIRROR_DIR" "$KEEP_MIRROR_DAILY" "$KEEP_MIRROR_WEEKLY" "$KEEP_MIRROR_MONTHLY" "$KEEP_MIRROR_BASE" "$KEEP_MIRROR_WAL_DAYS" "$dry"
  else
    say "Ổ chép $MIRROR_DIR chưa có (chưa gắn?), bỏ qua phần dọn ở đó."
  fi
}

# ---------- Bản nền pg_basebackup (Q351) ----------
# Bản nền = ảnh toàn bộ thư mục dữ liệu PostgreSQL tại một thời điểm (kèm WAL cần để tự nhất quán, -X fetch). Cộng với
# dãy WAL sau đó là khôi phục về BẤT KỲ thời điểm nào. Một file đơn: base/exam-<ngày>-<giờ>-base.tar.gz, sổ phụ .info
# ghi đoạn WAL bắt đầu (để biết WAL nào còn cần khi dọn).
make_basebackup() {
  local stamp file tmp started start_wal
  started="$(date +%s)"
  stamp="$(date +%Y%m%d-%H%M%S)"
  file="$BACKUP_DIR/base/exam-$stamp-base.tar.gz"
  tmp="$BACKUP_DIR/base/.exam-$stamp-base.tar.gz.tmp"
  ensure_dirs
  pg_running || {
    echo "PostgreSQL ($C_PG) không chạy, không làm bản nền được." >&2
    return 1
  }
  say "Bản nền: $file"
  if (umask 077 && "$PODMAN" exec "$C_PG" sh -c 'nice -n 19 pg_basebackup -U "$POSTGRES_USER" -D - -Ft -z -X fetch -c fast' >"$tmp") &&
    [ -s "$tmp" ] && tar -tzf "$tmp" >/dev/null &&
    start_wal="$(tar -xzOf "$tmp" backup_label | sed -n 's/^START WAL LOCATION: .*(file \([0-9A-F]\{24\}\)).*/\1/p' | head -1)" &&
    [ -n "$start_wal" ]; then
    printf 'start_wal=%s\nat=%s\n' "$start_wal" "$(now_iso)" >"$file.info"
    mv -f "$tmp" "$file"
    BASE_FILE="$file" BASE_BYTES="$(stat -c %s "$file")" BASE_SECONDS=$(($(date +%s) - started)) BASE_START_WAL="$start_wal"
    return 0
  fi
  rm -f "$tmp" "$file.info"
  return 1
}

# Tuổi bản nền mới nhất (ngày); in 9999 nếu chưa có.
base_age_days() {
  local f
  f="$(find "$BACKUP_DIR/base" -maxdepth 1 -type f -name 'exam-*-base.tar.gz' 2>/dev/null | sort | tail -1)"
  if [ -z "$f" ]; then echo 9999; else echo $((($(date +%s) - $(stat -c %Y "$f")) / 86400)); fi
}

cmd_basebackup() {
  wait_pg_up 180 || die "Pod $POD hoặc PostgreSQL chưa chạy (máy mới bật? thử lại sau vài phút)."
  take_lock basebackup
  # Việc nặng hơn dump: không làm khi có Phiên thi đang diễn ra (Q361); đêm sau hoặc lần chạy bù sẽ làm.
  if [ "${1:-}" != --force ]; then
    local out
    out="$(cmd_active_sessions 2>&1)" || case "$out" in
      "Phiên thi"*)
        say "Hoãn bản nền: đang có Phiên thi (dùng --force nếu thật cần)."
        run_log basebackup skip "đang có Phiên thi"
        return 0
        ;;
    esac
  fi
  if make_basebackup; then
    run_log basebackup ok "$(basename "$BASE_FILE")" "file=$BASE_FILE" "bytes=n:$BASE_BYTES" "seconds=n:$BASE_SECONDS" "start_wal=$BASE_START_WAL"
    say "Xong: $BASE_FILE ($(human_bytes "$BASE_BYTES"), ${BASE_SECONDS}s, bắt đầu từ WAL $BASE_START_WAL)"
  else
    run_log basebackup fail "pg_basebackup hoặc kiểm file hỏng"
    die "Bản nền hỏng."
  fi
}

# ---------- Ảnh minh họa và khóa bí mật (Q356) ----------
# Ảnh: chép FILE MỚI từ volume media sang $BACKUP_DIR/media (chỉ thêm, không bao giờ xóa); việc đẩy đi do push lo như WAL.
# File trong volume do người dùng bên trong container sở hữu (quyền 600, ánh xạ rootless) nên máy chủ không đọc trực tiếp được:
# đọc qua `podman unshare` (vào user namespace của Podman, ở đó chủ dự án là root). Chỉ lấy file cũ hơn 60 giây và kiểm
# kích thước sau khi chép, để không chép dở lúc ứng dụng đang ghi.
# KHÔNG sao lưu các thư mục tạm mà ứng dụng chủ động xóa sau khi xử lý (tmp/, uploads/: bảng tính danh sách thí sinh có
# thông tin cá nhân; slips/: Phiếu tài khoản mã hóa, có hạn giữ ngắn). Giữ chúng mãi ở ổ chép sẽ phá việc dọn của ứng dụng.
MEDIA_EXCLUDE="${MEDIA_EXCLUDE:-tmp uploads slips}"

sync_media() {
  local src
  "$PODMAN" volume exists "$MEDIA_VOLUME" 2>/dev/null || return 0
  src="$("$PODMAN" volume inspect "$MEDIA_VOLUME" -f '{{.Mountpoint}}')"
  mkdir -p "$BACKUP_DIR/media"
  MEDIA_SRC="$src" MEDIA_DST="$BACKUP_DIR/media" MEDIA_EXCLUDE="$MEDIA_EXCLUDE" "$PODMAN" unshare bash -c '
    cd "$MEDIA_SRC" || exit 0
    excl=()
    for e in $MEDIA_EXCLUDE; do excl+=(-not -path "./$e/*"); done
    count=0
    while IFS= read -r -d "" rel; do
      rel="${rel#./}"
      [ -e "$MEDIA_DST/$rel" ] && continue
      mkdir -p "$MEDIA_DST/$(dirname "$rel")"
      tmp="$MEDIA_DST/$(dirname "$rel")/.$(basename "$rel").tmp"
      cp --preserve=timestamps "$rel" "$tmp" || { rm -f "$tmp"; continue; }
      if [ "$(stat -c %s "$tmp")" = "$(stat -c %s "$rel")" ]; then
        chmod 600 "$tmp"; mv -f "$tmp" "$MEDIA_DST/$rel"; count=$((count + 1))
      else
        rm -f "$tmp"
      fi
    done < <(find . -type f "${excl[@]}" ! -newermt "60 seconds ago" -print0)
    echo "$count"
  '
}

# Khóa bí mật (api.env, postgres.env): mã hóa bằng khóa công khai gpg rồi lưu ở $BACKUP_DIR/khoa khi NỘI DUNG ĐỔI
# (so mã băm sha256 với sổ lần trước). Chỉ bản mã hóa nằm trong thư mục sao lưu (ổ chép là ổ Windows, ai cũng đọc được).
sync_secrets() {
  local f name hash short prev_hash out count=0 ledger="$STATE_DIR/secrets-hashes.txt"
  [ -n "${EXAM_GPG_RECIPIENT:-}" ] || {
    echo "chưa có EXAM_GPG_RECIPIENT, không sao lưu được khóa bí mật" >&2
    return 1
  }
  mkdir -p "$BACKUP_DIR/khoa"
  touch "$ledger"
  for name in api.env postgres.env; do
    f="$SECRETS_DIR/$name"
    [ -f "$f" ] || continue
    hash="$(sha256sum "$f" | cut -d' ' -f1)"
    prev_hash="$(awk -v n="$name" '$1 == n {print $2}' "$ledger" | tail -1)"
    [ "$hash" != "$prev_hash" ] || continue
    short="${hash:0:8}"
    out="$BACKUP_DIR/khoa/$name-$(date +%Y%m%d)-$short.gpg"
    gpg --batch --yes -q --trust-model always -r "$EXAM_GPG_RECIPIENT" -o "$out.tmp" -e "$f" || {
      rm -f "$out.tmp"
      return 1
    }
    mv -f "$out.tmp" "$out"
    printf '%s %s\n' "$name" "$hash" >>"$ledger"
    count=$((count + 1))
  done
  echo "$count"
}

# ---------- Đẩy sang ổ chép và R2 (Q354, Q355) ----------
# Quy tắc: mỗi phút chỉ đẩy FILE MỚI (so với sổ cục bộ), KHÔNG liệt kê R2 (liệt kê mỗi phút sẽ ăn hết hạn mức loại A của R2).
# Ổ chép nhận bản thường; R2 nhận bản mã hóa gpg bằng khóa công khai, tên file thêm .gpg. Không bao giờ xóa gì ở đích
# (R2 do quy tắc vòng đời tự xóa theo tuổi, Q352). Hai đích độc lập: một đích hỏng không chặn đích kia.
PUSH_DIRS=(wal daily weekly monthly base media khoa)
LEDGER_DIR="$STATE_DIR/push-ledger"
OUTBOX_DIR="$STATE_DIR/outbox"

# Địa chỉ R2 cho rclone. EXAM_R2_REMOTE đặt tay (ví dụ thư mục giả khi thử) thắng; không thì dựng từ thông tin trong backup.env.
r2_remote() {
  if [ -n "${EXAM_R2_REMOTE:-}" ]; then
    echo "$EXAM_R2_REMOTE"
  elif [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ] && [ -n "${R2_BUCKET:-}" ]; then
    # Chỉ in địa chỉ. Biến RCLONE_CONFIG_EXAM_R2_* đã được export ở đầu script (không export được trong $(...)).
    echo "exam_r2:$R2_BUCKET"
  fi
}

r2_ready() { [ -n "$(r2_remote)" ] && [ -n "${EXAM_GPG_RECIPIENT:-}" ]; }

# Danh sách file có thể đẩy: tương đối so với $BACKUP_DIR, đã sắp xếp, bỏ file ẩn và file tạm (đang ghi dở).
push_candidates() {
  local d
  for d in "${PUSH_DIRS[@]}"; do
    [ -d "$BACKUP_DIR/$d" ] || continue
    (cd "$BACKUP_DIR" && find "$d" -type f -not -path '*/.*' -not -name '*.tmp' -print)
  done | LC_ALL=C sort
}

# Chuẩn bị một file cho R2: mã hóa vào $OUTBOX_DIR, in tên khóa trên R2. Trả khác 0 nếu mã hóa hỏng.
r2_stage() { # rel
  mkdir -p "$OUTBOX_DIR/$(dirname "$1")"
  case "$1" in
    *.gpg)
      # Đã mã hóa sẵn (thư mục khoa/): giữ nguyên tên, không mã hóa lần hai.
      cp "$BACKUP_DIR/$1" "$OUTBOX_DIR/$1" && echo "$1"
      ;;
    *)
      # WAL và bản dump đã nén sẵn: --compress-algo none để không nén lại vô ích.
      nice -n 19 gpg --batch --yes -q --trust-model always --compress-algo none -r "$EXAM_GPG_RECIPIENT" \
        -o "$OUTBOX_DIR/$1.gpg" -e "$BACKUP_DIR/$1" >&2 && echo "$1.gpg"
      ;;
  esac
}

# Đẩy cả lô (nhanh). Trả khác 0 nếu có bất kỳ lỗi nào; người gọi thử lại từng file để cô lập file hỏng.
send_batch() { # đích, file danh sách
  local dest="$1" list="$2" rel
  if [ "$dest" = mirror ]; then
    nice -n 19 rclone copy "$BACKUP_DIR" "$MIRROR_DIR" --files-from "$list" --no-traverse --ignore-existing -q >&2
  else
    rm -rf "$OUTBOX_DIR"
    mkdir -p "$OUTBOX_DIR"
    while IFS= read -r rel; do r2_stage "$rel" || return 1; done <"$list" >"$list.up"
    nice -n 19 rclone copy "$OUTBOX_DIR" "$(r2_remote)" --files-from "$list.up" --no-traverse --ignore-existing -q >&2
    local rc=$?
    rm -rf "$OUTBOX_DIR" "$list.up"
    return $rc
  fi
}

send_one() { # đích, rel
  local dest="$1" rel="$2" one name rc
  one="$(mktemp)"
  if [ "$dest" = mirror ]; then
    echo "$rel" >"$one"
    nice -n 19 rclone copy "$BACKUP_DIR" "$MIRROR_DIR" --files-from "$one" --no-traverse --ignore-existing -q >&2
    rc=$?
  else
    rm -rf "$OUTBOX_DIR"
    mkdir -p "$OUTBOX_DIR"
    if name="$(r2_stage "$rel")"; then
      echo "$name" >"$one"
      nice -n 19 rclone copy "$OUTBOX_DIR" "$(r2_remote)" --files-from "$one" --no-traverse --ignore-existing -q >&2
      rc=$?
    else
      rc=1
    fi
    rm -rf "$OUTBOX_DIR"
  fi
  rm -f "$one"
  return $rc
}

# Đẩy các file mới sang một đích: mirror hoặc r2. In số file đã đẩy ra stdout; trả khác 0 nếu còn file lỗi.
# WAL đi trước các thứ khác (khẩn nhất); một lô lỗi thì thử từng file để một file hỏng (ví dụ ảnh không đọc được) không
# chặn WAL và mọi file còn lại.
push_dest() { # mirror|r2
  local dest="$1" ledger="$LEDGER_DIR/$1.txt" new group part rel count=0 failed=0
  mkdir -p "$LEDGER_DIR"
  [ -f "$ledger" ] || : >"$ledger"
  new="$(mktemp)"
  push_candidates | LC_ALL=C comm -23 - <(LC_ALL=C sort "$ledger") >"$new"
  grep '^wal/' "$new" >"$new.wal" || true
  grep -v '^wal/' "$new" >"$new.rest" || true
  for group in wal rest; do
    [ -s "$new.$group" ] || continue
    split -l 200 "$new.$group" "$new.$group.part."
    for part in "$new.$group".part.*; do
      if send_batch "$dest" "$part"; then
        cat "$part" >>"$ledger"
        count=$((count + $(wc -l <"$part")))
      else
        while IFS= read -r rel; do
          if send_one "$dest" "$rel"; then
            echo "$rel" >>"$ledger"
            count=$((count + 1))
          else
            echo "không đẩy được $rel sang $dest" >&2
            failed=1
          fi
        done <"$part"
      fi
    done
  done
  rm -f "$new" "$new".wal "$new".rest "$new".wal.part.* "$new".rest.part.*
  echo "$count"
  return $failed
}

# Ghi sổ lỗi đẩy nhưng không lặp mỗi phút: chỉ ghi khi nội dung lỗi đổi hoặc đã quá 1 giờ.
log_push_failure() { # nội dung
  local marker="$STATE_DIR/push-last-failure" prev="" prev_at=0
  if [ -f "$marker" ]; then
    prev="$(head -1 "$marker")"
    prev_at="$(stat -c %Y "$marker")"
  fi
  if [ "$prev" != "$1" ] || [ $(($(date +%s) - prev_at)) -gt 3600 ]; then
    run_log push fail "$1"
    printf '%s\n' "$1" >"$marker"
  fi
}

# Đẩy mọi thứ mới sang cả hai đích. Đặt PUSH_PROBLEMS (mảng). Trả khác 0 nếu có lỗi.
push_all() {
  local n_mirror=0 n_r2=0 out
  PUSH_PROBLEMS=()
  if out="$(push_dest mirror 2>>"$STATE_DIR/push-errors.log")"; then
    n_mirror="$out"
  else
    PUSH_PROBLEMS+=("đẩy sang ổ chép ($MIRROR_DIR) lỗi")
  fi
  if r2_ready; then
    if out="$(push_dest r2 2>>"$STATE_DIR/push-errors.log")"; then
      n_r2="$out"
    else
      PUSH_PROBLEMS+=("đẩy lên R2 lỗi")
    fi
  else
    PUSH_PROBLEMS+=("R2 chưa cấu hình đủ (cần backup.env: R2_*, EXAM_GPG_RECIPIENT)")
  fi
  PUSH_COUNT_MIRROR="$n_mirror" PUSH_COUNT_R2="$n_r2"
  [ ${#PUSH_PROBLEMS[@]} -eq 0 ]
}

cmd_push() {
  ensure_dirs
  take_lock push quiet
  # Gom file mới vào thư mục sao lưu rồi đẩy (lỗi ở bước gom được báo như lỗi đẩy, nhưng không chặn đẩy phần còn lại).
  local gather_problems=() n
  if n="$(sync_media 2>>"$STATE_DIR/push-errors.log")"; then
    [ "${n:-0}" = 0 ] || run_log media ok "chép thêm $n ảnh" "files=n:$n"
  else
    gather_problems+=("gom ảnh lỗi")
  fi
  if n="$(sync_secrets 2>>"$STATE_DIR/push-errors.log")"; then
    [ "${n:-0}" = 0 ] || run_log secrets ok "$n file khóa bí mật đổi, đã mã hóa và lưu" "files=n:$n"
  else
    gather_problems+=("sao lưu khóa bí mật lỗi")
  fi
  if push_all && [ ${#gather_problems[@]} -eq 0 ]; then
    if [ "$PUSH_COUNT_MIRROR" != 0 ] || [ "$PUSH_COUNT_R2" != 0 ]; then
      run_log push ok "ổ chép +$PUSH_COUNT_MIRROR, R2 +$PUSH_COUNT_R2" "mirror=n:$PUSH_COUNT_MIRROR" "r2=n:$PUSH_COUNT_R2"
      say "Đã đẩy: ổ chép +$PUSH_COUNT_MIRROR, R2 +$PUSH_COUNT_R2"
    fi
    rm -f "$STATE_DIR/push-last-failure"
    report_push_ok
  else
    PUSH_PROBLEMS+=("${gather_problems[@]}")
    log_push_failure "${PUSH_PROBLEMS[*]}"
    report_push_failing "${PUSH_PROBLEMS[*]}"
    echo "LỖI đẩy: ${PUSH_PROBLEMS[*]} (chi tiết: $STATE_DIR/push-errors.log)" >&2
    return 1
  fi
}

# Đối chiếu ban đêm (có liệt kê): file trong sổ nhưng thật ra không còn ở đích (xóa nhầm, đích hỏng) thì bỏ khỏi sổ để
# lần đẩy kế tiếp đẩy lại. Chỉ xét file mới hơn 72 giờ (file cũ hơn có thể đã bị quy tắc vòng đời của R2 xóa đúng luật).
reconcile_dest() { # mirror|r2 ; in số file thiếu
  local dest="$1" ledger="$LEDGER_DIR/$1.txt" remote_list recent missing
  [ -f "$ledger" ] || {
    echo 0
    return 0
  }
  remote_list="$(mktemp)" recent="$(mktemp)" missing="$(mktemp)"
  if [ "$dest" = mirror ]; then
    [ -d "$MIRROR_DIR" ] || {
      rm -f "$remote_list" "$recent" "$missing"
      return 1
    }
    (cd "$MIRROR_DIR" && find . -type f -printf '%P\n') | LC_ALL=C sort >"$remote_list"
  else
    rclone lsf -R --files-only "$(r2_remote)" 2>/dev/null | sed -E '/^khoa\//! s/\.gpg$//' | LC_ALL=C sort >"$remote_list" || {
      rm -f "$remote_list" "$recent" "$missing"
      return 1
    }
  fi
  (cd "$BACKUP_DIR" && find "${PUSH_DIRS[@]}" -type f -not -path '*/.*' -mmin -4320 -print 2>/dev/null) | LC_ALL=C sort >"$recent"
  # Chỉ tính file đã ghi trong sổ (đã tưởng là đẩy xong) mà đích không có; file mới chưa đẩy lần nào không phải "thiếu".
  LC_ALL=C comm -23 "$recent" "$remote_list" | LC_ALL=C comm -12 - <(LC_ALL=C sort "$ledger") >"$missing"
  if [ -s "$missing" ]; then
    LC_ALL=C grep -vxFf "$missing" "$ledger" >"$ledger.new" || true
    mv -f "$ledger.new" "$ledger"
  fi
  wc -l <"$missing"
  rm -f "$remote_list" "$recent" "$missing"
}

# Thu gọn sổ: bỏ dòng của file không còn ở WSL (đã dọn theo hạn giữ).
compact_ledgers() {
  local dest cand
  cand="$(mktemp)"
  push_candidates >"$cand"
  for dest in mirror r2; do
    [ -f "$LEDGER_DIR/$dest.txt" ] || continue
    LC_ALL=C sort "$LEDGER_DIR/$dest.txt" | LC_ALL=C comm -12 - "$cand" >"$LEDGER_DIR/$dest.txt.new"
    mv -f "$LEDGER_DIR/$dest.txt.new" "$LEDGER_DIR/$dest.txt"
  done
  rm -f "$cand"
}

# ---------- Dãy WAL và sức khỏe archive (Q351, Q355) ----------
# In các chỗ đứt của dãy WAL trong $BACKUP_DIR/wal, mỗi chỗ một dòng "thiếu <từ> đến <đến>". Chỉ xét file WAL thật
# (24 chữ số hex + .gz), cùng một timeline; file .history và .backup bỏ qua.
wal_gaps() { # [tên đoạn WAL nhỏ nhất cần xét, ví dụ điểm bắt đầu của bản nền]
  local dir="$BACKUP_DIR/wal" f name tl seg prev_tl="" prev_seg=0 min="${1:-}"
  [ -d "$dir" ] || return 0
  while IFS= read -r f; do
    name="${f%.gz}"
    if [ -n "$min" ] && [[ "$name" < "$min" ]]; then continue; fi
    tl="${name:0:8}"
    seg=$((16#${name:8:8} * 256 + 16#${name:16:8}))
    if [ "$tl" = "$prev_tl" ] && [ "$seg" -ne $((prev_seg + 1)) ]; then
      printf 'thiếu %s đến %s\n' "$(printf '%s%08X%08X' "$tl" $(((prev_seg + 1) / 256)) $(((prev_seg + 1) % 256)))" \
        "$(printf '%s%08X%08X' "$tl" $(((seg - 1) / 256)) $(((seg - 1) % 256)))"
    fi
    prev_tl="$tl" prev_seg="$seg"
  done < <(cd "$dir" && find . -maxdepth 1 -type f -regextype posix-extended -regex '\./[0-9A-F]{24}\.gz' -printf '%f\n' | LC_ALL=C sort)
}

# Kiểm PostgreSQL có đang chép WAL êm không. In lý do nếu có vấn đề (không in gì nếu ổn), trả 1 khi có vấn đề.
# Nguy hiểm thật sự: chép WAL hỏng thì pg_wal đầy dần và đầy đĩa làm PostgreSQL ngừng (Q351).
archive_health() {
  local row failing failed ready
  archiving_enabled || {
    echo "lưu liên tục chưa bật (exam-ctl.sh enable-archiving)"
    return 1
  }
  pg_running || {
    echo "PostgreSQL không chạy, không kiểm được archive"
    return 1
  }
  row="$(psql_scalar "SELECT coalesce(last_failed_time > last_archived_time, last_failed_time IS NOT NULL), failed_count,
    (SELECT count(*) FROM pg_ls_dir('pg_wal/archive_status') f WHERE f LIKE '%.ready') FROM pg_stat_archiver")" || {
    echo "không hỏi được pg_stat_archiver"
    return 1
  }
  IFS='|' read -r failing failed ready <<<"$row"
  if [ "$failing" = t ]; then
    echo "archive_command đang lỗi (lần lỗi gần nhất mới hơn lần chép thành công cuối; tổng $failed lần lỗi)"
    return 1
  fi
  if [ "$ready" -gt 5 ]; then
    echo "có $ready đoạn WAL đang chờ chép (pg_wal có thể đầy đĩa)"
    return 1
  fi
  return 0
}

# ---------- Sau mỗi lần Công bố (Q360) ----------
# Timer chạy mỗi 5 phút, hỏi audit_logs có dòng `session.released` mới (ghi cùng giao dịch với việc Công bố, nên không
# thể Công bố mà thiếu dòng này) thì chạy một bản dump loại `publish`. Nhiều lần Công bố dồn lại chỉ cần một bản.
# Không sửa ứng dụng. Mốc đã xử lý nhớ trong $STATE_DIR/release-last; lần đầu chỉ ghi mốc, không dump ngược quá khứ.
cmd_release_check() {
  local file="$STATE_DIR/release-last" last latest
  pod_exists 2>/dev/null && pg_running || return 0 # máy mới mở, pod chưa lên: lần sau
  report_flush || true # chèn bù các dòng chưa vào bảng backup_runs (cơ sở dữ liệu vừa lên, hoặc bảng vừa có)
  take_lock release quiet
  if [ ! -s "$file" ]; then
    mkdir -p "$STATE_DIR"
    psql_scalar "SELECT coalesce(max(at), now()) FROM audit_logs WHERE action = 'session.released'" >"$file"
    run_log release ok "khởi tạo mốc Công bố: $(cat "$file")"
    return 0
  fi
  last="$(cat "$file")"
  case "$last" in *[!0-9:.+\ -]*) die "Mốc trong $file hỏng: $last (xóa file để khởi tạo lại)." ;; esac
  latest="$(psql_scalar "SELECT max(at) FROM audit_logs WHERE action = 'session.released' AND at > '$last'::timestamptz")" || {
    run_log release fail "không hỏi được audit_logs"
    return 1
  }
  [ -n "$latest" ] || return 0
  say "Có Công bố mới (lúc $latest): sao lưu ngay."
  if make_dump publish; then
    printf '%s\n' "$latest" >"$file"
    run_log dump-publish ok "$(basename "$DUMP_FILE") sau Công bố lúc $latest" "file=$DUMP_FILE" "bytes=n:$DUMP_BYTES" "seconds=n:$DUMP_SECONDS"
    say "Xong: $DUMP_FILE"
  else
    run_log dump-publish fail "dump sau Công bố hỏng (sẽ thử lại sau 5 phút)"
    return 1
  fi
}

# ---------- Thử khôi phục hằng tháng (Q357) ----------
# Dựng pod tạm riêng (KHÔNG đụng pod thật) và thử đúng điều sẽ làm khi máy hỏng thật:
#   A. khôi phục bản dump mới nhất vào PostgreSQL tạm, so số dòng từng bảng với sổ phụ .counts lúc dump;
#   B. khôi phục "đến đoạn WAL cuối" từ bản nền + dãy WAL (chứng minh khôi phục về thời điểm gần nhất): trước đó ghi một dòng
#      dấu vào audit_logs của hệ thống thật rồi ép chuyển đoạn WAL, bản khôi phục phải chứa dòng dấu đó;
#   C. chạy ứng dụng (đúng ảnh đang chạy) trên cơ sở dữ liệu vừa khôi phục: migration không lỗi, /api/health ok;
#   D. lấy mẫu vài ảnh trong bản sao lưu, so mã băm với volume thật.
# Ghi thời gian từng bước (RTO) vào $STATE_DIR/restore-test.json. Pod tạm luôn được dọn, kể cả khi lỗi.
RT_POD="rt-$EXAM_STAGE"
RT_PG="$RT_POD-pg"
RT_PITR="$RT_POD-pitr"
RT_VOL_A="rt_${EXAM_STAGE}_a"
RT_VOL_B="rt_${EXAM_STAGE}_b"
RT_PHASES='{}'
RT_FAILED=()
# PostgreSQL khôi phục phải có các tham số ảnh hưởng WAL KHÔNG NHỎ HƠN máy gốc, nếu không từ chối khởi động
# ("recovery aborted because of insufficient parameter settings"). Máy gốc đặt max_connections=200 (run_postgres).
RT_PG_CONF=(-c max_connections=200)

rt_cleanup() {
  "$PODMAN" pod rm -f "$RT_POD" >/dev/null 2>&1 || true
  "$PODMAN" rm -f "$RT_PITR" >/dev/null 2>&1 || true
  "$PODMAN" volume rm -f "$RT_VOL_A" "$RT_VOL_B" >/dev/null 2>&1 || true
}

# Ghi kết quả một bước: tên, ok|fail, giây, chi tiết.
rt_phase() {
  RT_PHASES="$(jq -c --arg n "$1" --arg s "$2" --argjson sec "$3" --arg d "$4" '. + {($n): {status: $s, seconds: $sec, detail: $d}}' <<<"$RT_PHASES")"
  if [ "$2" = ok ]; then say "  [$1] đạt (${3}s): $4"; else
    say "  [$1] LỖI (${3}s): $4"
    RT_FAILED+=("$1")
  fi
}

# Đợi PostgreSQL trong container nhận kết nối TCP (máy chủ tạm lúc initdb chỉ nghe socket nên không bị nhầm).
rt_wait_pg() { # container, [đợi hết khôi phục: 1]
  local c="$1" i
  for i in $(seq 1 180); do
    if "$PODMAN" exec "$c" pg_isready -q -h 127.0.0.1 -U exam 2>/dev/null; then
      if [ "${2:-0}" != 1 ] || [ "$("$PODMAN" exec "$c" sh -c 'psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select pg_is_in_recovery()"' 2>/dev/null)" = f ]; then return 0; fi
    fi
    sleep 1
  done
  "$PODMAN" logs --tail 20 "$c" >&2 || true
  return 1
}

rt_psql() { # container, sql
  "$PODMAN" exec "$1" sh -c 'psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"' _ "$2"
}

# So số dòng mỗi bảng đã khôi phục với sổ phụ (tên<TAB>trước<TAB>sau): phải nằm trong khoảng [min, max] của hai số đó.
compare_counts() { # sổ phụ, file số dòng đã khôi phục
  awk -F'\t' '
    NR == FNR { lo[$1] = ($2 + 0 < $3 + 0) ? $2 + 0 : $3 + 0; hi[$1] = ($2 + 0 > $3 + 0) ? $2 + 0 : $3 + 0; next }
    { seen[$1] = 1
      if (!($1 in lo)) { print "bảng thừa: " $1; bad = 1 }
      else if ($2 + 0 < lo[$1] || $2 + 0 > hi[$1]) { printf "bảng %s: khôi phục %s dòng, lúc dump là %s đến %s\n", $1, $2, lo[$1], hi[$1]; bad = 1 } }
    END { for (t in lo) if (!(t in seen)) { print "thiếu bảng: " t; bad = 1 } exit bad }' "$1" "$2"
}

rt_phase_dump() {
  local t0 dump counts restored
  t0="$(date +%s)"
  dump="$(newest "$BACKUP_DIR/daily" 'exam-*-nightly.dump')"
  [ -n "$dump" ] || { rt_phase dump fail 0 "chưa có bản dump đêm nào"; return 1; }
  counts="$dump.counts"
  [ -f "$counts" ] || { rt_phase dump fail 0 "thiếu sổ phụ $counts"; return 1; }
  "$PODMAN" volume create "$RT_VOL_A" >/dev/null
  "$PODMAN" run -d --name "$RT_PG" --pod "$RT_POD" --memory 1g --env-file "$SECRETS_DIR/postgres.env" \
    -v "$RT_VOL_A":/var/lib/postgresql/data "$POSTGRES_IMAGE" postgres "${RT_PG_CONF[@]}" >/dev/null 9>&-
  rt_wait_pg "$RT_PG" || { rt_phase dump fail $(($(date +%s) - t0)) "PostgreSQL tạm không lên"; return 1; }
  if ! "$PODMAN" exec -i "$RT_PG" sh -c 'pg_restore -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner' <"$dump" >/dev/null 2>"$STATE_DIR/restore-test.err"; then
    rt_phase dump fail $(($(date +%s) - t0)) "pg_restore lỗi: $(head -c 300 "$STATE_DIR/restore-test.err")"
    return 1
  fi
  restored="$(mktemp)"
  table_counts "$RT_PG" >"$restored"
  if out="$(compare_counts "$counts" "$restored")"; then
    rt_phase dump ok $(($(date +%s) - t0)) "$(basename "$dump"): $(wc -l <"$restored") bảng, số dòng khớp lúc dump"
    rm -f "$restored"
  else
    rt_phase dump fail $(($(date +%s) - t0)) "số dòng không khớp: $(echo "$out" | head -3 | tr '\n' ';')"
    rm -f "$restored"
    return 1
  fi
}

rt_phase_pitr() {
  local t0 base start_wal gaps marker seg i
  t0="$(date +%s)"
  archiving_enabled || { rt_phase pitr fail 0 "lưu liên tục chưa bật (exam-ctl.sh enable-archiving)"; return 1; }
  base="$(newest "$BACKUP_DIR/base" 'exam-*-base.tar.gz')"
  [ -n "$base" ] || { rt_phase pitr fail 0 "chưa có bản nền nào"; return 1; }
  start_wal="$(base_start_wal "$base")"
  [ -n "$start_wal" ] || { rt_phase pitr fail 0 "thiếu sổ phụ .info của bản nền"; return 1; }
  gaps="$(wal_gaps "$start_wal")"
  [ -z "$gaps" ] || { rt_phase pitr fail 0 "dãy WAL từ bản nền bị đứt: $(echo "$gaps" | tr '\n' ';')"; return 1; }
  # Dấu hiệu: một dòng audit_logs rồi ép chuyển đoạn WAL và đợi nó được chép; bản khôi phục phải có dòng này.
  marker="$(cat /proc/sys/kernel/random/uuid)"
  seg="$(psql_scalar "SELECT pg_walfile_name(pg_current_wal_insert_lsn())")"
  "$PODMAN" exec -i "$C_PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1 -v marker="$1"' _ "$marker" <<'SQL'
INSERT INTO audit_logs (actor_id, action, entity_type, after, at)
VALUES (NULL, 'ops.backup_test', 'system', jsonb_build_object('marker', :'marker'), now());
SQL
  psql_scalar "SELECT pg_switch_wal()" >/dev/null
  for i in $(seq 1 90); do [ -e "$BACKUP_DIR/wal/$seg.gz" ] && break; sleep 1; done
  [ -e "$BACKUP_DIR/wal/$seg.gz" ] || { rt_phase pitr fail $(($(date +%s) - t0)) "đoạn WAL $seg không được chép sau 90 giây"; return 1; }
  "$PODMAN" volume create "$RT_VOL_B" >/dev/null
  # Giải nén bản nền vào volume bằng người dùng postgres của container (file bản nền quyền 600 của chủ dự án nên đưa qua stdin).
  if ! "$PODMAN" run -i --rm --user postgres -v "$RT_VOL_B":/data "$POSTGRES_IMAGE" sh -c '
      tar -xzf - -C /data && chmod 700 /data && touch /data/recovery.signal &&
      printf "%s\n" "restore_command = '"'"'gzip -dc /wal-archive/%f.gz > %p'"'"'" >> /data/postgresql.auto.conf' <"$base"; then
    rt_phase pitr fail $(($(date +%s) - t0)) "giải nén bản nền lỗi"
    return 1
  fi
  "$PODMAN" run -d --name "$RT_PITR" --memory 1g --env-file "$SECRETS_DIR/postgres.env" \
    -v "$RT_VOL_B":/var/lib/postgresql/data -v "$BACKUP_DIR/wal":/wal-archive:ro "$POSTGRES_IMAGE" postgres "${RT_PG_CONF[@]}" >/dev/null 9>&-
  rt_wait_pg "$RT_PITR" 1 || { rt_phase pitr fail $(($(date +%s) - t0)) "PostgreSQL khôi phục không xong sau 180 giây"; return 1; }
  if [ "$(rt_psql "$RT_PITR" "SELECT count(*) FROM audit_logs WHERE action = 'ops.backup_test' AND after->>'marker' = '$marker'")" = 1 ]; then
    rt_phase pitr ok $(($(date +%s) - t0)) "bản nền $(basename "$base") + WAL đến $seg: có dòng dấu mới nhất"
  else
    rt_phase pitr fail $(($(date +%s) - t0)) "bản khôi phục KHÔNG có dòng dấu mới nhất (WAL cuối chưa vào)"
    return 1
  fi
}

# Chạy ứng dụng thật trên cơ sở dữ liệu vừa khôi phục ở bước A (cùng pod tạm: 127.0.0.1:5432 và :6379 giống pod thật).
rt_phase_api() {
  local t0 image version health i
  t0="$(date +%s)"
  # Chỉ có nghĩa khi bước dump đạt: nếu không, migration sẽ dựng cơ sở dữ liệu trống và ứng dụng "khỏe" một cách giả tạo.
  case " ${RT_FAILED[*]:-} " in *" dump "*) rt_phase api fail 0 "bỏ qua vì bước dump lỗi (không có cơ sở dữ liệu khôi phục)"; return 1 ;; esac
  "$PODMAN" container exists "$RT_PG" || { rt_phase api fail 0 "chưa có cơ sở dữ liệu khôi phục"; return 1; }
  image="$(current_api_image 2>/dev/null)" || { rt_phase api fail 0 "không biết ảnh api đang chạy (pod thật chưa có api?)"; return 1; }
  version="$(cat "$STATE_DIR/tag" 2>/dev/null || echo restore-test)"
  "$PODMAN" run -d --name "$RT_POD-redis" --pod "$RT_POD" --memory 128m "$REDIS_IMAGE" redis-server >/dev/null 9>&-
  if ! "$PODMAN" run --rm --pod "$RT_POD" --env-file "$SECRETS_DIR/api.env" "$image" node dist/db/migrate.js >"$STATE_DIR/restore-test.err" 2>&1; then
    rt_phase api fail $(($(date +%s) - t0)) "migration lỗi trên bản khôi phục: $(tail -c 300 "$STATE_DIR/restore-test.err")"
    return 1
  fi
  "$PODMAN" run -d --name "$RT_POD-api" --pod "$RT_POD" --memory 768m --env-file "$SECRETS_DIR/api.env" \
    -e "APP_VERSION=$version" -e PORT=3000 "$image" >/dev/null 9>&-
  for i in $(seq 1 60); do api_ready_inside "$RT_POD-api" && break; sleep 1; done
  health="$("$PODMAN" exec "$RT_POD-api" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(t=>console.log(t))" 2>/dev/null || true)"
  if health_matches "$health" "$version"; then
    rt_phase api ok $(($(date +%s) - t0)) "api $version chạy trên bản khôi phục, /api/health ok"
  else
    rt_phase api fail $(($(date +%s) - t0)) "/api/health không ok: ${health:0:200}"
    return 1
  fi
}

# Lấy mẫu tối đa 5 ảnh trong bản sao lưu, so mã băm với file cùng đường dẫn trong volume thật (bỏ qua file đã bị xóa ở nguồn).
rt_phase_media() {
  local t0 src checked bad
  t0="$(date +%s)"
  "$PODMAN" volume exists "$MEDIA_VOLUME" 2>/dev/null || { rt_phase media ok 0 "không có volume ảnh"; return 0; }
  src="$("$PODMAN" volume inspect "$MEDIA_VOLUME" -f '{{.Mountpoint}}')"
  if [ -z "$(find "$BACKUP_DIR/media" -type f 2>/dev/null | head -1)" ]; then
    rt_phase media ok 0 "chưa có ảnh nào cần sao lưu"
    return 0
  fi
  checked=0 bad=0
  while IFS= read -r rel; do
    rel="${rel#"$BACKUP_DIR"/media/}"
    local live backup
    live="$(MEDIA_SRC="$src" "$PODMAN" unshare bash -c 'f="$MEDIA_SRC/$1"; [ -f "$f" ] && sha256sum "$f" | cut -d" " -f1' _ "$rel")" || continue
    backup="$(sha256sum "$BACKUP_DIR/media/$rel" | cut -d' ' -f1)"
    checked=$((checked + 1))
    [ "$live" = "$backup" ] || bad=$((bad + 1))
  done < <(find "$BACKUP_DIR/media" -type f -not -path '*/.*' | shuf -n 5)
  if [ "$bad" = 0 ]; then
    rt_phase media ok $(($(date +%s) - t0)) "so mẫu $checked ảnh với volume thật: khớp"
  else
    rt_phase media fail $(($(date +%s) - t0)) "$bad/$checked ảnh mẫu KHÁC volume thật"
    return 1
  fi
}

cmd_restore_test() {
  wait_pg_up 180 || die "Pod $POD hoặc PostgreSQL chưa chạy (máy mới bật? thử lại sau vài phút)."
  take_lock restore-test
  # Không làm khi có Phiên thi (tốn CPU, đĩa): hoãn, lần chạy bù sau sẽ làm (Q357). --force bỏ qua.
  if [ "${1:-}" != --force ]; then
    local out
    out="$(cmd_active_sessions 2>&1)" || case "$out" in
      "Phiên thi"*)
        say "Hoãn thử khôi phục: đang có Phiên thi."
        run_log restore-test skip "đang có Phiên thi"
        return 0
        ;;
    esac
  fi
  # Đĩa: cần ít nhất 3 lần (dump + bản nền) và 1 GB trống ở nơi Podman lưu volume.
  local need avail dump base started=0 phase_status
  dump="$(newest "$BACKUP_DIR/daily" 'exam-*-nightly.dump')"
  base="$(newest "$BACKUP_DIR/base" 'exam-*-base.tar.gz')"
  need=$((($(size_of "$dump") + $(size_of "$base")) * 3 + 1073741824))
  avail="$(df --output=avail -B1 "$(dirname "$(readlink -f "$BACKUP_DIR")")" | tail -1)"
  if [ "$avail" -lt "$need" ]; then
    run_log restore-test fail "không đủ chỗ trống ($(human_bytes "$avail") < $(human_bytes "$need"))"
    hc_ping RESTORE fail "không đủ chỗ trống để thử khôi phục"
    die "Không đủ chỗ trống để thử khôi phục."
  fi
  hc_ping RESTORE start
  started="$(date +%s)"
  trap rt_cleanup EXIT
  rt_cleanup
  "$PODMAN" pod create --name "$RT_POD" >/dev/null
  say "Thử khôi phục trong pod tạm $RT_POD (không đụng pod thật $POD)"
  rt_phase_dump || true
  rt_phase_pitr || true
  rt_phase_api || true
  rt_phase_media || true
  local total=$(($(date +%s) - started)) ok=true
  [ ${#RT_FAILED[@]} -eq 0 ] || ok=false
  jq -n --arg at "$(now_iso)" --argjson ok "$ok" --argjson total "$total" --argjson phases "$RT_PHASES" \
    --arg dump "$(basename "${dump:-}")" --arg base "$(basename "${base:-}")" \
    '{at: $at, ok: $ok, total_seconds: $total, dump: $dump, base: $base, phases: $phases}' >"$STATE_DIR/restore-test.json"
  if [ "$ok" = true ]; then
    run_log restore-test ok "đạt cả 4 bước trong ${total}s" "seconds=n:$total"
    hc_ping RESTORE ok "đạt trong ${total}s: $(jq -c '.phases | map_values(.seconds)' "$STATE_DIR/restore-test.json")"
    say "Thử khôi phục ĐẠT (${total}s). Chi tiết: $STATE_DIR/restore-test.json"
  else
    run_log restore-test fail "bước lỗi: ${RT_FAILED[*]}" "seconds=n:$total"
    hc_ping RESTORE fail "bước lỗi: ${RT_FAILED[*]}"
    phase_status="${RT_FAILED[*]}"
    die "Thử khôi phục có bước lỗi: $phase_status (xem $STATE_DIR/restore-test.json)"
  fi
}

# ---------- Khôi phục thật (Q351, docs/ops/khoi-phuc.md) ----------
PITR_NAME="pitr-$EXAM_STAGE"
PITR_VOL="pitr_${EXAM_STAGE}_data"
PITR_PORT="${PITR_PORT:-5439}"

# pitr <"YYYY-MM-DD HH:MM:SS" giờ máy | latest>: dựng một PostgreSQL TẠM, khôi phục bản nền + WAL đến thời điểm đó, để
# xem và lấy lại dữ liệu (pg_dump rồi restore-dump, hoặc chép riêng một bảng). KHÔNG đụng pod thật. Dừng bằng pitr-stop.
cmd_pitr() {
  local target="${1:-}" target_utc="" base="" f at start_wal gaps t_epoch f_epoch
  [ -n "$target" ] || die "Cách dùng: pitr \"2026-11-20 10:04:00\" (giờ của máy) hoặc pitr latest"
  if [ "$target" != latest ]; then
    # Giờ người dùng gõ là giờ của máy. Đổi sang giây rồi mới sang UTC (date -u -d "..." sẽ hiểu chuỗi đã là UTC: sai 7 giờ).
    t_epoch="$(date -d "$target" +%s 2>/dev/null)" || die "Không hiểu thời điểm \"$target\" (dạng 2026-11-20 10:04:00)."
    target_utc="$(date -u -d "@$t_epoch" '+%Y-%m-%d %H:%M:%S+00')"
    # Bản nền mới nhất làm XONG trước thời điểm đích.
    while IFS= read -r f; do
      at="$(sed -n 's/^at=//p' "$f.info" 2>/dev/null | head -1)"
      [ -n "$at" ] || continue
      f_epoch="$(date -d "$at" +%s)"
      if [ "$f_epoch" -le "$t_epoch" ]; then base="$f"; fi
    done < <(find "$BACKUP_DIR/base" -maxdepth 1 -type f -name 'exam-*-base.tar.gz' | sort)
    [ -n "$base" ] || die "Không có bản nền nào làm xong trước $target. Muốn về mốc cũ hơn thì lấy bản nền từ ổ chép hoặc R2 (docs/ops/khoi-phuc.md)."
  else
    base="$(newest "$BACKUP_DIR/base" 'exam-*-base.tar.gz')"
    [ -n "$base" ] || die "Chưa có bản nền nào."
  fi
  start_wal="$(base_start_wal "$base")"
  [ -n "$start_wal" ] || die "Bản nền $(basename "$base") thiếu sổ phụ .info."
  gaps="$(wal_gaps "$start_wal")"
  [ -z "$gaps" ] || die "Dãy WAL từ bản nền bị đứt ($(echo "$gaps" | tr '\n' ';')): chỉ khôi phục được đến chỗ đứt."
  take_lock pitr
  "$PODMAN" rm -f "$PITR_NAME" >/dev/null 2>&1 || true
  "$PODMAN" volume rm -f "$PITR_VOL" >/dev/null 2>&1 || true
  "$PODMAN" volume create "$PITR_VOL" >/dev/null
  say "Khôi phục từ bản nền $(basename "$base") (WAL từ $start_wal) đến ${target_utc:-đoạn WAL cuối}"
  "$PODMAN" run -i --rm --user postgres -v "$PITR_VOL":/data "$POSTGRES_IMAGE" sh -c '
    tar -xzf - -C /data && chmod 700 /data && touch /data/recovery.signal &&
    printf "%s\n" "restore_command = '"'"'gzip -dc /wal-archive/%f.gz > %p'"'"'" >> /data/postgresql.auto.conf &&
    if [ -n "$0" ]; then printf "%s\n" "recovery_target_time = '"'"'$0'"'"'" "recovery_target_action = '"'"'promote'"'"'" >> /data/postgresql.auto.conf; fi' "$target_utc" <"$base" ||
    die "Giải nén bản nền lỗi."
  "$PODMAN" run -d --name "$PITR_NAME" --memory 1g -p "127.0.0.1:$PITR_PORT:5432" --env-file "$SECRETS_DIR/postgres.env" \
    -v "$PITR_VOL":/var/lib/postgresql/data -v "$BACKUP_DIR/wal":/wal-archive:ro "$POSTGRES_IMAGE" postgres "${RT_PG_CONF[@]}" >/dev/null 9>&-
  if ! rt_wait_pg "$PITR_NAME" 1; then
    "$PODMAN" logs --tail 15 "$PITR_NAME" >&2 || true
    die "PostgreSQL tạm không khôi phục xong (nếu log nói 'recovery ended before configured recovery target': thời điểm đó nằm sau đoạn WAL cuối đã chép)."
  fi
  say "Xong. PostgreSQL tạm đang chạy ở 127.0.0.1:$PITR_PORT (container $PITR_NAME), dữ liệu ở thời điểm ${target_utc:-cuối WAL}."
  echo "  Xem:         podman exec -it $PITR_NAME sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"'"
  echo "  Lấy dump:    podman exec $PITR_NAME sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc' > ~/khoi-phuc-pitr.dump"
  echo "  Rồi đưa vào hệ thống thật (cẩn thận): exam-backup.sh restore-dump ~/khoi-phuc-pitr.dump"
  echo "  Xong việc:   exam-backup.sh pitr-stop"
  ops_log "pitr ${target_utc:-latest}"
}

cmd_pitr_stop() {
  "$PODMAN" rm -f "$PITR_NAME" >/dev/null 2>&1 || true
  "$PODMAN" volume rm -f "$PITR_VOL" >/dev/null 2>&1 || true
  say "Đã dọn PostgreSQL tạm $PITR_NAME và volume của nó."
}

# restore-dump <file .dump> [--yes]: THAY cơ sở dữ liệu của hệ thống thật bằng nội dung một bản dump. Có lưới an toàn:
# từ chối khi có Phiên thi (FORCE_REASON để ép), tự dump bản "trước khi khôi phục", dừng api và worker, dựng lại cơ sở
# dữ liệu, nạp, bật lại, kiểm /api/health; nạp hỏng thì tự nạp lại bản "trước khi khôi phục".
cmd_restore_dump() {
  local file="${1:-}" yes="${2:-}" answer safety
  [ -n "$file" ] && [ -f "$file" ] || die "Cách dùng: restore-dump <file .dump> [--yes] (file phải tồn tại)."
  file="$(readlink -f "$file")"
  pod_exists && container_exists "$C_PG" || die "Chưa có pod $POD hoặc PostgreSQL."
  "$PODMAN" exec -i "$C_PG" pg_restore --list <"$file" >/dev/null 2>&1 || die "$file không phải bản dump hợp lệ (pg_restore --list lỗi)."
  guard "khôi phục cơ sở dữ liệu từ bản sao lưu"
  cat >&2 <<MSG
SẮP THAY TOÀN BỘ cơ sở dữ liệu của $POD bằng nội dung:
  $file ($(human_bytes "$(stat -c %s "$file")"), sửa lúc $(date -r "$file" -Is))
Mọi thay đổi sau thời điểm của bản này sẽ MẤT (trừ khi lấy lại từ bản "trước khi khôi phục" do script tự dump ngay bây giờ).
Hệ thống sẽ ngừng phục vụ trong lúc khôi phục (api và worker dừng).
MSG
  if [ "$yes" != --yes ]; then
    [ -t 0 ] || die "Không có bàn phím để xác nhận. Thêm --yes nếu chắc chắn."
    read -r -p 'Gõ KHOI PHUC để tiếp tục: ' answer
    [ "$answer" = "KHOI PHUC" ] || die "Đã hủy, không đổi gì."
  fi
  take_lock restore-dump
  say "1/6 Dump an toàn trước khi khôi phục"
  backup_before_deploy "truoc-khoi-phuc" || die "Dump an toàn hỏng, không khôi phục."
  safety="$BACKUP_FILE"
  say "2/6 Dừng api, worker"
  for c in "$C_API2" "$C_API" "$C_WORKER"; do container_exists "$c" && "$PODMAN" stop -t 30 "$c" >/dev/null 2>&1; done
  say "3/6 Dựng lại cơ sở dữ liệu và nạp $file"
  if ! load_dump "$file"; then
    say "NẠP HỎNG. Nạp lại bản an toàn $safety"
    if load_dump "$safety"; then
      start_app
      die "Khôi phục từ $file lỗi; đã trả về trạng thái trước đó từ $safety."
    fi
    die "NẠP HỎNG VÀ NẠP LẠI BẢN AN TOÀN CŨNG HỎNG. Dừng ở đây, KHÔNG làm gì thêm. Bản an toàn: $safety. Xem docs/ops/khoi-phuc.md mục 'Khi khôi phục hỏng'."
  fi
  say "4/6 Bật lại api, worker"
  start_app
  say "5/6 Ghi nhật ký"
  audit_deploy ops.restore "$(cat "$STATE_DIR/tag" 2>/dev/null || echo ?)" "$(cat "$STATE_DIR/tag" 2>/dev/null || echo ?)" false false "khôi phục từ $(basename "$file"); bản trước đó: $(basename "$safety")" || say "(không ghi được audit_logs)"
  ops_log "restore-dump $file (an toàn: $safety)"
  say "6/6 Xong. Hệ thống chạy lại với dữ liệu của $(basename "$file"). Bản trước khi khôi phục giữ ở $safety."
}

# Xóa và dựng lại cơ sở dữ liệu rồi nạp một bản dump. Trả khác 0 nếu hỏng.
load_dump() { # file
  "$PODMAN" exec -i "$C_PG" sh -c 'psql -U "$POSTGRES_USER" -d postgres -q -v ON_ERROR_STOP=1 -v db="$POSTGRES_DB" -v u="$POSTGRES_USER"' >/dev/null <<'SQL' || return 1
DROP DATABASE IF EXISTS :"db" WITH (FORCE);
CREATE DATABASE :"db" OWNER :"u";
SQL
  "$PODMAN" exec -i "$C_PG" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner' <"$1" >/dev/null
}

start_app() {
  local c
  for c in "$C_API" "$C_API2" "$C_WORKER"; do container_exists "$c" && "$PODMAN" start "$c" >/dev/null 9>&-; done
  wait_api_ready "$C_API"
  container_exists "$C_API2" && wait_api_ready "$C_API2"
  wait_health
}

# ---------- nightly ----------
cmd_nightly() {
  wait_pg_up 180 || die "Pod $POD hoặc PostgreSQL chưa chạy (máy mới bật? thử lại sau vài phút)."
  take_lock nightly
  hc_ping NIGHTLY start
  ensure_dirs
  local problems=() msg gaps missing dest dump_ok=0
  if make_dump nightly; then
    dump_ok=1
    run_log dump-nightly ok "$(basename "$DUMP_FILE")" "file=$DUMP_FILE" "bytes=n:$DUMP_BYTES" "seconds=n:$DUMP_SECONDS"
    rotate_copies "$DUMP_FILE"
  else
    run_log dump-nightly fail "pg_dump hoặc kiểm file hỏng"
    problems+=("dump hỏng")
  fi
  # PostgreSQL chép WAL có êm không, và dãy WAL có liền nhau không (Q351, Q355).
  if ! msg="$(archive_health)"; then problems+=("$msg"); fi
  gaps="$(wal_gaps)"
  [ -z "$gaps" ] || problems+=("dãy WAL bị đứt: $(echo "$gaps" | tr '\n' ';')")
  # Đối chiếu có liệt kê (mỗi đêm một lần), rồi đẩy bù những gì thiếu cùng mọi file mới.
  for dest in mirror r2; do
    [ "$dest" = r2 ] && ! r2_ready && continue
    if missing="$(reconcile_dest "$dest")"; then
      [ "$missing" = 0 ] || run_log reconcile ok "đích $dest thiếu $missing file, sẽ đẩy lại" "dest=$dest" "missing=n:$missing"
    else
      problems+=("không đối chiếu được đích $dest")
    fi
  done
  sync_media >/dev/null || problems+=("gom ảnh lỗi")
  sync_secrets >/dev/null || problems+=("sao lưu khóa bí mật lỗi")
  push_all || problems+=("${PUSH_PROBLEMS[@]}")
  # Dọn bản cũ chỉ khi dump hôm nay thành công: dump hỏng thì đừng xóa bản nào (còn bản cũ là tài sản duy nhất).
  if [ "$dump_ok" = 1 ]; then
    cmd_prune || problems+=("dọn bản cũ lỗi")
    compact_ledgers
  fi
  if [ ${#problems[@]} -eq 0 ]; then
    run_log nightly ok "dump $(basename "$DUMP_FILE")"
    hc_ping NIGHTLY ok "dump $(basename "$DUMP_FILE") $(human_bytes "$DUMP_BYTES"); đã đẩy sang ổ chép và R2; dãy WAL liền"
    say "Sao lưu đêm xong."
  else
    run_log nightly fail "$(printf '%s; ' "${problems[@]}")"
    hc_ping NIGHTLY fail "$(printf '%s; ' "${problems[@]}")"
    die "Sao lưu đêm có lỗi: $(printf '%s; ' "${problems[@]}")"
  fi
}

# ---------- Chạy bù khi bật máy (Q353) ----------
# Laptop không bật 24/7: timer `Persistent=true` đã chạy bù việc lỡ giờ, còn đây là lớp kiểm thứ hai, chạy ~5 phút sau khi
# người dùng systemd lên (tức pod đã dựng lại): việc nào quá hạn thì làm. Mỗi việc chạy bằng một tiến trình riêng
# (có nice, khóa flock riêng của nó), nên chạy trùng với timer cũng không làm hai lần song song.
CATCHUP_NIGHTLY_HOURS="${CATCHUP_NIGHTLY_HOURS:-20}"
CATCHUP_RESTORE_DAYS="${CATCHUP_RESTORE_DAYS:-35}"

hours_since_file() { # file -> số giờ; 99999 nếu chưa có
  if [ -n "${1:-}" ] && [ -f "$1" ]; then echo $((($(date +%s) - $(stat -c %Y "$1")) / 3600)); else echo 99999; fi
}

# Đợi PostgreSQL của pod lên (máy mới bật, pod đang dựng lại). Trả 1 nếu quá hạn.
wait_pg_up() { # giây
  local i
  for i in $(seq 1 "${1:-180}"); do
    pod_exists 2>/dev/null && pg_running && return 0
    sleep 1
  done
  return 1
}

cmd_catchup() {
  wait_pg_up 240 || {
    say "Pod chưa lên sau 4 phút, chạy bù để lần sau."
    return 0
  }
  local nightly last_restore
  nightly="$(newest "$BACKUP_DIR/daily" 'exam-*-nightly.dump')"
  if [ "$(hours_since_file "$nightly")" -ge "$CATCHUP_NIGHTLY_HOURS" ]; then
    say "Bản đêm quá $CATCHUP_NIGHTLY_HOURS giờ: chạy bù sao lưu đêm."
    run_log catchup ok "chạy bù sao lưu đêm"
    "$BACKUP_SELF" nightly || true
  fi
  if archiving_enabled && [ "$(base_age_days)" -ge "$BASE_MAX_AGE_DAYS" ]; then
    say "Bản nền quá $BASE_MAX_AGE_DAYS ngày: chạy bù."
    run_log catchup ok "chạy bù bản nền"
    "$BACKUP_SELF" basebackup || true
  fi
  last_restore="$STATE_DIR/restore-test.json"
  if [ "$(hours_since_file "$last_restore")" -ge $((CATCHUP_RESTORE_DAYS * 24)) ]; then
    say "Chưa thử khôi phục quá $CATCHUP_RESTORE_DAYS ngày: chạy bù."
    run_log catchup ok "chạy bù thử khôi phục"
    "$BACKUP_SELF" restore-test || true
  fi
}

# ---------- Cài đặt timer (Q353, Q361 điểm 2, 9) ----------
# Bản chép cố định của script ở $BIN_DIR: timer không trỏ vào cây mã nguồn (có thể đang ở nhánh khác) hay thư mục tạm của
# runner. Sau khi sửa script trong repo, chạy lại `install` để cập nhật bản chép.
BIN_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/exam-$EXAM_STAGE/bin"
UNIT_DIR="$HOME/.config/systemd/user"
TIMERS=(push release nightly base restore-test catchup)
# Tên unit: exam-backup-<việc> cho pod thật; pod thử có thêm tên giai đoạn để không đè nhau.
if [ "$EXAM_STAGE" = prod ]; then UNIT_PREFIX=exam-backup; else UNIT_PREFIX="exam-backup-$EXAM_STAGE"; fi

unit_schedule() { # tên -> các dòng [Timer]
  case "$1" in
    push) printf 'OnCalendar=minutely\nAccuracySec=5s\n' ;;
    release) printf 'OnCalendar=*:0/5\nAccuracySec=5s\n' ;;
    nightly) printf 'OnCalendar=*-*-* 02:00:00\nPersistent=true\n' ;;
    base) printf 'OnCalendar=Sun *-*-* 03:00:00\nPersistent=true\n' ;;
    restore-test) printf 'OnCalendar=*-*-01 04:00:00\nPersistent=true\n' ;;
    catchup) printf 'OnStartupSec=5min\n' ;;
  esac
}

unit_timeout() { # tên -> giây tối đa của một lần chạy
  case "$1" in push | release) echo 600 ;; restore-test) echo 1800 ;; *) echo 3600 ;; esac
}

unit_command() { # tên -> lệnh con của exam-backup.sh
  case "$1" in release) echo release-check ;; *) echo "$1" ;; esac
}

cmd_install() {
  local name unit
  mkdir -p "$BIN_DIR" "$UNIT_DIR"
  for f in exam-ctl.sh exam-backup.sh pg-archive-wal.sh; do
    cat "$(dirname "$BACKUP_SELF")/$f" >"$BIN_DIR/$f.new"
    chmod 755 "$BIN_DIR/$f.new"
    mv -f "$BIN_DIR/$f.new" "$BIN_DIR/$f"
  done
  for name in "${TIMERS[@]}"; do
    unit="$UNIT_PREFIX-$name"
    cat >"$UNIT_DIR/$unit.service" <<UNIT
[Unit]
Description=exam-system: sao lưu ($name) cho pod $POD

[Service]
Type=oneshot
Environment=EXAM_STAGE=$EXAM_STAGE
ExecStart=/bin/bash $BIN_DIR/exam-backup.sh $(unit_command "$name")
TimeoutStartSec=$(unit_timeout "$name")
UNIT
    cat >"$UNIT_DIR/$unit.timer" <<UNIT
[Unit]
Description=exam-system: lịch sao lưu ($name) cho pod $POD

[Timer]
$(unit_schedule "$name")

[Install]
WantedBy=timers.target
UNIT
  done
  systemctl --user daemon-reload
  say "Đã cài script vào $BIN_DIR và ${#TIMERS[@]} timer vào $UNIT_DIR (CHƯA bật). Bật: exam-backup.sh enable."
}

# Kiểm mọi điều kiện cần trước khi bật. In từng dòng đạt/lỗi; trả khác 0 nếu có lỗi.
cmd_check() {
  local bad=0 test_file out
  ok() { printf '  ✓ %s\n' "$*"; }
  fail() { printf '  ✗ %s\n' "$*"; bad=1; }
  say "Kiểm điều kiện sao lưu cho $POD"
  pod_exists && pg_running && ok "pod $POD và PostgreSQL đang chạy" || fail "pod $POD hoặc PostgreSQL không chạy"
  [ -f "$SECRETS_DIR/backup.env" ] && ok "có $SECRETS_DIR/backup.env" || fail "thiếu $SECRETS_DIR/backup.env"
  if [ -n "${EXAM_GPG_RECIPIENT:-}" ] && gpg --list-keys "$EXAM_GPG_RECIPIENT" >/dev/null 2>&1; then
    ok "khóa công khai gpg $EXAM_GPG_RECIPIENT có trong máy"
    if gpg --list-secret-keys "$EXAM_GPG_RECIPIENT" >/dev/null 2>&1; then
      fail "KHÓA BÍ MẬT gpg đang nằm trên máy này (Q354: chỉ để ở Bitwarden và giấy). Xóa nó khỏi máy: gpg --delete-secret-keys"
    else
      ok "khóa bí mật gpg KHÔNG nằm trên máy (đúng Q354)"
    fi
    out="$(echo ping | gpg --batch --yes -q --trust-model always -r "$EXAM_GPG_RECIPIENT" -e 2>&1 >/dev/null)" && ok "mã hóa thử bằng khóa công khai được" || fail "mã hóa thử lỗi: $out"
  else
    fail "chưa có EXAM_GPG_RECIPIENT trong backup.env, hoặc khóa công khai chưa nhập vào máy (gpg --import)"
  fi
  if [ -d "$MIRROR_DIR" ] || mkdir -p "$MIRROR_DIR" 2>/dev/null; then
    test_file="$MIRROR_DIR/.exam-backup-selftest"
    (echo ok >"$test_file" && rm -f "$test_file") 2>/dev/null && ok "ổ chép $MIRROR_DIR ghi được" || fail "ổ chép $MIRROR_DIR không ghi được"
  else
    fail "ổ chép $MIRROR_DIR không tạo được (ổ chưa gắn?)"
  fi
  if r2_ready; then
    # Ghi một file nhỏ cố định (ghi đè mỗi lần) rồi đọc lại; không đụng dữ liệu sao lưu.
    test_file="$(mktemp)"
    echo "exam-backup selftest $(now_iso)" >"$test_file"
    if rclone copyto "$test_file" "$(r2_remote)/selftest/ok.txt" -q 2>/dev/null &&
      [ "$(rclone cat "$(r2_remote)/selftest/ok.txt" 2>/dev/null | head -c 11)" = "exam-backup" ]; then
      ok "R2 ghi và đọc được ($(r2_remote))"
    else
      fail "R2 không ghi/đọc được (khóa API, tên bucket, địa chỉ tài khoản?)"
    fi
    rm -f "$test_file"
  else
    fail "R2 chưa cấu hình (backup.env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)"
  fi
  [ -n "${HC_NIGHTLY_URL:-}" ] && ok "có địa chỉ healthchecks cho sao lưu đêm" || fail "thiếu HC_NIGHTLY_URL (healthchecks.io) trong backup.env"
  [ -n "${HC_RESTORE_URL:-}" ] && ok "có địa chỉ healthchecks cho thử khôi phục" || fail "thiếu HC_RESTORE_URL (healthchecks.io) trong backup.env"
  archiving_enabled && ok "lưu liên tục WAL đã bật" || fail "lưu liên tục WAL chưa bật (exam-ctl.sh enable-archiving, lúc không có Phiên thi)"
  for c in jq rclone gpg flock curl; do command -v "$c" >/dev/null && ok "có lệnh $c" || fail "thiếu lệnh $c"; done
  return $bad
}

cmd_enable() {
  cmd_check || die "Chưa đủ điều kiện để bật sao lưu (xem các dòng ✗ ở trên)."
  cmd_install
  local name
  for name in "${TIMERS[@]}"; do systemctl --user enable --now "$UNIT_PREFIX-$name.timer" >/dev/null; done
  ops_log "backup enable"
  say "Đã bật ${#TIMERS[@]} timer sao lưu. Xem: exam-backup.sh status."
}

cmd_disable() {
  local name
  for name in "${TIMERS[@]}"; do systemctl --user disable --now "$UNIT_PREFIX-$name.timer" >/dev/null 2>&1 || true; done
  ops_log "backup disable"
  say "Đã tắt các timer sao lưu (script và dữ liệu sao lưu còn nguyên)."
}

# ---------- status ----------
newest() { # thư mục, mẫu. Thư mục chưa có (máy mới, chưa dump lần nào) -> in rỗng, KHÔNG lỗi (pipefail + find báo 1 làm hỏng status/catchup lúc bật thật 9/11/2026)
  [ -d "$1" ] || return 0
  find "$1" -maxdepth 1 -type f -name "$2" ! -name '*.counts' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-
}

age_of() { # file -> "x giờ trước"
  local f="$1" secs
  [ -n "$f" ] || {
    echo "chưa có"
    return
  }
  secs=$(($(date +%s) - $(stat -c %Y "$f")))
  if [ "$secs" -lt 7200 ]; then echo "$((secs / 60)) phút trước"; else echo "$((secs / 3600)) giờ trước"; fi
}

cmd_status() {
  local f nightly base_info rt problems timers
  echo "Sao lưu của $POD (cấu hình: $([ -f "$SECRETS_DIR/backup.env" ] && echo "$SECRETS_DIR/backup.env" || echo "CHƯA có backup.env"))"
  echo "Thư mục WSL: $BACKUP_DIR   Ổ chép: $MIRROR_DIR ($([ -d "$MIRROR_DIR" ] && echo có || echo "CHƯA có"))"
  echo "R2: $(r2_ready && echo "đã cấu hình" || echo "CHƯA cấu hình")   healthchecks: đêm $([ -n "${HC_NIGHTLY_URL:-}" ] && echo có || echo CHƯA), thử khôi phục $([ -n "${HC_RESTORE_URL:-}" ] && echo có || echo CHƯA)"
  nightly="$(newest "$BACKUP_DIR/daily" 'exam-*-nightly.dump')"
  echo "Bản đêm mới nhất:     ${nightly:-chưa có} ($(age_of "$nightly"))"
  f="$(newest "$BACKUP_DIR/daily" 'exam-*-publish.dump')"
  echo "Bản sau Công bố:      ${f:-chưa có} ($(age_of "$f"))"
  f="$(newest "$BACKUP_DIR" 'truoc-deploy-*.dump')"
  echo "Bản trước deploy:     ${f:-chưa có} ($(age_of "$f"))"
  f="$(newest "$BACKUP_DIR/base" 'exam-*-base.tar.gz')"
  base_info=""
  [ -z "$f" ] || base_info=", bắt đầu từ WAL $(base_start_wal "$f")"
  echo "Bản nền mới nhất:     ${f:-chưa có} ($(age_of "$f")$base_info)"
  if archiving_enabled; then
    echo "Lưu liên tục WAL:     BẬT; WAL mới nhất: $(find "$BACKUP_DIR/wal" -maxdepth 1 -name '*.gz' ! -name '*.backup.gz' -printf '%f\n' 2>/dev/null | sort | tail -1) ($(find "$BACKUP_DIR/wal" -maxdepth 1 -name '*.gz' | wc -l) file)"
    if pg_running; then
      problems="$(archive_health || true)"
      echo "Sức khỏe archive:     ${problems:-ổn}"
    fi
    problems="$(wal_gaps)"
    echo "Dãy WAL:              ${problems:-liền nhau}"
  else
    echo "Lưu liên tục WAL:     TẮT (exam-ctl.sh enable-archiving)"
  fi
  echo "Chờ đẩy (WSL → ổ chép / R2): $(push_candidates | LC_ALL=C comm -23 - <(LC_ALL=C sort "$LEDGER_DIR/mirror.txt" 2>/dev/null) | wc -l) / $(push_candidates | LC_ALL=C comm -23 - <(LC_ALL=C sort "$LEDGER_DIR/r2.txt" 2>/dev/null) | wc -l) file"
  if [ -f "$STATE_DIR/restore-test.json" ]; then
    rt="$(jq -r '"\(.at) \(if .ok then "ĐẠT" else "LỖI" end) trong \(.total_seconds)s"' "$STATE_DIR/restore-test.json")"
    echo "Thử khôi phục cuối:   $rt"
  else
    echo "Thử khôi phục cuối:   chưa lần nào"
  fi
  echo "Dung lượng:           $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)"
  timers="$(systemctl --user list-timers "$UNIT_PREFIX-*" --no-legend 2>/dev/null | grep -c . || true)"
  echo "Timer đang bật:       $timers/${#TIMERS[@]} (trạng thái timer đêm: $(systemctl --user is-enabled "$UNIT_PREFIX-nightly.timer" 2>/dev/null || true))"
  echo "Thư mục ảnh ở volume (mục nào KHÔNG sao lưu: $MEDIA_EXCLUDE):"
  "$PODMAN" volume exists "$MEDIA_VOLUME" 2>/dev/null && MEDIA_SRC="$("$PODMAN" volume inspect "$MEDIA_VOLUME" -f '{{.Mountpoint}}')" "$PODMAN" unshare bash -c 'cd "$MEDIA_SRC" && ls -1 2>/dev/null | sed "s/^/  /"' || true
  echo "Sổ kết quả gần đây ($RUN_LOG):"
  if [ -f "$RUN_LOG" ]; then
    tail -n 8 "$RUN_LOG" | jq -r '"  \(.at) \(.kind) \(.status) \(.detail)"'
  else
    echo "  (chưa có)"
  fi
}

# ---------- Điều phối ----------
# Việc nặng chạy ở mức ưu tiên thấp (Q361): chạy lại chính script dưới nice và ionice.
main() {
  local command="${1:-}"
  [ $# -gt 0 ] && shift
  case "$command" in
    dump | nightly | basebackup | release-check | restore-test)
      if [ -z "${EXAM_BACKUP_NICED:-}" ]; then
        # Thử khôi phục có giới hạn 25 phút (Q357): quá thì bị dừng và pod tạm được dọn.
        if [ "$command" = restore-test ]; then
          EXAM_BACKUP_NICED=1 exec nice -n 19 ionice -c 3 timeout -k 30 1500 "$BACKUP_SELF" "$command" "$@"
        fi
        EXAM_BACKUP_NICED=1 exec nice -n 19 ionice -c 3 "$BACKUP_SELF" "$command" "$@"
      fi
      ;;
  esac
  case "$command" in
    dump) cmd_dump "$@" ;;
    nightly) cmd_nightly "$@" ;;
    prune) cmd_prune "$@" ;;
    push) cmd_push "$@" ;;
    basebackup) cmd_basebackup "$@" ;;
    release-check) cmd_release_check ;;
    restore-test) cmd_restore_test "$@" ;;
    catchup) cmd_catchup ;;
    pitr) cmd_pitr "$@" ;;
    pitr-stop) cmd_pitr_stop ;;
    restore-dump) cmd_restore_dump "$@" ;;
    install) cmd_install ;;
    check) cmd_check ;;
    enable) cmd_enable ;;
    disable) cmd_disable ;;
    wal-gaps) wal_gaps "$@" ;;
    status) cmd_status "$@" ;;
    *)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//' >&2
      exit 2
      ;;
  esac
}

# Chạy khi gọi trực tiếp; `source` file này (để thử từng hàm) thì không chạy gì.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
