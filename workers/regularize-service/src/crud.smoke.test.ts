// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa: campo fora do
// schema do Worker ("Unknown argument"), tabela sem @@map, coluna NOT NULL não preenchida.
import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  REGULARIZE_GUIDANCE_CHECKLIST_CODES,
  type RegularizeGuidanceChecklistCode,
} from "@workspace/shared";
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
import { createRegularizeWorkerApp, type RegularizeWorkerEnv } from "./app.js";
import {
  buildLicenseProtocolObjectPath,
  type WorkerLicenseProtocolStorageLike,
} from "./licenseProtocolStorage.js";

const REPORTING_TOKEN = "crud-smoke-reporting-token";
const REPORTING_SECRET = "crud-smoke-reporting-grant-secret";

// biome-ignore lint/suspicious/noExplicitAny: corpo JSON arbitrário da rota
type Json = any;

/** Desembrulha `{ data }` e envelopes `{ create | update | detail: {...} }`. */
function entity(json: Json): Json {
  const data = json?.data;
  if (data && typeof data === "object" && !Array.isArray(data) && !("id" in data)) {
    const inner = Object.values(data).find(
      (value) => value && typeof value === "object" && "id" in (value as object),
    );
    if (inner) return inner;
  }
  return data;
}

function listOf(json: Json): Json[] {
  const data = json?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  const inner = data && Object.values(data).find(Array.isArray);
  return (inner as Json[]) ?? [];
}

const day = (value: unknown) => new Date(String(value)).toISOString().slice(0, 10);

