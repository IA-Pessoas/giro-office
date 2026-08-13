import test from "node:test";
import assert from "node:assert/strict";

import {
  mapLegacyModuleLevel,
  mapLegacyUserStatus,
  REALIGNMENT_USER_TYPE,
  REALIGNMENT_GLOBAL_PERMISSION,
  buildPermissionRealignment,
} from "../lib/permission-realignment.mjs";

test("mapeia níveis gerais de módulo para o padrão novo", () => {
  assert.equal(mapLegacyModuleLevel(0), 0);
  assert.equal(mapLegacyModuleLevel(1), 2);
  assert.equal(mapLegacyModuleLevel(2), 3);
  assert.equal(mapLegacyModuleLevel("1"), 2);
  assert.equal(mapLegacyModuleLevel(-1), null);
  assert.equal(mapLegacyModuleLevel(null), null);
});

test("mapeia níveis excepcionais de RH e Tecnologia", () => {
  assert.equal(mapLegacyModuleLevel(0, { exceptionalDepartment: true }), 1);
  assert.equal(mapLegacyModuleLevel(1, { exceptionalDepartment: true }), 3);
  assert.equal(mapLegacyModuleLevel(2, { exceptionalDepartment: true }), 3);
  assert.equal(mapLegacyModuleLevel(3, { exceptionalDepartment: true }), null);
});

test("converte status do usuário legado para users.status", () => {
  assert.equal(mapLegacyUserStatus("Ativo"), "active");
  assert.equal(mapLegacyUserStatus("Inativo"), "inactive");
  assert.equal(mapLegacyUserStatus("outro"), null);
});

test("define o perfil global de usuário não-admin e não-owner", () => {
  assert.equal(REALIGNMENT_USER_TYPE, "user");
  assert.equal(REALIGNMENT_GLOBAL_PERMISSION, 1);
});

test("aplica exceções por departamento e workspace em Tecnologia", () => {
  const [rh, tecnologia] = buildPermissionRealignment({
    users: [
      { id: 1, departamento_id: 10, status: "Ativo" },
      { id: 2, departamento_id: 20, status: "Inativo" },
    ],
    departments: [
      { id: 10, nome: "RH" },
      { id: 20, nome: "Tecnologia" },
    ],
    moduleRowsByModule: {
      rh: [{ user_id: 1, permissao: 0 }],
    },
    dynamicRows: [{ user_id: 2, modulo: "workspace", referencia: 0, nivel: 2 }],
  });
  assert.equal(rh.modules.rh, 1);
  assert.equal(rh.status, "active");
  assert.equal(tecnologia.modules.ti, 3);
  assert.equal(tecnologia.status, "inactive");
});
