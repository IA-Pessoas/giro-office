// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa, e o
// "200 mas não salvou": toda escrita é relida pela rota de leitura da tela.
import { randomUUID } from "node:crypto";
import { serializeError } from "@workspace/shared/http";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  SMOKE_INTERNAL_TOKEN,
  smokeCall,
  smokeEnv,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { type ClientWorkerEnv, createClientWorkerApp } from "./app.js";

const REPORTS_TOKEN = "crud-smoke-reports-token";
const REPORTS_SECRET = "crud-smoke-reports-secret";

// O onError do Worker esconde a mensagem do 5xx; aqui ela volta em `debug` para o relatório.
function debugApp(env: ClientWorkerEnv) {
  const app = createClientWorkerApp({ env });
  app.onError((error, c) => {
    const serialized = serializeError(error, { fallbackMessage: "erro interno" });
    const debug = serialized.statusCode >= 500 ? String(error) : undefined;
    if (debug) console.error(error);
    return c.json(
      { ...(serialized.body as object), debug },
      serialized.statusCode as ContentfulStatusCode,
    );
  });
  return app;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

async function reportsHeaders(body: unknown, operation: "catalog" | "extract", fields: string[]) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const grant = {
    audience: "client-service",
    body_sha256: hex(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(body))),
    ),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: requireSmokeState().organizationId,
    request_id: "crud-smoke",
    source: operation === "catalog" ? "integracao.catalog" : "integracao.clients",
    version: 1,
  };
  const encoded = btoa(canonical(grant))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(REPORTS_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return {
    "content-type": "application/json",
    "x-internal-service-token": REPORTS_TOKEN,
    "x-request-id": "crud-smoke",
    "x-reports-grant": encoded,
    "x-reports-grant-signature": hex(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)),
    ),
  };
}

// CNPJ alfanumérico único com dígitos verificadores válidos (o Worker valida desde #1309).
function cnpjDigit(base: string): number {
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - base.length);
  const sum = weights.reduce(
    (total, weight, index) => total + (base.charCodeAt(index) - 48) * weight,
    0,
  );
  return sum % 11 < 2 ? 0 : 11 - (sum % 11);
}
const uniqueCnpj = () => {
  const base = `SM${Date.now().toString().slice(-6)}${randomUUID().slice(0, 4)}`.toUpperCase();
  const first = cnpjDigit(base);
  return `${base}${first}${cnpjDigit(`${base}${first}`)}`;
};

