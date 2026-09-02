#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT="${COMPOSE_PROJECT_NAME:-giro-office-production}"
TIMEOUT="${PRODUCTION_WAIT_TIMEOUT:-900}"
INTERVAL="${PRODUCTION_WAIT_INTERVAL:-10}"
CURL_IMAGE="${PRODUCTION_CURL_IMAGE:-curlimages/curl:8.12.0}"

resolve_network_name() {
  if [[ "$1" == "public-edge" ]]; then
    printf '%s\n' "public-edge"
  else
    printf '%s_%s\n' "$PROJECT" "$1"
  fi
}

if [[ "${1:-}" == "--resolve-network" ]]; then
  resolve_network_name "${2:?network name is required}"
  exit 0
fi

checks=(
  "backend|http://organization-service:3031/health"
  "backend|http://user-service:3030/health"
  "backend|http://department-service:3036/health"
  "backend|http://task-service:3032/ready"
  "backend|http://project-service:3033/health"
  "backend|http://client-service:3035/ready"
  "backend|http://fiscal-service:3037/health"
  "backend|http://contabil-service:3038/health"
  "backend|http://regularize-service:3039/health"
  "backend|http://rh-service:3034/health"
  "backend|http://ti-service:3040/ready"
  "backend|http://certificate-service:3041/health"
  "backend|http://pessoal-service:3042/health"
  "backend|http://parcelamento-service:3043/health"
  "backend|http://reports-service:3044/health"
  "backend|http://audit-service:3020/ready"
  "backend|http://gateway:3010/ready"
  "backend|http://web:3000/"
  "backend|http://web:3000/api/health"
  "public-edge|http://reverse-proxy:80/"
  "public-edge|http://reverse-proxy:80/api/health"
  "public-edge|http://reverse-proxy:80/api/ready"
)

run_checks() {
  local failed=0 network network_name url
  for item in "${checks[@]}"; do
    IFS='|' read -r network url <<<"$item"
    network_name="$(resolve_network_name "$network")"
    if docker run --rm --network "$network_name" "$CURL_IMAGE" \
      curl -fsS --max-time 8 "$url" >/dev/null; then
      printf 'OK %s\n' "$url"
    else
      printf 'FALHA %s\n' "$url" >&2
      failed=1
    fi
  done
  return "$failed"
}

cd "$ROOT"
docker image inspect "$CURL_IMAGE" >/dev/null 2>&1 || docker pull "$CURL_IMAGE" >/dev/null
deadline=$((SECONDS + TIMEOUT))
while (( SECONDS < deadline )); do
  if run_checks; then
    exit 0
  fi
  sleep "$INTERVAL"
done

echo "Timeout aguardando endpoints de produção (${TIMEOUT}s)." >&2
exit 1
