#!/usr/bin/env bash
# Constrói referência completa image:tag para push/pull (Docker Hub / GHCR exigem path em minúsculas).
# Uso: docker-registry-image-ref.sh <DOCKER_REGISTRY_URL> <nome-curto-ex-gateway> <tag>
set -euo pipefail
if [[ "$#" -ne 3 ]]; then
  echo "uso: $0 DOCKER_REGISTRY_URL short_name tag" >&2
  exit 1
fi
REG="${1#https://}"
REG="${REG#http://}"
REG="${REG%/}"
REG=$(printf "%s" "$REG" | tr "[:upper:]" "[:lower:]")
short=$(printf "%s" "$2" | tr "[:upper:]" "[:lower:]")
printf "%s/%s:%s" "$REG" "$short" "$3"
