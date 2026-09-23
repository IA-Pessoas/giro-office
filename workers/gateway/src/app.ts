import {
  AUTH_SESSION_COOKIE_NAME,
  readCookie,
  validateWorkerSession,
  WorkerSessionValidationError,
} from "@workspace/runtime";
import type { AuditOutcome, AuditQuery, CreateAuditRequestPayload } from "@workspace/shared/audit";
import { canAccessRoute } from "@workspace/shared/auth";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import pg from "pg";
// Fonte única das regras de autorização: reusa os arquivos do gateway Node em vez de
// duplicar 18 rotas exatas + 69 matchers, que divergiriam na primeira alteração.
// São módulos puros, sem Express nem dependência de runtime Node.
import { getRoutePolicy } from "../../../services/gateway/src/security/policies.js";
import { isPublicRoute } from "../../../services/gateway/src/security/publicRoutes.js";
import { normalizeGatewayPath } from "../../../services/gateway/src/security/routeClassification.js";
// No Node o /dashboard/stats e servido pelo proprio gateway; mesmo SQL, sem copia.
import { DashboardStatsService } from "../../../services/gateway/src/services/dashboardStatsService.js";
import {
  authenticateGatewayRequest,
  clearForwardedIdentity,
  forwardIdentity,
  requireCsrfForMutation,
} from "./auth.js";
import type { GatewayWorkerEnv } from "./env.js";

type GatewayBindings = { Bindings: GatewayWorkerEnv; Variables: { requestId: string } };
type DashboardDbClient = Pick<pg.Client, "connect" | "end" | "query">;
type GatewayOptions = { env?: GatewayWorkerEnv; dashboardDb?: () => DashboardDbClient };
/**
 * Espelha `services/gateway`: `module` = `permissionModule` do serviceRegistry.
 * A policy não vive aqui: vem de `getRoutePolicy`, a mesma tabela que o Node usa.
 */
type Route = {
  prefix: string;
  binding: keyof GatewayWorkerEnv;
  module?: string;
};
type FetchBinding = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };

const AUDIT_REQUEST_URL = "https://audit-service.internal/internal/audit/requests";
const SENSITIVE_QUERY_KEY =
  /(?:authorization|cookie|token|secret|password|passwd|jwt|api[_-]?key)/iu;

// Ordem do `getGatewayServiceDefinitions` do Node: os subpaths de triagem vêm antes
// de `/triagem`, que cai no contabil (triagem-legacy-service).
const triagemServiceRoutes: Route[] = [
  "overview",
  "competencies",
  "catalogs",
  "external-links",
  "urgent-requests",
].map((path) => ({
  prefix: `/triagem/${path}`,
  binding: "TRIAGEM_SERVICE",
  module: "triagem",
}));

/** `module` espelha `permissionModule` do serviceRegistry.ts do Node, serviço a serviço. */
const routes: Route[] = [
  { prefix: "/audit", binding: "AUDIT_SERVICE" },
  { prefix: "/department", binding: "DEPARTMENT_SERVICE" },
  { prefix: "/organizations", binding: "ORGANIZATION_SERVICE" },
  { prefix: "/user", binding: "USER_SERVICE" },
  { prefix: "/client", binding: "CLIENT_SERVICE" },
  { prefix: "/fiscal", binding: "FISCAL_SERVICE", module: "fiscal" },
  { prefix: "/certificate", binding: "CERTIFICATE_SERVICE", module: "certificado" },
  { prefix: "/reports", binding: "REPORTS_SERVICE" },
  { prefix: "/parcelamento", binding: "PARCELAMENTO_SERVICE", module: "parcelamento" },
  { prefix: "/contabil", binding: "CONTABIL_SERVICE", module: "contabil" },
  { prefix: "/project", binding: "PROJECT_SERVICE" },
  // task-service do Node: TASK_SERVICE_PREFIXES = ["/task"], sem permissionModule.
  { prefix: "/task", binding: "TASK_SERVICE" },
  { prefix: "/ti", binding: "TI_SERVICE", module: "ti" },
  { prefix: "/rh", binding: "RH_SERVICE", module: "rh" },
  { prefix: "/commercial", binding: "COMMERCIAL_SERVICE", module: "comercial" },
  ...triagemServiceRoutes,
  // triagem-legacy-service do Node: sem permissionModule, encaminha a permissão global.
  { prefix: "/triagem", binding: "CONTABIL_SERVICE" },
  { prefix: "/pessoal", binding: "PESSOAL_SERVICE", module: "pessoal" },
  { prefix: "/regularize", binding: "REGULARIZE_SERVICE", module: "regularize" },
];

