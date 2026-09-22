import { createCsrfToken, hashCsrfToken } from "@workspace/runtime";
import {
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createGatewayWorkerApp } from "./app.js";
import type { GatewayWorkerEnv } from "./env.js";

const SECRET = "gateway-worker-test-secret-with-enough-length";
const TOKEN = "gateway-internal-token";
const SERVICES = [
  "FISCAL_SERVICE",
  "CONTABIL_SERVICE",
  "TRIAGEM_SERVICE",
  "PARCELAMENTO_SERVICE",
  "CERTIFICATE_SERVICE",
  "PESSOAL_SERVICE",
  "REGULARIZE_SERVICE",
] as const;
type ServiceName = (typeof SERVICES)[number];

function upstream(name: string, status = 200) {
  return {
    fetch: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ success: status < 400, service: name }, { status }),
    ),
  };
}

function setup(extras: Partial<GatewayWorkerEnv> = {}) {
  const bindings = Object.fromEntries(SERVICES.map((name) => [name, upstream(name)])) as Record<
    ServiceName,
    ReturnType<typeof upstream>
  >;
  const app = createGatewayWorkerApp({
    env: {
      JWT_SECRET: SECRET,
      INTERNAL_SERVICE_TOKEN: TOKEN,
      AUDIT_SERVICE_TOKEN: "gateway-audit-token",
      AUDIT_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 201 })) },
      ...bindings,
      ...extras,
    },
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

function member(modules?: Record<string, number>, extra: Record<string, unknown> = {}) {
  return signJwt({
    user_id: "user-1",
    organization_id: "org-1",
    auth_kind: "organization",
    type: "user",
    permission: 3,
    ...(modules ? { modules } : {}),
    ...extra,
  });
}

async function bearer(token: Promise<string>, init: RequestInit = {}): Promise<RequestInit> {
  return { ...init, headers: { authorization: `Bearer ${await token}`, ...init.headers } };
}

const owner = () => signJwt({ user_id: "owner-1", organization_id: "org-1", type: "owner" });

