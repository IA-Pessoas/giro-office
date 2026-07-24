#!/usr/bin/env bash
# Imprime a tag a usar no registry para fazer `docker pull` a partir de um passo (staging) anterior.
# Prioridade:
#  1) DOCKER_STAGING_TAG (env) — alinhamento manual a um build que passou.
#  2) Merge com dois pais: SHA do 2.º parent (ponta do branch de feature) — muitas vezes é a commit que
#     o staging de PR construiu.
#  3) GITHUB_SHA atual (push linear ou desconhecido).
#
# Uso: na raiz do repositório, com histórico Git disponível (checkout com fetch-depth:0).
# Saída: print única linha com o identificador de tag.
set -eo pipefail

if [[ -n "${DOCKER_STAGING_TAG:-}" ]]; then
  echo "$DOCKER_STAGING_TAG"
  exit 0
fi

current="${GITHUB_SHA:-}"
if [[ -z "$current" ]]; then
  current="$(git rev-parse HEAD 2>/dev/null || true)"
fi

if [[ -z "$current" ]]; then
  echo "::error::Não foi possível resolver a tag: defina DOCKER_STAGING_TAG ou forneça GITHUB_SHA" >&2
  exit 1
fi

parents_str=$(git -C . show -s --format=%P "$current" 2>/dev/null || true)
# Dois pais: merge; tentar o 2.º (ponta do feature branch) como tag do build de staging/PR
read -ra parents <<< "$parents_str"
if [[ ${#parents[@]} -ge 2 ]]; then
  echo "${parents[1]}"
  exit 0
fi

echo "$current"
