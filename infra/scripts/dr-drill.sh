#!/usr/bin/env bash
# Diễn tập "khôi phục sang máy khác" (PR 6e, docs/plan/slice-6.md Q367 phương án A, Q370 điểm 2).
#
#   make -C infra dr-drill
#
# Giả vờ laptop đã mất: dựng lại hệ thống trong một "sân chơi" HOÀN TOÀN tách khỏi máy thật. Chỉ dùng thứ cất ngoài máy:
#   ~/dr-input/backup.env        bản sao backup.env lấy từ Bitwarden (chứa thông tin R2)
#   ~/dr-input/khoa-bi-mat.asc   khóa gpg BÍ MẬT lấy từ Bitwarden (mật khẩu của khóa: dán lúc được hỏi)
# Mọi thứ khác (keyring gpg, thư mục trạng thái, bí mật của ứng dụng, bản sao lưu) nằm trong thư mục tạm; script KHÔNG đọc
# bất cứ file nào của `prod` (~/exam-prod-*, ~/.local/state/exam-prod). Pod thử tên `dr-exam` (cổng 8195, PostgreSQL 5438).
# Các bước: nhập khóa vào keyring tạm → fetch-r2 (tải và giải mã) → dựng pod dr-exam bằng bí mật lấy về → pitr kiểm →
# restore-dump → kiểm sức khỏe và số dòng → dọn sạch (pod, volume, khóa bí mật tạm). In từng bước đạt/lỗi và thời gian dựng lại.
#
# Biến tùy chọn: TAG (mã commit ảnh; mặc định là commit mới nhất của main trên GitHub), EXAM_DR_INPUT (thư mục đầu vào),
# KEEP=1 (giữ pod và thư mục tạm để xem, tự dọn tay sau).
set -uo pipefail
cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
SCRIPTS="$PWD"
CTL="$SCRIPTS/exam-ctl.sh"
BACKUP_SH="$SCRIPTS/exam-backup.sh"
PODMAN="${PODMAN:-podman}"
INPUT="${EXAM_DR_INPUT:-$HOME/dr-input}"
PASS=0 FAIL=0
START_ALL="$(date +%s)"

