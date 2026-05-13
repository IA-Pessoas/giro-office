#!/usr/bin/env bash
# Pulls {REG}/{service}:{TAG} and retags it as workspace-*:<WORKSPACE_VPS_IMAGE_TAG>.
# VPS_PULL_SERVICES: space-separated list (for example: gateway user-service), ALL/empty = all, NONE = no pull.
# Services that are not selected but whose local image is missing can be pulled too when
# VPS_PULL_MISSING_UNSELECTED=1, because full compose up starts the whole required stack with --no-build.
# Required: DOCKER_REGISTRY_URL, DOCKER_IMAGE_TAG
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DOCKER_REGISTRY_URL:-}" || -z "${DOCKER_IMAGE_TAG:-}" ]]; then
  echo "::error::compose-vps-pull-by-tag-selective: DOCKER_REGISTRY_URL and DOCKER_IMAGE_TAG are required" >&2
  exit 1
fi

REF_HELPER="$ROOT/scripts/ci/docker-registry-image-ref.sh"

should_pull() {
  local name="$1"
  local filter="${VPS_PULL_SERVICES:-}"
  if [[ -z "$filter" || "$filter" == "ALL" ]]; then
    return 0
  fi
  if [[ "$filter" == "NONE" ]]; then
    return 1
  fi
  local tok
  for tok in $filter; do
    if [[ "$tok" == "$name" ]]; then
      return 0
    fi
  done
  return 1
}

docker_pull_with_retry() {
  local remote="$1"
  local max_attempts="${DOCKER_PULL_RETRIES:-5}"
  local delay_seconds="${DOCKER_PULL_RETRY_DELAY_SECONDS:-10}"
  local attempt=1
  local rc=0

  while true; do
    if docker pull "$remote"; then
      return 0
    fi
    rc=$?

    if [[ "$attempt" -ge "$max_attempts" ]]; then
      echo "::error::docker pull failed after $attempt attempt(s): $remote" >&2
      return "$rc"
    fi

    echo "::warning::docker pull failed for $remote (attempt $attempt/$max_attempts); retrying in ${delay_seconds}s" >&2
    sleep "$delay_seconds"
    attempt=$((attempt + 1))
    if [[ "$delay_seconds" =~ ^[0-9]+$ && "$delay_seconds" -gt 0 && "$delay_seconds" -lt 60 ]]; then
      delay_seconds=$((delay_seconds * 2))
      if [[ "$delay_seconds" -gt 60 ]]; then
        delay_seconds=60
      fi
    fi
  done
}

mapfile -t local_imgs < <(bash scripts/ci/list-workspace-vps-images.sh)

if [[ "${VPS_PULL_SERVICES:-}" == "NONE" ]]; then
  echo "VPS_PULL_SERVICES=NONE - skipping workspace image pulls from registry"
  exit 0
fi

for local_img in "${local_imgs[@]}"; do
  name="${local_img#workspace-}"
  name="${name%:${WORKSPACE_VPS_IMAGE_TAG:-vps}}"

  image_exists=0
  if docker image inspect "$local_img" >/dev/null 2>&1; then
    image_exists=1
  fi

  if ! should_pull "$name"; then
    if [[ "$image_exists" -eq 1 ]]; then
      echo "skip pull (not selected): $local_img"
      continue
    fi

    if [[ "${VPS_PULL_MISSING_UNSELECTED:-0}" == "1" ]]; then
      echo "pull missing (not selected but required by full compose): $local_img"
    else
      echo "skip pull (not selected and not required for selective compose up): $local_img"
      continue
    fi
  fi

  remote="$(bash "$REF_HELPER" "$DOCKER_REGISTRY_URL" "$name" "${DOCKER_IMAGE_TAG}")"
  echo "::group::pull+tag: $local_img <- $remote"
  docker_pull_with_retry "$remote"
  docker tag "$remote" "$local_img"
  echo "::endgroup::"
done
