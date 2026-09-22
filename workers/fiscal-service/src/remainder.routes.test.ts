import { createHash, createHmac } from "node:crypto";
import { hashCsrfToken } from "@workspace/runtime";
import { describe, expect, it, vi } from "vitest";
import { createFiscalWorkerApp, type FiscalWorkerEnv } from "./app.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORG = "a0000000-0000-4000-8000-000000000001";
const ID = "e0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "fiscal-gateway-internal-token";
const JWT_SECRET = "fiscal-worker-test-secret-which-is-long-enough";
const REPORTS_TOKEN = "reports-internal-token";
const GRANT_SECRET = "reports-grant-secret";

function env(overrides: Partial<FiscalWorkerEnv> = {}): FiscalWorkerEnv {
  return {
    JWT_SECRET,
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    AUDIT_SERVICE_TOKEN: "audit-token",
    AUDIT_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 201 })) },
    REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
    REPORTS_GRANT_SECRET: GRANT_SECRET,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
    ...overrides,
  };
}

function headers(permission = 3, fiscal = permission): Record<string, string> {
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORG,
    "x-auth-permission": String(permission),
    "x-auth-kind": "organization",
    "x-auth-modules": JSON.stringify({ fiscal }),
  };
}

function crud() {
  return {
    create: vi.fn(async () => ({ create: { id: ID } })),
    update: vi.fn(async () => ({ id: ID })),
    delete: vi.fn(async () => ({ deleted: { id: ID } })),
    detail: vi.fn(async () => ({ detail: { id: ID } })),
    list: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 50, hasMore: false })),
  };
}

function services() {
  return {
    icmsService: crud(),
    ncmService: crud(),
    ipiService: crud(),
    searchService: { searchByNcmCode: vi.fn(async () => ({ ncm: null, icms: [], ipi: [] })) },
    reportingService: { extract: vi.fn(async () => ({ rows: [], reachedLimit: false })) },
  };
}

const NCM_BODY = {
  tax_regime: "Lucro Real",
  ncm_code: "01012100",
  federal_taxation_type: "Tributado",
  description: "Cavalos",
  validity_start_date: "2026-01-01",
};

