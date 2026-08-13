import assert from "node:assert/strict";
import test from "node:test";

import { CASTELO_ORGANIZATION_ID, REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { createCryptoCapabilities, createRuntimeOptionsFromRows } from "../lib/runtime-options.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";
import { buildRhPessoalRuleContext } from "../rules/rh-pessoal.mjs";
import { buildRhPessoalRuntimeState } from "../runtime/rh-pessoal.mjs";
import { buildSpecializedRuntimeState } from "../runtime/technology-certificates-parcelamento.mjs";

test("capabilities carrega o hasher bcrypt instalado no workspace", async () => {
  const capabilities = createCryptoCapabilities({});

  assert.equal(typeof capabilities.hashLegacyPassword, "function");
  assert.match(await capabilities.hashLegacyPassword("senha-legada"), /^\$2[aby]\$08\$/);
});

test("catálogo regularize não colide com o mesmo id numérico da integração", () => {
  const runtimeOptions = createRuntimeOptionsFromRows({
    sourceRowsByTable: new Map([
      ["tb_integracao.clientes", [{ id: 1, nome: "Integração" }]],
      ["tb_regularize.clientes", [{ codigo: 1, cliente_id: null, nome: "Regularize" }]],
    ]),
  });
  const runtimeState = buildSpecializedRuntimeState({
    ...runtimeOptions.specialized,
    organizationId: CASTELO_ORGANIZATION_ID,
  });

  assert.equal(runtimeState.resolveClient(1, "regularize").state, "one");
});

test("resolvers V2 usam plano e identidade canônica do cliente Regularize", () => {
  const runtimeOptions = createRuntimeOptionsFromRows({
    sourceRowsByTable: new Map([
      ["tb_integracao.clientes", [{ id: 9 }]],
      ["tb_integracao.planos", [{ id: 7 }]],
      ["tb_integracao.tarefas_express", [{ id: 7 }]],
      ["tb_regularize.clientes", [{ codigo: 5, cliente_id: 9 }]],
    ]),
  });

  assert.equal(
    runtimeOptions.v2.resolveProjectPlanReference(7),
    uuidV5(REQUIRED_IDENTITY_NAMESPACE, "tb_integracao.planos:7"),
  );
  assert.equal(
    runtimeOptions.v2.resolveRegularizeClientReference(5),
    uuidV5(REQUIRED_IDENTITY_NAMESPACE, "tb_integracao.clientes:9"),
  );
});

test("RH/Pessoal usa código Regularize e detecta folha existente pelo UUID canônico", () => {
  const clientId = uuidV5(REQUIRED_IDENTITY_NAMESPACE, "tb_integracao.clientes:2");
  const runtimeOptions = createRuntimeOptionsFromRows({
    sourceRowsByTable: new Map([
      ["tb_integracao.clientes", [{ id: 1 }, { id: 2 }]],
      ["tb_regularize.clientes", [{ codigo: 1, cliente_id: 2 }]],
    ]),
    destinationRowsByTable: new Map([
      ["pessoal.payroll", [{ id: "payroll-atual", client_id: clientId }]],
    ]),
  });
  const runtimeState = buildRhPessoalRuntimeState(runtimeOptions.rhPessoal);
  const context = buildRhPessoalRuleContext("tb_pessoal.folhas", { cliente_id: 1 }, runtimeState);

  assert.equal(context.clientId, clientId);
  assert.equal(context.payrollUniqueResolution, "one");
});

test("runtime preserva alias legado de usuário e reconhece identidade especializada existente", () => {
  const userId = uuidV5(REQUIRED_IDENTITY_NAMESPACE, "tb_admin.usuarios:1");
  const installmentId = uuidV5(
    REQUIRED_IDENTITY_NAMESPACE,
    `tb_parcelamento.parcelamentos:${CASTELO_ORGANIZATION_ID}:3`,
  );
  const runtimeOptions = createRuntimeOptionsFromRows({
    sourceRowsByTable: new Map([
      ["tb_admin.usuarios", [{ id: 1 }]],
      ["tb_parcelamento.parcelamentos", [{ id: 3 }]],
    ]),
    destinationRowsByTable: new Map([
      ["users", [{ id: userId, organization_id: CASTELO_ORGANIZATION_ID }]],
      [
        "parcelamento.installments",
        [{ id: installmentId, organization_id: CASTELO_ORGANIZATION_ID }],
      ],
    ]),
  });
  const runtimeState = buildSpecializedRuntimeState({
    ...runtimeOptions.specialized,
    organizationId: CASTELO_ORGANIZATION_ID,
  });

  assert.equal(runtimeState.resolveReference("user", 1).state, "one");
  assert.equal(runtimeState.resolveUnique("installment", { legacyId: 3 }).state, "one");
});
