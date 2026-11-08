#!/usr/bin/env bash
# Vận hành pod exam bằng Podman (docs/plan/slice-6.md, PR 6a). Gọi qua Makefile: `make -C infra prod-<lệnh>`.
#
#   exam-ctl.sh bootstrap        Dựng lần đầu: bí mật, volume, pod, PostgreSQL, Redis, ứng dụng, Quản trị viên, dịch vụ systemd
#   exam-ctl.sh up               Đưa bản mới (TAG=<mã commit>) lên: migration, thay api, worker, web
#   exam-ctl.sh deploy           Như up nhưng đủ quy trình của workflow GitHub (PR 6b): chốt chặn, sao lưu trước, kiểm
#                                sau deploy, tự lùi một lần nếu lỗi, ghi audit_logs, dọn ảnh cũ, tóm tắt lần chạy
#   exam-ctl.sh scale 1|2        Tắt hoặc bật bản api thứ hai
#   exam-ctl.sh status           Tình trạng pod
#   exam-ctl.sh logs [tên]       Log container (api, api-2, worker, web, postgres, redis)
#   exam-ctl.sh stop             Dừng pod (giữ dữ liệu)
#   exam-ctl.sh down             Xóa pod và container, GIỮ volume dữ liệu (Q340)
#   exam-ctl.sh start            Bật lại pod đã dừng (dịch vụ systemd gọi lệnh tương đương khi mở WSL)
#   exam-ctl.sh install-service  Cài lại dịch vụ systemd (mở WSL thì dựng lại pod)
#   exam-ctl.sh recover-admin <tên>   Khôi phục tài khoản Quản trị viên (mật khẩu tạm in một lần)
#   exam-ctl.sh active-sessions  In số Phiên thi đang diễn ra hoặc sắp bắt đầu; thoát 1 nếu có
#
# EXAM_STAGE=prod (mặc định) là pod thật; EXAM_STAGE=drill là pod thử `drill-exam` với cổng, volume và thư mục bí mật
# riêng, dùng để thử script mà không đụng dữ liệu thật.
set -euo pipefail

EXAM_STAGE="${EXAM_STAGE:-prod}"
case "$EXAM_STAGE" in
  prod)
    POD=prod-exam WEB_PORT=8180 PG_PORT=5436
    PG_VOLUME=exam_pgdata MEDIA_VOLUME=exam_media
    SECRETS_DIR="$HOME/exam-prod-secrets"
    DEFAULT_ORIGIN="https://exam.plotrackerbluni.site"
    INSTALL_SERVICE_DEFAULT=1
    ;;
  drill)
    POD=drill-exam WEB_PORT=8190 PG_PORT=5437
    PG_VOLUME=drill_exam_pgdata MEDIA_VOLUME=drill_exam_media
    SECRETS_DIR="$HOME/exam-drill-secrets"
    DEFAULT_ORIGIN="http://127.0.0.1:8190"
    INSTALL_SERVICE_DEFAULT=0
    ;;
  *)
    echo "EXAM_STAGE phải là prod hoặc drill (nhận: $EXAM_STAGE)" >&2
    exit 2
    ;;
esac

PODMAN="${PODMAN:-podman}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/exam-$EXAM_STAGE"
BACKUP_DIR="${EXAM_BACKUP_DIR:-$HOME/exam-$EXAM_STAGE-backups}"
SELF="$(readlink -f "${BASH_SOURCE[0]}")"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/tvviem}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-docker.io/library/postgres:17}"
REDIS_IMAGE="${REDIS_IMAGE:-docker.io/library/redis:7}"
C_PG="$POD-postgres" C_REDIS="$POD-redis" C_API="$POD-api" C_API2="$POD-api-2" C_WORKER="$POD-worker" C_WEB="$POD-web"
# Log tối đa 10 MB mỗi container (Q341); k8s-file mới có giới hạn kích thước, journald mặc định của Podman thì không.
LOG_OPTS=(--log-driver k8s-file --log-opt max-size=10m)

say() { printf '>>> %s\n' "$*"; }
die() {
  printf 'LỖI: %s\n' "$*" >&2
  # Trong `deploy` (có DEPLOY_PHASE) ghi luôn lý do vào tóm tắt lần chạy.
  if [ -n "${DEPLOY_PHASE:-}" ] && [ -n "${SUMMARY_FILE:-}" ]; then printf '\n❌ %s\n' "$*" >>"$SUMMARY_FILE"; fi
  exit 1
}
pod_exists() { "$PODMAN" pod exists "$POD"; }
container_exists() { "$PODMAN" container exists "$1"; }
pod_state() { "$PODMAN" pod inspect -f '{{.State}}' "$POD" 2>/dev/null || echo "không có"; }

