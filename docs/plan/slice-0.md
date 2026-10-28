# Lát cắt 0: khung monorepo, hạ tầng dev/CI, pipeline

> Trạng thái: **proposed**. Code đã có trên nhánh `feat/slice-0` để duyệt cùng tài liệu này; chỉ merge sau khi chủ dự án đồng ý. Phần cấu trúc làm theo [architecture.md](../architecture.md) và các ADR đã duyệt. Những lựa chọn tài liệu chưa nói tới, hoặc lệch so với tài liệu, nằm ở mục [Quyết định cần duyệt](#quyết-định-cần-duyệt).

## Mục tiêu

Người mới clone repo chạy được các lệnh trong mục "Bắt đầu nhanh" của README. Mọi PR phải qua CI xanh. Lát cắt này chưa có nghiệp vụ.

## Đã làm

| Hạng mục | Nội dung |
|---|---|
| Monorepo | pnpm workspace: `apps/api`, `apps/web`, `packages/shared`, `packages/scoring`. Node 24, TypeScript 5.9 |
| api | NestJS 11 + Fastify. Env được kiểm tra bằng Zod (`src/config/env.ts`) và tự nạp `.env` nếu có. Log pino (che cookie, authorization). `GET /api/health` kiểm tra PostgreSQL và Redis, trả 200 khi cả hai chạy, 503 khi có thành phần lỗi |
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

Workflow chưa chạy thật trên GitHub.

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

## Quyết định cần duyệt

1. **Giữ NestJS 11.** npm đã có bản 12.x, nhưng tài liệu đã duyệt chốt bản 11. Nếu muốn nâng cấp thì viết ADR riêng.
2. **Ghi đè phiên bản fastify lên `^5.12.7`** (`overrides` trong `pnpm-workspace.yaml`). `@nestjs/platform-fastify` 11 ghim fastify 5.11.3, bản này dính lỗ hổng mức high GHSA-9q9j-q6p8-xq58. Đã chạy lại test với bản mới, vẫn xanh. Bỏ phần ghi đè khi NestJS cập nhật.
3. **Integration test chạy trên pod Podman, không dùng Testcontainers.** Mục 3 của architecture.md ghi Testcontainers, còn mục 9 ghi "integration (Podman: postgres + redis)". Đã chọn pod, giống plo-tracker: test đọc `DATABASE_URL` và `REDIS_URL`, trỏ vào `dev-exam` khi chạy trên máy và `ci-exam` khi chạy trên CI. Cách này không cần bật Podman socket. Nếu đồng ý, sửa mục 3.
4. **Worker nằm trong `apps/api`, không tách ra `apps/worker`.** Architecture.md vẽ `apps/worker` riêng nhưng lại ghi "dùng chung mã với api, cùng image, lệnh khởi động khác". Tách thư mục thì api phải xuất module dưới dạng một gói có khai báo kiểu, mà builder SWC của Nest không sinh file khai báo. Để chung một chỗ thì worker dùng thẳng các module nghiệp vụ, image chỉ cần đổi lệnh `node dist/worker/main.js`. Nếu đồng ý, sửa mục 10 của architecture.md và cây thư mục trong README.
5. **Biome** thay cho ESLint + Prettier. Một công cụ lo cả lint lẫn format, chỉ áp dụng cho file code; Markdown giữ nguyên.
6. **Định dạng module:** api biên dịch ra CommonJS (mặc định của NestJS, dùng SWC). `packages/*` là ESM, build bằng `tsc`. Node 24 cho phép `require()` gói ESM. Vitest test code NestJS qua `unplugin-swc` để giữ decorator metadata.
7. **Chưa bật CodeQL.** Architecture.md mục 9 có nhắc CodeQL, nhưng code scanning trên repo private cần GitHub Advanced Security (trả phí). Tạm thời chỉ dùng `pnpm audit --prod --audit-level high`.
8. **Cổng PostgreSQL của `prod-exam`:** architecture.md mục 8 ghi `127.0.0.1:5433`, trùng với `devplotracker`. Đề xuất đổi sang `127.0.0.1:5436`. Việc này thuộc lát cắt 6.
