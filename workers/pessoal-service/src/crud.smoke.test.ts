// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa: campo fora do
// schema do Worker ("Unknown argument"), coluna ausente, valor que não persiste.
import { createHash, createHmac, randomUUID } from "node:crypto";
import { pessoalReportingCatalog } from "@workspace/pessoal-service/src/reporting/pessoalReportingCatalog.js";
import { serializeError } from "@workspace/shared/http";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeAll, describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  SMOKE_INTERNAL_TOKEN,
  smokeCall,
  smokeEnv,
  smokeHeaders,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createPessoalWorkerApp, type PessoalWorkerEnv } from "./app.js";

const REPORTS_TOKEN = "crud-smoke-reports-token";
const GRANT_SECRET = "crud-smoke-reports-grant-secret";

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

describe.skipIf(!smokeState)("pessoal-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<PessoalWorkerEnv>({
      PESSOAL_PASSWORD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION: "v1",
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: GRANT_SECRET,
    });
  const app = () => {
    const instance = createPessoalWorkerApp({ env: env() });
    // Só no teste: expõe a causa real (erro do Prisma) que o onError esconde nos 5xx.
    instance.onError((error, c) => {
      const serialized = serializeError(error, { fallbackMessage: "Erro interno." });
      if (serialized.statusCode < 500) {
        return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
      }
      const cause = (error as { cause?: unknown }).cause;
      return c.json({ error: String(error), cause: String(cause ?? "") }, 500);
    });
    return instance;
  };
  const call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    smokeCall(app(), env(), method, path, body, headers);

  const stamp = `${Date.now()}-${randomUUID().slice(0, 6)}`;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Clientes novos a cada execução: a unicidade (cliente, competência) não colide.
  const competence = "2026-09";
  let clientId = "";
  let clientWithoutPayrollId = "";
  let clientPessoalNullId = "";
  let groupId = "";
  let targetGroupId = "";
  let unionId = "";

  beforeAll(async () => {
    const state = requireSmokeState();
    const client = (name: string, pessoal: boolean | null = true) =>
      smokeInsert("clients", {
        id: randomUUID(),
        name,
        status: "Ativo",
        pessoal,
        organization_id: state.organizationId,
      });
    clientId = String((await client(`Smoke Pessoal ${stamp}`)).id);
    clientWithoutPayrollId = String((await client(`Smoke Pessoal sem folha ${stamp}`)).id);
    // clients.pessoal é nullable no canônico (Boolean?) e obrigatório no schema do Worker.
    clientPessoalNullId = String((await client(`Smoke Pessoal nulo ${stamp}`, null)).id);
  });

  it("grupos: cria, lê, lista, atualiza, arquiva e reativa", async () => {
    const created = expectOk(
      await call("POST", "/pessoal/groups", { name: `Grupo ${stamp}`, policy: "NORMAL" }),
      "POST groups",
    );
    groupId = created.data.id;
    expect(created.data.policy).toBe("NORMAL");
    expect(expectOk(await call("GET", `/pessoal/groups/${groupId}`), "GET group").data.name).toBe(
      `Grupo ${stamp}`,
    );
    const list = expectOk(await call("GET", "/pessoal/groups"), "GET groups");
    expect(list.data.some((group: { id: string }) => group.id === groupId)).toBe(true);

    expectOk(
      await call("PATCH", `/pessoal/groups/${groupId}`, {
        name: `Grupo ${stamp} Editado`,
        policy: "NO_OBLIGATIONS",
      }),
      "PATCH group",
    );
    const edited = expectOk(await call("GET", `/pessoal/groups/${groupId}`), "GET editado").data;
    expect(edited).toMatchObject({ name: `Grupo ${stamp} Editado`, policy: "NO_OBLIGATIONS" });
    expectOk(
      await call("PATCH", `/pessoal/groups/${groupId}`, {
        name: `Grupo ${stamp}`,
        policy: "NORMAL",
      }),
      "PATCH group de volta",
    );

    expect(
      expectOk(await call("DELETE", `/pessoal/groups/${groupId}`), "arquivar").data.archived_at,
    ).toBeTruthy();
    expect(
      expectOk(await call("POST", `/pessoal/groups/${groupId}/reactivate`), "reativar").data
        .archived_at,
    ).toBeNull();

    targetGroupId = expectOk(
      await call("POST", "/pessoal/groups", { name: `Destino ${stamp}` }),
      "POST group destino",
    ).data.id;
  });

  it("sindicatos: cria, lê, lista (com e sem paginação), atualiza e remove", async () => {
    const created = expectOk(
      await call("POST", "/pessoal/unions", {
        name: `Sindicato ${stamp}`,
        cnpj: "12.345.678/0001-90",
        base_date: tomorrow,
      }),
      "POST unions",
    );
    unionId = created.data.id;
    expect(expectOk(await call("GET", `/pessoal/unions/${unionId}`), "GET union").data.cnpj).toBe(
      "12.345.678/0001-90",
    );
    const all = expectOk(await call("GET", "/pessoal/unions"), "GET unions").data;
    expect(all.some((union: { id: string }) => union.id === unionId)).toBe(true);
    const page = expectOk(
      await call("GET", `/pessoal/unions?search=${encodeURIComponent(stamp)}&page=1&limit=20`),
      "GET unions paginado",
    ).data;
    expect(page.total).toBeGreaterThanOrEqual(1);

    // buildPessoalUnionPayload manda sempre name + cnpj + base_date.
    expectOk(
      await call("PATCH", `/pessoal/unions/${unionId}`, {
        name: `Sindicato ${stamp} Editado`,
        cnpj: "98.765.432/0001-10",
        base_date: tomorrow,
      }),
      "PATCH union",
    );
    const edited = expectOk(await call("GET", `/pessoal/unions/${unionId}`), "GET editado").data;
    expect(edited).toMatchObject({
      name: `Sindicato ${stamp} Editado`,
      cnpj: "98.765.432/0001-10",
    });
    expect(String(edited.base_date).slice(0, 10)).toBe(tomorrow);

    const disposable = expectOk(
      await call("POST", "/pessoal/unions", {
        name: `Descartável ${stamp}`,
        cnpj: "1",
        base_date: null,
      }),
      "POST union descartável",
    ).data.id;
    expectOk(await call("DELETE", `/pessoal/unions/${disposable}`), "DELETE union");
    expect((await call("GET", `/pessoal/unions/${disposable}`)).status).toBe(404);
  });

  it("folha: cria, lê e atualiza todos os campos do front", async () => {
    const state = requireSmokeState();
    const payload = {
      client_id: clientId,
      responsible_id: state.ownerId,
      advance: true,
      advance_type: "Percentual",
      advance_amount: 40,
      info: "Folha criada pelo smoke",
      previous: false,
      onvio: true,
      group_id: groupId,
      vt: true,
      vt_value: 6.5,
      vt_type: "Cartão",
      va: true,
      assistance_fee: true,
      union_id: unionId,
      bem_mais: true,
      bsf: true,
      reinf: false,
      employees: 12,
      contact: "rh@cliente.smoke",
    };
    expectOk(await call("POST", "/pessoal/payroll", payload), "POST payroll");
    const detail = expectOk(await call("GET", `/pessoal/payroll/${clientId}`), "GET payroll").data;
    expect(detail).toMatchObject({ ...payload, group: { id: groupId } });

    const { client_id: _clientId, ...update } = {
      ...payload,
      responsible_id: state.userId,
      advance: false,
      advance_type: null,
      advance_amount: null,
      info: "Folha editada pelo smoke",
      previous: true,
      onvio: false,
      vt: false,
      vt_value: null,
      vt_type: null,
      va: false,
      assistance_fee: false,
      union_id: null,
      bem_mais: false,
      bsf: false,
      reinf: true,
      employees: 3,
      contact: null,
    };
    expectOk(await call("PATCH", `/pessoal/payroll/${clientId}`, update), "PATCH payroll");
    const after = expectOk(await call("GET", `/pessoal/payroll/${clientId}`), "GET após").data;
    expect(after).toMatchObject(update);
    // Volta com obrigações e sindicato para os próximos passos.
    expectOk(
      await call("PATCH", `/pessoal/payroll/${clientId}`, {
        group_id: groupId,
        union_id: unionId,
        advance: true,
        vt: true,
        va: true,
      }),
      "PATCH payroll parcial",
    );
    expect(
      (await call("DELETE", `/pessoal/unions/${unionId}`)).status,
      "sindicato vinculado não remove",
    ).toBe(409);
  });

  it("obrigações: consulta, cria, atualiza cada campo e gera a competência", async () => {
    const state = requireSmokeState();
    const query = `client_id=${clientId}&competence=${competence}`;
    expect(
      expectOk(await call("GET", `/pessoal/obrigations?${query}`), "GET vazio").data,
    ).toBeNull();
    const created = expectOk(
      await call("POST", "/pessoal/obrigations", { client_id: clientId, competence }),
      "POST obrigations",
    ).data;
    expect(created.created).toBe(true);
    const id = created.obligation.id;
    expect(created.obligation).toMatchObject({ advance: false, vt: false, va: false });

    const fields: Record<string, unknown> = {
      advance: true,
      payroll: true,
      charges: true,
      assistance_fee: null,
      responsavel_id: state.userId,
      bem_mais: null,
      bsf: null,
      va: true,
      vt: true,
    };
    for (const [field, value] of Object.entries(fields)) {
      expectOk(
        await call("PATCH", `/pessoal/obrigations/${id}`, { [field]: value }),
        `PATCH obrigations ${field}`,
      );
    }
    const after = expectOk(await call("GET", `/pessoal/obrigations?${query}`), "GET após").data;
    expect(after).toMatchObject(fields);

    const again = expectOk(
      await call("POST", "/pessoal/obrigations", { client_id: clientId, competence }),
      "POST idempotente",
    ).data;
    expect(again.created).toBe(false);

    const next = "2026-10";
    const generated = expectOk(
      await call("POST", `/pessoal/obrigations/competences/${next}/generate`),
      "POST generate",
    ).data;
    expect(generated.created).toBeGreaterThanOrEqual(1);
    const generatedRow = expectOk(
      await call("GET", `/pessoal/obrigations?client_id=${clientId}&competence=${next}`),
      "GET gerada",
    ).data;
    expect(generatedRow.group_snapshot_id).toBe(groupId);
  });

  it("visão geral", async () => {
    const overview = expectOk(await call("GET", "/pessoal/overview"), "GET overview").data;
    expect(overview.unions.total).toBeGreaterThanOrEqual(1);
  });

  it("atribuição de grupo em lote: elegíveis, prévia, aplicação e outbox", async () => {
    const eligible = expectOk(
      await call("GET", `/pessoal/group-assignments/eligible?page=1&limit=25&search=${stamp}`),
      "GET eligible",
    ).data;
    expect(JSON.stringify(eligible)).toContain(clientId);

    const preview = expectOk(
      await call("POST", "/pessoal/group-assignments/previews", {
        group_id: targetGroupId,
        client_ids: [clientId, clientWithoutPayrollId, clientPessoalNullId],
      }),
      "POST preview",
    ).data;
    expect(preview.totals).toMatchObject({ changed: 1, skipped: 2, requested: 3 });
    const detail = expectOk(
      await call(
        "GET",
        `/pessoal/group-assignments/previews/${preview.preview_id}?page=1&limit=25`,
      ),
      "GET preview",
    ).data;
    expect(detail.fingerprint).toBe(preview.fingerprint);

    const headers = { ...(await smokeHeaders()), "Idempotency-Key": `smoke-${stamp}` };
    const body = { preview_id: preview.preview_id, fingerprint: preview.fingerprint };
    const applied = expectOk(
      await call("POST", "/pessoal/group-assignments/apply", body, headers),
      "POST apply",
    ).data;
    expect(applied.idempotent).toBe(false);
    const replay = expectOk(
      await call("POST", "/pessoal/group-assignments/apply", body, headers),
      "POST apply repetido",
    ).data;
    expect(replay.idempotent).toBe(true);
    const payroll = expectOk(await call("GET", `/pessoal/payroll/${clientId}`), "GET payroll").data;
    expect(payroll.group_id).toBe(targetGroupId);

    expectOk(
      await call("POST", "/internal/pessoal/group-assignments/audit-outbox/reconcile", undefined, {
        "x-internal-service-token": SMOKE_INTERNAL_TOKEN,
      }),
      "POST reconcile",
    );
  });

  it("LDD: cria, lista, atualiza e remove", async () => {
    const payload = {
      client_id: clientId,
      type: "Parcelamento",
      period: "2026-01",
      due_date: "2026-10-15",
      balance_amount: 1234.56,
      registration_status: "Cadastrado",
      status: "Em aberto",
    };
    const id = expectOk(await call("POST", "/pessoal/ldd", payload), "POST ldd").data.id;
    const byClient = expectOk(
      await call("GET", `/pessoal/ldd?client_id=${clientId}`),
      "GET ldd",
    ).data;
    expect(byClient.map((row: { id: string }) => row.id)).toContain(id);
    expectOk(await call("GET", "/pessoal/ldd"), "GET ldd sem filtro");

    const update = {
      type: "Débito",
      period: "2026-02",
      due_date: "2026-11-20",
      balance_amount: 10,
      registration_status: null,
      status: "Pago",
    };
    expectOk(await call("PATCH", `/pessoal/ldd/${id}`, update), "PATCH ldd");
    const after = expectOk(
      await call("GET", `/pessoal/ldd?client_id=${clientId}`),
      "GET após",
    ).data.find((row: { id: string }) => row.id === id);
    expect(after).toMatchObject({ ...update, due_date: expect.stringContaining("2026-11-20") });
    expectOk(await call("DELETE", `/pessoal/ldd/${id}`), "DELETE ldd");
  });

  it("situações: cria, lê, lista, finaliza, reabre e remove", async () => {
    const state = requireSmokeState();
    const id = expectOk(
      await call("POST", "/pessoal/situations", {
        client_id: clientId,
        title: "Pendência smoke",
        description: "Descrição smoke",
      }),
      "POST situations",
    ).data.id;
    expect(expectOk(await call("GET", `/pessoal/situations/${id}`), "GET").data.status).toBe(
      "Em andamento",
    );
    const list = expectOk(
      await call("GET", `/pessoal/situations?client_id=${clientId}`),
      "GET list",
    ).data;
    expect(list.map((row: { id: string }) => row.id)).toContain(id);

    expectOk(
      await call("PATCH", `/pessoal/situations/${id}`, {
        title: "Pendência editada",
        description: "Descrição editada",
        status: "Finalizado",
      }),
      "PATCH finalizar",
    );
    const done = expectOk(await call("GET", `/pessoal/situations/${id}`), "GET finalizada").data;
    expect(done).toMatchObject({
      title: "Pendência editada",
      description: "Descrição editada",
      status: "Finalizado",
      completed_by_id: state.ownerId,
    });
    expect(done.completion_date).toBeTruthy();
    expectOk(
      await call("PATCH", `/pessoal/situations/${id}`, { status: "Em andamento" }),
      "reabrir",
    );
    expect(
      expectOk(await call("GET", `/pessoal/situations/${id}`), "GET reaberta").data.completion_date,
    ).toBeNull();
    expectOk(await call("DELETE", `/pessoal/situations/${id}`), "DELETE situations");
  });

  it("senhas: cria, lista, revela, atualiza e remove", async () => {
    const state = requireSmokeState();
    const id = expectOk(
      await call("POST", "/pessoal/passwords", {
        client_id: clientId,
        service_name: "eSocial",
        login_main: "login-smoke",
        senha_main: "senha-smoke",
        login_secondary: null,
        senha_secondary: null,
        responsavel_id: state.ownerId,
        notes: "Nota smoke",
      }),
      "POST passwords",
    ).data.id;
    const list = expectOk(
      await call("GET", `/pessoal/passwords?client_id=${clientId}`),
      "GET list",
    ).data;
    expect(list.find((row: { id: string }) => row.id === id)?.responsavel?.id).toBe(state.ownerId);
    expect(expectOk(await call("GET", `/pessoal/passwords/${id}`), "GET").data).toMatchObject({
      login_main: "login-smoke",
      senha_main: "senha-smoke",
      notes: "Nota smoke",
    });

    const update = {
      service_name: "FGTS Digital",
      login_main: "login-2",
      senha_main: "senha-2",
      login_secondary: "login-sec",
      senha_secondary: "senha-sec",
      responsavel_id: state.userId,
      notes: "Nota editada",
    };
    expectOk(await call("PATCH", `/pessoal/passwords/${id}`, update), "PATCH passwords");
    expect(expectOk(await call("GET", `/pessoal/passwords/${id}`), "GET após").data).toMatchObject(
      update,
    );
    expectOk(await call("DELETE", `/pessoal/passwords/${id}`), "DELETE passwords");
  });

  // #1300: com o audit-service fora, a escrita é revertida; o cliente nunca recebe erro
  // para um dado que ficou gravado.
  it("auditoria recusada reverte a escrita e não expõe o serviço interno", async () => {
    const failingAudit = () =>
      createPessoalWorkerApp({
        env: {
          ...env(),
          AUDIT_SERVICE_TOKEN: "crud-smoke-audit-token",
          AUDIT_SERVICE: { fetch: async () => new Response(null, { status: 401 }) },
        },
      });
    const name = `QA_audit_${stamp}`;
    const union = { name, cnpj: "11.222.333/0001-44", base_date: null };
    const refused = await smokeCall(failingAudit(), undefined, "POST", "/pessoal/unions", union);
    expect(refused.status).toBeGreaterThanOrEqual(500);
    expect(refused.text).not.toMatch(/AUDIT_SERVICE|audit-service/iu);
    const afterCreate = expectOk(
      await call("GET", `/pessoal/unions?search=${encodeURIComponent(name)}&page=1&limit=20`),
      "GET unions após criação recusada",
    ).data;
    expect(afterCreate.total).toBe(0);

    const kept = expectOk(await call("POST", "/pessoal/unions", union), "POST union sem auditoria")
      .data.id;
    const refusedDelete = await smokeCall(
      failingAudit(),
      undefined,
      "DELETE",
      `/pessoal/unions/${kept}`,
    );
    expect(refusedDelete.status).toBeGreaterThanOrEqual(500);
    expectOk(await call("GET", `/pessoal/unions/${kept}`), "union continua após remoção recusada");
    expectOk(await call("DELETE", `/pessoal/unions/${kept}`), "DELETE union");
  });

  it("notificações de sindicato: data base amanhã notifica quem tem Pessoal", async () => {
    const result = expectOk(
      await call("POST", "/internal/pessoal/union-notifications/run", undefined, {
        "x-internal-service-token": SMOKE_INTERNAL_TOKEN,
      }),
      "POST union-notifications/run",
    ).data;
    expect(result.unionsMatched).toBeGreaterThanOrEqual(1);
    // Sem o fix, nenhum usuário real bate no filtro status "Ativo" (users usa "active").
    expect(result.notificationsCreated + result.duplicatesSkipped).toBeGreaterThanOrEqual(1);
  });

  it("reporting: catálogo e extração de todos os campos de cada fonte", async () => {
    const state = requireSmokeState();
    const grantHeaders = (body: { source?: string; fields?: string[] }) => {
      const now = Math.floor(Date.now() / 1000);
      const requestId = `smoke-${randomUUID()}`;
      const payload = {
        audience: "pessoal-service",
        body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
        expires_at: now + 60,
        fields: body.fields ?? [],
        issued_at: now,
        operation: body.source ? "extract" : "catalog",
        organization_id: state.organizationId,
        request_id: requestId,
        source: body.source ?? "pessoal.catalog",
        version: 1,
      };
      const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
      return {
        "content-type": "application/json",
        "x-internal-service-token": REPORTS_TOKEN,
        "x-request-id": requestId,
        "x-reports-grant": grant,
        "x-reports-grant-signature": createHmac("sha256", GRANT_SECRET).update(grant).digest("hex"),
      };
    };
    expectOk(
      await call("GET", "/internal/reporting/catalog", undefined, grantHeaders({})),
      "GET catalog",
    );
    for (const source of pessoalReportingCatalog.sources) {
      const fields = source.fields.map((field) => field.key).slice(0, 25);
      const body = { source: source.key, fields, limit: 50 };
      const data = expectOk(
        await call("POST", "/internal/reporting/extract", body, grantHeaders(body)),
        `extract ${source.key}`,
      ).data;
      expect(Array.isArray(data.rows), source.key).toBe(true);
    }
  });
});
