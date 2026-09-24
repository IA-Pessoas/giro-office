import { hashCsrfToken } from "@workspace/runtime";
import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createGatewayWorkerApp } from "./app.js";
import type { GatewayWorkerEnv } from "./env.js";

const SECRET = "gateway-worker-platform-secret-with-enough-length";
const TOKEN = "gateway-internal-token";

const SERVICES = [
  "AUDIT_SERVICE",
  "DEPARTMENT_SERVICE",
  "ORGANIZATION_SERVICE",
  "USER_SERVICE",
  "CLIENT_SERVICE",
  "FISCAL_SERVICE",
  "CERTIFICATE_SERVICE",
  "REPORTS_SERVICE",
  "PARCELAMENTO_SERVICE",
  "CONTABIL_SERVICE",
  "PROJECT_SERVICE",
  "TI_SERVICE",
  "RH_SERVICE",
  "COMMERCIAL_SERVICE",
  "TRIAGEM_SERVICE",
  "PESSOAL_SERVICE",
  "REGULARIZE_SERVICE",
] as const;
type ServiceName = (typeof SERVICES)[number];

function setup() {
  const bindings = Object.fromEntries(
    SERVICES.map((name) => [
      name,
      { fetch: vi.fn(async () => Response.json({ service: name }, { status: 200 })) },
    ]),
  ) as Record<ServiceName, { fetch: ReturnType<typeof vi.fn> }>;
  const app = createGatewayWorkerApp({
    env: {
      JWT_SECRET: SECRET,
      INTERNAL_SERVICE_TOKEN: TOKEN,
      AUDIT_SERVICE_TOKEN: "gateway-audit-token",
      ...bindings,
    } as unknown as GatewayWorkerEnv,
  });
  return { app, bindings };
}

function base64url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const input = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

// O token CSRF tem formato fixo: 43 chars base64url (session.ts:8).
const CSRF = "PlatformCsrfTokenForTestsOnly_0123456789abc";

/** Ator de plataforma: `platformOnly` exige actorKind platform e isPlatformAdmin. */
async function superAdmin(): Promise<string> {
  return signJwt({
    user_id: "platform-1",
    auth_kind: "platform",
    platform_role: "super_admin",
    // Mutação com cookie de sessão exige CSRF preso à sessão (auth.ts:68-76).
    csrf_hash: await hashCsrfToken(CSRF),
  });
}

/** Ator de organização: nunca pode alcançar `/platform`. */
function member(): Promise<string> {
  return signJwt({
    user_id: "user-1",
    organization_id: "org-1",
    auth_kind: "organization",
    type: "owner",
    permission: 3,
    modules: { rh: 3 },
  });
}

/**
 * Ator de plataforma só autentica por cookie de sessão: `auth.ts:159` recusa
 * `auth_kind: "platform"` quando o transporte é Bearer. Ator de organização
 * continua por Bearer.
 */
async function call(
  app: ReturnType<typeof setup>["app"],
  method: string,
  path: string,
  token?: Promise<string>,
  transport: "cookie" | "bearer" = "cookie",
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) {
    const value = await token;
    if (transport === "cookie") {
      headers.cookie = `cw.session=${value}; cw.csrf=${CSRF}`;
      headers["x-csrf-token"] = CSRF;
    } else headers.authorization = `Bearer ${value}`;
  }
  return app.request(`https://gateway.test${path}`, { method, headers });
}

