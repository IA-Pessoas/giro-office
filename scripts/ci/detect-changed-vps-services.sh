#!/usr/bin/env bash
# Compara dois SHAs e lista nomes de serviços Compose em docker-compose.vps.yml afetados.
# Saída (stdout): uma linha — "ALL", "NONE" (sem impacto em imagens VPS) ou nomes separados por espaço.
# "NONE": só alterações em paths de tooling/docs (.agent, .cursor, .husky, vscode, .vscode, docs).
# Uso: detect-changed-vps-services.sh <before_sha> <after_sha>
# GitHub: antes pode ser 0000... no primeiro push — nesse caso emite ALL.
set -euo pipefail

BEFORE="${1:-}"
AFTER="${2:-HEAD}"

# Caminhos que não devem forçar build/pull/deploy de imagens workspace na VPS.
vps_irrelevant_path() {
  case "$1" in
    .agent | .agent/* | .cursor | .cursor/* | .husky | .husky/* | \
      vscode | vscode/* | .vscode | .vscode/* | docs | docs/* )
      return 0
      ;;
  esac
  return 1
}

if [[ -z "$BEFORE" || "$BEFORE" == "0000000000000000000000000000000000000000" ]]; then
  printf "%s\n" "ALL"
  exit 0
fi

if ! git rev-parse --verify "$BEFORE^{commit}" >/dev/null 2>&1; then
  printf "%s\n" "ALL"
  exit 0
fi

if ! git rev-parse --verify "$AFTER^{commit}" >/dev/null 2>&1; then
  echo "::error::detect-changed-vps-services: SHA inválido: $AFTER" >&2
  exit 1
fi

files=()
while IFS= read -r file || [[ -n "$file" ]]; do
  files+=("$file")
done < <(git diff --name-only "$BEFORE" "$AFTER" 2>/dev/null || true)

if [[ "${#files[@]}" -eq 0 ]]; then
  printf "%s\n" "ALL"
  exit 0
fi

declare -a relevant=()
for f in "${files[@]}"; do
  if ! vps_irrelevant_path "$f"; then
    relevant+=("$f")
  fi
done
if [[ "${#relevant[@]}" -eq 0 ]]; then
  printf "%s\n" "NONE"
  exit 0
fi
files=("${relevant[@]}")

services=()

mark_all() {
  printf "%s\n" "ALL"
  exit 0
}

add_service() {
  local service="$1"
  local existing
  if [[ "${#services[@]}" -gt 0 ]]; then
    for existing in "${services[@]}"; do
      if [[ "$existing" == "$service" ]]; then
        return 0
      fi
    done
  fi
  services+=("$service")
}

for f in "${files[@]}"; do
  if [[ "$f" == shared/* ]]; then
    mark_all
  fi
  if [[ "$f" == docker/nginx/* ]]; then
    add_service reverse-proxy
    continue
  fi
  case "$f" in
    package.json | pnpm-lock.yaml | pnpm-workspace.yaml | turbo.json | \
    docker/service.Dockerfile | docker/app.Dockerfile | docker-compose.vps.yml | tsconfig.json | biome.json )
      mark_all
      ;;
    .github/workflows/* )
      mark_all
      ;;
  esac
  case "$f" in
    services/gateway/* )
      add_service gateway
      ;;
    services/organization-service/* )
      add_service organization-service
      ;;
    services/user-service/* )
      add_service user-service
      ;;
    services/task-service/* )
      add_service task-service
      ;;
    services/project-service/* )
      add_service project-service
      ;;
    services/client-service/* )
      add_service client-service
      ;;
    services/department-service/* )
      add_service department-service
      ;;
    services/fiscal-service/* )
      add_service fiscal-service
      ;;
    services/contabil-service/* )
      add_service contabil-service
      ;;
    services/regularize-service/* )
      add_service regularize-service
      ;;
    services/rh-service/* )
      add_service rh-service
      ;;
    services/certificate-service/* )
      add_service certificate-service
      ;;
    services/pessoal-service/* )
      add_service pessoal-service
      ;;
    services/parcelamento-service/* )
      add_service parcelamento-service
      ;;
    services/reports-service/* )
      add_service reports-service
      ;;
    services/audit-service/* )
      add_service audit-service
      ;;
    app/* )
      add_service web
      ;;
    packages/api/* )
      add_service web
      ;;
  esac
done

if [[ "${#services[@]}" -eq 0 ]]; then
  printf "%s\n" "ALL"
  exit 0
fi

out=()
while IFS= read -r service || [[ -n "$service" ]]; do
  out+=("$service")
done < <(printf "%s\n" "${services[@]}" | sort -u)
printf "%s\n" "${out[*]}"
