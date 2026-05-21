#!/usr/bin/env bash
# Builds selected VPS workspace images with Docker Buildx registry cache and pushes commit-tagged images.
# Required when VPS_PUSH_SERVICES is not NONE: DOCKER_REGISTRY_URL, STAGING_DOCKER_TAG.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

scope="${VPS_PUSH_SERVICES:-ALL}"

if [[ "$scope" == "NONE" ]]; then
  echo "VPS_PUSH_SERVICES=NONE - skipping Docker Buildx build and push"
  exit 0
fi

if [[ -z "${DOCKER_REGISTRY_URL:-}" || -z "${STAGING_DOCKER_TAG:-}" ]]; then
  echo "::error::compose-vps-buildx-push: defina DOCKER_REGISTRY_URL e STAGING_DOCKER_TAG" >&2
  exit 1
fi

REF_HELPER="$ROOT/scripts/ci/docker-registry-image-ref.sh"

all_services() {
  bash scripts/ci/list-workspace-vps-images.sh | while IFS= read -r local_img || [[ -n "$local_img" ]]; do
    [[ -z "$local_img" ]] && continue
    name="${local_img#workspace-}"
    name="${name%:${WORKSPACE_VPS_IMAGE_TAG:-vps}}"
    printf "%s\n" "$name"
  done
}

selected_services() {
  if [[ -z "$scope" || "$scope" == "ALL" ]]; then
    all_services
  else
    for service in $scope; do
      printf "%s\n" "$service"
    done
  fi
}

service_build_command() {
  local service="$1"
  local image_ref cache_ref
  image_ref="$(bash "$REF_HELPER" "$DOCKER_REGISTRY_URL" "$service" "$STAGING_DOCKER_TAG")"
  cache_ref="$(bash "$REF_HELPER" "$DOCKER_REGISTRY_URL" "buildcache-$service" "buildcache")"

  case "$service" in
    web)
      BUILD_CMD=(
        docker buildx build
        --push
        --file docker/app.Dockerfile
        --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:3010}"
        --build-arg "API_INTERNAL_URL=${API_INTERNAL_URL:-http://gateway:3010}"
        --cache-from "type=registry,ref=$cache_ref"
        --cache-to "type=registry,ref=$cache_ref,mode=max"
        --tag "$image_ref"
        .
      )
      ;;
    gateway | organization-service | user-service | task-service | project-service | client-service | department-service | fiscal-service | contabil-service | regularize-service | rh-service | ti-service | audit-service)
      BUILD_CMD=(
        docker buildx build
        --push
        --file docker/service.Dockerfile
        --build-arg "WORKSPACE_PACKAGE=@workspace/$service"
        --build-arg "SERVICE_DIR=services/$service"
        --cache-from "type=registry,ref=$cache_ref"
        --cache-to "type=registry,ref=$cache_ref,mode=max"
        --tag "$image_ref"
        .
      )
      ;;
    *)
      echo "::error::compose-vps-buildx-push: servico VPS desconhecido: $service" >&2
      exit 1
      ;;
  esac
}

quote_cmd() {
  local first=1
  local arg
  for arg in "$@"; do
    if [[ "$first" -eq 1 ]]; then
      first=0
    else
      printf " "
    fi
    printf "%s" "$arg"
  done
  printf "\n"
}

for service in $(selected_services); do
  started_at="$(date +%s)"
  echo "::group::buildx cached build: $service"
  service_build_command "$service"
  if [[ "${CI_DRY_RUN:-}" == "1" ]]; then
    quote_cmd "${BUILD_CMD[@]}"
  else
    "${BUILD_CMD[@]}"
  fi
  finished_at="$(date +%s)"
  echo "duration_seconds=$((finished_at - started_at)) service=$service"
  echo "::endgroup::"
done