describe("gateway Worker: rotas de contabil, fiscal, triagem e parcelamento", () => {
  it.each([
    ["GET", "/triagem/overview", "TRIAGEM_SERVICE"],
    ["POST", "/triagem/competencies", "TRIAGEM_SERVICE"],
    ["GET", "/triagem/competencies/c-1/history", "TRIAGEM_SERVICE"],
    ["PATCH", "/triagem/catalogs/c-1/archive", "TRIAGEM_SERVICE"],
    ["PUT", "/triagem/external-links/l-1", "TRIAGEM_SERVICE"],
    ["PATCH", "/triagem/urgent-requests/u-1/close", "TRIAGEM_SERVICE"],
    ["GET", "/triagem/monthly", "CONTABIL_SERVICE"],
    ["GET", "/triagem/monthly/m-1/items", "CONTABIL_SERVICE"],
    ["GET", "/triagem/statements", "CONTABIL_SERVICE"],
    ["POST", "/triagem/closing", "CONTABIL_SERVICE"],
    ["GET", "/triagem/editability", "CONTABIL_SERVICE"],
    ["GET", "/triagem", "CONTABIL_SERVICE"],
    ["GET", "/triagem/overviewx", "CONTABIL_SERVICE"],
    ["GET", "/contabil/clients", "CONTABIL_SERVICE"],
    ["GET", "/fiscal/ncm", "FISCAL_SERVICE"],
    ["POST", "/parcelamento", "PARCELAMENTO_SERVICE"],
  ] as const)("%s %s vai para %s como no gateway Node", async (method, path, target) => {
    const { app, bindings, forwarded } = setup();
    const response = await app.request(
      `https://gateway.test${path}?q=1`,
      await bearer(owner(), { method }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ service: target });
    for (const name of SERVICES) {
      expect(bindings[name].fetch).toHaveBeenCalledTimes(name === target ? 1 : 0);
    }
    const request = forwarded(target);
    expect(new URL(request.url).pathname).toBe(path);
    expect(new URL(request.url).search).toBe("?q=1");
    expect(request.method).toBe(method);
  });

  it.each([
    ["/fiscal", "FISCAL_SERVICE", "1"],
    ["/contabil", "CONTABIL_SERVICE", "2"],
    ["/triagem/overview", "TRIAGEM_SERVICE", "1"],
    ["/triagem/monthly", "CONTABIL_SERVICE", "3"],
    ["/parcelamento", "PARCELAMENTO_SERVICE", "2"],
  ] as const)("GET %s encaminha a permissão do módulo e a identidade", async (path, target, permission) => {
    const { app, forwarded } = setup();
    const token = member({ fiscal: 1, contabil: 2, triagem: 1, parcelamento: 2 });
    const response = await app.request(
      `https://gateway.test${path}`,
      await bearer(token, {
        headers: {
          [REQUEST_ID_HEADER]: "req-42",
          [FORWARDED_AUTH_PERMISSION_HEADER]: "99",
          [FORWARDED_AUTH_USER_ID_HEADER]: "spoofed",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req-42");
    const headers = forwarded(target).headers;
    expect(headers.get(FORWARDED_AUTH_PERMISSION_HEADER)).toBe(permission);
    expect(headers.get(FORWARDED_AUTH_USER_ID_HEADER)).toBe("user-1");
    expect(headers.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER)).toBe("org-1");
    expect(headers.get(FORWARDED_AUTH_KIND_HEADER)).toBe("organization");
    expect(headers.get(REQUEST_ID_HEADER)).toBe("req-42");
    expect(headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBe(TOKEN);
  });

  it.each([
    ["/fiscal", "FISCAL_SERVICE"],
    ["/contabil", "CONTABIL_SERVICE"],
    ["/triagem/catalogs", "TRIAGEM_SERVICE"],
    ["/parcelamento", "PARCELAMENTO_SERVICE"],
  ] as const)("owner sem claim modules recebe permissão 3 em %s", async (path, target) => {
    const { app, forwarded } = setup();
    const response = await app.request(`https://gateway.test${path}`, await bearer(owner()));

    expect(response.status).toBe(200);
    expect(forwarded(target).headers.get(FORWARDED_AUTH_PERMISSION_HEADER)).toBe("3");
  });

  it.each([
    ["GET", "/fiscal", { fiscal: 0 }],
    ["POST", "/fiscal", { fiscal: 1 }],
    ["GET", "/contabil", { contabil: 0 }],
    ["DELETE", "/contabil/x", { contabil: 1 }],
    ["GET", "/parcelamento", { parcelamento: 0 }],
    ["PATCH", "/parcelamento/x", { parcelamento: 1 }],
    ["GET", "/triagem/overview", { fiscal: 3 }],
    ["POST", "/triagem/closing", { fiscal: 3 }],
    ["GET", "/fiscal", undefined],
    // Permissão global 3 não pode valer como permissão de módulo: o Node nega estes casos
    // encaminhando x-auth-permission 0, e os Workers abaixo autorizam lendo esse valor.
    ["GET", "/certificate", { certificado: 0 }],
    ["DELETE", "/certificate/c-1", { certificado: 1 }],
    ["GET", "/pessoal", { pessoal: 0 }],
    ["GET", "/regularize/credentials", { regularize: 0 }],
    ["POST", "/regularize/credentials/reveal", { regularize: 1 }],
  ] as const)("%s %s nega com 403 e envelope do Node sem chamar o upstream", async (method, path, modules) => {
    const { app, bindings } = setup();
    const response = await app.request(
      `https://gateway.test${path}`,
      await bearer(member(modules), { method, headers: { [REQUEST_ID_HEADER]: "req-403" } }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Acesso negado para esta rota.",
      code: "FORBIDDEN",
      requestId: "req-403",
    });
    for (const name of SERVICES) expect(bindings[name].fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", "/triagem/overview", { triagem: 1 }, "TRIAGEM_SERVICE"],
    ["POST", "/triagem/closing", { triagem: 1 }, "CONTABIL_SERVICE"],
    ["PATCH", "/triagem/catalogs/c-1", { contabil: 1 }, "TRIAGEM_SERVICE"],
    ["GET", "/fiscal", { fiscal: 1 }, "FISCAL_SERVICE"],
    ["PUT", "/contabil/x", { contabil: 2 }, "CONTABIL_SERVICE"],
    ["POST", "/parcelamento", { parcelamento: 2 }, "PARCELAMENTO_SERVICE"],
  ] as const)("%s %s permite o nível mínimo do Node", async (method, path, modules, target) => {
    const { app, bindings } = setup();
    const response = await app.request(
      `https://gateway.test${path}`,
      await bearer(member(modules), { method }),
    );

    expect(response.status).toBe(200);
    expect(bindings[target].fetch).toHaveBeenCalledOnce();
  });

  it("nega ator de plataforma nas rotas de módulo", async () => {
    const { app, bindings } = setup();
    const token = await signJwt({
      user_id: "platform-1",
      auth_kind: "platform",
      platform_role: "super_admin",
    });
    const response = await app.request("https://gateway.test/fiscal", {
      headers: { cookie: `cw.session=${token}` },
    });

    expect(response.status).toBe(403);
    expect(bindings.FISCAL_SERVICE.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["/fiscal", "FISCAL_SERVICE"],
    ["/contabil", "CONTABIL_SERVICE"],
    ["/triagem/monthly", "CONTABIL_SERVICE"],
    ["/triagem/overview", "TRIAGEM_SERVICE"],
    ["/parcelamento", "PARCELAMENTO_SERVICE"],
  ] as const)("responde 503 explícito quando o binding de %s está ausente", async (path, missing) => {
    const { app, bindings } = setup({ [missing]: undefined });
    const response = await app.request(`https://gateway.test${path}`, await bearer(owner()));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "SERVICE_UNAVAILABLE",
      error: "Serviço não configurado no gateway.",
    });
    for (const name of SERVICES) expect(bindings[name].fetch).not.toHaveBeenCalled();
  });

  it.each([409, 422, 500, 503])("propaga HTTP %s do upstream sem mascarar", async (status) => {
    const { app } = setup({ FISCAL_SERVICE: upstream("FISCAL_SERVICE", status) });
    const response = await app.request("https://gateway.test/fiscal", await bearer(owner()));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ success: false, service: "FISCAL_SERVICE" });
    expect(response.headers.get(REQUEST_ID_HEADER)).toEqual(expect.any(String));
  });

  describe("CSRF de cookie", () => {
    async function cookieMutation(csrf: { header?: string; cookie?: string }) {
      const token = await createCsrfToken();
      const jwtWithCsrf = await signJwt({
        user_id: "owner-1",
        organization_id: "org-1",
        type: "owner",
        csrf_hash: await hashCsrfToken(token),
      });
      const cookies = [`cw.session=${jwtWithCsrf}`];
      const cookieValue = csrf.cookie === "valid" ? token : csrf.cookie;
      if (cookieValue) cookies.push(`cw.csrf=${cookieValue}`);
      const headerValue = csrf.header === "valid" ? token : csrf.header;
      const { app, bindings } = setup();
      const response = await app.request("https://gateway.test/contabil/x", {
        method: "POST",
        headers: {
          cookie: cookies.join("; "),
          ...(headerValue ? { "x-csrf-token": headerValue } : {}),
        },
      });
      return { response, binding: bindings.CONTABIL_SERVICE };
    }

    it("aceita header e cookie CSRF válidos", async () => {
      const { response, binding } = await cookieMutation({ header: "valid", cookie: "valid" });
      expect(response.status).toBe(200);
      expect(binding.fetch).toHaveBeenCalledOnce();
    });

    it.each([
      ["sem header e sem cookie", {}],
      ["só com o cookie CSRF", { cookie: "valid" }],
      ["só com o header CSRF", { header: "valid" }],
      ["header diferente do cookie", { header: "valid", cookie: "A".repeat(43) }],
    ] as const)("rejeita mutação por cookie %s", async (_label, csrf) => {
      const { response, binding } = await cookieMutation(csrf);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        success: false,
        code: "FORBIDDEN",
        error: "Requisição não autorizada.",
      });
      expect(binding.fetch).not.toHaveBeenCalled();
    });

    it("não exige CSRF em mutação por Bearer", async () => {
      const { app, bindings } = setup();
      const response = await app.request(
        "https://gateway.test/contabil/x",
        await bearer(owner(), { method: "POST" }),
      );
      expect(response.status).toBe(200);
      expect(bindings.CONTABIL_SERVICE.fetch).toHaveBeenCalledOnce();
    });
  });
});
