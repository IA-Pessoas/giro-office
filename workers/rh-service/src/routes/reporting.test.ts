import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RhHolidayAdapter } from "../../../../services/reports-service/src/integrations/rhHolidayAdapter.js";
import { toReportsServiceEnv } from "../../../reports-service/src/env.js";
import { routeSourceFetch } from "../../../reports-service/src/sourceFetch.js";
import { createRhWorkerApp } from "../app.js";
import type { RhWorkerEnv } from "../env.js";
import { testEnv } from "./testing.js";

const GRANT_SECRET = "test-reports-grant-secret";
const REPORTS_TOKEN = "test-reports-internal-token";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000003";
const REQUEST_ID = "request-842";

function env(overrides: Partial<RhWorkerEnv> = {}): RhWorkerEnv {
  return testEnv({
    REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
    REPORTS_GRANT_SECRET: GRANT_SECRET,
    ...overrides,
  });
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
    audience: "rh-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: now + 60,
    fields: body.fields ?? [],
    issued_at: now,
    operation: body.source ? "extract" : "catalog",
    organization_id: ORGANIZATION_ID,
    request_id: REQUEST_ID,
    source: body.source ?? "rh.catalog",
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

/** Banco falso com o replay guard (`reports.grant_uses`) de verdade: hash repetido = P2002. */
function fakeDb() {
  const used = new Set<string>();
  return {
    holidays: {
      findMany: vi.fn(async () => [{ name: "Natal", date: new Date("2026-12-25T00:00:00Z") }]),
    },
    reportGrantUse: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }: { data: { grant_hash: string } }) => {
        if (used.has(data.grant_hash)) throw Object.assign(new Error("dup"), { code: "P2002" });
        used.add(data.grant_hash);
        return data;
      }),
    },
  };
}

function createApp(workerEnv = env()) {
  const db = fakeDb();
  return { app: createRhWorkerApp({ env: workerEnv, db: db as never }), db };
}

const holidaysBody = { source: "rh.holidays", fields: ["name", "date"], limit: 5 };

function extract(app: ReturnType<typeof createApp>["app"], body: unknown, headers: HeadersInit) {
  return app.request("https://rh.test/internal/reporting/extract", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("rh Worker /internal/reporting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publica o catálogo de RH com grant válido, sem identidade do gateway", async () => {
    const { app } = createApp();
    const response = await app.request("https://rh.test/internal/reporting/catalog", {
      headers: grantHeaders(signedGrant({})),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { sources: { key: string }[] } };
    expect(body.data.sources.map((source) => source.key)).toEqual([
      "rh.requests",
      "rh.attendance",
      "rh.holidays",
    ]);
  });

  it("extrai feriados só da organização assinada e consome o grant uma vez", async () => {
    const { app, db } = createApp();
    const signed = signedGrant(holidaysBody);

    const response = await extract(app, holidaysBody, grantHeaders(signed));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { rows: [{ name: "Natal", date: "2026-12-25T00:00:00.000Z" }], reachedLimit: false },
    });
    // Paginação estável (#1267): ordena por id e busca uma linha a mais para saber se há próxima.
    expect(db.holidays.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID },
      select: { name: true, date: true, id: true },
      orderBy: { id: "asc" },
      take: 7,
    });
    const replay = await extract(app, holidaysBody, grantHeaders(signed));
    expect(replay.status).toBe(403);
    expect(db.holidays.findMany).toHaveBeenCalledTimes(1);
  });

  it("recusa token de relatórios ausente ou errado, inclusive o token do gateway", async () => {
    const { app, db } = createApp();
    const signed = signedGrant(holidaysBody);

    for (const token of ["", "wrong-token", "rh-gateway-token"]) {
      const response = await extract(app, holidaysBody, grantHeaders(signed, token));
      expect(response.status).toBe(403);
    }
    expect(db.reportGrantUse.create).not.toHaveBeenCalled();
    expect(db.holidays.findMany).not.toHaveBeenCalled();
  });

  it("recusa grant adulterado, expirado, de outra audiência ou de outro corpo", async () => {
    const { app, db } = createApp();
    const now = Math.floor(Date.now() / 1000);
    const valid = signedGrant(holidaysBody);
    const forged = signedGrant(holidaysBody, { organization_id: OTHER_ORGANIZATION_ID });
    const cases = [
      { ...valid, signature: "0".repeat(64) },
      { grant: forged.grant, signature: valid.signature },
      signedGrant(holidaysBody, { issued_at: now - 120, expires_at: now - 60 }),
      signedGrant(holidaysBody, { audience: "pessoal-service" }),
      signedGrant({ ...holidaysBody, limit: 6 }),
      signedGrant(holidaysBody, { request_id: "outra-request" }),
    ];

    for (const signed of cases) {
      const response = await extract(app, holidaysBody, grantHeaders(signed));
      expect(response.status).toBe(403);
    }
    expect(db.reportGrantUse.create).not.toHaveBeenCalled();
    expect(db.holidays.findMany).not.toHaveBeenCalled();
  });

  it("não aceita organização no corpo nem campo fora do catálogo", async () => {
    const { app, db } = createApp();
    const withOrganization = { ...holidaysBody, organization_id: OTHER_ORGANIZATION_ID };
    const unpublished = { ...holidaysBody, fields: ["id"] };

    const organizationResponse = await extract(
      app,
      withOrganization,
      grantHeaders(signedGrant(withOrganization)),
    );
    const fieldResponse = await extract(app, unpublished, grantHeaders(signedGrant(unpublished)));

    expect(organizationResponse.status).toBe(400);
    expect(fieldResponse.status).toBe(403);
    expect(db.holidays.findMany).not.toHaveBeenCalled();
  });

  it("responde 503 quando os secrets de relatórios não estão configurados", async () => {
    const { app } = createApp(env({ REPORTS_INTERNAL_TOKEN: undefined }));
    const response = await app.request("https://rh.test/internal/reporting/catalog", {
      headers: grantHeaders(signedGrant({})),
    });

    expect(response.status).toBe(503);
  });

  it("declara no schema do Worker a tabela do replay guard", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    const model = /^model ReportGrantUse \{([\s\S]*?)^\}/mu.exec(schema)?.[1] ?? "";

    expect(model).toMatch(/^ {2}grant_hash\s+String\s+@unique/mu);
    expect(model).toContain('@@map("reports.grant_uses")');
  });

  it("atende o adapter real do reports via Service Binding", async () => {
    const { app, db } = createApp();
    const reportsWorkerEnv = {
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: GRANT_SECRET,
      RH_SERVICE: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
          app.fetch(new Request(input, init), env()),
      },
    };
    const reportsEnv = toReportsServiceEnv(reportsWorkerEnv);
    vi.stubGlobal("fetch", routeSourceFetch(reportsWorkerEnv, vi.fn()));

    const result = await new RhHolidayAdapter(reportsEnv).preview({
      definition: {
        sources: ["rh.holidays"],
        columns: ["name", "date"].map((field) => ({ source: "rh.holidays", field, alias: field })),
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

    expect(reportsEnv.rhServiceUrl).toBe("https://rh-service.binding");
    expect(result).toEqual({
      rows: [{ name: "Natal", date: "2026-12-25T00:00:00.000Z" }],
      reachedLimit: false,
    });
    expect(db.holidays.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORGANIZATION_ID } }),
    );
  });
});