describe.skipIf(!smokeState)("client-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<ClientWorkerEnv>({
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: REPORTS_SECRET,
    });
  const call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    smokeCall(debugApp(env()), env(), method, path, body, headers);

  it("regimes: cadastra, renomeia e seleciona na ficha sem reescrever o valor gravado", async () => {
    const name = `Smoke Regime ${Date.now()}`;
    const regime = expectOk(
      await call("POST", "/client/regimes", { name }),
      "POST /client/regimes",
    ).data;
    expect(
      expectOk(await call("GET", "/client/regimes"), "GET /client/regimes").data.map(
        (row: { id: string }) => row.id,
      ),
    ).toContain(regime.id);

    const client = expectOk(
      await call("POST", "/client/integration", {
        organization_id: requireSmokeState().organizationId,
        type: "PJ",
        name: `Smoke Cliente Regime ${Date.now()}`,
        cpf_cnpj: uniqueCnpj(),
      }),
      "POST /client/integration (regime)",
    ).data;
    expectOk(
      await call("PATCH", `/client/${client.id}`, { regime: name.toUpperCase() }),
      "PATCH /client/:id regime",
    );
    expect(expectOk(await call("GET", `/client/${client.id}`), "GET regime").data.regime).toBe(
      name,
    );

    expectOk(
      await call("PATCH", `/client/regimes/${regime.id}`, { name: `${name} Renomeado` }),
      "PATCH /client/regimes/:id",
    );
    expect(
      expectOk(await call("GET", `/client/${client.id}`), "GET após renomear").data.regime,
    ).toBe(name);
  });

  it("segmentos: cadastra com tipo, muda o tipo e seleciona pelo Regularize", async () => {
    const name = `Smoke Segmento ${Date.now()}`;
    const segment = expectOk(
      await call("POST", "/client/segments", { name, type: "servico" }),
      "POST /client/segments",
    ).data;
    expectOk(
      await call("PATCH", `/client/segments/${segment.id}`, { type: "industria" }),
      "PATCH /client/segments/:id",
    );
    const listed = expectOk(await call("GET", "/client/segments"), "GET /client/segments").data;
    expect(listed.find((row: { id: string }) => row.id === segment.id)).toMatchObject({
      name,
      type: "industria",
    });

    const client = expectOk(
      await call("POST", "/client/integration", {
        organization_id: requireSmokeState().organizationId,
        type: "PJ",
        name: `Smoke Cliente Segmento ${Date.now()}`,
        cpf_cnpj: uniqueCnpj(),
      }),
      "POST /client/integration (segmento)",
    ).data;
    expectOk(
      await call("PATCH", `/client/${client.id}/regularize`, { segment: name.toLowerCase() }),
      "PATCH /client/:id/regularize segmento",
    );
    expect(expectOk(await call("GET", `/client/${client.id}`), "GET segmento").data.segment).toBe(
      name,
    );
  });

  it("integração: cria, lê, lista com filtros, atualiza, inativa e reativa", async () => {
    const cnpj = uniqueCnpj();
    const name = `Smoke Cliente ${Date.now()}`;
    // buildCreateClientIntegrationPayload (pages/clients/integration/new.tsx).
    const created = expectOk(
      await call("POST", "/client/integration", {
        organization_id: requireSmokeState().organizationId,
        type: "PJ",
        name,
        cpf_cnpj: cnpj,
        company_name: `${name} LTDA`,
        fantasy_name: name,
        opening_date: "2020-05-10",
        responsible: "Fulano Smoke",
        cpf_responsible: "12345678909",
        number: "11999998888",
        email: "smoke@smoke.local",
        agent: "Agente",
        cpf_agent: "98765432100",
        instagram: "@smoke",
        indication: "Indicação",
        participants_meet: "Fulano",
        meet_type: "Online",
        type_registration: "Novo",
        service_unique: false,
      }),
      "POST /client/integration",
    );
    const id = created.data.id as string;
    expect(created.data.cpf_cnpj).toBe(cnpj);

    const detail = expectOk(await call("GET", `/client/${id}`), "GET /client/:id").data;
    expect(detail).toMatchObject({ name, status: "Prospecção", fantasy_name: name });

    for (const query of [
      `search=${encodeURIComponent(name)}&page=1&limit=20`,
      "ref=integracao&status=Ativo&page=1&limit=20",
      "ref=integracao&status=Prospecção PJ&page=1&limit=20",
      "ref=integracao&status=Ativo e Prospecção&page=1&limit=20",
      "ref=integracao&status=Não Contradados e Paralisados&page=1&limit=20",
      "ref=deps&status=Departamento contabil&page=1&limit=20",
      "status=Prospect&page=1&limit=20",
      "status=Todos&page=1&limit=100",
    ]) {
      expectOk(await call("GET", `/client/list?${query}`), `GET /client/list?${query}`);
    }
    const found = expectOk(
      await call("GET", `/client/list?search=${encodeURIComponent(cnpj)}`),
      "GET /client/list?search=cnpj",
    ).data;
    expect(found.items.map((item: { id: string }) => item.id)).toContain(id);

    // buildUpdateClientIntegrationPayload: todos os campos editáveis da tela de integração.
    expectOk(
      await call("PATCH", `/client/${id}/integration`, {
        type: "PJ",
        name: `${name} Editado`,
        company_name: "Razão Editada",
        fantasy_name: "Fantasia Editada",
        cpf_responsible: "111.444.777-35",
        agent: "Agente 2",
        cpf_agent: "529.982.247-25",
        number: "11888887777",
        email: "editado@smoke.local",
        address: "Rua Smoke, 1",
        cep: "01001000",
        neighborhood: "Centro",
        state: "SP",
        city: "São Paulo",
        instagram: "@editado",
        indication: "Outra",
        type_registration: "Antigo",
        service_unique: true,
      }),
      "PATCH /client/:id/integration",
    );
    expect(expectOk(await call("GET", `/client/${id}`), "GET após integração").data).toMatchObject({
      name: `${name} Editado`,
      company_name: "Razão Editada",
      cpf_responsible: "11144477735",
      cpf_agent: "52998224725",
      city: "São Paulo",
      service_unique: true,
      type_registration: "Antigo",
    });

    expectOk(
      await call("PATCH", `/client/${id}`, { status: "Ativo", prospecting_status: "Fechado" }),
      "PATCH /client/:id",
    );
    expect(expectOk(await call("GET", `/client/${id}`), "GET após PATCH").data.status).toBe(
      "Ativo",
    );

    expectOk(await call("DELETE", `/client/${id}`), "DELETE /client/:id");
    const inactive = expectOk(await call("GET", `/client/${id}`), "GET após inativar").data;
    expect(inactive.status).toBe("Inativo");
    expect(inactive.deletion_date).toBeTruthy();
    expectOk(await call("POST", `/client/${id}/activate`), "POST /client/:id/activate");
    expect(expectOk(await call("GET", `/client/${id}`), "GET após ativar").data.status).toBe(
      "Ativo",
    );
  });

  // Falha hoje: sem "Data de abertura" a tela manda opening_date: null e z.coerce.date()
  // transforma null em 1970-01-01 (createIntegrationBodySchema).
  it("integração sem data de abertura não grava 1970-01-01", async () => {
    const created = expectOk(
      await call("POST", "/client/integration", {
        type: "PJ",
        name: `Smoke Sem Abertura ${Date.now()}`,
        cpf_cnpj: uniqueCnpj(),
        opening_date: null,
        type_registration: "Existente",
        service_unique: false,
      }),
      "POST /client/integration sem abertura",
    );
    const detail = expectOk(await call("GET", `/client/${created.data.id}`), "GET").data;
    expect(detail.opening_date).toBeNull();
  });

  it("POST /client cria com os campos estendidos", async () => {
    const created = expectOk(
      await call("POST", "/client", {
        name: `Smoke Direto ${Date.now()}`,
        status: "Ativo",
        cpf_cnpj: uniqueCnpj(),
        prospecting_status: "Fechado",
        type: "PJ",
        type_registration: "Antigo",
        service_unique: false,
        dominio_code: "123",
        regime: "Simples Nacional",
        contabil: true,
        contract: true,
        customer_since: "2024-01-01",
      }),
      "POST /client",
    );
    expect(created.data).toMatchObject({ dominio_code: "123", contabil: true, contract: true });
  });

  it("BUG-003/004: finance e regularize persistem", async () => {
    const id = (
      expectOk(
        await call("POST", "/client", {
          name: `Smoke Regularize ${Date.now()}`,
          status: "Ativo",
          cpf_cnpj: uniqueCnpj(),
          prospecting_status: "Fechado",
        }),
        "POST /client",
      ).data as { id: string }
    ).id;
    // Segmento vem do catálogo da organização (#1741).
    const segmentName = `Smoke Contabilidade ${Date.now()}`;
    expectOk(
      await call("POST", "/client/segments", { name: segmentName, type: "servico" }),
      "POST /client/segments (regularize)",
    );

    // buildFinancePayload: só `contract`.
    const finance = expectOk(
      await call("PATCH", `/client/${id}/finance`, { contract: true }),
      "PATCH /client/:id/finance",
    );
    expect(finance.data.contract).toBe(true);
    expect(expectOk(await call("GET", `/client/${id}`), "GET após finance").data.contract).toBe(
      true,
    );

    // buildRegularizePayload com todos os campos do formulário.
    // CNPJ novo a cada execução: o banco do smoke é reaproveitado entre rodadas.
    const regularizedCnpj = uniqueCnpj();
    const regularize = {
      dominio_code: "4321",
      name: "Smoke Regularizado",
      company_name: "Regularizada LTDA",
      fantasy_name: "Regularizada",
      cpf_cnpj: regularizedCnpj,
      cnae: "6201-5/01",
      cnae_secondary: "6202-3/00",
      responsible: "Beltrano",
      cpf_responsible: "52998224725",
      number: "11977776666",
      email: "reg@smoke.local",
      address: "Av Smoke, 2",
      cep: "20000000",
      neighborhood: "Bairro",
      state: "RJ",
      city: "Rio de Janeiro",
      customer_since: "2023-02-01",
      municipal_registration: "MUN-1",
      state_registration: "EST-1",
      commercial_board_registration: "JUC-1",
      opening_date: "2019-03-04",
      regime: "Lucro Presumido",
      size: "EPP",
      segment: segmentName,
      contabil: true,
      fiscal: true,
      pessoal: false,
      infoproduto: true,
      consultoria: false,
      start_strike: "2025-01-01",
      end_strike: "2025-02-01",
      deletion_date: null,
    };
    expectOk(
      await call("PATCH", `/client/${id}/regularize`, regularize),
      "PATCH /client/:id/regularize",
    );
    const after = expectOk(await call("GET", `/client/${id}`), "GET após regularize").data;
    expect(after).toMatchObject({
      dominio_code: "4321",
      name: "Smoke Regularizado",
      cpf_cnpj: regularizedCnpj,
      cnae: "6201-5/01",
      regime: "Lucro Presumido",
      size: "EPP",
      segment: segmentName,
      contabil: true,
      fiscal: true,
      pessoal: false,
      infoproduto: true,
      municipal_registration: "MUN-1",
      deletion_date: null,
    });
    expect(after.customer_since).toMatch(/^2023-02-01/);
    expect(after.start_strike).toMatch(/^2025-01-01/);
  });

  it("BUG-005: PA cria, lê detail, atualiza e persiste", async () => {
    const id = (
      expectOk(
        await call("POST", "/client", {
          name: `Smoke PA ${Date.now()}`,
          status: "Ativo",
          cpf_cnpj: uniqueCnpj(),
          prospecting_status: "Fechado",
          regime: "Lucro Presumido",
        }),
        "POST /client",
      ).data as { id: string }
    ).id;

    expect(expectOk(await call("GET", `/client/${id}/pa`), "GET PA vazio").data.detail).toBeNull();
    const created = expectOk(await call("POST", `/client/${id}/pa`, {}), "POST /client/:id/pa");
    expect(created.data.client_id).toBe(id);
    const detail = expectOk(await call("GET", `/client/${id}/pa`), "GET /client/:id/pa").data
      .detail;
    expect(detail).not.toBeNull();
    expect(detail.client.regime).toBe("Lucro Presumido");
    expect((await call("POST", `/client/${id}/pa`, {})).status).toBe(409);

    const pa = {
      activities: "Comércio",
      tax_billing: "1000",
      management_billing: "2000",
      works_bidding: true,
      dissatisfaction: "Nenhuma",
      registered_collabortors: 3,
      unregistered_collabortors: 1,
      esocial: true,
      how_many_banks: true,
      whitch_banks: "Itaú",
      responsible_departments: "Contábil",
      works_system: true,
      system_name: "ERP",
      system_usage_time: "2 anos",
      system_value: "300",
      system_contact: "Suporte",
      system_operations: "Fiscal",
      cloud_storage: true,
      which_cloud_storage: "Drive",
      rental_agreement: false,
      assessment_regime: "Competência",
      permit: "Alvará",
      services: "Contábil",
    };
    expectOk(await call("PATCH", `/client/${id}/pa`, pa), "PATCH /client/:id/pa");
    expect(
      expectOk(await call("GET", `/client/${id}/pa`), "GET PA após PATCH").data.detail,
    ).toMatchObject(pa);

    // #1310: um POST repetido não pode recriar o PA com campos nulos.
    expect((await call("POST", `/client/${id}/pa`, {})).status).toBe(409);
    expect(
      expectOk(await call("GET", `/client/${id}/pa`), "GET PA após POST repetido").data.detail,
    ).toMatchObject(pa);
  });

  it("históricos e pendências", async () => {
    const state = requireSmokeState();
    const id = (
      expectOk(
        await call("POST", "/client", {
          name: `Smoke Hist ${Date.now()}`,
          status: "Ativo",
          cpf_cnpj: uniqueCnpj(),
        }),
        "POST /client",
      ).data as { id: string }
    ).id;

    const pending = expectOk(
      await call("POST", `/client/${id}/histories/pending`, { reason: "Ligar para o cliente" }),
      "POST histories/pending",
    ).data;
    const pendingList = expectOk(
      await call("GET", `/client/histories/pending?user_id=${state.ownerId}`),
      "GET histories/pending",
    ).data.list;
    expect(pendingList.map((item: { id: string }) => item.id)).toContain(pending.id);

    const history = expectOk(
      await call("POST", `/client/${id}/histories`, {
        date: new Date().toISOString(),
        history: "Primeiro contato",
        pending_id: pending.id,
      }),
      "POST histories",
    ).data;
    const pendingAfter = expectOk(
      await call("GET", "/client/histories/pending"),
      "GET histories/pending após baixa",
    ).data.list;
    expect(pendingAfter.map((item: { id: string }) => item.id)).not.toContain(pending.id);

    const list = expectOk(await call("GET", `/client/${id}/histories`), "GET histories").data.list;
    expect(list[0]?.user?.department?.name).toBe("Tecnologia");
    expectOk(
      await call("PATCH", `/client/${id}/histories/${history.id}`, {
        date: "2026-01-02T10:00:00.000Z",
        history: "Contato editado",
      }),
      "PATCH history",
    );
    const one = expectOk(await call("GET", `/client/${id}/histories/${history.id}`), "GET history")
      .data.detail;
    expect(one.history).toBe("Contato editado");
    // Sem anexo: 404 de domínio.
    expect((await call("GET", `/client/${id}/histories/${history.id}/file`)).status).toBe(404);

    const other = expectOk(
      await call("POST", `/client/${id}/histories/pending`, { reason: "Excluir" }),
      "POST pending 2",
    ).data;
    expectOk(await call("DELETE", `/client/histories/pending/${other.id}`), "DELETE pending");
    expect((await call("DELETE", `/client/histories/pending/${other.id}`)).status).toBe(404);

    expectOk(await call("DELETE", `/client/${id}/histories/${history.id}`), "DELETE history");
    expect((await call("GET", `/client/${id}/histories/${history.id}`)).status).toBe(404);
  });

  it("rescisão, job de competência e projeção comercial", async () => {
    const state = requireSmokeState();
    const id = (
      expectOk(
        await call("POST", "/client", {
          name: `Smoke Rescisão ${Date.now()}`,
          status: "Ativo",
          cpf_cnpj: uniqueCnpj(),
        }),
        "POST /client",
      ).data as { id: string }
    ).id;
    // Tarefa aberta do integracao-service, que a rescisão paralisa.
    const project = await smokeInsert("integracao.projects", { client_id: id });
    const model = await smokeInsert("integracao.tasksModel", {
      department_id: state.departmentId,
      responsible_id: state.ownerId,
    });
    const task = await smokeInsert("integracao.tasks", {
      client_id: id,
      status: "A Realizar",
      department_id: state.departmentId,
      model_id: model.id,
      project_id: project.id,
      responsible_id: state.ownerId,
    });

    expectOk(
      await call("PATCH", `/client/${id}/termination`, {
        reason: "Encerramento",
        description: "Cliente encerrou as atividades",
        competence_output: "2026-01",
      }),
      "PATCH termination",
    );
    const after = expectOk(await call("GET", `/client/${id}`), "GET após rescisão").data;
    expect(after.status).toBe("Processo de Inativação");
    expect(after.competence_output).toMatch(/^2026-01-31/);

    const internal = {
      "content-type": "application/json",
      "x-internal-service-token": SMOKE_INTERNAL_TOKEN,
    };
    expectOk(
      await call("POST", "/internal/competence-output-update", {}, internal),
      "POST competence-output-update",
    );
    expect(expectOk(await call("GET", `/client/${id}`), "GET após job").data.status).toBe(
      "Inativo",
    );

    const event = {
      event_id: randomUUID(),
      event_type: "commercial.prospecting.transition",
      event_version: 1,
      organization_id: state.organizationId,
      client_id: id,
      prospecting_id: randomUUID(),
      from_status: "Envio de Proposta",
      to_status: "Fechado",
      status_date: new Date().toISOString(),
      description: "Fechou",
      audit_correlation_id: `smoke-${Date.now()}`,
      occurred_at: new Date().toISOString(),
    };
    const applied = expectOk(
      await call("POST", "/internal/commercial/prospecting-transition", event, internal),
      "POST prospecting-transition",
    ).data;
    expect(applied.applied).toBe(true);
    const duplicate = expectOk(
      await call("POST", "/internal/commercial/prospecting-transition", event, internal),
      "POST prospecting-transition duplicado",
    ).data;
    expect(duplicate.duplicate).toBe(true);
    expect(expectOk(await call("GET", `/client/${id}`), "GET após projeção").data).toMatchObject({
      status: "Ativo",
      prospecting_status: "Fechado",
      description_prospecting: "Fechou",
    });
    expect(task.id).toBeTruthy();
  });

  it("reporting interno: catálogo e extração", async () => {
    expectOk(
      await call(
        "GET",
        "/internal/reporting/catalog",
        undefined,
        await reportsHeaders({}, "catalog", []),
      ),
      "GET reporting/catalog",
    );
    const fields = [
      "client_id",
      "name",
      "company_name",
      "fantasy_name",
      "status",
      "type",
      "type_registration",
      "prospecting_status",
      "city",
      "state",
      "segment",
      "regime",
      "service_unique",
    ].filter((field) => field !== "client_id");
    const body = { source: "integracao.clients", fields, limit: 5 };
    const extracted = expectOk(
      await call(
        "POST",
        "/internal/reporting/extract",
        body,
        await reportsHeaders(body, "extract", fields),
      ),
      "POST reporting/extract",
    ).data;
    expect(Array.isArray(extracted.rows)).toBe(true);
  });
});
