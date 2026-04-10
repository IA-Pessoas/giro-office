#!/usr/bin/env sh

set -eu

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command curl
require_command node

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
GATEWAY_ENV_PATH="$ROOT_DIR/services/gateway/.env"

log() {
  printf '\n[%s] %s\n' "$1" "$2"
}

load_env_file_value() {
  key="$1"
  env_path="$2"

  node -e '
const fs = require("node:fs");
const key = process.argv[1];
const envPath = process.argv[2];
if (!fs.existsSync(envPath)) process.exit(0);
const content = fs.readFileSync(envPath, "utf8");
for (const rawLine of content.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  const currentKey = line.slice(0, idx).trim();
  if (currentKey !== key) continue;
  let value = line.slice(idx + 1).trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.stdout.write(value);
  process.exit(0);
}
' "$key" "$env_path"
}

get_config() {
  key="$1"
  default_value="${2:-}"

  eval "current_value=\${$key:-}"
  if [ -n "$current_value" ]; then
    printf '%s' "$current_value"
    return
  fi

  file_value="$(load_env_file_value "$key" "$GATEWAY_ENV_PATH")"
  if [ -n "$file_value" ]; then
    printf '%s' "$file_value"
    return
  fi

  printf '%s' "$default_value"
}

write_json() {
  node -e '
const fs = require("node:fs");
fs.writeFileSync(process.argv[2], process.argv[1] + "\n");
' "$1" "$2"
}

json_get() {
  node -e '
const fs = require("node:fs");
const file = process.argv[1];
const path = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
let current = data;
for (const segment of path.split(".")) {
  if (segment.length === 0) continue;
  const key = /^\d+$/.test(segment) ? Number(segment) : segment;
  if (current == null || !(key in current)) {
    process.exit(2);
  }
  current = current[key];
}
if (typeof current === "object") {
  process.stdout.write(JSON.stringify(current));
} else {
  process.stdout.write(String(current));
}
' "$1" "$2"
}

extract_first_uuid_client_id() {
  node -e '
const fs = require("node:fs");
const file = process.argv[1];
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const items = data?.data?.items;
if (!Array.isArray(items)) process.exit(0);
for (const item of items) {
  if (item && typeof item.id === "string" && uuidRegex.test(item.id)) {
    process.stdout.write(item.id);
    process.exit(0);
  }
}
' "$1"
}

assert_status() {
  expected="$1"
  actual="$2"
  context="$3"
  if [ "$actual" != "$expected" ]; then
    echo "Unexpected status for $context: expected $expected, got $actual" >&2
    exit 1
  fi
}

diagnose_gateway_upstream() {
  env_key="$1"

  upstream_url="$(get_config "$env_key" "")"
  if [ -z "$upstream_url" ]; then
    echo "Gateway upstream env $env_key is not set in $GATEWAY_ENV_PATH." >&2
    return
  fi

  echo "Gateway upstream for $env_key: $upstream_url" >&2

  upstream_health_body="$TMP_DIR/upstream-health.json"
  upstream_health_status="$(curl -sS -o "$upstream_health_body" -w "%{http_code}" "$upstream_url/health" 2>/dev/null || true)"

  if [ -z "$upstream_health_status" ]; then
    echo "Direct upstream check failed before receiving an HTTP status from $upstream_url/health" >&2
    return
  fi

  echo "Direct upstream health status: $upstream_health_status" >&2
  if [ -s "$upstream_health_body" ]; then
    echo "Direct upstream health body:" >&2
    cat "$upstream_health_body" >&2
    printf '\n' >&2
  fi
}

assert_status_with_body() {
  expected="$1"
  actual="$2"
  context="$3"
  body_file="$4"
  upstream_env_key="${5:-}"

  if [ "$actual" = "$expected" ]; then
    return
  fi

  echo "Unexpected status for $context: expected $expected, got $actual" >&2
  if [ -f "$body_file" ] && [ -s "$body_file" ]; then
    echo "Response body:" >&2
    cat "$body_file" >&2
    printf '\n' >&2
  fi

  if [ "$actual" = "502" ] && [ -n "$upstream_env_key" ]; then
    diagnose_gateway_upstream "$upstream_env_key"
  fi

  exit 1
}

assert_success_envelope() {
  body_file="$1"
  context="$2"
  success="$(json_get "$body_file" "success" 2>/dev/null || true)"
  if [ "$success" != "true" ]; then
    echo "Unexpected response envelope for $context" >&2
    cat "$body_file" >&2
    exit 1
  fi
}

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t all-services-smoke)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

