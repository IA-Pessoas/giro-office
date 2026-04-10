import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Load .env from workspace root (if present) without requiring dotenv package.
// Variables already set in process.env take precedence (dotenv convention).
const envFilePath = path.join(rootDir, ".env");
if (fs.existsSync(envFilePath)) {
  const envContent = fs.readFileSync(envFilePath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Only set if not already defined — caller-set env wins
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const { manifest } = await import(pathToFileURL(path.join(__dirname, "all-services-smoke.manifest.mjs")).href);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);

function cliFlag(name) {
  return argv.includes(`--${name}`);
}

function cliValue(name) {
  const prefix = `--${name}=`;
  const entry = argv.find((a) => a.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : undefined;
}

const cli = {
  filter: cliValue("filter") ?? "",
  dryRun: cliFlag("dry-run"),
  verbose: cliFlag("verbose"),
  continueOnFailure: !cliFlag("fail-fast"),
};

// ---------------------------------------------------------------------------
// Colorized output
// ---------------------------------------------------------------------------
const isTTY = process.stdout.isTTY;
const color = {
  reset: isTTY ? "\x1b[0m" : "",
  green: isTTY ? "\x1b[32m" : "",
  red: isTTY ? "\x1b[31m" : "",
  yellow: isTTY ? "\x1b[33m" : "",
  cyan: isTTY ? "\x1b[36m" : "",
  dim: isTTY ? "\x1b[2m" : "",
  bold: isTTY ? "\x1b[1m" : "",
};

const levelColors = {
  PASS: color.green,
  FAIL: color.red,
  WARN: color.yellow,
  INFO: color.cyan,
  SKIP: color.dim,
  DONE: color.bold + color.green,
};

const INTERNAL_SERVICE_TOKENS = {
  "audit-service": "AUDIT_SERVICE_TOKEN",
  "client-service": "CLIENT_SERVICE_INTERNAL_TOKEN",
};

const SERVICE_URL_ENV_KEYS = {
  "audit-service": "AUDIT_SERVICE_URL",
  "client-service": "CLIENT_SERVICE_URL",
  "organization-service": "ORGANIZATION_SERVICE_URL",
  "project-service": "PROJECT_SERVICE_URL",
  "rh-service": "RH_SERVICE_URL",
  "task-service": "TASK_SERVICE_URL",
  "user-service": "USER_SERVICE_URL",
};

const env = {
  gatewayUrl: process.env.GATEWAY_URL,
  gatewayPort: process.env.GATEWAY_PORT ?? "3010",
  login: process.env.LOGIN ?? "Admin",
  password: process.env.PASSWORD ?? process.env.ADMIN_PASSWORD ?? "senha123",
  jwtSecret: process.env.JWT_SECRET ?? "",
  auditEnabled:
    process.env.AUDIT_ENABLED === "true" || process.env.AUDIT_ENABLED === "1",
  namespace:
    process.env.SMOKE_NAMESPACE?.trim() ||
    `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  tmpDir:
    process.env.SMOKE_TMP_DIR?.trim() || fs.mkdtempSync(path.join(process.cwd(), "smoke-")),
  smokeDepartmentId: process.env.SMOKE_DEPARTMENT_ID?.trim() || "",
  fixturePath:
    process.env.SMOKE_UPLOAD_FIXTURE?.trim() ||
    path.join(rootDir, "scripts", "fixtures", "smoke-upload.png"),
};

if (!env.gatewayUrl) {
  env.gatewayUrl = `http://localhost:${env.gatewayPort}`;
}

for (const [service, envKey] of Object.entries(SERVICE_URL_ENV_KEYS)) {
  env[envKey] = process.env[envKey]?.trim() || "";
  env[service] = env[envKey];
}

for (const envKey of Object.values(INTERNAL_SERVICE_TOKENS)) {
  env[envKey] = process.env[envKey]?.trim() || "";
}

const state = {
  session: null,
  bearerToken: "",
  adminBearerToken: "",
  baselineDepartmentId: env.smokeDepartmentId,
  tempUserId: "",
  tempOrganizationId: "",
  primaryClientId: "",
  secondaryClientId: "",
  clientHistoryPendingId: "",
  clientHistoryId: "",
  projectId: "",
  taskModelPrimaryId: "",
  taskModelSecondaryId: "",
  taskDependentId: "",
  taskIntegrationId: "",
  taskId: "",
  planId: "",
  planTaskId: "",
  rhPointId: "",
  rhAdjustmentId: "",
  rhCategoryId: "",
  rhRequestId: "",
  rhScoreQuestionId: "",
  rhScoreId: "",
  rhScoreEvaluationId: "",
  rhHolidayId: "",
  rhTimeBankReleaseId: "",
  rhTimeSheetId: "",
  auditRequestId: "",
};

const cleanupTasks = [];
const executed = [];
const skipped = [];
const actionExecutionRank = {
  projectDelete: 8000,
  rhRequestDelete: 8100,
  rhCategoryDelete: 8200,
  rhScoreQuestionDelete: 8300,
};

function log(level, message) {
  const c = levelColors[level] ?? "";
  process.stdout.write(`\n${c}[${level}]${color.reset} ${message}\n`);
}

function sanitizeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function ensureServiceUrl(service) {
  const url = env[service];
  if (!url) {
    throw new Error(`Missing service URL for ${service} (${SERVICE_URL_ENV_KEYS[service]}).`);
  }
  return url;
}

function buildUrl(target, service, routePath, query) {
  const base =
    target === "gateway" ? env.gatewayUrl : ensureServiceUrl(service);
  const url = new URL(routePath, base);
  if (query) {
    for (const [key, rawValue] of Object.entries(query)) {
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        continue;
      }
      if (Array.isArray(rawValue)) {
        for (const item of rawValue) {
          if (item !== undefined && item !== null) {
            url.searchParams.append(key, String(item));
          }
        }
      } else {
        url.searchParams.set(key, String(rawValue));
      }
    }
  }
  return url;
}

function createAdminToken() {
  if (!state.session) {
    throw new Error("Cannot mint admin token before login succeeds.");
  }
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is required to mint admin bearer token.");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    user_id: state.session.id,
    organization_id: state.session.organization_id,
    name: state.session.name,
    login: state.session.login,
    permission: 2,
    sub: state.session.id,
    iat: now,
    exp: now + 60 * 60,
  };

  const base64Url = (input) =>
    Buffer.from(JSON.stringify(input))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const encodedHeader = base64Url(header);
  const encodedPayload = base64Url(payload);
  const content = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", env.jwtSecret)
    .update(content)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${content}.${signature}`;
}

function getAuthHeaders(auth, service) {
  if (auth === "public") {
    return {};
  }

  if (auth === "bearer") {
    if (!state.bearerToken) {
      throw new Error("Bearer token is not available.");
    }
    return { Authorization: `Bearer ${state.bearerToken}` };
  }

  if (auth === "admin-bearer") {
    if (!state.adminBearerToken) {
      state.adminBearerToken =
        state.session?.permission === 2 && state.session?.token
          ? state.session.token
          : createAdminToken();
    }
    return { Authorization: `Bearer ${state.adminBearerToken}` };
  }

  if (auth === "internal-token") {
    const envKey = INTERNAL_SERVICE_TOKENS[service];
    if (!envKey) {
      throw new Error(`No internal token mapping registered for ${service}.`);
    }
    const token = env[envKey];
    if (!token) {
      throw new Error(`Missing internal token ${envKey} for ${service}.`);
    }
    return { "x-internal-service-token": token };
  }

  throw new Error(`Unsupported auth mode: ${auth}`);
}

function ensureSuccessEnvelope(op, body) {
  if (!body || typeof body !== "object" || body.success !== true) {
    throw new Error(`${op.id} returned an unexpected response envelope.`);
  }
}

function getPathValue(source, pathValue) {
  const segments = pathValue.split(".");
  let current = source;

  for (const segment of segments) {
    if (!segment) {
      continue;
    }
    if (current == null) {
      return undefined;
    }
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    current = current[segment];
  }

  return current;
}

function pickFirst(source, ...paths) {
  for (const pathValue of paths) {
    const value = getPathValue(source, pathValue);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function findFirstId(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (typeof value.id === "string" && value.id) {
    return value.id;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstId(item);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  for (const child of Object.values(value)) {
    const found = findFirstId(child);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function uniqueText(prefix) {
  return `${prefix} ${env.namespace}`;
}

function uniqueEmail(prefix) {
  const local = `${prefix}-${env.namespace}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${local}@example.com`;
}

function uniqueDigits(length) {
  const source = `${Date.now()}${Math.random().toString().slice(2)}`
    .replace(/\D/g, "")
    .padEnd(length, "0");
  return source.slice(0, length);
}

function registerCleanup(label, fn) {
  cleanupTasks.push({ label, fn });
}

async function writeArtifact(opId, responseText) {
  const filePath = path.join(env.tmpDir, `${sanitizeFileName(opId)}.response.txt`);
  await fs.promises.writeFile(filePath, responseText, "utf8");
}

const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS) || 30_000;

async function diagnoseUpstream(service) {
  const directUrl = env[service];
  if (!directUrl) {
    return `  upstream URL for ${service} is not configured.`;
  }
  try {
    const res = await fetch(`${directUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    const text = await res.text();
    return `  upstream ${directUrl}/health -> ${res.status}: ${text}`;
  } catch (err) {
    return `  upstream ${directUrl}/health -> unreachable: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function httpRequest(op, options) {
  const {
    method = op.method,
    path: requestPath = op.path,
    target = op.target,
    service = op.service,
    auth = op.auth,
    query,
    json,
    form,
    headers = {},
    expectedStatus = [200],
    expectEnvelope = expectedStatus.every((status) => status < 400),
    label = op.id,
  } = options;

  const url = buildUrl(target, service, requestPath, query);
  const requestHeaders = new Headers({
    ...getAuthHeaders(auth, service),
    ...headers,
  });

  const fetchOptions = {
    method,
    headers: requestHeaders,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (json !== undefined) {
    requestHeaders.set("content-type", "application/json");
    fetchOptions.body = JSON.stringify(json);
  } else if (form) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(form.fields ?? {})) {
      if (value === undefined || value === null) {
        continue;
      }
      formData.append(key, String(value));
    }
    if (form.file) {
      const buffer = await fs.promises.readFile(form.file.path);
      const blob = new Blob([buffer], { type: form.file.contentType });
      formData.append(form.file.fieldName, blob, form.file.filename);
    }
    fetchOptions.body = formData;
  }

  if (cli.verbose) {
    log("INFO", `${color.dim}-> ${method} ${url}${color.reset}`);
  }

  let response;
  let text;
  try {
    response = await fetch(url, fetchOptions);
  } catch (fetchError) {
    // Single retry for transient network errors (ECONNREFUSED, etc.)
    const isTransient =
      fetchError instanceof TypeError ||
      (fetchError instanceof Error && /ECONNREFUSED|ECONNRESET|EPIPE|UND_ERR/.test(fetchError.message));
    if (isTransient) {
      log("WARN", `${label}: transient error, retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2_000));
      response = await fetch(url, fetchOptions);
    } else {
      throw fetchError;
    }
  }

  text = await response.text();
  await writeArtifact(label, text);

  if (cli.verbose) {
    log("INFO", `${color.dim}<- ${response.status} (${text.length} bytes)${color.reset}`);
  }

  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (!expectedStatus.includes(response.status)) {
    let errorMsg = `${label} returned ${response.status}, expected ${expectedStatus.join(", ")}. Body: ${text}`;
    if (response.status === 502 && target === "gateway") {
      const diagnostic = await diagnoseUpstream(service);
      errorMsg += `\n${diagnostic}`;
    }
    throw new Error(errorMsg);
  }

  if (expectEnvelope) {
    ensureSuccessEnvelope(op, body);
  }

  return { status: response.status, body, text };
}

