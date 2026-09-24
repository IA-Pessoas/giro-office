import {
  AUTH_SESSION_TRANSPORT_HEADER,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createGatewayWorkerApp } from "./app.js";
import type { GatewayWorkerEnv } from "./env.js";

const SECRET = "gateway-worker-security-secret-with-enough-length";
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
  const forwarded = (name: ServiceName) => bindings[name].fetch.mock.calls[0]?.[0] as Request;
  return { app, bindings, forwarded };
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

/** Membro com permissão GLOBAL alta e módulos zerados: o vetor de escalada. */
function member(modules: Record<string, number> = {}): Promise<string> {
  return signJwt({
    user_id: "user-1",
    organization_id: "org-1",
    auth_kind: "organization",
    type: "member",
    permission: 3,
    modules,
  });
}

/** Sem a claim `permission`: reprova as policies `minPermission`, como no Node. */
function withoutPermission(): Promise<string> {
  return signJwt({
    user_id: "user-1",
    organization_id: "org-1",
    auth_kind: "organization",
    type: "member",
    modules: {},
  });
}

async function call(
  app: ReturnType<typeof setup>["app"],
  method: string,
  path: string,
  token?: Promise<string>,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${await token}`;
  return app.request(`https://gateway.test${path}`, { method, headers });
}

describe("gateway Worker: negação por padrão nas 13 áreas antes sem policy", () => {
  it.each([
    ["GET", "/rh/employees", "rh"],
    ["GET", "/ti/assets", "ti"],
    ["GET", "/department/list", "ti"],
    ["GET", "/commercial/leads", "comercial"],
    ["GET", "/certificate/list", "certificado"],
    ["GET", "/pessoal/records", "pessoal"],
    ["GET", "/regularize/clients", "regularize"],
    ["GET", "/project/x", "integracao"],
    ["GET", "/client/x", "integracao"],
  ] as const)("%s %s exige o módulo %s e nega permissão global", async (method, path, _module) => {
    const { app, bindings } = setup();
    const response = await call(app, method, path, member());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Acesso negado para esta rota.",
      code: "FORBIDDEN",
    });
    for (const name of SERVICES) expect(bindings[name].fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", "/audit/requests"],
    ["GET", "/organizations"],
    ["GET", "/reports/x"],
  ] as const)("%s %s exige a claim permission numérica", async (method, path) => {
    const { app, bindings } = setup();

    expect((await call(app, method, path, withoutPermission())).status).toBe(403);
    for (const name of SERVICES) expect(bindings[name].fetch).not.toHaveBeenCalled();
    expect((await call(app, method, path, member())).status).toBe(200);
  });

  it("GET /user exige manageUsers, não permissão global", async () => {
    const { app } = setup();

    expect((await call(app, "GET", "/user", member())).status).toBe(403);
    expect((await call(app, "GET", "/user", member({ rh: 3 }))).status).toBe(200);
    // Admin de TI também gerencia usuários; TI abaixo de 3 não.
    expect((await call(app, "GET", "/user", member({ ti: 3 }))).status).toBe(200);
    expect((await call(app, "GET", "/user", member({ ti: 2 }))).status).toBe(403);
  });

  it("rota mapeada porém não classificada é negada (enforce do Node)", async () => {
    const { app, bindings } = setup();
    const response = await call(app, "GET", "/user/a/b", member({ rh: 3 }));

    expect(response.status).toBe(403);
    for (const name of SERVICES) expect(bindings[name].fetch).not.toHaveBeenCalled();
  });

  it("distingue método: leitura pede 1, escrita pede 2", async () => {
    const { app } = setup();

    expect((await call(app, "GET", "/rh/employees", member({ rh: 1 }))).status).toBe(200);
    expect((await call(app, "POST", "/rh/employees", member({ rh: 1 }))).status).toBe(403);
    expect((await call(app, "POST", "/rh/employees", member({ rh: 2 }))).status).toBe(200);
  });
});

