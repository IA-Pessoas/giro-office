#!/usr/bin/env bash
# Sourceable helper for mapping VPS_PULL_SERVICES to deploy behavior.

vps_deploy_mode() {
  local scope="${1:-ALL}"
  case "$scope" in
    NONE)
      printf "%s\n" "skip"
      ;;
    "" | ALL)
      printf "%s\n" "full"
      ;;
    *)
      printf "%s\n" "selective"
      ;;
  esac
}

vps_validate_service_token() {
  local service="$1"
  case "$service" in
    gateway | web | organization-service | user-service | task-service | project-service | client-service | department-service | fiscal-service | contabil-service | regularize-service | rh-service | ti-service | certificate-service | pessoal-service | parcelamento-service | reports-service | audit-service)
      return 0
      ;;
    *)
      printf "::error::servico VPS invalido para deploy seletivo: %s\n" "$service" >&2
      return 1
      ;;
  esac
}

vps_compose_service_args() {
  local scope="${1:-ALL}"
  local mode service
  mode="$(vps_deploy_mode "$scope")"
  if [[ "$mode" != "selective" ]]; then
    return 0
  fi
  for service in $scope; do
    vps_validate_service_token "$service"
    if [[ "$service" == "reports-service" ]]; then
      printf "%s\n" "reports-service" "reports-worker"
    else
      printf "%s\n" "$service"
    fi
  done
}