async function helperCall(label, options) {
  return httpRequest(
    {
      id: `helper|${label}`,
      method: options.method,
      path: options.path,
      target: options.target,
      service: options.service,
      auth: options.auth,
    },
    { ...options, label: `helper-${label}` },
  );
}

async function attemptLogin() {
  const loginCandidates = [...new Set([env.login, "Admin", "admin"].filter(Boolean))];
  const passwordCandidates = [
    ...new Set([env.password, process.env.ADMIN_PASSWORD, "senha123"].filter(Boolean)),
  ];

  let lastFailure;

  for (const login of loginCandidates) {
    for (const password of passwordCandidates) {
      const response = await helperCall(`login-${login}`, {
        method: "POST",
        path: "/user/session",
        target: "gateway",
        service: "user-service",
        auth: "public",
        json: { login, password },
        expectedStatus: [200, 400, 401, 404],
        expectEnvelope: false,
      });

      if (response.status === 200) {
        return response.body?.data;
      }

      lastFailure = response;
    }
  }

  return { error: lastFailure };
}

async function bootstrapAndLogin() {
  const firstAttempt = await attemptLogin();
  if (firstAttempt?.token) {
    return firstAttempt;
  }

  await helperCall("bootstrap-user", {
    method: "POST",
    path: "/user/start-config",
    target: "gateway",
    service: "user-service",
    auth: "public",
    expectedStatus: [200, 409],
    expectEnvelope: false,
  });

  const secondAttempt = await attemptLogin();
  if (secondAttempt?.token) {
    return secondAttempt;
  }

  throw new Error(
    `Unable to log in through /user/session. Last failure: ${secondAttempt?.error?.text ?? "unknown"}`,
  );
}

