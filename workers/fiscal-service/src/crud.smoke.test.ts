// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa: campo fora do
// schema do Worker ("Unknown argument"), tabela sem @@map, coluna NOT NULL não preenchida.
// AUDIT_SERVICE é stub: só o banco é real.
import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  getFiscalIcmsReportingFields,
  getFiscalIpiReportingFields,
  getFiscalNcmReportingFields,
} from "@workspace/shared";
import { describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  smokeCall,
  smokeEnv,
  smokeHeaders,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createFiscalWorkerApp, type FiscalWorkerEnv } from "./app.js";

const REPORTS_TOKEN = "crud-smoke-reports-token";
const REPORTS_SECRET = "crud-smoke-reports-secret";

// Objetos rasos com arrays de string: JSON com chaves ordenadas é o canonicalJson do Worker.
function canonical(value: Record<string, unknown>): string {
  return JSON.stringify(value, Object.keys(value).sort());
}

function reportingHeaders(
  operation: "catalog" | "extract",
  source: string,
  fields: string[],
  body: Record<string, unknown>,
): Record<string, string> {
  const requestId = `smoke-${randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const grant = Buffer.from(
    canonical({
      version: 1,
      audience: "fiscal-service",
      operation,
      source,
      organization_id: requireSmokeState().organizationId,
      fields,
      request_id: requestId,
      issued_at: now - 1,
      expires_at: now + 30,
      body_sha256: createHash("sha256").update(canonical(body)).digest("hex"),
    }),
  ).toString("base64url");
  return {
    "content-type": "application/json",
    "x-internal-service-token": REPORTS_TOKEN,
    "x-reports-grant": grant,
    "x-reports-grant-signature": createHmac("sha256", REPORTS_SECRET).update(grant).digest("hex"),
    "x-request-id": requestId,
  };
}

describe.skipIf(!smokeState)("fiscal-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<FiscalWorkerEnv>({
      AUDIT_SERVICE: { fetch: async () => new Response(null, { status: 201 }) },
      AUDIT_SERVICE_TOKEN: "crud-smoke-audit-token",
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: REPORTS_SECRET,
    } as Partial<FiscalWorkerEnv>);
  // Mesmo status do onError do Worker, mas com a causa real (texto do Prisma) no corpo.
  const app = () =>
    createFiscalWorkerApp({ env: env() }).onError((error, c) => {
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
      return c.json({ success: false, error: error.message, cause }, status as 500);
    });
  const call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    smokeCall(app(), env(), method, path, body, headers);

  const suffix = String(Date.now()).slice(-8);
  const ncmCode = `9${suffix}`;

  it("NCM: cria, lê, lista com filtro, atualiza todos os campos e exclui", async () => {
    // Payload de FiscalNcmFormPanel (datas via toFiscalIsoDate).
    const created = expectOk(
      await call("POST", "/fiscal/ncm", {
        tax_regime: "Simples Nacional",
        ncm_code: ncmCode,
        federal_taxation_type: "Tributado",
        description: `NCM smoke ${suffix}`,
        validity_start_date: "2026-01-01T00:00:00.000Z",
        ncm_notes: "Nota",
        cst_pis_outgoing: "01",
        cst_cofins_outgoing: "01",
        product_group: "Grupo",
        information_source: "Fonte",
        reference_legislation: "Lei 1",
      }),
      "POST /fiscal/ncm",
    );
    const id = created.data.create.id as string;
    expect(
      expectOk(await call("GET", `/fiscal/ncm?ncm_id=${id}`), "GET /fiscal/ncm").data.detail
        .ncm_code,
    ).toBe(ncmCode);
    const list = expectOk(
      await call("GET", `/fiscal/ncm/list?ncmCodes=${ncmCode},000&page=1&page_size=20`),
      "GET /fiscal/ncm/list",
    );
    expect(list.data.data.some((row: { id: string }) => row.id === id)).toBe(true);

    expectOk(
      await call("PUT", "/fiscal/ncm", {
        ncm_id: id,
        tax_regime: "Lucro Presumido",
        ncm_code: ncmCode,
        federal_taxation_type: "Isento",
        description: "NCM atualizado",
        validity_start_date: "2026-02-01T00:00:00.000Z",
        validity_end_date: "2026-12-31T00:00:00.000Z",
        ncm_notes: "Nota 2",
        cst_pis_outgoing: "06",
        cst_cofins_outgoing: "06",
        product_group: "Grupo 2",
        information_source: "Fonte 2",
        reference_legislation: "Lei 2",
      }),
      "PUT /fiscal/ncm",
    );
    const after = expectOk(await call("GET", `/fiscal/ncm?ncm_id=${id}`), "GET após PUT");
    expect(after.data.detail).toMatchObject({
      tax_regime: "Lucro Presumido",
      federal_taxation_type: "Isento",
      description: "NCM atualizado",
      cst_pis_outgoing: "06",
      reference_legislation: "Lei 2",
    });
    expect(new Date(after.data.detail.validity_end_date).toISOString()).toBe(
      "2026-12-31T00:00:00.000Z",
    );

    expectOk(await call("GET", `/fiscal/ncm-search?ncmCode=${ncmCode}`), "GET /fiscal/ncm-search");
    expectOk(await call("DELETE", `/fiscal/ncm?ncm_id=${id}`), "DELETE /fiscal/ncm");
    expectOk(await call("GET", `/fiscal/ncm?ncm_id=${id}`), "GET após DELETE", [404]);
  });

  it("ICMS: cria, lê, lista com filtro, atualiza todos os campos e exclui", async () => {
    const description = `ICMS smoke ${suffix}`;
    const created = expectOk(
      await call("POST", "/fiscal/icms", {
        state: "BA",
        item_number: "1.0",
        cest_code: "01.001.00",
        description,
        interstate_agreement: "Protocolo 1",
        applied_original_mva: "10",
        adjusted_mva: "12",
        original_mva: "8",
      }),
      "POST /fiscal/icms",
    );
    const id = created.data.create.id as string;
    expectOk(await call("GET", `/fiscal/icms?icms_id=${id}`), "GET /fiscal/icms");
    const list = expectOk(
      await call("GET", `/fiscal/icms/list?icmsCodes=${encodeURIComponent(description)}`),
      "GET /fiscal/icms/list",
    );
    expect(list.data.data.some((row: { id: string }) => row.id === id)).toBe(true);
    expectOk(
      await call("PUT", "/fiscal/icms", {
        icms_id: id,
        state: "SP",
        item_number: "2.0",
        cest_code: "02.002.00",
        description: `${description} atualizado`,
        interstate_agreement: "Protocolo 2",
        applied_original_mva: "20",
        adjusted_mva: "22",
        original_mva: "18",
      }),
      "PUT /fiscal/icms",
    );
    const after = expectOk(await call("GET", `/fiscal/icms?icms_id=${id}`), "GET após PUT");
    expect(after.data.detail).toMatchObject({
      state: "SP",
      cest_code: "02.002.00",
      adjusted_mva: "22",
    });
    expectOk(await call("DELETE", `/fiscal/icms?icms_id=${id}`), "DELETE /fiscal/icms");
    expectOk(await call("GET", `/fiscal/icms?icms_id=${id}`), "GET após DELETE", [404]);
  });

  it("IPI: cria, lê, lista com filtro, atualiza todos os campos e exclui", async () => {
    const created = expectOk(
      await call("POST", "/fiscal/ipi", {
        ncm: ncmCode,
        ex: "01",
        description: "IPI smoke",
        aliquot: "5",
      }),
      "POST /fiscal/ipi",
    );
    const id = created.data.create.id as string;
    expectOk(await call("GET", `/fiscal/ipi?ipi_id=${id}`), "GET /fiscal/ipi");
    const list = expectOk(
      await call("GET", `/fiscal/ipi/list?ipiCodes=${ncmCode}`),
      "GET /fiscal/ipi/list",
    );
    expect(list.data.data.some((row: { id: string }) => row.id === id)).toBe(true);
    expectOk(
      await call("PUT", "/fiscal/ipi", {
        ipi_id: id,
        ncm: ncmCode,
        ex: "02",
        description: "IPI atualizado",
        aliquot: "7,5",
      }),
      "PUT /fiscal/ipi",
    );
    const after = expectOk(await call("GET", `/fiscal/ipi?ipi_id=${id}`), "GET após PUT");
    expect(after.data.detail).toMatchObject({
      ex: "02",
      description: "IPI atualizado",
      aliquot: "7,5",
    });
    expectOk(await call("DELETE", `/fiscal/ipi?ipi_id=${id}`), "DELETE /fiscal/ipi");
    expectOk(await call("GET", `/fiscal/ipi?ipi_id=${id}`), "GET após DELETE", [404]);
  });

  it("receitas mensais: cria, recusa duplicada, lista por período e corrige", async () => {
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Receita ${suffix}`,
      status: "Ativo",
    });
    const clientId = String(client.id);
    const created = expectOk(
      await call("POST", "/fiscal/revenues", {
        client_id: clientId,
        competence: "2026-07",
        amount: "12345.67",
      }),
      "POST /fiscal/revenues",
    );
    const id = created.data.id as string;
    expect(created.data).toMatchObject({ competence: "2026-07", amount: "12345.67" });
    expectOk(
      await call("POST", "/fiscal/revenues", {
        client_id: clientId,
        competence: "2026-07",
        amount: "1",
      }),
      "POST duplicado",
      [409],
    );
    expectOk(
      await call("POST", "/fiscal/revenues", {
        client_id: clientId,
        competence: "2026-08",
        amount: "0",
      }),
      "POST receita zero",
    );
    const list = expectOk(
      await call("GET", `/fiscal/revenues/list?client_id=${clientId}&from=2026-07&to=2026-07`),
      "GET /fiscal/revenues/list",
    );
    expect(list.data.data.map((row: { id: string }) => row.id)).toEqual([id]);
    const updated = expectOk(
      await call("PUT", `/fiscal/revenues/${id}`, { amount: "999.10" }),
      "PUT /fiscal/revenues/:id",
    );
    expect(updated.data.amount).toBe("999.1");

    const preview = expectOk(
      await call("GET", `/fiscal/simples/preview?client_id=${clientId}&competence=2026-09`),
      "GET /fiscal/simples/preview",
    );
    // 999,10 (07/2026) + 0 (08/2026) nos 11 meses; RBT12 = 999,10 × 12 ÷ 11.
    expect(preview.data).toMatchObject({ status: "ok", rbt12: "1089.93" });
    const pdf = await call(
      "GET",
      `/fiscal/simples/pdf?client_id=${clientId}&competence=2026-09&annex=III`,
    );
    expect(pdf.status).toBe(200);
    expect(pdf.text.startsWith("%PDF")).toBe(true);
    expect(preview.data.months.slice(0, 2)).toEqual([
      { competence: "2026-08", amount: "0.00", registered: true },
      { competence: "2026-07", amount: "999.10", registered: true },
    ]);

    const otherOrganization = {
      ...(await smokeHeaders()),
      "x-auth-organization-id": randomUUID(),
    };
    const foreignList = await call(
      "GET",
      `/fiscal/revenues/list?client_id=${clientId}`,
      undefined,
      otherOrganization,
    );
    expect(foreignList.status).not.toBe(200);
    expect(foreignList.text).not.toContain(id);
    const foreignUpdate = await call(
      "PUT",
      `/fiscal/revenues/${id}`,
      { amount: "1.00" },
      otherOrganization,
    );
    expect(foreignUpdate.status).not.toBe(200);
    const after = expectOk(
      await call("GET", `/fiscal/revenues/list?client_id=${clientId}&from=2026-07&to=2026-07`),
      "GET após tentativa de outra organização",
    );
    expect(after.data.data[0].amount).toBe("999.1");
  });

  it("reporting interno: catálogo e extract de cada fonte com todos os campos", async () => {
    expectOk(
      await call(
        "GET",
        "/internal/reporting/catalog",
        undefined,
        reportingHeaders("catalog", "fiscal.catalog", [], {}),
      ),
      "GET reporting/catalog",
    );
    const sources = {
      "fiscal.icms": getFiscalIcmsReportingFields("fiscal.icms"),
      "fiscal.ncm": getFiscalNcmReportingFields("fiscal.ncm"),
      "fiscal.ipi": getFiscalIpiReportingFields("fiscal.ipi"),
    };
    for (const [source, sourceFields] of Object.entries(sources)) {
      const fields = [...sourceFields];
      const body = { source, fields, limit: 5 };
      expectOk(
        await call(
          "POST",
          "/internal/reporting/extract",
          body,
          reportingHeaders("extract", source, fields, body),
        ),
        `POST reporting/extract ${source}`,
      );
    }
  });
});
