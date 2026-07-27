import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

import {
  buildAdminCreateUserPayload,
  buildCreateUserModulesPayload,
  buildDepartmentPermissionSyncPayload,
  needsDepartmentPermissionSync,
  resolveCreateUserTopLevelPermission,
  resolveCreateUserType,
} from "./utils/createUserPayload.ts";
import {
  getMinimumPermissionLevel,
  getPermissionSelectOptions,
  normalizePermissionForModule,
} from "./constants/permissionConfig.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "../constants/permissionConfig" &&
      context.parentURL?.endsWith("/modules/users/utils/permissionUtils.ts")
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const {
  arePermissionDraftsEqual,
  buildPermissionUpdatePayload,
  freezePermissionSnapshot,
  normalizePermissionDraft,
  normalizePermissionResponse,
} = await import("./utils/permissionUtils.ts");

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

runTest("RH and Technology define Viewer as their frontend minimum", () => {
  assert.equal(getMinimumPermissionLevel("rh"), 0);
  assert.equal(getMinimumPermissionLevel("ti"), 0);
  assert.equal(getMinimumPermissionLevel("fiscal"), null);
});

runTest("minimum module options omit no access and preserve higher levels", () => {
  assert.deepEqual(
    getPermissionSelectOptions("rh").map((option) => option.value),
    ["0", "1", "2"],
  );
  assert.deepEqual(
    getPermissionSelectOptions("ti").map((option) => option.value),
    ["0", "1", "2"],
  );
  assert.deepEqual(
    getPermissionSelectOptions("fiscal").map((option) => option.value),
    ["null", "0", "1", "2"],
  );
});

runTest("module permission normalization changes only values below a configured minimum", () => {
  assert.equal(normalizePermissionForModule("rh", null), 0);
  assert.equal(normalizePermissionForModule("ti", undefined), 0);
  assert.equal(normalizePermissionForModule("rh", 1), 1);
  assert.equal(normalizePermissionForModule("ti", 2), 2);
  assert.equal(normalizePermissionForModule("fiscal", null), null);
  assert.equal(normalizePermissionForModule("fiscal", 1), 1);
});

runTest("legacy RH and Technology no-access values normalize to Viewer", () => {
  const response = normalizePermissionResponse({
    rh: null,
    ti: null,
    fiscal: null,
  });

  assert.equal(response.known.rh, 0);
  assert.equal(response.known.ti, 0);
  assert.equal(response.known.fiscal, null);

  const missingDraft = normalizePermissionDraft({});
  assert.equal(missingDraft.rh, 0);
  assert.equal(missingDraft.ti, 0);
});

runTest("normalized legacy permissions do not become dirty solely on load", () => {
  const draft = normalizePermissionDraft({
    rh: null,
    ti: null,
    fiscal: null,
  });
  const snapshot = freezePermissionSnapshot(draft);

  assert.equal(arePermissionDraftsEqual(draft, snapshot), true);
});

runTest("permission update payload enforces only RH and Technology minimums", () => {
  const payload = buildPermissionUpdatePayload({
    rh: null,
    ti: null,
    fiscal: null,
    contabil: 2,
  });

  assert.equal(payload.rh, 0);
  assert.equal(payload.ti, 0);
  assert.equal(payload.fiscal, null);
  assert.equal(payload.contabil, 2);
});

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

runTest("eligible non-RH user receives RH and TI self-service by default", () => {
  assert.deepEqual(
    buildCreateUserModulesPayload(
      {
        rh: { enabled: false, level: 0 },
        ti: { enabled: false, level: 0 },
        fiscal: { enabled: false, level: 0 },
      },
      "fiscal",
      1,
    ),
    {
      fiscal: 1,
      rh: 1,
      ti: 1,
    },
  );
});

runTest("explicit RH and TI management are preserved on user creation", () => {
  assert.deepEqual(
    buildCreateUserModulesPayload(
      {
        rh: { enabled: true, level: 2 },
        ti: { enabled: true, level: 2 },
        fiscal: { enabled: false, level: 0 },
      },
      "fiscal",
      1,
    ),
    {
      fiscal: 1,
      rh: 2,
      ti: 2,
    },
  );
});

runTest("viewer does not receive RH or TI self-service by default", () => {
  assert.deepEqual(
    buildCreateUserModulesPayload(
      {
        rh: { enabled: false, level: 0 },
        ti: { enabled: false, level: 0 },
        fiscal: { enabled: false, level: 0 },
      },
      "fiscal",
      0,
    ),
    {
      fiscal: 0,
    },
  );
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