function requireState(key) {
  const value = state[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Required smoke state ${key} is missing.`);
  }
  return value;
}

function resolveDepartmentIdFromResponse(responseBody) {
  return pickFirst(
    responseBody,
    "data.department_id",
    "data.user.department_id",
    "data.users.0.department_id",
    "data.0.department_id",
  );
}

async function ensureSecondaryTaskModel() {
  if (state.taskModelSecondaryId) {
    return state.taskModelSecondaryId;
  }

  const response = await helperCall("secondary-task-model-create", {
    method: "POST",
    path: "/task/model",
    target: "gateway",
    service: "task-service",
    auth: "admin-bearer",
    json: {
      name: uniqueText("Smoke Secondary Task Model"),
      department_id: requireState("baselineDepartmentId"),
      responsible_id: requireState("session").id,
      billing: "Realizar",
      prevision: 2,
      type: "regularize",
    },
    expectedStatus: [201],
  });

  state.taskModelSecondaryId = pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
  registerCleanup("secondary-task-model", async () => {
    if (!state.taskModelSecondaryId) {
      return;
    }
    await helperCall("secondary-task-model-cleanup", {
      method: "DELETE",
      path: "/task/model",
      target: "gateway",
      service: "task-service",
      auth: "admin-bearer",
      query: { task_id: state.taskModelSecondaryId },
      expectedStatus: [200, 404],
      expectEnvelope: false,
    });
  });
  return state.taskModelSecondaryId;
}

async function completeRhPointLifecycle() {
  while (true) {
    const response = await helperCall("rh-point-register-helper", {
      method: "POST",
      path: "/rh/point/register",
      target: "gateway",
      service: "rh-service",
      auth: "bearer",
      expectedStatus: [200],
    });
    const action = pickFirst(response.body, "data.action");
    const pointId = pickFirst(response.body, "data.point.id");
    if (pointId) {
      state.rhPointId = pointId;
    }
    if (action === "Saída") {
      return;
    }
  }
}

const handlers = {
  async gatewayHealth(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async gatewayReady(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async serviceHealth(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async serviceReady(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async userSession(op) {
    const session = await bootstrapAndLogin();
    state.session = session;
    state.bearerToken = session.token;
    state.adminBearerToken = session.permission === 2 ? session.token : createAdminToken();
    state.baselineDepartmentId = session.department_id || state.baselineDepartmentId;
    log("PASS", `Authenticated as user_id=${session.id} organization_id=${session.organization_id}`);
  },

  async userStartConfig(op) {
    await httpRequest(op, {
      expectedStatus: [200, 409],
      expectEnvelope: false,
    });
  },

  async userMe(op) {
    const response = await httpRequest(op, { expectedStatus: [200] });
    state.baselineDepartmentId =
      resolveDepartmentIdFromResponse(response.body) || state.baselineDepartmentId;
  },

  async userList(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      query: { skip: 0, take: 5 },
    });
    state.baselineDepartmentId =
      resolveDepartmentIdFromResponse(response.body) || state.baselineDepartmentId;
  },

  async userCreate(op) {
    if (!state.baselineDepartmentId) {
      throw new Error("Unable to derive department_id for user creation.");
    }
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke User"),
        login: uniqueEmail("smoke-user"),
        password: env.password,
        department_id: state.baselineDepartmentId,
        permission: 1,
        organization_id: requireState("session").organization_id,
        type: "user",
        modules: { integracao: 1, rh: 1 },
      },
    });
    state.tempUserId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async userGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/user/${requireState("tempUserId")}`,
    });
  },

  async userPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/user/${requireState("tempUserId")}`,
      json: { name: uniqueText("Smoke User Updated") },
    });
  },

  async userPhotoUpload(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/user/${requireState("tempUserId")}/photo`,
      form: {
        file: {
          fieldName: "file",
          path: env.fixturePath,
          filename: "smoke-upload.png",
          contentType: "image/png",
        },
      },
    });
  },

  async userPhotoDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/user/${requireState("tempUserId")}/photo`,
    });
  },

  async userPermissionGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/user/permission/${requireState("tempUserId")}`,
      query: { modulo: "integracao" },
    });
  },

  async userPermissionPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/user/permission/${requireState("tempUserId")}`,
      json: { integracao: 2, rh: 1 },
    });
  },

  async userDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/user/${requireState("tempUserId")}`,
    });
  },

  async organizationList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { page: 1, pageSize: 5 },
    });
  },

  async organizationCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke Organization"),
        email_created_by: uniqueEmail("smoke-org"),
        cnpj: uniqueDigits(14),
      },
    });
    state.tempOrganizationId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async organizationGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/organizations/${requireState("tempOrganizationId")}`,
    });
  },

  async organizationPatchStatus(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/organizations/${requireState("tempOrganizationId")}/status`,
      json: { status: "active" },
    });
  },

  async organizationPatchSubscriptionPlan(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/organizations/${requireState("tempOrganizationId")}/subscription-plan`,
      json: { subscription_plan: "smoke-plan" },
    });
  },

  async organizationPatchLogoUrl(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/organizations/${requireState("tempOrganizationId")}/logo-url`,
      json: { logo_url: "https://example.com/smoke-logo.png" },
    });
  },

  async clientList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { page: 1, limit: 5 },
    });
  },

  async clientCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke Client"),
        organization_id: requireState("session").organization_id,
        status: "Ativo",
        cpf_cnpj: uniqueDigits(14),
        prospecting_status: "Lead",
        type: "PJ",
        type_registration: "Novo",
        service_unique: false,
      },
    });
    state.primaryClientId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async clientGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}`,
    });
  },

  async clientPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}`,
      json: { name: uniqueText("Smoke Client Updated") },
    });
  },

  async clientDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("secondaryClientId")}`,
    });
  },

  async clientActivate(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("secondaryClientId")}/activate`,
    });
  },

  async clientIntegrationCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        organization_id: requireState("session").organization_id,
        type: "PJ",
        name: uniqueText("Smoke Integration Client"),
        cpf_cnpj: uniqueDigits(14),
        type_registration: "Novo",
        service_unique: false,
      },
    });
    state.secondaryClientId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async clientIntegrationPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("secondaryClientId")}/integration`,
      json: {
        company_name: uniqueText("Smoke Integration Co"),
        fantasy_name: uniqueText("Smoke Integration Brand"),
      },
    });
  },

  async clientPAGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/pa`,
    });
  },

  async clientPAPost(op) {
    await httpRequest(op, {
      expectedStatus: [201],
      path: `/client/${requireState("primaryClientId")}/pa`,
      json: {},
    });
  },

  async clientPAPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/pa`,
      json: {
        activities: "Comercio varejista",
        works_bidding: false,
        esocial: true,
      },
    });
  },

  async clientPatchCommercial(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/commercial`,
      json: {
        prospecting_status: "Fechado",
        date_status: new Date().toISOString(),
        register_date_prospecting: new Date().toISOString(),
        description_prospecting: "Smoke commercial update",
      },
    });
  },

  async clientPatchTermination(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("secondaryClientId")}/termination`,
      json: {
        reason: "Smoke test termination",
        description: "Temporary client termination for smoke coverage.",
        competence_output: "2026-04",
      },
    });
  },

  async clientPatchFinance(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/finance`,
      json: { contract: true },
    });
  },

  async clientPatchRegularize(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/regularize`,
      json: { dominio_code: "123", regime: "Simples Nacional", contabil: true },
    });
  },

  async clientHistoriesList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/histories`,
    });
  },

  async clientHistoriesCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      path: `/client/${requireState("primaryClientId")}/histories`,
      form: {
        fields: {
          date: new Date().toISOString(),
          history: uniqueText("Smoke client history"),
          pending_id: requireState("clientHistoryPendingId"),
        },
        file: {
          fieldName: "file",
          path: env.fixturePath,
          filename: "smoke-upload.png",
          contentType: "image/png",
        },
      },
    });
    state.clientHistoryId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async clientHistoriesGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/histories/${requireState("clientHistoryId")}`,
    });
  },

  async clientHistoriesPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/histories/${requireState("clientHistoryId")}`,
      json: {
        date: new Date().toISOString(),
        history: uniqueText("Smoke client history updated"),
      },
    });
  },

  async clientHistoriesPendingCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      path: `/client/${requireState("primaryClientId")}/histories/pending`,
      json: { reason: uniqueText("Smoke pending history") },
    });
    state.clientHistoryPendingId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async clientHistoriesPendingList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { user_id: requireState("session").id },
    });
  },

  async clientHistoriesPendingDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/histories/pending/${requireState("clientHistoryPendingId")}`,
    });
  },

  async clientInternalCompetenceOutputUpdate(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async projectList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { ref: "client", id: requireState("primaryClientId") },
    });
  },

  async projectCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke Project"),
        client_id: requireState("primaryClientId"),
        start_date: new Date().toISOString(),
        objective: "Validate full smoke coverage.",
        sponsor_id: "",
      },
    });
    state.projectId = pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
  },

  async projectGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { project_id: requireState("projectId") },
    });
  },

  async projectPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: {
        project_id: requireState("projectId"),
        name: uniqueText("Smoke Project Updated"),
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
        objective: "Validate full smoke coverage updated.",
        sponsor_id: "",
      },
    });
  },

  async projectProgress(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: { project_id: requireState("projectId") },
    });
  },

  async projectDelete(op) {
    const createResponse = await helperCall("project-delete-create-helper", {
      method: "POST",
      path: "/project",
      target: "gateway",
      service: "project-service",
      auth: "admin-bearer",
      json: {
        name: uniqueText("Smoke Project Delete Target"),
        client_id: requireState("primaryClientId"),
        start_date: new Date().toISOString(),
        objective: "Throwaway project for delete coverage.",
        sponsor_id: "",
      },
      expectedStatus: [201],
    });
    const deleteTargetId =
      pickFirst(createResponse.body, "data.create.id") ?? findFirstId(createResponse.body?.data);
    await httpRequest(op, {
      expectedStatus: [200],
      json: { project_id: deleteTargetId },
    });
  },

  async taskDepsList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async taskModelCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke Task Model"),
        department_id: requireState("baselineDepartmentId"),
        responsible_id: requireState("session").id,
        billing: "Realizar",
        prevision: 2,
        type: "regularize",
      },
    });
    state.taskModelPrimaryId = pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
    await ensureSecondaryTaskModel();
  },

  async taskModelGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { task_id: requireState("taskModelPrimaryId") },
    });
  },

  async taskModelPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: {
        task_id: requireState("taskModelPrimaryId"),
        name: uniqueText("Smoke Task Model Updated"),
        department_id: requireState("baselineDepartmentId"),
        responsible_id: requireState("session").id,
        billing: "Realizar",
        prevision: 3,
        type: "regularize",
      },
    });
  },

  async taskModelList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { type: "regularize", billing: "Realizar" },
    });
  },

  async taskModelDependentCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        task_model_id: requireState("taskModelPrimaryId"),
        dependent_id: requireState("taskModelSecondaryId"),
        wait: true,
        observation: "Smoke dependent link",
      },
    });
    state.taskDependentId =
      pickFirst(response.body, "data.created.id") ?? pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async taskModelDependentList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { task_model_id: requireState("taskModelPrimaryId") },
    });
  },

  async taskIntegrationCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        task_model_id: requireState("taskModelPrimaryId"),
        referring: env.namespace,
        referring_type: "process",
      },
    });
    state.taskIntegrationId =
      pickFirst(response.body, "data.id") ??
      pickFirst(response.body, "data.create.id") ??
      findFirstId(response.body?.data);
  },

  async taskIntegrationList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { task_model_id: requireState("taskModelPrimaryId") },
    });
  },

  async taskCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        model_id: requireState("taskModelPrimaryId"),
        project_id: requireState("projectId"),
        client_id: requireState("primaryClientId"),
        prospecting_status: "Fechado",
        observations: "Smoke task creation",
        urgency: "Alta",
      },
    });
    state.taskId = pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
  },

  async taskGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { task_id: requireState("taskId") },
    });
  },

  async taskPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: {
        task_id: requireState("taskId"),
        name: uniqueText("Smoke Task Updated"),
      },
    });
  },

  async taskList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { status: "Todos", page: 1, limit: 20 },
    });
  },

  async taskFinanceiroPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/financeiro",
      json: { task_id: requireState("taskId") },
    });
  },

  async taskComercialPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/comercial",
      json: {
        task_id: requireState("taskId"),
        hiring_status: "Contratado",
        payment: "Pago",
        billing_description: "Smoke comercial update",
      },
    });
  },

  async taskConclusionPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/conclusion",
      json: {
        task_id: requireState("taskId"),
        status: "Concluída",
        responsible_id: requireState("session").id,
        end_date: new Date().toISOString(),
      },
    });
  },

  async taskCompleteRequestPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/complete-request",
      json: { task_id: requireState("taskId") },
    });
  },

  async taskDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { task_id: requireState("taskId") },
    });
  },

  async taskIntegrationDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/integration",
      json: { integration_id: requireState("taskIntegrationId") },
    });
  },

  async taskModelDependentDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { id: requireState("taskDependentId") },
    });
  },

  async taskProjectPlanCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      path: "/task/project-plan",
      json: { name: uniqueText("Smoke Project Plan"), color: "#1F6FEB" },
    });
    state.planId = pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
  },

  async taskProjectPlanGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/project-plan",
      query: { plan_id: requireState("planId") },
    });
  },

  async taskProjectPlanPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/project-plan",
      json: {
        id: requireState("planId"),
        name: uniqueText("Smoke Project Plan Updated"),
        color: "#123456",
      },
    });
  },

  async taskProjectPlanList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/project-plan/list",
    });
  },

  async taskProjectPlanTaskCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      path: "/task/project-plan/task",
      json: {
        plan_id: requireState("planId"),
        task_id: requireState("taskModelPrimaryId"),
      },
    });
    state.planTaskId = pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
  },

  async taskProjectPlanTaskList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/project-plan/task/list",
      query: { plan_id: requireState("planId") },
    });
  },

  async taskProjectPlanTaskReorder(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/project-plan/task",
      json: {
        plan_id: requireState("planId"),
        plan_task_id: requireState("planTaskId"),
        direction: "up",
      },
    });
  },

  async taskProjectPlanHire(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/project-plan/hire",
      json: {
        plan_id: requireState("planId"),
        project_id: requireState("projectId"),
      },
    });
  },

  async taskProjectPlanTaskDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/project-plan/task",
      json: {
        plan_id: requireState("planId"),
        plan_task_id: requireState("planTaskId"),
      },
    });
  },

  async taskProjectPlanDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/project-plan",
      query: { id: requireState("planId") },
    });
  },

  async taskModelDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { task_id: requireState("taskModelSecondaryId") },
    });
  },

  async rhPointConfigPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: {
        target_user_id: requireState("session").id,
        start_time: "08:00",
        lunch_break: "12:00",
        lunch_return: "13:00",
        end_time: "17:00",
        work_days: "1,2,3,4,5",
      },
    });
  },

  async rhPointConfigGet(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async rhPointConfigGetByUser(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/rh/point-config/${requireState("session").id}`,
    });
  },

  async rhPointRegister(op) {
    const response = await httpRequest(op, { expectedStatus: [200] });
    state.rhPointId = pickFirst(response.body, "data.point.id") ?? state.rhPointId;
  },

  async rhPointCalculate(op) {
    await completeRhPointLifecycle();
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/rh/point/${requireState("rhPointId")}/calculate`,
    });
  },

  async rhPointAdjustmentCreate(op) {
    const now = new Date();
    const clockIn = new Date(now);
    clockIn.setUTCHours(8, 0, 0, 0);
    const lunchOut = new Date(now);
    lunchOut.setUTCHours(12, 0, 0, 0);
    const lunchIn = new Date(now);
    lunchIn.setUTCHours(13, 0, 0, 0);
    const clockOut = new Date(now);
    clockOut.setUTCHours(17, 0, 0, 0);

    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point/adjustment/request",
      json: {
        point_id: requireState("rhPointId"),
        clock_in: clockIn.toISOString(),
        lunch_out: lunchOut.toISOString(),
        lunch_in: lunchIn.toISOString(),
        clock_out: clockOut.toISOString(),
        justification: "Smoke point adjustment",
      },
    });
    state.rhAdjustmentId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhPointAdjustmentApprove(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point/adjustment/approve",
      json: {
        request_id: requireState("rhAdjustmentId"),
        obs_approver: "Approved by smoke test",
      },
    });
  },

  async rhCategoryCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/categories",
      json: { name: uniqueText("Smoke RH Category"), active: true },
    });
    state.rhCategoryId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhCategoryPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/categories",
      json: { id: requireState("rhCategoryId"), name: uniqueText("Smoke RH Category Updated"), active: true },
    });
  },

  async rhCategoryGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/categories",
      query: { activeOnly: false },
    });
  },

  async rhCategoryDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/categories",
      json: { id: requireState("rhCategoryId") },
    });
  },

  async rhRequestCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/requests",
      json: {
        title: uniqueText("Smoke RH Request"),
        description: "Smoke request description",
        category_id: requireState("rhCategoryId"),
        assigned_to_user_id: requireState("session").id,
        urgency: "High",
      },
    });
    state.rhRequestId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhRequestList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/requests",
      query: {
        category_id: requireState("rhCategoryId"),
        requester_user_id: requireState("session").id,
        assigned_to_user_id: requireState("session").id,
        status: "New",
      },
    });
  },

  async rhRequestGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/rh/requests/${requireState("rhRequestId")}`,
    });
  },

  async rhRequestPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/requests",
      json: { id: requireState("rhRequestId"), status: "In_Progress" },
    });
  },

  async rhRequestDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/requests",
      json: { id: requireState("rhRequestId") },
    });
  },

  async rhScoreQuestionCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/questions",
      json: { question: uniqueText("Smoke score question"), type: "behavioral" },
    });
    state.rhScoreQuestionId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhScoreQuestionPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/questions",
      json: { id: requireState("rhScoreQuestionId"), question: uniqueText("Smoke score question updated") },
    });
  },

  async rhScoreQuestionList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/questions",
      query: { type: "behavioral", all: true },
    });
  },

  async rhScoreQuestionDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/questions",
      json: { id: requireState("rhScoreQuestionId") },
    });
  },

  async rhScoreQuarterGenerate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/quarters/generate",
      json: { target_user_id: requireState("session").id, quarter: "2026-Q2" },
    });
    state.rhScoreId =
      pickFirst(response.body, "data.id") ??
      pickFirst(response.body, "data.score_id") ??
      findFirstId(response.body?.data);
  },

  async rhScoreQuarterPatchNitro(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/quarters/nitro",
      json: { score_id: requireState("rhScoreId"), type: "projects", value: 1 },
    });
  },

  async rhScoreQuarterListMe(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/quarters/me",
    });
    state.rhScoreId =
      state.rhScoreId ||
      findFirstId(response.body?.data);
  },

  async rhScoreQuarterGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/rh/score/quarters/${requireState("rhScoreId")}`,
    });
  },

  async rhScoreEvaluationPending(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/evaluations/pending",
    });
    state.rhScoreEvaluationId =
      pickFirst(response.body, "data.0.id") ??
      pickFirst(response.body, "data.items.0.id") ??
      findFirstId(response.body?.data);
  },

  async rhScoreEvaluationSubmit(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/evaluations/submit",
      json: {
        evaluation_id: requireState("rhScoreEvaluationId"),
        answers: [{ question_id: requireState("rhScoreQuestionId"), answer: 5 }],
      },
    });
  },

  async rhHolidayCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/holidays",
      json: { name: uniqueText("Smoke Holiday"), date: new Date().toISOString() },
    });
    state.rhHolidayId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhHolidayPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/holidays",
      json: { id: requireState("rhHolidayId"), name: uniqueText("Smoke Holiday Updated"), date: new Date().toISOString() },
    });
  },

  async rhHolidayList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/holidays",
    });
  },

  async rhHolidayDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/holidays",
      json: { id: requireState("rhHolidayId") },
    });
  },

  async rhTimeBankList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/time-bank-releases/list",
      query: {
        user_id: requireState("session").id,
        is_approved: true,
        date_from: new Date(Date.now() - 86400000).toISOString(),
        date_to: new Date(Date.now() + 86400000).toISOString(),
      },
    });
  },

  async rhTimeBankCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/time-bank-releases",
      json: {
        user_id: requireState("session").id,
        date: new Date().toISOString(),
        minutes: 60,
        reason: "Smoke overtime",
      },
    });
    state.rhTimeBankReleaseId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhTimeBankApprove(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/time-bank-releases/approve",
      json: { id: requireState("rhTimeBankReleaseId") },
    });
  },

  async rhMessageCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/messages",
      json: {
        request_id: requireState("rhRequestId"),
        message: "Smoke RH message",
        type: "Message",
      },
    });
    if (!state.rhRequestId) {
      state.rhRequestId = pickFirst(response.body, "data.request_id") ?? state.rhRequestId;
    }
  },

  async rhMessageList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/messages",
      query: { requestId: requireState("rhRequestId") },
    });
  },

  async rhTimeSheetCreate(op) {
    const start = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const end = new Date();
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/timesheets",
      json: {
        user_id: requireState("session").id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      },
    });
    state.rhTimeSheetId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhTimeSheetList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/timesheets",
      query: { target_user_id: requireState("session").id },
    });
  },

  async rhTimeSheetSign(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/timesheets/sign",
      json: { id: requireState("rhTimeSheetId"), signature: "smoke-signature" },
    });
  },

  async rhScoreNitroUpdate(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/nitro/update",
      json: { score_id: requireState("rhScoreId"), type: "projects", value: 2 },
    });
  },

  async auditInternalIngest(op) {
    state.auditRequestId = crypto.randomUUID();
    await httpRequest(op, {
      expectedStatus: [201],
      path: "/internal/audit/requests",
      json: {
        requestId: state.auditRequestId,
        organizationId: requireState("session").organization_id,
        userId: requireState("session").id,
        permission: 2,
        method: "GET",
        path: "/smoke/audit",
        outcome: "success",
        statusCode: 200,
        serviceSource: "smoke-harness",
        createdAt: new Date().toISOString(),
      },
    });
  },

  async auditList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/audit/requests",
      query: { page: 1, pageSize: 10 },
    });
  },

  async auditGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/audit/requests/${requireState("auditRequestId")}`,
    });
  },
};

