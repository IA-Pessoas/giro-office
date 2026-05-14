#!/usr/bin/env bash
# Constrói referência completa image:tag para push/pull (Docker Hub / GHCR exigem path em minúsculas).
# Uso: docker-registry-image-ref.sh <DOCKER_REGISTRY_URL> <nome-curto-ex-gateway> <tag>
set -euo pipefail
if [[ "$#" -ne 3 ]]; then
  echo "uso: $0 DOCKER_REGISTRY_URL short_name tag" >&2
  exit 1
fi

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf "%s" "$s"
}

raw="$(trim "$1")"
raw="${raw#https://}"
raw="${raw#http://}"
raw="${raw%/}"
REG=$(printf "%s" "$raw" | tr "[:upper:]" "[:lower:]")

if [[ "$REG" != */* ]]; then
  echo "::error::DOCKER_REGISTRY_URL precisa incluir o namespace após o host (ex.: ghcr.io/meu-org ou docker.io/meuuser). Só \"${REG%%/*}\" não gera um repositório válido e o registry devolve \"name invalid\"." >&2
  exit 1
fi

short=$(printf "%s" "$(trim "$2")" | tr "[:upper:]" "[:lower:]")
tag="$(trim "$3")"

if [[ ! "$short" =~ ^[a-z0-9]+([-_.][a-z0-9]+)*$ ]]; then
  echo "::error::nome curto de imagem inválido (após normalização): $short" >&2
  exit 1
fi

if [[ "$tag" == *:* || "$tag" == */* ]]; then
  echo "::error::tag de imagem inválida (não use ':' nem '/' na tag): $tag" >&2
  exit 1
fi

printf "%s/%s:%s" "$REG" "$short" "$tag"
