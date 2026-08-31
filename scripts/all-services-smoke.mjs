import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const envContent = fs.readFileSync(filePath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Mirror the shell wrapper: gateway env first, then workspace root env, with
// explicit caller-provided variables taking precedence over both.
loadEnvFile(path.join(rootDir, "services", "gateway", ".env"));
loadEnvFile(path.join(rootDir, ".env"));

const { manifest } = await import(
  pathToFileURL(path.join(__dirname, "all-services-smoke.manifest.mjs")).href
);
const { getInternalServiceTokenEnvKeys, getServiceUrlDefaults, getServiceUrlEnvKeys } =
  await import(pathToFileURL(path.join(__dirname, "service-registry.mjs")).href);

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

const INTERNAL_SERVICE_TOKENS = getInternalServiceTokenEnvKeys();
const SERVICE_URL_ENV_KEYS = getServiceUrlEnvKeys();
const SERVICE_URL_DEFAULTS = getServiceUrlDefaults();

const WorkspacePermissionLevel = Object.freeze({
  User: 1,
  Admin: 2,
});

const env = {
  gatewayUrl: process.env.GATEWAY_URL?.trim() || "",
  gatewayPort: process.env.GATEWAY_PORT ?? "3010",
  login: process.env.LOGIN ?? "Admin",
  password: process.env.PASSWORD ?? process.env.ADMIN_PASSWORD ?? "senha123",
  platformAdminEmail: process.env.PLATFORM_ADMIN_EMAIL?.trim() || "",
  platformAdminPassword: process.env.PLATFORM_ADMIN_PASSWORD ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  auditEnabled: process.env.AUDIT_ENABLED === "true" || process.env.AUDIT_ENABLED === "1",
  regularizeSmokeEnabled:
    process.env.REGULARIZE_SMOKE_ENABLED === "true" || process.env.REGULARIZE_SMOKE_ENABLED === "1",
  parcelamentoSmokeEnabled:
    process.env.PARCELAMENTO_SMOKE_ENABLED === "true" ||
    process.env.PARCELAMENTO_SMOKE_ENABLED === "1",
  clientReportingSmokeEnabled:
    process.env.CLIENT_REPORTING_SMOKE_ENABLED === "true" ||
    process.env.CLIENT_REPORTING_SMOKE_ENABLED === "1",
  contabilReportingSmokeEnabled:
    process.env.CONTABIL_REPORTING_SMOKE_ENABLED === "true" ||
    process.env.CONTABIL_REPORTING_SMOKE_ENABLED === "1",
  certificateReportingSmokeEnabled:
    process.env.CERTIFICATE_REPORTING_SMOKE_ENABLED === "true" ||
    process.env.CERTIFICATE_REPORTING_SMOKE_ENABLED === "1",
  fiscalReportingSmokeEnabled:
    process.env.FISCAL_REPORTING_SMOKE_ENABLED === "true" ||
    process.env.FISCAL_REPORTING_SMOKE_ENABLED === "1",
  pessoalReportingSmokeEnabled:
    process.env.PESSOAL_REPORTING_SMOKE_ENABLED === "true" ||
    process.env.PESSOAL_REPORTING_SMOKE_ENABLED === "1",
  projectReportingSmokeEnabled:
    process.env.PROJECT_REPORTING_SMOKE_ENABLED === "true" ||
    process.env.PROJECT_REPORTING_SMOKE_ENABLED === "1",
  taskReportingSmokeEnabled:
    process.env.TASK_REPORTING_SMOKE_ENABLED === "true" ||
    process.env.TASK_REPORTING_SMOKE_ENABLED === "1",
  regularizeReportingSmokeEnabled:
    process.env.REGULARIZE_REPORTING_SMOKE_ENABLED === "true" ||
    process.env.REGULARIZE_REPORTING_SMOKE_ENABLED === "1",
  rhReportingSmokeEnabled:
    process.env.RH_REPORTING_SMOKE_ENABLED === "true" ||
    process.env.RH_REPORTING_SMOKE_ENABLED === "1",
  reportsRetentionSmokeEnabled:
    process.env.REPORTS_RETENTION_SMOKE_ENABLED === "true" ||
    process.env.REPORTS_RETENTION_SMOKE_ENABLED === "1",
  reportsLifecycleSmokeEnabled:
    process.env.REPORTS_LIFECYCLE_SMOKE_ENABLED === "true" ||
    process.env.REPORTS_LIFECYCLE_SMOKE_ENABLED === "1",
  namespace:
    process.env.SMOKE_NAMESPACE?.trim() ||
    `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  tmpDir: process.env.SMOKE_TMP_DIR?.trim() || fs.mkdtempSync(path.join(process.cwd(), "smoke-")),
  smokeDepartmentId: process.env.SMOKE_DEPARTMENT_ID?.trim() || "",
  fixturePath:
    process.env.SMOKE_UPLOAD_FIXTURE?.trim() ||
    path.join(rootDir, "scripts", "fixtures", "smoke-upload.png"),
};

env.gatewayUrl =
  env.gatewayUrl ||
  (process.env.GATEWAY_PORT ? `http://localhost:${env.gatewayPort}` : SERVICE_URL_DEFAULTS.gateway);
env.GATEWAY_URL = env.gatewayUrl;
env.gateway = env.gatewayUrl;

for (const [service, envKey] of Object.entries(SERVICE_URL_ENV_KEYS)) {
  env[envKey] =
    (service === "gateway" ? env.gatewayUrl : process.env[envKey]?.trim()) ||
    SERVICE_URL_DEFAULTS[service] ||
    "";
  env[service] = env[envKey];
}

if (!env["fiscal-service"]) {
  env.FISCAL_SERVICE_URL = "http://localhost:3037";
  env["fiscal-service"] = env.FISCAL_SERVICE_URL;
}

if (!env["contabil-service"]) {
  env.CONTABIL_SERVICE_URL = "http://localhost:3038";
  env["contabil-service"] = env.CONTABIL_SERVICE_URL;
}

for (const envKey of Object.values(INTERNAL_SERVICE_TOKENS)) {
  env[envKey] = process.env[envKey]?.trim() || "";
}

const state = {
  session: null,
  sessionCookies: {
    "cw.csrf": "",
    "cw.session": "",
  },
  platformSessionCookies: null,
  platformOrganizationId: "",
  platformOrganizationUpdatedAt: "",
  bearerToken: "",
  adminBearerToken: "",
  baselineDepartmentId: env.smokeDepartmentId,
  departmentId: env.smokeDepartmentId,
  tempUserId: "",
  tempOrganizationId: "",
  primaryClientId: "",
  secondaryClientId: "",
  clientHistoryPendingId: "",
  clientHistoryId: "",
  fiscalIcmsId: "",
  fiscalIcmsCode: "",
  fiscalIpiId: "",
  fiscalIpiNcm: "",
  fiscalNcmId: "",
  fiscalNcmCode: "",
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
  rhTargetUserId: "",
  rhTargetUserSessionCookies: null,
  rhPointDayAlreadyComplete: false,
  auditRequestId: "",
  contabilControlId: "",
  contabilControlCompetence: "",
  contabilResponsibleId: "",
  contabilRelationshipId: "",
  pessoalLddId: "",
  pessoalSituationId: "",
  pessoalUnionId: "",
  pessoalObligationId: "",
  pessoalPasswordId: "",
  pessoalCompetence: "",
  tiRequestCategoryId: "",
  tiRequestId: "",
  tiInventoryCategoryId: "",
  tiInventoryLocationId: "",
  tiInventoryId: "",
  tiStockCategoryId: "",
  tiStockLocationId: "",
  tiStockItemId: "",
  tiPasswordId: "",
  tiExtensionId: "",
  tiTermId: "",
  tiRobotId: "",
  certificatePjId: "",
  certificatePfId: "",
  reportsSnapshotId: process.env.SMOKE_REPORT_SNAPSHOT_ID?.trim() || "",
};

const cleanupTasks = [];
const executed = [];
const skipped = [];
const actionExecutionRank = {
  // rhPointCalculate needs to run AFTER rhPointAdjustmentApprove because:
  // - completeRhPointLifecycle fails the min-interval check (runs too fast)
  // - Adjustment approval sets clock_out and runs calculateDailyHours automatically
  // - After approval, the point is complete so calculate succeeds
  rhPointCalculate: 500,
  projectDelete: 8000,
  rhRequestDelete: 8100,
  rhCategoryDelete: 8200,
  rhScoreQuestionDelete: 8300,
  platformSessionLogout: 9900,
  userSessionLogout: 10000,
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
  const base = target === "gateway" ? env.gatewayUrl : ensureServiceUrl(service);
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

function createAdminToken(permission = WorkspacePermissionLevel.Admin, options = {}) {
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
    permission,
    ...(options.modules ? { modules: options.modules } : {}),
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

function captureSessionCookies(headers) {
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];

  for (const value of values.slice(0, 8)) {
    const [pair] = value.split(";", 1);
    const separator = pair.indexOf("=");
    if (separator <= 0 || pair.length > 4096) {
      continue;
    }

    const name = pair.slice(0, separator);
    if (name === "cw.session" || name === "cw.csrf") {
      state.sessionCookies[name] = pair.slice(separator + 1);
    }
  }
}

function getSessionHeaders(method, cookies = state.sessionCookies) {
  const session = cookies["cw.session"];
  const csrf = cookies["cw.csrf"];
  if (!session || !csrf) {
    throw new Error("Cookie session is not available.");
  }

  const headers = { Cookie: `cw.session=${session}; cw.csrf=${csrf}` };
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    headers["x-csrf-token"] = csrf;
  }
  return headers;
}

function getAuthHeaders(auth, service, method, target, internalTokenEnvKey) {
  if (auth === "public") {
    return {};
  }

  if (auth === "session") {
    return getSessionHeaders(method);
  }

  if (target === "gateway" && (auth === "bearer" || auth === "admin-bearer")) {
    return getSessionHeaders(method);
  }

  if (auth === "bearer") {
    if (service === "certificate-service") {
      return {
        Authorization: `Bearer ${createAdminToken(WorkspacePermissionLevel.User, {
          modules: { certificado: 1 },
        })}`,
      };
    }
    if (!state.bearerToken) {
      throw new Error("Bearer token is not available.");
    }
    return { Authorization: `Bearer ${state.bearerToken}` };
  }

  if (auth === "admin-bearer") {
    if (service === "certificate-service") {
      return {
        Authorization: `Bearer ${createAdminToken(WorkspacePermissionLevel.Admin, {
          modules: { certificado: 2 },
        })}`,
      };
    }
    if (!state.adminBearerToken) {
      state.adminBearerToken =
        state.session?.permission === WorkspacePermissionLevel.Admin && state.session?.token
          ? state.session.token
          : createAdminToken();
    }
    return { Authorization: `Bearer ${state.adminBearerToken}` };
  }

  if (auth === "internal-token") {
    const envKey = internalTokenEnvKey ?? INTERNAL_SERVICE_TOKENS[service];
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

function getTiAdminHeaders() {
  return getSessionHeaders("POST");
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

function uniqueCnpj(scope) {
  const base = [
    ...crypto.createHash("sha256").update(`${env.namespace}:${scope}`).digest().subarray(0, 12),
  ].map((value) => value % 10);
  base[0] = 9;

  const checkDigit = (digits, weights) => {
    const remainder = digits.reduce((sum, digit, index) => sum + digit * weights[index], 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = checkDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit([...base, first], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return [...base, first, second].join("");
}

function registerCleanup(label, fn) {
  cleanupTasks.push({ label, fn });
}

async function runCleanupTasks() {
  const tasks = cleanupTasks.splice(0).reverse();
  if (tasks.length > 0) {
    log("INFO", `Running ${tasks.length} cleanup task(s).`);
  }
  for (const task of tasks) {
    try {
      await task.fn();
      log("PASS", `cleanup ${task.label}`);
    } catch (error) {
      log(
        "WARN",
        `cleanup ${task.label} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function writeArtifact(opId, responseText) {
  const filePath = path.join(env.tmpDir, `${sanitizeFileName(opId)}.response.txt`);
  await fs.promises.writeFile(filePath, responseText, "utf8");
  return filePath;
}

function isBadExpectation(op) {
  return op.expectationKind === "bad";
}

function summarizeResponse(body, text) {
  const raw =
    body !== undefined
      ? JSON.stringify(body)
      : text?.trim()
        ? text.replace(/\s+/g, " ")
        : "<empty>";
  return raw.length > 220 ? `${raw.slice(0, 217)}...` : raw;
}

function shouldLogEndpointResult(label) {
  return !label.startsWith("helper-");
}

async function buildNegativeRequestOverrides(op) {
  switch (op.negativeCase) {
    case "unauthorized401":
      return {
        auth: "public",
        headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
        expectedStatus: op.expectedStatus,
        expectEnvelope: false,
      };
    case "lowPermission403": {
      const sessionCookies = await ensureRhTargetUserSessionCookies();
      return {
        auth: "public",
        headers: getSessionHeaders(op.method, sessionCookies),
        expectedStatus: op.expectedStatus,
        expectEnvelope: false,
      };
    }
    case "internalToken401":
    case "internalToken403":
      return {
        auth: "public",
        headers: { "x-internal-service-token": "smoke_invalid_internal_token" },
        expectedStatus: op.expectedStatus,
        expectEnvelope: false,
      };
    default:
      return null;
  }
}

function formatExpectedStatus(expectedStatus) {
  return expectedStatus.join(", ");
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
  const opOverrides = await buildNegativeRequestOverrides(op);
  const {
    method: optionMethod,
    path: optionPath,
    target: optionTarget,
    service: optionService,
    auth: optionAuth,
    query,
    json,
    form,
    headers: optionHeaders = {},
    expectedStatus: optionExpectedStatus,
    expectEnvelope: optionExpectEnvelope,
    label = op.id,
  } = options;

  const method = opOverrides?.method ?? optionMethod ?? op.method;
  const requestPath = opOverrides?.path ?? optionPath ?? op.path;
  const target = opOverrides?.target ?? optionTarget ?? op.target;
  const service = opOverrides?.service ?? optionService ?? op.service;
  const auth = opOverrides?.auth ?? optionAuth ?? op.auth;
  const expectedStatus = opOverrides?.expectedStatus ??
    optionExpectedStatus ??
    op.expectedStatus ?? [200];
  const expectEnvelope =
    opOverrides?.expectEnvelope ??
    optionExpectEnvelope ??
    op.expectEnvelope ??
    expectedStatus.every((status) => status < 400);

  const url = buildUrl(target, service, requestPath, query);
  const requestHeaders = new Headers({
    ...getAuthHeaders(auth, service, method, target, op.internalTokenEnvKey),
    ...optionHeaders,
    ...(opOverrides?.headers ?? {}),
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
      (fetchError instanceof Error &&
        /ECONNREFUSED|ECONNRESET|EPIPE|UND_ERR/.test(fetchError.message));
    if (isTransient) {
      log("WARN", `${label}: transient error, retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2_000));
      response = await fetch(url, fetchOptions);
    } else {
      throw fetchError;
    }
  }

  captureSessionCookies(response.headers);

  text = await response.text();
  const artifactPath = await writeArtifact(label, text);

  if (cli.verbose) {
    log("INFO", `${color.dim}<- ${response.status} (${text.length} bytes)${color.reset}`);
  }

  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  const summary = summarizeResponse(body, text);
  if (shouldLogEndpointResult(label)) {
    log(
      "INFO",
      `${method} ${url.pathname}${url.search} => expected ${op.expectedLabel} [${formatExpectedStatus(expectedStatus)}], got ${response.status}, body=${summary}, artifact=${artifactPath}`,
    );
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

  return { status: response.status, body, text, artifactPath, summary };
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
        const session = response.body?.data;
        if (session?.token !== undefined) {
          throw new Error("Login response exposed a token.");
        }
        if (session?.id && state.sessionCookies["cw.session"] && state.sessionCookies["cw.csrf"]) {
          return session;
        }
      }

      lastFailure = response;
    }
  }

  return { error: lastFailure };
}

async function bootstrapAndLogin() {
  const firstAttempt = await attemptLogin();
  if (firstAttempt?.id) {
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
  if (secondAttempt?.id) {
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function createParcelamentoReportingGrant({ operation, source, fields, body }) {
  const secret = process.env.REPORTS_GRANT_SECRET?.trim();
  if (!secret) throw new Error("Missing REPORTS_GRANT_SECRET for Parcelamento reporting smoke.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "parcelamento-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createClientIntegrationReportingGrant({ operation, source, fields, body }) {
  const secret = process.env.REPORTS_GRANT_SECRET?.trim();
  if (!secret) throw new Error("Missing REPORTS_GRANT_SECRET for client reporting smoke.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "client-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createContabilReportingGrant({ operation, source, fields, body }) {
  const secret = process.env.REPORTS_GRANT_SECRET?.trim();
  if (!secret) throw new Error("Missing REPORTS_GRANT_SECRET for contabil reporting smoke.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "contabil-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createCertificateReportingGrant({
  operation,
  source,
  fields,
  body,
  secretValue,
  missingSecretMessage = "Missing REPORTS_GRANT_SECRET for certificate reporting smoke.",
}) {
  const secret = secretValue ?? process.env.REPORTS_GRANT_SECRET?.trim();
  if (!secret) throw new Error(missingSecretMessage);

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "certificate-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createFiscalReportingGrant({ operation, source, fields, body }) {
  const secret = process.env.REPORTS_GRANT_SECRET?.trim();
  if (!secret) throw new Error("Missing REPORTS_GRANT_SECRET for fiscal reporting smoke.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "fiscal-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const canonical = canonicalJson(payload);
  const grant = Buffer.from(canonical).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createPessoalReportingGrant({ operation, source, fields, body }) {
  const secret = process.env.REPORTS_GRANT_SECRET?.trim();
  if (!secret) throw new Error("Missing REPORTS_GRANT_SECRET for pessoal reporting smoke.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "pessoal-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createProjectReportingGrant({ operation, source, fields, body }) {
  const secret = process.env.REPORTS_GRANT_SECRET?.trim();
  if (!secret) throw new Error("Missing REPORTS_GRANT_SECRET for project reporting smoke.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "project-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createTaskReportingGrant({ operation, source, fields, body }) {
  const secret = process.env.REPORTS_GRANT_SECRET?.trim();
  if (!secret) throw new Error("Missing REPORTS_GRANT_SECRET for task reporting smoke.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "task-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createRhReportingGrant({ operation, source, fields, body }) {
  const secret = process.env.REPORTS_GRANT_SECRET?.trim();
  if (!secret) throw new Error("Missing REPORTS_GRANT_SECRET for RH reporting smoke.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "rh-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createRegularizeReportingGrant({ operation, source, fields, body }) {
  const secret = process.env.REGULARIZE_REPORTING_GRANT_SECRET?.trim();
  if (!secret)
    throw new Error("Missing REGULARIZE_REPORTING_GRANT_SECRET for regularize reporting smoke.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const payload = {
    audience: "regularize-service",
    body_sha256: crypto.createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireState("session").organization_id,
    request_id: requestId,
    source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": crypto.createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function resolveDepartmentIdFromResponse(responseBody) {
  return pickFirst(
    responseBody,
    "data.department_id",
    "data.dep.id",
    "data.user.department_id",
    "data.users.0.department_id",
    "data.0.department_id",
  );
}

async function ensureDepartmentId() {
  if (state.departmentId) {
    return state.departmentId;
  }

  const response = await helperCall("department-create-helper", {
    method: "POST",
    path: "/department",
    target: "gateway",
    service: "department-service",
    auth: "bearer",
    json: {
      name: uniqueText("Smoke Helper Department"),
      color: "#0F766E",
      solution: true,
    },
    expectedStatus: [201],
  });

  state.departmentId = pickFirst(response.body, "data.dep.id") ?? findFirstId(response.body?.data);
  state.baselineDepartmentId = state.departmentId;
  return state.departmentId;
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
      department_id: await ensureDepartmentId(),
      responsible_id: requireState("session").id,
      billing: "Realizar",
      prevision: 2,
      type: "regularize",
    },
    expectedStatus: [201],
  });

  state.taskModelSecondaryId =
    pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
  registerCleanup("secondary-task-model", async () => {
    if (!state.taskModelSecondaryId) {
      return;
    }
    // Delete any tasks auto-created from this model (e.g. dependent task instances) before removing the model
    const taskListResp = await helperCall("secondary-task-model-tasks-list", {
      method: "GET",
      path: "/task/list",
      target: "gateway",
      service: "task-service",
      auth: "admin-bearer",
      query: {
        status: "Todos",
        page: 1,
        limit: 100,
        search: uniqueText("Smoke Secondary Task Model"),
      },
      expectedStatus: [200],
      expectEnvelope: false,
    });
    const taskRows = taskListResp.body?.data?.data ?? taskListResp.body?.data ?? [];
    for (const task of Array.isArray(taskRows) ? taskRows : []) {
      if (task?.id) {
        await helperCall(`secondary-task-model-task-cleanup-${task.id}`, {
          method: "DELETE",
          path: "/task",
          target: "gateway",
          service: "task-service",
          auth: "admin-bearer",
          query: { task_id: task.id },
          expectedStatus: [200, 404],
          expectEnvelope: false,
        });
      }
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

async function ensureRhTargetUser() {
  if (state.rhTargetUserId) return state.rhTargetUserId;
  const response = await helperCall("rh-target-user-create", {
    method: "POST",
    path: "/user",
    target: "gateway",
    service: "user-service",
    auth: "admin-bearer",
    json: {
      name: uniqueText("Smoke RH Target"),
      login: uniqueEmail("smoke-rh-target"),
      password: env.password,
      department_id: await ensureDepartmentId(),
      permission: 1,
      organization_id: requireState("session").organization_id,
      type: "user",
      modules: { integracao: 1, rh: 1 },
    },
    expectedStatus: [201],
  });
  state.rhTargetUserId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);

  // Set up point config for the target user (required for time-bank-release approval)
  await helperCall("rh-target-user-point-config", {
    method: "PUT",
    path: "/rh/point-config",
    target: "gateway",
    service: "rh-service",
    auth: "admin-bearer",
    json: {
      target_user_id: state.rhTargetUserId,
      start_time: "08:00",
      lunch_break: "12:00",
      lunch_return: "13:00",
      end_time: "17:00",
      work_days: "1,2,3,4,5",
    },
    expectedStatus: [200],
    expectEnvelope: false,
  });

  registerCleanup("rh-target-user", async () => {
    if (!state.rhTargetUserId) return;
    await helperCall("rh-target-user-cleanup", {
      method: "DELETE",
      path: `/user/${state.rhTargetUserId}`,
      target: "gateway",
      service: "user-service",
      auth: "admin-bearer",
      expectedStatus: [200, 404],
      expectEnvelope: false,
    });
  });
  return state.rhTargetUserId;
}

async function ensureRhTargetUserSessionCookies() {
  if (state.rhTargetUserSessionCookies) return state.rhTargetUserSessionCookies;
  await ensureRhTargetUser();
  const adminSessionCookies = { ...state.sessionCookies };
  state.sessionCookies = { "cw.csrf": "", "cw.session": "" };

  try {
    await helperCall("rh-target-user-login", {
      method: "POST",
      path: "/user/session",
      target: "gateway",
      service: "user-service",
      auth: "public",
      json: {
        login: uniqueEmail("smoke-rh-target"),
        password: env.password,
      },
      expectedStatus: [200],
      expectEnvelope: false,
    });
    getSessionHeaders("GET");
    state.rhTargetUserSessionCookies = { ...state.sessionCookies };
  } finally {
    state.sessionCookies = adminSessionCookies;
  }

  return state.rhTargetUserSessionCookies;
}

async function withPlatformSession(fn) {
  const organizationSessionCookies = state.sessionCookies;
  state.sessionCookies = { ...requireState("platformSessionCookies") };

  try {
    const result = await fn();
    state.platformSessionCookies = { ...state.sessionCookies };
    return result;
  } finally {
    state.sessionCookies = organizationSessionCookies;
  }
}

async function platformHttpRequest(op, options = {}) {
  if (isBadExpectation(op)) {
    return httpRequest(op, { ...options, auth: "public" });
  }

  return withPlatformSession(() => httpRequest(op, { ...options, auth: "session" }));
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

  async reportsCatalog(op) {
    await httpRequest(op);
  },

  async reportsSnapshotExport(op) {
    const snapshotId = isBadExpectation(op)
      ? "00000000-0000-4000-8000-000000000003"
      : requireState("reportsSnapshotId");
    await httpRequest(op, {
      path: `/reports/snapshots/${snapshotId}/export`,
      query: { format: isBadExpectation(op) ? "pdf" : "csv" },
      expectEnvelope: false,
      expectedStatus: isBadExpectation(op) ? [400] : [200],
    });
  },

  async reportsJobList(op) {
    await httpRequest(op, { query: { scope: "personal", limit: 10 } });
  },

  async reportsRetentionGet(op) {
    await httpRequest(op);
  },

  async reportsRetentionPut(op) {
    await httpRequest(op, { json: { retention_days: 30 } });
  },

  async reportsSnapshotDelete(op) {
    await httpRequest(op, {
      path: `/reports/snapshots/${requireState("reportsSnapshotId")}/delete`,
      json: { justification: "Smoke lifecycle cleanup with audit." },
      expectEnvelope: false,
    });
  },

  async reportsPreview(op) {
    await httpRequest(op, {
      json: {
        definition: {
          sources: ["parcelamento.installments"],
          columns: [
            {
              source: "parcelamento.installments",
              field: "agreement_number",
              alias: "agreement_number",
            },
          ],
        },
      },
    });
  },

  async reportsPreviewInvalidDefinition(op) {
    await httpRequest(op, { json: { definition: { sources: [] } } });
  },

  async reportsModelCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: op.expectedStatus,
      json: {
        name: uniqueText("Smoke Report Model"),
        definition: {
          sources: ["parcelamento.installments"],
          columns: [
            {
              source: "parcelamento.installments",
              field: "agreement_number",
              alias: "agreement_number",
            },
          ],
        },
      },
    });
    if (op.expectationKind === "good") {
      state.reportsModelId =
        pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
      registerCleanup("reports-model", async () => {
        if (!state.reportsModelId) return;
        await helperCall("reports-model-cleanup", {
          method: "DELETE",
          path: `/reports/models/${state.reportsModelId}`,
          target: "gateway",
          service: "reports-service",
          auth: "bearer",
          expectedStatus: [204, 404],
          expectEnvelope: false,
        });
      });
    }
  },

  async reportsSharedModelCreate(op) {
    const response = await httpRequest(op, {
      json: {
        name: uniqueText("Smoke Shared Report Model"),
        definition: {
          sources: ["parcelamento.installments"],
          columns: [
            {
              source: "parcelamento.installments",
              field: "agreement_number",
              alias: "agreement_number",
            },
          ],
        },
      },
    });
    state.reportsSharedModelId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async reportsSharedModelList(op) {
    await httpRequest(op);
  },

  async reportsSharedModelPatch(op) {
    await httpRequest(op, {
      path: `/reports/models/shared/${requireState("reportsSharedModelId")}`,
      json: {
        name: uniqueText("Smoke Shared Report Model Updated"),
        definition: {
          sources: ["parcelamento.installments"],
          columns: [
            {
              source: "parcelamento.installments",
              field: "agreement_number",
              alias: "agreement_number",
            },
          ],
        },
      },
    });
  },

  async reportsSharedModelCopy(op) {
    await httpRequest(op, {
      expectedStatus: [201],
      path: `/reports/models/shared/${requireState("reportsSharedModelId")}/copy`,
    });
  },

  async reportsSharedModelPreview(op) {
    await httpRequest(op, {
      path: `/reports/models/shared/${requireState("reportsSharedModelId")}/preview`,
    });
  },

  async reportsModelList(op) {
    await httpRequest(op);
  },

  async reportsModelGet(op) {
    await httpRequest(op, {
      expectedStatus: op.expectedStatus,
      path: `/reports/models/${requireState("reportsModelId")}`,
    });
  },

  async reportsModelPatch(op) {
    await httpRequest(op, {
      expectedStatus: op.expectedStatus,
      path: `/reports/models/${requireState("reportsModelId")}`,
      json: { name: uniqueText("Smoke Report Model Updated") },
    });
  },

  async reportsModelDelete(op) {
    await httpRequest(op, {
      expectedStatus: op.expectedStatus,
      path: `/reports/models/${requireState("reportsModelId")}`,
      expectEnvelope: false,
    });
    if (op.expectationKind === "good") state.reportsModelId = null;
  },

  async certificatePjList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { name: uniqueText("Smoke Certificate PJ") },
    });
  },

  async certificatePjCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        client_castelo_status: true,
        client_focus_status: false,
        name: uniqueText("Smoke Certificate PJ"),
        cnpj: uniqueDigits(14),
        responsible: uniqueText("Smoke Certificate Responsible"),
        model: "A1",
        legal_nature: "LTDA",
        password: "smoke-secret",
        expiration_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notes: "Smoke certificate PJ.",
        was_paid: true,
        payment_date: new Date().toISOString(),
        payment_amount: 123.45,
        contact_info: "smoke@example.com",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.certificatePjId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async certificatePjGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/certificate/pj/${requireState("certificatePjId")}`,
    });
  },

  async certificatePjPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/certificate/pj/${requireState("certificatePjId")}`,
      json: {
        notes: "Smoke certificate PJ updated.",
      },
    });
  },

  async certificatePjFileUpload(op) {
    await httpRequest(op, {
      expectedStatus: [201],
      path: `/certificate/pj/${requireState("certificatePjId")}/file`,
      form: {
        file: {
          fieldName: "file",
          path: env.fixturePath,
          filename: "smoke-certificate.pfx",
          contentType: "application/octet-stream",
        },
      },
    });
  },

  async certificatePjFileDownload(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      expectEnvelope: false,
      path: `/certificate/pj/${requireState("certificatePjId")}/file`,
    });
  },

  async certificatePjFileDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/certificate/pj/${requireState("certificatePjId")}/file`,
    });
  },

  async certificatePjDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/certificate/pj/${requireState("certificatePjId")}`,
    });
  },

  async certificatePfList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { search: uniqueText("Smoke Certificate PF") },
    });
  },

  async certificatePfCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        client_castelo_status: true,
        client_focus_status: false,
        name: uniqueText("Smoke Certificate PF"),
        cpf: uniqueDigits(11),
        model: "A1",
        password: "smoke-secret",
        expiration_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        notes: "Smoke certificate PF.",
        enterprise: uniqueText("Smoke Enterprise"),
        cnpj: uniqueDigits(14),
        was_paid: true,
        payment_date: new Date().toISOString(),
        payment_amount: 234.56,
        contact_info: "smoke@example.com",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.certificatePfId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async certificatePfGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/certificate/pf/${requireState("certificatePfId")}`,
    });
  },

  async certificatePfPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/certificate/pf/${requireState("certificatePfId")}`,
      json: {
        notes: "Smoke certificate PF updated.",
      },
    });
  },

  async certificatePfFileUpload(op) {
    await httpRequest(op, {
      expectedStatus: [201],
      path: `/certificate/pf/${requireState("certificatePfId")}/file`,
      form: {
        file: {
          fieldName: "file",
          path: env.fixturePath,
          filename: "smoke-certificate.pfx",
          contentType: "application/octet-stream",
        },
      },
    });
  },

  async certificatePfFileDownload(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      expectEnvelope: false,
      path: `/certificate/pf/${requireState("certificatePfId")}/file`,
    });
  },

  async certificatePfFileDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/certificate/pf/${requireState("certificatePfId")}/file`,
    });
  },

  async certificatePfDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/certificate/pf/${requireState("certificatePfId")}`,
    });
  },

  async certificateNotificationList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async certificateNotificationRun(op) {
    await httpRequest(op, {
      expectedStatus: op.expectedStatus,
      json: {},
    });
  },

  async tiRequestCategoryList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { active: "true" },
    });
  },

  async tiRequestCategoryCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Request Category"),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiRequestCategoryId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiRequestCategoryPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/request-categories/${requireState("tiRequestCategoryId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Request Category Updated"),
      },
    });
  },

  async tiDashboardSummary(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiRequestList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiRequestCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        title: uniqueText("Smoke TI Request"),
        description: "Smoke TI request created by the workspace harness.",
        category_id: requireState("tiRequestCategoryId"),
        urgency: "Medium",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiRequestId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiRequestGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/requests/${requireState("tiRequestId")}`,
    });
  },

  async tiRequestPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/requests/${requireState("tiRequestId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        title: uniqueText("Smoke TI Request Updated"),
      },
    });
  },

  async tiRequestAssign(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/requests/${requireState("tiRequestId")}/assign`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        assigned_to_id: requireState("session").id,
      },
    });
  },

  async tiRequestTransferCandidates(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/requests/${requireState("tiRequestId")}/transfer-candidates`,
    });
  },

  async tiRequestStatusPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/requests/${requireState("tiRequestId")}/status`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        status: "In_Progress",
      },
    });
  },

  async tiRequestMessageList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/requests/${requireState("tiRequestId")}/messages`,
    });
  },

  async tiRequestMessageCreate(op) {
    await httpRequest(op, {
      expectedStatus: [201],
      path: `/ti/requests/${requireState("tiRequestId")}/messages`,
      json: {
        message: "Smoke message for TI request.",
      },
    });
  },

  async tiInventoryCategoryList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiInventoryCategoryCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Inventory Category"),
        tag: "SMK",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiInventoryCategoryId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiInventoryCategoryPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/inventory-categories/${requireState("tiInventoryCategoryId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        tag: "SMK2",
      },
    });
  },

  async tiInventoryLocationList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiInventoryLocationCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Inventory Location"),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiInventoryLocationId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiInventoryLocationPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/inventory-locations/${requireState("tiInventoryLocationId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Inventory Location Updated"),
      },
    });
  },

  async tiInventoryList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiInventoryCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        asset_code: uniqueText("SMOKE-TI-ASSET"),
        category_id: requireState("tiInventoryCategoryId"),
        location_id: requireState("tiInventoryLocationId"),
        notes: "Smoke TI inventory asset.",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiInventoryId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiInventoryGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/inventory/${requireState("tiInventoryId")}`,
    });
  },

  async tiInventoryPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/inventory/${requireState("tiInventoryId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        notes: "Smoke TI inventory asset updated.",
      },
    });
  },

  async tiInventoryAssignUser(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/inventory/${requireState("tiInventoryId")}/assign-user`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        user_id: await ensureRhTargetUser(),
      },
    });
  },

  async tiInventoryReturn(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/inventory/${requireState("tiInventoryId")}/return`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        notes: "Smoke TI inventory asset returned.",
      },
    });
  },

  async tiStockCategoryList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiStockCategoryCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Stock Category"),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiStockCategoryId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiStockCategoryPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/stock/categories/${requireState("tiStockCategoryId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Stock Category Updated"),
      },
    });
  },

  async tiStockLocationList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiStockLocationCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Stock Location"),
        floor: 1,
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiStockLocationId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiStockLocationPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/stock/locations/${requireState("tiStockLocationId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Stock Location Updated"),
      },
    });
  },

  async tiStockItemList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiStockItemCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Stock Item"),
        category_id: requireState("tiStockCategoryId"),
        location_id: requireState("tiStockLocationId"),
        quantity: 10,
        description: "Smoke TI stock item.",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiStockItemId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiStockItemGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/stock/items/${requireState("tiStockItemId")}`,
    });
  },

  async tiStockItemPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/stock/items/${requireState("tiStockItemId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        description: "Smoke TI stock item updated.",
      },
    });
  },

  async tiStockEntryCreate(op) {
    await httpRequest(op, {
      expectedStatus: [201],
      path: `/ti/stock/items/${requireState("tiStockItemId")}/entries`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        quantity: 2,
      },
    });
  },

  async tiStockExitCreate(op) {
    await httpRequest(op, {
      expectedStatus: [201],
      path: `/ti/stock/items/${requireState("tiStockItemId")}/exits`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        quantity: 1,
        requester_id: await ensureRhTargetUser(),
        destination: "Smoke TI stock exit.",
      },
    });
  },

  async tiStockItemMovementsList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/stock/items/${requireState("tiStockItemId")}/movements/list`,
    });
  },

  async tiPasswordList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiPasswordCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        local: uniqueText("Smoke TI Password"),
        user_id: await ensureRhTargetUser(),
        password: "smoke-secret",
        notes: "Smoke TI password entry.",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiPasswordId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiPasswordGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/passwords/${requireState("tiPasswordId")}`,
    });
  },

  async tiPasswordPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/passwords/${requireState("tiPasswordId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        notes: "Smoke TI password entry updated.",
      },
    });
  },

  async tiPasswordDeactivate(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/passwords/${requireState("tiPasswordId")}/deactivate`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        reason: "Smoke credential retired.",
      },
    });
  },

  async tiPasswordDeactivateConflict(op) {
    await httpRequest(op, {
      expectedStatus: [409],
      expectEnvelope: false,
      path: `/ti/passwords/${requireState("tiPasswordId")}/deactivate`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        reason: "Smoke repeated deactivation.",
      },
    });
  },

  async tiExtensionList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiExtensionCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        user_id: await ensureRhTargetUser(),
        number: uniqueDigits(4),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiExtensionId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiExtensionGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/extensions/${requireState("tiExtensionId")}`,
    });
  },

  async tiExtensionPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/extensions/${requireState("tiExtensionId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        number: uniqueDigits(4),
      },
    });
  },

  async tiTermList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiTermCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        date: new Date().toISOString(),
        user_id: await ensureRhTargetUser(),
        reason: "Smoke TI term.",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiTermId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiTermGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/terms/${requireState("tiTermId")}`,
    });
  },

  async tiTermPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/terms/${requireState("tiTermId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        reason: "Smoke TI term updated.",
      },
    });
  },

  async tiTermSign(op) {
    const targetToken = await ensureRhTargetUserSessionCookies();
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/terms/${requireState("tiTermId")}/sign`,
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
      json: {
        reason: "Smoke TI term signed.",
      },
    });
  },

  async tiRobotList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async tiRobotCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        name: uniqueText("Smoke TI Robot"),
        description: "Smoke TI robot registry.",
        type: "Backup",
        schedule: "0 2 * * *",
        status: "active",
        active: true,
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tiRobotId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async tiRobotGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/robots/${requireState("tiRobotId")}`,
    });
  },

  async tiRobotPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/robots/${requireState("tiRobotId")}`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        description: "Smoke TI robot registry updated.",
      },
    });
  },

  async tiRobotRunCreate(op) {
    await httpRequest(op, {
      expectedStatus: [201],
      path: `/ti/robots/${requireState("tiRobotId")}/runs`,
      auth: "public",
      headers: getTiAdminHeaders(),
      json: {
        status: "success",
        message: "Smoke TI robot run.",
        metadata_json: { source: "smoke" },
      },
    });
  },

  async tiRobotRunList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/ti/robots/${requireState("tiRobotId")}/runs/list`,
    });
  },

  async userSession(_op) {
    const session = await bootstrapAndLogin();
    state.session = session;
    state.bearerToken = createAdminToken(session.permission);
    state.adminBearerToken =
      session.permission === WorkspacePermissionLevel.Admin
        ? state.bearerToken
        : createAdminToken();
    state.baselineDepartmentId = session.department_id || state.baselineDepartmentId;
    log(
      "PASS",
      `Authenticated as user_id=${session.id} organization_id=${session.organization_id}`,
    );
  },

  async platformSession(op) {
    if (isBadExpectation(op)) {
      await httpRequest(op, {
        json: {
          email: env.platformAdminEmail || "platform-smoke-invalid@example.com",
          password: `${env.namespace}-invalid-password`,
        },
        expectEnvelope: false,
      });
      return;
    }

    if (!env.platformAdminEmail || !env.platformAdminPassword.trim()) {
      throw new Error(
        "PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required for the platform smoke.",
      );
    }

    const organizationSessionCookies = state.sessionCookies;
    state.sessionCookies = { "cw.csrf": "", "cw.session": "" };

    try {
      const response = await httpRequest(op, {
        json: {
          email: env.platformAdminEmail,
          password: env.platformAdminPassword,
        },
      });
      if (
        response.body?.data?.token !== undefined ||
        response.body?.data?.csrfToken !== undefined
      ) {
        throw new Error("Platform login response exposed session credentials.");
      }
      getSessionHeaders("GET");
      state.platformSessionCookies = { ...state.sessionCookies };
    } finally {
      state.sessionCookies = organizationSessionCookies;
    }
  },

  async platformSessionRefreshMissingCsrf(op) {
    await withPlatformSession(() =>
      httpRequest(op, {
        headers: getSessionHeaders("GET"),
        expectedStatus: [403],
        expectEnvelope: false,
      }),
    );
  },

  async platformSessionRefresh(op) {
    const response = await platformHttpRequest(op, { expectedStatus: [200] });
    if (!isBadExpectation(op) && response.body?.data?.token !== undefined) {
      throw new Error("Platform refresh response exposed a token.");
    }
  },

  async platformMe(op) {
    await platformHttpRequest(op, { expectedStatus: [200] });
  },

  async platformUsers(op) {
    await platformHttpRequest(op, {
      path: `/platform/organizations/${requireState("session").organization_id}/users`,
      query: { skip: 0, take: 5 },
      expectedStatus: [200],
    });
  },

  async platformUserCreate(op) {
    const organizationId = requireState("session").organization_id;
    const departments = await platformHttpRequest(op, {
      path: `/platform/organizations/${organizationId}/departments`,
      expectedStatus: [200],
    });
    const departmentId = pickFirst(departments.body, "data.0.id");
    if (!departmentId) throw new Error("Smoke platform user creation requires one department.");
    await platformHttpRequest(op, {
      path: `/platform/organizations/${organizationId}/users`,
      json: {
        name: uniqueText("Smoke Platform User"),
        login: `${uniqueText("platform.user").replace(/\s+/g, ".").toLowerCase()}@example.test`,
        password: "SmokePassword!123",
        department_id: departmentId,
        permission: 1,
        type: "admin",
        modules: { rh: 1, ti: 1 },
      },
      expectedStatus: isBadExpectation(op) ? op.expectedStatus : [201],
    });
  },

  async platformUserDetail(op) {
    const organizationId = requireState("session").organization_id;
    const listed = await platformHttpRequest(op, {
      path: `/platform/organizations/${organizationId}/users`,
      query: { skip: 0, take: 1 },
      expectedStatus: [200],
    });
    const userId = pickFirst(listed.body, "data.users.0.id");
    if (!userId) throw new Error("Smoke platform user detail requires one organizational user.");
    await platformHttpRequest(op, {
      path: `/platform/organizations/${organizationId}/users/${userId}`,
      expectedStatus: [200],
    });
  },

  async platformUserDeactivate(op) {
    if (isBadExpectation(op)) {
      await platformHttpRequest(op, {
        path: "/platform/organizations/smoke-org/users/smoke-user",
      });
      return;
    }

    const organizationId = requireState("session").organization_id;
    const listed = await platformHttpRequest(op, {
      method: "GET",
      path: `/platform/organizations/${organizationId}/users`,
      query: { skip: 0, take: 100 },
      expectedStatus: [200],
    });
    let user = listed.body?.data?.users?.find(
      (candidate) => candidate?.status === "active" && candidate?.type !== "owner",
    );
    if (!user?.id) {
      const created = await httpRequest(op, {
        method: "POST",
        path: "/user",
        target: "gateway",
        service: "user-service",
        auth: "bearer",
        expectedStatus: [201],
        json: {
          name: uniqueText("Smoke Platform Lifecycle User"),
          login: uniqueEmail("platform-lifecycle-user"),
          password: env.password,
          department_id: await ensureDepartmentId(),
          permission: 1,
          organization_id: organizationId,
          type: "user",
          modules: { integracao: 1, rh: 1 },
        },
      });
      user = { id: pickFirst(created.body, "data.id") ?? findFirstId(created.body?.data) };
    }
    if (!user.id) {
      throw new Error("Smoke platform user lifecycle could not create an active non-owner user.");
    }

    state.platformLifecycleUserId = user.id;
    await platformHttpRequest(op, {
      path: `/platform/organizations/${organizationId}/users/${user.id}`,
      expectedStatus: [200],
    });
  },

  async platformUserReactivate(op) {
    if (isBadExpectation(op)) {
      await platformHttpRequest(op, {
        path: "/platform/organizations/smoke-org/users/smoke-user/reactivate",
      });
      return;
    }

    const organizationId = requireState("session").organization_id;
    await platformHttpRequest(op, {
      path: `/platform/organizations/${organizationId}/users/${requireState("platformLifecycleUserId")}/reactivate`,
      expectedStatus: [200],
    });
  },

  async platformDepartments(op) {
    await platformHttpRequest(op, {
      path: `/platform/organizations/${requireState("session").organization_id}/departments`,
      expectedStatus: [200],
    });
  },

  async platformOrganizations(op) {
    await platformHttpRequest(op, {
      query: { page: 1, pageSize: 5 },
      expectedStatus: [200],
    });
  },

  async platformOrganizationCreate(op) {
    const response = await platformHttpRequest(op, {
      json: {
        name: uniqueText("Smoke Platform Organization"),
        cnpj: uniqueCnpj("platform"),
      },
      expectedStatus: isBadExpectation(op) ? op.expectedStatus : [201],
    });
    if (isBadExpectation(op)) {
      return;
    }

    state.platformOrganizationId = pickFirst(response.body, "data.id") ?? "";
    state.platformOrganizationUpdatedAt = pickFirst(response.body, "data.updated_at") ?? "";
    requireState("platformOrganizationId");
    requireState("platformOrganizationUpdatedAt");
  },

  async platformOrganizationGet(op) {
    await platformHttpRequest(op, {
      path: `/platform/organizations/${requireState("platformOrganizationId")}`,
      expectedStatus: op.expectedStatus,
    });
  },

  async platformOrganizationPlanUpdate(op) {
    const response = await platformHttpRequest(op, {
      path: `/platform/organizations/${requireState("platformOrganizationId")}/subscription-plan`,
      json: {
        subscription_plan: "pro",
        expected_updated_at: requireState("platformOrganizationUpdatedAt"),
      },
      expectedStatus: op.expectedStatus,
    });
    if (!isBadExpectation(op)) {
      state.platformOrganizationUpdatedAt = pickFirst(response.body, "data.updated_at") ?? "";
      requireState("platformOrganizationUpdatedAt");
    }
  },

  async platformOrganizationLogoUpdate(op) {
    const response = await platformHttpRequest(op, {
      path: `/platform/organizations/${requireState("platformOrganizationId")}/logo-url`,
      json: {
        logo_url: `https://example.com/smoke/${encodeURIComponent(env.namespace)}.png`,
        expected_updated_at: requireState("platformOrganizationUpdatedAt"),
      },
      expectedStatus: op.expectedStatus,
    });
    if (!isBadExpectation(op)) {
      state.platformOrganizationUpdatedAt = pickFirst(response.body, "data.updated_at") ?? "";
      requireState("platformOrganizationUpdatedAt");
    }
  },

  async platformOrganizationStatusUpdate(op) {
    const response = await platformHttpRequest(op, {
      path: `/platform/organizations/${requireState("platformOrganizationId")}/status`,
      json: {
        status: "cancelled",
        expected_updated_at: requireState("platformOrganizationUpdatedAt"),
      },
      expectedStatus: op.expectedStatus,
    });
    if (!isBadExpectation(op)) {
      state.platformOrganizationUpdatedAt = pickFirst(response.body, "data.updated_at") ?? "";
      requireState("platformOrganizationUpdatedAt");
    }
  },

  async platformAuditList(op) {
    await platformHttpRequest(op, {
      query: { page: 1, pageSize: 10 },
      expectedStatus: [200],
    });
  },

  async platformSessionLogout(op) {
    await platformHttpRequest(op, { expectedStatus: [200] });
    if (isBadExpectation(op)) {
      return;
    }
    const cookies = requireState("platformSessionCookies");
    if (cookies["cw.session"] || cookies["cw.csrf"]) {
      throw new Error("Platform logout did not expire both session cookies.");
    }
  },

  async userSessionRefreshMissingCsrf(op) {
    await httpRequest(op, {
      auth: "public",
      headers: getSessionHeaders("GET"),
      expectedStatus: [403],
      expectEnvelope: false,
    });
  },

  async userSessionRefresh(op) {
    const response = await httpRequest(op, { expectedStatus: [200] });
    if (response.body?.data?.token !== undefined) {
      throw new Error("Refresh response exposed a token.");
    }
    state.session = response.body?.data ?? state.session;
  },

  async userSessionLogout(op) {
    await runCleanupTasks();
    await httpRequest(op, { expectedStatus: [200] });
    if (isBadExpectation(op)) {
      return;
    }
    if (state.sessionCookies["cw.session"] || state.sessionCookies["cw.csrf"]) {
      throw new Error("Logout did not expire both session cookies.");
    }
  },

  async reportingAccessContext(op) {
    await httpRequest(op, {
      path: "/internal/reporting/access-context",
      json: {
        userId: requireState("session").id,
        organizationId: requireState("session").organization_id,
      },
    });
  },

  async parcelamentoReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createParcelamentoReportingGrant({
            operation: "catalog",
            source: "parcelamento.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async parcelamentoReportingExtract(op) {
    const body = { source: "parcelamento.installments", fields: ["status"], limit: 1 };
    await httpRequest(op, {
      path: "/internal/reporting/extract",
      json: body,
      headers: isBadExpectation(op)
        ? {}
        : createParcelamentoReportingGrant({
            operation: "extract",
            source: body.source,
            fields: body.fields,
            body,
          }),
    });
  },

  async clientIntegrationReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createClientIntegrationReportingGrant({
            operation: "catalog",
            source: "integracao.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async clientIntegrationReportingExtract(op) {
    const body = { source: "integracao.clients", fields: ["name"], limit: 1 };
    await httpRequest(op, {
      path: "/internal/reporting/extract",
      json: body,
      headers: isBadExpectation(op)
        ? {}
        : createClientIntegrationReportingGrant({
            operation: "extract",
            source: body.source,
            fields: body.fields,
            body,
          }),
    });
  },

  async projectReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createProjectReportingGrant({
            operation: "catalog",
            source: "integracao.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async projectReportingExtract(op) {
    const body = { source: "integracao.projects", fields: ["name"], limit: 1 };
    await httpRequest(op, {
      path: "/internal/reporting/extract",
      json: body,
      headers: isBadExpectation(op)
        ? {}
        : createProjectReportingGrant({
            operation: "extract",
            source: body.source,
            fields: body.fields,
            body,
          }),
    });
  },

  async taskReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createTaskReportingGrant({
            operation: "catalog",
            source: "integracao.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async taskReportingExtract(op) {
    const body = { source: "integracao.tasks", fields: ["name"], limit: 1 };
    await httpRequest(op, {
      path: "/internal/reporting/extract",
      json: body,
      headers: isBadExpectation(op)
        ? {}
        : createTaskReportingGrant({
            operation: "extract",
            source: body.source,
            fields: body.fields,
            body,
          }),
    });
  },

  async rhReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createRhReportingGrant({
            operation: "catalog",
            source: "rh.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async rhReportingExtract(op) {
    const body = { source: "rh.requests", fields: ["title"], limit: 1 };
    await httpRequest(op, {
      path: "/internal/reporting/extract",
      json: body,
      headers: isBadExpectation(op)
        ? {}
        : createRhReportingGrant({
            operation: "extract",
            source: body.source,
            fields: body.fields,
            body,
          }),
    });
  },

  async contabilReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createContabilReportingGrant({
            operation: "catalog",
            source: "contabil.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async contabilReportingExtract(op) {
    const body = { source: "contabil.control", fields: ["competence"], limit: 1 };
    await httpRequest(op, {
      path: "/internal/reporting/extract",
      json: body,
      headers: isBadExpectation(op)
        ? {}
        : createContabilReportingGrant({
            operation: "extract",
            source: body.source,
            fields: body.fields,
            body,
          }),
    });
  },

  async certificateReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createCertificateReportingGrant({
            operation: "catalog",
            source: "certificado.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async certificateReportingExtract(op) {
    const requests = [
      {
        body: { source: "certificado.pj", fields: ["name"], limit: 1 },
        headers: {},
      },
      {
        body: { source: "certificado.pf", fields: ["name"], limit: 1 },
        headers: {
          "x-internal-service-token": process.env.CERTIFICATE_REPORTING_TOKEN?.trim(),
        },
        secretValue: process.env.CERTIFICATE_REPORTING_GRANT_SECRET?.trim(),
        missingSecretMessage:
          "Missing CERTIFICATE_REPORTING_GRANT_SECRET for certificate PF reporting smoke.",
      },
    ];

    for (const { body, headers, secretValue, missingSecretMessage } of requests) {
      await httpRequest(op, {
        path: "/internal/reporting/extract",
        json: body,
        headers: isBadExpectation(op)
          ? {}
          : {
              ...headers,
              ...createCertificateReportingGrant({
                operation: "extract",
                source: body.source,
                fields: body.fields,
                body,
                secretValue,
                missingSecretMessage,
              }),
            },
      });
    }
  },

  async fiscalReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createFiscalReportingGrant({
            operation: "catalog",
            source: "fiscal.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async fiscalReportingExtract(op) {
    const bodies = [
      { source: "fiscal.icms", fields: ["state"], limit: 1 },
      { source: "fiscal.ncm", fields: ["ncm_code"], limit: 1 },
      { source: "fiscal.ipi", fields: ["ncm"], limit: 1 },
    ];
    for (const body of bodies) {
      await httpRequest(op, {
        path: "/internal/reporting/extract",
        json: body,
        headers: isBadExpectation(op)
          ? {}
          : createFiscalReportingGrant({
              operation: "extract",
              source: body.source,
              fields: body.fields,
              body,
            }),
      });
    }
  },

  async pessoalReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createPessoalReportingGrant({
            operation: "catalog",
            source: "pessoal.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async pessoalReportingExtract(op) {
    const body = { source: "pessoal.ldd", fields: ["type"], limit: 1 };
    await httpRequest(op, {
      path: "/internal/reporting/extract",
      json: body,
      headers: isBadExpectation(op)
        ? {}
        : createPessoalReportingGrant({
            operation: "extract",
            source: body.source,
            fields: body.fields,
            body,
          }),
    });
  },

  async regularizeReportingCatalog(op) {
    await httpRequest(op, {
      path: "/internal/reporting/catalog",
      headers: isBadExpectation(op)
        ? {}
        : createRegularizeReportingGrant({
            operation: "catalog",
            source: "regularize.catalog",
            fields: [],
            body: {},
          }),
    });
  },

  async regularizeReportingExtract(op) {
    const body = { source: "regularize.licenses", fields: ["protocol"], limit: 1 };
    await httpRequest(op, {
      path: "/internal/reporting/extract",
      json: body,
      headers: isBadExpectation(op)
        ? {}
        : createRegularizeReportingGrant({
            operation: "extract",
            source: body.source,
            fields: body.fields,
            body,
          }),
    });
  },

  async userStartConfig(op) {
    await httpRequest(op, {
      expectedStatus: [200, 409],
      expectEnvelope: false,
    });
  },

  async userMe(op) {
    const response = await httpRequest(op, { expectedStatus: [200] });
    if (isBadExpectation(op)) {
      return;
    }
    state.baselineDepartmentId =
      resolveDepartmentIdFromResponse(response.body) || state.baselineDepartmentId;
  },

  async userList(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      query: { skip: 0, take: 5 },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.baselineDepartmentId =
      resolveDepartmentIdFromResponse(response.body) || state.baselineDepartmentId;
  },

  async userCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke User"),
        login: uniqueEmail("smoke-user"),
        password: env.password,
        department_id: await ensureDepartmentId(),
        permission: 1,
        organization_id: requireState("session").organization_id,
        type: "user",
        modules: { integracao: 1, rh: 1 },
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tempUserId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async userGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/user/${requireState("tempUserId")}`,
    });
  },

  async userPut(op) {
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

  async userPhotoGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/user/${requireState("tempUserId")}/photo`,
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
        cnpj: uniqueCnpj("legacy"),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.tempOrganizationId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
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

  async departmentList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { status: "Ativo" },
    });
  },

  async departmentCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke Department"),
        color: "#0F766E",
        solution: true,
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.departmentId =
      pickFirst(response.body, "data.dep.id") ?? findFirstId(response.body?.data);
  },

  async departmentGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { dep_id: await ensureDepartmentId() },
    });
  },

  async departmentPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: {
        dep_id: await ensureDepartmentId(),
        name: uniqueText("Smoke Department Updated"),
        color: "#1D4ED8",
        status: "Ativo",
        solution: false,
      },
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
    if (isBadExpectation(op)) {
      return;
    }
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
    if (isBadExpectation(op)) {
      return;
    }
    state.secondaryClientId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
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
    // Do NOT send pending_id: the service auto-deletes the pending on link, which would break
    // clientHistoriesPendingDelete that runs later
    const response = await httpRequest(op, {
      expectedStatus: [201],
      path: `/client/${requireState("primaryClientId")}/histories`,
      form: {
        fields: {
          date: new Date().toISOString(),
          history: uniqueText("Smoke client history"),
        },
        file: {
          fieldName: "file",
          path: env.fixturePath,
          filename: "smoke-upload.png",
          contentType: "image/png",
        },
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.clientHistoryId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async clientHistoriesGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/histories/${requireState("clientHistoryId")}`,
    });
  },

  async clientHistoriesFile(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/client/${requireState("primaryClientId")}/histories/${requireState("clientHistoryId")}/file`,
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
    if (isBadExpectation(op)) {
      return;
    }
    state.clientHistoryPendingId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async clientHistoriesPendingList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
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

  async projectMetrics(op) {
    await httpRequest(op, {
      expectedStatus: [200],
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
    if (isBadExpectation(op)) {
      return;
    }
    state.projectId =
      pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
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

  async projectDeleteAutoForbidden(op) {
    await httpRequest(op, {
      expectedStatus: [403],
      json: { project_id: requireState("projectId") },
    });
  },

  async fiscalNcmCreate(op) {
    const ncmCode = uniqueDigits(8);
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        tax_regime: "Simples Nacional",
        ncm_code: ncmCode,
        federal_taxation_type: "Monofásica",
        description: uniqueText("Smoke Fiscal NCM"),
        validity_start_date: new Date().toISOString(),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.fiscalNcmId =
      pickFirst(response.body, "data.create.id") ??
      pickFirst(response.body, "data.id") ??
      findFirstId(response.body?.data);
    state.fiscalNcmCode = ncmCode;
  },

  async fiscalNcmCreateInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      json: {
        ncm_code: uniqueDigits(8),
      },
    });
  },

  async fiscalNcmGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { ncm_id: requireState("fiscalNcmId") },
    });
  },

  async fiscalNcmList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { ncmCodes: requireState("fiscalNcmCode") },
    });
  },

  async fiscalNcmPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: {
        ncm_id: requireState("fiscalNcmId"),
        tax_regime: "Simples Nacional",
        ncm_code: requireState("fiscalNcmCode"),
        federal_taxation_type: "Monofásica",
        description: uniqueText("Smoke Fiscal NCM Updated"),
        validity_start_date: new Date().toISOString(),
      },
    });
  },

  async fiscalNcmSearch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { ncmCode: requireState("fiscalNcmCode") },
    });
  },

  async fiscalNcmSearchInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      query: { ncmCode: "" },
    });
  },

  async fiscalNcmDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { ncm_id: requireState("fiscalNcmId") },
    });
  },

  async fiscalIcmsCreate(op) {
    const icmsCode = uniqueText("Smoke Fiscal ICMS");
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        state: "SP",
        item_number: uniqueDigits(4),
        cest_code: `${uniqueDigits(2)}.${uniqueDigits(3)}.${uniqueDigits(2)}`,
        description: icmsCode,
        interstate_agreement: "Convênio ICMS",
        applied_original_mva: "10.00",
        adjusted_mva: "12.00",
        original_mva: "8.00",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.fiscalIcmsId =
      pickFirst(response.body, "data.create.id") ??
      pickFirst(response.body, "data.id") ??
      findFirstId(response.body?.data);
    state.fiscalIcmsCode = icmsCode;
  },

  async fiscalIcmsCreateInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      json: {
        description: uniqueText("Smoke Invalid ICMS"),
      },
    });
  },

  async fiscalIcmsGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { icms_id: requireState("fiscalIcmsId") },
    });
  },

  async fiscalIcmsList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { icmsCodes: requireState("fiscalIcmsCode") },
    });
  },

  async fiscalIcmsPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: {
        icms_id: requireState("fiscalIcmsId"),
        state: "SP",
        item_number: uniqueDigits(4),
        cest_code: `${uniqueDigits(2)}.${uniqueDigits(3)}.${uniqueDigits(2)}`,
        description: requireState("fiscalIcmsCode"),
        interstate_agreement: "Convênio ICMS atualizado",
        applied_original_mva: "11.00",
        adjusted_mva: "13.00",
        original_mva: "9.00",
      },
    });
  },

  async fiscalIcmsDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { icms_id: requireState("fiscalIcmsId") },
    });
  },

  async fiscalIpiCreate(op) {
    const ncm = uniqueDigits(8);
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        ncm,
        ex: uniqueDigits(3),
        description: uniqueText("Smoke Fiscal IPI"),
        aliquot: "10.00",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.fiscalIpiId =
      pickFirst(response.body, "data.create.id") ??
      pickFirst(response.body, "data.id") ??
      findFirstId(response.body?.data);
    state.fiscalIpiNcm = ncm;
  },

  async fiscalIpiCreateInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      json: {
        description: uniqueText("Smoke Invalid IPI"),
      },
    });
  },

  async fiscalIpiGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { ipi_id: requireState("fiscalIpiId") },
    });
  },

  async fiscalIpiList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { ipiCodes: requireState("fiscalIpiNcm") },
    });
  },

  async fiscalIpiPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: {
        ipi_id: requireState("fiscalIpiId"),
        ncm: requireState("fiscalIpiNcm"),
        ex: uniqueDigits(3),
        description: uniqueText("Smoke Fiscal IPI Updated"),
        aliquot: "12.00",
      },
    });
  },

  async fiscalIpiDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { ipi_id: requireState("fiscalIpiId") },
    });
  },

  async contabilControlCreate(op) {
    const competence =
      `${env.namespace}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || `comp-${uniqueDigits(8)}`;
    state.contabilControlCompetence = competence;
    const response = await httpRequest(op, {
      expectedStatus: [200, 201],
      json: {
        client_id: requireState("primaryClientId"),
        competence,
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    const id =
      pickFirst(response.body, "data.control.id", "data.id") ?? findFirstId(response.body?.data);
    if (id) {
      state.contabilControlId = id;
    }
  },

  async contabilControlCreateInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      json: { client_id: "not-a-uuid", competence: "" },
    });
  },

  async contabilControlDetail(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: {
        client_id: requireState("primaryClientId"),
        competence: requireState("contabilControlCompetence"),
      },
    });
  },

  async contabilControlPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/contabil/controls/${requireState("contabilControlId")}`,
      json: { field: "monthly_closing", value: true },
    });
  },

  async contabilControlPatchNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/contabil/controls/00000000-0000-0000-0000-000000000000",
      json: { field: "monthly_closing", value: false },
    });
  },

  async contabilResponsibleCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        client_id: requireState("secondaryClientId"),
        customer_with_movement: true,
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    const id = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
    if (id) {
      state.contabilResponsibleId = id;
    }
  },

  async contabilResponsibleCreateInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      json: {},
    });
  },

  async contabilResponsibleGetByClient(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/contabil/responsibles/client/${requireState("secondaryClientId")}`,
    });
  },

  async contabilResponsibleUpdate(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/contabil/responsibles/${requireState("contabilResponsibleId")}`,
      json: { customer_with_movement: false },
    });
  },

  async contabilResponsibleUpdateNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/contabil/responsibles/00000000-0000-0000-0000-000000000000",
      json: { customer_with_movement: true },
    });
  },

  async contabilResponsibleDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/contabil/responsibles/${requireState("contabilResponsibleId")}`,
    });
  },

  async contabilRelationshipCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        client_id: requireState("primaryClientId"),
        bidding: false,
        chart_accounts: uniqueText("Smoke chart"),
        tool: "Ferramenta smoke",
        system: "Sistema smoke",
        note: uniqueText("Smoke relationship note"),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    const id = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
    if (id) {
      state.contabilRelationshipId = id;
    }
  },

  async contabilRelationshipCreateInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      json: { client_id: requireState("primaryClientId") },
    });
  },

  async contabilRelationshipGetByClient(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/contabil/relationships/client/${requireState("primaryClientId")}`,
    });
  },

  async contabilRelationshipUpdate(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/contabil/relationships/${requireState("contabilRelationshipId")}`,
      json: { note: uniqueText("Smoke relationship updated") },
    });
  },

  async contabilRelationshipUpdateNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/contabil/relationships/00000000-0000-0000-0000-000000000000",
      json: { note: "not found smoke" },
    });
  },

  async contabilRelationshipDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/contabil/relationships/${requireState("contabilRelationshipId")}`,
    });
  },

  async pessoalLddList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { client_id: requireState("primaryClientId") },
    });
  },

  async pessoalLddCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        client_id: requireState("primaryClientId"),
        type: "FGTS",
        period: "Mensal",
        due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        balance_amount: 123.45,
        registration_status: "Regular",
        status: "Em aberto",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.pessoalLddId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async pessoalLddPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/ldd/${requireState("pessoalLddId")}`,
      json: { status: "Regular" },
    });
  },

  async pessoalLddDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/ldd/${requireState("pessoalLddId")}`,
    });
  },

  async pessoalSituationList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { client_id: requireState("primaryClientId") },
    });
  },

  async pessoalSituationCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        client_id: requireState("primaryClientId"),
        title: uniqueText("Smoke Situation"),
        description: "Smoke situation description.",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.pessoalSituationId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async pessoalSituationGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/situations/${requireState("pessoalSituationId")}`,
    });
  },

  async pessoalSituationPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/situations/${requireState("pessoalSituationId")}`,
      json: { status: "Finalizado" },
    });
  },

  async pessoalSituationDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/situations/${requireState("pessoalSituationId")}`,
    });
  },

  async pessoalUnionList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async pessoalUnionCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke Union"),
        cnpj: uniqueDigits(14),
        base_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.pessoalUnionId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async pessoalUnionGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/unions/${requireState("pessoalUnionId")}`,
    });
  },

  async pessoalUnionPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/unions/${requireState("pessoalUnionId")}`,
      json: { name: uniqueText("Smoke Union Updated") },
    });
  },

  async pessoalUnionDelete(op) {
    if (isBadExpectation(op)) {
      await httpRequest(op, {
        expectedStatus: [401],
        path: "/pessoal/unions/40000000-0000-4000-8000-000000000002",
      });
      return;
    }

    const created = await httpRequest(op, {
      method: "POST",
      path: "/pessoal/unions",
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke Union To Delete"),
        cnpj: uniqueDigits(14),
        base_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    const temporaryUnionId = pickFirst(created.body, "data.id") ?? findFirstId(created.body?.data);

    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/unions/${temporaryUnionId}`,
    });
  },

  async pessoalPayrollCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        client_id: requireState("primaryClientId"),
        responsible_id: requireState("session").id,
        advance: true,
        advance_type: "percentual",
        advance_amount: 40,
        info: "Smoke payroll info.",
        previous: false,
        onvio: true,
        group: "A",
        vt: true,
        vt_value: 220,
        vt_type: "mensal",
        va: true,
        assistance_fee: true,
        union_id: requireState("pessoalUnionId"),
        bem_mais: false,
        bsf: true,
        reinf: false,
        employees: 3,
        contact: "smoke@example.com",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    findFirstId(response.body?.data);
  },

  async pessoalPayrollGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/payroll/${requireState("primaryClientId")}`,
    });
  },

  async pessoalPayrollPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/payroll/${requireState("primaryClientId")}`,
      json: { info: "Smoke payroll updated." },
    });
  },

  async pessoalObligationCreate(op) {
    state.pessoalCompetence ||= "2099-12";
    const response = await httpRequest(op, {
      expectedStatus: [200, 201],
      json: {
        client_id: requireState("primaryClientId"),
        competence: state.pessoalCompetence,
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.pessoalObligationId =
      pickFirst(response.body, "data.obligation.id") ?? findFirstId(response.body?.data);
  },

  async pessoalObligationGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: {
        client_id: requireState("primaryClientId"),
        competence: requireState("pessoalCompetence"),
      },
    });
  },

  async pessoalObligationPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/obrigations/${requireState("pessoalObligationId")}`,
      json: { payroll: true },
    });
  },

  async pessoalObligationGenerate(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/obrigations/competences/${requireState("pessoalCompetence")}/generate`,
    });
  },

  async pessoalPasswordList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      query: { client_id: requireState("primaryClientId") },
    });
  },

  async pessoalPasswordCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        client_id: requireState("primaryClientId"),
        service_name: uniqueText("Smoke Password"),
        login_main: "smoke-login",
        senha_main: "smoke-password",
        login_secondary: "smoke-login-2",
        senha_secondary: "smoke-password-2",
        responsavel_id: requireState("session").id,
        notes: "Smoke password notes.",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.pessoalPasswordId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async pessoalPasswordGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/passwords/${requireState("pessoalPasswordId")}`,
    });
  },

  async pessoalPasswordPatch(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/passwords/${requireState("pessoalPasswordId")}`,
      json: {
        notes: "Smoke password notes updated.",
        senha_main: "smoke-password-updated",
      },
    });
  },

  async pessoalPasswordDelete(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/pessoal/passwords/${requireState("pessoalPasswordId")}`,
    });
  },

  async pessoalUnionNotificationsRun(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/internal/pessoal/union-notifications/run",
    });
  },

  async taskDepsList(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async taskDepsOptions(op) {
    await httpRequest(op, { expectedStatus: [200] });
  },

  async taskModelCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [201],
      json: {
        name: uniqueText("Smoke Task Model"),
        department_id: await ensureDepartmentId(),
        responsible_id: requireState("session").id,
        billing: "Realizar",
        prevision: 2,
        type: "regularize",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.taskModelPrimaryId =
      pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
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
        department_id: await ensureDepartmentId(),
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
    if (isBadExpectation(op)) {
      return;
    }
    state.taskDependentId =
      pickFirst(response.body, "data.created.id") ??
      pickFirst(response.body, "data.id") ??
      findFirstId(response.body?.data);
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
    if (isBadExpectation(op)) {
      return;
    }
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
    if (isBadExpectation(op)) {
      return;
    }
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
    if (isBadExpectation(op)) {
      return;
    }
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
        task_id: requireState("taskModelSecondaryId"),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.planTaskId =
      pickFirst(response.body, "data.create.id") ?? findFirstId(response.body?.data);
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
    // Use a dedicated project to avoid 409 from auto-created dependent tasks in the main projectId
    const projResp = await helperCall("plan-hire-project-create", {
      method: "POST",
      path: "/project",
      target: "gateway",
      service: "project-service",
      auth: "admin-bearer",
      json: {
        name: uniqueText("Smoke Plan Hire Project"),
        client_id: requireState("primaryClientId"),
        start_date: new Date().toISOString(),
        objective: "Dedicated project for plan hire smoke test.",
        sponsor_id: "",
      },
      expectedStatus: [201],
    });
    const hireProjectId =
      pickFirst(projResp.body, "data.create.id") ?? findFirstId(projResp.body?.data);
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/task/project-plan/hire",
      json: {
        plan_id: requireState("planId"),
        project_id: hireProjectId,
      },
    });
  },

  async taskProjectPlanHireAutoForbidden(op) {
    await httpRequest(op, {
      expectedStatus: [403],
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
    // Remove all tasks referencing this model before deleting it (FK constraint)
    const taskListResp = await helperCall("task-model-delete-tasks-list", {
      method: "GET",
      path: "/task/list",
      target: "gateway",
      service: "task-service",
      auth: "admin-bearer",
      query: {
        status: "Todos",
        page: 1,
        limit: 100,
        search: uniqueText("Smoke Secondary Task Model"),
      },
      expectedStatus: [200],
      expectEnvelope: false,
    });
    const taskRows = taskListResp.body?.data?.data ?? taskListResp.body?.data ?? [];
    for (const task of Array.isArray(taskRows) ? taskRows : []) {
      if (task?.id) {
        await helperCall(`task-model-delete-task-${task.id}`, {
          method: "DELETE",
          path: "/task",
          target: "gateway",
          service: "task-service",
          auth: "admin-bearer",
          query: { task_id: task.id },
          expectedStatus: [200, 404],
          expectEnvelope: false,
        });
      }
    }
    await httpRequest(op, {
      expectedStatus: [200],
      query: { task_id: requireState("taskModelSecondaryId") },
    });
  },

  async rhPointConfigPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      json: {
        target_user_id: await ensureRhTargetUser(),
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
      path: `/rh/point-config/${await ensureRhTargetUser()}`,
    });
  },

  async rhPointList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point",
      query: {
        user_id: await ensureRhTargetUser(),
      },
    });
  },

  async rhPointListInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      path: "/rh/point",
      query: {
        user_id: "invalid-user-id",
      },
    });
  },

  async rhPointToday(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point/me/today",
    });
  },

  async rhPointTodayUnauthorized(op) {
    await httpRequest(op, {
      expectedStatus: [401],
      path: "/rh/point/me/today",
      auth: "public",
    });
  },

  async rhPointSummary(op) {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point/summary",
      query: {
        month,
      },
    });
  },

  async rhPointSummaryInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      path: "/rh/point/summary",
      query: {
        month: "2026-13",
      },
    });
  },

  async rhPointRegister(op) {
    // Use rhTargetUser (fresh each run) so we always get a clean point day
    const targetToken = await ensureRhTargetUserSessionCookies();
    const response = await httpRequest(op, {
      expectedStatus: [200, 400],
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
    });
    if (isBadExpectation(op)) {
      return;
    }
    if (response.status === 200) {
      state.rhPointId = pickFirst(response.body, "data.point.id") ?? state.rhPointId;
    } else {
      state.rhPointDayAlreadyComplete = true;
    }
  },

  async rhPointCalculate(op) {
    // Runs after rhPointAdjustmentApprove (via actionExecutionRank:500).
    // Approval sets clock_in/lunch_out/lunch_in/clock_out on the point, so calculate succeeds.
    const targetToken = await ensureRhTargetUserSessionCookies();
    if (!state.rhPointId) {
      log("SKIP", `rhPointCalculate — no point ID available`);
      return;
    }
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/rh/point/${state.rhPointId}/calculate`,
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
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

    const targetToken = await ensureRhTargetUserSessionCookies();
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point/adjustment/request",
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
      json: {
        point_id: requireState("rhPointId"),
        clock_in: clockIn.toISOString(),
        lunch_out: lunchOut.toISOString(),
        lunch_in: lunchIn.toISOString(),
        clock_out: clockOut.toISOString(),
        justification: "Smoke point adjustment",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.rhAdjustmentId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhPointAdjustmentList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point/adjustment/requests",
      query: {
        status: "Pendente",
      },
    });
  },

  async rhPointAdjustmentListInvalid(op) {
    await httpRequest(op, {
      expectedStatus: [400],
      path: "/rh/point/adjustment/requests",
      query: {
        status: "Invalid",
      },
    });
  },

  async rhPointAdjustmentApprove(op) {
    // Approval is done by admin (bearer), not the target user
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point/adjustment/approve",
      json: {
        request_id: requireState("rhAdjustmentId"),
        obs_approver: "Approved by smoke test",
      },
    });
  },

  async rhPointAdjustmentReject(op) {
    if (isBadExpectation(op)) {
      await httpRequest(op, {
        expectedStatus: [403],
        path: "/rh/point/adjustment/reject",
        json: {
          request_id: "40000000-0000-4000-8000-000000000002",
        },
      });
      return;
    }

    const now = new Date();
    const clockIn = new Date(now);
    clockIn.setUTCHours(8, 0, 0, 0);
    const lunchOut = new Date(now);
    lunchOut.setUTCHours(12, 0, 0, 0);
    const lunchIn = new Date(now);
    lunchIn.setUTCHours(13, 0, 0, 0);
    const clockOut = new Date(now);
    clockOut.setUTCHours(17, 0, 0, 0);
    const targetToken = await ensureRhTargetUserSessionCookies();
    const createResponse = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point/adjustment/request",
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
      json: {
        point_id: requireState("rhPointId"),
        clock_in: clockIn.toISOString(),
        lunch_out: lunchOut.toISOString(),
        lunch_in: lunchIn.toISOString(),
        clock_out: clockOut.toISOString(),
        justification: "Smoke point adjustment rejection",
      },
    });
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/point/adjustment/reject",
      json: {
        request_id:
          pickFirst(createResponse.body, "data.id") ?? findFirstId(createResponse.body?.data),
        obs_approver: "Rejected by smoke test",
      },
    });
  },

  async rhCategoryCreate(op) {
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/categories",
      json: { name: uniqueText("Smoke RH Category"), active: true },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.rhCategoryId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhCategoryPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/categories",
      json: {
        id: requireState("rhCategoryId"),
        name: uniqueText("Smoke RH Category Updated"),
        active: true,
      },
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
    await ensureRhTargetUser();
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/requests",
      json: {
        title: uniqueText("Smoke RH Request"),
        description: "Smoke request description",
        category_id: requireState("rhCategoryId"),
        urgency: "High",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.rhRequestId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhOperationalUserList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/operational-users",
    });
  },

  async rhRequestList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/requests",
      query: {
        category_id: requireState("rhCategoryId"),
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
    if (isBadExpectation(op)) {
      return;
    }
    state.rhScoreQuestionId =
      pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhScoreQuestionPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/questions",
      json: {
        id: requireState("rhScoreQuestionId"),
        question: uniqueText("Smoke score question updated"),
      },
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
      expectedStatus: [200, 409],
      expectEnvelope: false,
      path: "/rh/score/quarters/generate",
      json: { target_user_id: await ensureRhTargetUser(), quarter: "2026-Q2" },
    });
    if (isBadExpectation(op)) {
      return;
    }
    if (response.status === 200) {
      state.rhScoreId =
        pickFirst(response.body, "data.id") ??
        pickFirst(response.body, "data.score_id") ??
        findFirstId(response.body?.data);
    }
    // On 409 (score already exists for this user+quarter), recover the ID from the list endpoint
    if (!state.rhScoreId) {
      const targetToken = await ensureRhTargetUserSessionCookies();
      const listResp = await helperCall("rh-score-quarter-recover", {
        method: "GET",
        path: "/rh/score/quarters/me",
        target: "gateway",
        service: "rh-service",
        auth: "public",
        headers: getSessionHeaders("POST", targetToken),
        expectedStatus: [200],
        expectEnvelope: false,
      });
      state.rhScoreId = findFirstId(listResp.body?.data) ?? "";
    }
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
    if (isBadExpectation(op)) {
      return;
    }
    state.rhScoreId = state.rhScoreId || findFirstId(response.body?.data);
  },

  async rhScoreQuarterGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/rh/score/quarters/${requireState("rhScoreId")}`,
    });
  },

  async rhScoreEvaluationPending(op) {
    // Score was generated for rhTargetUser — fetch pending evals using their token (not admin's)
    const targetToken = await ensureRhTargetUserSessionCookies();
    const response = await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/evaluations/pending",
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.rhScoreEvaluationId =
      pickFirst(response.body, "data.0.id") ??
      pickFirst(response.body, "data.items.0.id") ??
      findFirstId(response.body?.data);
  },

  async rhScoreEvaluationSubmit(op) {
    // Submit the SELF evaluation as rhTargetUser (they are the one with pending evals)
    const targetToken = await ensureRhTargetUserSessionCookies();
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/score/evaluations/submit",
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
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
    if (isBadExpectation(op)) {
      return;
    }
    state.rhHolidayId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhHolidayPut(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/holidays",
      json: {
        id: requireState("rhHolidayId"),
        name: uniqueText("Smoke Holiday Updated"),
        date: new Date().toISOString(),
      },
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
        user_id: await ensureRhTargetUser(),
        date: new Date().toISOString(),
        minutes: 60,
        reason: "Smoke overtime",
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
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

  async rhTimeBankSummary(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/time-bank/summary",
    });
  },

  async rhTimeBankSummaryUser(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/rh/time-bank/summary/${await ensureRhTargetUser()}`,
    });
  },

  async rhTimeBankOverview(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/time-bank/overview",
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
    if (isBadExpectation(op)) {
      return;
    }
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
        user_id: await ensureRhTargetUser(),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      },
    });
    if (isBadExpectation(op)) {
      return;
    }
    state.rhTimeSheetId = pickFirst(response.body, "data.id") ?? findFirstId(response.body?.data);
  },

  async rhTimeSheetList(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/timesheets",
      query: {},
    });
  },

  async rhTimeSheetGet(op) {
    await httpRequest(op, {
      expectedStatus: [200],
      path: `/rh/timesheets/${requireState("rhTimeSheetId")}`,
    });
  },

  async rhTimeSheetSign(op) {
    // Timesheet can only be signed by its owner (rhTargetUser), not the admin
    const targetToken = await ensureRhTargetUserSessionCookies();
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/rh/timesheets/sign",
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
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
    const requestId = crypto.randomUUID();
    await httpRequest(op, {
      expectedStatus: [201],
      path: "/internal/audit/requests",
      json: {
        requestId,
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
    if (isBadExpectation(op)) {
      return;
    }
    state.auditRequestId = requestId;
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

  // -------------------------------------------------------------------------
  // Error-path handlers: wrong credentials (session login)
  // -------------------------------------------------------------------------

  async userSessionInvalid(op) {
    // Correct login, wrong password → 401
    await httpRequest(op, {
      expectedStatus: [401],
      expectEnvelope: false,
      json: { login: env.login, password: "wrong-password-smoke-invalid-test" },
    });
  },

  // -------------------------------------------------------------------------
  // Error-path handlers: 404 Not Found on mutations (PUT/PATCH non-existent)
  // -------------------------------------------------------------------------

  async userPutNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/user/00000000-0000-0000-0000-000000000000",
      json: { name: "Smoke Not Found" },
    });
  },

  async clientPatchNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/client/00000000-0000-0000-0000-000000000000",
      json: { name: "Smoke Not Found" },
    });
  },

  async projectCreateInvalid(op) {
    // Missing required 'name' field → 400
    await httpRequest(op, {
      expectedStatus: [400],
      json: {
        client_id: requireState("primaryClientId"),
        start_date: new Date().toISOString(),
        objective: "Smoke invalid project",
        sponsor_id: "",
      },
    });
  },

  async projectPutNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      json: {
        project_id: "00000000-0000-0000-0000-000000000000",
        name: "Smoke Not Found",
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
        objective: "Smoke not found project update.",
        sponsor_id: "",
      },
    });
  },

  async taskModelPutNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      json: {
        task_id: "00000000-0000-0000-0000-000000000000",
        name: "Smoke Not Found",
        department_id: await ensureDepartmentId(),
        responsible_id: requireState("session").id,
        billing: "Realizar",
        prevision: 1,
        type: "regularize",
      },
    });
  },

  async organizationCreateInvalid(op) {
    // Missing required 'cnpj' field → 400
    await httpRequest(op, {
      expectedStatus: [400],
      json: {
        name: uniqueText("Smoke Invalid Org"),
        email_created_by: uniqueEmail("smoke-invalid-org"),
      },
    });
  },

  async rhCategoryCreateInvalid(op) {
    // Missing required 'name' field → 400
    await httpRequest(op, {
      expectedStatus: [400],
      path: "/rh/categories",
      json: { active: true },
    });
  },

  async rhRequestCreateInvalid(op) {
    // Missing required 'title' field → 400
    await httpRequest(op, {
      expectedStatus: [400],
      path: "/rh/requests",
      json: {
        description: "Smoke invalid request",
        category_id: requireState("rhCategoryId"),
      },
    });
  },

  async rhRequestPutNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/rh/requests",
      json: { id: "00000000-0000-0000-0000-000000000000", status: "In_Progress" },
    });
  },

  async rhScoreQuestionCreateInvalid(op) {
    // Missing required 'question' field → 400
    await httpRequest(op, {
      expectedStatus: [400],
      path: "/rh/score/questions",
      json: { type: "behavioral" },
    });
  },

  // -------------------------------------------------------------------------
  // Error-path handlers: 401 Unauthorized (invalid token → gateway rejects)
  // -------------------------------------------------------------------------

  async userListUnauthorized(op) {
    await httpRequest(op, {
      expectedStatus: [401],
      auth: "public",
      headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
      query: { skip: 0, take: 1 },
    });
  },

  async organizationListUnauthorized(op) {
    await httpRequest(op, {
      expectedStatus: [401],
      auth: "public",
      headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
      query: { page: 1, pageSize: 1 },
    });
  },

  async clientListUnauthorized(op) {
    await httpRequest(op, {
      expectedStatus: [401],
      auth: "public",
      headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
      query: { page: 1, limit: 1 },
    });
  },

  async projectListUnauthorized(op) {
    await httpRequest(op, {
      expectedStatus: [401],
      auth: "public",
      headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
      query: { ref: "client", id: "00000000-0000-0000-0000-000000000000" },
    });
  },

  async taskListUnauthorized(op) {
    await httpRequest(op, {
      expectedStatus: [401],
      auth: "public",
      headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
      query: { status: "Todos", page: 1, limit: 1 },
    });
  },

  async rhCategoryGetUnauthorized(op) {
    await httpRequest(op, {
      expectedStatus: [401],
      path: "/rh/categories",
      auth: "public",
      headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
    });
  },

  async auditListUnauthorized(op) {
    await httpRequest(op, {
      expectedStatus: [401],
      path: "/audit/requests",
      auth: "public",
      headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
      query: { page: 1, pageSize: 1 },
    });
  },

  async userPhotoUnauthorized(op) {
    await httpRequest(op, {
      expectedStatus: [401],
      path: `/user/${requireState("tempUserId")}/photo`,
      auth: "public",
      headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
    });
  },

  // -------------------------------------------------------------------------
  // Error-path handlers: 403 Forbidden (valid token, insufficient permission)
  // -------------------------------------------------------------------------

  async userCreateForbidden(op) {
    // Gateway policy: POST /user requires minPermission: 2
    // rhTargetUser has permission=1 → 403 from gateway
    const targetToken = await ensureRhTargetUserSessionCookies();
    await httpRequest(op, {
      expectedStatus: [403],
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
      json: {
        name: uniqueText("Smoke Forbidden User"),
        login: uniqueEmail("smoke-forbidden"),
        password: env.password,
        department_id: await ensureDepartmentId(),
        permission: 1,
        organization_id: requireState("session").organization_id,
        type: "user",
      },
    });
  },

  async taskModelDeleteForbidden(op) {
    // TaskModelService.deleteModel checks user.permission < 2 → 403
    // rhTargetUser has permission=1
    const targetToken = await ensureRhTargetUserSessionCookies();
    await httpRequest(op, {
      expectedStatus: [403],
      auth: "public",
      headers: getSessionHeaders("POST", targetToken),
      query: { task_id: requireState("taskModelPrimaryId") },
    });
  },

  // -------------------------------------------------------------------------
  // Error-path handlers: additional 404 Not Found
  // -------------------------------------------------------------------------

  async organizationGetNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/organizations/00000000-0000-0000-0000-000000000000",
    });
  },

  async auditGetNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/audit/requests/00000000-0000-0000-0000-000000000000",
    });
  },

  // -------------------------------------------------------------------------
  // Error-path handlers: 409 Conflict
  // -------------------------------------------------------------------------

  async clientActivateConflict(op) {
    // Secondary client is already "Ativo" after clientActivate → 409
    await httpRequest(op, {
      expectedStatus: [409],
      path: `/client/${requireState("secondaryClientId")}/activate`,
    });
  },

  async taskModelCreateConflict(op) {
    // Same name+department as primary task model → 409
    await httpRequest(op, {
      expectedStatus: [409],
      json: {
        name: uniqueText("Smoke Task Model"),
        department_id: await ensureDepartmentId(),
        responsible_id: requireState("session").id,
        billing: "Realizar",
        prevision: 2,
        type: "regularize",
      },
    });
  },

  async taskProjectPlanCreateConflict(op) {
    // Same name as existing project plan → 409
    await httpRequest(op, {
      expectedStatus: [409],
      path: "/task/project-plan",
      json: { name: uniqueText("Smoke Project Plan"), color: "#1F6FEB" },
    });
  },

  async rhCategoryCreateConflict(op) {
    // Same name as existing category → 409
    await httpRequest(op, {
      expectedStatus: [409],
      path: "/rh/categories",
      json: { name: uniqueText("Smoke RH Category"), active: true },
    });
  },

  async rhScoreQuarterGenerateConflict(op) {
    // Same target_user+quarter as existing score → 409
    await httpRequest(op, {
      expectedStatus: [409],
      expectEnvelope: false,
      path: "/rh/score/quarters/generate",
      json: { target_user_id: await ensureRhTargetUser(), quarter: "2026-Q2" },
    });
  },

  // -------------------------------------------------------------------------
  // Error-path handlers: 404 Not Found
  // -------------------------------------------------------------------------

  async userGetNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/user/00000000-0000-0000-0000-000000000000",
    });
  },

  async clientGetNotFound(op) {
    // Client GET returns 200 with null data for non-existent IDs (service design: no 404)
    await httpRequest(op, {
      expectedStatus: [200],
      path: "/client/00000000-0000-0000-0000-000000000000",
    });
  },

  async projectGetNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      query: { project_id: "00000000-0000-0000-0000-000000000000" },
    });
  },

  async taskGetNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      query: { task_id: "00000000-0000-0000-0000-000000000000" },
    });
  },

  async rhRequestGetNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/rh/requests/00000000-0000-0000-0000-000000000000",
    });
  },

  async rhScoreQuarterGetNotFound(op) {
    await httpRequest(op, {
      expectedStatus: [404],
      path: "/rh/score/quarters/00000000-0000-0000-0000-000000000000",
    });
  },

  // -------------------------------------------------------------------------
  // Error-path handlers: 400 Bad Request
  // -------------------------------------------------------------------------

  async userCreateInvalid(op) {
    // Missing required 'login' field → 400
    await httpRequest(op, {
      expectedStatus: [400],
      json: {
        name: uniqueText("Smoke Invalid User"),
        password: env.password,
        department_id: await ensureDepartmentId(),
        permission: 1,
        organization_id: requireState("session").organization_id,
        type: "user",
      },
    });
  },

  async clientCreateInvalid(op) {
    // Missing required 'name' (min length 1) → parseWithZod → 400
    await httpRequest(op, {
      expectedStatus: [400],
      json: {
        organization_id: requireState("session").organization_id,
        status: "Ativo",
        cpf_cnpj: uniqueDigits(14),
        type: "PJ",
        type_registration: "Novo",
        service_unique: false,
      },
    });
  },

  async taskCreateInvalid(op) {
    // Non-UUID model_id fails schema validation → 400
    await httpRequest(op, {
      expectedStatus: [400],
      json: {
        model_id: "not-a-valid-uuid",
        project_id: requireState("projectId"),
        client_id: requireState("primaryClientId"),
        prospecting_status: "Fechado",
        observations: "",
        urgency: "",
      },
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

function disabledConditionReason(condition) {
  if (condition === "auditEnabled" && !env.auditEnabled) {
    return "AUDIT_ENABLED is false";
  }

  if (condition === "regularizeSmokeEnabled" && !env.regularizeSmokeEnabled) {
    return "REGULARIZE_SMOKE_ENABLED is false";
  }

  if (condition === "parcelamentoSmokeEnabled" && !env.parcelamentoSmokeEnabled) {
    return "PARCELAMENTO_SMOKE_ENABLED is false";
  }

  if (condition === "clientReportingSmokeEnabled" && !env.clientReportingSmokeEnabled) {
    return "CLIENT_REPORTING_SMOKE_ENABLED is false";
  }

  if (condition === "contabilReportingSmokeEnabled" && !env.contabilReportingSmokeEnabled) {
    return "CONTABIL_REPORTING_SMOKE_ENABLED is false";
  }

  if (condition === "certificateReportingSmokeEnabled" && !env.certificateReportingSmokeEnabled) {
    return "CERTIFICATE_REPORTING_SMOKE_ENABLED is false";
  }

  if (condition === "fiscalReportingSmokeEnabled" && !env.fiscalReportingSmokeEnabled) {
    return "FISCAL_REPORTING_SMOKE_ENABLED is false";
  }

  if (condition === "pessoalReportingSmokeEnabled" && !env.pessoalReportingSmokeEnabled) {
    return "PESSOAL_REPORTING_SMOKE_ENABLED is false";
  }

  if (condition === "projectReportingSmokeEnabled" && !env.projectReportingSmokeEnabled) {
    return "PROJECT_REPORTING_SMOKE_ENABLED is false";
  }

  if (condition === "taskReportingSmokeEnabled" && !env.taskReportingSmokeEnabled) {
    return "TASK_REPORTING_SMOKE_ENABLED is false";
  }

  if (condition === "regularizeReportingSmokeEnabled" && !env.regularizeReportingSmokeEnabled) {
    return "REGULARIZE_REPORTING_SMOKE_ENABLED is false";
  }

  if (condition === "rhReportingSmokeEnabled" && !env.rhReportingSmokeEnabled) {
    return "RH_REPORTING_SMOKE_ENABLED is false";
  }

  if (condition === "reportsRetentionSmokeEnabled" && !env.reportsRetentionSmokeEnabled) {
    return "REPORTS_RETENTION_SMOKE_ENABLED is false";
  }

  if (condition === "reportsLifecycleSmokeEnabled" && !env.reportsLifecycleSmokeEnabled) {
    return "REPORTS_LIFECYCLE_SMOKE_ENABLED is false";
  }

  return "";
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

      const disabledReason = disabledConditionReason(op.condition);
      if (disabledReason) {
        skipped.push({ id: op.id, reason: disabledReason });
        log("SKIP", `${op.id} (${disabledReason})`);
        continue;
      }

      const handler = handlers[op.handlerAction ?? op.action];
      if (!handler) {
        const msg = `No handler registered for action ${op.handlerAction ?? op.action}.`;
        if (cli.continueOnFailure) {
          failures.push({ id: op.id, error: msg });
          log("FAIL", `${op.method} ${op.path} — ${msg}`);
          continue;
        }
        throw new Error(msg);
      }

      if (cli.dryRun) {
        log(
          "INFO",
          `[dry-run] ${op.method} ${op.path} (${op.service}) -> ${op.action} expects ${op.expectedLabel} [${formatExpectedStatus(op.expectedStatus)}]`,
        );
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
    await runCleanupTasks();
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
    process.exitCode = 1;
    log(
      "FAIL",
      `Smoke run completed with failures. Executed ${executed.length}, skipped ${skipped.length}, failed ${failures.length}. (${elapsed}s)`,
    );
    return;
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
