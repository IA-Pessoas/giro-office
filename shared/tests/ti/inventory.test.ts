import assert from "node:assert/strict";
import test from "node:test";

import {
  activeComputerLockKey,
  hasUserWithSeveralActiveAssets,
  isComputerCategoryName,
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
