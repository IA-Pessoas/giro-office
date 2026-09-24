import assert from "node:assert/strict";
import test from "node:test";

import {
  getInitialProjectStatus,
  getProgressProjectStatus,
  PROJECT_STATUS_WAITING_COMMERCIAL,
  resolveManualProjectStatus,
} from "../src/database/projectCreation.js";

const today = new Date("2026-09-24T15:00:00.000Z");

test("projeto nasce A realizar com início futuro e Em andamento com início até hoje", () => {
  const client = { type_registration: "Existente", prospecting_status: "Fechado" };

  assert.equal(
    getInitialProjectStatus(client, new Date("2026-10-01T00:00:00.000Z"), today),
    "A realizar",
  );
  assert.equal(
    getInitialProjectStatus(client, new Date("2026-09-24T00:00:00.000Z"), today),
    "Em andamento",
  );
  assert.equal(
    getInitialProjectStatus(
      { type_registration: "Novo", prospecting_status: "Análise Financeira" },
      new Date("2026-10-01T00:00:00.000Z"),
      today,
    ),
    PROJECT_STATUS_WAITING_COMMERCIAL,
  );
});

test("hoje é o dia civil de São Paulo, não de UTC", () => {
  const client = { type_registration: "Existente", prospecting_status: "Fechado" };
  // 23h de 24/09 em São Paulo já é 25/09 em UTC.
  const lateEvening = new Date("2026-09-25T02:00:00.000Z");

  assert.equal(
    getInitialProjectStatus(client, new Date("2026-09-25T00:00:00.000Z"), lateEvening),
    "A realizar",
  );
});

test("status manual permite pausar, retomar e concluir sem tarefas abertas", () => {
  assert.equal(resolveManualProjectStatus("Em andamento", undefined, 3, false), "Em andamento");
  assert.equal(resolveManualProjectStatus("Em andamento", "Paralisado", 3, false), "Paralisado");
  assert.equal(resolveManualProjectStatus("Paralisado", "Em andamento", 3, false), "Em andamento");
  assert.equal(resolveManualProjectStatus("A realizar", "Concluído", 0, true), "Concluído");
});

test("status manual recusa concluir com tarefas abertas, valor inválido e projeto no Comercial", () => {
  assert.throws(() => resolveManualProjectStatus("Em andamento", "Concluído", 0, false), {
    statusCode: 403,
  });
  assert.throws(() => resolveManualProjectStatus("Em andamento", "Concluído", 2, true), {
    statusCode: 409,
    message: "Não é possível concluir o projeto: há 2 tarefa(s) em aberto.",
  });
  assert.throws(() => resolveManualProjectStatus("Em andamento", "Cancelado", 0, true), {
    statusCode: 400,
  });
  assert.throws(
    () => resolveManualProjectStatus(PROJECT_STATUS_WAITING_COMMERCIAL, "Em andamento", 0, true),
    { statusCode: 409 },
  );
});

test("progresso conclui em 100% e não sobrescreve projeto paralisado", () => {
  assert.equal(getProgressProjectStatus("Em andamento", 100), "Concluído");
  assert.equal(getProgressProjectStatus("Paralisado", 100), "Concluído");
  assert.equal(getProgressProjectStatus("Paralisado", 40), "Paralisado");
  assert.equal(getProgressProjectStatus("A realizar", 40), "Em andamento");
});
