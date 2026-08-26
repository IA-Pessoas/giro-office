#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_ROOT="${DEPLOY_ENV_ROOT:-$ROOT}"
PROJECT="${COMPOSE_PROJECT_NAME:-giro-office-production}"
MANIFEST="$ROOT/scripts/ci/vps-secrets.manifest"
export WORKSPACE_VPS_IMAGE_TAG="${WORKSPACE_VPS_IMAGE_TAG:-production}"

COMPOSE=(
  docker compose
  -p "$PROJECT"
  -f "$ROOT/docker-compose.vps.yml"
  -f "$ROOT/docker-compose.production.yml"
)

phase() {
  printf '%s\n' "$1"
}

if [[ "${DEPLOY_DRY_RUN:-0}" == "1" ]]; then
  phase validate-env
  phase database-pool-budget
  phase compose-config
  phase build-images-sequentially
  phase database-migrate
  phase compose-up
  phase wait-endpoints
  exit 0
fi

phase validate-env
while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line="${raw_line#"${raw_line%%[![:space:]]*}"}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  relative_file="${line#*|}"
  env_file="$ENV_ROOT/$relative_file"
  if [[ ! -f "$env_file" ]]; then
    echo "missing required production env file: $relative_file" >&2
    exit 1
  fi
  if [[ "$(stat -c '%a' "$env_file")" != "600" ]]; then
    echo "production env file must use mode 600: $relative_file" >&2
    exit 1
  fi
done <"$MANIFEST"

phase database-pool-budget
node "$ROOT/scripts/ops/validate-database-pool-budget.mjs" "$ENV_ROOT"

if [[ "$ENV_ROOT" != "$ROOT" ]]; then
  echo "DEPLOY_ENV_ROOT diferente do checkout só é permitido em dry-run." >&2
  exit 1
fi

# `env_file` configura o container, mas args NEXT_PUBLIC_* precisam estar no ambiente do Compose
# durante o build da imagem Next.js.
# shellcheck source=scripts/ops/load-production-web-env.sh
source "$ROOT/scripts/ops/load-production-web-env.sh" "$ROOT/.env.vps.web"

phase compose-config
"${COMPOSE[@]}" config --quiet

mkdir -p "$ROOT/.deploy"
rollback_file="$ROOT/.deploy/production-image-tags-before.txt"
rollback_suffix="$(date -u +%Y%m%dT%H%M%SZ)-$$"
: >"$rollback_file"
while IFS= read -r image; do
  [[ "$image" != workspace-* ]] && continue
  image_id="$(docker image inspect "$image" --format '{{.Id}}' 2>/dev/null || true)"
  backup_image=""
  if [[ -n "$image_id" ]]; then
    backup_image="${image%:*}:rollback-${rollback_suffix}"
    docker image tag "$image" "$backup_image"
  fi
  printf '%s|%s|%s\n' "$image" "$backup_image" "$image_id" >>"$rollback_file"
done < <("${COMPOSE[@]}" config --images | sort -u)

restore_images() {
  while IFS='|' read -r image backup_image image_id; do
    [[ -z "$backup_image" || -z "$image_id" ]] && continue
    docker image tag "$backup_image" "$image" >/dev/null 2>&1 || true
  done <"$rollback_file"
}

cleanup_rollback_images() {
  while IFS='|' read -r image backup_image image_id; do
    [[ -z "$backup_image" || -z "$image_id" ]] && continue
    docker image rm "$backup_image" >/dev/null 2>&1 || true
  done <"$rollback_file"
}

services=(
  organization-service user-service department-service task-service project-service
  client-service fiscal-service contabil-service regularize-service rh-service ti-service
  certificate-service pessoal-service parcelamento-service reports-service audit-service gateway web
)

phase build-images-sequentially
for service in "${services[@]}"; do
  if ! "${COMPOSE[@]}" build "$service"; then
    restore_images
    exit 1
  fi
done

phase database-migrate
database_url="$(sed -n 's/^DATABASE_URL=//p' "$ROOT/.env.vps.organization-service" | tail -n 1)"
database_url="${database_url%\"}"
database_url="${database_url#\"}"
if [[ -z "$database_url" ]]; then
  echo "DATABASE_URL ausente em .env.vps.organization-service" >&2
  restore_images
  exit 1
fi
if ! DATABASE_URL="$database_url" corepack pnpm --filter @workspace/infra exec prisma migrate deploy; then
  restore_images
  exit 1
fi

phase compose-up
if ! "${COMPOSE[@]}" up -d --no-build --remove-orphans; then
  restore_images
  "${COMPOSE[@]}" up -d --no-build --remove-orphans || true
  exit 1
fi

phase wait-endpoints
if ! COMPOSE_PROJECT_NAME="$PROJECT" bash "$ROOT/scripts/ops/wait-production-endpoints.sh"; then
  restore_images
  "${COMPOSE[@]}" up -d --no-build --remove-orphans || true
  exit 1
fi

git -C "$ROOT" rev-parse HEAD >"$ROOT/.deploy/production-last-good-commit"
cleanup_rollback_images
rm -f "$rollback_file"
echo "Deploy de produção concluído."
