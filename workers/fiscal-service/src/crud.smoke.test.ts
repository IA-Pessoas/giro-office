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

  it("controle mensal: geração única sob concorrência, elegibilidade, abertura excepcional e reabertura", async () => {
    const eligible = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Controle ${suffix}`,
      status: "Ativo",
      fiscal: true,
      regime: "Simples Nacional",
      // Meio do mês: o pg grava Date em hora local e 01/01 00:00Z viraria 31/12.
      competence_entry: new Date("2026-08-15T12:00:00.000Z"),
    });
    const withoutFiscal = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Sem Fiscal ${suffix}`,
      status: "Ativo",
      fiscal: false,
    });
    const eligibleId = String(eligible.id);
    const withoutFiscalId = String(withoutFiscal.id);

    const before = expectOk(
      await call("GET", "/fiscal/monthly-controls?competence=2026-07"),
      "GET antes da entrada",
    );
    expect(before.data.items.map((item: { client_id: string }) => item.client_id)).not.toContain(
      eligibleId,
    );

    const lists = await Promise.all(
      Array.from({ length: 5 }, () => call("GET", "/fiscal/monthly-controls?competence=2026-09")),
    );
    for (const list of lists) expectOk(list, "GET concorrente");
    const listed = expectOk(
      await call("GET", "/fiscal/monthly-controls?competence=2026-09"),
      "GET /fiscal/monthly-controls",
    );
    const mine = listed.data.items.filter(
      (item: { client_id: string }) => item.client_id === eligibleId,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      competence: "2026-09",
      status: "PENDING",
      no_movement: false,
      regime: "Simples Nacional",
      client_name: `Smoke Controle ${suffix}`,
    });
    expect(listed.data.items.map((item: { client_id: string }) => item.client_id)).not.toContain(
      withoutFiscalId,
    );

    expectOk(
      await call("POST", "/fiscal/monthly-controls", {
        client_id: withoutFiscalId,
        competence: "2026-09",
      }),
      "POST excepcional sem motivo",
      [400],
    );
    const opened = expectOk(
      await call("POST", "/fiscal/monthly-controls", {
        client_id: withoutFiscalId,
        competence: "2026-09",
        reason: "Apuração avulsa pedida pelo cliente",
      }),
      "POST excepcional",
      [201],
    );
    expect(opened.data.control.opening_reason).toBe("Apuração avulsa pedida pelo cliente");
    const again = expectOk(
      await call("POST", "/fiscal/monthly-controls", {
        client_id: withoutFiscalId,
        competence: "2026-09",
        reason: "De novo",
      }),
      "POST repetido",
      [200],
    );
    expect(again.data).toMatchObject({ created: false, control: { id: opened.data.control.id } });

    const id = mine[0].id as string;
    const completed = expectOk(
      await call("PATCH", `/fiscal/monthly-controls/${id}`, {
        status: "COMPLETED",
        no_movement: true,
        // Sem registro na Triagem: conclusão excepcional (owner é nível 3).
        reason: "Sem Triagem nesta competência",
      }),
      "PATCH concluir",
    );
    expect(completed.data).toMatchObject({ status: "COMPLETED", no_movement: true });
    expectOk(
      await call(
        "PATCH",
        `/fiscal/monthly-controls/${id}`,
        { status: "IN_PROGRESS", reason: "Retificação" },
        await smokeHeaders({ type: "user", permission: 2, modules: { fiscal: 2 } }),
      ),
      "PATCH reabrir nível 2",
      [403],
    );
    const reopened = expectOk(
      await call("PATCH", `/fiscal/monthly-controls/${id}`, {
        status: "IN_PROGRESS",
        reason: "Retificação",
      }),
      "PATCH reabrir nível 3",
    );
    expect(reopened.data.status).toBe("IN_PROGRESS");

    const otherOrganization = {
      ...(await smokeHeaders()),
      "x-auth-organization-id": randomUUID(),
    };
    expectOk(
      await call(
        "PATCH",
        `/fiscal/monthly-controls/${id}`,
        { status: "COMPLETED" },
        otherOrganization,
      ),
      "PATCH de outra organização",
      [403, 404],
    );
  });

  it("obrigações mensais: sugestão por regime, pendências, cumprimento, dispensa e isolamento por competência", async () => {
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Obrigações ${suffix}`,
      status: "Ativo",
      fiscal: true,
      regime: "Simples Nacional",
    });
    const clientId = String(client.id);
    const mineIn = async (competence: string) => {
      const list = expectOk(
        await call("GET", `/fiscal/monthly-controls?competence=${competence}`),
        `GET ${competence}`,
      );
      return list.data.items.find((item: { client_id: string }) => item.client_id === clientId);
    };

    const august = await mineIn("2026-08");
    const september = await mineIn("2026-09");
    expect(september.pending_obligations).toBe(1);
    const base = `/fiscal/monthly-controls/${september.id}/obligations`;
    const listed = expectOk(await call("GET", base), "GET obrigações");
    expect(listed.data.items.map((item: { code: string }) => item.code)).toEqual(["PGDAS_D"]);
    // Optante do Simples é dispensada da DIRBI.
    expect(listed.data.addable.map((item: { code: string }) => item.code)).not.toContain("DIRBI");

    expectOk(
      await call("PATCH", `${base}/PGDAS_D`, { applicable: false }),
      "não aplicável sem motivo",
      [400],
    );
    const completed = expectOk(
      await call("PATCH", `${base}/PGDAS_D`, { completed_on: "2026-09-10", protocol: "REC-1" }),
      "cumprir PGDAS-D",
    );
    expect(completed.data).toMatchObject({
      status: "COMPLETED",
      completed_on: "2026-09-10",
      protocol: "REC-1",
    });
    expectOk(
      await call("POST", base, { code: "DIRBI", reason: "Benefício fiscal declarado" }),
      "DIRBI no Simples",
      [400],
    );
    expectOk(
      await call("POST", base, { code: "DCTFWEB", reason: "Empresa com folha no mês" }),
      "incluir DCTFWeb",
      [201],
    );
    const dispensed = expectOk(
      await call("PATCH", `${base}/DCTFWEB`, { applicable: false, reason: "Folha zerada" }),
      "dispensar DCTFWeb",
    );
    expect(dispensed.data).toMatchObject({
      status: "NOT_APPLICABLE",
      not_applicable_reason: "Folha zerada",
    });

    const after = await mineIn("2026-09");
    expect(after).toMatchObject({ pending_obligations: 0, status: "PENDING" });
    expect((await mineIn("2026-08")).pending_obligations).toBe(august.pending_obligations);

    expectOk(
      await call("PATCH", `/fiscal/monthly-controls/${september.id}`, {
        status: "COMPLETED",
        reason: "Sem Triagem nesta competência",
      }),
      "concluir controle",
    );
    expectOk(
      await call("PATCH", `${base}/PGDAS_D`, { completed_on: null }),
      "obrigação com controle concluído",
      [409],
    );
  });

  it("conclusão: Triagem em dia conclui no nível 2; com pendência só nível 3 com justificativa, sem tocar na Triagem", async () => {
    const insertClient = async (name: string) =>
      String(
        (
          await smokeInsert("clients", {
            id: randomUUID(),
            name: `${name} ${suffix}`,
            status: "Ativo",
            fiscal: true,
            regime: "Lucro Presumido",
          })
        ).id,
      );
    const upToDate = await insertClient("Smoke Triagem em dia");
    const pending = await insertClient("Smoke Triagem pendente");
    const checklist = { inbound_report: "PENDING", outbound_report: "COMPLETED" };
    for (const [clientId, items] of [
      [upToDate, { inbound_report: "COMPLETED", outbound_report: "NOT_PRESENT" }],
      [pending, checklist],
    ] as const) {
      await smokeInsert("triagem.monthly", {
        id: randomUUID(),
        client_id: clientId,
        competence: "2026-09",
        type: "FISCAL",
        checklist: items,
      });
    }

    const list = expectOk(
      await call("GET", "/fiscal/monthly-controls?competence=2026-09"),
      "GET carteira",
    );
    const find = (clientId: string) =>
      list.data.items.find((item: { client_id: string }) => item.client_id === clientId);
    expect(find(upToDate).triage_pending).toBe(0);
    expect(find(pending).triage_pending).toBe(1);

    const editor = await smokeHeaders({ type: "user", permission: 2, modules: { fiscal: 2 } });
    expectOk(
      await call(
        "PATCH",
        `/fiscal/monthly-controls/${find(upToDate).id}`,
        { status: "COMPLETED" },
        editor,
      ),
      "nível 2 conclui em dia",
    );
    expectOk(
      await call(
        "PATCH",
        `/fiscal/monthly-controls/${find(pending).id}`,
        { status: "COMPLETED", reason: "Urgente" },
        editor,
      ),
      "nível 2 com pendência",
      [403],
    );
    expectOk(
      await call("PATCH", `/fiscal/monthly-controls/${find(pending).id}`, { status: "COMPLETED" }),
      "nível 3 sem justificativa",
      [400],
    );
    const completed = expectOk(
      await call("PATCH", `/fiscal/monthly-controls/${find(pending).id}`, {
        status: "COMPLETED",
        reason: "Relatório recebido por e-mail",
      }),
      "conclusão excepcional",
    );
    expect(completed.data.status).toBe("COMPLETED");

    const triage = expectOk(
      await call("GET", `/fiscal/monthly-controls/${find(pending).id}/triage`, undefined, editor),
      "GET triagem do controle",
    );
    // A Triagem fica como estava.
    expect(triage.data).toMatchObject({
      source: "MONTHLY",
      pending: 1,
      items: [
        { field: "inbound_report", status: "PENDING" },
        { field: "outbound_report", status: "COMPLETED" },
      ],
    });
  });

  it("responsáveis: snapshot ao nascer, carteira atual separada e transferência auditada", async () => {
    const { ownerId, userId, databaseUrl, organizationId } = requireSmokeState();
    const clientId = String(
      (
        await smokeInsert("clients", {
          id: randomUUID(),
          name: `Smoke Responsável ${suffix}`,
          status: "Ativo",
          fiscal: true,
          regime: "Lucro Real",
        })
      ).id,
    );
    await smokeInsert("triagem.responsibles", {
      id: randomUUID(),
      client_id: clientId,
      user_id: ownerId,
      type: "FISCAL",
    });
    const mineIn = async (competence: string) => {
      const list = expectOk(
        await call("GET", `/fiscal/monthly-controls?competence=${competence}`),
        `GET ${competence}`,
      );
      return list.data.items.find((item: { client_id: string }) => item.client_id === clientId);
    };

    const august = await mineIn("2026-08");
    expect(august).toMatchObject({ responsible_id: ownerId, default_responsible_id: ownerId });

    // A carteira muda: vale para competências novas, sem reescrever agosto.
    const { createRequire } = await import("node:module");
    const require = createRequire(new URL("../../../infra/package.json", import.meta.url));
    const { Client } = require("pg") as {
      Client: new (
        options: object,
      ) => {
        connect(): Promise<void>;
        end(): Promise<void>;
        query(text: string, values?: unknown[]): Promise<unknown>;
      };
    };
    const pg = new Client({ connectionString: databaseUrl });
    await pg.connect();
    await pg.query(
      `update "triagem.responsibles" set user_id = $1
        where organization_id = $2 and client_id = $3 and type = 'FISCAL'`,
      [userId, organizationId, clientId],
    );
    await pg.end();

    const september = await mineIn("2026-09");
    expect(september).toMatchObject({ responsible_id: userId, default_responsible_id: userId });
    expect(await mineIn("2026-08")).toMatchObject({
      responsible_id: ownerId,
      default_responsible_id: userId,
    });

    const candidates = expectOk(
      await call("GET", "/fiscal/monthly-controls/responsibles"),
      "GET candidatos",
    );
    expect(candidates.data.map((user: { id: string }) => user.id)).toEqual(
      expect.arrayContaining([ownerId, userId]),
    );

    const editor = await smokeHeaders({ type: "user", permission: 2, modules: { fiscal: 2 } });
    expectOk(
      await call(
        "POST",
        "/fiscal/monthly-controls/transfer",
        { control_ids: [september.id], to_user_id: ownerId, reason: "Férias" },
        editor,
      ),
      "transferência nível 2",
      [403],
    );
    const single = expectOk(
      await call("POST", "/fiscal/monthly-controls/transfer", {
        control_ids: [september.id],
        to_user_id: ownerId,
        reason: "Férias do responsável",
      }),
      "transferência individual",
    );
    expect(single.data).toEqual({ transferred: [september.id], skipped: [] });

    expectOk(
      await call("PATCH", `/fiscal/monthly-controls/${august.id}`, {
        status: "COMPLETED",
        reason: "Sem Triagem nesta competência",
      }),
      "concluir agosto",
    );
    expectOk(
      await call("POST", "/fiscal/monthly-controls/transfer", {
        control_ids: [august.id],
        to_user_id: userId,
        reason: "Redistribuição",
      }),
      "transferência individual de concluído",
      [409],
    );
    const batch = expectOk(
      await call("POST", "/fiscal/monthly-controls/transfer", {
        control_ids: [august.id, september.id],
        to_user_id: userId,
        reason: "Redistribuição",
      }),
      "transferência em lote",
    );
    expect(batch.data).toEqual({
      transferred: [september.id],
      skipped: [{ id: august.id, reason: "Controle concluído." }],
    });
    expect(await mineIn("2026-08")).toMatchObject({ responsible_id: ownerId });
  });

  it("controle anual: um por cliente e ano sob concorrência, DEFIS no Simples, declarações e trilha", async () => {
    const insertClient = async (name: string, regime: string) =>
      String(
        (
          await smokeInsert("clients", {
            id: randomUUID(),
            name: `${name} ${suffix}`,
            status: "Ativo",
            fiscal: true,
            regime,
          })
        ).id,
      );
    const simples = await insertClient("Smoke Anual Simples", "Simples Nacional");
    const real = await insertClient("Smoke Anual Real", "Lucro Real");

    const lists = await Promise.all(
      Array.from({ length: 4 }, () => call("GET", "/fiscal/annual-controls?year=2025")),
    );
    for (const list of lists) expectOk(list, "GET anual concorrente");
    const list = expectOk(await call("GET", "/fiscal/annual-controls?year=2025"), "GET anual");
    const find = (clientId: string) =>
      list.data.items.filter((item: { client_id: string }) => item.client_id === clientId);
    expect(find(simples)).toHaveLength(1);
    expect(find(simples)[0].declarations).toEqual([
      { code: "DEFIS", status: "PENDING", completed_on: null },
    ]);
    expect(find(real)[0].declarations).toEqual([]);
    expect(find(simples)[0]).not.toHaveProperty("status");

    const realBase = `/fiscal/annual-controls/${find(real)[0].id}/items`;
    const addable = expectOk(await call("GET", realBase), "GET declarações Real");
    expect(addable.data.addable.map((item: { code: string }) => item.code)).toEqual([
      "DMED",
      "DIMOB",
    ]);
    expectOk(
      await call("POST", realBase, { code: "DEFIS", reason: "x".repeat(3) }),
      "DEFIS no Real",
      [400],
    );
    expectOk(await call("POST", realBase, { code: "DIMOB" }), "DIMOB sem motivo", [400]);
    expectOk(
      await call("POST", realBase, { code: "DIMOB", reason: "Incorporadora" }),
      "incluir DIMOB",
      [201],
    );

    const simplesBase = `/fiscal/annual-controls/${find(simples)[0].id}/items`;
    const done = expectOk(
      await call("PATCH", `${simplesBase}/DEFIS`, {
        completed_on: "2026-03-20",
        protocol: "DEF-1",
      }),
      "cumprir DEFIS",
    );
    expect(done.data).toMatchObject({ status: "COMPLETED", completed_on: "2026-03-20" });
    expectOk(
      await call("PATCH", `${simplesBase}/DEFIS`, { applicable: false, reason: "MEI" }),
      "dispensar cumprida",
      [409],
    );

    const otherOrganization = {
      ...(await smokeHeaders()),
      "x-auth-organization-id": randomUUID(),
    };
    expectOk(
      await call("GET", simplesBase, undefined, otherOrganization),
      "declarações de outra organização",
      [403, 404],
    );
  });

  it("receitas mensais: cria, recusa duplicada, lista por período e corrige", async () => {
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Receita ${suffix}`,
      status: "Ativo",
      fiscal: true,
      regime: "Simples Nacional",
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

  it("malhas: cria, atualiza com histórico, filtra e isola por organização", async () => {
    const state = requireSmokeState();
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Malha ${suffix}`,
      status: "Ativo",
      fiscal: true,
    });
    const clientId = String(client.id);
    const created = expectOk(
      await call("POST", "/fiscal/malhas", {
        client_id: clientId,
        period_start: "2025-01",
        period_end: "2025-12",
        reason: "Divergência DCTFWeb",
        deadline: "2026-11-10",
        responsible_id: state.ownerId,
      }),
      "POST /fiscal/malhas",
    );
    const id = created.data.id as string;
    expect(created.data).toMatchObject({ status: "aberta", deadline: "2026-11-10" });
    expectOk(
      await call("POST", "/fiscal/malhas", {
        client_id: clientId,
        period_start: "2025-01",
        period_end: "2025-12",
        reason: "x",
        task_id: randomUUID(),
      }),
      "POST com tarefa inexistente",
      [404],
    );

    expectOk(
      await call("PUT", `/fiscal/malhas/${id}`, { status: "respondida", deadline: null }),
      "PUT /fiscal/malhas/:id",
    );
    const detail = expectOk(await call("GET", `/fiscal/malhas/${id}`), "GET /fiscal/malhas/:id");
    const history = detail.data.history as { field: string; new_value: string | null }[];
    expect(history.filter((row) => row.field === "status").map((row) => row.new_value)).toEqual([
      "respondida",
      "aberta",
    ]);
    expect(history.find((row) => row.field === "deadline")).toMatchObject({ new_value: null });

    const list = expectOk(
      await call("GET", `/fiscal/malhas/list?client_id=${clientId}&status=respondida`),
      "GET /fiscal/malhas/list",
    );
    expect(list.data.data.map((row: { id: string }) => row.id)).toEqual([id]);

    const otherOrganization = {
      ...(await smokeHeaders()),
      "x-auth-organization-id": randomUUID(),
    };
    const foreign = await call("GET", `/fiscal/malhas/${id}`, undefined, otherOrganization);
    expect(foreign.status).not.toBe(200);
    const foreignUpdate = await call(
      "PUT",
      `/fiscal/malhas/${id}`,
      { status: "encerrada" },
      otherOrganization,
    );
    expect(foreignUpdate.status).not.toBe(200);
  });

  it("atacadista: marca, desmarca com trilha e isola por organização", async () => {
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Atacadista ${suffix}`,
      status: "Ativo",
      fiscal: true,
    });
    const clientId = String(client.id);
    const path = `/fiscal/clients/${clientId}/wholesale`;
    const initial = expectOk(await call("GET", path), "GET wholesale inicial");
    expect(initial.data).toMatchObject({ is_wholesale: false, history: [] });

    expectOk(await call("PUT", path, { is_wholesale: true }), "PUT wholesale true");
    expectOk(await call("PUT", path, { is_wholesale: true }), "PUT wholesale repetido");
    const final = expectOk(await call("PUT", path, { is_wholesale: false }), "PUT wholesale false");
    expect(final.data.is_wholesale).toBe(false);
    expect(
      final.data.history.map((row: { previous_value: boolean; new_value: boolean }) => [
        row.previous_value,
        row.new_value,
      ]),
    ).toEqual([
      [true, false],
      [false, true],
    ]);

    const otherOrganization = {
      ...(await smokeHeaders()),
      "x-auth-organization-id": randomUUID(),
    };
    const foreign = await call("PUT", path, { is_wholesale: true }, otherOrganization);
    expect(foreign.status).not.toBe(200);
    const after = expectOk(await call("GET", path), "GET após outra organização");
    expect(after.data.is_wholesale).toBe(false);
  });

  it("lote do Simples: CSV com elegíveis e motivo dos ignorados", async () => {
    const document = `91${suffix}0001`;
    const eligible = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Lote ${suffix}`,
      company_name: `Smoke Lote ${suffix} Ltda`,
      cpf_cnpj: document,
      status: "Ativo",
      fiscal: true,
      regime: "Simples Nacional",
    });
    const presumido = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Presumido ${suffix}`,
      cpf_cnpj: `92${suffix}0001`,
      status: "Ativo",
      fiscal: true,
      regime: "Lucro Presumido",
    });
    // Mesmo documento, elegível, em outra organização: não pode entrar no lote.
    const otherOrganization = await smokeInsert("organizations", { id: randomUUID() });
    await smokeInsert("clients", {
      id: randomUUID(),
      organization_id: String(otherOrganization.id),
      name: `Smoke Outra Org ${suffix}`,
      cpf_cnpj: `93${suffix}0001`,
      status: "Ativo",
      fiscal: true,
      regime: "Simples Nacional",
    });
    expectOk(
      await call("POST", "/fiscal/revenues", {
        client_id: String(eligible.id),
        competence: "2026-07",
        amount: "11000.00",
      }),
      "POST receita do lote",
    );

    const exported = expectOk(
      await call("POST", "/fiscal/simples/csv", {
        competence: "2026-08",
        annex: "III",
        documents: [document, String(presumido.cpf_cnpj), `93${suffix}0001`],
      }),
      "POST /fiscal/simples/csv",
    );
    // RBT12 = 11.000 + 1.000 = 12.000 (1ª faixa): ISS 2,01%.
    expect(exported.data.csv).toContain(`Smoke Lote ${suffix} Ltda;${document};2,01`);
    const zipped = expectOk(
      await call("POST", "/fiscal/simples/zip", {
        competence: "2026-08",
        annex: "III",
        documents: [document, String(presumido.cpf_cnpj)],
      }),
      "POST /fiscal/simples/zip",
    );
    const archive = Buffer.from(zipped.data.zip_base64, "base64");
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.toString("latin1")).toContain(
      `aliquota-ISS-anexo-III-2026-09-smoke-lote-${suffix}-ltda-${document}.pdf`,
    );
    expect(zipped.data.skipped).toHaveLength(1);
    expect(exported.data.skipped).toEqual([
      {
        document: String(presumido.cpf_cnpj),
        client_name: `Smoke Presumido ${suffix}`,
        reason: "Cliente fora do Simples Nacional.",
      },
      {
        document: `93${suffix}0001`,
        client_name: null,
        reason: "Cliente não encontrado nesta organização.",
      },
    ]);
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
