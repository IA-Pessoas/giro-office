import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_MODULE_KEYS,
  normalizeModulePermission,
  normalizeModulePermissions,
  RETIRED_MODULE_KEYS,
  resolveDepartmentModuleKey,
} from "../src/auth/modules.js";

test("mantém os 13 módulos ativos e separa os módulos aposentados", () => {
  assert.deepEqual(ACTIVE_MODULE_KEYS, [
    "certificado",
    "comercial",
    "contabil",
    "financeiro",
    "fiscal",
    "integracao",
    "marketing",
    "parcelamento",
    "pessoal",
    "regularize",
    "rh",
    "ti",
    "triagem",
  ]);
  assert.deepEqual(RETIRED_MODULE_KEYS, ["atendimento", "pec", "wiki"]);
});

test("normaliza valores ausentes ou inválidos para sem acesso", () => {
  assert.equal(normalizeModulePermission(undefined), 0);
  assert.equal(normalizeModulePermission(null), 0);
  assert.equal(normalizeModulePermission(-1), 0);
  assert.equal(normalizeModulePermission(4), 0);
  assert.equal(normalizeModulePermission(3), 3);
});

test("produz somente chaves ativas e preenche módulo omitido com zero", () => {
  assert.deepEqual(
    normalizeModulePermissions({ certificado: 3, atendimento: 2, pec: 1, custom: 2 }),
    {
      certificado: 3,
      comercial: 0,
      contabil: 0,
      financeiro: 0,
      fiscal: 0,
      integracao: 0,
      marketing: 0,
      parcelamento: 0,
      pessoal: 0,
      regularize: 0,
      rh: 0,
      ti: 0,
      triagem: 0,
    },
  );
});

test("resolve nomes de departamento para a mesma chave canônica de módulo", () => {
  const cases = {
    Certificado: "certificado",
    Comercial: "comercial",
    Contabilidade: "contabil",
    "Contábil Fiscal": "contabil",
    "Contábil Societário": "contabil",
    Financeiro: "financeiro",
    Fiscal: "fiscal",
    "Integração de Clientes": "integracao",
    Marketing: "marketing",
    "Departamento Pessoal": "pessoal",
    "Recursos Humanos": "rh",
    Tecnologia: "ti",
    Triagem: "triagem",
  } as const;

  for (const [departmentName, moduleKey] of Object.entries(cases)) {
    assert.equal(resolveDepartmentModuleKey(departmentName), moduleKey, departmentName);
  }
  assert.equal(resolveDepartmentModuleKey("Atendimento"), null);
});
