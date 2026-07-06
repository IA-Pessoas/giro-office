import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildAdminCreateUserPayload,
  buildCreateUserModulesPayload,
  resolveCreateUserTopLevelPermission,
  resolveCreateUserType,
} from "./utils/createUserPayload.ts";

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
