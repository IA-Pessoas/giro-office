import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExecutionGroupCoverage,
  assertTransformationCoverage,
} from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";
import { CERTIFICATE_RULES } from "../rules/certificates.mjs";
import { PARCELAMENTO_RULES } from "../rules/parcelamento.mjs";
import { TECHNOLOGY_RULES } from "../rules/tecnologia.mjs";

const runtimeModule = await import("../runtime/technology-certificates-parcelamento.mjs").catch(
  () => null,
);

function requireImplementation() {
  assert.ok(runtimeModule, "runtime especializado ainda não implementado");
  return runtimeModule;
}

test("runtime especializado cobre cada passo declarado", () => {
  const { SPECIALIZED_EXECUTION_ENTRIES, SPECIALIZED_TRANSFORMERS } = requireImplementation();
  const rules = [...TECHNOLOGY_RULES, ...CERTIFICATE_RULES, ...PARCELAMENTO_RULES];

  assert.equal(assertExecutionGroupCoverage(rules, SPECIALIZED_EXECUTION_ENTRIES), true);
  assert.equal(new Set(SPECIALIZED_EXECUTION_ENTRIES.map((entry) => entry.sourceTable)).size, 15);
  assert.equal(SPECIALIZED_EXECUTION_ENTRIES.length, 17);
  assert.equal(
    assertTransformationCoverage(rules, SPECIALIZED_TRANSFORMERS, SPECIALIZED_EXECUTION_ENTRIES),
    true,
  );
});

test("credenciais e certificados exigem provedores efêmeros explícitos", () => {
  const { SPECIALIZED_EXECUTION_ENTRIES, buildSpecializedRuntimeState } = requireImplementation();
  const state = buildSpecializedRuntimeState({ organizationId: CASTELO_ORGANIZATION_ID });
  const credentialEntry = SPECIALIZED_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_tecnologia.senhas",
  );
  const certificateEntry = SPECIALIZED_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_certificados.pf",
  );
  assert.ok(credentialEntry, "entrada de credencial ausente");
  assert.ok(certificateEntry, "entrada de certificado ausente");

  const [credentialDecision] = credentialEntry.emitRows(
    { id: 1, id_usuario: 8, local: "Portal", user: "login", password: "secret", tipo: 0 },
    state,
  );
  assert.equal(credentialDecision.status, "quarantine");
  assert.doesNotMatch(JSON.stringify(credentialDecision), /login|secret/i);

  const [certificateDecision] = certificateEntry.emitRows(
    {
      id: 2,
      cliente: 1,
      nome: "Pessoa",
      cpf: "12345678901",
      modelo: "A1",
      senha: "secret",
      validade: "2027-03-10",
      pagamento: 0,
      status: 1,
      possui: 1,
      arquivo: "certificado.pfx",
    },
    state,
  );
  assert.equal(certificateDecision.status, "quarantine");
  assert.doesNotMatch(JSON.stringify(certificateDecision), /secret/i);
});

test("resolver especializado rejeita candidato sem tenant Castelo explícito", () => {
  const { createCasteloClientResolver } = requireImplementation();
  const resolveClient = createCasteloClientResolver([{ id: "client-1", legacyId: 7 }]);

  assert.equal(resolveClient(7).state, "zero");
});

test("certificado sem arquivo preserva metadados nulos sem exigir storage", async () => {
  const { SPECIALIZED_EXECUTION_ENTRIES, buildSpecializedRuntimeState } = requireImplementation();
  const row = {
    id: 2,
    cliente: 1,
    nome: "Pessoa",
    cpf: "12345678901",
    modelo: "A1",
    senha: "secret",
    validade: "2027-03-10",
    pagamento: 0,
    status: 1,
    possui: 0,
    arquivo: "",
  };
  const state = buildSpecializedRuntimeState({
    organizationId: CASTELO_ORGANIZATION_ID,
    sourceRows: new Map([["tb_certificados.pf", [row]]]),
    encrypt: async () => "encrypted-secret",
  });
  const entry = SPECIALIZED_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_certificados.pf",
  );
  const [decision] = entry.emitRows(row, state);

  assert.equal(decision.status, "prepared");
  const payload = await entry.projector(decision, row, state);
  assert.equal(payload.password, "encrypted-secret");
  assert.equal(payload.has_certificate, false);
  for (const field of [
    "file_path",
    "file_original_name",
    "file_mime_type",
    "file_size_bytes",
    "file_sha256",
    "file_uploaded_at",
    "file_uploaded_by_user_id",
    "file_storage_provider",
    "file_storage_bucket",
    "file_encryption_iv",
    "file_encryption_tag",
    "file_encryption_key_version",
  ]) {
    assert.equal(payload[field], null, field);
  }
});