# Nhật ký thao tác của người vận hành, ghi trên máy (không nằm trong cơ sở dữ liệu nên còn khi cơ sở dữ liệu hỏng).
ops_log() {
  mkdir -p "$STATE_DIR"
  printf '%s %s %s\n' "$(date -Is)" "${USER:-?}" "$*" >>"$STATE_DIR/operations.log"
}

# ---------- Ảnh ----------
resolve_images() {
  if [ -z "${API_IMAGE:-}" ] || [ -z "${WEB_IMAGE:-}" ]; then
    [ -n "${TAG:-}" ] || die "Thiếu TAG=<mã commit đầy đủ của lần build trên main>."
  fi
  API_IMAGE="${API_IMAGE:-$IMAGE_REPO/exam-api:$TAG}"
  WEB_IMAGE="${WEB_IMAGE:-$IMAGE_REPO/exam-web:$TAG}"
  VERSION_LABEL="${TAG:-${API_IMAGE##*:}}"
}

# Ảnh `localhost/...` (build tay để thử) không tải được từ đâu, giữ nguyên.
pull_images() {
  local image
  for image in "$API_IMAGE" "$WEB_IMAGE"; do
    case "$image" in localhost/*) continue ;; esac
    say "Tải ảnh $image"
    "$PODMAN" pull -q "$image" >/dev/null
  done
}

# Ảnh api đang chạy (dùng cho lệnh một lần như recover-admin).
current_api_image() { "$PODMAN" inspect -f '{{.ImageName}}' "$C_API" 2>/dev/null || die "Chưa có container $C_API."; }

# ---------- Cơ sở dữ liệu, Phiên thi ----------
psql_scalar() {
  "$PODMAN" exec "$C_PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"' _ "$1"
}

wait_postgres() {
  for i in $(seq 1 60); do
    if "$PODMAN" exec "$C_PG" sh -c 'pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>/dev/null; then return 0; fi
    sleep 1
  done
  "$PODMAN" logs --tail 40 "$C_PG" >&2 || true
  die "PostgreSQL không sẵn sàng sau 60 giây."
}

wait_health() {
  for i in $(seq 1 60); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  "$PODMAN" logs --tail 40 "$C_API" >&2 || true
  die "Hệ thống chưa trả lời /api/health sau 60 giây (xem log ở trên)."
}

# Phiên thi chưa hủy đang diễn ra hoặc bắt đầu trong 60 phút tới, và Lượt đang làm dở (Q332).
GUARD_SQL="SELECT
  (SELECT count(*) FROM sessions WHERE cancelled_at IS NULL AND now() >= opens_at - interval '60 minutes' AND now() < closes_at),
  (SELECT count(*) FROM attempts WHERE status = 'in_progress')"

cmd_active_sessions() {
  pod_exists || die "Chưa có pod $POD."
  container_exists "$C_PG" || die "Chưa có container $C_PG."
  local row sessions attempts
  row="$(psql_scalar "$GUARD_SQL")" || die "Không hỏi được cơ sở dữ liệu (PostgreSQL đã chạy chưa?)."
  sessions="${row%%|*}"
  attempts="${row##*|}"
  echo "Phiên thi đang diễn ra hoặc bắt đầu trong 60 phút tới: $sessions; Lượt làm bài đang làm dở: $attempts"
  [ "$sessions" = 0 ] && [ "$attempts" = 0 ]
}

# Chốt chặn dùng cho thao tác làm gián đoạn hệ thống. Có FORCE_REASON="<lý do>" thì cho qua và ghi nhật ký (Q332).
guard() {
  local action="$1" out
  if out="$(cmd_active_sessions 2>&1)"; then return 0; fi
  case "$out" in
  "Phiên thi"*)
    echo "$out" >&2
    if [ -n "${FORCE_REASON:-}" ]; then
      echo "ÉP KHẨN CẤP ($action): $FORCE_REASON" >&2
      ops_log "ÉP KHẨN CẤP $action: $FORCE_REASON | $(echo "$out" | head -1)"
      return 0
    fi
    die "Từ chối $action vì có Phiên thi. Đợi hết giờ, hoặc nếu thật sự khẩn cấp: FORCE_REASON=\"lý do\" make ..."
    ;;
  esac
  echo "$out" >&2
  die "Không kiểm được Phiên thi nên không thực hiện $action."
}

# ---------- nginx ----------
# Danh sách api nginx chia tải; nằm ngoài ảnh để `scale` đổi mà không phải build lại.
write_upstream() {
  mkdir -p "$STATE_DIR"
  # Ghi đè tại chỗ (không `mv`): container bind-mount file này theo inode.
  { echo "server 127.0.0.1:3000;"; [ "$1" = 2 ] && echo "server 127.0.0.1:3001;"; true; } >"$STATE_DIR/upstream.conf"
}

reload_web() {
  container_exists "$C_WEB" || return 0
  "$PODMAN" exec "$C_WEB" nginx -t >/dev/null 2>&1 || die "Cấu hình nginx lỗi, không nạp lại."
  "$PODMAN" exec "$C_WEB" nginx -s reload >/dev/null 2>&1
}

# ---------- Chạy container ----------
run_postgres() {
  "$PODMAN" run -d --name "$C_PG" --pod "$POD" --restart always --memory 3g --cpus 4 "${LOG_OPTS[@]}" \
    --env-file "$SECRETS_DIR/postgres.env" -v "$PG_VOLUME":/var/lib/postgresql/data \
    "$POSTGRES_IMAGE" postgres -c shared_buffers=1GB -c effective_cache_size=3GB -c max_connections=200 >/dev/null
}

run_redis() {
  "$PODMAN" run -d --name "$C_REDIS" --pod "$POD" --restart always --memory 256m "${LOG_OPTS[@]}" \
    "$REDIS_IMAGE" redis-server --maxmemory-policy noeviction >/dev/null
}

run_api() { # tên container, cổng
  "$PODMAN" run -d --name "$1" --pod "$POD" --restart always --memory 1g --cpus 4 "${LOG_OPTS[@]}" \
    --env-file "$SECRETS_DIR/api.env" -e "PORT=$2" -e "APP_VERSION=$VERSION_LABEL" \
    -v "$MEDIA_VOLUME":/var/lib/exam/media "$API_IMAGE" >/dev/null
}

run_worker() {
  "$PODMAN" run -d --name "$C_WORKER" --pod "$POD" --restart always --memory 512m --cpus 2 "${LOG_OPTS[@]}" \
    --env-file "$SECRETS_DIR/api.env" -e "APP_VERSION=$VERSION_LABEL" \
    -v "$MEDIA_VOLUME":/var/lib/exam/media "$API_IMAGE" node dist/worker/main.js >/dev/null
}

run_web() {
  "$PODMAN" run -d --name "$C_WEB" --pod "$POD" --restart always --memory 256m "${LOG_OPTS[@]}" \
    -v "$MEDIA_VOLUME":/var/lib/exam/media:ro \
    -v "$STATE_DIR/upstream.conf":/etc/exam-nginx/upstream.conf:ro "$WEB_IMAGE" >/dev/null
}

replace() { # tên container, rồi lệnh dựng lại
  local name="$1"
  shift
  if container_exists "$name"; then
    "$PODMAN" stop -t 30 "$name" >/dev/null
    "$PODMAN" rm "$name" >/dev/null
  fi
  "$@"
}

run_migration() {
  say "Chạy migration"
  "$PODMAN" run --rm --pod "$POD" --env-file "$SECRETS_DIR/api.env" "$API_IMAGE" node dist/db/migrate.js
}

api_ready_inside() { # container
  "$PODMAN" exec "$1" node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null
}

# Đợi một bản api trả lời; thay lần lượt từng bản thì bản kia vẫn phục vụ, không có khoảng hở.
wait_api_ready() { # container
  for i in $(seq 1 60); do
    api_ready_inside "$1" && return 0
    sleep 1
  done
  "$PODMAN" logs --tail 40 "$1" >&2 || true
  die "$1 không sẵn sàng sau 60 giây."
}

# ---------- Lệnh ----------
prompt_admin() {
  EXAM_ADMIN_USERNAME="${EXAM_ADMIN_USERNAME:-quantri}"
  if [ -z "${EXAM_ADMIN_FULL_NAME:-}" ]; then
    [ -t 0 ] || die "Thiếu EXAM_ADMIN_FULL_NAME (không có bàn phím để hỏi)."
    read -r -p "Họ tên Quản trị viên đầu tiên: " EXAM_ADMIN_FULL_NAME
  fi
  if [ -z "${EXAM_ADMIN_PASSWORD:-}" ]; then
    [ -t 0 ] || die "Thiếu EXAM_ADMIN_PASSWORD (không có bàn phím để hỏi)."
    local again
    read -rs -p "Mật khẩu của \"$EXAM_ADMIN_USERNAME\" (từ 10 ký tự): " EXAM_ADMIN_PASSWORD
    echo
    read -rs -p "Nhập lại mật khẩu: " again
    echo
    [ "$EXAM_ADMIN_PASSWORD" = "$again" ] || die "Hai lần nhập mật khẩu không khớp."
  fi
  [ "${#EXAM_ADMIN_PASSWORD}" -ge 10 ] || die "Mật khẩu phải từ 10 ký tự."
  [ -n "$EXAM_ADMIN_FULL_NAME" ] || die "Họ tên không được để trống."
}

env_value() { grep -m1 "^$2=" "$1" | cut -d= -f2-; }

create_secrets() {
  local created=""
  mkdir -p "$SECRETS_DIR" "$STATE_DIR"
  chmod 700 "$SECRETS_DIR"
  if [ ! -f "$SECRETS_DIR/postgres.env" ]; then
    local pw
    pw="$(openssl rand -hex 24)"
    (umask 077 && printf 'POSTGRES_USER=exam\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=exam\n' "$pw" >"$SECRETS_DIR/postgres.env")
    created="$created POSTGRES_PASSWORD=$pw"$'\n'
  fi
  if [ ! -f "$SECRETS_DIR/api.env" ]; then
    local pw key origin
    pw="$(env_value "$SECRETS_DIR/postgres.env" POSTGRES_PASSWORD)"
    key="$(openssl rand -base64 32)"
    origin="${APP_ORIGIN:-$DEFAULT_ORIGIN}"
    (umask 077 && cat >"$SECRETS_DIR/api.env" <<EOF
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgres://exam:$pw@127.0.0.1:5432/exam
REDIS_URL=redis://127.0.0.1:6379/0
APP_ORIGINS=$origin
LOGIN_MAX_PER_IP=1000
DB_POOL_MAX=10
TRUST_PROXY=loopback
SLIP_ENCRYPTION_KEY=$key
MEDIA_DIR=/var/lib/exam/media
MEDIA_ACCEL_PREFIX=/_media
EOF
    )
    created="$created SLIP_ENCRYPTION_KEY=$key"$'\n'
  fi
  chmod 600 "$SECRETS_DIR"/*.env
  if [ -n "$created" ]; then
    echo
    echo "================================================================================"
    echo " CHÉP CÁC GIÁ TRỊ SAU VÀO TRÌNH QUẢN LÝ MẬT KHẨU VÀ BẢN GIẤY. CHỈ HIỆN MỘT LẦN."
    echo "================================================================================"
    printf '%s' "$created"
    echo "================================================================================"
    echo " Các giá trị này cũng nằm trong $SECRETS_DIR (quyền 600)."
    if [ -t 0 ]; then read -r -p "Đã chép xong? Nhấn Enter để tiếp tục. "; fi
  else
    say "Giữ nguyên các file bí mật đã có trong $SECRETS_DIR (không ghi đè)."
  fi
}

install_service() {
  local unit_dir="$HOME/.config/systemd/user" unit="exam-$EXAM_STAGE.service" podman_bin
  podman_bin="$(command -v "$PODMAN")"
  mkdir -p "$unit_dir"
  cat >"$unit_dir/$unit" <<EOF
[Unit]
Description=exam-system: pod $POD (Podman)

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$podman_bin pod start $POD
ExecStop=$podman_bin pod stop --time 30 $POD
TimeoutStopSec=90

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now "$unit" >/dev/null
  say "Đã cài dịch vụ systemd $unit: mở WSL thì pod $POD tự dựng lại."
}

cmd_install_service() {
  pod_exists || die "Chưa có pod $POD. Chạy prod-bootstrap trước."
  install_service
}

cmd_bootstrap() {
  resolve_images
  pod_exists && die "Pod $POD đã có. Muốn đưa bản mới lên thì dùng prod-up."
  prompt_admin
  create_secrets
  say "Tạo volume và pod $POD"
  for v in "$PG_VOLUME" "$MEDIA_VOLUME"; do "$PODMAN" volume exists "$v" || "$PODMAN" volume create "$v" >/dev/null; done
  "$PODMAN" pod create --name "$POD" -p "127.0.0.1:$WEB_PORT:80" -p "127.0.0.1:$PG_PORT:5432" >/dev/null
  run_postgres
  run_redis
  wait_postgres
  write_upstream 1
  SKIP_GUARD=1 cmd_up
  say "Tạo Quản trị viên \"$EXAM_ADMIN_USERNAME\""
  export BOOTSTRAP_ADMIN_PASSWORD="$EXAM_ADMIN_PASSWORD"
  "$PODMAN" run --rm --pod "$POD" --env-file "$SECRETS_DIR/api.env" \
    -e "BOOTSTRAP_ADMIN_USERNAME=$EXAM_ADMIN_USERNAME" -e "BOOTSTRAP_ADMIN_FULL_NAME=$EXAM_ADMIN_FULL_NAME" \
    -e BOOTSTRAP_ADMIN_PASSWORD "$API_IMAGE" node dist/cli/main.js bootstrap-admin
  unset BOOTSTRAP_ADMIN_PASSWORD EXAM_ADMIN_PASSWORD
  if [ "${EXAM_INSTALL_SERVICE:-$INSTALL_SERVICE_DEFAULT}" = 1 ]; then install_service; fi
  ops_log "bootstrap $VERSION_LABEL"
  say "Xong. Hệ thống chạy ở http://127.0.0.1:$WEB_PORT (Quản trị viên đổi mật khẩu ở lần đăng nhập đầu)."
}

cmd_up() {
  resolve_images
  pod_exists || die "Chưa có pod $POD. Chạy prod-bootstrap trước."
  if [ "$(pod_state)" != Running ]; then
    "$PODMAN" pod start "$POD" >/dev/null
    wait_postgres
  fi
  [ "${SKIP_GUARD:-}" = 1 ] || guard "đưa bản $VERSION_LABEL lên"
  pull_images
  [ -f "$STATE_DIR/upstream.conf" ] || write_upstream 1
  local two=1
  container_exists "$C_API2" && two=2
  write_upstream "$two"
  run_migration
  say "Thay api, worker, web bằng bản $VERSION_LABEL"
  replace "$C_API" run_api "$C_API" 3000
  wait_api_ready "$C_API"
  if [ "$two" = 2 ]; then
    replace "$C_API2" run_api "$C_API2" 3001
    wait_api_ready "$C_API2"
  fi
  replace "$C_WORKER" run_worker
  replace "$C_WEB" run_web
  wait_health
  printf '%s\n' "$VERSION_LABEL" >"$STATE_DIR/tag"
  ops_log "up $VERSION_LABEL"
  say "Đã chạy bản $VERSION_LABEL (api x$two)."
}

# ---------- Deploy đủ quy trình (PR 6b, docs/plan/slice-6.md Q342–Q350) ----------
# Biến môi trường: TAG (hoặc API_IMAGE + WEB_IMAGE), FORCE_REASON, TRIGGERED_BY, RUN_URL, COMMIT_TITLE,
# SUMMARY_FILE (workflow truyền $GITHUB_STEP_SUMMARY; không có thì ghi $STATE_DIR/last-deploy-summary.md),
# SMOKE_PUBLIC_WAIT (giây giữa các lần thử địa chỉ công khai, mặc định 5).
sum_add() { printf '%s\n' "$*" >>"$SUMMARY_FILE"; }

# Chụp cơ sở dữ liệu trước migration và kiểm file đọc được (Q345). Trả khác 0 nếu hỏng.
backup_before_deploy() { # tag cũ
  local prev="${1//[^A-Za-z0-9._-]/_}" file
  file="$BACKUP_DIR/truoc-deploy-$(date +%Y%m%d-%H%M%S)-${prev:0:12}.dump"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  say "Sao lưu trước deploy: $file"
  if (umask 077 && "$PODMAN" exec "$C_PG" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$file") &&
    [ -s "$file" ] &&
    "$PODMAN" exec -i "$C_PG" pg_restore --list <"$file" >/dev/null; then
    BACKUP_FILE="$file"
    # Giữ 10 bản "trước deploy" mới nhất; sao lưu chính thức (retention riêng) là việc của PR 6c.
    # shellcheck disable=SC2012
    ls -1t "$BACKUP_DIR"/truoc-deploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f --
    return 0
  fi
  rm -f "$file"
  return 1
}

# Ghi một dòng audit_logs (thao tác của hệ thống nên actor_id trống). Giá trị đi qua biến psql, không ghép vào SQL (Q346).
audit_deploy() { # action, tag cũ, tag mới, forced, rolled_back, ghi chú
  "$PODMAN" exec -i "$C_PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1 \
    -v action="$1" -v prev="$2" -v tag="$3" -v forced="$4" -v rolled="$5" -v note="$6" \
    -v title="$7" -v by="$8" -v url="$9" -v reason="${10}"' _ \
    "$1" "$2" "$3" "$4" "$5" "$6" "${COMMIT_TITLE:-}" "${TRIGGERED_BY:-${USER:-?}}" "${RUN_URL:-}" "${FORCE_REASON:-}" <<'SQL'
INSERT INTO audit_logs (actor_id, action, entity_type, before, after, at)
VALUES (NULL, :'action', 'system', jsonb_build_object('tag', :'prev'),
  jsonb_build_object('tag', :'tag', 'commit_title', :'title', 'triggered_by', :'by', 'run_url', :'url',
    'forced', (:'forced')::boolean, 'force_reason', nullif(:'reason', ''),
    'rolled_back', (:'rolled')::boolean, 'note', nullif(:'note', '')),
  now());
SQL
}

# /api/health phải ok, postgres và redis up, và version đúng bằng bản vừa chọn (bắt "thành công giả": container cũ vẫn trả lời ok).
health_matches() { # nội dung JSON, version mong đợi
  case "$1" in *'"status":"ok"'*) ;; *) return 1 ;; esac
  case "$1" in *'"postgres":"up"'*) ;; *) return 1 ;; esac
  case "$1" in *'"redis":"up"'*) ;; *) return 1 ;; esac
  case "$1" in *"\"version\":\"$2\""*) ;; *) return 1 ;; esac
}

smoke_inside() { # version mong đợi
  local body
  body="$(curl -fsS --max-time 3 "http://127.0.0.1:$WEB_PORT/api/health" 2>/dev/null)" || return 1
  health_matches "$body" "$1"
}

# Địa chỉ người dự thi thật sự đi qua (tunnel); lỗi ở đây thường nằm ngoài pod nên chỉ cảnh báo (Q348).
smoke_public() { # version mong đợi
  local url body i
  url="$(env_value "$SECRETS_DIR/api.env" APP_ORIGINS | cut -d, -f1)"
  PUBLIC_URL="$url"
  [ -n "$url" ] || return 1
  for i in 1 2 3; do
    if body="$(curl -fsS --max-time 5 "$url/api/health" 2>/dev/null)" && health_matches "$body" "$1"; then return 0; fi
    [ "$i" = 3 ] || sleep "${SMOKE_PUBLIC_WAIT:-5}"
  done
  return 1
}

# Giữ ảnh của bản đang chạy và 2 bản trước đó (Q350); chỉ đụng ảnh api/web của chính dự án.
prune_old_images() { # tag mới, tag cũ
  local history="$STATE_DIR/deployed-tags" keep repo ref tag
  [ -f "$history" ] || { [ "$2" = '?' ] || printf '%s\n' "$2" >"$history"; }
  printf '%s\n' "$1" >>"$history"
  keep="$(tac "$history" | awk '!seen[$0]++' | head -3)"
  for repo in "${API_IMAGE%:*}" "${WEB_IMAGE%:*}"; do
    while read -r ref; do
      # `podman images` liệt kê mọi tên của ảnh khớp; chỉ xét đúng kho của dự án, không đụng tên khác của cùng ảnh.
      case "$ref" in "$repo":*) ;; *) continue ;; esac
      tag="${ref##*:}"
      [ "$tag" = '<none>' ] && continue
      printf '%s\n' "$keep" | grep -qxF -- "$tag" && continue
      say "Xóa ảnh cũ $ref"
      "$PODMAN" rmi "$ref" >/dev/null 2>&1 || true
    done < <("$PODMAN" images --filter "reference=$repo" --format '{{.Repository}}:{{.Tag}}')
  done
}

collect_failure_logs() { # file đích
  local c
  : >"$1"
  for c in "$C_API" "$C_API2" "$C_WORKER" "$C_WEB"; do
    container_exists "$c" || continue
    { echo "===== $c ====="; "$PODMAN" logs --tail 50 "$c" 2>&1 || true; } >>"$1"
  done
}

deploy_exit() { # mã thoát
  if [ "$1" != 0 ] && [ "${DEPLOY_REPORTED:-0}" != 1 ]; then
    sum_add ""
    if [ "${DEPLOY_TOUCHED:-0}" = 1 ]; then
      sum_add "**Dừng ở bước: ${DEPLOY_PHASE:-?}.** Hệ thống có thể đã bị thay một phần: xem log lần chạy và \`docs/ops/trien-khai.md\`, mục lỗi thường gặp."
    else
      sum_add "**Dừng ở bước: ${DEPLOY_PHASE:-?}.** Chưa đụng vào hệ thống đang chạy."
    fi
  fi
}

cmd_deploy() {
  resolve_images
  pod_exists || die "Chưa có pod $POD. Chạy prod-bootstrap trước."
  mkdir -p "$STATE_DIR"
  if [ -z "${SUMMARY_FILE:-}" ]; then
    SUMMARY_FILE="$STATE_DIR/last-deploy-summary.md"
    : >"$SUMMARY_FILE"
  fi
  local new="$VERSION_LABEL" prev forced=false failure_log="$STATE_DIR/last-failure.log"
  prev="$(cat "$STATE_DIR/tag" 2>/dev/null || echo '?')"
  BACKUP_FILE=''
  DEPLOY_TOUCHED=0
  DEPLOY_PHASE='khởi động'
  trap 'deploy_exit $?' EXIT

  sum_add "## Deploy $EXAM_STAGE: bản \`${new:0:12}\`"
  sum_add ""
  sum_add "| Mục | Giá trị |"
  sum_add "|---|---|"
  sum_add "| Tag đã chọn | \`$new\` |"
  sum_add "| Tag đang chạy trước đó | \`$prev\` |"
  sum_add "| Commit | ${COMMIT_TITLE:-(không rõ)} |"
  sum_add "| Người bấm | ${TRIGGERED_BY:-${USER:-?}} |"
  sum_add ""

  if [ "$prev" = "$new" ]; then sum_add "ℹ️ Bản này đang chạy sẵn; chạy lại để thay container."; fi

  DEPLOY_PHASE='bật pod'
  if [ "$(pod_state)" != Running ]; then
    "$PODMAN" pod start "$POD" >/dev/null
    wait_postgres
  fi

  DEPLOY_PHASE='tải ảnh (ảnh chưa có thì CI của commit này chưa xong hoặc đỏ)'
  pull_images

  DEPLOY_PHASE='chốt chặn Phiên thi'
  guard "đưa bản $new lên"
  if [ -n "${FORCE_REASON:-}" ] && ! cmd_active_sessions >/dev/null 2>&1; then
    forced=true
    sum_add "- ⚠️ Chốt chặn Phiên thi: **ép** vì \"$FORCE_REASON\"."
  else
    sum_add "- ✅ Chốt chặn Phiên thi: không có Phiên thi đang diễn ra hoặc sắp bắt đầu."
  fi

  DEPLOY_PHASE='sao lưu trước deploy'
  if backup_before_deploy "$prev"; then
    sum_add "- ✅ Sao lưu trước deploy: \`$BACKUP_FILE\` ($(du -h "$BACKUP_FILE" | cut -f1)), đã kiểm đọc được."
  elif [ -n "${FORCE_REASON:-}" ]; then
    forced=true
    ops_log "ÉP KHẨN CẤP deploy $new KHÔNG sao lưu được: $FORCE_REASON"
    sum_add "- ⚠️ Sao lưu trước deploy **thất bại** nhưng vẫn đi tiếp vì có FORCE_REASON: \"$FORCE_REASON\"."
  else
    die "Không sao lưu được trước deploy nên dừng. Hệ thống đang chạy chưa bị đụng. Kiểm dung lượng ổ ($BACKUP_DIR) và container $C_PG; nếu thật sự khẩn cấp: FORCE_REASON=\"lý do\"."
  fi

  DEPLOY_PHASE='đưa bản mới lên'
  DEPLOY_TOUCHED=1
  local ok=1 reason=''
  if ! SKIP_GUARD=1 bash "$SELF" up; then
    ok=0
    reason='up thất bại (migration, thay container hoặc /api/health quá 60 giây)'
  elif ! smoke_inside "$new"; then
    ok=0
    reason="kiểm sau deploy trong máy trượt: /api/health không ok hoặc version khác $new"
  fi

  if [ "$ok" = 0 ]; then
    DEPLOY_REPORTED=1
    collect_failure_logs "$failure_log"
    say "LỖI: $reason"
    sum_add ""
    sum_add "### ❌ Bản mới lỗi: $reason"
    local rolled=false
    if [ "$prev" = '?' ] || [ "$prev" = "$new" ]; then
      sum_add "Không có bản khác để lùi về (tag trước: \`$prev\`). Hệ thống có thể đang ngừng: xem \`docs/ops/trien-khai.md\`, mục lỗi thường gặp."
    else
      say "Tự lùi về bản $prev (một lần)"
      if env -u TAG API_IMAGE="${API_IMAGE%:*}:$prev" WEB_IMAGE="${WEB_IMAGE%:*}:$prev" SKIP_GUARD=1 bash "$SELF" up && smoke_inside "$prev"; then
        rolled=true
        sum_add "✅ Đã **lùi về bản \`$prev\`**, hệ thống đang chạy lại (api, worker, web đã thay)."
      else
        sum_add "🛑 **Lùi về \`$prev\` cũng lỗi.** Hệ thống có thể đang ngừng: xem \`docs/ops/trien-khai.md\`, mục lỗi thường gặp."
      fi
    fi
    audit_deploy ops.deploy-failed "$prev" "$new" "$forced" "$rolled" "$reason" ||
      sum_add "⚠️ Không ghi được audit_logs (cơ sở dữ liệu không trả lời)."
    ops_log "deploy $new THẤT BẠI ($reason); lùi=$rolled"
    sum_add ""
    sum_add "<details><summary>Log 50 dòng cuối của các container (lấy trước khi lùi)</summary>"
    sum_add ""
    sum_add '```'
    cat "$failure_log" >>"$SUMMARY_FILE"
    sum_add '```'
    sum_add "</details>"
    exit 1
  fi
  sum_add "- ✅ Kiểm trong máy: \`/api/health\` ok, postgres và redis up, version = \`${new:0:12}\`."

  DEPLOY_PHASE='kiểm địa chỉ công khai'
  PUBLIC_URL=''
  if smoke_public "$new"; then
    sum_add "- ✅ Địa chỉ công khai \`$PUBLIC_URL\` trả lời đúng bản này."
  else
    sum_add "- ⚠️ Địa chỉ công khai \`${PUBLIC_URL:-?}\` chưa trả lời đúng bản này. Nguyên nhân thường nằm ngoài pod: kiểm Cloudflare tunnel (\`docs/ops/trien-khai.md\`, mục 2). **Không lùi bản** vì hệ thống trong máy chạy tốt."
  fi

  DEPLOY_PHASE='ghi audit_logs'
  if audit_deploy ops.deploy "$prev" "$new" "$forced" false ''; then
    sum_add "- ✅ Đã ghi \`audit_logs\` (ops.deploy)."
  else
    sum_add "- ⚠️ Không ghi được \`audit_logs\`; lần deploy vẫn thành công."
  fi
  ops_log "deploy $new (trước: $prev) forced=$forced"

  DEPLOY_PHASE='dọn ảnh cũ'
  prune_old_images "$new" "$prev" || true

  DEPLOY_REPORTED=1
  sum_add ""
  sum_add "### ✅ Đã deploy bản \`${new:0:12}\`"
  say "Xong: đang chạy bản $new (trước đó $prev)."
}

cmd_scale() {
  local n="${1:-}"
  [ "$n" = 1 ] || [ "$n" = 2 ] || die "Cách dùng: scale 1|2"
  pod_exists || die "Chưa có pod $POD."
  if [ "$n" = 2 ]; then
    container_exists "$C_API2" && { say "Đã có 2 bản api."; return 0; }
    API_IMAGE="$(current_api_image)"
    VERSION_LABEL="$(cat "$STATE_DIR/tag" 2>/dev/null || echo "${API_IMAGE##*:}")"
    say "Bật api thứ hai"
    run_api "$C_API2" 3001
    wait_api_ready "$C_API2"
    write_upstream 2
    reload_web
    ops_log "scale 2"
    say "Đang chạy 2 bản api; nginx chia tải."
  else
    container_exists "$C_API2" || { say "Chỉ có 1 bản api."; return 0; }
    guard "tắt api thứ hai"
    say "Tắt api thứ hai (kết nối Socket.IO trên bản đó tự nối lại vào bản còn lại)"
    write_upstream 1
    reload_web
    "$PODMAN" stop -t 30 "$C_API2" >/dev/null
    "$PODMAN" rm "$C_API2" >/dev/null
    ops_log "scale 1"
    say "Đang chạy 1 bản api."
  fi
}

cmd_status() {
  pod_exists || die "Chưa có pod $POD."
  echo "Pod $POD: $(pod_state); bản đang chạy: $(cat "$STATE_DIR/tag" 2>/dev/null || echo '?')"
  "$PODMAN" ps -a --pod --filter "pod=$POD" --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | sed 's/\(.\{120\}\).*/\1/'
  if curl -fsS --max-time 3 "http://127.0.0.1:$WEB_PORT/api/health" 2>/dev/null; then echo; else echo "/api/health KHÔNG trả lời."; fi
  echo "nginx chia tải: $(tr '\n' ' ' <"$STATE_DIR/upstream.conf" 2>/dev/null)"
  cmd_active_sessions || true
}

