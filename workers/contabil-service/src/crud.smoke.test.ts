// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa: campo fora do
// schema do Worker ("Unknown argument"), tabela sem @@map, coluna NOT NULL não preenchida.
// AUDIT_SERVICE e TRIAGEM_SERVICE são stubs: só o banco é real.
import { randomUUID } from "node:crypto";
import { getContabilReportingFields, TRIAGE_ACCOUNTING_STATUS_PRECEDENCE } from "@workspace/shared";
import { beforeAll, describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  smokeCall,
  smokeEnv,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { type ContabilWorkerEnv, createContabilWorkerApp } from "./app.js";
import { reportingBodyHash } from "./reporting.js";

const REPORTS_TOKEN = "crud-smoke-reports-token";
const REPORTS_SECRET = "crud-smoke-reports-secret";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function reportingHeaders(
  operation: "catalog" | "extract",
  source: string,
  fields: string[],
  body: Record<string, unknown>,
): Promise<Record<string, string>> {
  const requestId = `smoke-${randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const grant = {
    audience: "contabil-service",
    body_sha256: await reportingBodyHash(body),
    expires_at: now + 30,
    fields,
    issued_at: now - 1,
    operation,
    organization_id: requireSmokeState().organizationId,
    request_id: requestId,
    source,
    version: 1,
  };
  const grantText = base64Url(new TextEncoder().encode(JSON.stringify(grant)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(REPORTS_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(grantText));
  return {
    "content-type": "application/json",
    "x-internal-service-token": REPORTS_TOKEN,
    "x-reports-grant": grantText,
    "x-reports-grant-signature": Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
    "x-request-id": requestId,
  };
}

describe.skipIf(!smokeState)("contabil-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<ContabilWorkerEnv>({
      AUDIT_SERVICE: { fetch: async () => new Response(null, { status: 201 }) },
      AUDIT_SERVICE_TOKEN: "crud-smoke-audit-token",
      TRIAGEM_SERVICE: {
        fetch: async (input: Request | string) => {
          const url = new URL(typeof input === "string" ? input : input.url);
          return Response.json({
            success: true,
            data: {
              items: [
                {
                  client_id: url.searchParams.get("client_id"),
                  competence: url.searchParams.get("competence"),
                  legal_name: "Smoke",
                  status: TRIAGE_ACCOUNTING_STATUS_PRECEDENCE[0],
                },
              ],
            },
          });
        },
      },
      TRIAGEM_INTERNAL_TOKEN: "crud-smoke-triagem-token",
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: REPORTS_SECRET,
    } as Partial<ContabilWorkerEnv>);
  // Mesmo status do onError do Worker, mas com a causa real (texto do Prisma) no corpo.
  const app = () =>
    createContabilWorkerApp({ env: env() }).onError((error, c) => {
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
      return c.json({ success: false, error: error.message, cause }, status as 500);
    });
  const call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    smokeCall(app(), env(), method, path, body, headers);

  const suffix = Date.now();
  const competence = "2026-08";
  const fiscalCompetence = "2026-07";
  let clientId = "";
  let cpfCnpj = "";
  let justificationCode = "";
  let deliveryCode = "";

  // POST /triagem/monthly é a rota; se ela falhar (falha registrada via expect.soft), semeia a
  // linha direto no banco só para ainda exercitar as rotas seguintes.
  async function createMonthly(
    body: { client_id: string; competence: string; type?: "FISCAL" },
    checklist: Record<string, string>,
  ): Promise<string> {
    const created = await call("POST", "/triagem/monthly", body);
    expect
      .soft(created.status, `POST monthly ${body.type ?? "CONTABIL"}: ${created.text}`)
      .toBe(200);
    if (created.status === 200) {
      for (const [field, status] of Object.entries(checklist)) {
        expect(created.json.data.checklist[field]).toBe(status);
      }
      return created.json.data.id as string;
    }
    const row = await smokeInsert("triagem.monthly", {
      id: randomUUID(),
      client_id: body.client_id,
      competence: body.competence,
      type: body.type ?? "CONTABIL",
      checklist: JSON.stringify(checklist),
      item_notes: JSON.stringify({}),
      updated_at: new Date(),
    });
    return String(row.id);
  }

  beforeAll(async () => {
    cpfCnpj = String(suffix).padStart(14, "0").slice(-14);
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Contábil ${suffix}`,
      company_name: `Smoke Contábil LTDA ${suffix}`,
      cpf_cnpj: cpfCnpj,
      regime: "Simples Nacional",
      contabil: true,
    });
    clientId = String(client.id);
    await smokeInsert("triagem.configs", {
      id: randomUUID(),
      client_id: clientId,
      type: "CONTABIL",
      active_items: JSON.stringify(["financial_transactions", "bank_reconciliation"]),
      updated_at: new Date(),
    });
    await smokeInsert("triagem.competences", {
      id: randomUUID(),
      client_id: clientId,
      competence: fiscalCompetence,
      configuration_snapshot: JSON.stringify({
        configs: [{ type: "FISCAL", active_items: ["inbound_report", "nfse_provided"] }],
      }),
      responsible_snapshot: JSON.stringify({}),
    });
    justificationCode = `SMOKE_JUST_${suffix}`;
    deliveryCode = `SMOKE_DELIV_${suffix}`;
    await smokeInsert("triagem.catalog_items", {
      id: randomUUID(),
      kind: "JUSTIFICATION",
      code: justificationCode,
      label: "Smoke justificativa",
    });
    await smokeInsert("triagem.catalog_items", {
      id: randomUUID(),
      kind: "DELIVERY_METHOD",
      code: deliveryCode,
      label: "Smoke entrega",
    });
  });

  it("controles: cria, lê, atualiza campos, conclui, cria o ano, arquiva e restaura", async () => {
    const created = expectOk(
      await call("POST", "/contabil/controls", { client_id: clientId, competence }),
      "POST /contabil/controls",
    );
    const id = created.data.id as string;
    expectOk(
      await call("POST", "/contabil/controls", { client_id: clientId, competence }),
      "POST /contabil/controls (existente)",
      [200],
    );
    const query = `client_id=${clientId}&competence=${competence}`;
    expect(expectOk(await call("GET", `/contabil/controls?${query}`), "GET controls").data.id).toBe(
      id,
    );

    expectOk(
      await call("PATCH", `/contabil/controls/${id}`, {
        field: "reconcile_bank_statements",
        value: true,
      }),
      "PATCH control boolean",
    );
    expectOk(
      await call("PATCH", `/contabil/controls/${id}`, { field: "notes", value: "Smoke nota" }),
      "PATCH control notes",
    );
    const patched = expectOk(await call("GET", `/contabil/controls?${query}`), "GET após PATCH");
    expect(patched.data).toMatchObject({ reconcile_bank_statements: true, notes: "Smoke nota" });

    expectOk(await call("PATCH", `/contabil/controls/${id}/items`), "PATCH control items");
    const completed = expectOk(await call("GET", `/contabil/controls?${query}`), "GET concluído");
    expect(completed.data).toMatchObject({ depreciation: true, monthly_closing: true });

    const year = expectOk(
      await call("POST", "/contabil/controls/year", {
        client_id: clientId,
        year: 2025,
        confirmed: true,
      }),
      "POST controls/year",
    );
    expect(year.data.created + year.data.existing).toBe(12);

    const archived = expectOk(
      await call("DELETE", "/contabil/controls", { client_id: clientId, competence }),
      "DELETE controls",
    );
    expect(archived.data.controls).toBe(1);
    expectOk(await call("GET", `/contabil/controls?${query}`), "GET arquivado", [404]);
    expectOk(
      await call("POST", "/contabil/controls/restore", { client_id: clientId, competence }),
      "POST controls/restore",
    );
    expectOk(await call("GET", `/contabil/controls?${query}`), "GET restaurado");
  });

  it("relacionamento: cria, lê por cliente, atualiza todos os campos e remove", async () => {
    const created = expectOk(
      await call("POST", "/contabil/relationships", {
        client_id: clientId,
        bidding: false,
        chart_accounts: "Plano padrão",
        tool: "Domínio",
        system: "ERP Smoke",
        note: "Criado pelo smoke",
      }),
      "POST relationships",
    );
    const id = created.data.id as string;
    expectOk(
      await call("GET", `/contabil/relationships/client/${clientId}`),
      "GET relationships/client",
    );
    expectOk(
      await call("PUT", `/contabil/relationships/${id}`, {
        bidding: true,
        chart_accounts: "Plano próprio",
        tool: "Questor",
        system: "ERP Novo",
        note: "Atualizado",
      }),
      "PUT relationships",
    );
    const after = expectOk(
      await call("GET", `/contabil/relationships/client/${clientId}`),
      "GET após PUT",
    );
    expect(after.data).toMatchObject({
      bidding: true,
      chart_accounts: "Plano próprio",
      tool: "Questor",
      system: "ERP Novo",
      note: "Atualizado",
    });
    expectOk(await call("DELETE", `/contabil/relationships/${id}`), "DELETE relationships");
    expectOk(
      await call("GET", `/contabil/relationships/client/${clientId}`),
      "GET após DELETE",
      [404],
    );
  });

  it("responsáveis: cria, aparece na carteira, atualiza (inclusive null) e remove", async () => {
    const state = requireSmokeState();
    const created = expectOk(
      await call("POST", "/contabil/responsibles", {
        client_id: clientId,
        person_responsible_id: state.ownerId,
        posted_by_id: state.userId,
        customer_with_movement: true,
      }),
      "POST responsibles",
    );
    const id = created.data.id as string;
    expectOk(
      await call("GET", `/contabil/responsibles/client/${clientId}`),
      "GET responsibles/client",
    );

    // Carteira (dashboard): cpf_cnpj, regime e responsáveis vêm do banco.
    const portfolio = expectOk(
      await call("GET", `/contabil/controls/list?competence=${competence}`),
      "GET controls/list",
    );
    const item = portfolio.data.items.find(
      (entry: { client_id: string }) => entry.client_id === clientId,
    );
    expect(item).toMatchObject({
      cpf_cnpj: cpfCnpj,
      regime: "Simples Nacional",
      person_responsible_id: state.ownerId,
      posted_by_id: state.userId,
    });

    expectOk(
      await call("PUT", `/contabil/responsibles/${id}`, {
        person_responsible_id: state.userId,
        posted_by_id: null,
        customer_with_movement: false,
      }),
      "PUT responsibles",
    );
    const after = expectOk(
      await call("GET", `/contabil/responsibles/client/${clientId}`),
      "GET após PUT",
    );
    expect(after.data).toMatchObject({
      person_responsible_id: state.userId,
      posted_by_id: null,
      customer_with_movement: false,
    });
    expectOk(await call("DELETE", `/contabil/responsibles/${id}`), "DELETE responsibles");
    expectOk(
      await call("GET", `/contabil/responsibles/client/${clientId}`),
      "GET após DELETE",
      [404],
    );
  });

  it("fechamento da triagem: padrão, grava status, lê e arquiva", async () => {
    const query = `client_id=${clientId}&competence=${competence}`;
    expect(
      expectOk(await call("GET", `/triagem/closing?${query}`), "GET closing").data.status,
    ).toBe("NOT_RECEIVED");
    expectOk(
      await call("PUT", "/triagem/closing", {
        client_id: clientId,
        competence,
        status: "RECEIVED",
      }),
      "PUT closing",
    );
    expect(
      expectOk(await call("GET", `/triagem/closing?${query}`), "GET após PUT").data.status,
    ).toBe("RECEIVED");
    expectOk(
      await call("DELETE", "/triagem/closing", { client_id: clientId, competence }),
      "DELETE closing",
    );
    const after = expectOk(await call("GET", `/triagem/closing?${query}`), "GET após DELETE");
    expect(after.data).toMatchObject({ status: "NOT_RECEIVED", archived_at: null });
  });

  it("pendências documentais contábeis e extratos bancários", async () => {
    expect(
      expectOk(await call("GET", `/triagem/editability?client_id=${clientId}`), "GET editability")
        .data.can_edit,
    ).toBe(true);
    const id = await createMonthly(
      { client_id: clientId, competence },
      { financial_transactions: "PENDING", bank_reconciliation: "PENDING" },
    );

    expectOk(
      await call("PATCH", `/triagem/monthly/${id}/item`, {
        field: "financial_transactions",
        status: "ATTENTION",
        note: "Faltam extratos",
      }),
      "PATCH monthly item",
    );
    // Justificativa do catálogo: passa por assertActiveCatalogItems (troca de papel no banco).
    const justified = await call("PATCH", `/triagem/monthly/${id}/item`, {
      field: "bank_reconciliation",
      status: "NOT_PRESENT",
      justification: justificationCode,
    });
    expect.soft(justified.status, `PATCH item com justificativa: ${justified.text}`).toBe(200);
    const read = expectOk(
      await call("GET", `/triagem/monthly?client_id=${clientId}&competence=${competence}`),
      "GET monthly",
    );
    expect(read.data.checklist.financial_transactions).toBe("ATTENTION");
    expect(read.data.item_notes.financial_transactions).toMatchObject({ note: "Faltam extratos" });
    if (justified.status === 200) {
      expect(read.data.item_notes.bank_reconciliation.justification).toBe(justificationCode);
    }
    expect(read.data.triagem_summary).not.toBeNull();

    expectOk(
      await call("PATCH", `/triagem/monthly/${id}/items`, { status: "COMPLETED" }),
      "PATCH monthly items",
    );
    const all = expectOk(
      await call("GET", `/triagem/monthly?client_id=${clientId}&competence=${competence}`),
      "GET após PATCH items",
    );
    expect(all.data.checklist.bank_reconciliation).toBe("COMPLETED");

    const bankId = `smoke-bank-${suffix}`;
    expectOk(
      await call("PUT", "/triagem/statements", {
        client_id: clientId,
        competence,
        bank_id: bankId,
        status: "COMPLETED",
      }),
      "PUT statements",
    );
    const statements = expectOk(
      await call("GET", `/triagem/statements?client_id=${clientId}&competence=${competence}`),
      "GET statements",
    );
    expect(statements.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ bank_id: bankId, status: "COMPLETED" })]),
    );
    expectOk(
      await call("DELETE", "/triagem/statements", {
        client_id: clientId,
        competence,
        bank_id: bankId,
      }),
      "DELETE statements",
    );
  });

  it("pendências documentais fiscais: cria da competência, faturamento e método de entrega", async () => {
    expectOk(
      await call("GET", `/triagem/editability?client_id=${clientId}&type=FISCAL`),
      "GET editability FISCAL",
    );
    const id = await createMonthly(
      { client_id: clientId, competence: fiscalCompetence, type: "FISCAL" },
      { inbound_report: "PENDING", nfse_provided: "PENDING" },
    );
    expectOk(
      await call("PATCH", `/triagem/monthly/${id}/item`, {
        field: "billing_amount",
        type: "FISCAL",
        value: "12345,67",
      }),
      "PATCH billing_amount",
    );
    expectOk(
      await call("PATCH", `/triagem/monthly/${id}/item`, {
        field: "nfse_provided",
        status: "COMPLETED",
        type: "FISCAL",
        note: "Conferido",
      }),
      "PATCH item FISCAL",
    );
    const delivered = await call("PATCH", `/triagem/monthly/${id}/item`, {
      field: "inbound_report",
      status: "COMPLETED",
      type: "FISCAL",
      delivery_method: deliveryCode,
    });
    expect
      .soft(delivered.status, `PATCH item FISCAL com método de entrega: ${delivered.text}`)
      .toBe(200);
    expectOk(
      await call("PATCH", `/triagem/monthly/${id}/items`, { status: "PENDING", type: "FISCAL" }),
      "PATCH items FISCAL",
    );
    const read = expectOk(
      await call(
        "GET",
        `/triagem/monthly?client_id=${clientId}&competence=${fiscalCompetence}&type=FISCAL`,
      ),
      "GET monthly FISCAL",
    );
    expect(read.data.billing_amount).toBe("12345,67");
    expect(read.data.item_notes.nfse_provided.note).toBe("Conferido");
    expect(read.data.checklist.inbound_report).toBe("PENDING");
    if (delivered.status === 200) {
      expect(read.data.item_notes.inbound_report.delivery_method).toBe(deliveryCode);
    }
  });

  it("reporting interno: catálogo e extract de cada fonte com todos os campos", async () => {
    expectOk(
      await call(
        "GET",
        "/internal/reporting/catalog",
        undefined,
        await reportingHeaders("catalog", "contabil.catalog", [], {}),
      ),
      "GET reporting/catalog",
    );
    for (const source of ["contabil.control", "contabil.responsibles", "contabil.relationship"]) {
      const fields = [...getContabilReportingFields(source as never)];
      const body = { source, fields, limit: 5 };
      expectOk(
        await call(
          "POST",
          "/internal/reporting/extract",
          body,
          await reportingHeaders("extract", source, fields, body),
        ),
        `POST reporting/extract ${source}`,
      );
    }
  });
});