function json(body: unknown, method = "POST", extra = headers()): RequestInit {
  return {
    method,
    headers: { ...extra, "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function base64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

async function signJwt(claims: Record<string, unknown>): Promise<string> {
  const input = `${base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify(claims),
  )}`;
  return `${input}.${createHmac("sha256", JWT_SECRET).update(input).digest("base64url")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function reportingHeaders(body: { source?: string; fields?: string[] }): Record<string, string> {
  const now = Math.floor(Date.now() / 1000);
  const grant = base64Url(
    canonicalJson({
      version: 1,
      audience: "fiscal-service",
      operation: body.source ? "extract" : "catalog",
      source: body.source ?? "fiscal.catalog",
      organization_id: ORG,
      fields: body.fields ?? [],
      request_id: "report-request",
      issued_at: now - 1,
      expires_at: now + 30,
      body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    }),
  );
  return {
    "x-internal-service-token": REPORTS_TOKEN,
    "x-request-id": "report-request",
    "x-reports-grant": grant,
    "x-reports-grant-signature": createHmac("sha256", GRANT_SECRET).update(grant).digest("hex"),
  };
}

describe("fiscal Worker — rotas NCM/IPI/busca", () => {
  it("executa o CRUD de NCM com organização autenticada e envelopes canônicos", async () => {
    const deps = services();
    const app = createFiscalWorkerApp({ env: env(), ...deps });

    const create = await app.request("https://fiscal.test/fiscal/ncm", json(NCM_BODY));
    const list = await app.request(
      "https://fiscal.test/fiscal/ncm/list?ncmCodes=0101,0202&page=2&page_size=5",
      { headers: headers() },
    );
    const detail = await app.request(`https://fiscal.test/fiscal/ncm?ncm_id=${ID}`, {
      headers: headers(),
    });
    const update = await app.request(
      "https://fiscal.test/fiscal/ncm",
      json({ ...NCM_BODY, ncm_id: ID }, "PUT"),
    );
    const remove = await app.request(`https://fiscal.test/fiscal/ncm?ncm_id=${ID}`, {
      method: "DELETE",
      headers: headers(),
    });

    expect(create.status).toBe(201);
    expect(await create.json()).toEqual({ success: true, data: { create: { id: ID } } });
    expect(deps.ncmService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG,
        permission: 3,
        ncm_code: "01012100",
        validity_start_date: new Date("2026-01-01"),
      }),
    );
    expect(list.status).toBe(200);
    expect(deps.ncmService.list).toHaveBeenCalledWith(
      { ncmCodes: ["0101", "0202"], page: 2, page_size: 5 },
      ORG,
    );
    expect(detail.status).toBe(200);
    expect(deps.ncmService.detail).toHaveBeenCalledWith(ID, ORG);
    expect(update.status).toBe(200);
    expect(deps.ncmService.update).toHaveBeenCalledWith(
      expect.objectContaining({ ncm_id: ID, organizationId: ORG }),
    );
    expect(remove.status).toBe(200);
    expect(deps.ncmService.delete).toHaveBeenCalledWith(
      expect.objectContaining({ ncm_id: ID, organizationId: ORG, userId: USER_ID }),
    );
  });

  it("valida NCM e rejeita código não numérico e page_size acima de 100", async () => {
    const deps = services();
    const app = createFiscalWorkerApp({ env: env(), ...deps });

    const invalid = await app.request(
      "https://fiscal.test/fiscal/ncm",
      json({ ...NCM_BODY, ncm_code: "01.01" }),
    );
    const invalidPage = await app.request("https://fiscal.test/fiscal/ncm/list?page_size=101", {
      headers: headers(),
    });

    expect(invalid.status).toBe(400);
    expect(invalidPage.status).toBe(400);
    expect(deps.ncmService.create).not.toHaveBeenCalled();
    expect(deps.ncmService.list).not.toHaveBeenCalled();
  });

  it("executa o CRUD de IPI com organização autenticada", async () => {
    const deps = services();
    const app = createFiscalWorkerApp({ env: env(), ...deps });

    const create = await app.request("https://fiscal.test/fiscal/ipi", json({ ncm: "0101" }));
    const list = await app.request("https://fiscal.test/fiscal/ipi/list?ipiCodes=0101", {
      headers: headers(),
    });
    const detail = await app.request(`https://fiscal.test/fiscal/ipi?ipi_id=${ID}`, {
      headers: headers(),
    });
    const update = await app.request(
      "https://fiscal.test/fiscal/ipi",
      json({ ipi_id: ID, ncm: "0102", aliquot: "5" }, "PUT"),
    );
    const remove = await app.request(`https://fiscal.test/fiscal/ipi?ipi_id=${ID}`, {
      method: "DELETE",
      headers: headers(),
    });
    const invalid = await app.request("https://fiscal.test/fiscal/ipi?ipi_id=nope", {
      headers: headers(),
    });

    expect(create.status).toBe(201);
    expect(deps.ipiService.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, ncm: "0101", userId: USER_ID }),
    );
    expect(list.status).toBe(200);
    expect(deps.ipiService.list).toHaveBeenCalledWith({ ipiCodes: ["0101"] }, ORG);
    expect(detail.status).toBe(200);
    expect(deps.ipiService.detail).toHaveBeenCalledWith(ID, ORG);
    expect(update.status).toBe(200);
    expect(deps.ipiService.update).toHaveBeenCalledWith(
      expect.objectContaining({ ipi_id: ID, ncm: "0102", aliquot: "5", organizationId: ORG }),
    );
    expect(remove.status).toBe(200);
    expect(deps.ipiService.delete).toHaveBeenCalledWith(
      expect.objectContaining({ ipi_id: ID, organizationId: ORG }),
    );
    expect(invalid.status).toBe(400);
  });

  it("busca por NCM no escopo da organização e exige ncmCode", async () => {
    const deps = services();
    const app = createFiscalWorkerApp({ env: env(), ...deps });

    const search = await app.request("https://fiscal.test/fiscal/ncm-search?ncmCode=01012100", {
      headers: headers(1),
    });
    const missing = await app.request("https://fiscal.test/fiscal/ncm-search", {
      headers: headers(1),
    });

    expect(search.status).toBe(200);
    expect(await search.json()).toEqual({
      success: true,
      data: { ncm: null, icms: [], ipi: [] },
    });
    expect(deps.searchService.searchByNcmCode).toHaveBeenCalledWith("01012100", ORG);
    expect(missing.status).toBe(400);
  });
});

