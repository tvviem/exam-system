# Lát cắt 0: khung monorepo, hạ tầng dev/CI, pipeline

> Trạng thái: **accepted** (28/10/2026). Code nằm trên nhánh `feat/slice-0`. Phần cấu trúc làm theo [architecture.md](../architecture.md) và các ADR đã duyệt. Các lựa chọn mới hoặc lệch so với tài liệu cũ được ghi ở mục [Đã chốt](#đã-chốt-28102026).

## Mục tiêu

Người mới clone repo chạy được các lệnh trong mục "Bắt đầu nhanh" của README. Mọi PR phải qua CI xanh. Lát cắt này chưa có nghiệp vụ.

## Đã làm

| Hạng mục | Nội dung |
|---|---|
| Monorepo | pnpm workspace: `apps/api`, `apps/web`, `packages/shared`, `packages/scoring`. Node 24, TypeScript 6.0 |
| api | NestJS 12 + Fastify 5.12. Env được kiểm tra bằng Zod (`src/config/env.ts`) và tự nạp `.env` nếu có. Log pino (che cookie, authorization). `GET /api/health` kiểm tra PostgreSQL và Redis, trả 200 khi cả hai chạy, 503 khi có thành phần lỗi |
| worker | `apps/api/src/worker/main.ts`: NestJS application context, dùng chung module cấu hình, DB, Redis với api. Chưa có job. Tắt êm khi nhận SIGTERM |
| DB | Drizzle + drizzle-kit, thư mục `apps/api/drizzle`. `pnpm db:migrate`, `pnpm db:generate`. Chưa có bảng |
| web | React 19 + Vite 8, TanStack Router (định tuyến theo file, tách code tự động) + Query, Tailwind 4, i18next (`src/i18n/vi.json`). Route rỗng `/admin`, `/examiner`, `/take`. Trang chủ hiển thị kết quả `/api/health` |
| packages | `shared`: schema Zod của response health. `scoring`: còn rỗng, chờ lát cắt 5 |
| infra | `infra/Makefile`: `dev-up`, `dev-down`, `ci-up`, `ci-wait`, `ci-down`, `stop`, `logs`, `psql`, `redis-cli` (`STAGE=dev\|ci`) |
| Container | `infra/containers/api.Containerfile` (api và worker dùng chung image, 281 MB trước khi tinh gọn), `web.Containerfile` + `nginx.conf` (SPA, proxy `/api`, `/ws`, cache `/assets`) |
| CI | `.github/workflows/ci.yml`, gồm 3 job: **check** (lint, typecheck, unit, `pnpm audit`), **integration** (pod `ci-exam`, migrate, kiểm tra migration drift, integration, e2e Playwright desktop + Pixel 7) và **images** (build api và web; khi push lên `main` thì đẩy lên `ghcr.io/tvviem/exam-{api,web}:<sha>`) |

Đã chạy trên máy và đều xanh:
- Unit test và integration test.
- e2e: 4 test (2 kịch bản × desktop/mobile).
- Toàn bộ job integration của CI, chạy với pod `ci-exam`.
- Build hai image.
- Image api chạy trong pod: health trả `ok`, migration chạy được.
- `pnpm dev` qua proxy của Vite.


**Để lát cắt sau:**
- Lát cắt 1: `bootstrap-admin`.
- Lát cắt 4: PWA/Service Worker, Socket.IO.
- Lát cắt 6: job deploy lên `prod-exam`.

## Cổng trên máy host

Máy đang có pod của plo-tracker: `prod-plotracker` dùng `:8000`, `:8080`; `devplotracker` dùng `5433`, `6380`.

| Môi trường | Pod | PostgreSQL | Redis |
|---|---|---|---|
| dev | `dev-exam` | `127.0.0.1:5434` | `127.0.0.1:6381` |
| CI (cũng chạy được trên máy) | `ci-exam` | `127.0.0.1:5435` | `127.0.0.1:6382` |

## Đã chốt (28/10/2026)

- **Worker đặt chung trong `apps/api`** (`src/worker/main.ts`), cùng image, chạy bằng lệnh `node dist/worker/main.js`. Đã sửa architecture.md mục 10 và README.
- **NestJS 12** (12.2.0; ràng buộc `^12.2.0` sẽ nhận bản 12.3.x khi cập nhật lockfile, vì pnpm 11 chưa cài bản mới ra dưới một ngày), kèm Nest CLI 12 và TypeScript 6.0. NestJS 12 dùng sẵn fastify 5.12.7 nên đã bỏ phần `overrides` vá GHSA-9q9j-q6p8-xq58. Bản 11 không còn được dùng. Đã chạy lại toàn bộ test: unit, integration, e2e, audit, image, worker và `pnpm dev`.
- **Integration test không đụng dữ liệu demo.** Test chạy trên PostgreSQL và Redis thật trong pod sẵn có (`dev-exam` trên máy, `ci-exam` trên CI), nhưng dùng database `exam_test` và Redis DB 15. Ở mỗi lượt chạy, `test/global-setup.ts` xóa rồi tạo lại `exam_test`, chạy migration và xóa sạch Redis DB 15. Có hai lớp chặn: từ chối database có tên không kết thúc bằng `_test`, và từ chối Redis DB 0. Đổi đích bằng `TEST_DATABASE_URL` và `TEST_REDIS_URL`. Không dùng Testcontainers, vì vậy không cần bật Podman socket. Đã sửa architecture.md mục 3 và README.
- **Biome** thay cho ESLint + Prettier. Một công cụ lo cả lint lẫn format, chỉ áp dụng cho file code; Markdown giữ nguyên.
- **Định dạng module:** api biên dịch ra CommonJS (dùng SWC), còn NestJS 12 chỉ có ESM. `packages/*` là ESM, build bằng `tsc`. Node 24 cho phép `require()` gói ESM. Vitest test code NestJS qua `unplugin-swc` để giữ decorator metadata.
- **Chưa bật CodeQL.** Code scanning trên repo private cần GitHub Advanced Security (trả phí). Tạm thời chỉ dùng `pnpm audit --prod --audit-level high`.
- **Cổng PostgreSQL của `prod-exam`:** trước đây ghi `127.0.0.1:5433`, trùng với `devplotracker`. Đổi sang `127.0.0.1:5436` (đã sửa architecture.md mục 8); áp dụng khi làm lát cắt 6.
