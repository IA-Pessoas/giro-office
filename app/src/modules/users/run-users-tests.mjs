import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildAdminCreateUserPayload,
  buildCreateUserModulesPayload,
  buildDepartmentPermissionSyncPayload,
  needsDepartmentPermissionSync,
  resolveCreateUserTopLevelPermission,
  resolveCreateUserType,
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

const baseFormData = {
  name: "Johan",
  login: "johan",
  password: "secret",
  department_id: "dept-rh",
  departmentPermission: 2,
  isOrganizationOwner: false,
};

const createUserModalSource = readFileSync(
  new URL("./components/CreateUserModal.tsx", import.meta.url),
  "utf8",
);
const createUserConfigSource = readFileSync(
  new URL("./constants/createUserConfig.ts", import.meta.url),
  "utf8",
);
const permissionConfigSource = readFileSync(
  new URL("./constants/permissionConfig.ts", import.meta.url),
  "utf8",
);
const userTypesSource = readFileSync(new URL("./types/index.ts", import.meta.url), "utf8");

runTest("create user additional modules hide unavailable services", () => {
  assert.equal(createUserConfigSource.includes('key: "comercial"'), false);
  assert.equal(createUserConfigSource.includes('key: "financeiro"'), false);
});

runTest("admin permissions hide finance and use the Fiscal group title", () => {
  assert.equal(permissionConfigSource.includes('"financeiro"'), false);
  assert.equal(permissionConfigSource.includes('financeiro: "Financeiro"'), false);
  assert.equal(permissionConfigSource.includes('title: "Financeiro e Fiscal"'), false);
  assert.equal(permissionConfigSource.includes('title: "Fiscal"'), true);
  assert.equal(userTypesSource.includes('| "financeiro"'), false);
});

runTest("department admin is not created as organization owner", () => {
  const payload = buildAdminCreateUserPayload({
    formData: baseFormData,
    moduleSelections: {
      rh: { enabled: false, level: 0 },
      comercial: { enabled: true, level: 1 },
      financeiro: { enabled: false, level: 0 },
    },
    departmentModuleKey: "rh",
    organizationId: "org-1",
    invitedBy: "owner-1",
  });

  assert.deepEqual(payload, {
    name: "Johan",
    login: "johan",
    password: "secret",
    department_id: "dept-rh",
    permission: 1,
    organization_id: "org-1",
    type: "admin",
    status: "active",
    modules: {
      rh: 2,
      comercial: 1,
      ti: 1,
    },
    invited_by: "owner-1",
  });
});

runTest("organization owner keeps owner type and lets backend grant all modules", () => {
  const payload = buildAdminCreateUserPayload({
    formData: {
      ...baseFormData,
      isOrganizationOwner: true,
    },
    moduleSelections: {
      rh: { enabled: true, level: 2 },
      comercial: { enabled: true, level: 1 },
    },
    departmentModuleKey: "rh",
    organizationId: "org-1",
    canCreateOrganizationOwner: true,
  });

  assert.equal(payload.permission, 2);
  assert.equal(payload.type, "owner");
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "modules"), false);
});

runTest("non-owner creator cannot build organization owner payload", () => {
  const payload = buildAdminCreateUserPayload({
    formData: {
      ...baseFormData,
      isOrganizationOwner: true,
    },
    moduleSelections: {
      rh: { enabled: false, level: 0 },
      comercial: { enabled: true, level: 1 },
    },
    departmentModuleKey: "rh",
    organizationId: "org-1",
    canCreateOrganizationOwner: false,
  });

  assert.deepEqual(payload, {
    name: "Johan",
    login: "johan",
    password: "secret",
    department_id: "dept-rh",
    permission: 1,
    organization_id: "org-1",
    type: "admin",
    status: "active",
    modules: {
      rh: 2,
      comercial: 1,
      ti: 1,
    },
  });
});

runTest("department module permission is always explicit for non-owner users", () => {
  assert.deepEqual(
    buildCreateUserModulesPayload(
      {
        rh: { enabled: false, level: 0 },
        fiscal: { enabled: true, level: 0 },
      },
      "rh",
      2,
    ),
    {
      rh: 2,
      fiscal: 0,
      ti: 1,
    },
  );
});

runTest("create user modules provision TI self-service for eligible users", () => {
  assert.equal(buildCreateUserModulesPayload({}, "fiscal", 1).ti, 1);
  assert.equal(
    buildCreateUserModulesPayload({ ti: { enabled: true, level: 2 } }, "fiscal", 1).ti,
    2,
  );
  assert.equal(buildCreateUserModulesPayload({}, "fiscal", 0).ti, undefined);
});

runTest("top-level permission no longer promotes department admin to global admin", () => {
  assert.equal(resolveCreateUserTopLevelPermission(0, false), 0);
  assert.equal(resolveCreateUserTopLevelPermission(1, false), 1);
  assert.equal(resolveCreateUserTopLevelPermission(2, false), 1);
  assert.equal(resolveCreateUserTopLevelPermission(2, true), 2);
});

runTest("user type is owner only when organization owner is explicit", () => {
  assert.equal(resolveCreateUserType(0, false), "user");
  assert.equal(resolveCreateUserType(1, false), "admin");
  assert.equal(resolveCreateUserType(2, false), "admin");
  assert.equal(resolveCreateUserType(2, true), "owner");
});

runTest("create user modal separates department permission from organization owner", () => {
  assert.match(createUserModalSource, /canCreateOrganizationOwner/);
  assert.match(createUserModalSource, /effectiveIsOrganizationOwner/);
  assert.match(createUserModalSource, /md:grid-cols-\[minmax\(0,1fr\)_196px_160px\]/);
  assert.match(createUserModalSource, /isOrganizationOwner/);
  assert.match(createUserModalSource, /buildAdminCreateUserPayload/);
  assert.equal(createUserModalSource.includes("CREATE_USER_OWNER_OPTIONS"), false);
  assert.equal(createUserModalSource.includes("getUserTypeFromPermission"), false);
  assert.equal(createUserModalSource.includes("disabled={formData.permission === 2}"), false);
});

runTest("organization owner scope field uses a checkbox toggle", () => {
  const ownerScopeIdIndex = createUserModalSource.indexOf('id="user-owner-scope"');
  const ownerScopeControlStart = createUserModalSource.lastIndexOf("<input", ownerScopeIdIndex);
  const ownerScopeControlEnd = createUserModalSource.indexOf("/>", ownerScopeIdIndex);
  const ownerScopeControl = createUserModalSource.slice(
    ownerScopeControlStart,
    ownerScopeControlEnd + "/>".length,
  );

  assert.notEqual(ownerScopeIdIndex, -1);
  assert.match(ownerScopeControl, /type="checkbox"/);
  assert.match(ownerScopeControl, /checked=\{effectiveIsOrganizationOwner\}/);
  assert.match(ownerScopeControl, /h-4 w-4/);
  assert.match(createUserModalSource, /className="flex h-full flex-col justify-end"/);
  assert.match(createUserModalSource, /className="flex h-\[42px\] items-center justify-center gap-3"/);
  assert.match(createUserModalSource, /className=\{`\$\{FIELD_LABEL_CLASSNAME\} mb-0`\}/);
  assert.equal(createUserModalSource.includes('name="isOrganizationOwner"'), false);
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
