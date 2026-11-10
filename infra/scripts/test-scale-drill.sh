#!/usr/bin/env bash
# Thử hai bản api (prod-scale 2) trên pod thử `drill-exam`, tải nhẹ (PR 6e, docs/plan/slice-6.md Q368 phương án A, Q370 điểm 4).
# KHÔNG đụng pod thật.
#
#   make -C infra scale-drill-test
#
# Kiểm: bật bản api thứ hai thì (1) cả hai bản trả /api/health ok; (2) nginx chia yêu cầu cho CẢ HAI bản (đếm nhật ký từng bản
# sau 60 yêu cầu); (3) kênh Redis tin đẩy `realtime:events` có đủ 2 bên nghe (tin đẩy Cộng giờ, Buộc nộp... đi qua cả hai bản);
# (4) tắt bản thứ hai thì mọi thứ về như cũ. Tin đẩy đến tận trình duyệt qua hai bản KHÔNG kiểm ở đây: kiểm bằng mắt khi chạy
# bài đo 500 người với hai api (docs/hieu-nang.md). Cần pod drill đã dựng (xem docs/ops/trien-khai.md mục 7).
set -uo pipefail
cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
[ "${EXAM_STAGE:-drill}" = drill ] || {
  echo "Chỉ chạy trên pod drill (EXAM_STAGE=drill)." >&2
  exit 2
}
export EXAM_STAGE=drill
CTL="$PWD/exam-ctl.sh"
PODMAN="${PODMAN:-podman}"
PORT=8190
REQUESTS="${SCALE_TEST_REQUESTS:-60}"
PASS=0 FAIL=0

ok() { PASS=$((PASS + 1)); printf '  ✓ %s\n' "$*"; }
bad() { FAIL=$((FAIL + 1)); printf '  ✗ %s\n' "$*"; }
check() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }
step() { printf '\n== %s\n' "$*"; }
ctl() { bash "$CTL" "$@"; }
inside_ok() { "$PODMAN" exec "$1" node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; }
subscribers() { "$PODMAN" exec drill-exam-redis redis-cli pubsub numsub realtime:events | tail -1; }
health_lines() { "$PODMAN" logs "$1" 2>&1 | grep -c '"url":"/api/health"'; }

"$PODMAN" pod exists drill-exam || {
  echo "Chưa có pod drill-exam (xem docs/ops/trien-khai.md mục 7)." >&2
  exit 2
}
# Dù thử hỏng giữa chừng, trả pod về một bản api.
trap 'ctl scale 1 >/dev/null 2>&1 || true' EXIT

step "Chuẩn bị: pod drill chỉ có một bản api"
ctl scale 1 >/dev/null 2>&1
check "chỉ có container api (không có api-2)" bash -c "! $PODMAN container exists drill-exam-api-2"
check "api trả ok" inside_ok drill-exam-api
SUB1="$(subscribers)"
check "kênh Redis realtime:events có đúng 1 bên nghe khi một bản api ($SUB1)" test "$SUB1" = 1

step "Bật bản api thứ hai (scale 2)"
check "scale 2 chạy xong" ctl scale 2
check "container api-2 đang chạy" bash -c "$PODMAN container exists drill-exam-api-2 && [ \"\$($PODMAN inspect -f '{{.State.Running}}' drill-exam-api-2)\" = true ]"
check "api số 1 trả ok" inside_ok drill-exam-api
check "api số 2 trả ok" inside_ok drill-exam-api-2
check "nginx trỏ tới cả hai bản" bash -c "grep -c 'server 127.0.0.1:300' '${XDG_STATE_HOME:-$HOME/.local/state}/exam-drill/upstream.conf' | grep -q '^2\$'"
SUB2="$(subscribers)"
check "kênh Redis realtime:events có đúng 2 bên nghe khi hai bản api ($SUB2): tin đẩy đi qua cả hai" test "$SUB2" = 2

step "Chia tải: $REQUESTS yêu cầu qua nginx (mỗi yêu cầu một kết nối mới; nginx có nhiều tiến trình, mỗi tiến trình tự xoay vòng nên chia gần đều chứ không chính xác từng cái)"
A1="$(health_lines drill-exam-api)"
A2="$(health_lines drill-exam-api-2)"
GOOD=0
for _ in $(seq 1 "$REQUESTS"); do
  curl -fsS -m 5 -o /dev/null -H 'Connection: close' "http://127.0.0.1:$PORT/api/health" && GOOD=$((GOOD + 1))
done
check "$GOOD/$REQUESTS yêu cầu qua nginx đều trả ok" test "$GOOD" = "$REQUESTS"
D1=$(($(health_lines drill-exam-api) - A1))
D2=$(($(health_lines drill-exam-api-2) - A2))
printf '     api số 1 nhận %d, api số 2 nhận %d (nhật ký)\n' "$D1" "$D2"
check "api số 1 nhận ít nhất 10 yêu cầu" test "$D1" -ge 10
check "api số 2 nhận ít nhất 10 yêu cầu" test "$D2" -ge 10
check "tổng hai bản nhận đủ số yêu cầu đã gửi" test $((D1 + D2)) -ge "$REQUESTS"

step "Tắt bản api thứ hai (scale 1)"
check "scale 1 chạy xong" ctl scale 1
check "container api-2 đã bị gỡ" bash -c "! $PODMAN container exists drill-exam-api-2"
check "api số 1 vẫn trả ok" inside_ok drill-exam-api
check "qua nginx vẫn trả ok" curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$PORT/api/health"
SUB3="$(subscribers)"
check "kênh Redis realtime:events về đúng 1 bên nghe ($SUB3)" test "$SUB3" = 1

printf '\nKết quả: %d đạt, %d lỗi.\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
