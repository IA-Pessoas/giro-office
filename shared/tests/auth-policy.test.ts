import assert from "node:assert/strict";
import test from "node:test";

import { canAccessRoute } from "../src/auth/policy.js";
import type { AuthContext, AuthPolicy } from "../src/auth/types.js";

function authContext(claims: AuthContext["claims"]): AuthContext {
  return {
    token: "test-token",
    userId: claims.user_id,
    organizationId: claims.organization_id ?? "org-1",
    claims,
  };
}

const manageUsersPolicy: AuthPolicy = { special: "manageUsers" };
const ownerOnlyPolicy: AuthPolicy = { special: "ownerOnly" };

test("manageUsers permite owner explicito", () => {
  assert.equal(
    canAccessRoute(
      authContext({
        user_id: "owner-1",
        organization_id: "org-1",
        permission: 1,
        type: "owner",
      }),
      manageUsersPolicy,
    ),
    true,
  );
});

test("manageUsers permite admin RH por permissao modular explicita", () => {
  assert.equal(
    canAccessRoute(
      authContext({
        user_id: "rh-admin-1",
        organization_id: "org-1",
        permission: 1,
        type: "admin",
        modules: { rh: 2 },
      }),
      manageUsersPolicy,
    ),
    true,
  );
});

test("manageUsers bloqueia admin de outro modulo", () => {
  assert.equal(
    canAccessRoute(
      authContext({
        user_id: "comercial-admin-1",
        organization_id: "org-1",
        permission: 1,
        type: "admin",
        modules: { comercial: 2 },
      }),
      manageUsersPolicy,
    ),
    false,
  );
});

test("ownerOnly nao permite admin RH", () => {
  assert.equal(
    canAccessRoute(
      authContext({
        user_id: "rh-admin-1",
        organization_id: "org-1",
        permission: 1,
        type: "admin",
        modules: { rh: 2 },
      }),
      ownerOnlyPolicy,
    ),
    false,
  );
});
