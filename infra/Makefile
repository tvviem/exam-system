# Hạ tầng dev và CI bằng Podman pod (ADR-0006). Mỗi môi trường có tên pod, container, volume và cổng riêng.
PODMAN ?= podman

POSTGRES_IMAGE ?= docker.io/library/postgres:17
REDIS_IMAGE ?= docker.io/library/redis:7

ENV_FILE ?= $(if $(wildcard .env.dev),.env.dev,.env.dev.example)
include $(ENV_FILE)

# Giá trị theo môi trường: STAGE=dev (mặc định) hoặc STAGE=ci.
STAGE ?= dev
ifeq ($(STAGE),ci)
POSTGRES_PORT ?= 5435
REDIS_PORT ?= 6382
else
POSTGRES_PORT ?= 5434
REDIS_PORT ?= 6381
endif

POD_NAME ?= $(STAGE)-exam
POSTGRES_CONTAINER ?= $(STAGE)-exam-postgres
REDIS_CONTAINER ?= $(STAGE)-exam-redis
PG_DATA_VOLUME ?= $(STAGE)_exam_pgdata

.PHONY: help pod postgres redis up wait down stop logs psql redis-cli dev-up dev-down ci-up ci-wait ci-down
.PHONY: prod-bootstrap prod-up prod-deploy prod-scale prod-status prod-logs prod-stop prod-start prod-down prod-recover-admin prod-active-sessions prod-install-service prod-enable-archiving prod-disable-archiving prod-backup-status prod-backup-dump prod-backup-nightly prod-backup-basebackup prod-backup-push prod-backup-prune prod-backup-restore-test prod-backup-check prod-backup-install prod-backup-enable prod-backup-disable backup-drill-test

help:
	@echo "make dev-up     Tạo và chạy pod dev-exam (PostgreSQL :$(POSTGRES_PORT), Redis :$(REDIS_PORT))"
	@echo "make dev-down   Xóa pod dev-exam và volume dữ liệu"
	@echo "make ci-up      Tạo và chạy pod ci-exam (PostgreSQL :5435, Redis :6382)"
	@echo "make ci-wait    Đợi PostgreSQL và Redis của ci-exam sẵn sàng"
	@echo "make ci-down    Xóa pod ci-exam và volume dữ liệu"
	@echo "make stop       Dừng pod (STAGE=dev|ci)"
	@echo "make logs       Xem log PostgreSQL và Redis (STAGE=dev|ci)"
	@echo "make psql       Mở psql trong container PostgreSQL (STAGE=dev|ci)"
	@echo ""
	@echo "Vận hành pod prod-exam (docs/ops/trien-khai.md); thêm EXAM_STAGE=drill để thử trên pod drill-exam:"
	@echo "make prod-bootstrap TAG=<mã commit>   Dựng lần đầu (bí mật, pod, ứng dụng, Quản trị viên, dịch vụ systemd)"
	@echo "make prod-up TAG=<mã commit>          Đưa bản mới lên (từ chối nếu có Phiên thi; FORCE_REASON=\"lý do\" để ép)"
	@echo "make prod-deploy TAG=<mã commit>      Như prod-up nhưng đủ quy trình: sao lưu trước, kiểm sau, tự lùi, audit_logs (workflow GitHub gọi lệnh này)"
	@echo "make prod-scale N=1|2                 Một hoặc hai bản api"
	@echo "make prod-status                      Tình trạng pod"
	@echo "make prod-logs C=api                  Log (api, api-2, worker, web, postgres, redis)"
	@echo "make prod-stop / prod-start           Dừng hoặc bật lại pod (giữ dữ liệu)"
	@echo "make prod-down                        Xóa pod và container, GIỮ volume dữ liệu"
	@echo "make prod-recover-admin ADMIN=<tên>   Khôi phục tài khoản Quản trị viên"
	@echo "make prod-install-service          Cài lại dịch vụ systemd (mở WSL thì dựng lại pod)"
	@echo "make prod-active-sessions             Có Phiên thi đang diễn ra hoặc sắp bắt đầu không"
	@echo "Sao lưu (docs/ops/khoi-phuc.md, script scripts/exam-backup.sh):"
	@echo "make prod-backup-status               Tình trạng sao lưu (bản mới nhất, dãy WAL, hàng chờ đẩy, timer)"
	@echo "make prod-backup-check                Kiểm điều kiện trước khi bật (gpg, R2, ổ chép, healthchecks, lưu liên tục)"
	@echo "make prod-backup-install              Cài script và timer sao lưu (CHƯA bật)"
	@echo "make prod-backup-enable / -disable    Bật (sau khi check đạt) hoặc tắt các timer sao lưu"
	@echo "make prod-enable-archiving            Bật lưu liên tục WAL (dựng lại container PostgreSQL; từ chối nếu có Phiên thi)"
	@echo "make backup-drill-test             Thử toàn bộ chuỗi sao lưu trên pod thử drill-exam (R2 giả, khóa gpg giả), khoảng 5 phút"
	@echo "make prod-backup-dump | -nightly | -basebackup | -push | -prune | -restore-test   Chạy tay từng việc (ARGS=\"--dry-run\" cho prune)"

