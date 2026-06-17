import assert from "node:assert/strict";

import {
  filterAssignableRhResponsibleUsers,
  isAssignableRhResponsibleUser,
} from "./utils/rhAssignableUsers.ts";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function createUser(overrides = {}) {
  return {
    id: "user-default",
    name: "Usuário Default",
    status: "active",
    permission: 1,
    departmentName: "Financeiro",
    modules: { rh: 1 },
    ...overrides,
  };
}

await (async () => {
  await runTest("RH responsible list keeps only active RH-capable users", () => {
    const users = [
      createUser({ id: "employee", name: "Colaborador", modules: { rh: 1 } }),
      createUser({
        id: "rh-dept",
        name: "Pessoa RH",
        departmentName: "Recursos Humanos",
        modules: null,
      }),
      createUser({ id: "rh-manager", name: "Gestor RH", modules: { rh: 2 } }),
      createUser({ id: "admin", name: "Admin Global", permission: 2, modules: { rh: null } }),
      createUser({
        id: "inactive-rh",
        name: "RH Inativo",
        status: "inactive",
        departmentName: "Recursos Humanos",
        modules: { rh: 2 },
      }),
    ];

    assert.deepEqual(
      filterAssignableRhResponsibleUsers(users).map((user) => user.id),
      ["rh-dept", "rh-manager", "admin"],
    );
  });

  await runTest("RH responsible predicate rejects visualizer and self-service RH users", () => {
    assert.equal(isAssignableRhResponsibleUser(createUser({ modules: { rh: 0 } })), false);
    assert.equal(isAssignableRhResponsibleUser(createUser({ modules: { rh: 1 } })), false);
  });

  await runTest("RH responsible predicate accepts active RH department fallback", () => {
    assert.equal(
      isAssignableRhResponsibleUser(
        createUser({ departmentName: "Recursos Humanos", modules: null }),
      ),
      true,
    );
  });
})();
