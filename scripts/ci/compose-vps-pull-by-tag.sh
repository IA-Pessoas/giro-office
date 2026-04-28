#!/usr/bin/env bash
# Puxa {REG}/{service}:{TAG} e reetiqueta para workspace-*:vps.
# Obrigatório: DOCKER_REGISTRY_URL, DOCKER_IMAGE_TAG
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DOCKER_REGISTRY_URL:-}" || -z "${DOCKER_IMAGE_TAG:-}" ]]; then
  echo "::error::compose-vps-pull-by-tag: necessita DOCKER_REGISTRY_URL e DOCKER_IMAGE_TAG" >&2
  exit 1
fi

REG="${DOCKER_REGISTRY_URL#https://}"
REG="${REG#http://}"
REG="${REG%/}"

mapfile -t local_imgs < <(bash scripts/ci/list-workspace-vps-images.sh)

for local_img in "${local_imgs[@]}"; do
  name="${local_img#workspace-}"
  name="${name%:vps}"
  remote="${REG}/${name}:${DOCKER_IMAGE_TAG}"
  echo "::group::pull+tag: $local_img <- $remote"
  docker pull "$remote"
  docker tag "$remote" "$local_img"
  echo "::endgroup::"
done