GATEWAY_PORT_VALUE="$(get_config "GATEWAY_PORT" "3010")"
AUDIT_ENABLED="$(get_config "AUDIT_ENABLED" "false")"
JWT_SECRET_VALUE="$(get_config "JWT_SECRET" "")"

GATEWAY_URL="${GATEWAY_URL:-http://localhost:$GATEWAY_PORT_VALUE}"

LOGIN="${LOGIN:-admin}"
PASSWORD="${PASSWORD:-senha123}"
PROJECT_NAME="${PROJECT_NAME:-Smoke Test Project}"
PROJECT_OBJECTIVE="${PROJECT_OBJECTIVE:-Validate multi-service smoke flow.}"
PROJECT_START_DATE="${PROJECT_START_DATE:-2026-04-09T00:00:00.000Z}"
PROJECT_END_DATE="${PROJECT_END_DATE:-2026-04-30T00:00:00.000Z}"

request_json() {
  method="$1"
  url="$2"
  body_file="$3"
  output_file="$4"
  bearer_token="${5:-}"

  status_file="$TMP_DIR/status.txt"
  rm -f "$status_file"

  set -- -sS -X "$method" "$url" -o "$output_file" -w "%{http_code}" -H "Content-Type: application/json"

  if [ -n "$bearer_token" ]; then
    set -- "$@" -H "Authorization: Bearer $bearer_token"
  fi

  if [ -n "$body_file" ]; then
    set -- "$@" --data @"$body_file"
  fi

  curl "$@" >"$status_file"
  tr -d '\r\n' <"$status_file"
}

log "INFO" "Checking gateway public health endpoints"
gateway_health_response="$TMP_DIR/gateway-health.json"
gateway_health_status="$(request_json "GET" "$GATEWAY_URL/health" "" "$gateway_health_response")"
assert_status_with_body "200" "$gateway_health_status" "GET /health" "$gateway_health_response"
assert_success_envelope "$gateway_health_response" "GET /health"
log "PASS" "gateway health"

gateway_ready_response="$TMP_DIR/gateway-ready.json"
gateway_ready_status="$(request_json "GET" "$GATEWAY_URL/ready" "" "$gateway_ready_response")"
assert_status_with_body "200" "$gateway_ready_status" "GET /ready" "$gateway_ready_response"
assert_success_envelope "$gateway_ready_response" "GET /ready"
log "PASS" "gateway ready"

log "INFO" "Logging in through gateway with user-service"
login_body="$TMP_DIR/login.json"
write_json "{\"login\":\"$LOGIN\",\"password\":\"$PASSWORD\"}" "$login_body"
login_response="$TMP_DIR/login-response.json"
login_status="$(request_json "POST" "$GATEWAY_URL/user/session" "$login_body" "$login_response")"
assert_status_with_body "200" "$login_status" "POST /user/session" "$login_response" "USER_SERVICE_URL"
assert_success_envelope "$login_response" "POST /user/session"

USER_ID="$(json_get "$login_response" "data.id")"
ORGANIZATION_ID="$(json_get "$login_response" "data.organization_id")"
USER_NAME="$(json_get "$login_response" "data.name")"
USER_LOGIN="$(json_get "$login_response" "data.login")"

if [ -z "$JWT_SECRET_VALUE" ]; then
  echo "JWT_SECRET is required to generate a smoke token with permission=2." >&2
  exit 1
fi

SMOKE_TOKEN="$(node -e '
const crypto = require("node:crypto");
const secret = process.argv[1];
const userId = process.argv[2];
const organizationId = process.argv[3];
const name = process.argv[4];
const login = process.argv[5];

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const now = Math.floor(Date.now() / 1000);
const header = {
  alg: "HS256",
  typ: "JWT",
};
const payload = {
  user_id: userId,
  organization_id: organizationId,
  name,
  login,
  permission: 2,
  sub: userId,
  iat: now,
  exp: now + 60 * 60,
};

const encodedHeader = base64Url(JSON.stringify(header));
const encodedPayload = base64Url(JSON.stringify(payload));
const content = `${encodedHeader}.${encodedPayload}`;
const signature = crypto
  .createHmac("sha256", secret)
  .update(content)
  .digest("base64")
  .replace(/=/g, "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_");

process.stdout.write(`${content}.${signature}`);
' "$JWT_SECRET_VALUE" "$USER_ID" "$ORGANIZATION_ID" "$USER_NAME" "$USER_LOGIN")"

log "PASS" "Authenticated as user_id=$USER_ID organization_id=$ORGANIZATION_ID"

log "INFO" "Exercising gateway + user-service"
user_me_response="$TMP_DIR/user-me.json"
user_me_status="$(request_json "GET" "$GATEWAY_URL/user/me" "" "$user_me_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$user_me_status" "GET /user/me" "$user_me_response" "USER_SERVICE_URL"
assert_success_envelope "$user_me_response" "GET /user/me"
log "PASS" "user-service route /user/me"

