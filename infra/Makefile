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

help:
	@echo "make dev-up     Tạo và chạy pod dev-exam (PostgreSQL :$(POSTGRES_PORT), Redis :$(REDIS_PORT))"
	@echo "make dev-down   Xóa pod dev-exam và volume dữ liệu"
	@echo "make ci-up      Tạo và chạy pod ci-exam (PostgreSQL :5435, Redis :6382)"
	@echo "make ci-wait    Đợi PostgreSQL và Redis của ci-exam sẵn sàng"
	@echo "make ci-down    Xóa pod ci-exam và volume dữ liệu"
	@echo "make stop       Dừng pod (STAGE=dev|ci)"
	@echo "make logs       Xem log PostgreSQL và Redis (STAGE=dev|ci)"
	@echo "make psql       Mở psql trong container PostgreSQL (STAGE=dev|ci)"

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