cmd_logs() {
  local which="${1:-api}"
  case "$which" in
    api | api-2 | worker | web | postgres | redis) "$PODMAN" logs --tail 100 "$POD-$which" ;;
    *) die "Tên không hợp lệ: $which (api, api-2, worker, web, postgres, redis)" ;;
  esac
}

cmd_stop() {
  pod_exists || die "Chưa có pod $POD."
  if [ "$(pod_state)" = Running ]; then guard "dừng pod"; fi
  "$PODMAN" pod stop --time 30 "$POD" >/dev/null
  ops_log "stop"
  say "Đã dừng pod $POD (dữ liệu còn nguyên). Bật lại: prod-start."
}

cmd_start() {
  pod_exists || die "Chưa có pod $POD. Chạy prod-bootstrap trước."
  "$PODMAN" pod start "$POD" >/dev/null || true
  wait_health
  ops_log "start"
  say "Pod $POD đang chạy."
}

cmd_down() {
  pod_exists || die "Chưa có pod $POD."
  if [ "$(pod_state)" = Running ]; then guard "xóa pod"; fi
  "$PODMAN" pod rm -f "$POD" >/dev/null
  ops_log "down"
  say "Đã xóa pod $POD và container. Volume $PG_VOLUME và $MEDIA_VOLUME CÒN NGUYÊN (Q340). Dựng lại bằng prod-up."
}

