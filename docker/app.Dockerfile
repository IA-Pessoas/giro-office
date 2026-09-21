# syntax=docker/dockerfile:1.7
# Next.js (app/) — UI na porta 3000.
# Build args: NEXT_PUBLIC_API_URL (browser), API_INTERNAL_URL (SSR → gateway) and optional
# client-side feature flag settings. Never pass a server-side LaunchDarkly SDK key here.
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=1
ENV HUSKY=0
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.26.0 --activate

FROM base AS build

WORKDIR /workspace

ARG NEXT_PUBLIC_API_URL=/api
ARG API_INTERNAL_URL=http://gateway:3010
ARG DEPLOY_SLOT=production
ARG NEXT_PUBLIC_FEATURE_FLAGS_ENABLED=false
ARG NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_ID=
ARG NEXT_PUBLIC_LAUNCHDARKLY_INIT_TIMEOUT_MS=3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV DEPLOY_SLOT=$DEPLOY_SLOT
ENV NEXT_PUBLIC_FEATURE_FLAGS_ENABLED=$NEXT_PUBLIC_FEATURE_FLAGS_ENABLED
ENV NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_ID=$NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_ID
ENV NEXT_PUBLIC_LAUNCHDARKLY_INIT_TIMEOUT_MS=$NEXT_PUBLIC_LAUNCHDARKLY_INIT_TIMEOUT_MS

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/api/package.json ./packages/api/package.json
COPY app/package.json ./app/package.json
COPY shared/package.json ./shared/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY turbo.json tsconfig.base.json biome.json ./
COPY packages/api ./packages/api
COPY app ./app
COPY shared ./shared

RUN --mount=type=cache,id=workspace-next-cache,target=/workspace/app/.next/cache \
  pnpm turbo run build --filter=@workspace/app

FROM base AS runner

WORKDIR /workspace

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /workspace/app/.next/standalone ./
COPY --from=build --chown=node:node /workspace/app/.next/static ./app/.next/static
COPY --from=build --chown=node:node /workspace/app/public ./app/public

USER node
WORKDIR /workspace/app

EXPOSE 3000

CMD ["node", "server.js"]
