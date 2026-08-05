#!/usr/bin/env bash
# Materializa arquivos .env.vps.* na raiz do repositório a partir de variáveis de ambiente
# (secrets do GitHub Actions injetados no job). A lista de pares está em vps-secrets.manifest.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST="$ROOT/scripts/ci/vps-secrets.manifest"

if [[ ! -f "$MANIFEST" ]]; then
  echo "::error::Manifest não encontrado: $MANIFEST"
  exit 1
fi

echo "::group::Validar segredos e materializar .env.vps.* (manifest)"

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line="${raw_line#"${raw_line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" || "$line" == \#* ]] && continue

  if [[ "$line" != *"|"* ]]; then
    echo "::error::Linha inválida no manifest (esperado SECRET|arquivo): $line"
    exit 1
  fi

  secret_name="${line%%|*}"
  outfile_rel="${line#*|}"

  if [[ -z "$secret_name" || -z "$outfile_rel" ]]; then
    echo "::error::Linha inválida no manifest: $line"
    exit 1
  fi

  val="${!secret_name-}"
  if [[ -z "$val" ]]; then
    echo "::error::Configure o secret do repositório (ou variável de ambiente): $secret_name"
    exit 1
  fi

  printf "%s\n" "$val" >"$ROOT/$outfile_rel"
done <"$MANIFEST"

echo "::endgroup::"
