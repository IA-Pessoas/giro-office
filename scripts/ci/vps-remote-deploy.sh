#!/usr/bin/env bash
# Executar na VPS (diretório do repositório = DEPLOY_PATH), após git checkout no commit e .env.vps.* atualizados.
# Variáveis: DEPLOY_SLOT (develop|staging|test-develop|test-staging), COMPOSE_PROJECT, DOCKER_IMAGE_TAG, DOCKER_REGISTRY_* ,
# VPS_PULL_SERVICES (ALL ou lista de nomes curtos gateway, user-service, …).
# WORKSPACE_VPS_IMAGE_TAG: sufixo local das imagens workspace-* na mesma VPS (omissão: vps). O deploy grava em `.env`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/ci/vps-deploy-scope.sh
. "$ROOT/scripts/ci/vps-deploy-scope.sh"
# shellcheck source=scripts/ci/vps-compose-args.sh
. "$ROOT/scripts/ci/vps-compose-args.sh"

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

# staging: base + runtime override → 8085 / 3010 / 3000 (web)
# develop: + slot-develop → 8086 / 3011 / 3001 (web)
# test-develop: + slot-test-develop → 8087 / 3013 / 3002 (web)
# test-staging: + slot-test-staging → 8086 / 3012 / 3003 (web)
vps_build_compose_args

export WORKSPACE_VPS_IMAGE_TAG="${WORKSPACE_VPS_IMAGE_TAG:-vps}"

persist_workspace_vps_image_tag() {
  local f=".env"
  local line="WORKSPACE_VPS_IMAGE_TAG=${WORKSPACE_VPS_IMAGE_TAG}"
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/workspace-vps-image-tag.XXXXXX")"
  if [[ -f "$f" ]]; then
    grep -v '^WORKSPACE_VPS_IMAGE_TAG=' "$f" >"$tmp" || true
  fi
  printf "%s\n" "$line" >>"$tmp"
  mv "$tmp" "$f"
}

persist_workspace_vps_image_tag

compose() {
  docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_ARGS[@]}" "$@"
}

export VPS_PULL_SERVICES="${VPS_PULL_SERVICES:-ALL}"
DEPLOY_MODE="$(vps_deploy_mode "$VPS_PULL_SERVICES")"

if [[ "$DEPLOY_MODE" == "skip" ]]; then
  log "VPS_PULL_SERVICES=NONE; pulando docker login, pull de imagens e compose up"
  mkdir -p "$ROOT/.deploy"
  printf "%s\n" "$DOCKER_IMAGE_TAG" >"$ROOT/.deploy/last-skip-tag"
  exit 0
fi

mapfile -t COMPOSE_SERVICE_ARGS < <(vps_compose_service_args "$VPS_PULL_SERVICES")

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

log "pull registry → workspace-*:${WORKSPACE_VPS_IMAGE_TAG} (VPS_PULL_SERVICES=$VPS_PULL_SERVICES)"
if [[ "$DEPLOY_MODE" == "full" ]]; then
  export VPS_PULL_MISSING_UNSELECTED=1
else
  export VPS_PULL_MISSING_UNSELECTED=0
fi
set +e
bash scripts/ci/compose-vps-pull-by-tag-selective.sh
pull_rc=$?
set -e
if [[ "$pull_rc" -ne 0 ]]; then
  log "pull de imagens falhou (rc=$pull_rc); rollback de tags locais"
  rollback_images "$IDS_FILE"
  dump_compose_logs
  echo "::error::pull de imagens falhou" >&2
  exit 1
fi

log "compose up -d (projeto=$COMPOSE_PROJECT; healthchecks contínuos desativados via runtime override)"
set +e
if [[ "${#COMPOSE_SERVICE_ARGS[@]}" -gt 0 ]]; then
  log "compose up seletivo: ${COMPOSE_SERVICE_ARGS[*]}"
  compose up -d --no-build "${COMPOSE_SERVICE_ARGS[@]}"
else
  log "compose up completo"
  compose up -d --no-build
fi
up_rc=$?
set -e

if [[ "$up_rc" -ne 0 ]]; then
  log "compose up falhou (rc=$up_rc); rollback e diagnóstico"
  rollback_images "$IDS_FILE"
  set +e
  if [[ "${#COMPOSE_SERVICE_ARGS[@]}" -gt 0 ]]; then
    compose up -d --no-build "${COMPOSE_SERVICE_ARGS[@]}" || true
  else
    compose up -d --no-build || true
  fi
  set -e
  dump_compose_logs
  echo "::error::deploy falhou na VPS; rollback tentado" >&2
  exit 1
fi

if [[ "${#COMPOSE_SERVICE_ARGS[@]}" -gt 0 ]]; then
  export VPS_WAIT_SERVICES="${COMPOSE_SERVICE_ARGS[*]}"
else
  export VPS_WAIT_SERVICES=""
fi
log "verificação pontual de endpoints (vps-wait-endpoints.sh)"
set +e
bash scripts/ci/vps-wait-endpoints.sh
wait_rc=$?
set -e

if [[ "$wait_rc" -ne 0 ]]; then
  log "verificação de endpoints falhou (rc=$wait_rc); rollback e diagnóstico"
  rollback_images "$IDS_FILE"
  set +e
  if [[ "${#COMPOSE_SERVICE_ARGS[@]}" -gt 0 ]]; then
    compose up -d --no-build "${COMPOSE_SERVICE_ARGS[@]}" || true
  else
    compose up -d --no-build || true
  fi
  set -e
  dump_compose_logs
  echo "::error::deploy falhou na VPS (endpoints); rollback tentado" >&2
  exit 1
fi

rm -f "$IDS_FILE"
printf "%s\n" "$DOCKER_IMAGE_TAG" >"$ROOT/.deploy/last-good-tag"
log "deploy OK; last-good-tag=$DOCKER_IMAGE_TAG"
exit 0
