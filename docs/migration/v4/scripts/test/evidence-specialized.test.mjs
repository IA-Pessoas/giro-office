import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const LEGACY_ROOT = "/home/bruno/Documents/workspace2";
const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";

const evidenceModule = await import("../evidence/technology-certificates-parcelamento.mjs").catch(
  () => null,
);
const rulesModule = await import("../rules/index.mjs").catch(() => null);

const CONFIRMED_SOURCE_TABLES = [
  "tb_cbc.panorama_parcelamentos",
  "tb_certificados.pf",
  "tb_certificados.pj",
  "tb_parcelamento.clientes",
  "tb_parcelamento.competencia",
  "tb_parcelamento.parcelamentos",
  "tb_tecnologia.estoque",
  "tb_tecnologia.estoque_entradas",
  "tb_tecnologia.estoque_saidas",
  "tb_tecnologia.inventario",
  "tb_tecnologia.inventario_itens",
  "tb_tecnologia.inventario_loc",
  "tb_tecnologia.opcoes",
  "tb_tecnologia.senhas",
  "tb_tecnologia.termos",
];

function requireImplementation() {
  assert.ok(evidenceModule, "módulo de evidência especializada ainda não implementado");
  assert.ok(rulesModule, "registry especializado ainda não implementado");
  return { ...evidenceModule, ...rulesModule };
}

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
  assert.ok(createBody, `CREATE TABLE ausente: ${sourceTable}`);
  return [...createBody.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

test("evidência especializada cobre exatamente as 25 origens dos três domínios", async () => {
  const {
    CERTIFICATE_SOURCE_TABLES,
    PARCELAMENTO_SOURCE_TABLES,
    SPECIALIZED_EVIDENCE,
    SPECIALIZED_SOURCE_TABLES,
    TECHNOLOGY_SOURCE_TABLES,
  } = requireImplementation();
  const files = await readdir(LEGACY_DUMP_ROOT);
  const expectedByPrefix = (prefix) =>
    files
      .filter((file) => file.startsWith(prefix) && file.endsWith(".sql"))
      .map((file) => file.slice(0, -4))
      .sort();
  const technology = expectedByPrefix("tb_tecnologia.");
  const certificates = expectedByPrefix("tb_certificados.");
  const parcelamento = [
    "tb_cbc.panorama_clientes_parcelamento",
    "tb_cbc.panorama_parcelamentos",
    ...expectedByPrefix("tb_parcelamento."),
  ].sort();
  const expected = [...technology, ...certificates, ...parcelamento].sort();

  assert.equal(expected.length, 25);
  assert.deepEqual(TECHNOLOGY_SOURCE_TABLES, technology);
  assert.deepEqual(CERTIFICATE_SOURCE_TABLES, certificates);
  assert.deepEqual(PARCELAMENTO_SOURCE_TABLES, parcelamento);
  assert.deepEqual(SPECIALIZED_SOURCE_TABLES, expected);
  assert.deepEqual(
    SPECIALIZED_EVIDENCE.map(({ sourceTable }) => sourceTable),
    expected,
  );
});

test("somente as 15 decisões confirmed possuem regra e pending não sugere destino", () => {
  const {
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
    RH_PESSOAL_RULES,
    SPECIALIZED_EVIDENCE,
    TECHNOLOGY_RULES,
    buildRuleRegistry,
  } = requireImplementation();
  const specializedRules = [...TECHNOLOGY_RULES, ...CERTIFICATE_RULES, ...PARCELAMENTO_RULES];
  const registry = buildRuleRegistry(
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
  );
  const confirmed = SPECIALIZED_EVIDENCE.filter(({ finalStatus }) => finalStatus === "confirmed");
  const pending = SPECIALIZED_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending");

  assert.deepEqual(
    confirmed.map(({ sourceTable }) => sourceTable),
    CONFIRMED_SOURCE_TABLES,
  );
  assert.equal(confirmed.length, 15);
  assert.equal(pending.length, 10);
  assert.equal(specializedRules.length, 15);
  assert.equal(registry.size, 56);

  for (const decision of confirmed) {
    const mappingRule = registry.get(decision.sourceTable);
    assert.ok(mappingRule, decision.sourceTable);
    assert.equal(mappingRule.ruleOrigin, decision.ruleId);
    assert.deepEqual(mappingRule.evidence, {
      legacy: decision.legacyReferences,
      current: decision.currentContractEvidence,
    });
  }

  for (const decision of pending) {
    assert.equal(decision.ruleId, null, decision.sourceTable);
    assert.equal(registry.has(decision.sourceTable), false, decision.sourceTable);
    assert.equal("destinations" in decision, false);
  }
});

test("toda decisão cita legado real e toda confirmação cita contrato atual real", async () => {
  const { SPECIALIZED_EVIDENCE } = requireImplementation();

  for (const decision of SPECIALIZED_EVIDENCE) {
    assert.ok(decision.legacyReferences.length > 0, decision.sourceTable);
    assert.ok(decision.operations.length > 0, decision.sourceTable);
    for (const reference of decision.legacyReferences) {
      await assertReferenceExists(LEGACY_ROOT, reference);
    }
    if (decision.finalStatus === "confirmed") {
      assert.ok(decision.currentContractEvidence.length > 0, decision.sourceTable);
      for (const reference of decision.currentContractEvidence) {
        const { file } = parseReference(reference);
        assert.match(file, /^(infra\/prisma|services\/)/, reference);
        await assertReferenceExists(process.cwd(), reference);
      }
    }
  }
});

test("toda coluna pending é not_preserved com razão objetiva e sem destino", async () => {
  const { SPECIALIZED_EVIDENCE, SPECIALIZED_PENDING_COLUMN_DECISIONS } = requireImplementation();
  const pending = SPECIALIZED_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending");

  assert.deepEqual(
    Object.keys(SPECIALIZED_PENDING_COLUMN_DECISIONS).sort(),
    pending.map(({ sourceTable }) => sourceTable),
  );
  for (const decision of pending) {
    const sourceColumns = await inspectDeclaredColumns(decision.sourceTable);
    const columnDecisions = SPECIALIZED_PENDING_COLUMN_DECISIONS[decision.sourceTable];
    assert.deepEqual(
      columnDecisions.map(({ sourceColumn }) => sourceColumn).sort(),
      sourceColumns.sort(),
      decision.sourceTable,
    );
    for (const columnDecision of columnDecisions) {
      assert.equal(columnDecision.status, "not_preserved");
      assert.equal(columnDecision.destinationColumn, null);
      assert.ok(columnDecision.reason.length >= 30, decision.sourceTable);
    }
  }
});

test("evidência e pending de segurança não carregam valores de segredo", () => {
  const { SPECIALIZED_EVIDENCE, SPECIALIZED_PENDING_COLUMN_DECISIONS } = requireImplementation();
  const serialized = JSON.stringify({
    evidence: SPECIALIZED_EVIDENCE,
    pendingColumns: SPECIALIZED_PENDING_COLUMN_DECISIONS,
  });

  for (const sentinel of [
    "SENTINEL_TI_PASSWORD",
    "SENTINEL_RESET_TOKEN",
    "SENTINEL_PFX_CONTENT",
    "SENTINEL_PEM_CONTENT",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(sentinel));
  }
});
