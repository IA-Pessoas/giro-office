# syntax=docker/dockerfile:1.7
# Next.js (app/) — UI na porta 3000.
# Build args: NEXT_PUBLIC_API_URL (browser), NEXT_PUBLIC_ENABLE_SOCKET, API_INTERNAL_URL (SSR → gateway).
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=1
ENV HUSKY=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS build

WORKDIR /workspace

ARG NEXT_PUBLIC_API_URL=http://localhost:3010
ARG NEXT_PUBLIC_AUTH_COOKIE_SECURE=
ARG NEXT_PUBLIC_ENABLE_SOCKET=false
ARG NEXT_PUBLIC_SOCKET_URL=
ARG API_INTERNAL_URL=http://gateway:3010
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_COOKIE_SECURE=$NEXT_PUBLIC_AUTH_COOKIE_SECURE
ENV NEXT_PUBLIC_ENABLE_SOCKET=$NEXT_PUBLIC_ENABLE_SOCKET
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json biome.json .npmrc ./
COPY packages/api ./packages/api
COPY app ./app

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@workspace/app
RUN rm -rf node_modules \
  && npm_config_ignore_scripts=true pnpm install --frozen-lockfile --prod --filter "@workspace/app..."

FROM base AS runner

WORKDIR /workspace

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages/api ./packages/api
COPY --from=build /workspace/app ./app

WORKDIR /workspace/app

EXPOSE 3000

CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
