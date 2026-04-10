#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env files so the Node runner sees them via process.env
if [ -f "$ROOT_DIR/services/gateway/.env" ]; then
  set -a
  . "$ROOT_DIR/services/gateway/.env"
  set +a
fi
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

exec node "$SCRIPT_DIR/all-services-smoke.mjs" "$@"
