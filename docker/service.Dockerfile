# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=1
ENV HUSKY=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.26.0 --activate

FROM base AS build

WORKDIR /workspace

ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch --frozen-lockfile

COPY turbo.json tsconfig.base.json biome.json ./
COPY packages ./packages
COPY shared ./shared
COPY infra ./infra
COPY services ./services

RUN pnpm install --frozen-lockfile --offline --ignore-scripts

COPY scripts/prisma-generate.mjs scripts/service-registry.mjs ./scripts/

RUN --mount=type=cache,id=workspace-turbo-cache,target=/workspace/.turbo/cache \
  pnpm prisma:generate \
  && pnpm turbo run build --filter=@workspace/shared

ARG WORKSPACE_PACKAGE
ARG SERVICE_DIR

RUN --mount=type=cache,id=workspace-turbo-cache,target=/workspace/.turbo/cache \
  rm -rf "${SERVICE_DIR}/dist" "${SERVICE_DIR}/tsconfig.tsbuildinfo" \
  && pnpm turbo run build --filter="${WORKSPACE_PACKAGE}" --only
RUN npm_config_ignore_scripts=true pnpm --config.inject-workspace-packages=true \
  --filter "${WORKSPACE_PACKAGE}" deploy --prod /prod

FROM base AS runtime

ENV NODE_ENV=production

ARG SERVICE_DIR

WORKDIR /app/${SERVICE_DIR}

COPY --from=build --chown=node:node /prod ./

USER node
CMD ["node", "dist/server.js"]
