#!/usr/bin/env bash
# Publica imagens workspace-*:<WORKSPACE_VPS_IMAGE_TAG> no registry com uma tag (ex.: sha do commit do CI = $STAGING_DOCKER_TAG).
# Referências são normalizadas em minúsculas (evita "name invalid" em GHCR / Docker Hub com owner em maiúsculas).
# O `main` pode fazer `pull` dessa tag. Obrigatório: DOCKER_REGISTRY_URL, STAGING_DOCKER_TAG
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DOCKER_REGISTRY_URL:-}" || -z "${STAGING_DOCKER_TAG:-}" ]]; then
  echo "::error::compose-vps-staging-push: defina DOCKER_REGISTRY_URL e STAGING_DOCKER_TAG" >&2
  exit 1
fi

if [[ "${VPS_PUSH_SERVICES:-}" == "NONE" ]]; then
  echo "VPS_PUSH_SERVICES=NONE — sem push para o registry"
  exit 0
fi

REF_HELPER="$ROOT/scripts/ci/docker-registry-image-ref.sh"

local_imgs=()
while IFS= read -r local_img || [[ -n "$local_img" ]]; do
  local_imgs+=("$local_img")
done < <(bash scripts/ci/list-workspace-vps-images.sh)

should_push() {
  local name="$1"
  local filter="${VPS_PUSH_SERVICES:-}"
  if [[ -z "$filter" || "$filter" == "ALL" ]]; then
    return 0
  fi
  local tok
  for tok in $filter; do
    if [[ "$tok" == "$name" ]]; then
      return 0
    fi
  done
  return 1
}

for local_img in "${local_imgs[@]}"; do
  name="${local_img#workspace-}"
  name="${name%:${WORKSPACE_VPS_IMAGE_TAG:-vps}}"
  if ! should_push "$name"; then
    echo "skip push (não selecionado): $local_img"
    continue
  fi
  target="$(bash "$REF_HELPER" "$DOCKER_REGISTRY_URL" "$name" "$STAGING_DOCKER_TAG")"
  echo "push: $local_img -> $target"
  docker tag "$local_img" "$target"
  docker push "$target"
done
