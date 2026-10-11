import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { InternalReportingService } from "@workspace/pessoal-service/src/reporting/internalReportingService.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PessoalPayrollAdapter } from "../../../services/reports-service/src/integrations/pessoalPayrollAdapter.js";
import { toReportsServiceEnv } from "../../reports-service/src/env.js";
import { routeSourceFetch } from "../../reports-service/src/sourceFetch.js";
import { createPessoalWorkerApp, type PessoalWorkerEnv } from "./app.js";

const GRANT_SECRET = "test-reports-grant-secret";
const REPORTS_TOKEN = "test-reports-internal-token";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000003";
const REQUEST_ID = "request-842";

function env(overrides: Partial<PessoalWorkerEnv> = {}): PessoalWorkerEnv {
  return {
    JWT_SECRET: "pessoal-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: "gateway-token",
    REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
    REPORTS_GRANT_SECRET: GRANT_SECRET,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
    ...overrides,
  };
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

function signedGrant(body: { source?: string; fields?: string[] }, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    audience: "pessoal-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: now + 60,
    fields: body.fields ?? [],
    issued_at: now,
    operation: body.source ? "extract" : "catalog",
    organization_id: ORGANIZATION_ID,
    request_id: REQUEST_ID,
    source: body.source ?? "pessoal.catalog",
    version: 1,
    ...overrides,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return { grant, signature: createHmac("sha256", GRANT_SECRET).update(grant).digest("hex") };
}

function grantHeaders(signed: { grant: string; signature: string }, token = REPORTS_TOKEN) {
  return {
    "content-type": "application/json",
    "x-internal-service-token": token,
    "x-request-id": REQUEST_ID,
    "x-reports-grant": signed.grant,
    "x-reports-grant-signature": signed.signature,
  };
}

function createApp(workerEnv = env()) {
  const extract = vi.fn(async () => ({ rows: [{ competence: "2026-09" }], reachedLimit: false }));
  const app = createPessoalWorkerApp({ env: workerEnv, reportingService: { extract } });
  return { app, extract };
}

const obligationsBody = { source: "pessoal.obligations", fields: ["competence"], limit: 1 };

function extract(app: ReturnType<typeof createApp>["app"], body: unknown, headers: HeadersInit) {
  return app.request("https://pessoal.test/internal/reporting/extract", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("pessoal Worker /internal/reporting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publica o catálogo de Pessoal com grant válido", async () => {
    const { app } = createApp();
    const response = await app.request("https://pessoal.test/internal/reporting/catalog", {
      headers: grantHeaders(signedGrant({})),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { sources: { key: string }[] } };
    expect(body.data.sources.map((source) => source.key)).toEqual([
      "pessoal.ldd",
      "pessoal.payroll",
      "pessoal.situations",
      "pessoal.obligations",
      "pessoal.unions",
    ]);
  });

  it("extrai com a organização assinada no grant", async () => {
    const { app, extract: extractMock } = createApp();
    const response = await extract(
      app,
      obligationsBody,
      grantHeaders(signedGrant(obligationsBody)),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { rows: [{ competence: "2026-09" }], reachedLimit: false },
    });
    expect(extractMock).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      source: "pessoal.obligations",
      fields: ["competence"],
      limit: 1,
    });
  });

  it("recusa token de relatórios ausente ou errado, inclusive o token do gateway", async () => {
    const { app, extract: extractMock } = createApp();
    const signed = signedGrant(obligationsBody);

    for (const token of ["", "wrong-token", "gateway-token"]) {
      const response = await extract(app, obligationsBody, grantHeaders(signed, token));
      expect(response.status).toBe(403);
    }
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("recusa grant adulterado, expirado, de outra audiência ou de outro corpo", async () => {
    const { app, extract: extractMock } = createApp();
    const now = Math.floor(Date.now() / 1000);
    const valid = signedGrant(obligationsBody);
    const forged = signedGrant(obligationsBody, { organization_id: OTHER_ORGANIZATION_ID });
    const cases = [
      { ...valid, signature: "0".repeat(64) },
      { grant: forged.grant, signature: valid.signature },
      signedGrant(obligationsBody, { issued_at: now - 120, expires_at: now - 60 }),
      signedGrant(obligationsBody, { audience: "rh-service" }),
      signedGrant({ ...obligationsBody, limit: 2 }),
      signedGrant(obligationsBody, { request_id: "outra-request" }),
    ];

    for (const signed of cases) {
      const response = await extract(app, obligationsBody, grantHeaders(signed));
      expect(response.status).toBe(403);
    }
    const unsigned = await extract(app, obligationsBody, {
      "content-type": "application/json",
      "x-internal-service-token": REPORTS_TOKEN,
    });
    expect(unsigned.status).toBe(403);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("não aceita organização vinda do corpo", async () => {
    const { app, extract: extractMock } = createApp();
    const body = { ...obligationsBody, organization_id: OTHER_ORGANIZATION_ID };

    const response = await extract(app, body, grantHeaders(signedGrant(body)));

    expect(response.status).toBe(400);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("responde 503 quando os secrets de relatórios não estão configurados", async () => {
    const { app } = createApp(env({ REPORTS_GRANT_SECRET: undefined }));
    const response = await app.request("https://pessoal.test/internal/reporting/catalog", {
      headers: grantHeaders(signedGrant({})),
    });

    expect(response.status).toBe(503);
  });

  it("atende o adapter real do reports via Service Binding, escopando pela organização", async () => {
    const findMany = vi.fn(async () => [
      {
        advance: true,
        employees: 12,
        client: { name: "Cliente A" },
        group: { name: "Grupo", archived_at: null, system_key: null },
      },
    ]);
    const service = new InternalReportingService({ payroll: { findMany } } as never);
    const pessoal = createPessoalWorkerApp({ env: env(), reportingService: service });
    const reportsWorkerEnv = {
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: GRANT_SECRET,
      PESSOAL_SERVICE: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
          pessoal.fetch(new Request(input, init), env()),
      },
    };
    const reportsEnv = toReportsServiceEnv(reportsWorkerEnv);
    vi.stubGlobal("fetch", routeSourceFetch(reportsWorkerEnv, vi.fn()));
    const adapter = new PessoalPayrollAdapter(reportsEnv);

    const result = await adapter.preview({
      definition: {
        sources: ["pessoal.payroll"],
        columns: ["advance", "employees", "client_name", "group_state"].map((field) => ({
          source: "pessoal.payroll",
          field,
          alias: field,
        })),
        joins: [],
        filters: [],
        filter_groups: [],
        parameters: [],
        aggregations: [],
        order_by: [],
      },
      organization_id: ORGANIZATION_ID,
      limit: 10,
      request_id: REQUEST_ID,
    });

    expect(reportsEnv.pessoalServiceUrl).toBe("https://pessoal-service.binding");
    expect(result).toEqual({
      rows: [{ advance: true, employees: 12, client_name: "Cliente A", group_state: "ATIVO" }],
      reachedLimit: false,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORGANIZATION_ID }, take: 11 }),
    );
  });

  it("declara no schema do Worker as relações que o extract de Pessoal seleciona", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const model = (name: string) =>
      new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, "mu").exec(schema)?.[1] ?? "";
    const relations = (name: string) =>
      [...model(name).matchAll(/^ {2}(\w+)\s+\w+\??\s+@relation/gmu)].map(([, field]) => field);

    expect(relations("Payroll")).toEqual(expect.arrayContaining(["responsible", "union", "group"]));
    expect(relations("ObrigationsPessoal")).toEqual(
      expect.arrayContaining(["client", "responsible"]),
    );
  });
});
