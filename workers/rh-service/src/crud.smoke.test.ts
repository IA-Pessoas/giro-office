// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa: campo fora do
// schema do Worker ("Unknown argument"), tabela "rh.xxx" sem @@map, coluna NOT NULL vazia.
import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  getRhReportingFields,
  RH_REPORTING_SOURCES,
} from "@workspace/rh-service/src/reporting/rhReportingCatalog.js";
import { describe, expect, it } from "vitest";
import {
  requireSmokeState,
  SMOKE_INTERNAL_TOKEN,
  type SmokeResponse,
  smokeCall,
  smokeEnv,
  smokeHeaders,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createRhWorkerApp, type RhWorkerEnv } from "./app.js";

const REPORTS_TOKEN = "crud-smoke-reports-token";
const REPORTS_SECRET = "crud-smoke-reports-secret";

describe.skipIf(!smokeState)("rh-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<RhWorkerEnv>({
      POINT_MIN_INTERVAL_MINUTES: "0",
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: REPORTS_SECRET,
    });
  const app = () => {
    const instance = createRhWorkerApp({ env: env() });
    // O onError do Worker esconde a mensagem; aqui ela volta no corpo para o relatório.
    instance.onError((error, c) => {
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      const cause = (error as { cause?: unknown }).cause;
      return c.json(
        { error: error.message, cause: cause instanceof Error ? cause.message : cause },
        status as 500,
      );
    });
    return instance;
  };

  type Step = (
    method: string,
    path: string,
    body?: unknown,
    options?: { as?: string; allowed?: number[]; headers?: Record<string, string> },
  ) => Promise<SmokeResponse["json"]>;

  function session() {
    const failures: string[] = [];
    const step: Step = async (method, path, body, options = {}) => {
      const headers =
        options.headers ??
        (options.as
          ? await smokeHeaders({
              userId: options.as,
              type: "user",
              permission: 1,
              modules: { rh: 1 },
            })
          : undefined);
      const result = await smokeCall(app(), env(), method, path, body, headers);
      const allowed = options.allowed ?? [200, 201];
      if (!allowed.includes(result.status)) {
        failures.push(`${method} ${path}: HTTP ${result.status} ${result.text.slice(0, 1500)}`);
        return undefined;
      }
      return result.json;
    };
    /** Falha quando um id necessário aos passos seguintes não veio (nada pula em silêncio). */
    const need = <T>(label: string, value: T): T => {
      if (!value) failures.push(`${label}: resposta sem id`);
      return value;
    };
    return { failures, step, need };
  }

  /** Colaborador novo (users + permissions), como o user-service deixaria no banco. */
  async function collaborator(rh = 1) {
    const state = requireSmokeState();
    const id = randomUUID();
    await smokeInsert("users", {
      id,
      name: `Smoke RH ${id.slice(0, 6)}`,
      login: `smoke-rh-${id}@smoke.local`,
      password: "x",
      permission: 1,
      status: "active",
      type: "user",
      department_id: state.departmentId,
    });
    await smokeInsert("permissions", { id: randomUUID(), user_id: id, rh });
    return id;
  }

  const day = (offset: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const at = (date: string, time: string) => `${date}T${time}:00.000Z`;

  it("categorias, perguntas de score, feriados e notificações", async () => {
    const { failures, step, need } = session();
    const suffix = randomUUID().slice(0, 8);

    const category = await step("POST", "/rh/categories", {
      name: `Smoke ${suffix}`,
      active: true,
    });
    await step("GET", "/rh/categories?activeOnly=true");
    await step("GET", "/rh/categories");
    if (need("POST /rh/categories", category?.data?.id)) {
      await step("PUT", "/rh/categories", {
        id: category.data.id,
        name: `Smoke ${suffix} editada`,
        active: false,
      });
      await step("DELETE", "/rh/categories", { id: category.data.id });
    }

    for (const type of ["behavioral", "technical", "tech", "leadership"]) {
      const question = await step("POST", "/rh/score/questions", {
        question: `Pergunta ${type} ${suffix}?`,
        type,
      });
      if (!need(`POST /rh/score/questions ${type}`, question?.data?.id)) continue;
      await step("PUT", "/rh/score/questions", {
        id: question.data.id,
        question: `Pergunta ${type} ${suffix} editada?`,
        type,
        active: true,
      });
    }
    await step("GET", "/rh/score/questions?type=behavioral&all=true");
    await step("GET", "/rh/score/questions?type=Todos");
    const extra = await step("POST", "/rh/score/questions", {
      question: `Descartável ${suffix}?`,
      type: "tech",
    });
    if (extra?.data?.id) await step("DELETE", "/rh/score/questions", { id: extra.data.id });

    // Data única por execução: feriado duplicado na mesma data é 409 legítimo.
    const holidayDate = new Date(Date.UTC(2100 + (Date.now() % 500), 0, 1)).toISOString();
    const holiday = await step("POST", "/rh/holidays", {
      name: `Feriado ${suffix}`,
      date: holidayDate,
    });
    await step("GET", "/rh/holidays");
    if (need("POST /rh/holidays", holiday?.data?.id)) {
      await step("PUT", "/rh/holidays", {
        id: holiday.data.id,
        name: `Feriado ${suffix} editado`,
        date: holidayDate,
      });
      await step("DELETE", "/rh/holidays", { id: holiday.data.id });
    }

    await step("GET", "/rh/notifications");
    await step("PUT", "/rh/notifications/read", { all: true });
    await step("PUT", "/rh/notifications/read", { id: randomUUID() });

    expect(failures).toEqual([]);
  });

  it("solicitações, mensagens, leitura e notificações de uma solicitação", async () => {
    const { failures, step, need } = session();
    const requester = await collaborator();
    const analyst = await collaborator(1); // responsável RH elegível (rh >= 1)
    const suffix = randomUUID().slice(0, 8);
    const category = await step("POST", "/rh/categories", { name: `Req ${suffix}` });
    const categoryId = category?.data?.id as string | undefined;
    expect(categoryId, failures.join("\n")).toBeTruthy();

    // Colaborador abre (RhNewRequestDialog) e o owner abre já atribuindo.
    const mine = await step(
      "POST",
      "/rh/requests",
      {
        title: "Férias",
        description: "Quero tirar férias",
        category_id: categoryId,
        urgency: "Medium",
      },
      { as: requester },
    );
    const assigned = await step("POST", "/rh/requests", {
      title: "Atestado",
      description: "Envio de atestado",
      category_id: categoryId,
      urgency: "High",
      assigned_to_user_id: analyst,
    });
    const requestId = (mine?.data?.id ?? assigned?.data?.id) as string | undefined;

    await step("GET", "/rh/requests?page=1&limit=20");
    await step(
      "GET",
      `/rh/requests?page=1&limit=20&status=New&category_id=${categoryId}&requester_user_id=${requester}&assigned_to_user_id=${analyst}`,
    );
    await step("GET", "/rh/requests?page=1&limit=20", undefined, { as: requester });
    need("POST /rh/requests (colaborador)", mine?.data?.id);
    need("POST /rh/requests (atribuída)", assigned?.data?.id);
    if (requestId) {
      await step("GET", `/rh/requests/${requestId}`);
      await step("GET", `/rh/requests/${requestId}`, undefined, { as: requester });
      await step(
        "POST",
        "/rh/messages",
        { request_id: requestId, message: "Olá RH", type: "Message" },
        { as: requester },
      );
      await step("GET", `/rh/messages?requestId=${requestId}`);
      await step("GET", `/rh/messages?requestId=${requestId}`, undefined, { as: requester });
      await step("GET", "/rh/notifications", undefined, { as: requester });
      await step("PUT", "/rh/notifications/read", { request_id: requestId }, { as: requester });
      await step("PUT", "/rh/requests", {
        id: requestId,
        title: "Férias (editado)",
        description: "Descrição editada",
        category_id: categoryId,
        assigned_to_user_id: analyst,
        urgency: "Low",
        status: "In_Progress",
      });
      // "Solution" leva a solicitação de In_Progress para Resolved.
      await step("POST", "/rh/messages", {
        request_id: requestId,
        message: "Resolvido",
        type: "Solution",
      });
      await step("GET", `/rh/requests/${requestId}`);
      await step("PUT", "/rh/requests", { id: requestId, status: "Closed" });
      await step("DELETE", "/rh/requests", { id: requestId });
    }
    if (assigned?.data?.id) await step("DELETE", "/rh/requests", { id: assigned.data.id });
    if (categoryId) await step("DELETE", "/rh/categories", { id: categoryId });

    expect(failures).toEqual([]);
  });

  it("configuração de ponto, batidas, ajustes, banco de horas e folhas", async () => {
    const { failures, step, need } = session();
    const worker = await collaborator();
    const month = day(0).slice(0, 7);

    const config = {
      target_user_id: worker,
      start_time: "08:00",
      lunch_break: "12:00",
      lunch_return: "13:00",
      end_time: "17:00",
      work_days: "1,2,3,4,5",
    };
    await step("PUT", "/rh/point-config", config);
    await step("PUT", "/rh/point-config", { ...config, end_time: "18:00" });
    await step("GET", `/rh/point-config/${worker}`);
    await step("GET", "/rh/point-config", undefined, { as: worker });

    // Batidas do dia (entrada, almoço, volta, saída) pelo próprio colaborador.
    let pointId: string | undefined;
    for (let index = 0; index < 4; index += 1) {
      const point = await step("POST", "/rh/point/register", {}, { as: worker });
      pointId ??= point?.data?.id ?? point?.data?.point?.id;
    }
    need("POST /rh/point/register", pointId);
    await step("GET", "/rh/point/me/today", undefined, { as: worker });
    await step("GET", `/rh/point?user_id=${worker}&date_from=${day(-40)}&date_to=${day(1)}`);
    await step("GET", `/rh/point?date_from=${day(-40)}&date_to=${day(1)}`, undefined, {
      as: worker,
    });
    await step("GET", `/rh/point/summary?month=${month}&user_id=${worker}`);
    await step("GET", `/rh/point/summary?month=${month}`, undefined, { as: worker });
    if (pointId) await step("POST", `/rh/point/${pointId}/calculate`, {});
    await step("POST", "/rh/point/recalculate", {
      target_user_id: worker,
      date_from: day(-7),
      date_to: day(0),
    });

    // Ajustes: pedido do colaborador para dias passados, aprovação, rejeição e lote.
    const adjustment = async (offset: number) => {
      const date = day(offset);
      const created = await step(
        "POST",
        "/rh/point/adjustment/request",
        {
          date,
          clock_in: at(date, "11:00"),
          lunch_out: at(date, "15:00"),
          lunch_in: at(date, "16:00"),
          clock_out: at(date, "20:00"),
          justification: "Esqueci de bater o ponto",
        },
        { as: worker },
      );
      return created?.data?.id as string | undefined;
    };
    const toApprove = await adjustment(-3);
    const toReject = await adjustment(-4);
    const bulk = [await adjustment(-5), await adjustment(-6)].filter(Boolean) as string[];
    need("POST /rh/point/adjustment/request", toApprove && toReject && bulk.length === 2);
    if (pointId) {
      const date = day(0);
      await step(
        "POST",
        "/rh/point/adjustment/request",
        {
          point_id: pointId,
          clock_in: at(date, "11:00"),
          lunch_out: at(date, "15:00"),
          lunch_in: at(date, "16:00"),
          clock_out: at(date, "20:00"),
          justification: "Corrigir batidas de hoje",
        },
        { as: worker },
      );
    }
    await step("GET", `/rh/point/adjustment/requests?status=Pendente&user_id=${worker}`);
    await step("GET", "/rh/point/adjustment/requests", undefined, { as: worker });
    if (toApprove) {
      await step("PUT", "/rh/point/adjustment/approve", {
        request_id: toApprove,
        obs_approver: "Ok",
      });
    }
    if (toReject) {
      await step("PUT", "/rh/point/adjustment/reject", {
        request_id: toReject,
        obs_approver: "Sem prova",
      });
    }
    if (bulk.length > 0) {
      await step("PUT", "/rh/point/adjustment/approve-bulk", {
        request_ids: bulk,
        obs_approver: null,
      });
    }
    const retroDate = day(-8);
    await step("POST", "/rh/point/adjustment/retroactive", {
      target_user_id: worker,
      date: retroDate,
      clock_in: at(retroDate, "11:00"),
      lunch_out: at(retroDate, "15:00"),
      lunch_in: at(retroDate, "16:00"),
      clock_out: at(retroDate, "20:00"),
      justification: "Lançamento retroativo do RH",
    });
    await step("GET", `/rh/point/adjustment/requests?status=Aprovado&user_id=${worker}`);

    // Banco de horas.
    const release = await step("POST", "/rh/time-bank-releases", {
      user_id: worker,
      date: day(-2),
      minutes: 90,
      reason: "Hora extra",
    });
    await step(
      "GET",
      `/rh/time-bank-releases/list?user_id=${worker}&is_approved=false&date_from=${day(-10)}&date_to=${day(0)}`,
    );
    await step("GET", "/rh/time-bank-releases/list", undefined, { as: worker });
    if (need("POST /rh/time-bank-releases", release?.data?.id)) {
      await step("PUT", "/rh/time-bank-releases/approve", { id: release.data.id });
    }
    await step("GET", `/rh/time-bank/summary/${worker}`);
    await step("GET", "/rh/time-bank/summary", undefined, { as: worker });
    await step("GET", "/rh/time-bank/overview");

    // Folha de ponto: gera, detalha, PDF, assina, reabre e reconstrói.
    const sheet = await step("POST", "/rh/timesheets", {
      user_id: worker,
      start_time: at(day(-10), "00:00"),
      end_time: at(day(-1), "23:59"),
    });
    const sheetId = need("POST /rh/timesheets", sheet?.data?.id as string | undefined);
    await step("GET", `/rh/timesheets?target_user_id=${worker}`);
    await step("GET", "/rh/timesheets", undefined, { as: worker });
    if (sheetId) {
      await step("GET", `/rh/timesheets/${sheetId}`);
      const pdf = await smokeCall(app(), env(), "GET", `/rh/timesheets/${sheetId}/pdf`);
      if (pdf.status !== 200)
        failures.push(`GET pdf: HTTP ${pdf.status} ${pdf.text.slice(0, 800)}`);
      await step(
        "PUT",
        "/rh/timesheets/sign",
        { id: sheetId, signature: "Assinatura Smoke" },
        { as: worker },
      );
      await step("PUT", "/rh/timesheets/reopen", { id: sheetId, reason: "Correção de batida" });
      await step("PUT", "/rh/timesheets/rebuild", { id: sheetId });
    }
    await step("POST", "/rh/timesheets", { user_id: worker });

    expect(failures).toEqual([]);
  });

  it("score trimestral, avaliações e Nitro", async () => {
    const { failures, step, need } = session();
    const suffix = randomUUID().slice(0, 8);
    for (const type of ["behavioral", "technical", "tech", "leadership"]) {
      await step("POST", "/rh/score/questions", { question: `Score ${type} ${suffix}?`, type });
    }
    const target = await collaborator(1);
    await collaborator(0); // subordinado do líder no mesmo departamento

    const score = await step("POST", "/rh/score/quarters/generate", {
      target_user_id: target,
      quarter: "2026-Q3",
    });
    const scoreId = need("POST /rh/score/quarters/generate", score?.data?.id as string | undefined);
    await step("GET", "/rh/score/quarters/me", undefined, { as: target });
    if (scoreId) {
      await step("GET", `/rh/score/quarters/${scoreId}`);
      await step("GET", `/rh/score/quarters/${scoreId}`, undefined, { as: target });
      await step("PATCH", "/rh/score/quarters/nitro", {
        score_id: scoreId,
        type: "projects",
        value: 8,
      });
      for (const type of ["projects", "hours", "errors", "folders"]) {
        await step("PUT", "/rh/score/nitro/update", { score_id: scoreId, type, value: "7" });
      }
    }
    await step("GET", "/rh/score/evaluations/pending");
    const pending = await step("GET", "/rh/score/evaluations/pending", undefined, { as: target });
    const evaluation = (
      pending?.data as Array<{ id: string; answers: Array<{ question_id: string }> }> | undefined
    )?.[0];
    if (evaluation) {
      await step(
        "POST",
        "/rh/score/evaluations/submit",
        {
          evaluation_id: evaluation.id,
          answers: evaluation.answers.map((answer) => ({
            question_id: answer.question_id,
            answer: 4,
            obs: "Bom",
          })),
        },
        { as: target },
      );
    } else {
      failures.push("nenhuma avaliação pendente para o colaborador");
    }

    expect(failures).toEqual([]);
  });

  it("dossiê, contatos de emergência, alergias e colaboradores operacionais", async () => {
    const state = requireSmokeState();
    const { failures, step } = session();
    const person = await collaborator();
    const unique = Date.now().toString().slice(-11);

    await step("GET", `/rh/profile/colaborator?user_id=${person}`);
    await step("GET", "/rh/profile/colaborator", undefined, { as: person });
    await step("GET", `/rh/profile/colaborator/list?department_id=${state.departmentId}`);
    await step("GET", "/rh/profile/colaborator/list");
    await step("PUT", "/rh/profile/colaborator", {
      target_user_id: person,
      full_name: "Colaborador Smoke da Silva",
      gender: "Masculino",
      birth_date: "1990-05-20",
      cpf: unique,
      rg: `RG${unique}`,
      address: "Rua Smoke, 123",
      job_title: "Analista",
      email: `dossie-${unique}@smoke.local`,
      phone: "11999990000",
      hire_date: "2024-01-15",
      dominio_hire_date: "2024-01-15",
      termination_date: null,
      photo_url: "https://smoke.local/foto.png",
      status: "active",
      department_id: state.departmentId,
    });
    await step("PUT", "/rh/profile/colaborator", { phone: "11888887777" }, { as: person });

    const contact = await step("POST", "/rh/profile/contact", {
      target_user_id: person,
      name: "Mãe",
      phone: "11977776666",
      reference: "Mãe",
    });
    await step("GET", `/rh/profile/contact?user_id=${person}`);
    const contactId = (contact?.data?.id ??
      (Array.isArray(contact?.data) ? contact.data[0]?.id : undefined)) as string | undefined;
    if (contactId) {
      await step("PUT", "/rh/profile/contact", {
        target_user_id: person,
        id: contactId,
        name: "Pai",
        phone: "11966665555",
        reference: null,
      });
      await step("DELETE", "/rh/profile/contact", { target_user_id: person, id: contactId });
    } else {
      failures.push(`POST contact sem id: ${JSON.stringify(contact)}`);
    }
    await step("PUT", "/rh/profile/allergy", {
      target_user_id: person,
      allergies: [{ name: "Dipirona", fonts: "Medicamento", action: "Evitar" }],
    });
    await step("GET", `/rh/profile/allergy?user_id=${person}`);
    await step("GET", "/rh/profile/allergy", undefined, { as: person });

    await step("GET", "/rh/operational-users");
    await step("GET", `/rh/operational-users?department_id=${state.departmentId}`);
    await step("GET", "/rh/operational-users?department_name=Tecnologia&module=rh");

    expect(failures).toEqual([]);
  });

  it("health, ready e relatórios internos de todas as fontes", async () => {
    const state = requireSmokeState();
    const { failures, step } = session();
    await step("GET", "/health");
    await step("GET", "/ready");

    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
      if (value && typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
          .join(",")}}`;
      }
      return JSON.stringify(value);
    };
    const grantHeaders = (operation: string, source: string, fields: string[], body: unknown) => {
      const now = Math.floor(Date.now() / 1000);
      const requestId = `smoke-${randomUUID()}`;
      const grant = Buffer.from(
        canonical({
          version: 1,
          audience: "rh-service",
          operation,
          source,
          organization_id: state.organizationId,
          fields,
          request_id: requestId,
          issued_at: now,
          expires_at: now + 30,
          body_sha256: createHash("sha256").update(canonical(body)).digest("hex"),
        }),
      ).toString("base64url");
      return {
        "x-internal-service-token": REPORTS_TOKEN,
        "x-request-id": requestId,
        "x-reports-grant": grant,
        "x-reports-grant-signature": createHmac("sha256", REPORTS_SECRET)
          .update(grant)
          .digest("hex"),
        "content-type": "application/json",
      };
    };
    expect(SMOKE_INTERNAL_TOKEN).not.toBe(REPORTS_TOKEN);

    await step("GET", "/internal/reporting/catalog", undefined, {
      headers: grantHeaders("catalog", "rh.catalog", [], {}),
    });
    for (const source of RH_REPORTING_SOURCES) {
      const fields = [...getRhReportingFields(source)].slice(0, 25);
      const body = { source, fields, limit: 101 };
      await step("POST", "/internal/reporting/extract", body, {
        headers: grantHeaders("extract", source, fields, body),
      });
    }

    expect(failures).toEqual([]);
  });
});