describe("fiscal Worker — autorização", () => {
  it.each([
    ["POST", "https://fiscal.test/fiscal/ipi", 1, 3, 403],
    ["DELETE", `https://fiscal.test/fiscal/ipi?ipi_id=${ID}`, 2, 3, 403],
    ["GET", "https://fiscal.test/fiscal/ipi/list", 3, 0, 403],
    ["POST", "https://fiscal.test/fiscal/ipi", 3, 1, 403],
  ])("%s %s com permission=%s e módulo fiscal=%s responde %s", async (method, url, permission, fiscal, status) => {
    const deps = services();
    const app = createFiscalWorkerApp({ env: env(), ...deps });

    const response = await app.request(url, {
      method,
      headers: { ...headers(permission, fiscal), "content-type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify({ ncm: "0101" }) } : {}),
    });

    expect(response.status).toBe(status);
    expect(deps.ipiService.create).not.toHaveBeenCalled();
    expect(deps.ipiService.delete).not.toHaveBeenCalled();
    expect(deps.ipiService.list).not.toHaveBeenCalled();
  });

  it("rejeita token interno inválido mesmo com headers encaminhados", async () => {
    const deps = services();
    const app = createFiscalWorkerApp({ env: env(), ...deps });

    const response = await app.request("https://fiscal.test/fiscal/ipi/list", {
      headers: { ...headers(), "x-internal-service-token": "forged" },
    });

    expect(response.status).toBe(401);
  });

  it("aceita Bearer do contrato Node e exige CSRF e validação de sessão para cookie", async () => {
    const csrf = "csrf-cookie-token";
    const token = await signJwt({
      user_id: USER_ID,
      organization_id: ORG,
      permission: 3,
      modules: { fiscal: 3 },
      session_id: "session-1",
      session_version: 1,
      csrf_hash: await hashCsrfToken(csrf),
    });
    const deps = services();
    const userService = {
      fetch: vi.fn(async () =>
        Response.json({ success: true, data: { valid: true, state: "active" } }),
      ),
    };
    const app = createFiscalWorkerApp({
      env: env({ USER_SERVICE: userService, USER_SERVICE_INTERNAL_TOKEN: "user-token" }),
      ...deps,
    });
    const noUserServiceApp = createFiscalWorkerApp({ env: env(), ...deps });

    const bearer = await app.request("https://fiscal.test/fiscal/ipi/list", {
      headers: { authorization: `Bearer ${token}` },
    });
    const cookieWithoutCsrf = await app.request("https://fiscal.test/fiscal/ipi", {
      method: "POST",
      headers: { cookie: `cw.session=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ncm: "0101" }),
    });
    const cookieWithoutSessionValidator = await noUserServiceApp.request(
      "https://fiscal.test/fiscal/ipi/list",
      { headers: { cookie: `cw.session=${token}` } },
    );

    expect(bearer.status).toBe(200);
    expect(cookieWithoutCsrf.status).toBe(403);
    expect(cookieWithoutSessionValidator.status).toBe(503);
    expect(deps.ipiService.create).not.toHaveBeenCalled();
  });

  it("valida sessão e CSRF quando o gateway encaminha identidade com cookie", async () => {
    const csrf = "csrf-cookie-token";
    const token = await signJwt({
      user_id: USER_ID,
      organization_id: ORG,
      permission: 3,
      modules: { fiscal: 3 },
      session_id: "session-1",
      session_version: 1,
      csrf_hash: await hashCsrfToken(csrf),
    });
    const deps = services();
    const userService = {
      fetch: vi.fn(async () =>
        Response.json({ success: true, data: { valid: true, state: "active" } }),
      ),
    };
    const app = createFiscalWorkerApp({
      env: env({ USER_SERVICE: userService, USER_SERVICE_INTERNAL_TOKEN: "user-token" }),
      ...deps,
    });
    const forwarded = { ...headers(), cookie: `cw.session=${token}` };

    const read = await app.request("https://fiscal.test/fiscal/ipi/list", {
      headers: forwarded,
    });
    const mutation = await app.request("https://fiscal.test/fiscal/ipi", {
      method: "POST",
      headers: { ...forwarded, "content-type": "application/json" },
      body: JSON.stringify({ ncm: "0101" }),
    });

    expect(read.status).toBe(200);
    expect(userService.fetch).toHaveBeenCalledOnce();
    expect((userService.fetch.mock.calls[0]?.[0] as Request).headers.get("authorization")).toBe(
      `Bearer ${token}`,
    );
    expect(mutation.status).toBe(403);
    expect(deps.ipiService.create).not.toHaveBeenCalled();
  });
});

describe("fiscal Worker — bindings e infraestrutura", () => {
  it("responde 503 explícito sem HYPERDRIVE nem DATABASE_URL", async () => {
    const app = createFiscalWorkerApp({ env: env({ HYPERDRIVE: undefined }) });

    const response = await app.request("https://fiscal.test/fiscal/ipi/list", {
      headers: headers(),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it("recusa escrita com 503 antes de persistir quando a auditoria não está configurada", async () => {
    const deps = services();
    const app = createFiscalWorkerApp({ env: env({ AUDIT_SERVICE: undefined }), ...deps });

    const response = await app.request("https://fiscal.test/fiscal/ipi", json({ ncm: "0101" }));

    expect(response.status).toBe(503);
    expect(deps.ipiService.create).not.toHaveBeenCalled();
  });

  it("propaga x-request-id e headers de segurança do contrato Node", async () => {
    const app = createFiscalWorkerApp({ env: env(), ...services() });

    const response = await app.request("https://fiscal.test/health", {
      headers: { "x-request-id": "req-1" },
    });

    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("publica /openapi.json fora de produção e oculta em produção", async () => {
    const dev = createFiscalWorkerApp({ env: env({ ENABLE_API_DOCS: "true" }), ...services() });
    const prod = createFiscalWorkerApp({
      env: env({ ENABLE_API_DOCS: "true", NODE_ENV: "production" }),
      ...services(),
    });

    const devSpec = await dev.request("https://fiscal.test/openapi.json");
    const prodSpec = await prod.request("https://fiscal.test/openapi.json");

    expect(devSpec.status).toBe(200);
    expect(((await devSpec.json()) as { paths: Record<string, unknown> }).paths).toHaveProperty(
      "/fiscal/ncm-search",
    );
    expect(prodSpec.status).toBe(404);
  });

  it("publica /docs (Swagger UI) fora de produção e oculta em produção ou sem a flag", async () => {
    const dev = createFiscalWorkerApp({ env: env({ ENABLE_API_DOCS: "true" }), ...services() });
    const prod = createFiscalWorkerApp({
      env: env({ ENABLE_API_DOCS: "true", NODE_ENV: "production" }),
      ...services(),
    });
    const off = createFiscalWorkerApp({ env: env(), ...services() });

    const docs = await dev.request("https://fiscal.test/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    const html = await docs.text();
    expect(html).toContain("<title>fiscal-service — OpenAPI</title>");
    expect(html).toContain('url: "/openapi.json"');
    expect((await prod.request("https://fiscal.test/docs")).status).toBe(404);
    expect((await off.request("https://fiscal.test/docs")).status).toBe(404);
    expect((await off.request("https://fiscal.test/openapi.json")).status).toBe(404);
  });
});

describe("fiscal Worker — reporting interno", () => {
  it("publica o catálogo ICMS/NCM/IPI apenas com grant HMAC válido", async () => {
    const app = createFiscalWorkerApp({ env: env(), ...services() });

    const denied = await app.request("https://fiscal.test/internal/reporting/catalog");
    const catalog = await app.request("https://fiscal.test/internal/reporting/catalog", {
      headers: reportingHeaders({}),
    });

    expect(denied.status).toBe(403);
    expect(catalog.status).toBe(200);
    const body = (await catalog.json()) as {
      data: { sources: { key: string }[]; relations: unknown[] };
    };
    expect(body.data.sources.map((source) => source.key)).toEqual([
      "fiscal.icms",
      "fiscal.ncm",
      "fiscal.ipi",
    ]);
    expect(body.data.relations).toEqual([]);
  });

  it("extrai linhas com a organização do grant e rejeita grant adulterado", async () => {
    const deps = services();
    const app = createFiscalWorkerApp({ env: env(), ...deps });
    const body = { source: "fiscal.ncm", fields: ["ncm_code"], limit: 10 };

    const extract = await app.request("https://fiscal.test/internal/reporting/extract", {
      method: "POST",
      headers: { ...reportingHeaders(body), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const tampered = await app.request("https://fiscal.test/internal/reporting/extract", {
      method: "POST",
      headers: { ...reportingHeaders(body), "content-type": "application/json" },
      body: JSON.stringify({ ...body, limit: 11 }),
    });

    expect(extract.status).toBe(200);
    expect(deps.reportingService.extract).toHaveBeenCalledTimes(1);
    expect(deps.reportingService.extract).toHaveBeenCalledWith({
      organizationId: ORG,
      source: "fiscal.ncm",
      fields: ["ncm_code"],
      limit: 10,
    });
    expect(tampered.status).toBe(403);
  });
});
