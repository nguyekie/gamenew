FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api-server/package.json apps/api-server/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile=false
COPY apps/api-server apps/api-server
COPY packages/shared-types packages/shared-types
RUN pnpm --filter @aetherion/shared-types build && pnpm --filter @aetherion/api-server build
EXPOSE 3000
CMD ["node", "apps/api-server/dist/index.js"]
