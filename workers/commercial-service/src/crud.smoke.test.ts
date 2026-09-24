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
  smokeCall,
  smokeEnv,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { type CommercialWorkerEnv, createCommercialWorkerApp } from "./app.js";

// O onError do Worker esconde a mensagem do 5xx; aqui ela (e a causa do Prisma) vai ao console.
function debugApp(env: CommercialWorkerEnv) {
  const app = createCommercialWorkerApp({ env });
  app.onError((error, c) => {
    const serialized = serializeError(error, { fallbackMessage: "erro interno" });
    const cause = (error as { cause?: unknown }).cause;
    const debug = serialized.statusCode >= 500 ? `${error} | cause: ${cause}` : undefined;
    if (debug) console.error(error, cause);
    return c.json(
      { ...(serialized.body as object), debug },
      serialized.statusCode as ContentfulStatusCode,
    );
  });
  return app;
}

describe.skipIf(!smokeState)("commercial-service CRUD smoke (banco real)", () => {
  // Sem AUDIT_SERVICE: a auditoria vira no-op (createCommercialAudit retorna cedo).
  const env = () => smokeEnv<CommercialWorkerEnv>();
  const call = (method: string, path: string, body?: unknown) =>
    smokeCall(debugApp(env()), env(), method, path, body);

  it("ready", async () => {
    expectOk(await call("GET", "/ready"), "GET /ready");
  });

  it("configurações de proposta: cria, lê, lista, atualiza e exclui", async () => {
    const name = `Smoke Proposta ${Date.now()}`;
    const created = expectOk(
      await call("POST", "/commercial/proposal-configs", { name, contract_value: 1500.5 }),
      "POST proposal-configs",
    ).data;
    expect(created).toMatchObject({ name, contract_value: 1500.5 });
    expect(
      (await call("POST", "/commercial/proposal-configs", { name, contract_value: 1 })).status,
    ).toBe(409);

    expect(
      expectOk(await call("GET", `/commercial/proposal-configs/${created.id}`), "GET config").data,
    ).toMatchObject({ name });
    const list = expectOk(await call("GET", "/commercial/proposal-configs"), "GET configs").data;
    expect(list.map((row: { id: string }) => row.id)).toContain(created.id);

    expectOk(
      await call("PATCH", `/commercial/proposal-configs/${created.id}`, {
        name: `${name} Editada`,
        contract_value: 2000,
      }),
      "PATCH config",
    );
    expect(
      expectOk(await call("GET", `/commercial/proposal-configs/${created.id}`), "GET após PATCH")
        .data,
    ).toMatchObject({ name: `${name} Editada`, contract_value: 2000 });

    expectOk(await call("DELETE", `/commercial/proposal-configs/${created.id}`), "DELETE config");
    expect((await call("GET", `/commercial/proposal-configs/${created.id}`)).status).toBe(404);
  });

  it("prospecção: clientes livres, cria, lê, lista, transições, arquiva e status do outbox", async () => {
    // Cliente é do client-service.
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Prospect ${Date.now()}`,
      status: "Prospecção",
      prospecting_status: "Análise/Agendamento",
    });
    const clientId = String(client.id);
    const free = expectOk(
      await call("GET", "/commercial/prospecting/clients"),
      "GET prospecting/clients",
    ).data;
    expect(free.map((row: { id: string }) => row.id)).toContain(clientId);

    const created = expectOk(
      await call("POST", "/commercial/prospecting", {
        client_id: clientId,
        status: "Análise/Agendamento",
        status_date: "2026-09-01",
        description: "Primeira reunião",
      }),
      "POST prospecting",
    ).data;
    expect(
      (
        await call("POST", "/commercial/prospecting", {
          client_id: clientId,
          status: "Análise/Agendamento",
        })
      ).status,
    ).toBe(409);

    const detail = expectOk(
      await call("GET", `/commercial/prospecting/${created.id}`),
      "GET prospecting/:id",
    ).data;
    expect(detail).toMatchObject({ client_id: clientId, status: "Análise/Agendamento" });
    expect(detail.client.id).toBe(clientId);
    const list = expectOk(await call("GET", "/commercial/prospecting"), "GET prospecting").data;
    expect(list.map((row: { id: string }) => row.id)).toContain(created.id);

    for (const status of ["Análise Financeira", "Envio de Proposta", "Fechado"]) {
      expectOk(
        await call("PATCH", `/commercial/prospecting/${created.id}`, {
          status,
          status_date: "2026-09-10",
          description: `Etapa ${status}`,
        }),
        `PATCH prospecting ${status}`,
      );
      expect(
        expectOk(await call("GET", `/commercial/prospecting/${created.id}`), "GET após PATCH").data,
      ).toMatchObject({ status, description: `Etapa ${status}` });
    }
    expect(
      (await call("PATCH", `/commercial/prospecting/${created.id}`, { status: "Paralisado" }))
        .status,
    ).toBe(409);

    const outbox = expectOk(
      await call("GET", "/commercial/outbox/status"),
      "GET outbox/status",
    ).data;
    expect(outbox.counts.pending).toBeGreaterThan(0);

    expectOk(await call("DELETE", `/commercial/prospecting/${created.id}`), "DELETE prospecting");
    expect((await call("GET", `/commercial/prospecting/${created.id}`)).status).toBe(404);
  });

  it("cobrança de tarefa: lista e upsert", async () => {
    const state = requireSmokeState();
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Smoke Billing ${Date.now()}`,
      status: "Ativo",
    });
    const project = await smokeInsert("integracao.projects", {
      id: randomUUID(),
      client_id: client.id,
    });
    const model = await smokeInsert("integracao.tasksModel", {
      id: randomUUID(),
      department_id: state.departmentId,
      responsible_id: state.ownerId,
    });
    const task = await smokeInsert("integracao.tasks", {
      id: randomUUID(),
      client_id: client.id,
      name: `Smoke Tarefa ${Date.now()}`,
      status: "A Realizar",
      billing: "Mensal",
      department_id: state.departmentId,
      model_id: model.id,
      project_id: project.id,
      responsible_id: state.ownerId,
    });
    const taskId = String(task.id);

    expectOk(
      await call("PUT", `/commercial/task-billing/${taskId}`, {
        hiring_status: "Contratado",
        payment: "Boleto",
        billing_description: "Cobrança mensal",
      }),
      "PUT task-billing (create)",
    );
    expectOk(
      await call("PUT", `/commercial/task-billing/${taskId}`, {
        hiring_status: "Não Contratado",
        payment: null,
        billing_description: "Cancelado",
      }),
      "PUT task-billing (update)",
    );
    const list = expectOk(await call("GET", "/commercial/task-billing"), "GET task-billing").data;
    expect(list.find((row: { task_id: string }) => row.task_id === taskId)).toMatchObject({
      hiring_status: "Não Contratado",
      payment: null,
      billing_description: "Cancelado",
      billing: "Mensal",
    });
  });
});
