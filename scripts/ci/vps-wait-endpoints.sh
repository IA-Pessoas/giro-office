#!/usr/bin/env bash
# Verificação pontual de saúde após `compose up` na VPS (sem healthcheck contínuo do Docker).
#
# Env:
#   COMPOSE_PROJECT (obrigatório)
#   DEPLOY_SLOT (obrigatório, para montar COMPOSE_ARGS)
#   VPS_WAIT_TIMEOUT (opcional, default 900)
#   VPS_WAIT_INTERVAL (opcional, default 10)
#   VPS_WAIT_SERVICES (opcional, lista de serviços Compose; vazio = stack completa)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/ci/vps-compose-args.sh
. "$ROOT/scripts/ci/vps-compose-args.sh"

log() {
  printf "\n>>> %s\n" "$*" >&2
}

if [[ -z "${COMPOSE_PROJECT:-}" || -z "${DEPLOY_SLOT:-}" ]]; then
  echo "::error::vps-wait-endpoints: defina COMPOSE_PROJECT e DEPLOY_SLOT" >&2
  exit 1
fi

VPS_WAIT_TIMEOUT="${VPS_WAIT_TIMEOUT:-900}"
VPS_WAIT_INTERVAL="${VPS_WAIT_INTERVAL:-10}"
VPS_CURL_IMAGE="${VPS_CURL_IMAGE:-curlimages/curl:8.12.0}"

vps_build_compose_args

compose() {
  docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_ARGS[@]}" "$@"
}

curl_host() {
  local url="$1"
  curl -fsS --max-time 5 "$url" >/dev/null
}

curl_backend() {
  local url="$1"
  local net="${COMPOSE_PROJECT}_backend"
  docker run --rm --network "$net" "$VPS_CURL_IMAGE" \
    curl -fsS --max-time 5 "$url" >/dev/null
}

backend_check_url() {
  local service="$1"
  case "$service" in
    organization-service)
      printf "%s\n" "http://organization-service:3031/health"
      ;;
    user-service)
      printf "%s\n" "http://user-service:3030/health"
      ;;
    department-service)
      printf "%s\n" "http://department-service:3036/health"
      ;;
    task-service)
      printf "%s\n" "http://task-service:3032/ready"
      ;;
    project-service)
      printf "%s\n" "http://project-service:3033/health"
      ;;
    client-service)
      printf "%s\n" "http://client-service:3035/ready"
      ;;
    fiscal-service)
      printf "%s\n" "http://fiscal-service:3037/health"
      ;;
    contabil-service)
      printf "%s\n" "http://contabil-service:3038/health"
      ;;
    regularize-service)
      printf "%s\n" "http://regularize-service:3039/health"
      ;;
    rh-service)
      printf "%s\n" "http://rh-service:3034/health"
      ;;
    ti-service)
      printf "%s\n" "http://ti-service:3040/ready"
      ;;
    audit-service)
      printf "%s\n" "http://audit-service:3020/ready"
      ;;
    *)
      return 1
      ;;
  esac
}

ALL_BACKEND_SERVICES=(
  organization-service
  user-service
  department-service
  task-service
  project-service
  client-service
  fiscal-service
  contabil-service
  regularize-service
  rh-service
  ti-service
  audit-service
)

EDGE_CHECKS=()

add_edge_check() {
  local name="$1"
  local port_spec="$2"
  local path="$3"
  local port
  port="$(compose port "$name" "$port_spec" 2>/dev/null | awk -F: '{print $NF}')"
  if [[ -z "$port" ]]; then
    echo "::error::vps-wait-endpoints: porta não publicada para $name ($port_spec)" >&2
    return 1
  fi
  EDGE_CHECKS+=("host|http://127.0.0.1:${port}${path}")
}

build_check_plan() {
  local -a selected=()
  local backend_url svc

  if [[ -n "${VPS_WAIT_SERVICES:-}" ]]; then
    read -r -a selected <<<"${VPS_WAIT_SERVICES}"
  fi

  CHECKS=()

  if [[ "${#selected[@]}" -eq 0 ]]; then
    for svc in "${ALL_BACKEND_SERVICES[@]}"; do
      backend_url="$(backend_check_url "$svc")"
      CHECKS+=("backend|${backend_url}|$svc")
    done
    add_edge_check gateway 3010 /ready
    add_edge_check web 3000 /
    add_edge_check reverse-proxy 80 /
    for item in "${EDGE_CHECKS[@]}"; do
      CHECKS+=("$item|edge")
    done
    return 0
  fi

  local need_gateway=0
  local need_web=0
  local need_proxy=0

  for svc in "${selected[@]}"; do
    if backend_url="$(backend_check_url "$svc")"; then
      CHECKS+=("backend|${backend_url}|$svc")
      need_gateway=1
      continue
    fi
    case "$svc" in
      gateway)
        need_gateway=1
        ;;
      web)
        need_web=1
        need_gateway=1
        ;;
      reverse-proxy)
        need_proxy=1
        need_gateway=1
        ;;
      *)
        echo "::error::vps-wait-endpoints: serviço desconhecido em VPS_WAIT_SERVICES: $svc" >&2
        return 1
        ;;
    esac
  done

  if [[ "$need_gateway" -eq 1 ]]; then
    add_edge_check gateway 3010 /ready
  fi
  if [[ "$need_web" -eq 1 ]]; then
    add_edge_check web 3000 /
  fi
  if [[ "$need_proxy" -eq 1 ]]; then
    add_edge_check reverse-proxy 80 /
  fi
  for item in "${EDGE_CHECKS[@]}"; do
    CHECKS+=("$item|edge")
  done
}

run_checks() {
  local failed=0
  local item kind target label

  for item in "${CHECKS[@]}"; do
    IFS='|' read -r kind target label <<<"$item"
    if [[ "$kind" == "host" ]]; then
      if curl_host "$target"; then
        log "OK $label ($target)"
      else
        log "FALHA $label ($target)"
        failed=1
      fi
    else
      if curl_backend "$target"; then
        log "OK $label ($target)"
      else
        log "FALHA $label ($target)"
        failed=1
      fi
    fi
  done

  return "$failed"
}

build_check_plan

deadline=$((SECONDS + VPS_WAIT_TIMEOUT))
attempt=0

log "Aguardando endpoints (timeout=${VPS_WAIT_TIMEOUT}s, intervalo=${VPS_WAIT_INTERVAL}s, checks=${#CHECKS[@]})"

while (( SECONDS < deadline )); do
  attempt=$((attempt + 1))
  log "Tentativa $attempt"
  if run_checks; then
    log "Todos os endpoints responderam OK"
    exit 0
  fi
  sleep "$VPS_WAIT_INTERVAL"
done

log "Timeout aguardando endpoints (${VPS_WAIT_TIMEOUT}s)"
compose ps -a >&2 || true
echo "::error::vps-wait-endpoints: timeout após ${VPS_WAIT_TIMEOUT}s" >&2
exit 1