cmd_recover_admin() {
  local name="${1:-}"
  [ -n "$name" ] || die "Cách dùng: recover-admin <tên đăng nhập>"
  pod_exists || die "Chưa có pod $POD."
  "$PODMAN" run --rm --pod "$POD" --env-file "$SECRETS_DIR/api.env" "$(current_api_image)" \
    node dist/cli/main.js recover-admin --username "$name"
  ops_log "recover-admin $name"
}

main() {
  local command="${1:-}"
  [ $# -gt 0 ] && shift
  case "$command" in
    bootstrap) cmd_bootstrap "$@" ;;
    up) cmd_up "$@" ;;
    deploy) cmd_deploy "$@" ;;
    scale) cmd_scale "$@" ;;
    status) cmd_status "$@" ;;
    logs) cmd_logs "$@" ;;
    stop) cmd_stop "$@" ;;
    start) cmd_start "$@" ;;
    install-service) cmd_install_service "$@" ;;
    down) cmd_down "$@" ;;
    recover-admin) cmd_recover_admin "$@" ;;
    active-sessions) cmd_active_sessions "$@" ;;
    *)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//' >&2
      exit 2
      ;;
  esac
}

# Chạy khi gọi trực tiếp; `source` file này (để thử từng hàm) thì không chạy gì.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
