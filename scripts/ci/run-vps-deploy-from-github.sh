#!/usr/bin/env bash
# Executado no runner do GitHub Actions (checkout + .env.vps.* materializados na raiz).
# Variáveis: VPS_HOST, VPS_USER, DEPLOY_PATH, DEPLOY_SLOT, COMPOSE_PROJECT, GITHUB_SHA,
# DOCKER_IMAGE_TAG, VPS_PULL_SERVICES, DOCKER_REGISTRY_URL, DOCKER_REGISTRY_USERNAME,
# DOCKER_REGISTRY_PASSWORD, VPS_SSH_PRIVATE_KEY ou VPS_SSH_PASSWORD.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${VPS_HOST:-}" || -z "${VPS_USER:-}" || -z "${DEPLOY_PATH:-}" ]]; then
  echo "::error::run-vps-deploy-from-github: defina VPS_HOST, VPS_USER, DEPLOY_PATH" >&2
  exit 1
fi

if [[ -z "${VPS_SSH_PRIVATE_KEY:-}" && -z "${VPS_SSH_PASSWORD:-}" ]]; then
  echo "::error::Defina VPS_SSH_PRIVATE_KEY ou VPS_SSH_PASSWORD" >&2
  exit 1
fi

KNOWN_HOSTS_FILE="${ROOT}/.ci-known_hosts"
mkdir -p "$(dirname "$KNOWN_HOSTS_FILE")"
touch "$KNOWN_HOSTS_FILE"
ssh-keyscan -H "$VPS_HOST" >>"$KNOWN_HOSTS_FILE" 2>/dev/null || true

SSH_BASE=( -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$KNOWN_HOSTS_FILE" )

KEY_FILE=""
if [[ -n "${VPS_SSH_PRIVATE_KEY:-}" ]]; then
  KEY_FILE="${ROOT}/.ci-vps-ssh-key"
  umask 077
  printf "%s" "$VPS_SSH_PRIVATE_KEY" >"$KEY_FILE"
fi

on_exit() {
  [[ -n "$KEY_FILE" && -f "$KEY_FILE" ]] && rm -f "$KEY_FILE"
  rm -f "$KNOWN_HOSTS_FILE" "${ROOT}/.ci-remote-env" 2>/dev/null || true
}
trap on_exit EXIT

run_ssh() {
  if [[ -n "$KEY_FILE" ]]; then
    ssh "${SSH_BASE[@]}" -i "$KEY_FILE" "${VPS_USER}@${VPS_HOST}" "$@"
  else
    command -v sshpass >/dev/null 2>&1 || {
      echo "::error::sshpass não encontrado; use VPS_SSH_PRIVATE_KEY ou instale sshpass" >&2
      exit 1
    }
    SSHPASS="${VPS_SSH_PASSWORD}" sshpass -e ssh "${SSH_BASE[@]}" "${VPS_USER}@${VPS_HOST}" "$@"
  fi
}

run_scp() {
  if [[ -n "$KEY_FILE" ]]; then
    scp "${SSH_BASE[@]}" -i "$KEY_FILE" "$@" "${VPS_USER}@${VPS_HOST}:${DEPLOY_PATH}/"
  else
    SSHPASS="${VPS_SSH_PASSWORD}" sshpass -e scp "${SSH_BASE[@]}" "$@" "${VPS_USER}@${VPS_HOST}:${DEPLOY_PATH}/"
  fi
}

REMOTE_ENV="${ROOT}/.ci-remote-env"
{
  echo "set -a"
  echo "DEPLOY_SLOT=$(printf "%q" "${DEPLOY_SLOT:-}")"
  echo "COMPOSE_PROJECT=$(printf "%q" "${COMPOSE_PROJECT:-}")"
  echo "DOCKER_IMAGE_TAG=$(printf "%q" "${DOCKER_IMAGE_TAG}")"
  echo "VPS_PULL_SERVICES=$(printf "%q" "${VPS_PULL_SERVICES}")"
  echo "DOCKER_REGISTRY_URL=$(printf "%q" "${DOCKER_REGISTRY_URL}")"
  echo "DOCKER_REGISTRY_USERNAME=$(printf "%q" "${DOCKER_REGISTRY_USERNAME}")"
  echo "DOCKER_REGISTRY_PASSWORD=$(printf "%q" "${DOCKER_REGISTRY_PASSWORD}")"
  echo "set +a"
} >"$REMOTE_ENV"

mapfile -t scp_files < <(
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    line="${raw#"${raw%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    f="${line#*|}"
    [[ -f "$ROOT/$f" ]] && echo "$ROOT/$f"
  done <"$ROOT/scripts/ci/vps-secrets.manifest"
)

if [[ "${#scp_files[@]}" -eq 0 ]]; then
  echo "::error::Nenhum .env.vps.* encontrado após materialize-vps-env" >&2
  exit 1
fi

run_ssh bash -c "mkdir -p $(printf "%q" "$DEPLOY_PATH")"

run_scp "${scp_files[@]}" "$REMOTE_ENV"

GITHUB_SHA="${GITHUB_SHA:?}"

# shellcheck disable=SC2029
run_ssh bash -s <<EOF
set -euxo pipefail
cd $(printf "%q" "$DEPLOY_PATH")
git config --global --add safe.directory $(printf "%q" "$DEPLOY_PATH") || true
git fetch origin
git fetch origin "${GITHUB_SHA}" 2>/dev/null || true
git checkout -f "${GITHUB_SHA}"
source ./.ci-remote-env
rm -f ./.ci-remote-env
bash scripts/ci/vps-remote-deploy.sh
EOF
