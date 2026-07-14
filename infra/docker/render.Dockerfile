FROM node:22-alpine

WORKDIR /app
RUN corepack enable && apk add --no-cache nginx supervisor

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm -r build

COPY infra/nginx/nginx.render.conf /etc/nginx/http.d/default.conf
COPY infra/render/supervisord.conf /etc/supervisord.conf

ENV NODE_ENV=production
EXPOSE 10000
CMD ["supervisord", "-c", "/etc/supervisord.conf"]

