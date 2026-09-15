import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPessoalGroupMigrationPlan,
  normalizePessoalGroupMigrationValue,
} from "./migrate-pessoal-groups.mjs";

const organizationId = "org-1";

function payroll(id, legacyGroup) {
  return { id, legacyGroup };
}

function group(id, name, overrides = {}) {
  return {
    id,
    name,
    normalizedName: normalizePessoalGroupMigrationValue(name),
    archivedAt: null,
    systemKey: null,
    ...overrides,
  };
}

test("dry-run mapeia apenas correspondencia canonica ativa e inequívoca", () => {
  const plan = buildPessoalGroupMigrationPlan({
    organizationId,
    payrolls: [payroll("payroll-1", "  Administração  ")],
    groups: [group("group-admin", "Administracao")],
    mappings: [],
  });

  assert.deepEqual(plan.ready, [
    {
      groupId: "group-admin",
      legacyValue: "  Administração  ",
      payrollIds: ["payroll-1"],
      source: "CANONICAL_MATCH",
    },
  ]);
  assert.deepEqual(plan.quarantine, []);
  assert.equal(plan.validation.unassignedOutsideQuarantine, 0);
});

test("dry-run mantém vazios, não mapeados, arquivados e Sem Movimento em quarentena", () => {
  const plan = buildPessoalGroupMigrationPlan({
    organizationId,
    payrolls: [
      payroll("payroll-empty", "   "),
      payroll("payroll-unknown", "Grupo novo"),
      payroll("payroll-archived", "Grupo antigo"),
      payroll("payroll-default", "Sem Movimento"),
    ],
    groups: [
      group("group-archived", "Grupo antigo", { archivedAt: new Date("2026-01-01") }),
      group("group-default", "Sem Movimento", { systemKey: "NO_MOVEMENT" }),
    ],
    mappings: [],
  });

  assert.deepEqual(
    plan.quarantine.map(({ legacyValue, reason }) => ({ legacyValue, reason })),
    [
      { legacyValue: "   ", reason: "EMPTY_LEGACY_GROUP" },
      { legacyValue: "Grupo antigo", reason: "ARCHIVED_CANONICAL_GROUP" },
      { legacyValue: "Grupo novo", reason: "UNMAPPED_LEGACY_GROUP" },
      { legacyValue: "Sem Movimento", reason: "NO_MOVEMENT_REQUIRES_EXPLICIT_MAPPING" },
    ],
  );
  assert.deepEqual(plan.ready, []);
  assert.equal(plan.validation.unassignedPayrolls, 4);
  assert.equal(plan.validation.unassignedOutsideQuarantine, 0);
});

test("decisão explícita permite aplicar group_id e preserva o valor legado no plano", () => {
  const plan = buildPessoalGroupMigrationPlan({
    organizationId,
    payrolls: [payroll("payroll-1", "Grupo legado")],
    groups: [group("group-target", "Grupo criado")],
    mappings: [
      {
        organizationId,
        legacyValue: "Grupo legado",
        normalizedValue: "grupo legado",
        groupId: "group-target",
        mappedAt: new Date("2026-09-15T12:00:00Z"),
        mappedById: "operator-1",
      },
    ],
  });

  assert.deepEqual(plan.ready, [
    {
      groupId: "group-target",
      legacyValue: "Grupo legado",
      payrollIds: ["payroll-1"],
      source: "EXPLICIT_MAPPING",
    },
  ]);
  assert.equal(plan.legacyPreserved, true);
  assert.equal(plan.validation.unassignedPayrolls, 0);
});

test("nova execução do dry-run reflete a decisão do operador sem apagar o legado", () => {
  const input = {
    organizationId,
    payrolls: [payroll("payroll-1", "Grupo sem catalogo")],
    groups: [group("group-target", "Grupo catalogado")],
  };
  const beforeResolution = buildPessoalGroupMigrationPlan({ ...input, mappings: [] });
  const afterResolution = buildPessoalGroupMigrationPlan({
    ...input,
    mappings: [
      {
        organizationId,
        legacyValue: "Grupo sem catalogo",
        normalizedValue: "grupo sem catalogo",
        groupId: "group-target",
        mappedAt: new Date("2026-09-15T12:00:00Z"),
        mappedById: "operator-1",
      },
    ],
  });

  assert.equal(beforeResolution.quarantine[0].reason, "UNMAPPED_LEGACY_GROUP");
  assert.equal(afterResolution.quarantine.length, 0);
  assert.equal(afterResolution.ready[0].legacyValue, "Grupo sem catalogo");
  assert.equal(afterResolution.ready[0].groupId, "group-target");
});

test("conflito de catálogo fica em quarentena em vez de escolher um grupo", () => {
  const plan = buildPessoalGroupMigrationPlan({
    organizationId,
    payrolls: [payroll("payroll-1", "Duplicado")],
    groups: [group("group-1", "Duplicado"), group("group-2", "Duplicado")],
    mappings: [],
  });

  assert.equal(plan.ready.length, 0);
  assert.equal(plan.quarantine[0].reason, "AMBIGUOUS_CANONICAL_GROUP");
});

test("normalização mantém a chave de mapeamento estável para espaço, caixa e acentos", () => {
  assert.equal(normalizePessoalGroupMigrationValue("  ÁREA   Pessoal "), "area pessoal");
});
