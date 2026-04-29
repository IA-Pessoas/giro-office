#!/usr/bin/env bash
# Executar na VPS (diretório do repositório = DEPLOY_PATH), após git checkout no commit e .env.vps.* atualizados.
# Variáveis: DEPLOY_SLOT (develop|staging|test-develop|test-staging), COMPOSE_PROJECT, DOCKER_IMAGE_TAG, DOCKER_REGISTRY_* ,
# VPS_PULL_SERVICES (ALL ou lista de nomes curtos gateway, user-service, …).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

log() {
  printf "\n>>> %s\n" "$*" >&2
}

dump_compose_logs() {
  log "docker compose ps -a"
  compose ps -a >&2 || true
  log "docker compose logs --tail=200"
  compose logs --tail=200 >&2 || true
}

if [[ -z "${DEPLOY_SLOT:-}" || -z "${COMPOSE_PROJECT:-}" || -z "${DOCKER_IMAGE_TAG:-}" ]]; then
  echo "::error::vps-remote-deploy: defina DEPLOY_SLOT, COMPOSE_PROJECT, DOCKER_IMAGE_TAG" >&2
  exit 1
fi

if [[ -z "${DOCKER_REGISTRY_URL:-}" || -z "${DOCKER_REGISTRY_USERNAME:-}" || -z "${DOCKER_REGISTRY_PASSWORD:-}" ]]; then
  echo "::error::vps-remote-deploy: defina DOCKER_REGISTRY_URL, DOCKER_REGISTRY_USERNAME, DOCKER_REGISTRY_PASSWORD" >&2
  exit 1
fi

COMPOSE_ARGS=( -f docker-compose.vps.yml )
# staging: só base → 8085 / 3010
# develop: + slot-develop → 8086 / 3011
# test-develop: + slot-test-develop → 8087 / 3013
# test-staging: + slot-test-staging → 8086 / 3012
case "${DEPLOY_SLOT:-}" in
  develop)
    SLOT_OVERRIDE="docker-compose.vps.slot-develop.yml"
    if [[ ! -f "$SLOT_OVERRIDE" ]]; then
      echo "::error::$SLOT_OVERRIDE não encontrado (override develop)" >&2
      exit 1
    fi
    COMPOSE_ARGS+=( -f "$SLOT_OVERRIDE" )
    ;;
  test-develop)
    SLOT_OVERRIDE="docker-compose.vps.slot-test-develop.yml"
    if [[ ! -f "$SLOT_OVERRIDE" ]]; then
      echo "::error::$SLOT_OVERRIDE não encontrado (override test-develop)" >&2
      exit 1
    fi
    COMPOSE_ARGS+=( -f "$SLOT_OVERRIDE" )
    ;;
  test-staging)
    SLOT_OVERRIDE="docker-compose.vps.slot-test-staging.yml"
    if [[ ! -f "$SLOT_OVERRIDE" ]]; then
      echo "::error::$SLOT_OVERRIDE não encontrado (override test-staging)" >&2
      exit 1
    fi
    COMPOSE_ARGS+=( -f "$SLOT_OVERRIDE" )
    ;;
  staging)
    ;;
  *)
    echo "::error::vps-remote-deploy: DEPLOY_SLOT inválido: ${DEPLOY_SLOT:-}(esperado develop, staging, test-develop ou test-staging)" >&2
    exit 1
    ;;
esac

compose() {
  docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_ARGS[@]}" "$@"
}

REG_LOGIN="${DOCKER_REGISTRY_URL#https://}"
REG_LOGIN="${REG_LOGIN#http://}"
REG_LOGIN="${REG_LOGIN%%/*}"

rollback_images() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    log "Sem ficheiro de rollback: $file"
    return 0
  fi
  log "Rollback de imagens a partir de $file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    local img id
    img="${line%%|*}"
    id="${line#*|}"
    if [[ -z "$id" || "$id" == "<no value>" ]]; then
      continue
    fi
    if docker inspect "$id" >/dev/null 2>&1; then
      docker tag "$id" "$img" || true
      log "reetiquetado $img <- $id"
    else
      log "imagem antiga indisponível (camadas removidas?): $img"
    fi
  done <"$file"
}

IDS_FILE="$ROOT/.deploy/image-ids-before-${DOCKER_IMAGE_TAG}.txt"
mkdir -p "$ROOT/.deploy"
rm -f "$IDS_FILE"
touch "$IDS_FILE"
mapfile -t local_imgs < <(bash scripts/ci/list-workspace-vps-images.sh)
for local_img in "${local_imgs[@]}"; do
  id="$(docker image inspect "$local_img" -f '{{.Id}}' 2>/dev/null || true)"
  echo "${local_img}|${id:-}" >>"$IDS_FILE"
  log "guardado: ${local_img}|${id:-}"
done

set +e
printf "%s" "$DOCKER_REGISTRY_PASSWORD" | docker login "$REG_LOGIN" -u "$DOCKER_REGISTRY_USERNAME" --password-stdin
login_rc=$?
set -e
if [[ "$login_rc" -ne 0 ]]; then
  echo "::error::docker login falhou no registry" >&2
  exit 1
fi

export VPS_PULL_SERVICES="${VPS_PULL_SERVICES:-ALL}"
if [[ "$VPS_PULL_SERVICES" == "NONE" ]] && ! docker image inspect workspace-gateway:vps >/dev/null 2>&1; then
  log "sem imagem workspace local; forçando pull completo (ALL)"
  VPS_PULL_SERVICES=ALL
  export VPS_PULL_SERVICES
fi
log "pull registry → workspace-*:vps (VPS_PULL_SERVICES=$VPS_PULL_SERVICES)"
set +e
bash scripts/ci/compose-vps-pull-by-tag-selective.sh
pull_rc=$?
set -e
if [[ "$pull_rc" -ne 0 ]]; then
  dump_compose_logs
  echo "::error::pull de imagens falhou" >&2
  exit 1
fi

log "compose up -d --wait (projeto=$COMPOSE_PROJECT)"
set +e
compose up -d --wait --wait-timeout 900 --no-build
up_rc=$?
set -e

if [[ "$up_rc" -ne 0 ]]; then
  log "compose up falhou (rc=$up_rc); rollback e diagnóstico"
  rollback_images "$IDS_FILE"
  set +e
  compose up -d --wait --wait-timeout 300 --no-build || true
  set -e
  dump_compose_logs
  echo "::error::deploy falhou na VPS; rollback tentado" >&2
  exit 1
fi

rm -f "$IDS_FILE"
printf "%s\n" "$DOCKER_IMAGE_TAG" >"$ROOT/.deploy/last-good-tag"
log "deploy OK; last-good-tag=$DOCKER_IMAGE_TAG"
exit 0
