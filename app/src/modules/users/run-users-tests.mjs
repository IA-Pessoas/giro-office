import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

import {
  KNOWN_PERMISSION_MODULE_KEYS,
  PERMISSION_MODULE_GROUPS,
  PERMISSION_MODULE_LABELS,
  getMinimumPermissionLevel,
  getPermissionSelectOptions,
  normalizePermissionForModule,
} from "./constants/permissionConfig.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "../constants/permissionConfig" &&
      (context.parentURL?.endsWith("/modules/users/utils/permissionUtils.ts") ||
        context.parentURL?.endsWith("/modules/users/utils/createUserPayload.ts"))
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const {
  buildAdminCreateUserPayload,
  buildCreateUserModulesPayload,
  buildDepartmentPermissionSyncPayload,
  needsDepartmentPermissionSync,
  resolveCreateUserTopLevelPermission,
  resolveCreateUserType,
} = await import("./utils/createUserPayload.ts");

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

function expectedModules(overrides = {}) {
  return Object.fromEntries(
    KNOWN_PERMISSION_MODULE_KEYS.map((moduleKey) => [moduleKey, overrides[moduleKey] ?? 0]),
  );
}

const createUserModalSource = readFileSync(
  new URL("./components/CreateUserModal.tsx", import.meta.url),
  "utf8",
);
const adminUserDetailsPanelSource = readFileSync(
  new URL("./components/AdminUserDetailsPanel.tsx", import.meta.url),
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

function extractClassConstant(source, constantName) {
  const match = source.match(new RegExp(`const ${constantName} =\\s*\\n\\s*"([^"]+)";`));

  return match?.[1] ?? "";
}

runTest("create user password visibility control remains explicit and accessible", () => {
  assert.match(createUserModalSource, /const \[isPasswordVisible, setIsPasswordVisible\] = useState\(false\);/);
  assert.match(createUserModalSource, /aria-label=\{isPasswordVisible \? 'Ocultar senha' : 'Mostrar senha'\}/);
  assert.match(createUserModalSource, /aria-pressed=\{isPasswordVisible\}/);
  assert.match(createUserModalSource, /type=\{isPasswordVisible \? 'text' : 'password'\}/);
  assert.match(createUserModalSource, /autoComplete="new-password"/);
});

runTest("retired department modules are never sent by create-user payloads", () => {
  const modules = buildCreateUserModulesPayload({}, null, 1);

  for (const retiredKey of ["atendimento", "pec", "wiki"]) {
    assert.equal(Object.hasOwn(modules, retiredKey), false);
  }
});

runTest("RH and Technology define Viewer as their frontend minimum", () => {
  assert.equal(getMinimumPermissionLevel("rh"), 0);
  assert.equal(getMinimumPermissionLevel("ti"), 0);
  assert.equal(getMinimumPermissionLevel("fiscal"), null);
});

runTest("module options expose the complete 0-3 matrix", () => {
  assert.deepEqual(
    getPermissionSelectOptions("rh").map((option) => option.value),
    ["0", "1", "2", "3"],
  );
  assert.deepEqual(
    getPermissionSelectOptions("ti").map((option) => option.value),
    ["0", "1", "2", "3"],
  );
  assert.deepEqual(
    getPermissionSelectOptions("fiscal").map((option) => option.value),
    ["0", "1", "2", "3"],
  );
});

runTest("module permission normalization maps invalid values to no access", () => {
  assert.equal(normalizePermissionForModule("rh", null), 0);
  assert.equal(normalizePermissionForModule("ti", undefined), 0);
  assert.equal(normalizePermissionForModule("rh", 1), 1);
  assert.equal(normalizePermissionForModule("ti", 2), 2);
  assert.equal(normalizePermissionForModule("fiscal", null), 0);
  assert.equal(normalizePermissionForModule("fiscal", 1), 1);
});

runTest("missing and legacy module values normalize to zero", () => {
  const response = normalizePermissionResponse({
    rh: null,
    ti: null,
    fiscal: null,
  });

  assert.equal(response.known.rh, 0);
  assert.equal(response.known.ti, 0);
  assert.equal(response.known.fiscal, 0);

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

runTest("legacy null values are detected for normalization", () => {
  for (const moduleKey of ["rh", "ti"]) {
    const rawPermissions = {
      [moduleKey]: null,
    };
    const response = normalizePermissionResponse(rawPermissions);
    const draft = normalizePermissionDraft({
      ...response.known,
      ...response.extras,
    });
    const snapshot = freezePermissionSnapshot(draft);

    const isDirty =
      !arePermissionDraftsEqual(draft, snapshot) ||
      needsDepartmentPermissionSync(
        moduleKey,
        draft,
        { permission: -1, type: "user" },
        rawPermissions,
      );

    assert.equal(isDirty, true);
  }
});

runTest("persisted Viewer still detects stale RH or Technology department sync", () => {
  for (const moduleKey of ["rh", "ti"]) {
    const rawPermissions = {
      [moduleKey]: 0,
    };
    const response = normalizePermissionResponse(rawPermissions);
    const draft = normalizePermissionDraft({
      ...response.known,
      ...response.extras,
    });
    const snapshot = freezePermissionSnapshot(draft);

    const isDirty =
      !arePermissionDraftsEqual(draft, snapshot) ||
      needsDepartmentPermissionSync(
        moduleKey,
        draft,
        { permission: -1, type: "user" },
        rawPermissions,
      );

    assert.equal(isDirty, true);
  }
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
  assert.equal(payload.fiscal, 0);
  assert.equal(payload.contabil, 2);
});

runTest("retired PEC, Atendimento and Wiki modules are absent from every user permission UI config", () => {
  const retiredKeys = ["pec", "atendimento", "wiki"];

  for (const retiredKey of retiredKeys) {
    assert.equal(KNOWN_PERMISSION_MODULE_KEYS.includes(retiredKey), false);
    assert.equal(Object.hasOwn(PERMISSION_MODULE_LABELS, retiredKey), false);
    assert.equal(PERMISSION_MODULE_GROUPS.flatMap((group) => group.keys).includes(retiredKey), false);
    assert.equal(createUserConfigSource.includes(`key: "${retiredKey}"`), false);
    assert.equal(userTypesSource.includes(`| "${retiredKey}"`), false);
  }
});

runTest("retired permission modules from a legacy response are never re-sent as extras", () => {
  const normalization = normalizePermissionResponse({
    atendimento: 1,
    pec: 2,
    wiki: 0,
    custom_module: 1,
  });
  const payload = buildPermissionUpdatePayload(
    { ...normalization.known, ...normalization.extras },
    Object.keys(normalization.extras),
  );

  assert.deepEqual(normalization.extras, { custom_module: 1 });
  assert.equal(Object.hasOwn(payload, "atendimento"), false);
  assert.equal(Object.hasOwn(payload, "pec"), false);
  assert.equal(Object.hasOwn(payload, "wiki"), false);
  assert.equal(payload.custom_module, 1);
});

runTest("create user additional modules include active services", () => {
  assert.equal(createUserConfigSource.includes('key: "comercial"'), true);
  assert.equal(createUserConfigSource.includes('key: "financeiro"'), true);
});

runTest("admin permissions include finance in the Fiscal group", () => {
  assert.equal(permissionConfigSource.includes('"financeiro"'), true);
  assert.equal(permissionConfigSource.includes('financeiro: "Financeiro"'), true);
  assert.equal(permissionConfigSource.includes('title: "Financeiro e Fiscal"'), false);
  assert.equal(permissionConfigSource.includes('title: "Fiscal"'), true);
  assert.equal(userTypesSource.includes('| "financeiro"'), true);
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
    modules: expectedModules({ rh: 2, comercial: 1, ti: 1 }),
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
    modules: expectedModules({ rh: 2, comercial: 1, ti: 1 }),
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
    expectedModules({ rh: 2, ti: 1 }),
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
    expectedModules({ fiscal: 1, rh: 1, ti: 1 }),
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
    expectedModules({ fiscal: 1, rh: 2, ti: 2 }),
  );
});

runTest("Viewer creation payload includes RH and Technology at Viewer minimum", () => {
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
    expectedModules(),
  );
});

runTest("create user UI consumes minimum-aware defaults and options", () => {
  assert.match(
    createUserModalSource,
    /getMinimumPermissionLevel\(moduleOption\.key\)/,
  );
  assert.match(
    createUserModalSource,
    /getPermissionSelectOptions\(moduleOption\.key\)\.map/,
  );
  assert.match(
    createUserModalSource,
    /normalizePermissionForModule\(moduleKey,/,
  );
  assert.match(createUserModalSource, /CREATE_MODULE_OPTION_LABELS/);
  assert.equal(
    createUserModalSource.includes('<option value="none">Sem acesso</option>'),
    false,
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

runTest("admin user password update asks for explicit confirmation", () => {
  const dialogStart = adminUserDetailsPanelSource.indexOf("<Dialog");
  const dialogEnd = adminUserDetailsPanelSource.indexOf("</Dialog>", dialogStart);
  const dialogSource = adminUserDetailsPanelSource.slice(dialogStart, dialogEnd);
  const confirmHandlerBody = adminUserDetailsPanelSource.match(
    /const handleConfirmPasswordUpdate = async \(\) => \{[\s\S]*?\n  \};/,
  )?.[0] ?? "";

  assert.match(adminUserDetailsPanelSource, /import \{ Dialog \} from "@shared\/components\/ui\/Dialog";/);
  assert.match(adminUserDetailsPanelSource, /isPasswordConfirmationOpen/);
  assert.match(adminUserDetailsPanelSource, /Confirmar alteração de senha/);
  assert.match(adminUserDetailsPanelSource, /A senha do usuário selecionado será alterada/);
  assert.doesNotMatch(adminUserDetailsPanelSource, /O valor digitado não será exibido nesta confirmação/);
  assert.match(adminUserDetailsPanelSource, /!w-\[min\(92vw,520px\)\]/);
  assert.match(adminUserDetailsPanelSource, /!rounded-lg/);
  assert.match(adminUserDetailsPanelSource, /bodyClassName="!px-4 !py-3"/);
  assert.match(dialogSource, /onClick=\{\(\) => setIsPasswordConfirmationOpen\(false\)\}/);
  assert.match(dialogSource, /onClick=\{\(\) => void handleConfirmPasswordUpdate\(\)\}/);
  assert.doesNotMatch(dialogSource, /formData\.password/);
  assert.match(confirmHandlerBody, /await persistUserUpdate\(\)/);
  assert.match(
    adminUserDetailsPanelSource,
    /formData\.password\.trim\(\)[\s\S]*setIsPasswordConfirmationOpen\(true\)[\s\S]*return;/,
  );
});

runTest("admin user details keeps non-password updates direct", () => {
  const handleSaveBody = adminUserDetailsPanelSource.match(
    /const handleSave = async \(\) => \{[\s\S]*?\n  \};/,
  )?.[0] ?? "";

  assert.match(handleSaveBody, /await persistUserUpdate\(\)/);
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
    permission: 0,
    type: "user",
    modules,
  });
});

runTest("department permission sync payload uses zero for no access", () => {
  const modules = {
    rh: null,
    ti: 1,
  };

  assert.deepEqual(buildDepartmentPermissionSyncPayload("rh", modules), {
    permission: 0,
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
  assert.match(
    administracaoSource,
    /needsDepartmentPermissionSync\(\s*selectedPermissionDepartmentModule,\s*normalizedPermissionDraft,\s*selectedPermissionUser,\s*permissionBaseline \?\? undefined,/s,
  );
  assert.match(administracaoSource, /userService\.update\(\s*selectedPermissionUserId/s);
  assert.doesNotMatch(
    administracaoSource,
    /isDepartmentModule \? \(\s*<div/s,
  );
});

runTest("admin permission editor uses module-specific options and normalization", () => {
  assert.match(
    administracaoSource,
    /getPermissionSelectOptions\(moduleKey\)\.map/,
  );
  assert.match(
    administracaoSource,
    /normalizePermissionForModule\(\s*moduleKey,/s,
  );
  assert.doesNotMatch(
    administracaoSource,
    /\{PERMISSION_SELECT_OPTIONS\.map\(\(option\) => \(/,
  );
});

runTest("administration neutral panels avoid stacked borders", () => {
  const panelClassName = extractClassConstant(administracaoSource, "ADMIN_PANEL_CLASSNAME");
  const subpanelClassName = extractClassConstant(administracaoSource, "ADMIN_SUBPANEL_CLASSNAME");
  const feedbackClassName = extractClassConstant(
    administracaoSource,
    "ADMIN_FEEDBACK_PANEL_CLASSNAME",
  );

  assert.match(panelClassName, /rounded-3xl/);
  assert.match(subpanelClassName, /bg-slate-50\/70/);
  assert.match(feedbackClassName, /p-4/);
  assert.doesNotMatch(panelClassName, /\bborder\b/);
  assert.doesNotMatch(subpanelClassName, /\bborder\b/);
  assert.doesNotMatch(feedbackClassName, /\bborder\b/);
  assert.doesNotMatch(administracaoSource, /\$\{ADMIN_FEEDBACK_PANEL_CLASSNAME\} border-dashed/);
});

runTest("admin user details panels avoid stacked borders while keeping empty states clear", () => {
  const panelClassName = extractClassConstant(adminUserDetailsPanelSource, "PANEL_CLASSNAME");
  const feedbackClassName = extractClassConstant(
    adminUserDetailsPanelSource,
    "FEEDBACK_PANEL_CLASSNAME",
  );

  assert.match(panelClassName, /rounded-2xl/);
  assert.match(feedbackClassName, /p-4/);
  assert.doesNotMatch(panelClassName, /\bborder\b/);
  assert.doesNotMatch(feedbackClassName, /\bborder\b/);
  assert.doesNotMatch(adminUserDetailsPanelSource, /\$\{PANEL_CLASSNAME\} border-dashed/);
  assert.match(adminUserDetailsPanelSource, /border border-dashed border-slate-300/);
});

runTest("create user modal discloses required account fields", () => {
  const source = readFileSync("src/modules/users/components/CreateUserModal.tsx", "utf8");

  assert.match(source, /RequiredFieldLabel/);
  assert.match(source, /aria-required/);
  assert.match(source, /htmlFor="user-department"/);
});
