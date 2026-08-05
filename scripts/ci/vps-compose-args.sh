#!/usr/bin/env bash
# Define COMPOSE_ARGS para stacks VPS (base + runtime override + slot opcional).
# Requer: DEPLOY_SLOT (develop|staging|test-develop|test-staging).
# Exporta: COMPOSE_ARGS (array bash).

vps_build_compose_args() {
  local slot_override=""
  COMPOSE_ARGS=(
    -f docker-compose.vps.yml
    -f docker-compose.vps.runtime-override.yml
  )

  case "${DEPLOY_SLOT:-}" in
    develop)
      slot_override="docker-compose.vps.slot-develop.yml"
      ;;
    test-develop)
      slot_override="docker-compose.vps.slot-test-develop.yml"
      ;;
    test-staging)
      slot_override="docker-compose.vps.slot-test-staging.yml"
      ;;
    staging)
      ;;
    *)
      echo "::error::vps-compose-args: DEPLOY_SLOT inválido: ${DEPLOY_SLOT:-}(esperado develop, staging, test-develop ou test-staging)" >&2
      return 1
      ;;
  esac

  if [[ -n "$slot_override" ]]; then
    if [[ ! -f "$slot_override" ]]; then
      echo "::error::$slot_override não encontrado (override ${DEPLOY_SLOT:-})" >&2
      return 1
    fi
    COMPOSE_ARGS+=( -f "$slot_override" )
  fi
}