log "INFO" "Exercising organization-service"
org_list_response="$TMP_DIR/org-list.json"
org_list_status="$(request_json "GET" "$GATEWAY_URL/organizations?page=1&pageSize=1" "" "$org_list_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$org_list_status" "GET /organizations" "$org_list_response" "ORGANIZATION_SERVICE_URL"
assert_success_envelope "$org_list_response" "GET /organizations"

org_detail_response="$TMP_DIR/org-detail.json"
org_detail_status="$(request_json "GET" "$GATEWAY_URL/organizations/$ORGANIZATION_ID" "" "$org_detail_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$org_detail_status" "GET /organizations/:id" "$org_detail_response" "ORGANIZATION_SERVICE_URL"
assert_success_envelope "$org_detail_response" "GET /organizations/:id"
log "PASS" "organization-service routes"

log "INFO" "Exercising client-service"
client_list_response="$TMP_DIR/client-list.json"
client_list_status="$(request_json "GET" "$GATEWAY_URL/client/list?page=1&limit=1" "" "$client_list_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$client_list_status" "GET /client/list" "$client_list_response" "CLIENT_SERVICE_URL"
assert_success_envelope "$client_list_response" "GET /client/list"
CLIENT_ID="$(extract_first_uuid_client_id "$client_list_response" 2>/dev/null || true)"

if [ -z "$CLIENT_ID" ]; then
  log "INFO" "No UUID client found, creating one for the smoke flow"
  create_client_body="$TMP_DIR/create-client.json"
  write_json "{\"name\":\"Smoke Client\",\"organization_id\":\"$ORGANIZATION_ID\",\"status\":\"Ativo\",\"cpf_cnpj\":\"\",\"prospecting_status\":\"Lead\",\"type\":\"PJ\",\"type_registration\":\"Novo\",\"service_unique\":false}" "$create_client_body"
  create_client_response="$TMP_DIR/create-client-response.json"
  create_client_status="$(request_json "POST" "$GATEWAY_URL/client" "$create_client_body" "$create_client_response" "$SMOKE_TOKEN")"
  assert_status_with_body "201" "$create_client_status" "POST /client" "$create_client_response" "CLIENT_SERVICE_URL"
  assert_success_envelope "$create_client_response" "POST /client"
  CLIENT_ID="$(json_get "$create_client_response" "data.id")"
fi

client_detail_response="$TMP_DIR/client-detail.json"
client_detail_status="$(request_json "GET" "$GATEWAY_URL/client/$CLIENT_ID" "" "$client_detail_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$client_detail_status" "GET /client/:id" "$client_detail_response" "CLIENT_SERVICE_URL"
assert_success_envelope "$client_detail_response" "GET /client/:id"
log "PASS" "client-service routes with client_id=$CLIENT_ID"

log "INFO" "Exercising task-service"
deps_response="$TMP_DIR/task-deps.json"
deps_status="$(request_json "GET" "$GATEWAY_URL/task/deps/list" "" "$deps_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$deps_status" "GET /task/deps/list" "$deps_response" "TASK_SERVICE_URL"
assert_success_envelope "$deps_response" "GET /task/deps/list"

task_list_response="$TMP_DIR/task-list.json"
task_list_status="$(request_json "GET" "$GATEWAY_URL/task/list?page=1&limit=1&status=Todos" "" "$task_list_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$task_list_status" "GET /task/list" "$task_list_response" "TASK_SERVICE_URL"
assert_success_envelope "$task_list_response" "GET /task/list"

plan_list_response="$TMP_DIR/project-plan-list.json"
plan_list_status="$(request_json "GET" "$GATEWAY_URL/task/project-plan/list" "" "$plan_list_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$plan_list_status" "GET /task/project-plan/list" "$plan_list_response" "TASK_SERVICE_URL"
assert_success_envelope "$plan_list_response" "GET /task/project-plan/list"
log "PASS" "task-service routes"

log "INFO" "Exercising project-service"
project_list_response="$TMP_DIR/project-list.json"
project_list_status="$(request_json "GET" "$GATEWAY_URL/project/list?ref=client&id=$CLIENT_ID" "" "$project_list_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$project_list_status" "GET /project/list" "$project_list_response" "PROJECT_SERVICE_URL"
assert_success_envelope "$project_list_response" "GET /project/list"

