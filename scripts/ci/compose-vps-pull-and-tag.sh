#!/usr/bin/env bash
# Puxa imagens do registry no formato {REG}/{service}:{SOURCE_TAG} e reetiqueta para o nome
# esperado por docker-compose.vps.yml (ex.: workspace-gateway:<WORKSPACE_VPS_IMAGE_TAG>).
#
# Obrigatório: DOCKER_REGISTRY_URL, DOCKER_STAGING_RESOLVED_TAG
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DOCKER_REGISTRY_URL:-}" ]]; then
  echo "::error::compose-vps-pull-and-tag: DOCKER_REGISTRY_URL é obrigatório"
  exit 1
fi
if [[ -z "${DOCKER_STAGING_RESOLVED_TAG:-}" ]]; then
  echo "::error::compose-vps-pull-and-tag: DOCKER_STAGING_RESOLVED_TAG é obrigatório"
  exit 1
fi

REF_HELPER="$ROOT/scripts/ci/docker-registry-image-ref.sh"

list_images() {
  bash scripts/ci/list-workspace-vps-images.sh
}

if ! head -1 < <(list_images) &>/dev/null; then
  list_images
  echo "::error::Nenhuma imagem workspace listada" >&2
  exit 1
fi

local_imgs=()
while IFS= read -r local_img || [[ -n "$local_img" ]]; do
  local_imgs+=("$local_img")
done < <(list_images)

for local_img in "${local_imgs[@]}"; do
  # workspace-foo-service:<tag> -> foo-service
  name="${local_img#workspace-}"
  name="${name%:${WORKSPACE_VPS_IMAGE_TAG:-vps}}"
  remote="$(bash "$REF_HELPER" "$DOCKER_REGISTRY_URL" "$name" "${DOCKER_STAGING_RESOLVED_TAG}")"
  echo "::group::pull+tag: $local_img <- $remote"
  docker pull "$remote"
  docker tag "$remote" "$local_img"
  echo "::endgroup::"
done
