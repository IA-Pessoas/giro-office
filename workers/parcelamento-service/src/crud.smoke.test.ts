// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa: campo fora do
// schema do Worker ("Unknown argument"), tabela sem @@map, coluna NOT NULL não preenchida.
// AUDIT_SERVICE é stub: só o banco é real.
import { randomUUID } from "node:crypto";
import { getParcelamentoReportingFields, PARCELAMENTO_REPORTING_SOURCES } from "@workspace/shared";
import { beforeAll, describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  smokeCall,
  smokeEnv,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createParcelamentoWorkerApp, type ParcelamentoWorkerEnv } from "./app.js";
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
  // Chaves já em ordem: é o canonicalJson que o Worker confere.
  const grant = {
    audience: "parcelamento-service",
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

describe.skipIf(!smokeState)("parcelamento-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<ParcelamentoWorkerEnv>({
      AUDIT_SERVICE: { fetch: async () => new Response(null, { status: 201 }) },
      AUDIT_SERVICE_TOKEN: "crud-smoke-audit-token",
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: REPORTS_SECRET,
    } as Partial<ParcelamentoWorkerEnv>);
  // Mesmo status do onError do Worker, mas com a causa real (texto do Prisma) no corpo.
  const app = () =>
    createParcelamentoWorkerApp({ env: env() }).onError((error, c) => {
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
      return c.json({ success: false, error: error.message, cause }, status as 500);
    });
  const call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    smokeCall(app(), env(), method, path, body, headers);

  const suffix = Date.now();
  let clientId = "";

  beforeAll(async () => {
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Parcelamento ${suffix}`,
      status: "Ativo",
    });
    clientId = String(client.id);
  });

  it("parcelamentos e competências: cria, lê, lista, atualiza e recalcula", async () => {
    // Payload de ParcelamentoInstallmentForm (buildCreateInstallmentPayload).
    const created = expectOk(
      await call("POST", "/parcelamento/installments", {
        client_id: clientId,
        agreement_number: `ACORDO-${suffix}`,
        type: "Simplificado",
        legal_nature: "Previdenciário",
        jurisdiction: "Federal",
        is_automatic_debit: false,
        first_installment_amount: 150.5,
        current_month_installment_amount: 120.25,
        agreed_installments_count: 2,
        enrollment_date: "2026-01-15",
      }),
      "POST installments",
    );
    const id = created.data.id as string;
    expectOk(await call("GET", `/parcelamento/installments/${id}`), "GET installments/:id");
    const list = expectOk(
      await call(
        "GET",
        `/parcelamento/installments?page=1&page_size=20&client_id=${clientId}&status=Ativo&type=Simplificado&jurisdiction=Federal&search=Simpl`,
      ),
      "GET installments",
    );
    expect(list.data.items.some((row: { id: string }) => row.id === id)).toBe(true);

    expectOk(
      await call("PATCH", `/parcelamento/installments/${id}`, {
        agreement_number: `ACORDO-${suffix}-B`,
        type: "Ordinário",
        legal_nature: "Não previdenciário",
        jurisdiction: "Estadual",
        is_automatic_debit: true,
        consolidated_total_amount: 999.99,
        first_installment_amount: 200,
        current_month_installment_amount: 100,
        agreed_installments_count: 2,
        enrollment_date: "2026-02-01",
        document_url: "https://example.test/doc.pdf",
        situation_shutdown: "Sem pendência",
        status: "Ativo",
        completion_date: null,
      }),
      "PATCH installments/:id",
    );
    const after = expectOk(await call("GET", `/parcelamento/installments/${id}`), "GET após PATCH");
    expect(after.data).toMatchObject({
      agreement_number: `ACORDO-${suffix}-B`,
      type: "Ordinário",
      jurisdiction: "Estadual",
      is_automatic_debit: true,
      consolidated_total_amount: 999.99,
      document_url: "https://example.test/doc.pdf",
      situation_shutdown: "Sem pendência",
    });

    const competency = expectOk(
      await call("POST", `/parcelamento/installments/${id}/competencies`, {
        competence: "2026-09",
        how_many_paid: 1,
        how_many_overdue: 0,
        download: true,
        download_notes: "Guia baixada",
        upload_file: true,
        is_sent: false,
        submission_type: "E-mail",
        notes: "Primeira",
        installment_amount: 100,
      }),
      "POST competencies",
    );
    const competencyId = competency.data.id as string;
    const competencies = expectOk(
      await call("GET", `/parcelamento/installments/${id}/competencies?page=1&page_size=20`),
      "GET competencies",
    );
    expect(competencies.data.items.some((row: { id: string }) => row.id === competencyId)).toBe(
      true,
    );
    expectOk(
      await call("PATCH", `/parcelamento/installment-competencies/${competencyId}`, {
        how_many_paid: 2,
        how_many_overdue: 1,
        download: false,
        download_notes: null,
        upload_file: false,
        is_sent: true,
        submission_type: "Portal",
        notes: "Atualizada",
        installment_amount: 110,
      }),
      "PATCH installment-competencies/:id",
    );
    const patched = expectOk(
      await call("GET", `/parcelamento/installments/${id}/competencies?page=1&page_size=20`),
      "GET competencies após PATCH",
    );
    expect(patched.data.items.find((row: { id: string }) => row.id === competencyId)).toMatchObject(
      { how_many_paid: 2, is_sent: true, submission_type: "Portal", notes: "Atualizada" },
    );
    // Recalculo: 2 de 2 pagas liquida o parcelamento.
    const settled = expectOk(
      await call("GET", `/parcelamento/installments/${id}`),
      "GET recalculado",
    );
    expect(settled.data).toMatchObject({ paid_installments_count: 2, status: "Liquidado" });
  });

  it("panoramas: cria, lê, lista com filtros, atualiza e gera por competência", async () => {
    const state = requireSmokeState();
    const competence = "2026-09";
    const created = expectOk(
      await call("POST", "/parcelamento/panoramas", {
        client_id: clientId,
        competence,
        cnd_municipal: true,
        cnd_state: false,
        cnd_federal: true,
        cnd_fgts: false,
        cnd_labor: false,
        protests: false,
        state_tax_situation: false,
        federal_tax_situation: true,
        responsavel_id: state.ownerId,
      }),
      "POST panoramas",
    );
    const id = created.data.id as string;
    expectOk(await call("GET", `/parcelamento/panoramas/${id}`), "GET panoramas/:id");
    const list = expectOk(
      await call(
        "GET",
        `/parcelamento/panoramas?page=1&page_size=20&competence=${competence}&client_id=${clientId}&responsavel_id=${state.ownerId}`,
      ),
      "GET panoramas",
    );
    expect(list.data.items.some((row: { id: string }) => row.id === id)).toBe(true);
    expectOk(
      await call("PATCH", `/parcelamento/panoramas/${id}`, {
        cnd_municipal: false,
        cnd_state: true,
        cnd_federal: false,
        cnd_fgts: true,
        cnd_labor: true,
        protests: true,
        state_tax_situation: true,
        federal_tax_situation: false,
        responsavel_id: state.userId,
      }),
      "PATCH panoramas/:id",
    );
    const after = expectOk(await call("GET", `/parcelamento/panoramas/${id}`), "GET após PATCH");
    expect(after.data).toMatchObject({
      cnd_state: true,
      cnd_fgts: true,
      protests: true,
      federal_tax_situation: false,
      responsavel_id: state.userId,
    });
    expectOk(
      await call("PATCH", `/parcelamento/panoramas/${id}`, { responsavel_id: null }),
      "PATCH panoramas/:id responsavel null",
    );

    // Competência distante para não poluir as de outros smokes no mesmo banco.
    const generated = expectOk(
      await call("POST", "/parcelamento/panoramas/competences/2099-12/generate", {}),
      "POST panoramas/generate",
    );
    expect(generated.data).toBeTruthy();
    const generatedList = expectOk(
      await call("GET", `/parcelamento/panoramas?competence=2099-12&client_id=${clientId}`),
      "GET panoramas gerados",
    );
    expect(generatedList.data.items.length).toBe(1);
  });

  it("reporting interno: catálogo e extract de cada fonte com todos os campos", async () => {
    expectOk(
      await call(
        "GET",
        "/internal/reporting/catalog",
        undefined,
        await reportingHeaders("catalog", "parcelamento.catalog", [], {}),
      ),
      "GET reporting/catalog",
    );
    for (const source of PARCELAMENTO_REPORTING_SOURCES) {
      const fields = [...getParcelamentoReportingFields(source)];
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
