# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo

# --- install workspace deps (cached by lockfile + manifests) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN pnpm install --frozen-lockfile --filter @pantry/backend...

# --- build shared then backend ---
FROM deps AS build
COPY packages/shared packages/shared
COPY packages/backend packages/backend
RUN pnpm --filter @pantry/shared build \
 && pnpm --filter @pantry/backend build

# --- runtime: re-install prod-only deps, then copy dist ---
FROM base AS runtime
WORKDIR /app
COPY --from=build /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/backend/package.json packages/backend/package.json
RUN pnpm install --frozen-lockfile --prod --filter @pantry/backend...
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/backend/dist packages/backend/dist
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
WORKDIR /app/packages/backend
CMD ["node", "dist/index.js"]
