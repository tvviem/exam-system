# Image dùng chung cho api và worker; worker chạy với lệnh: node dist/worker/main.js
FROM docker.io/library/node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @exam/api... build \
 && pnpm --filter @exam/api deploy --prod --legacy /out

FROM docker.io/library/node:24-slim
ENV NODE_ENV=production
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