create_project_body="$TMP_DIR/create-project.json"
write_json "{\"name\":\"$PROJECT_NAME\",\"client_id\":\"$CLIENT_ID\",\"start_date\":\"$PROJECT_START_DATE\",\"objective\":\"$PROJECT_OBJECTIVE\",\"sponsor_id\":\"\"}" "$create_project_body"
create_project_response="$TMP_DIR/create-project-response.json"
create_project_status="$(request_json "POST" "$GATEWAY_URL/project" "$create_project_body" "$create_project_response" "$SMOKE_TOKEN")"
assert_status_with_body "201" "$create_project_status" "POST /project" "$create_project_response" "PROJECT_SERVICE_URL"
assert_success_envelope "$create_project_response" "POST /project"
PROJECT_ID="$(json_get "$create_project_response" "data.create.id")"

project_detail_response="$TMP_DIR/project-detail.json"
project_detail_status="$(request_json "GET" "$GATEWAY_URL/project?project_id=$PROJECT_ID" "" "$project_detail_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$project_detail_status" "GET /project" "$project_detail_response" "PROJECT_SERVICE_URL"
assert_success_envelope "$project_detail_response" "GET /project"

update_project_body="$TMP_DIR/update-project.json"
write_json "{\"project_id\":\"$PROJECT_ID\",\"name\":\"$PROJECT_NAME Updated\",\"start_date\":\"$PROJECT_START_DATE\",\"end_date\":\"$PROJECT_END_DATE\",\"objective\":\"$PROJECT_OBJECTIVE Updated\",\"sponsor_id\":\"\"}" "$update_project_body"
update_project_response="$TMP_DIR/update-project-response.json"
update_project_status="$(request_json "PUT" "$GATEWAY_URL/project" "$update_project_body" "$update_project_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$update_project_status" "PUT /project" "$update_project_response" "PROJECT_SERVICE_URL"
assert_success_envelope "$update_project_response" "PUT /project"

progress_body="$TMP_DIR/project-progress.json"
write_json "{\"project_id\":\"$PROJECT_ID\"}" "$progress_body"
progress_response="$TMP_DIR/project-progress-response.json"
progress_status="$(request_json "POST" "$GATEWAY_URL/project/progress" "$progress_body" "$progress_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$progress_status" "POST /project/progress" "$progress_response" "PROJECT_SERVICE_URL"
assert_success_envelope "$progress_response" "POST /project/progress"

delete_project_body="$TMP_DIR/delete-project.json"
write_json "{\"project_id\":\"$PROJECT_ID\"}" "$delete_project_body"
delete_project_response="$TMP_DIR/delete-project-response.json"
delete_project_status="$(request_json "DELETE" "$GATEWAY_URL/project" "$delete_project_body" "$delete_project_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$delete_project_status" "DELETE /project" "$delete_project_response" "PROJECT_SERVICE_URL"
assert_success_envelope "$delete_project_response" "DELETE /project"
log "PASS" "project-service routes with project_id=$PROJECT_ID"

log "INFO" "Exercising rh-service"
rh_categories_response="$TMP_DIR/rh-categories.json"
rh_categories_status="$(request_json "GET" "$GATEWAY_URL/rh/categories?activeOnly=false" "" "$rh_categories_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$rh_categories_status" "GET /rh/categories" "$rh_categories_response" "RH_SERVICE_URL"
assert_success_envelope "$rh_categories_response" "GET /rh/categories"

rh_point_config_response="$TMP_DIR/rh-point-config.json"
rh_point_config_status="$(request_json "GET" "$GATEWAY_URL/rh/point-config" "" "$rh_point_config_response" "$SMOKE_TOKEN")"
assert_status_with_body "200" "$rh_point_config_status" "GET /rh/point-config" "$rh_point_config_response" "RH_SERVICE_URL"
assert_success_envelope "$rh_point_config_response" "GET /rh/point-config"
log "PASS" "rh-service routes"

if [ "$AUDIT_ENABLED" = "true" ] || [ "$AUDIT_ENABLED" = "1" ]; then
  log "INFO" "Exercising audit-service through gateway"
  audit_requests_response="$TMP_DIR/audit-requests.json"
  audit_requests_status="$(request_json "GET" "$GATEWAY_URL/audit/requests?page=1&pageSize=1" "" "$audit_requests_response" "$SMOKE_TOKEN")"
  assert_status_with_body "200" "$audit_requests_status" "GET /audit/requests" "$audit_requests_response" "AUDIT_SERVICE_URL"
  assert_success_envelope "$audit_requests_response" "GET /audit/requests"
  log "PASS" "audit-service routes"
else
  log "INFO" "Skipping audit-service gateway route checks because AUDIT_ENABLED=$AUDIT_ENABLED"
fi

log "DONE" "All active microservices smoke test completed successfully"
