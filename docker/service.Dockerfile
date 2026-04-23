# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=1
ENV HUSKY=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

FROM base AS build

WORKDIR /workspace

ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json biome.json .npmrc ./
COPY packages ./packages
COPY shared ./shared
COPY infra ./infra
COPY services ./services
COPY scripts ./scripts

ARG WORKSPACE_PACKAGE
ARG SERVICE_DIR

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter="${WORKSPACE_PACKAGE}"
# Só dependências de produção na camada copiada para runtime (menos CVEs no Trivy — ex.: picomatch via vitest/vite).
# --ignore-scripts: evita `prepare` (husky) após remover devDeps — senão `husky: not found`.
RUN pnpm prune --prod --ignore-scripts

FROM base AS runtime

ENV NODE_ENV=production

ARG SERVICE_DIR

WORKDIR /app/${SERVICE_DIR}

COPY --from=build /workspace/package.json /app/package.json
COPY --from=build /workspace/node_modules /app/node_modules
COPY --from=build /workspace/shared /app/shared
COPY --from=build /workspace/${SERVICE_DIR} /app/${SERVICE_DIR}

CMD ["node", "dist/server.js"]
