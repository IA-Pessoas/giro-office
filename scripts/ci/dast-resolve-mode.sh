#!/usr/bin/env bash
# Usa só env (defina DAST_TARGET_URL a partir do secret no workflow). Não compare
# secrets em `if:` — sempre vazio nas expressões do GHA.
# Outputs: has_public_url, use_local_stack (cada um true|false)
set -eo pipefail

if [ -n "${DAST_TARGET_URL:-}" ]; then
  echo "has_public_url=true" >> "$GITHUB_OUTPUT"
  echo "use_local_stack=false" >> "$GITHUB_OUTPUT"
else
  echo "has_public_url=false" >> "$GITHUB_OUTPUT"
  echo "use_local_stack=true" >> "$GITHUB_OUTPUT"
fi