/**
 * Superfície `/platform`: no Node ela não é prefixo, são `routeMatchers` por
 * método + path, porque o mesmo `/platform/organizations/:id` pertence ao
 * organization-service num método e ao user-service em outro. Espelha
 * `serviceRegistry.ts` matcher a matcher, na mesma ordem.
 */
type RouteMatcher = {
  methods: readonly string[];
  path: RegExp;
  binding: keyof GatewayWorkerEnv;
};

const platformMatchers: RouteMatcher[] = [
  // organization-service
  {
    methods: ["GET", "POST"],
    path: /^\/platform\/organizations\/?$/u,
    binding: "ORGANIZATION_SERVICE",
  },
  {
    methods: ["PATCH"],
    path: /^\/platform\/organizations\/[^/]+\/(?:status|subscription-plan|logo-url)\/?$/u,
    binding: "ORGANIZATION_SERVICE",
  },
  // user-service
  { methods: ["POST", "DELETE"], path: /^\/platform\/session\/?$/u, binding: "USER_SERVICE" },
  { methods: ["POST"], path: /^\/platform\/session\/refresh\/?$/u, binding: "USER_SERVICE" },
  { methods: ["GET"], path: /^\/platform\/me\/?$/u, binding: "USER_SERVICE" },
  {
    methods: ["GET", "POST"],
    path: /^\/platform\/organizations\/[^/]+\/users\/?$/u,
    binding: "USER_SERVICE",
  },
  {
    methods: ["GET"],
    path: /^\/platform\/organizations\/[^/]+\/(?:users\/[^/]+(?:\/permissions)?|departments)\/?$/u,
    binding: "USER_SERVICE",
  },
  {
    methods: ["PUT"],
    path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/permissions\/?$/u,
    binding: "USER_SERVICE",
  },
  {
    methods: ["PATCH", "DELETE"],
    path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/?$/u,
    binding: "USER_SERVICE",
  },
  {
    methods: ["POST"],
    path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/reactivate\/?$/u,
    binding: "USER_SERVICE",
  },
  {
    methods: ["POST"],
    path: /^\/platform\/organizations\/[^/]+\/ownership-transfer\/?$/u,
    binding: "USER_SERVICE",
  },
  // Precisa vir depois dos matchers mais específicos acima, senão engoliria
  // `/platform/organizations/:id/users` e `/platform/organizations/:id/status`.
  {
    methods: ["GET"],
    path: /^\/platform\/organizations\/[^/]+\/?$/u,
    binding: "ORGANIZATION_SERVICE",
  },
];

/** `PUT /user/:id` do próprio usuário, exceção do authorize.ts:8 do Node. */
const SELF_USER_PUT_PATH = /^\/user\/(?!me$|session$|start-config$|permission\/)([^/]+)$/;

function routeFor(method: string, path: string): Route | undefined {
  const verb = method.toUpperCase();
  const matcher = platformMatchers.find(
    (entry) => entry.methods.includes(verb) && entry.path.test(path),
  );
  // `/platform` não tem permissionModule no Node: a permissão global é encaminhada.
  if (matcher) return { prefix: path, binding: matcher.binding };
  return routes.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
}

function isServiceBinding(value: unknown): value is FetchBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { fetch?: unknown }).fetch === "function"
  );
}

function requestIdFor(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER)?.trim() || crypto.randomUUID();
}

