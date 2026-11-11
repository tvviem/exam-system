#!/usr/bin/env bash
# Thử phần vận hành của việc gửi thư (PR 7b, docs/plan/slice-7b-thiet-ke-kiem-thu.md lát 12: E-01, E-02). KHÔNG cần pod,
# không đụng bí mật thật: `source` các script rồi gọi từng hàm với thư mục bí mật tạm.
#
#   make -C infra mail-ops-test
set -uo pipefail
cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0 FAIL=0
ok() { PASS=$((PASS + 1)); printf '  ✓ %s\n' "$*"; }
bad() { FAIL=$((FAIL + 1)); printf '  ✗ %s\n' "$*"; }
check() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }
check_fail() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$d"; else ok "$d"; fi; }
step() { printf '\n== %s\n' "$*"; }

SMTP_LINES=$'SMTP_HOST=smtp.example.org\nSMTP_USERNAME=gui@example.org\nSMTP_PASSWORD=mat-khau\nEMAIL_FROM=gui@example.org'

# Chạy `body` trong một shell con đã source script ở stage `stage`, với api.env chứa `content`.
in_stage() { # stage, nội dung api.env, mã bash
  local stage="$1" content="$2" body="$3" dir
  dir="$(mktemp -d -p "$WORK")"
  printf '%s\n' "$content" >"$dir/api.env"
  EXAM_STAGE="$stage" bash -c "source '$PWD/exam-backup.sh'; SECRETS_DIR='$dir'; $body"
}

step "E-01. Pod thử không bao giờ được cấu hình gửi thư thật (drill, dr)"
for stage in drill dr; do
  check_fail "stage $stage có SMTP_HOST trong api.env thì chốt chặn từ chối" in_stage "$stage" "$SMTP_LINES" 'guard_mail_stage'
  check "stage $stage không có SMTP thì chốt chặn cho qua" in_stage "$stage" 'NODE_ENV=production' 'guard_mail_stage'
done
check "stage prod có SMTP thì chốt chặn cho qua" in_stage prod "$SMTP_LINES" 'guard_mail_stage'
check "dòng SMTP_HOST bị comment (#) không bị tính là cấu hình" in_stage drill '# SMTP_HOST=smtp.example.org' 'guard_mail_stage'
check "tên khác chỉ chứa SMTP_HOST (không phải biến thật) không bị tính" in_stage drill 'OLD_SMTP_HOST=x' 'guard_mail_stage'
MSG="$(in_stage drill "$SMTP_LINES" 'guard_mail_stage' 2>&1)"
check "thông báo từ chối nói rõ lý do và nêu cách sửa" bash -c "printf '%s' '$MSG' | grep -q 'SMTP' && printf '%s' '$MSG' | grep -q 'api.env'"

step "E-02. prod-preflight có mục Thư (chỉ stage prod)"
# `preflight_mail` in từng dòng dạng `<ok|warn|fail|info>|<nội dung>`; `psql_scalar` được thay bằng kết quả dựng sẵn.
mail_lines() { # stage, api.env, số pending, tuổi pending cũ nhất (giờ), số lỗi gần đây, số thư bị bỏ qua (mặc định 0)
  in_stage "$1" "$2" "psql_scalar() { case \"\$1\" in *'count(*) FILTER'*) echo '$3|$4|$5|${6:-0}' ;; *) echo '' ;; esac; }; preflight_mail"
}
check "prod thiếu SMTP_* mà chưa thư nào bị bỏ qua thì chỉ ⚠ (chưa dùng tính năng email nên chưa chặn Phiên thi)" bash -c "$(declare -f in_stage mail_lines); WORK='$WORK'; PWD='$PWD'; out=\"\$(mail_lines prod 'NODE_ENV=production' 0 0 0 0)\"; printf '%s' \"\$out\" | grep -q '^warn|.*gửi thư' && ! printf '%s' \"\$out\" | grep -q '^fail|'"
check "prod thiếu SMTP_* mà đã có thư bị bỏ qua thì ✗ (người dùng đang không nhận được thư)" bash -c "$(declare -f in_stage mail_lines); WORK='$WORK'; PWD='$PWD'; mail_lines prod 'NODE_ENV=production' 0 0 0 4 | grep -q '^fail|.*gửi thư.*4'"
check "prod có SMTP, hàng đợi trống thì ✓, không có ✗" bash -c "$(declare -f in_stage mail_lines); WORK='$WORK'; PWD='$PWD'; out=\"\$(mail_lines prod \"$SMTP_LINES\" 0 0 0)\"; printf '%s' \"\$out\" | grep -q '^ok|' && ! printf '%s' \"\$out\" | grep -q '^fail|'"
check "thư chờ gửi cũ hơn 48 giờ thì ✗ (người dùng không kích hoạt được)" bash -c "$(declare -f in_stage mail_lines); WORK='$WORK'; PWD='$PWD'; mail_lines prod \"$SMTP_LINES\" 12 50 0 | grep -q '^fail|.*48'"
check "thư chờ gửi chưa quá 48 giờ thì chỉ ⚠ (hạn mức 24 giờ còn đang xả hàng đợi)" bash -c "$(declare -f in_stage mail_lines); WORK='$WORK'; PWD='$PWD'; out=\"\$(mail_lines prod \"$SMTP_LINES\" 12 5 0)\"; printf '%s' \"\$out\" | grep -q '^warn|' && ! printf '%s' \"\$out\" | grep -q '^fail|'"
check "có thư lỗi hoặc bị từ chối gần đây thì ⚠" bash -c "$(declare -f in_stage mail_lines); WORK='$WORK'; PWD='$PWD'; mail_lines prod \"$SMTP_LINES\" 0 0 3 | grep -q '^warn|.*3'"
check "stage drill chỉ ghi chú, không ✗ dù không có SMTP" bash -c "$(declare -f in_stage mail_lines); WORK='$WORK'; PWD='$PWD'; out=\"\$(mail_lines drill 'NODE_ENV=production' 0 0 0)\"; printf '%s' \"\$out\" | grep -q '^info|' && ! printf '%s' \"\$out\" | grep -q '^fail|'"

printf '\nKết quả: %d đạt, %d lỗi.\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
