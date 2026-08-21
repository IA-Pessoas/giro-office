import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

import { canAccessRoute } from "../src/auth/policy.ts";
import { authenticateFromToken } from "../src/auth/token.ts";
import type { AuthContext } from "../src/auth/types.ts";

const JWT_SECRET = "platform-auth-test-secret";

function platformToken(claims: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      user_id: "platform-admin-1",
      auth_kind: "platform",
      platform_role: "super_admin",
      ...claims,
    },
    JWT_SECRET,
  );
}

function organizationContext(): AuthContext {
  return {
    token: "organization-token",
    userId: "organization-user-1",
    organizationId: "org-1",
    actorKind: "organization",
    isPlatformAdmin: false,
    claims: { user_id: "organization-user-1", organization_id: "org-1" },
  };
}

test("platform principal cannot inherit organization permissions", () => {
  const context = authenticateFromToken(
    platformToken({
      organization_id: "forged-org",
      permission: 3,
      type: "owner",
      modules: { rh: 3 },
    }),
    JWT_SECRET,
  );

  assert.equal(context.actorKind, "platform");
  assert.equal(context.organizationId, "");
  assert.equal(context.isPlatformAdmin, true);
  assert.equal(canAccessRoute(context, { special: "platformOnly" }), true);
  assert.equal(canAccessRoute(context, { special: "ownerOnly" }), false);
  assert.equal(
    canAccessRoute(context, { modulePermission: { module: "rh", minPermission: 1 } }),
    false,
  );
});

test("organization principal cannot satisfy platformOnly", () => {
  assert.equal(canAccessRoute(organizationContext(), { special: "platformOnly" }), false);
});