function isMutation(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function safeQuery(url: URL): AuditQuery | undefined {
  const query = Object.create(null) as AuditQuery;
  for (const [key, value] of url.searchParams.entries()) {
    const safeValue = SENSITIVE_QUERY_KEY.test(key) ? "[REDACTED]" : value;
    const current = Object.hasOwn(query, key) ? query[key] : undefined;
    query[key] =
      current === undefined
        ? safeValue
        : Array.isArray(current)
          ? [...current, safeValue]
          : [current, safeValue];
  }
  return Object.keys(query).length > 0 ? query : undefined;
}

function auditAvailability(
  env: GatewayWorkerEnv,
): { binding: FetchBinding; token: string } | undefined {
  const binding = isServiceBinding(env.AUDIT_SERVICE) ? env.AUDIT_SERVICE : undefined;
  const token = env.AUDIT_SERVICE_TOKEN;
  if (!binding) {
    console.warn("[gateway-worker] AUDIT_SERVICE ausente; auditoria não será enviada.");
  }
  if (!token?.trim()) {
    console.error("[gateway-worker] AUDIT_SERVICE_TOKEN ausente; auditoria não será enviada.");
  }
  if (token === env.INTERNAL_SERVICE_TOKEN) {
    console.error(
      "[gateway-worker] AUDIT_SERVICE_TOKEN deve ser distinto de INTERNAL_SERVICE_TOKEN.",
    );
  }
  if (!binding || !token?.trim() || token === env.INTERNAL_SERVICE_TOKEN) return undefined;
  return { binding, token };
}

function auditPayload(
  request: Request,
  url: URL,
  route: Route,
  auth: Awaited<ReturnType<typeof authenticateGatewayRequest>> | undefined,
  requestId: string,
  createdAt: string,
  finishedAt: string,
  startedAt: number,
  statusCode: number,
  outcome: AuditOutcome,
  errorCode?: string,
): CreateAuditRequestPayload {
  return {
    requestId,
    organizationId: auth?.organizationId || null,
    userId: auth?.userId ?? null,
    permission: auth?.claims.permission ?? null,
    method: request.method,
    path: url.pathname,
    query: safeQuery(url),
    statusCode,
    outcome,
    durationMs: Math.max(0, Date.parse(finishedAt) - startedAt),
    errorCode: errorCode ?? null,
    serviceSource: "gateway-worker",
    createdAt,
    finishedAt,
    metadata: {
      actorKind: auth?.actorKind ?? "public",
      routeTarget: route.binding,
      routePrefix: route.prefix,
    },
  };
}

async function sendAudit(
  audit: { binding: FetchBinding; token: string },
  payload: CreateAuditRequestPayload,
): Promise<void> {
  const response = await audit.binding.fetch(
    new Request(AUDIT_REQUEST_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INTERNAL_SERVICE_TOKEN_HEADER]: audit.token,
        [REQUEST_ID_HEADER]: payload.requestId,
      },
      body: JSON.stringify(payload),
    }),
  );
  if (!response.ok) throw new Error(`Audit service returned HTTP ${response.status}.`);
}

function logAuditFailure(error: unknown, payload: CreateAuditRequestPayload): void {
  console.error("[gateway-worker] falha ao enviar auditoria", {
    requestId: payload.requestId,
    outcome: payload.outcome,
    statusCode: payload.statusCode,
    error: error instanceof Error ? error.message : "Erro desconhecido.",
  });
}

