import assert from "node:assert/strict";
import test from "node:test";

import { canAccessRoute } from "../src/auth/policy.ts";
import type { AuthContext, AuthPolicy } from "../src/auth/types.ts";

function authContext(claims: AuthContext["claims"]): AuthContext {
  return {
    token: "token",
    userId: claims.user_id,
    organizationId: claims.organization_id ?? "org-1",
    claims,
  };
}

test("manageUsers permite owner explicito", () => {
  const policy: AuthPolicy = { special: "manageUsers" };

  assert.equal(
    canAccessRoute(
      authContext({ user_id: "owner-1", organization_id: "org-1", permission: 1, type: "owner" }),
      policy,
    ),
    true,
  );
});

test("manageUsers permite admin RH por permissao modular", () => {
  const policy: AuthPolicy = { special: "manageUsers" };

  assert.equal(
    canAccessRoute(
      authContext({
        user_id: "rh-admin",
        organization_id: "org-1",
        permission: 1,
        type: "admin",
        modules: { rh: 2 },
      }),
      policy,
    ),
    true,
  );
});

test("ownerOnly bloqueia admin departamental mesmo com permission 2", () => {
  const policy: AuthPolicy = { special: "ownerOnly" };

  assert.equal(
    canAccessRoute(
      authContext({
        user_id: "dept-admin",
        organization_id: "org-1",
        permission: 2,
        type: "admin",
        modules: { contabil: 2 },
      }),
      policy,
    ),
    false,
  );
});
