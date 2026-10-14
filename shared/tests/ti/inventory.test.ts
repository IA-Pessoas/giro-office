import assert from "node:assert/strict";
import test from "node:test";

import {
  activeComputerLockKey,
  hasTiCatalogNameConflict,
  hasUserWithSeveralActiveAssets,
  isComputerCategoryName,
  tiCatalogNameToCheck,
} from "../../src/ti/inventory.ts";

test("reconhece a categoria canônica Computador sem depender de caixa, acento ou espaços (#1931)", () => {
  for (const name of ["Computador", " computador ", "COMPUTADOR", "Cômputador"]) {
    assert.equal(isComputerCategoryName(name), true, name);
  }
  for (const name of ["Computadores", "Notebook", "Monitor", "", null, undefined, 3]) {
    assert.equal(isComputerCategoryName(name), false, String(name));
  }
});

test("detecta pessoa com mais de um item ativo da categoria (#1931)", () => {
  assert.equal(hasUserWithSeveralActiveAssets([]), false);
  assert.equal(hasUserWithSeveralActiveAssets([{ user_id: "a" }, { user_id: "b" }]), false);
  assert.equal(
    hasUserWithSeveralActiveAssets([{ user_id: "a" }, { user_id: "b" }, { user_id: "a" }]),
    true,
  );
});

test("nome de catálogo repetido ignora caixa, acento e espaços, e o próprio registro (#1937)", () => {
  const rows = [
    { id: "a", name: "Sala  de Reunião" },
    { id: "b", name: "Almoxarifado" },
  ];
  assert.equal(hasTiCatalogNameConflict(rows, " sala de reuniao "), true);
  assert.equal(hasTiCatalogNameConflict(rows, "Sala de Reunião", "a"), false);
  assert.equal(hasTiCatalogNameConflict(rows, "Almoxarifado", "a"), true);
  assert.equal(hasTiCatalogNameConflict(rows, "Recepção"), false);
});

test("edição de catálogo só confere o nome quando renomeia ou reativa (#1937)", () => {
  const active = { name: "Sala A", active: true };
  const inactive = { name: "Sala A", active: false };
  assert.equal(tiCatalogNameToCheck(active, { name: "Sala B" }), "Sala B");
  // Mesmo nome com outra caixa não é renomear para outro registro.
  assert.equal(tiCatalogNameToCheck(active, { name: "SALA A" }), null);
  assert.equal(tiCatalogNameToCheck(active, { active: false }), null);
  assert.equal(tiCatalogNameToCheck(active, { name: "Sala B", active: false }), null);
  assert.equal(tiCatalogNameToCheck(inactive, { active: true }), "Sala A");
  assert.equal(tiCatalogNameToCheck(inactive, { name: "Sala B" }), null);
  assert.equal(tiCatalogNameToCheck(inactive, { name: "Sala B", active: true }), "Sala B");
});

test("a chave de bloqueio separa organizações e pessoas (#1931)", () => {
  assert.equal(activeComputerLockKey("org-1", "user-1"), activeComputerLockKey("org-1", "user-1"));
  assert.notEqual(
    activeComputerLockKey("org-1", "user-1"),
    activeComputerLockKey("org-2", "user-1"),
  );
  assert.notEqual(
    activeComputerLockKey("org-1", "user-1"),
    activeComputerLockKey("org-1", "user-2"),
  );
});
