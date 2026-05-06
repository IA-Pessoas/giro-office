#!/usr/bin/env bash
# Puxa {REG}/{service}:{TAG} e reetiqueta para workspace-*:<WORKSPACE_VPS_IMAGE_TAG> apenas para serviços listados.
# VPS_PULL_SERVICES: lista separada por espaço (ex.: gateway user-service) ou ALL/vazio = todos.
# Obrigatório: DOCKER_REGISTRY_URL, DOCKER_IMAGE_TAG
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DOCKER_REGISTRY_URL:-}" || -z "${DOCKER_IMAGE_TAG:-}" ]]; then
  echo "::error::compose-vps-pull-by-tag-selective: DOCKER_REGISTRY_URL e DOCKER_IMAGE_TAG são obrigatórios" >&2
  exit 1
fi

REF_HELPER="$ROOT/scripts/ci/docker-registry-image-ref.sh"

should_pull() {
  local name="$1"
  local filter="${VPS_PULL_SERVICES:-}"
  if [[ -z "$filter" || "$filter" == "ALL" ]]; then
    return 0
  fi
  if [[ "$filter" == "NONE" ]]; then
    return 1
  fi
  local tok
  for tok in $filter; do
    if [[ "$tok" == "$name" ]]; then
      return 0
    fi
  done
  return 1
}

mapfile -t local_imgs < <(bash scripts/ci/list-workspace-vps-images.sh)

if [[ "${VPS_PULL_SERVICES:-}" == "NONE" ]]; then
  echo "VPS_PULL_SERVICES=NONE — sem pull de imagens workspace no registry"
  exit 0
fi

for local_img in "${local_imgs[@]}"; do
  name="${local_img#workspace-}"
  name="${name%:${WORKSPACE_VPS_IMAGE_TAG:-vps}}"
  if ! should_pull "$name"; then
    echo "skip pull (não selecionado): $local_img"
    continue
  fi
  remote="$(bash "$REF_HELPER" "$DOCKER_REGISTRY_URL" "$name" "${DOCKER_IMAGE_TAG}")"
  echo "::group::pull+tag: $local_img <- $remote"
  docker pull "$remote"
  docker tag "$remote" "$local_img"
  echo "::endgroup::"
done
