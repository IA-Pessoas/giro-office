#!/usr/bin/env bash
# Sobe a stack local para DAST (sem rebuild): materializa env, login opcional,
# pull ou TAR, compose up, porta do reverse-proxy → GITHUB_OUTPUT dast_url.
#
# Env obrigatório:
#   DAST_COMPOSE_PROJECT   ex.: workspace-dast
#   HAS_REGISTRY           true|false (imagem veio do promote via registry?)
#   DOCKER_IMAGE_TAG       tag promovida (pull)
# Opcional:
#   DOCKER_REGISTRY_URL, DOCKER_REGISTRY_USERNAME, DOCKER_REGISTRY_PASSWORD
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DAST_COMPOSE_PROJECT:-}" ]]; then
  echo "::error::DAST_COMPOSE_PROJECT é obrigatório" >&2
  exit 1
fi

bash scripts/ci/materialize-vps-env.sh

if [[ "${HAS_REGISTRY:-}" == "true" || "${HAS_REGISTRY:-}" == true ]]; then
  if [[ -z "${DOCKER_REGISTRY_URL:-}" || -z "${DOCKER_IMAGE_TAG:-}" ]]; then
    echo "::error::Com HAS_REGISTRY=true defina DOCKER_REGISTRY_URL e DOCKER_IMAGE_TAG" >&2
    exit 1
  fi
  if [[ -z "${DOCKER_REGISTRY_USERNAME:-}" || -z "${DOCKER_REGISTRY_PASSWORD:-}" ]]; then
    echo "::error::Credenciais do registry obrigatórias para pull" >&2
    exit 1
  fi
  REG="${DOCKER_REGISTRY_URL#https://}"
  REG="${REG#http://}"
  REG="${REG%/}"
  LOGIN_HOST="$REG"
  if [[ "$LOGIN_HOST" == */* ]]; then
    LOGIN_HOST="${LOGIN_HOST%%/*}"
  fi
  echo "$DOCKER_REGISTRY_PASSWORD" | docker login "$LOGIN_HOST" -u "$DOCKER_REGISTRY_USERNAME" --password-stdin
  export DOCKER_IMAGE_TAG
  export DOCKER_REGISTRY_URL
  bash scripts/ci/compose-vps-pull-by-tag.sh
else
  TAR=$(find . -maxdepth 3 -name 'workspace-vps-images.tar' -type f 2>/dev/null | head -1)
  if [[ -z "$TAR" ]]; then
    echo "::error::Não foi encontrado workspace-vps-images.tar (use download-artifact antes deste script)."
    find . -maxdepth 4 -type f 2>/dev/null | head -n 50 || true
    exit 1
  fi
  echo "::notice::Carregando $TAR"
  docker load -i "$TAR"
fi

export DOCKER_BUILDKIT=1
docker compose -p "$DAST_COMPOSE_PROJECT" -f docker-compose.vps.yml up -d --wait --wait-timeout 900 --no-build

port=$(docker compose -p "$DAST_COMPOSE_PROJECT" -f docker-compose.vps.yml port reverse-proxy 80 2>/dev/null | awk -F: '{print $NF}')
if [[ -z "$port" ]]; then
  echo "::error::Porta do reverse-proxy não encontrada" >&2
  exit 1
fi
echo "dast_url=http://127.0.0.1:${port}" >> "$GITHUB_OUTPUT"
echo "url=http://127.0.0.1:${port}"
