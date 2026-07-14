FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/game-server/package.json apps/game-server/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile=false
COPY apps/game-server apps/game-server
COPY packages/shared-types packages/shared-types
RUN pnpm --filter @aetherion/shared-types build && pnpm --filter @aetherion/game-server build
EXPOSE 3001
CMD ["node", "apps/game-server/dist/index.js"]