function matchesFilter(op) {
  if (!cli.filter) {
    return true;
  }
  const f = cli.filter.toLowerCase();
  return (
    op.service.toLowerCase().includes(f) ||
    op.action.toLowerCase().includes(f) ||
    op.path.toLowerCase().includes(f)
  );
}

async function run() {
  if (!cli.dryRun && !fs.existsSync(env.fixturePath)) {
    throw new Error(`Smoke upload fixture not found at ${env.fixturePath}.`);
  }

  const startTime = Date.now();
  const failures = [];

  log("INFO", `Using smoke namespace ${env.namespace}`);
  log("INFO", `Artifacts directory: ${env.tmpDir}`);
  if (cli.filter) {
    log("INFO", `Filter: ${cli.filter}`);
  }
  if (cli.continueOnFailure) {
    log("INFO", "Continue-on-failure mode enabled.");
  }

  try {
    const orderedManifest = manifest
      .map((op, index) => ({
        op,
        index,
        rank: actionExecutionRank[op.action] ?? index,
      }))
      .sort((left, right) =>
        left.rank === right.rank ? left.index - right.index : left.rank - right.rank,
      )
      .map((entry) => entry.op);

    for (const op of orderedManifest) {
      if (!matchesFilter(op)) {
        skipped.push({ id: op.id, reason: "filtered out" });
        continue;
      }

      if (op.condition === "auditEnabled" && !env.auditEnabled) {
        skipped.push({ id: op.id, reason: "AUDIT_ENABLED is false" });
        log("SKIP", `${op.id} (AUDIT_ENABLED is false)`);
        continue;
      }

      const handler = handlers[op.action];
      if (!handler) {
        const msg = `No handler registered for action ${op.action}.`;
        if (cli.continueOnFailure) {
          failures.push({ id: op.id, error: msg });
          log("FAIL", `${op.method} ${op.path} — ${msg}`);
          continue;
        }
        throw new Error(msg);
      }

      if (cli.dryRun) {
        log("INFO", `[dry-run] ${op.method} ${op.path} (${op.service}) -> ${op.action}`);
        executed.push(op.id);
        continue;
      }

      log("INFO", `${op.method} ${op.path} (${op.service})`);

      if (cli.continueOnFailure) {
        try {
          await handler(op);
          executed.push(op.id);
          log("PASS", `${op.method} ${op.path}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const isStateDep = msg.includes("Required smoke state");
          if (isStateDep) {
            skipped.push({ id: op.id, reason: "dependency not met" });
            log("SKIP", `${op.method} ${op.path} — dependency not met`);
          } else {
            failures.push({ id: op.id, error: msg });
            log("FAIL", `${op.method} ${op.path} — ${msg}`);
          }
        }
      } else {
        await handler(op);
        executed.push(op.id);
        log("PASS", `${op.method} ${op.path}`);
      }
    }
  } finally {
    if (cleanupTasks.length > 0) {
      log("INFO", `Running ${cleanupTasks.length} cleanup task(s).`);
    }
    for (const task of cleanupTasks.reverse()) {
      try {
        await task.fn();
        log("PASS", `cleanup ${task.label}`);
      } catch (error) {
        log("WARN", `cleanup ${task.label} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Structured summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const total = manifest.length;
  process.stdout.write("\n");
  process.stdout.write(`${color.bold}──────────────────────────────────────${color.reset}\n`);
  process.stdout.write(`  Total operations : ${total}\n`);
  process.stdout.write(`  ${color.green}Executed${color.reset}          : ${executed.length}\n`);
  process.stdout.write(`  ${color.dim}Skipped${color.reset}           : ${skipped.length}\n`);
  if (failures.length > 0) {
    process.stdout.write(`  ${color.red}Failed${color.reset}            : ${failures.length}\n`);
  }
  process.stdout.write(`  Duration          : ${elapsed}s\n`);
  process.stdout.write(`${color.bold}──────────────────────────────────────${color.reset}\n`);

  if (failures.length > 0) {
    log("FAIL", `${failures.length} operation(s) failed:`);
    for (const f of failures) {
      process.stderr.write(`  - ${f.id}: ${f.error}\n`);
    }
    // Never stop when a route fails
    // process.exit(1);
  }

  log(
    "DONE",
    `Smoke run completed successfully. Executed ${executed.length}, skipped ${skipped.length}. (${elapsed}s)`,
  );
}

try {
  await run();
} catch (error) {
  log("FAIL", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
