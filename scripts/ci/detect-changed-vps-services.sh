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

mapfile -t files < <(git diff --name-only "$BEFORE" "$AFTER" 2>/dev/null || true)

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

declare -A services=()

mark_all() {
  printf "%s\n" "ALL"
  exit 0
}

for f in "${files[@]}"; do
  if [[ "$f" == shared/* ]]; then
    mark_all
  fi
  if [[ "$f" == docker/nginx/* ]]; then
    services[reverse-proxy]=1
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
      services[gateway]=1
      ;;
    services/organization-service/* )
      services[organization-service]=1
      ;;
    services/user-service/* )
      services[user-service]=1
      ;;
    services/task-service/* )
      services[task-service]=1
      ;;
    services/project-service/* )
      services[project-service]=1
      ;;
    services/client-service/* )
      services[client-service]=1
      ;;
    services/department-service/* )
      services[department-service]=1
      ;;
    services/fiscal-service/* )
      services[fiscal-service]=1
      ;;
    services/contabil-service/* )
      services[contabil-service]=1
      ;;
    services/regularize-service/* )
      services[regularize-service]=1
      ;;
    services/rh-service/* )
      services[rh-service]=1
      ;;
    services/certificate-service/* )
      services[certificate-service]=1
      ;;
    services/audit-service/* )
      services[audit-service]=1
      ;;
    app/* )
      services[web]=1
      ;;
    packages/api/* )
      services[web]=1
      ;;
  esac
done

if [[ "${#services[@]}" -eq 0 ]]; then
  printf "%s\n" "ALL"
  exit 0
fi

# shellcheck disable=SC2207
out=( $(printf "%s\n" "${!services[@]}" | sort -u) )
printf "%s\n" "${out[*]}"
