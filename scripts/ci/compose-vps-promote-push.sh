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

REF_HELPER="$ROOT/scripts/ci/docker-registry-image-ref.sh"

mapfile -t local_imgs < <(bash scripts/ci/list-workspace-vps-images.sh)

for local_img in "${local_imgs[@]}"; do
  name="${local_img#workspace-}"
  name="${name%:vps}"
  for t in latest "$PROMOTED_TAG"; do
    target="$(bash "$REF_HELPER" "$DOCKER_REGISTRY_URL" "$name" "$t")"
    echo "push: $local_img -> $target"
    docker tag "$local_img" "$target"
    docker push "$target"
  done
done
