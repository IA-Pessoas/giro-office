import assert from "node:assert/strict";
import test from "node:test";

import jwt from "jsonwebtoken";

import { authenticateFromAuthHeader, canAccessRoute } from "../src/auth/index.ts";

const JWT_SECRET = "platform-auth-secret";

function bearerToken(claims: Record<string, unknown>): string {
  return `Bearer ${jwt.sign(claims, JWT_SECRET)}`;
}

test("token platform sem organizacao normaliza como admin de plataforma", () => {
  const context = authenticateFromAuthHeader(
    bearerToken({
      user_id: "platform-user-1",
      auth_kind: "platform",
      platform_role: "super_admin",
    }),
    JWT_SECRET,
  );

  assert.equal(context.actorKind, "platform");
  assert.equal(context.organizationId, "");
  assert.equal(context.isPlatformAdmin, true);
  assert.equal(context.isSupportMode, false);
  assert.equal(context.claims.auth_kind, "platform");
  assert.equal(context.claims.platform_role, "super_admin");
});

test("token platform em suporte usa organizacao alvo como contexto organizacional", () => {
  const context = authenticateFromAuthHeader(
    bearerToken({
      user_id: "platform-user-1",
      auth_kind: "platform",
      platform_role: "super_admin",
      support_mode: true,
      support_session_id: "support-session-1",
      support_organization_id: "target-org-1",
    }),
    JWT_SECRET,
  );

  assert.equal(context.actorKind, "platform");
  assert.equal(context.organizationId, "target-org-1");
  assert.equal(context.supportOrganizationId, "target-org-1");
  assert.equal(context.supportSessionId, "support-session-1");
  assert.equal(context.isPlatformAdmin, true);
  assert.equal(context.isSupportMode, true);
  assert.equal(canAccessRoute(context, { minPermission: 2 }), true);
});

test("platformOnly permite apenas super admin de plataforma", () => {
  const platformContext = authenticateFromAuthHeader(
    bearerToken({
      user_id: "platform-user-1",
      auth_kind: "platform",
      platform_role: "super_admin",
    }),
    JWT_SECRET,
  );
  const organizationContext = authenticateFromAuthHeader(
    bearerToken({
      user_id: "owner-1",
      organization_id: "org-1",
      permission: 2,
      type: "owner",
    }),
    JWT_SECRET,
  );

  assert.equal(canAccessRoute(platformContext, { special: "platformOnly" }), true);
  assert.equal(canAccessRoute(organizationContext, { special: "platformOnly" }), false);
});

test("token platform fora do suporte nao herda permissao organizacional", () => {
  const platformContext = authenticateFromAuthHeader(
    bearerToken({
      user_id: "platform-user-1",
      auth_kind: "platform",
      platform_role: "super_admin",
      permission: 2,
      type: "owner",
      modules: { rh: 2 },
    }),
    JWT_SECRET,
  );

  assert.equal(canAccessRoute(platformContext, { minPermission: 2 }), false);
  assert.equal(canAccessRoute(platformContext, { special: "ownerOnly" }), false);
  assert.equal(canAccessRoute(platformContext, { special: "manageUsers" }), false);
  assert.equal(
    canAccessRoute(platformContext, { modulePermission: { module: "rh", minPermission: 2 } }),
    false,
  );
});

test("token platform com suporte sem sessao nao ativa contexto organizacional", () => {
  const context = authenticateFromAuthHeader(
    bearerToken({
      user_id: "platform-user-1",
      auth_kind: "platform",
      platform_role: "super_admin",
      support_mode: true,
      support_organization_id: "target-org-1",
    }),
    JWT_SECRET,
  );

  assert.equal(context.organizationId, "");
  assert.equal(context.isSupportMode, false);
  assert.equal(context.supportOrganizationId, "target-org-1");
  assert.equal(context.supportSessionId, undefined);
  assert.equal(canAccessRoute(context, { minPermission: 2 }), false);
});
