#!/usr/bin/env bash
# Kiểm cách nginx.conf đặt X-Forwarded-For (Q224, Q235): chạy nginx thật trước một máy chủ giả in lại header.
# Cần podman và mạng để kéo image nginx. Chạy: bash infra/containers/test-nginx-xff.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'kill "$echo_pid" 2>/dev/null || true; podman rm -f nginx-xff-test >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

sed 's/listen 80;/listen 8099;/' "$here/nginx.conf" >"$work/default.conf"
cat >"$work/echo.cjs" <<'JS'
require('http').createServer((q, r) => r.end(q.headers['x-forwarded-for'] || '')).listen(3000, '127.0.0.1');
JS
node "$work/echo.cjs" &
echo_pid=$!
podman run -d --name nginx-xff-test --network host \
  -v "$work/default.conf:/etc/nginx/conf.d/default.conf:ro" docker.io/library/nginx:1.29-alpine >/dev/null
sleep 3

fail=0
check() { # mô tả, mong đợi, các đối số curl
  local name="$1" want="$2"; shift 2
  local got; got="$(curl -s "$@" http://127.0.0.1:8099/api/x)"
  if [ "$got" = "$want" ]; then echo "ok   $name"; else echo "LỖI $name: mong $want, nhận '$got'"; fail=1; fi
}
check "XFF khách tự gửi bị bỏ" "127.0.0.1" -H 'X-Forwarded-For: 6.6.6.6'
check "CF-Connecting-IP IPv4 được dùng" "203.0.113.7" -H 'CF-Connecting-IP: 203.0.113.7' -H 'X-Forwarded-For: 6.6.6.6'
check "CF-Connecting-IP IPv6 được dùng" "2001:db8::1" -H 'CF-Connecting-IP: 2001:db8::1'
check "CF-Connecting-IP rác bị bỏ" "127.0.0.1" -H 'CF-Connecting-IP: khong-phai-ip'
check "CF-Connecting-IP dạng danh sách bị bỏ" "127.0.0.1" -H 'CF-Connecting-IP: 1.2.3.4, 5.6.7.8'
exit $fail
