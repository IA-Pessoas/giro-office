import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateGatewayRequest, forwardIdentity, requireCsrfForMutation } from "./auth.js";
import type { GatewayWorkerEnv } from "./env.js";

type GatewayBindings = { Bindings: GatewayWorkerEnv };
type GatewayOptions = { env?: GatewayWorkerEnv };
type Route = { prefix: string; binding: keyof GatewayWorkerEnv };

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
];

function routeFor(path: string): Route | undefined {
  return routes.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
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
    if (!binding || typeof binding !== "object" || !("fetch" in binding)) {
      throw new ServiceError(503, "Serviço não configurado no gateway.");
    }

    const auth = await authenticateGatewayRequest(c.req.raw, env);
    await requireCsrfForMutation(c.req.raw, auth);
    const headers = new Headers(c.req.raw.headers);
    forwardIdentity(headers, auth, env);
    return binding.fetch(new Request(c.req.raw, { headers }));
  });

  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no gateway.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  app.notFound((c) =>
    c.json({ success: false, error: "Rota não mapeada no gateway.", code: "NOT_FOUND" }, 404),
  );
  return app;
}