ok() { PASS=$((PASS + 1)); printf '  ✓ %s\n' "$*"; }
bad() { FAIL=$((FAIL + 1)); printf '  ✗ %s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; STEP_START="$(date +%s)"; }
took() { printf '     (%s giây)\n' "$(($(date +%s) - STEP_START))"; }
need() { # mô tả, lệnh... : lệnh phải đạt
  local desc="$1"
  shift
  if "$@"; then ok "$desc"; else bad "$desc"; return 1; fi
}

# ---------- Điều kiện ----------
[ -f "$INPUT/backup.env" ] && [ -f "$INPUT/khoa-bi-mat.asc" ] || {
  cat >&2 <<MSG
Thiếu đầu vào. Đặt hai file này vào $INPUT (thư mục quyền 700):
  backup.env         bản sao backup.env từ Bitwarden (mục "exam-backup backup.env (prod)")
  khoa-bi-mat.asc    khóa gpg bí mật từ Bitwarden (mục "exam-backup gpg KHOA BI MAT")
Xong bài diễn tập thì xóa cả thư mục: shred -u $INPUT/* && rmdir $INPUT
MSG
  exit 2
}
[ -t 0 ] || {
  echo "Cần chạy trong cửa sổ Ubuntu thật (có bàn phím) để dán mật khẩu khóa gpg." >&2
  exit 2
}
"$PODMAN" pod exists dr-exam 2>/dev/null && {
  echo "Pod dr-exam đã có (bài trước chưa dọn?). Dọn: podman pod rm -f dr-exam; podman volume rm -f dr_exam_pgdata dr_exam_media" >&2
  exit 2
}
for port in 8195 5438; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "Cổng $port đang bị chiếm; không dựng được pod dr-exam." >&2
    exit 2
  fi
done
TAG="${TAG:-$(git ls-remote https://github.com/tvviem/exam-system refs/heads/main 2>/dev/null | cut -f1)}"
[ -n "$TAG" ] || {
  echo "Không biết TAG ảnh. Đặt TAG=<mã commit đã deploy> (mã 40 ký tự của commit trên main)." >&2
  exit 2
}

# ---------- Sân chơi tách biệt ----------
WORK="$(mktemp -d)"
export EXAM_STAGE=dr
export XDG_STATE_HOME="$WORK/state"
export EXAM_BACKUP_DIR="$WORK/backups"
export EXAM_DR_SECRETS_DIR="$WORK/secrets"
export GNUPGHOME="$WORK/gnupg"
export GPG_TTY
GPG_TTY="$(tty)"
mkdir -m 700 "$GNUPGHOME" "$XDG_STATE_HOME" "$EXAM_DR_SECRETS_DIR" "$EXAM_BACKUP_DIR"
install -m 600 "$INPUT/backup.env" "$EXAM_DR_SECRETS_DIR/backup.env"

cleanup() {
  if [ "${KEEP:-}" = 1 ]; then
    echo "KEEP=1: giữ pod dr-exam và $WORK. Dọn tay sau: podman pod rm -f dr-exam; podman volume rm -f dr_exam_pgdata dr_exam_media; rm -rf $WORK"
    return
  fi
  echo
  echo "== Dọn sạch"
  bash "$BACKUP_SH" pitr-stop >/dev/null 2>&1 || true
  "$PODMAN" pod rm -f dr-exam >/dev/null 2>&1 || true
  "$PODMAN" volume rm -f dr_exam_pgdata dr_exam_media >/dev/null 2>&1 || true
  gpgconf --kill gpg-agent 2>/dev/null || true
  # File bí mật xóa an toàn rồi mới xóa thư mục.
  find "$WORK" -type f \( -path '*/secrets/*' -o -path '*/gnupg/*' \) -exec shred -u {} + 2>/dev/null || true
  rm -rf "$WORK" 2>/dev/null || true
  if [ -d "$WORK" ]; then bad "thư mục tạm $WORK chưa xóa hết"; else ok "đã xóa thư mục tạm và khóa bí mật tạm"; fi
  if "$PODMAN" pod exists dr-exam 2>/dev/null; then bad "pod dr-exam còn sót"; else ok "đã xóa pod dr-exam và volume tạm"; fi
}
trap cleanup EXIT

echo "Diễn tập khôi phục sang máy khác. Ảnh: $TAG"
echo "Sân chơi: $WORK (không dùng gì của prod)"

# ---------- 1. Nhập khóa bí mật ----------
step "1. Nhập khóa gpg bí mật vào keyring tạm (dán mật khẩu của khóa khi được hỏi)"
gpg --import "$INPUT/khoa-bi-mat.asc" >"$WORK/gpg-import.log" 2>&1
GPG_RC=$?
sed 's/^/     /' "$WORK/gpg-import.log"
need "nhập khóa bí mật từ $INPUT/khoa-bi-mat.asc" test "$GPG_RC" = 0
FPR="$(sed -n 's/^EXAM_GPG_RECIPIENT=//p' "$EXAM_DR_SECRETS_DIR/backup.env" | head -1)"
need "keyring tạm có khóa bí mật $FPR" bash -c "gpg --list-secret-keys '$FPR' >/dev/null 2>&1" || exit 1
took

# ---------- 2. Lấy từ R2 ----------
step "2. Tải và giải mã từ R2 (fetch-r2)"
need "fetch-r2 lấy về khóa bí mật, bản nền, WAL liền nhau, dump" bash "$BACKUP_SH" fetch-r2 "$EXAM_BACKUP_DIR" || exit 1
took
need "có api.env và postgres.env đã giải mã" test -s "$EXAM_BACKUP_DIR/secrets/api.env" -a -s "$EXAM_BACKUP_DIR/secrets/postgres.env"
need "có bản nền, ít nhất một đoạn WAL và một bản dump" bash -c "ls '$EXAM_BACKUP_DIR'/base/exam-*-base.tar.gz '$EXAM_BACKUP_DIR'/daily/exam-*.dump >/dev/null 2>&1 && ls '$EXAM_BACKUP_DIR'/wal/*.gz >/dev/null 2>&1"
# Bí mật đã giải mã đặt vào thư mục bí mật của pod (giữ backup.env đang có).
install -m 600 "$EXAM_BACKUP_DIR/secrets/api.env" "$EXAM_DR_SECRETS_DIR/api.env"
install -m 600 "$EXAM_BACKUP_DIR/secrets/postgres.env" "$EXAM_DR_SECRETS_DIR/postgres.env"
DUMP_FILE="$(ls "$EXAM_BACKUP_DIR"/daily/exam-*.dump | sort | tail -1)"

# ---------- 3. Dựng pod ----------
step "3. Dựng pod dr-exam bằng bí mật lấy về (không sinh khóa mới)"
ADMIN_PW="$(openssl rand -hex 12)"
need "bootstrap pod dr-exam (Quản trị viên tạm sẽ bị thay ở bước khôi phục)" \
  env TAG="$TAG" EXAM_ADMIN_FULL_NAME="Quan tri tam DR" EXAM_ADMIN_PASSWORD="$ADMIN_PW" bash "$CTL" bootstrap >"$WORK/bootstrap.log" 2>&1 ||
  { tail -15 "$WORK/bootstrap.log" | sed 's/^/     /'; exit 1; }
unset ADMIN_PW
took
need "api trong pod mới trả ok" bash -c "curl -fsS http://127.0.0.1:8195/api/health | grep -q '\"status\":\"ok\"'"

# ---------- 4. PITR kiểm ----------
step "4. Kiểm bản nền + WAL bằng pitr (PostgreSQL tạm, đến đoạn WAL cuối)"
need "pitr latest dựng PostgreSQL tạm từ bản nền và WAL lấy về" bash "$BACKUP_SH" pitr latest >"$WORK/pitr.log" 2>&1 ||
  { tail -15 "$WORK/pitr.log" | sed 's/^/     /'; exit 1; }
"$PODMAN" exec pitr-dr sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$WORK/pitr.dump" 2>/dev/null
need "lấy được dump từ PostgreSQL tạm (khôi phục theo thời điểm)" test -s "$WORK/pitr.dump"
PITR_ADMINS="$("$PODMAN" exec pitr-dr sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from users where is_admin"' 2>/dev/null || echo 0)"
need "bản khôi phục theo thời điểm có Quản trị viên ($PITR_ADMINS)" test "${PITR_ADMINS:-0}" -ge 1
bash "$BACKUP_SH" pitr-stop >/dev/null 2>&1
took

# ---------- 5. Khôi phục vào pod mới ----------
step "5. Thay cơ sở dữ liệu của dr-exam bằng dữ liệu đã khôi phục (restore-dump)"
need "restore-dump bản khôi phục theo thời điểm" bash "$BACKUP_SH" restore-dump "$WORK/pitr.dump" --yes >"$WORK/restore.log" 2>&1 ||
  { tail -20 "$WORK/restore.log" | sed 's/^/     /'; exit 1; }
took
need "api trả ok sau khôi phục" bash -c "curl -fsS http://127.0.0.1:8195/api/health | grep -q '\"status\":\"ok\"'"

# ---------- 6. Đối chiếu ----------
step "6. Đối chiếu dữ liệu khôi phục với sổ phụ của bản dump"
q() { "$PODMAN" exec dr-exam-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' _ "$1" 2>/dev/null; }
ADMINS="$(q "select count(*) from users where is_admin and removed_at is null")"
need "có ít nhất 1 Quản trị viên hoạt động trong dữ liệu khôi phục ($ADMINS)" test "${ADMINS:-0}" -ge 1
need "Quản trị viên tạm của bootstrap không còn (dữ liệu đã được thay hoàn toàn)" test "$(q "select count(*) from users where full_name = 'Quan tri tam DR'")" = 0
COUNTS="$DUMP_FILE.counts"
if [ -s "$COUNTS" ]; then
  # Các bảng chỉ tăng (không xóa): số dòng sau khôi phục không được ít hơn số dòng nhỏ nhất ghi trong sổ phụ.
  for t in audit_logs users exams questions attempts responses; do
    min="$(awk -F '\t' -v t="$t" '$1 == t {print ($2 < $3 ? $2 : $3)}' "$COUNTS")"
    [ -n "$min" ] || continue
    now="$(q "select count(*) from $t")"
    need "bảng $t: $now dòng sau khôi phục (không ít hơn $min trong sổ phụ của dump)" test "${now:-0}" -ge "$min"
  done
else
  echo "     (không có sổ phụ .counts, bỏ qua đối chiếu số dòng)"
fi
need "worker và web của pod mới chạy" bash -c "$PODMAN ps --format '{{.Names}}' | grep -q '^dr-exam-worker\$' && $PODMAN ps --format '{{.Names}}' | grep -q '^dr-exam-web\$'"
took

TOTAL=$(($(date +%s) - START_ALL))
printf '\nKết quả: %d đạt, %d lỗi. Tổng thời gian dựng lại (không tính lúc bạn nhập mật khẩu và đọc): %s giây.\n' "$PASS" "$FAIL" "$TOTAL"
[ "$FAIL" = 0 ]
