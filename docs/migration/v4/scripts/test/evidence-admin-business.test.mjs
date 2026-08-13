import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  ADMIN_BUSINESS_EVIDENCE,
  ADMIN_BUSINESS_PENDING_COLUMN_DECISIONS,
  ADMIN_BUSINESS_SOURCE_TABLES,
} from "../evidence/admin-business.mjs";
import { createPendingMapping } from "../lib/mapping-contract.mjs";
import { validateEvidenceCoverage } from "../lib/semantic-evidence.mjs";
import { ADMIN_BUSINESS_RULES, buildRuleRegistry } from "../rules/index.mjs";

const LEGACY_ROOT = "/home/bruno/Documents/workspace2";
const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
const PREFIXES = [
  "tb_admin",
  "tb_atendimento",
  "tb_comercial",
  "tb_contabil",
  "tb_financeiro",
  "tb_fiscal",
];
const V2_SOURCES = new Set(["tb_admin.departamentos", "tb_admin.usuarios"]);
const NO_CODE_REFERENCE_SOURCES = new Set([
  "tb_atendimento.motoboy",
  "tb_contabil.bancos",
  "tb_contabil.clientes_bancos_temp",
  "tb_contabil.documentos_bancos",
]);
const CONFIRMED_SOURCE_TABLES = [
  "tb_admin.logs",
  "tb_admin.permissoes",
  "tb_admin.permissoes_certificado",
  "tb_admin.permissoes_comercial",
  "tb_admin.permissoes_contabil",
  "tb_admin.permissoes_financeiro",
  "tb_admin.permissoes_fiscal",
  "tb_admin.permissoes_integracao",
  "tb_admin.permissoes_marketing",
  "tb_admin.permissoes_parcelamento",
  "tb_admin.permissoes_pessoal",
  "tb_admin.permissoes_regularize",
  "tb_admin.permissoes_rh",
  "tb_admin.permissoes_triagem",
  "tb_contabil.clientes_mov",
  "tb_contabil.clientes_observacao",
  "tb_contabil.controle",
  "tb_contabil.relacoes",
  "tb_fiscal.icms",
  "tb_fiscal.ipi",
  "tb_fiscal.tributacao_pis_cofins",
];

function parseReference(reference) {
  const match = reference.match(/^(.+):(\d+)$/);
  assert.ok(match, `referência sem linha auditável: ${reference}`);
  return { file: match[1], line: Number(match[2]) };
}

async function assertReferenceExists(root, reference) {
  const { file, line } = parseReference(reference);
  const content = await readFile(path.join(root, file), "utf8");
  assert.ok(content.split(/\r?\n/)[line - 1]?.trim().length > 0, reference);
}