describe("gateway Worker: normalização de path", () => {
  // O runtime (WHATWG URL) já resolve `..`, `.`, `\` e `%2e` antes do Worker receber a
  // requisição, então esses casos chegam reescritos e não há o que rejeitar. Os que
  // sobrevivem ao parse são rejeitados aqui, como no `normalizeGatewayPath` do Node.
  it.each([
    "//user/me",
    "/user/%252e%252e/organizations",
    "/fiscal%2fx",
    "/fiscal%5cx",
  ])("nega %s antes de rotear", async (path) => {
    const { app, bindings } = setup();
    const response = await app.request(`https://gateway.test${path}`, {
      headers: { authorization: `Bearer ${await member({ rh: 3 })}` },
    });

    expect(response.status).toBe(403);
    for (const name of SERVICES) expect(bindings[name].fetch).not.toHaveBeenCalled();
  });

  it("remove barra final antes de classificar a rota", async () => {
    const { app } = setup();
    expect((await call(app, "GET", "/user/me/", member())).status).toBe(200);
  });

  it("path reescrito pelo runtime é autorizado pelo destino real, sem bypass", async () => {
    const { app, bindings } = setup();

    // `/user/../organizations` chega como `/organizations`: quem manda é a policy de
    // /organizations, não a de /user. Sem a claim permission, nega.
    expect((await call(app, "GET", "/user/../organizations", withoutPermission())).status).toBe(
      403,
    );
    expect(bindings.USER_SERVICE.fetch).not.toHaveBeenCalled();

    const allowed = await call(app, "GET", "/user/../organizations", member());
    expect(allowed.status).toBe(200);
    expect(bindings.ORGANIZATION_SERVICE.fetch).toHaveBeenCalledOnce();
    expect(bindings.USER_SERVICE.fetch).not.toHaveBeenCalled();
  });
});

describe("gateway Worker: fluxo de sessão", () => {
  it.each([
    ["POST", "/user/session"],
    ["POST", "/user/start-config"],
    ["POST", "/user/password-reset/confirm"],
  ] as const)("%s %s é pública e não exige JWT", async (method, path) => {
    const { app, bindings, forwarded } = setup();
    const response = await app.request(`https://gateway.test${path}`, { method });

    expect(response.status).toBe(200);
    expect(bindings.USER_SERVICE.fetch).toHaveBeenCalledOnce();
    expect(forwarded("USER_SERVICE").headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBe(TOKEN);
  });

  it("rota pública não deixa o cliente forjar identidade", async () => {
    const { app, forwarded } = setup();
    await app.request("https://gateway.test/user/session", {
      method: "POST",
      headers: {
        [FORWARDED_AUTH_USER_ID_HEADER]: "forjado",
        [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "forjada",
        [FORWARDED_AUTH_PERMISSION_HEADER]: "3",
        [FORWARDED_AUTH_KIND_HEADER]: "platform",
        [FORWARDED_AUTH_MODULES_HEADER]: '{"rh":3}',
        [AUTH_SESSION_TRANSPORT_HEADER]: "bearer",
        [INTERNAL_SERVICE_TOKEN_HEADER]: "token-forjado",
      },
    });

    const request = forwarded("USER_SERVICE");
    for (const header of [
      FORWARDED_AUTH_USER_ID_HEADER,
      FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
      FORWARDED_AUTH_PERMISSION_HEADER,
      FORWARDED_AUTH_KIND_HEADER,
      FORWARDED_AUTH_MODULES_HEADER,
      AUTH_SESSION_TRANSPORT_HEADER,
    ]) {
      expect(request.headers.get(header)).toBeNull();
    }
    expect(request.headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBe(TOKEN);
  });

  it("rota autenticada não deixa o cliente forjar x-auth-session-transport", async () => {
    const { app, forwarded } = setup();
    await app.request("https://gateway.test/rh/employees", {
      headers: {
        authorization: `Bearer ${await member({ rh: 1 })}`,
        [AUTH_SESSION_TRANSPORT_HEADER]: "bearer",
      },
    });

    expect(forwarded("RH_SERVICE").headers.get(AUTH_SESSION_TRANSPORT_HEADER)).toBeNull();
  });

  it("rota de sessão que não é pública continua exigindo autenticação", async () => {
    const { app } = setup();
    expect((await call(app, "DELETE", "/user/session")).status).toBe(401);
    expect((await call(app, "POST", "/user/session/refresh")).status).toBe(401);
  });
});
