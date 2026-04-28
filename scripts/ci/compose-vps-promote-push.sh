#!/usr/bin/env bash
# Etiqueta workspace-*:vps como {REG}/{short}:latest e {REG}/{short}:PROMOTED_TAG e faz push.
# Obrigatório: DOCKER_REGISTRY_URL, PROMOTED_TAG
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DOCKER_REGISTRY_URL:-}" || -z "${PROMOTED_TAG:-}" ]]; then
  echo "::error::compose-vps-promote-push: necessita DOCKER_REGISTRY_URL e PROMOTED_TAG" >&2
  exit 1
fi

REG="${DOCKER_REGISTRY_URL#https://}"
REG="${REG#http://}"
REG="${REG%/}"

mapfile -t local_imgs < <(bash scripts/ci/list-workspace-vps-images.sh)

for local_img in "${local_imgs[@]}"; do
  name="${local_img#workspace-}"
  name="${name%:vps}"
  for t in latest "$PROMOTED_TAG"; do
    target="${REG}/${name}:${t}"
    echo "push: $local_img -> $target"
    docker tag "$local_img" "$target"
    docker push "$target"
  done
done
