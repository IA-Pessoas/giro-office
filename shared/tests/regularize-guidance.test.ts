import assert from "node:assert/strict";
import test from "node:test";

import {
  REGULARIZE_GUIDANCE_CHECKLIST_CODES,
  REGULARIZE_GUIDANCE_CHECKLIST_ITEMS,
  REGULARIZE_GUIDANCE_CHECKLIST_STATUSES,
  REGULARIZE_GUIDANCE_TARGET_TYPES,
} from "../src/regularize/guidance.js";

test("publica o checklist canônico de orientação com 17 itens ordenados", () => {
  const expectedItems = [
    ["type", "Tipo de orientação"],
    ["request", "Solicitação"],
    ["framework_obs", "Observações de enquadramento"],
    ["legal_nature", "Natureza jurídica"],
    ["company_name", "Razão social"],
    ["trade_name", "Nome fantasia"],
    ["cpf_cnpj", "CPF/CNPJ"],
    ["share_capital", "Capital social"],
    ["iptu", "IPTU"],
    ["address", "Endereço"],
    ["comporate_purpose", "Objeto social"],
    ["carryng", "Porte"],
    ["regime", "Regime tributário"],
    ["legal_representative", "Representante legal"],
    ["economic_activities", "Atividades econômicas"],
    ["partners", "Sócios"],
    ["branch", "Filial"],
  ];

  assert.equal(REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.length, 17);
  assert.deepEqual(
    REGULARIZE_GUIDANCE_CHECKLIST_ITEMS,
    expectedItems.map(([code, label]) => ({ code, label })),
  );
  assert.deepEqual(
    REGULARIZE_GUIDANCE_CHECKLIST_CODES,
    expectedItems.map(([code]) => code),
  );
  assert.equal(new Set(REGULARIZE_GUIDANCE_CHECKLIST_CODES).size, 17);
});

test("publica os alvos e status canônicos da orientação", () => {
  assert.deepEqual(REGULARIZE_GUIDANCE_TARGET_TYPES, ["PJ", "PF", "SEM_CLIENTE"]);
  assert.deepEqual(REGULARIZE_GUIDANCE_CHECKLIST_STATUSES, [
    "Pendente",
    "Concluído",
    "Não se aplica",
  ]);
});