dev-up:
	@$(MAKE) --no-print-directory up wait STAGE=dev
dev-down:
	@$(MAKE) --no-print-directory down STAGE=dev
ci-up:
	@$(MAKE) --no-print-directory up STAGE=ci
ci-wait:
	@$(MAKE) --no-print-directory wait STAGE=ci
ci-down:
	@$(MAKE) --no-print-directory down STAGE=ci

pod:
	@if ! $(PODMAN) pod exists $(POD_NAME); then \
		echo ">>> Tạo pod $(POD_NAME)"; \
		$(PODMAN) pod create --name $(POD_NAME) \
			-p 127.0.0.1:$(POSTGRES_PORT):5432 \
			-p 127.0.0.1:$(REDIS_PORT):6379 >/dev/null; \
	fi
	@if [ "$$($(PODMAN) pod inspect -f '{{.State}}' $(POD_NAME))" != "Running" ]; then \
		$(PODMAN) pod start $(POD_NAME) >/dev/null 2>&1 || true; \
	fi

postgres: pod
	@if ! $(PODMAN) container exists $(POSTGRES_CONTAINER); then \
		echo ">>> Chạy PostgreSQL trong pod $(POD_NAME)"; \
		$(PODMAN) run -d --name $(POSTGRES_CONTAINER) --pod $(POD_NAME) \
			-e POSTGRES_USER=$(POSTGRES_USER) \
			-e POSTGRES_PASSWORD=$(POSTGRES_PASSWORD) \
			-e POSTGRES_DB=$(POSTGRES_DB) \
			-v $(PG_DATA_VOLUME):/var/lib/postgresql/data \
			$(POSTGRES_IMAGE) >/dev/null; \
	else \
		$(PODMAN) start $(POSTGRES_CONTAINER) >/dev/null; \
	fi

redis: pod
	@if ! $(PODMAN) container exists $(REDIS_CONTAINER); then \
		echo ">>> Chạy Redis trong pod $(POD_NAME)"; \
		$(PODMAN) run -d --name $(REDIS_CONTAINER) --pod $(POD_NAME) $(REDIS_IMAGE) redis-server --maxmemory-policy noeviction >/dev/null; \
	else \
		$(PODMAN) start $(REDIS_CONTAINER) >/dev/null; \
	fi

up: postgres redis
	@echo ">>> Pod $(POD_NAME) đang chạy: PostgreSQL 127.0.0.1:$(POSTGRES_PORT), Redis 127.0.0.1:$(REDIS_PORT)"

