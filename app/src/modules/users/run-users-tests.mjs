import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildAdminCreateUserPayload,
  buildDepartmentPermissionSyncPayload,
  buildAdminUpdateUserAccessPayload,
  getEffectivePermission,
  getUserTypeFromPermission,
  needsDepartmentPermissionSync,
} from "./utils/createUserPayload.ts";

const administracaoSource = readFileSync(
  new URL("../../shared/components/newLayout/Administracao.tsx", import.meta.url),
  "utf8",
);

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function createBasePayloadInput(overrides = {}) {
  return {
    name: "Maria Silva",
    login: "maria.silva",
    password: "senha123",
    department_id: "dept-rh",
    permission: 1,
    organizationId: "org-1",
    isOrganizationOwner: false,
    moduleSelections: {
      financeiro: { enabled: true, level: 1 },
      rh: { enabled: true, level: 2 },
      ti: { enabled: false, level: 0 },
    },
    departmentModuleKey: "rh",
    invitedBy: "owner-1",
    ...overrides,
  };
}

runTest("permission 0 creates regular user type", () => {
  assert.equal(getUserTypeFromPermission(0), "user");
  assert.equal(getEffectivePermission(0), 0);
});

runTest("permission 1 creates regular user type", () => {
  assert.equal(getUserTypeFromPermission(1), "user");
  assert.equal(getEffectivePermission(1), 1);
});

runTest("permission 2 creates departmental admin type", () => {
  assert.equal(getUserTypeFromPermission(2), "admin");
  assert.equal(getEffectivePermission(2), 2);
});

runTest("organization owner flag is the only frontend path to owner type", () => {
  assert.equal(getUserTypeFromPermission(0, true), "owner");
  assert.equal(getUserTypeFromPermission(1, true), "owner");
  assert.equal(getUserTypeFromPermission(2, true), "owner");
  assert.equal(getEffectivePermission(0, true), 2);
  assert.equal(getEffectivePermission(1, true), 2);
  assert.equal(getEffectivePermission(2, true), 2);
});

runTest("create payload keeps permission 1 as type user", () => {
  const payload = buildAdminCreateUserPayload(createBasePayloadInput({ permission: 1 }));

  assert.equal(payload.permission, 1);
  assert.equal(payload.type, "user");
  assert.deepEqual(payload.modules, { financeiro: 1 });
});

runTest("create payload keeps permission 2 as departmental admin", () => {
  const payload = buildAdminCreateUserPayload(createBasePayloadInput({ permission: 2 }));

  assert.equal(payload.permission, 2);
  assert.equal(payload.type, "admin");
  assert.deepEqual(payload.modules, { financeiro: 1 });
});

runTest("create payload for organization owner forces permission 2 and omits modules", () => {
  const payload = buildAdminCreateUserPayload(
    createBasePayloadInput({
      permission: 1,
      isOrganizationOwner: true,
    }),
  );

  assert.equal(payload.permission, 2);
  assert.equal(payload.type, "owner");
  assert.equal(Object.hasOwn(payload, "modules"), false);
});

runTest("create payload includes invited_by only when provided", () => {
  const withInvite = buildAdminCreateUserPayload(createBasePayloadInput({ invitedBy: "owner-1" }));
  const withoutInvite = buildAdminCreateUserPayload(
    createBasePayloadInput({ invitedBy: undefined }),
  );

  assert.equal(withInvite.invited_by, "owner-1");
  assert.equal(Object.hasOwn(withoutInvite, "invited_by"), false);
});

runTest("update access payload demotes permission 1 to type user", () => {
  assert.deepEqual(buildAdminUpdateUserAccessPayload(1), {
    permission: 1,
    type: "user",
  });
});

runTest("update access payload keeps permission 2 as admin unless owner flag is set", () => {
  assert.deepEqual(buildAdminUpdateUserAccessPayload(2), {
    permission: 2,
    type: "admin",
  });
  assert.deepEqual(buildAdminUpdateUserAccessPayload(2, true), {
    permission: 2,
    type: "owner",
  });
});

runTest("department permission sync payload mirrors the department module level", () => {
  const modules = {
    rh: 1,
    ti: 2,
    financeiro: null,
  };

  assert.deepEqual(buildDepartmentPermissionSyncPayload("rh", modules), {
    permission: 1,
    type: "user",
    modules,
  });

  assert.deepEqual(buildDepartmentPermissionSyncPayload("ti", { ...modules, ti: 2 }), {
    permission: 2,
    type: "admin",
    modules: { ...modules, ti: 2 },
  });

  assert.deepEqual(buildDepartmentPermissionSyncPayload("financeiro", modules), {
    permission: -1,
    type: "user",
    modules,
  });
});

runTest("department permission sync payload uses denied permission for no access", () => {
  const modules = {
    rh: null,
    ti: 1,
  };

  assert.deepEqual(buildDepartmentPermissionSyncPayload("rh", modules), {
    permission: -1,
    type: "user",
    modules,
  });
});

runTest("department permission sync detects stale global user access", () => {
  const modules = { rh: 1 };

  assert.equal(
    needsDepartmentPermissionSync("rh", modules, { permission: 2, type: "admin" }),
    true,
  );
  assert.equal(
    needsDepartmentPermissionSync("rh", modules, { permission: 1, type: "user" }),
    false,
  );
  assert.equal(
    needsDepartmentPermissionSync("rh", { rh: 2 }, { permission: 1, type: "user" }),
    true,
  );
  assert.equal(needsDepartmentPermissionSync(null, modules, { permission: 2, type: "admin" }), false);
});

runTest("department module remains editable in permissions tab", () => {
  assert.match(
    administracaoSource,
    /const isDepartmentModule = selectedPermissionDepartmentModule === moduleKey;/,
  );
  assert.match(administracaoSource, /buildDepartmentPermissionSyncPayload/);
  assert.match(administracaoSource, /needsDepartmentPermissionSync/);
  assert.match(administracaoSource, /userService\.update\(\s*selectedPermissionUserId/s);
  assert.doesNotMatch(
    administracaoSource,
    /isDepartmentModule \? \(\s*<div/s,
  );
});