function checklist(branch: "Pendente" | "Concluído" = "Pendente") {
  return REGULARIZE_GUIDANCE_CHECKLIST_CODES.map((code: RegularizeGuidanceChecklistCode) => ({
    code,
    status: code === "branch" ? branch : "Pendente",
  }));
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

/** Grant assinado igual ao que o reporting-service emite. */
function reportingHeaders(input: {
  operation: "catalog" | "extract";
  source: string;
  fields: string[];
  body: unknown;
}): Record<string, string> {
  const state = requireSmokeState();
  const requestId = `smoke-${randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const grant = {
    version: 1,
    audience: "regularize-service",
    operation: input.operation,
    source: input.source,
    organization_id: state.organizationId,
    fields: input.fields,
    request_id: requestId,
    issued_at: now - 1,
    expires_at: now + 30,
    body_sha256: createHash("sha256").update(canonicalJson(input.body)).digest("hex"),
  };
  const grantValue = Buffer.from(canonicalJson(grant)).toString("base64url");
  return {
    "x-internal-service-token": REPORTING_TOKEN,
    "x-reports-grant": grantValue,
    "x-reports-grant-signature": createHmac("sha256", REPORTING_SECRET)
      .update(grantValue)
      .digest("hex"),
    "x-request-id": requestId,
    "content-type": "application/json",
  };
}

describe.skipIf(!smokeState)("regularize-service CRUD smoke (banco real)", () => {
  const objects = new Set<string>();
  // Storage fake: o foco é o caminho do banco, não o Supabase.
  const protocolStorage: WorkerLicenseProtocolStorageLike = {
    async upload(input) {
      const path = buildLicenseProtocolObjectPath({
        organizationId: input.organizationId,
        licenseId: input.licenseId,
        fileId: randomUUID(),
        mimetype: input.file.mimetype,
      });
      objects.add(path);
      return path;
    },
    async deleteObject(path) {
      objects.delete(path);
    },
    async createSignedAccessUrl(path) {
      return `https://storage.smoke.local/${path}`;
    },
  };
  const env = () =>
    smokeEnv<RegularizeWorkerEnv>({
      MTK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      REGULARIZE_REPORTING_TOKEN: REPORTING_TOKEN,
      REGULARIZE_REPORTING_GRANT_SECRET: REPORTING_SECRET,
    });
  // onError do Worker esconde a mensagem do 5xx; aqui ela volta no corpo para o relatório.
  const app = () => {
    const worker = createRegularizeWorkerApp({ env: env(), protocolStorage });
    worker.onError((error, c) => {
      const { statusCode, body } = serializeError(error, { fallbackMessage: "erro interno" });
      const cause = (error as { cause?: unknown }).cause ?? error;
      const debug = statusCode >= 500 ? { debug: String((cause as Error)?.message ?? cause) } : {};
      return c.json({ ...debug, ...body }, statusCode as ContentfulStatusCode);
    });
    return worker;
  };
  const call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    smokeCall(app(), env(), method, path, body, headers);

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const cnpj = suffix.padStart(14, "9").slice(-14);
  const year = new Date().getUTCFullYear();
  let clientId = "";
  let taskId = "";
  let clientPfId = "";
  let clientPfCpf = "";
  let processId = "";

  beforeAll(async () => {
    const state = requireSmokeState();
    // Cliente PJ e tarefa pertencem a client-service/integracao-service.
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Regularize ${suffix}`,
      cpf_cnpj: cnpj,
      status: "Ativo",
      prospecting_status: "Cliente",
    });
    clientId = String(client.id);
    const model = await smokeInsert("integracao.tasksModel", {
      id: randomUUID(),
      department_id: state.departmentId,
      responsible_id: state.ownerId,
    });
    const project = await smokeInsert("integracao.projects", {
      id: randomUUID(),
      client_id: clientId,
    });
    const task = await smokeInsert("integracao.tasks", {
      id: randomUUID(),
      model_id: model.id,
      project_id: project.id,
      client_id: clientId,
      department_id: state.departmentId,
      responsible_id: state.ownerId,
    });
    taskId = String(task.id);
  });

  it("health, ready e dashboard", async () => {
    expectOk(await call("GET", "/health"), "GET /health");
    expectOk(await call("GET", "/ready"), "GET /ready");
    expectOk(await call("GET", `/regularize/dashboard?year=${year}`), "GET /regularize/dashboard");
  });

  it("cliente PF: cria, lê, lista e atualiza (RegularizeClientPfForm)", async () => {
    clientPfCpf = suffix.padStart(11, "8").slice(-11);
    const payload = {
      code: `PF-${suffix}`,
      name: "Smoke Pessoa Física",
      sex: "Masculino",
      address: "Rua do Smoke, 1",
      city: "Belém",
      zip_code: "66000-000",
      state: "PA",
      profession: "Contador",
      father: "Pai Smoke",
      mother: "Mãe Smoke",
      marital_status: "Solteiro",
      date_of_birth: "1990-05-10",
      cpf: clientPfCpf,
      rg: `RG${suffix}`,
      rg_expedition: "2010-01-15",
      rg_validity: "2030-01-15",
      military_certificate: "RES-1",
      ctps: "CTPS-1",
      cnh: `CNH${suffix}`,
      cnh_expedition: "2015-02-01",
      cnh_validity: "2035-02-01",
      spouse: "",
      notes: "criado pelo smoke",
      status: "Ativo",
    };
    const created = entity(expectOk(await call("POST", "/regularize/pf", payload), "POST pf"));
    clientPfId = created.id;
    expect(clientPfId).toBeTruthy();
    expectOk(await call("GET", `/regularize/pf?id=${clientPfId}`), "GET pf");
    // Sem sócio ativo a reconciliação marca a PF como "Inativo" logo após criar (regra de domínio).
    const list = expectOk(
      await call("GET", `/regularize/pfs?status=Todos&search=${clientPfCpf}&page=1&limit=20`),
      "GET pfs",
    );
    expect(listOf(list).some((item) => item.id === clientPfId)).toBe(true);
    expectOk(await call("GET", "/regularize/pfs?status=Ativo"), "GET pfs Ativo");

    const update = {
      ...payload,
      id: clientPfId,
      name: "Smoke PF Renomeado",
      city: "Ananindeua",
      profession: "Advogado",
      marital_status: "Casado",
      spouse: "Cônjuge Smoke",
      notes: "atualizado pelo smoke",
      cnh_validity: "2036-03-03",
    };
    expectOk(await call("PUT", "/regularize/pf", update), "PUT pf");
    const after = entity(expectOk(await call("GET", `/regularize/pf?id=${clientPfId}`), "GET pf"));
    expect(after).toMatchObject({
      name: update.name,
      city: update.city,
      profession: update.profession,
      marital_status: update.marital_status,
      spouse: update.spouse,
      notes: update.notes,
    });
    expect(day(after.cnh_validity)).toBe("2036-03-03");
  });

  it("sócios PF↔PJ: cria, lê, lista, atualiza e remove", async () => {
    const payload = { pj_id: clientId, pf_id: clientPfId, part: 50, entry: "2024-01-01" };
    const created = entity(
      expectOk(await call("POST", "/regularize/partners", payload), "POST partners"),
    );
    const id = created.id as string;
    expectOk(await call("GET", `/regularize/partner?id=${id}`), "GET partner");
    const byPj = expectOk(
      await call("GET", `/regularize/partners?type=pj&client_id=${clientId}`),
      "GET partners pj",
    );
    expect(listOf(byPj).some((item) => item.id === id)).toBe(true);
    expectOk(
      await call("GET", `/regularize/partners?type=pf&client_id=${clientPfId}`),
      "GET partners pf",
    );
    expectOk(
      await call("PUT", "/regularize/partners", {
        ...payload,
        id,
        part: 75.5,
        exit: "2025-12-31",
      }),
      "PUT partners",
    );
    const after = entity(expectOk(await call("GET", `/regularize/partner?id=${id}`), "GET"));
    expect(Number(after.part)).toBe(75.5);
    expect(day(after.exit)).toBe("2025-12-31");
    expectOk(await call("DELETE", `/regularize/partners/${id}`), "DELETE partners/:id");
    expect((await call("GET", `/regularize/partner?id=${id}`)).status).toBe(404);
  });

  it("sites e senhas: cria, lista, revela, atualiza e desativa", async () => {
    const site = {
      name: `Portal Smoke ${suffix}`,
      sphere: "Municipal",
      link: "https://portal.smoke.local/login",
      user: "smoke.user",
      password: "Site#123",
    };
    const createdSite = entity(
      expectOk(await call("POST", "/regularize/sites-pass", site), "POST sites-pass"),
    );
    const siteId = createdSite.id as string;
    const sites = expectOk(
      await call(
        "GET",
        `/regularize/sites-pass?status=true&search=${encodeURIComponent(site.name)}&page=1&limit=20`,
      ),
      "GET sites-pass",
    );
    expect(listOf(sites).some((item) => item.id === siteId)).toBe(true);
    expectOk(await call("GET", "/regularize/sites-pass?status=false"), "GET sites-pass inativos");
    const revealed = entity(
      expectOk(await call("GET", `/regularize/sites-pass-detail?id=${siteId}`), "GET site detail"),
    );
    expect(revealed.password).toBe(site.password);

    const password = {
      client_id: clientId,
      site_id: siteId,
      login: "cliente.login",
      password: "Cli#123",
      notes: "senha do smoke",
    };
    const createdPassword = entity(
      expectOk(await call("POST", "/regularize/passwords", password), "POST passwords"),
    );
    const passwordId = createdPassword.id as string;
    const passwords = expectOk(
      await call("GET", `/regularize/passwords?client_id=${clientId}`),
      "GET passwords",
    );
    expect(listOf(passwords).some((item) => item.id === passwordId)).toBe(true);
    expectOk(
      await call("PUT", "/regularize/passwords", {
        ...password,
        id: passwordId,
        login: "cliente.novo",
        password: "Novo#456",
        notes: "senha trocada",
      }),
      "PUT passwords",
    );
    const passwordAfter = entity(
      expectOk(await call("GET", `/regularize/password?id=${passwordId}`), "GET password"),
    );
    expect(passwordAfter).toMatchObject({
      login: "cliente.novo",
      password: "Novo#456",
      notes: "senha trocada",
    });

    expectOk(
      await call("PUT", "/regularize/sites-pass", {
        ...site,
        id: siteId,
        name: `${site.name} v2`,
        sphere: "Estadual",
        user: "smoke.user2",
        password: "Site#456",
        status: false,
      }),
      "PUT sites-pass",
    );
    const siteAfter = entity(
      expectOk(await call("GET", `/regularize/sites-pass-detail?id=${siteId}`), "GET site"),
    );
    expect(siteAfter).toMatchObject({
      name: `${site.name} v2`,
      sphere: "Estadual",
      user: "smoke.user2",
      password: "Site#456",
      status: false,
    });
  });

  it("tributos municipais: cria, lê, lista com filtros e atualiza", async () => {
    const payload = {
      client_id: clientId,
      year,
      tff_is_applicable: true,
      tff_amount: 150.25,
      tff_notes: "TFF smoke",
      tff_analysis_is_done: false,
      tff_analysis_notes: null,
      tff_sent_date: `${year}-02-01`,
      tff_due_date: `${year}-03-01`,
      tlp_is_applicable: true,
      tlp_amount: 80,
      tlp_notes: null,
      tlp_is_sent: "Não",
      tlp_due_date: `${year}-04-01`,
      tlp_not_email: false,
      tll_is_applicable: false,
      tll_amount: 0,
      tll_notes: null,
      tll_is_sent: "Não",
      tll_analysis_is_done: false,
      tll_analysis_notes: null,
    };
    const created = entity(
      expectOk(await call("POST", "/regularize/municipal-taxes", payload), "POST municipal-taxes"),
    );
    const id = created.id as string;
    expectOk(await call("GET", `/regularize/municipal-taxes-detail?id=${id}`), "GET detail");
    for (const query of [
      `year=${year}`,
      `year=${year}&status=Criado&type=TFF&search=${cnpj}&page=1&limit=20`,
      `year=${year}&status=Pendente&type=TLP`,
      `year=${year}&type=TLL`,
    ]) {
      expectOk(await call("GET", `/regularize/municipal-taxes?${query}`), `GET ?${query}`);
    }
    const update = {
      ...payload,
      id,
      tff_amount: 199.9,
      tff_analysis_is_done: true,
      tff_analysis_notes: "analisado",
      tlp_is_sent: "Sim",
      tlp_sent_date: `${year}-04-10`,
      tlp_not_email: true,
      tll_is_applicable: true,
      tll_amount: 45.5,
      tll_notes: "TLL smoke",
      tll_is_sent: "Sim",
      tll_sent_date: `${year}-05-01`,
      tll_due_date: `${year}-06-01`,
      tll_analysis_is_done: true,
      tll_analysis_notes: "ok",
    };
    expectOk(await call("PUT", "/regularize/municipal-taxes", update), "PUT municipal-taxes");
    const after = entity(
      expectOk(await call("GET", `/regularize/municipal-taxes-detail?id=${id}`), "GET"),
    );
    expect(Number(after.tff_amount)).toBe(199.9);
    expect(Number(after.tll_amount)).toBe(45.5);
    expect(after).toMatchObject({
      tff_analysis_is_done: true,
      tff_analysis_notes: "analisado",
      tlp_is_sent: "Sim",
      tlp_not_email: true,
      tll_is_applicable: true,
      tll_notes: "TLL smoke",
      tll_analysis_notes: "ok",
    });
    expect(day(after.tll_due_date)).toBe(`${year}-06-01`);
  });

  it("processos: cria (PJ e PF), lê, lista, atualiza e envia/retorna do fiscal", async () => {
    const state = requireSmokeState();
    // RegularizeProcessForm.
    const payload = {
      client_pj_id: clientId,
      cpf_cnpj: cnpj,
      process_type: "Alteração Contratual",
      description: "Processo do smoke",
      entry_date: `${year}-01-10`,
      expected_date: `${year}-02-10`,
      client_notice_date: `${year}-01-12`,
      status: "Pendente",
      financial_status: "Pendente",
      observation: "obs",
      responsible1_id: state.ownerId,
      responsible2_id: state.userId,
      locking_type: null,
      urgency: "Alta",
      task_id: taskId,
    };
    const created = entity(
      expectOk(await call("POST", "/regularize/process", payload), "POST process"),
    );
    processId = created.id;
    expect(processId).toBeTruthy();
    expectOk(
      await call("POST", "/regularize/process", {
        client_pf_id: clientPfId,
        cpf_cnpj: clientPfCpf,
        process_type: "Inscrição",
        description: "Processo PF do smoke",
        status: "Andamento",
      }),
      "POST process PF",
    );
    expectOk(await call("GET", `/regularize/process?id=${processId}`), "GET process");
    for (const query of [
      "status=Todos",
      `status=Pendente&search=${cnpj}&page=1&limit=20`,
      "status=Em%20andamento&limit=100",
    ]) {
      expectOk(await call("GET", `/regularize/processes?${query}`), `GET processes?${query}`);
    }
    const update = {
      ...payload,
      id: processId,
      description: "Processo atualizado",
      status: "Protocolado",
      financial_status: "Regular",
      observation: "obs 2",
      completion_date: `${year}-03-01`,
      client_notice_date: null,
      responsible3_id: state.ownerId,
      urgency: "Baixa",
    };
    expectOk(await call("PUT", "/regularize/process", update), "PUT process");
    const after = entity(
      expectOk(await call("GET", `/regularize/process?id=${processId}`), "GET process"),
    );
    expect(after).toMatchObject({
      description: "Processo atualizado",
      status: "Protocolado",
      financial_status: "Regular",
      observation: "obs 2",
      responsible3_id: state.ownerId,
      urgency: "Baixa",
      client_notice_date: null,
    });
    expect(day(after.completion_date)).toBe(`${year}-03-01`);
    expectOk(
      await call("POST", "/regularize/process/send-to-fiscal", { id: processId }),
      "send-to-fiscal",
    );
    expectOk(
      await call("POST", "/regularize/process/return-from-fiscal", { id: processId }),
      "return-from-fiscal",
    );
  });

  it("orientações: cria, lê, lista, atualiza, atividades e sócios", async () => {
    expectOk(
      await call("POST", "/regularize/guidance", {
        target_type: "SEM_CLIENTE",
        target_snapshot: { version: 1, source: "manual", name: "Prospect Smoke", city: "Belém" },
        checklist: checklist(),
        status: "Em andamento",
      }),
      "POST guidance SEM_CLIENTE",
    );
    const created = entity(
      expectOk(
        await call("POST", "/regularize/guidance", {
          process_id: processId,
          target_type: "PJ",
          client_pj_id: clientId,
          client_pf_id: null,
          checklist: checklist(),
          branch_data: null,
          type: "Abertura",
          request: "Abrir empresa",
          framework_obs: "ME",
          legal_nature: "LTDA",
          company_name: "Smoke LTDA",
          trade_name: "Smoke",
          cpf_cnpj: cnpj,
          share_capital: 10000,
          iptu: "123",
          address: "Rua A",
          comporate_purpose: "Serviços",
          carryng: "ME",
          regime: "Simples Nacional",
          legal_representative: "Fulano",
          status: "Em andamento",
          economic_activities: [
            { code: "6920-6/01", description: "Contabilidade", type: "Principal" },
          ],
          partners: [{ name: "Sócio A", cpf: "11122233344", percentage: 60, role: "Admin" }],
        }),
        "POST guidance",
      ),
    );
    const id = created.id as string;
    expectOk(await call("GET", `/regularize/guidance/detail?id=${id}`), "GET guidance detail");
    const byProcess = expectOk(
      await call("GET", `/regularize/guidance/list?process_id=${processId}`),
      "GET guidance/list",
    );
    expect(listOf(byProcess).some((item) => item.id === id)).toBe(true);
    expectOk(await call("GET", "/regularize/guidance/list?target_type=SEM_CLIENTE"), "list SEM");
    expectOk(await call("GET", "/regularize/guidance/list?process_id="), "list process vazio");

    expectOk(
      await call("PUT", "/regularize/guidance", {
        id,
        checklist: checklist("Concluído"),
        branch_data: { name: "Filial 1", address: "Rua B", city: "Marabá", state: "PA" },
        trade_name: "Smoke Atualizada",
        share_capital: 25000,
        regime: "Lucro Presumido",
      }),
      "PUT guidance",
    );
    let after = entity(expectOk(await call("GET", `/regularize/guidance/detail?id=${id}`), "GET"));
    expect(after.trade_name).toBe("Smoke Atualizada");
    expect(Number(after.share_capital)).toBe(25000);
    expect(after.regime).toBe("Lucro Presumido");
    expect(JSON.stringify(after)).toContain("Marabá");

    expectOk(
      await call("POST", "/regularize/guidance/activity/add", {
        guidance_id: id,
        activity: { code: "8219-9/99", description: "Apoio administrativo", type: "Secundária" },
      }),
      "activity/add",
    );
    after = entity(expectOk(await call("GET", `/regularize/guidance/detail?id=${id}`), "GET"));
    const activity = after.economic_activities.find((item: Json) => item.code === "8219-9/99");
    expect(activity?.id).toBeTruthy();
    expectOk(
      await call("PUT", "/regularize/guidance/activity", {
        guidance_id: id,
        activity: { ...activity, description: "Apoio administrativo 2" },
      }),
      "PUT activity",
    );
    after = entity(expectOk(await call("GET", `/regularize/guidance/detail?id=${id}`), "GET"));
    expect(JSON.stringify(after.economic_activities)).toContain("Apoio administrativo 2");
    expectOk(
      await call("POST", "/regularize/guidance/activity/remove", {
        guidance_id: id,
        item_id: activity.id,
      }),
      "activity/remove",
    );

    expectOk(
      await call("POST", "/regularize/guidance/partner/add", {
        guidance_id: id,
        partner: { name: "Sócio B", cpf: "55566677788", percentage: 40, profession: "Dev" },
      }),
      "partner/add",
    );
    after = entity(expectOk(await call("GET", `/regularize/guidance/detail?id=${id}`), "GET"));
    const partner = after.partners.find((item: Json) => item.cpf === "55566677788");
    expect(partner?.id).toBeTruthy();
    expectOk(
      await call("PUT", "/regularize/guidance/partner", {
        guidance_id: id,
        partner: { ...partner, name: "Sócio B2", percentage: 30 },
      }),
      "PUT partner",
    );
    after = entity(expectOk(await call("GET", `/regularize/guidance/detail?id=${id}`), "GET"));
    expect(JSON.stringify(after.partners)).toContain("Sócio B2");
    expectOk(
      await call("POST", "/regularize/guidance/partner/remove", {
        guidance_id: id,
        item_id: partner.id,
      }),
      "partner/remove",
    );
    expectOk(await call("PUT", "/regularize/guidance", { id, status: "Finalizado" }), "finalizar");
    after = entity(expectOk(await call("GET", `/regularize/guidance/detail?id=${id}`), "GET"));
    expect(after.status).toBe("Finalizado");
  });

  it("alvarás: cria, lê, lista com filtros, atualiza e protocolo", async () => {
    const state = requireSmokeState();
    const dueDate = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    // RegularizeLicenseForm.
    const payload = {
      client_id: clientId,
      has: true,
      type_license: "Alvará de Funcionamento",
      entry_date: `${year}-01-05`,
      protocol: `PROT-${suffix}`,
      responsible_id: state.ownerId,
      status: "Em Processo de Solicitação",
      date_last_consultation: `${year}-01-20`,
      current_situation: "Aguardando prefeitura",
      contact: "prefeitura@smoke.local",
      observation: "obs",
      urgency: "Média",
      type: "Municipal",
      due_date: dueDate,
      task_id: taskId,
    };
    const created = entity(
      expectOk(await call("POST", "/regularize/license", payload), "POST license"),
    );
    const id = created.id as string;
    expectOk(await call("GET", `/regularize/license?id=${id}`), "GET license");
    for (const query of [
      "status=Todos",
      "status=Todos&page=1&limit=20",
      "status=A%20vencer",
      "status=Vencido",
      "status=Em%20Andamento&page=1&limit=10",
    ]) {
      expectOk(await call("GET", `/regularize/licenses?${query}`), `GET licenses?${query}`);
    }
    const update = {
      ...payload,
      id,
      has: false,
      status: "Em Andamento",
      current_situation: "Em análise",
      observation: null,
      urgency: "Alta",
      due_date: `${year + 1}-12-31`,
    };
    expectOk(await call("PUT", "/regularize/license", update), "PUT license");
    const after = entity(expectOk(await call("GET", `/regularize/license?id=${id}`), "GET"));
    expect(after).toMatchObject({
      has: false,
      status: "Em Andamento",
      current_situation: "Em análise",
      observation: null,
      urgency: "Alta",
    });
    expect(day(after.due_date)).toBe(`${year + 1}-12-31`);

    const form = new FormData();
    form.append(
      "file",
      new File([new TextEncoder().encode("%PDF-1.4 smoke")], "protocolo.pdf", {
        type: "application/pdf",
      }),
    );
    const headers = await smokeHeaders();
    delete headers["content-type"];
    const upload = await app().request(
      `https://smoke.test/regularize/license/${id}/protocol`,
      { method: "POST", headers, body: form },
      env(),
    );
    expect(upload.status, await upload.clone().text()).toBe(201);
    const access = expectOk(await call("GET", `/regularize/license/${id}/protocol`), "GET proto");
    expect(JSON.stringify(access)).toContain("storage.smoke.local");
    const withFile = entity(expectOk(await call("GET", `/regularize/license?id=${id}`), "GET"));
    expect(withFile.protocol_file?.original_name).toBe("protocolo.pdf");
  });

  it("reconciliações internas", async () => {
    const headers = { "x-internal-service-token": SMOKE_INTERNAL_TOKEN };
    for (const path of [
      "/internal/reconciliation/run",
      "/internal/reconciliation/license-notifications/run",
      "/internal/reconciliation/client-pf-status/run",
      "/internal/reconciliation/client-pf-documents/run",
    ]) {
      expectOk(await call("POST", path, undefined, headers), `POST ${path}`);
    }
  });

  it("reporting interno: catálogo e extração de todos os campos de cada fonte", async () => {
    const catalog = expectOk(
      await call(
        "GET",
        "/internal/reporting/catalog",
        undefined,
        reportingHeaders({
          operation: "catalog",
          source: "regularize.catalog",
          fields: [],
          body: {},
        }),
      ),
      "GET catalog",
    );
    const sources = catalog.data.sources as { key: string; fields: { key: string }[] }[];
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      // Só `fields` é publicado para extração; `keys` são chaves de relação.
      const fields = source.fields.map((field) => field.key).slice(0, 25);
      const body = { source: source.key, fields, limit: 101 };
      const headers = reportingHeaders({
        operation: "extract",
        source: source.key,
        fields,
        body,
      });
      expectOk(
        await call("POST", "/internal/reporting/extract", body, headers),
        `extract ${source.key}`,
      );
    }
  });
});
