#!/usr/bin/env bash

web_env_file="${1:?production web env file is required}"
if [[ ! -f "$web_env_file" ]]; then
  echo "production web env file not found" >&2
  return 1 2>/dev/null || exit 1
fi

set -a
# shellcheck disable=SC1090
source "$web_env_file"
set +a

: "${NEXT_PUBLIC_API_URL:?NEXT_PUBLIC_API_URL is required}"
: "${API_INTERNAL_URL:?API_INTERNAL_URL is required}"