test("certificado legado marcado sem arquivo migra a entidade com arquivo ausente", async () => {
  const { SPECIALIZED_EXECUTION_ENTRIES, buildSpecializedRuntimeState } = requireImplementation();
  const row = {
    id: 3,
    cliente: 1,
    nome: "Pessoa sem arquivo",
    cpf: "12345678901",
    modelo: "A1",
    senha: "secret",
    validade: "2027-03-10",
    pagamento: 0,
    status: 1,
    possui: 1,
    arquivo: "",
  };
  const state = buildSpecializedRuntimeState({
    organizationId: CASTELO_ORGANIZATION_ID,
    sourceRows: new Map([["tb_certificados.pf", [row]]]),
    encrypt: async () => "encrypted-secret",
  });
  const entry = SPECIALIZED_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_certificados.pf",
  );
  const [decision] = entry.emitRows(row, state);

  assert.equal(decision.status, "prepared");
  assert.equal((await entry.projector(decision, row, state)).has_certificate, false);
});

test("status textual real do estoque é normalizado explicitamente", () => {
  const { SPECIALIZED_TRANSFORMERS } = requireImplementation();

  assert.equal(SPECIALIZED_TRANSFORMERS.normalize_stock_status({ value: "Ativo" }), true);
  assert.equal(SPECIALIZED_TRANSFORMERS.normalize_stock_status({ value: "Inativo" }), false);
});

test("entrada de estoque resolve o repositor no campo legado correto", async () => {
  const { SPECIALIZED_EXECUTION_ENTRIES, buildSpecializedRuntimeState } = requireImplementation();
  const state = buildSpecializedRuntimeState({
    organizationId: CASTELO_ORGANIZATION_ID,
    stockCandidates: [{ id: "stock-9", legacyId: 9, organization_id: CASTELO_ORGANIZATION_ID }],
    userCandidates: [{ id: "user-8", legacyId: 8, organization_id: CASTELO_ORGANIZATION_ID }],
  });
  const entry = SPECIALIZED_EXECUTION_ENTRIES.find(
    ({ stepId }) => stepId === "technology-stock-entry-insert",
  );
  const row = {
    id: 1,
    produto_id: 9,
    quantidade: 2,
    data_entrada: "2026-08-06",
    repositor: 8,
  };
  const [decision] = entry.emitRows(row, state);

  assert.equal(decision.status, "prepared");
  assert.deepEqual(await entry.projector(decision, row, state), {
    id: "d70eb74b-e777-5b7d-89a3-d22bfeeb0557",
    stock_id: "stock-9",
    quantity: 2,
    entry_date: "2026-08-06T00:00:00.000Z",
    entry_by_user_id: "user-8",
    organization_id: CASTELO_ORGANIZATION_ID,
  });
});

test("saída de estoque resolve solicitante como colaborador ligado a usuário", async () => {
  const { SPECIALIZED_EXECUTION_ENTRIES, buildSpecializedRuntimeState } = requireImplementation();
  const state = buildSpecializedRuntimeState({
    organizationId: CASTELO_ORGANIZATION_ID,
    stockCandidates: [{ id: "stock-37", legacyId: 37, organization_id: CASTELO_ORGANIZATION_ID }],
    collaboratorUserCandidates: [
      { id: "user-27", legacyId: 4, organization_id: CASTELO_ORGANIZATION_ID },
    ],
    userCandidates: [
      { id: "user-241", legacyId: 241, organization_id: CASTELO_ORGANIZATION_ID },
      { id: "user-216", legacyId: 216, organization_id: CASTELO_ORGANIZATION_ID },
    ],
  });
  const entry = SPECIALIZED_EXECUTION_ENTRIES.find(
    ({ stepId }) => stepId === "technology-stock-exit-insert",
  );
  const row = {
    id: 85,
    produto_id: 37,
    quantidade: 1,
    data_saida: "2026-08-06",
    destino: "departamento",
    solicitante: 4,
    autorizador: 241,
    operador: 216,
  };

  const [decision] = entry.emitRows(row, state);
  assert.equal(decision.status, "prepared");
  assert.equal((await entry.projector(decision, row, state)).requester_id, "user-27");
});