describe("gateway Worker: superfície /platform", () => {
  it("audita super_admin sem user_id (FK de users) e guarda o id em metadata", async () => {
    const { app, bindings } = setup();
    const response = await call(app, "PATCH", "/platform/organizations/org-9/status", superAdmin());

    expect(response.status).toBe(200);
    const auditCall = bindings.AUDIT_SERVICE.fetch.mock.calls.find(
      ([request]) => new URL((request as Request).url).pathname === "/internal/audit/requests",
    );
    const payload = (await (auditCall?.[0] as Request).json()) as Record<string, unknown>;
    expect(payload.userId).toBeNull();
    expect(payload.metadata).toMatchObject({ actorKind: "platform", platformUserId: "platform-1" });
  });

  it.each([
    ["GET", "/platform/organizations"],
    ["POST", "/platform/organizations"],
    ["GET", "/platform/organizations/org-9"],
    ["PATCH", "/platform/organizations/org-9/status"],
    ["PATCH", "/platform/organizations/org-9/subscription-plan"],
    ["PATCH", "/platform/organizations/org-9/logo-url"],
  ] as const)("%s %s vai para o organization-service", async (method, path) => {
    const { app, bindings } = setup();
    const response = await call(app, method, path, superAdmin());

    expect(response.status).toBe(200);
    expect(bindings.ORGANIZATION_SERVICE.fetch).toHaveBeenCalledOnce();
    expect(bindings.USER_SERVICE.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["DELETE", "/platform/session"],
    ["POST", "/platform/session/refresh"],
    ["GET", "/platform/me"],
    ["GET", "/platform/organizations/org-9/users"],
    ["POST", "/platform/organizations/org-9/users"],
    ["GET", "/platform/organizations/org-9/departments"],
    ["GET", "/platform/organizations/org-9/users/u-1"],
    ["PUT", "/platform/organizations/org-9/users/u-1/permissions"],
    ["PATCH", "/platform/organizations/org-9/users/u-1"],
    ["DELETE", "/platform/organizations/org-9/users/u-1"],
    ["POST", "/platform/organizations/org-9/users/u-1/reactivate"],
    ["POST", "/platform/organizations/org-9/users/u-1/password-reset"],
    ["POST", "/platform/organizations/org-9/ownership-transfer"],
  ] as const)("%s %s vai para o user-service", async (method, path) => {
    const { app, bindings } = setup();
    const response = await call(app, method, path, superAdmin());

    expect(response.status).toBe(200);
    expect(bindings.USER_SERVICE.fetch).toHaveBeenCalledOnce();
    expect(bindings.ORGANIZATION_SERVICE.fetch).not.toHaveBeenCalled();
  });

  it("POST /platform/session é público e não exige JWT", async () => {
    const { app, bindings } = setup();
    const response = await app.request("https://gateway.test/platform/session", { method: "POST" });

    expect(response.status).toBe(200);
    expect(bindings.USER_SERVICE.fetch).toHaveBeenCalledOnce();
    const forwarded = bindings.USER_SERVICE.fetch.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBe(TOKEN);
  });

  it("ator de organização não alcança /platform, mesmo sendo owner", async () => {
    const { app, bindings } = setup();
    const response = await call(app, "GET", "/platform/organizations", member(), "bearer");

    expect(response.status).toBe(403);
    for (const name of SERVICES) expect(bindings[name].fetch).not.toHaveBeenCalled();
  });

  it("sem token, rota de plataforma protegida devolve 401", async () => {
    const { app } = setup();
    expect((await call(app, "GET", "/platform/me")).status).toBe(401);
  });

  it("o método decide o destino no mesmo path", async () => {
    const { app, bindings } = setup();

    // GET /platform/organizations/:id é do organization-service;
    // POST /platform/organizations/:id/users é do user-service.
    await call(app, "GET", "/platform/organizations/org-9", superAdmin());
    expect(bindings.ORGANIZATION_SERVICE.fetch).toHaveBeenCalledOnce();

    await call(app, "POST", "/platform/organizations/org-9/users", superAdmin());
    expect(bindings.USER_SERVICE.fetch).toHaveBeenCalledOnce();
    expect(bindings.ORGANIZATION_SERVICE.fetch).toHaveBeenCalledOnce();
  });

  it("path de plataforma não mapeado não é roteado", async () => {
    const { app, bindings } = setup();
    const response = await call(app, "GET", "/platform/inexistente", superAdmin());

    expect(response.status).toBe(404);
    for (const name of SERVICES) expect(bindings[name].fetch).not.toHaveBeenCalled();
  });
});
