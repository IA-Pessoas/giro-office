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

test("status manual permite pausar, retomar e concluir sem tarefas abertas", () => {
  assert.equal(resolveManualProjectStatus("Em andamento", undefined, 3), "Em andamento");
  assert.equal(resolveManualProjectStatus("Em andamento", "Paralisado", 3), "Paralisado");
  assert.equal(resolveManualProjectStatus("Paralisado", "Em andamento", 3), "Em andamento");
  assert.equal(resolveManualProjectStatus("A realizar", "Concluído", 0), "Concluído");
});

test("status manual recusa concluir com tarefas abertas, valor inválido e projeto no Comercial", () => {
  assert.throws(() => resolveManualProjectStatus("Em andamento", "Concluído", 2), {
    statusCode: 409,
    message: "Não é possível concluir o projeto: há 2 tarefa(s) em aberto.",
  });
  assert.throws(() => resolveManualProjectStatus("Em andamento", "Cancelado", 0), {
    statusCode: 400,
  });
  assert.throws(
    () => resolveManualProjectStatus(PROJECT_STATUS_WAITING_COMMERCIAL, "Em andamento", 0),
    { statusCode: 409 },
  );
});

test("progresso conclui em 100% e não sobrescreve projeto paralisado", () => {
  assert.equal(getProgressProjectStatus("Em andamento", 100), "Concluído");
  assert.equal(getProgressProjectStatus("Paralisado", 100), "Concluído");
  assert.equal(getProgressProjectStatus("Paralisado", 40), "Paralisado");
  assert.equal(getProgressProjectStatus("A realizar", 40), "Em andamento");
});
