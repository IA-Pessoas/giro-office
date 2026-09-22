import type { AuditOutcome, AuditQuery, CreateAuditRequestPayload } from "@workspace/shared/audit";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateGatewayRequest, forwardIdentity, requireCsrfForMutation } from "./auth.js";
import type { GatewayWorkerEnv } from "./env.js";

type GatewayBindings = { Bindings: GatewayWorkerEnv; Variables: { requestId: string } };
type GatewayOptions = { env?: GatewayWorkerEnv };
type Route = { prefix: string; binding: keyof GatewayWorkerEnv };
type FetchBinding = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };

const AUDIT_REQUEST_URL = "https://audit-service.internal/internal/audit/requests";
const SENSITIVE_QUERY_KEY =
  /(?:authorization|cookie|token|secret|password|passwd|jwt|api[_-]?key)/iu;

const routes: Route[] = [
  { prefix: "/audit", binding: "AUDIT_SERVICE" },
  { prefix: "/department", binding: "DEPARTMENT_SERVICE" },
  { prefix: "/organizations", binding: "ORGANIZATION_SERVICE" },
  { prefix: "/user", binding: "USER_SERVICE" },
  { prefix: "/client", binding: "CLIENT_SERVICE" },
  { prefix: "/fiscal", binding: "FISCAL_SERVICE" },
  { prefix: "/certificate", binding: "CERTIFICATE_SERVICE" },
  { prefix: "/reports", binding: "REPORTS_SERVICE" },
  { prefix: "/parcelamento", binding: "PARCELAMENTO_SERVICE" },
  { prefix: "/contabil", binding: "CONTABIL_SERVICE" },
  { prefix: "/project", binding: "PROJECT_SERVICE" },
  { prefix: "/ti", binding: "TI_SERVICE" },
  { prefix: "/rh", binding: "RH_SERVICE" },
  { prefix: "/commercial", binding: "COMMERCIAL_SERVICE" },
  { prefix: "/triagem", binding: "TRIAGEM_SERVICE" },
  { prefix: "/pessoal", binding: "PESSOAL_SERVICE" },
  { prefix: "/regularize", binding: "REGULARIZE_SERVICE" },
];

function routeFor(path: string): Route | undefined {
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
  const query: AuditQuery = {};
  for (const [key, value] of url.searchParams.entries()) {
    const safeValue = SENSITIVE_QUERY_KEY.test(key) ? "[REDACTED]" : value;
    const current = query[key];
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
  auth: Awaited<ReturnType<typeof authenticateGatewayRequest>>,
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
    organizationId: auth.organizationId || null,
    userId: auth.userId,
    permission: auth.claims.permission ?? null,
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
      actorKind: auth.actorKind,
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
        services: routes.filter(({ binding }) => Boolean((options.env ?? c.env)[binding])).length,
      }),
    ),
  );

  app.all("*", async (c) => {
    const route = routeFor(new URL(c.req.url).pathname);
    if (!route) throw new ServiceError(404, "Rota não mapeada no gateway.");
    const env = options.env ?? c.env;
    const binding = env[route.binding];
    if (!isServiceBinding(binding)) {
      throw new ServiceError(503, "Serviço não configurado no gateway.");
    }

    const auth = await authenticateGatewayRequest(c.req.raw, env);
    await requireCsrfForMutation(c.req.raw, auth);
    const requestId = requestIdFor(c.req.raw);
    c.set("requestId", requestId);
    const headers = new Headers(c.req.raw.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    forwardIdentity(headers, auth, env);
    const forwardedRequest = new Request(c.req.raw, { headers });

    if (route.prefix === "/audit")
      return withRequestId(await binding.fetch(forwardedRequest), requestId);

    const audit = auditAvailability(env);
    if (!audit && isMutation(c.req.method)) {
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
