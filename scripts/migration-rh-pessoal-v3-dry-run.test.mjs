import assert from "node:assert/strict";
import test from "node:test";

import { buildBaseMaps, buildLoad, SOURCE_TABLES } from "./migration-rh-pessoal-v3-dry-run.mjs";

function emptyRows() {
  return Object.fromEntries(SOURCE_TABLES.map((table) => [table, []]));
}

test("buildLoad migra flags de departamento dos clientes a partir de tb_regularize.coringa", () => {
  const rows = emptyRows();
  rows["tb_integracao.clientes"] = [
    {
      id: 10,
      nome: "Cliente Contabil",
      tipo: "Juridica",
      tipo_cliente: 1,
      cpf_cnpj: "11.111.111/0001-11",
    },
    {
      id: 20,
      nome: "Cliente Sem Coringa",
      tipo: "Juridica",
      tipo_cliente: 1,
      cpf_cnpj: "22.222.222/0001-22",
    },
  ];
  rows["tb_regularize.coringa"] = [
    {
      id: 1,
      empresa: "10",
      contabil: 1,
      fiscal: 0,
      pessoal: 1,
      infoproduto: 0,
      consultoria: 1,
      castelo_med: 0,
    },
  ];

  const maps = buildBaseMaps(rows);
  const { load } = buildLoad(rows, maps);

  const clientWithDepartments = load.clients.find((client) => client.name === "Cliente Contabil");
  assert.equal(clientWithDepartments.contabil, true);
  assert.equal(clientWithDepartments.fiscal, false);
  assert.equal(clientWithDepartments.pessoal, true);
  assert.equal(clientWithDepartments.infoproduto, false);
  assert.equal(clientWithDepartments.consultoria, true);
  assert.equal(clientWithDepartments.castelo_med, false);

  const clientWithoutCoringa = load.clients.find((client) => client.name === "Cliente Sem Coringa");
  assert.equal(clientWithoutCoringa.contabil, false);
  assert.equal(clientWithoutCoringa.fiscal, false);
  assert.equal(clientWithoutCoringa.pessoal, false);
  assert.equal(clientWithoutCoringa.infoproduto, false);
  assert.equal(clientWithoutCoringa.consultoria, false);
  assert.equal(clientWithoutCoringa.castelo_med, false);
});