async function inspectDeclaredColumns(sourceTable) {
  const dump = await readFile(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const createBody = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1];
  if (createBody === undefined) return [];
  return [...createBody.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

test("evidência administrativa/empresarial cobre exatamente as 66 origens fora da V2", async () => {
  const dumpFiles = await readdir(LEGACY_DUMP_ROOT);
  const expected = dumpFiles
    .filter((file) => PREFIXES.some((prefix) => file.startsWith(`${prefix}.`)))
    .map((file) => file.slice(0, -".sql".length))
    .filter((sourceTable) => !V2_SOURCES.has(sourceTable))
    .sort();

  assert.equal(expected.length, 66);
  assert.deepEqual(ADMIN_BUSINESS_SOURCE_TABLES, expected);
  assert.deepEqual(
    ADMIN_BUSINESS_EVIDENCE.map(({ sourceTable }) => sourceTable),
    expected,
  );
  assert.doesNotThrow(() =>
    validateEvidenceCoverage(
      { decisions: ADMIN_BUSINESS_EVIDENCE },
      { tables: expected.map((sourceTable) => ({ sourceTable })) },
    ),
  );
});

test("somente 21 decisões comprovadas possuem regra; 45 pending não emitem nem sugerem destino", () => {
  const registry = buildRuleRegistry(ADMIN_BUSINESS_RULES);
  const confirmed = ADMIN_BUSINESS_EVIDENCE.filter(
    ({ finalStatus }) => finalStatus === "confirmed",
  );
  const pending = ADMIN_BUSINESS_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending");

  assert.deepEqual(
    confirmed.map(({ sourceTable }) => sourceTable),
    CONFIRMED_SOURCE_TABLES,
  );
  assert.equal(confirmed.length, 21);
  assert.equal(pending.length, 45);
  assert.equal(ADMIN_BUSINESS_RULES.length, 21);

  for (const decision of confirmed) {
    const mappingRule = registry.get(decision.sourceTable);
    assert.ok(mappingRule, decision.sourceTable);
    assert.equal(decision.ruleId, `admin-business:${decision.sourceTable}`);
    assert.equal(mappingRule.ruleOrigin, decision.ruleId);
  }

  for (const decision of pending) {
    assert.equal(decision.ruleId, null, decision.sourceTable);
    assert.equal(registry.has(decision.sourceTable), false, decision.sourceTable);
    const pendingMapping = createPendingMapping(
      { sourceTable: decision.sourceTable, rowCount: 0 },
      decision,
    );
    assert.equal("destinations" in pendingMapping, false, decision.sourceTable);
    assert.equal("emitRows" in pendingMapping, false, decision.sourceTable);
    assert.equal("suggestion" in pendingMapping, false, decision.sourceTable);
  }
});

test("referências legadas e contratos atuais são auditáveis, incluindo no_code_reference", async () => {
  for (const decision of ADMIN_BUSINESS_EVIDENCE) {
    if (NO_CODE_REFERENCE_SOURCES.has(decision.sourceTable)) {
      assert.deepEqual(decision.legacyReferences, [], decision.sourceTable);
      assert.deepEqual(decision.operations, [], decision.sourceTable);
      assert.equal(decision.finalStatus, "pending", decision.sourceTable);
      assert.equal(decision.reasonCode, "NO_CODE_REFERENCE", decision.sourceTable);
      continue;
    }

    assert.ok(decision.legacyReferences.length > 0, decision.sourceTable);
    for (const reference of decision.legacyReferences) {
      await assertReferenceExists(LEGACY_ROOT, reference);
    }

    if (decision.finalStatus === "confirmed") {
      assert.ok(decision.operations.length > 0, decision.sourceTable);
      assert.ok(decision.currentContractEvidence.length > 0, decision.sourceTable);
    }
    for (const reference of decision.currentContractEvidence) {
      const { file } = parseReference(reference);
      assert.match(file, /^(infra\/prisma|services\/|shared\/)/, reference);
      await assertReferenceExists(process.cwd(), reference);
    }
  }
});

test("toda coluna das 45 origens pending é not_preserved sem destino ou transformação emissora", async () => {
  const pending = ADMIN_BUSINESS_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending");
  assert.deepEqual(
    Object.keys(ADMIN_BUSINESS_PENDING_COLUMN_DECISIONS).sort(),
    pending.map(({ sourceTable }) => sourceTable),
  );

  for (const decision of pending) {
    const expected = await inspectDeclaredColumns(decision.sourceTable);
    const columns = ADMIN_BUSINESS_PENDING_COLUMN_DECISIONS[decision.sourceTable];
    assert.deepEqual(
      columns.map(({ sourceColumn }) => sourceColumn).sort(),
      expected.sort(),
      decision.sourceTable,
    );
    for (const column of columns) {
      assert.equal(column.status, "not_preserved");
      assert.equal(column.destinationColumn, null);
      assert.equal(column.transformation, "not_emitted_pending_mapping");
      assert.equal(column.referenceRole, "none");
      assert.ok(column.reason.length >= 30);
    }
  }
});

test("módulos aposentados, merges frágeis e conteúdo livre permanecem pending", () => {
  const pendingBySource = new Map(
    ADMIN_BUSINESS_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending").map((item) => [
      item.sourceTable,
      item,
    ]),
  );

  for (const sourceTable of [
    "tb_admin.permissoes_atendimento",
    "tb_admin.permissoes_pec",
    "tb_admin.permissoes_wiki",
    "tb_atendimento.contatos",
    "tb_atendimento.uber_clientes",
    "tb_financeiro.contratos",
    "tb_contabil.documentos",
    "tb_contabil.nuvens",
    "tb_fiscal.clientes_atacadistas",
    "tb_fiscal.documentos",
  ]) {
    const decision = pendingBySource.get(sourceTable);
    assert.ok(decision, sourceTable);
    assert.equal(decision.ruleId, null, sourceTable);
    assert.match(
      decision.reasonCode,
      /DYNAMIC_PERMISSION_NOT_PROVEN|RETIRED_PERMISSION_MODULE|CURRENT_CONTRACT_NOT_FAITHFUL|NO_CURRENT_CONTRACT|NO_STABLE_MERGE_IDENTITY/,
      sourceTable,
    );
  }

  const serialized = JSON.stringify(ADMIN_BUSINESS_EVIDENCE);
  assert.doesNotMatch(serialized, /SENTINEL_PERSONAL_VALUE|SENTINEL_SECRET_VALUE/);
  const dynamic = ADMIN_BUSINESS_EVIDENCE.find(
    ({ sourceTable }) => sourceTable === "tb_admin.permissoes",
  );
  assert.equal(dynamic?.finalStatus, "confirmed");
});