function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function createGatewayWorkerApp(options: GatewayOptions = {}) {
  const app = new Hono<GatewayBindings>();

  app.get("/health", (c) => c.json(createSuccessResponse({ status: "ok", service: "gateway" })));
  app.get("/ready", (c) =>
    c.json(
      createSuccessResponse({
        status: "ready",
        service: "gateway",
        services: [...new Set(routes.map(({ binding }) => binding))].filter((binding) =>
          Boolean((options.env ?? c.env)[binding]),
        ).length,
      }),
    ),
  );

  // Paridade com services/gateway/src/routes/dashboard.routes.ts: rota do proprio gateway,
  // nao encaminhada a um servico, entao le o banco direto pelo Hyperdrive.
  app.get("/dashboard/stats", async (c) => {
    const env = options.env ?? c.env;
    const auth = await authenticateGatewayRequest(c.req.raw, env);
    const policy = getRoutePolicy("GET", "/dashboard/stats");
    if (!policy || !canAccessRoute({ ...auth, claims: { ...auth.claims } }, policy)) {
      throw new ServiceError(403, "Acesso negado para esta rota.");
    }
    if (!auth.organizationId) throw new ServiceError(401, "Contexto autenticado não informado.");
    // Sem proxy nao ha servico para validar a sessao; o gateway valida aqui, como os Workers.
    if (!isServiceBinding(env.USER_SERVICE)) {
      throw new ServiceError(503, "Validação de sessão indisponível.");
    }
    const hasCookie = Boolean(
      readCookie(c.req.header("cookie") ?? undefined, AUTH_SESSION_COOKIE_NAME),
    );
    try {
      await validateWorkerSession(auth, env.USER_SERVICE, hasCookie ? "cookie" : "bearer", {
        internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
      });
    } catch (error) {
      if (error instanceof WorkerSessionValidationError) {
        throw new ServiceError(error.statusCode, error.message);
      }
      throw error;
    }

    const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
    if (!connectionString)
      throw new ServiceError(503, "Banco de dados não configurado no gateway.");
    // Um client por request: conexoes nao podem atravessar requests no Workers.
    const client = options.dashboardDb?.() ?? new pg.Client({ connectionString });
    await client.connect();
    try {
      const stats = await new DashboardStatsService({ pool: client }).getStats(auth.organizationId);
      return c.json(createSuccessResponse(stats));
    } finally {
      await client.end();
    }
  });

  app.all("*", async (c) => {
    // Paridade com o `authorize` do Node: path inválido é negado antes de qualquer coisa.
    const path = normalizeGatewayPath(new URL(c.req.url).pathname);
    if (!path) throw new ServiceError(403, "Acesso negado para esta rota.");
    const route = routeFor(c.req.method, path);
    if (!route) throw new ServiceError(404, "Rota não mapeada no gateway.");
    const env = options.env ?? c.env;
    const binding = env[route.binding];
    if (!isServiceBinding(binding)) {
      throw new ServiceError(503, "Serviço não configurado no gateway.");
    }

    // Rota pública (login, start-config, socket.io) pula autenticação, CSRF e autorização,
    // exatamente como authenticate.ts, csrfProtection.ts e authorize.ts do Node.
    const isPublic = isPublicRoute(c.req.method, path);
    let auth: Awaited<ReturnType<typeof authenticateGatewayRequest>> | undefined;
    if (!isPublic) {
      auth = await authenticateGatewayRequest(c.req.raw, env);
      await requireCsrfForMutation(c.req.raw, auth);
      // Negação por padrão: rota não classificada não passa, como o modo `enforce` do Node.
      const policy = getRoutePolicy(c.req.method, path);
      if (!policy) throw new ServiceError(403, "Acesso negado para esta rota.");
      const selfUserPut =
        c.req.method.toUpperCase() === "PUT" ? SELF_USER_PUT_PATH.exec(path) : null;
      const isSelfUserPut =
        auth.actorKind === "organization" &&
        auth.organizationId.length > 0 &&
        selfUserPut?.[1] === auth.userId;
      if (!isSelfUserPut && !canAccessRoute({ ...auth, claims: { ...auth.claims } }, policy)) {
        throw new ServiceError(403, "Acesso negado para esta rota.");
      }
    }
    const requestId = requestIdFor(c.req.raw);
    c.set("requestId", requestId);
    const headers = new Headers(c.req.raw.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    if (auth) forwardIdentity(headers, auth, env, route.module);
    else clearForwardedIdentity(headers, env);
    const forwardedRequest = new Request(c.req.raw, { headers });

    if (route.prefix === "/audit")
      return withRequestId(await binding.fetch(forwardedRequest), requestId);

    const audit = auditAvailability(env);
    if (!audit) {
      throw new ServiceError(503, "Auditoria do gateway não está configurada.");
    }

    const url = new URL(c.req.url);
    const startedAt = Date.now();
    const createdAt = new Date(startedAt).toISOString();
    let response: Response;
    try {
      response = await binding.fetch(forwardedRequest);
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const payload = auditPayload(
        c.req.raw,
        url,
        route,
        auth,
        requestId,
        createdAt,
        finishedAt,
        startedAt,
        502,
        "aborted",
        "UPSTREAM_EXCEPTION",
      );
      if (audit) {
        try {
          await sendAudit(audit, payload);
        } catch (auditError) {
          logAuditFailure(auditError, payload);
        }
      } else {
        console.error("[gateway-worker] request upstream abortada sem auditoria", {
          requestId,
          outcome: "aborted",
        });
      }
      throw new ServiceError(502, "Serviço upstream indisponível.", error);
    }

    const outcome: AuditOutcome =
      response.status >= 200 && response.status < 300 ? "success" : "error";
    const payload = auditPayload(
      c.req.raw,
      url,
      route,
      auth,
      requestId,
      createdAt,
      new Date().toISOString(),
      startedAt,
      response.status,
      outcome,
      outcome === "error" ? `HTTP_${response.status}` : undefined,
    );
    if (audit) {
      try {
        await sendAudit(audit, payload);
      } catch (error) {
        logAuditFailure(error, payload);
        if (isMutation(c.req.method)) {
          throw new ServiceError(503, "Auditoria do gateway indisponível.", error);
        }
      }
    } else {
      console.warn("[gateway-worker] request proxied sem auditoria", {
        requestId,
        outcome,
        statusCode: response.status,
      });
    }
    return withRequestId(response, requestId);
  });

  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.get("requestId") ?? c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no gateway.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  app.notFound((c) =>
    c.json({ success: false, error: "Rota não mapeada no gateway.", code: "NOT_FOUND" }, 404),
  );
  return app;
}
