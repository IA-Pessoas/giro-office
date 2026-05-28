#!/usr/bin/env bash
# Gera /tmp/workspace-vps-images.tar com todas as imagens `workspace-*:<WORKSPACE_VPS_IMAGE_TAG>` atuais
# (para outro job do GHA fazer `docker load`).
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="${COMPOSE_VPS_TAR_PATH:-/tmp/workspace-vps-images.tar}"

images=()
while IFS= read -r image || [[ -n "$image" ]]; do
  images+=("$image")
done < <(bash scripts/ci/list-workspace-vps-images.sh)
if [[ "${#images[@]}" -eq 0 ]]; then
  echo "::error::Nenhuma imagem workspace para salvar" >&2
  exit 1
fi
docker save "${images[@]}" -o "$OUT"
ls -la "$OUT"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "tar_path=$OUT" >> "$GITHUB_OUTPUT"
fi
