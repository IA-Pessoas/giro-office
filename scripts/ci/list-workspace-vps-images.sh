#!/usr/bin/env bash
# Lista imagens do stack VPS no padrão workspace-*:vps, derivadas de `docker compose config --images`
# (sem lista manual no CI). Exclui terceiros (ex.: nginx).
# Serviços só em `profiles` inativos não entram no config padrão; use COMPOSE_PROFILES=audit no job
# se quiser incluir audit-service no scan.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! compose_out="$(docker compose -f docker-compose.vps.yml config --images 2>/dev/null)"; then
  echo "::error::Falha ao executar docker compose config --images"
  exit 1
fi

mapfile -t images < <(printf "%s\n" "$compose_out" | sort -u | grep -E '^workspace-[^:]+:vps$' || true)

if [[ "${#images[@]}" -eq 0 ]]; then
  echo "::error::Nenhuma imagem workspace-*:vps encontrada em docker-compose.vps.yml (config --images)."
  exit 1
fi

printf "%s\n" "${images[@]}"
