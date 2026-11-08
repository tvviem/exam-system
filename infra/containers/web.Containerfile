FROM docker.io/library/node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @exam/web... build

FROM docker.io/library/nginx:1.29-alpine
# api ghi file ảnh với quyền 0600 bằng uid 1000 (user `node`); nginx phải chạy worker cùng uid thì mới đọc được ảnh trên
# volume dùng chung, nếu không `/_media/` trả 403.
RUN adduser -D -u 1000 node && sed -i 's/^user .*/user node;/' /etc/nginx/nginx.conf
COPY infra/containers/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/containers/upstream.conf /etc/exam-nginx/upstream.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