wait:
	@for i in $$(seq 1 30); do \
		if $(PODMAN) exec $(POSTGRES_CONTAINER) pg_isready -q -U $(POSTGRES_USER) -d $(POSTGRES_DB) 2>/dev/null; then break; fi; \
		if [ $$i = 30 ]; then echo "PostgreSQL không sẵn sàng"; $(PODMAN) logs --tail 50 $(POSTGRES_CONTAINER); exit 1; fi; \
		sleep 1; \
	done
	@for i in $$(seq 1 30); do \
		if $(PODMAN) exec $(REDIS_CONTAINER) redis-cli ping 2>/dev/null | grep -q PONG; then break; fi; \
		if [ $$i = 30 ]; then echo "Redis không sẵn sàng"; $(PODMAN) logs --tail 50 $(REDIS_CONTAINER); exit 1; fi; \
		sleep 1; \
	done
	@echo ">>> PostgreSQL và Redis của $(POD_NAME) đã sẵn sàng"

stop:
	@$(PODMAN) pod stop $(POD_NAME) >/dev/null 2>&1 || true

down:
	@$(PODMAN) pod rm -f $(POD_NAME) >/dev/null 2>&1 || true
	@$(PODMAN) volume rm -f $(PG_DATA_VOLUME) >/dev/null 2>&1 || true
	@echo ">>> Đã xóa pod $(POD_NAME) và volume $(PG_DATA_VOLUME)"

logs:
	@$(PODMAN) logs --tail 100 $(POSTGRES_CONTAINER)
	@$(PODMAN) logs --tail 100 $(REDIS_CONTAINER)

psql:
	@$(PODMAN) exec -it $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

redis-cli:
	@$(PODMAN) exec -it $(REDIS_CONTAINER) redis-cli

# ---------- Vận hành pod prod-exam (PR 6a). Logic nằm ở scripts/exam-ctl.sh ----------
EXAM_STAGE ?= prod
EXAM_CTL = EXAM_STAGE=$(EXAM_STAGE) bash scripts/exam-ctl.sh

prod-bootstrap:
	@$(EXAM_CTL) bootstrap
prod-up:
	@$(EXAM_CTL) up
prod-deploy:
	@$(EXAM_CTL) deploy
prod-scale:
	@$(EXAM_CTL) scale $(N)
prod-status:
	@$(EXAM_CTL) status
prod-logs:
	@$(EXAM_CTL) logs $(C)
prod-stop:
	@$(EXAM_CTL) stop
prod-start:
	@$(EXAM_CTL) start
prod-down:
	@$(EXAM_CTL) down
prod-install-service:
	@$(EXAM_CTL) install-service
prod-recover-admin:
	@$(EXAM_CTL) recover-admin $(ADMIN)
prod-active-sessions:
	@$(EXAM_CTL) active-sessions
prod-enable-archiving:
	@$(EXAM_CTL) enable-archiving
prod-disable-archiving:
	@$(EXAM_CTL) disable-archiving

# Sao lưu (PR 6c). Logic nằm ở scripts/exam-backup.sh
EXAM_BACKUP = EXAM_STAGE=$(EXAM_STAGE) bash scripts/exam-backup.sh

prod-backup-status:
	@$(EXAM_BACKUP) status
prod-backup-dump:
	@$(EXAM_BACKUP) dump $(ARGS)
prod-backup-nightly:
	@$(EXAM_BACKUP) nightly
prod-backup-basebackup:
	@$(EXAM_BACKUP) basebackup $(ARGS)
prod-backup-push:
	@$(EXAM_BACKUP) push
prod-backup-prune:
	@$(EXAM_BACKUP) prune $(ARGS)
prod-backup-restore-test:
	@$(EXAM_BACKUP) restore-test $(ARGS)
prod-backup-check:
	@$(EXAM_BACKUP) check
prod-backup-install:
	@$(EXAM_BACKUP) install
prod-backup-enable:
	@$(EXAM_BACKUP) enable
prod-backup-disable:
	@$(EXAM_BACKUP) disable

# Thử toàn bộ chuỗi sao lưu trên pod thử drill-exam (R2 giả, khóa gpg giả); KHÔNG đụng pod thật
backup-drill-test:
	@EXAM_STAGE=drill bash scripts/test-backup-drill.sh
