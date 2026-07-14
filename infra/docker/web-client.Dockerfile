FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/shared-types/src ./packages/shared-types/src
COPY apps/web-client/package.json apps/web-client/tsconfig.json apps/web-client/vite.config.ts apps/web-client/index.html ./apps/web-client/
COPY apps/web-client/src ./apps/web-client/src
RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm --filter @aetherion/web-client build

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl && mkdir -p /etc/nginx/certs && \
    openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
      -keyout /etc/nginx/certs/aetherion.key \
      -out /etc/nginx/certs/aetherion.crt \
      -subj "/CN=localhost"
COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-client/dist /usr/share/nginx/html
