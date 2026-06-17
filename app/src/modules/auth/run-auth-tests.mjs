import assert from "node:assert/strict";

import { AuthTokenError } from "../../shared/services/errors/AuthTokenError.ts";
import { canSSRAdmin } from "./utils/canSSRAdmin.ts";
import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
} from "./utils/authCookie.ts";
import { createBearerAuthHeaders, getAuthTokenValue } from "./utils/authHeaders.ts";
import { canAccessAdministration, isAdminPermission } from "./utils/permissions.ts";
import { resolveRhPermissionAccess } from "../rh/hooks/rhPermissionAccess.ts";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

function createSsrContext(token) {
  const headers = {};

  if (token) {
    headers.cookie = `cw.token=${token}`;
  }

  return {
    req: {
      headers,
    },
    res: {
      getHeader() {
        return undefined;
      },
      setHeader() {},
    },
  };
}

await (async () => {
  await runTest("isAdminPermission allows administrative levels from 2 and above", () => {
    assert.equal(isAdminPermission(2), true);
    assert.equal(isAdminPermission(100), true);
    assert.equal(isAdminPermission(500), true);
    assert.equal(isAdminPermission(999), true);
    assert.equal(isAdminPermission(1), false);
    assert.equal(isAdminPermission(0), false);
    assert.equal(isAdminPermission(null), false);
  });

  await runTest("canAccessAdministration accepts both permission values and user-like objects", () => {
    assert.equal(canAccessAdministration(2), true);
    assert.equal(canAccessAdministration(100), true);
    assert.equal(canAccessAdministration(1), false);
    assert.equal(canAccessAdministration({ permission: 2 }), true);
    assert.equal(canAccessAdministration({ permission: 999 }), true);
    assert.equal(canAccessAdministration({ permission: 1 }), false);
    assert.equal(canAccessAdministration(undefined), false);
  });

  await runTest("RH access treats module level 1 as self-service only", () => {
    const access = resolveRhPermissionAccess({
      hasUser: true,
      permission: 1,
      rh: 1,
      departmentModule: null,
    });

    assert.equal(access.canUseRhSelfService, true);
    assert.equal(access.canManageRh, false);
  });

  await runTest("RH access does not allow self-service without explicit module access", () => {
    const access = resolveRhPermissionAccess({
      hasUser: true,
      permission: 1,
      rh: null,
      departmentModule: null,
    });

    assert.equal(access.canUseRhSelfService, false);
    assert.equal(access.canManageRh, false);
  });

  await runTest("RH access treats module level 2 as management", () => {
    const access = resolveRhPermissionAccess({
      hasUser: true,
      permission: 1,
      rh: 2,
      departmentModule: null,
    });

    assert.equal(access.canUseRhSelfService, true);
    assert.equal(access.canManageRh, true);
  });

  await runTest("RH access lets global admins manage RH", () => {
    const access = resolveRhPermissionAccess({
      hasUser: true,
      permission: 2,
      rh: 0,
      departmentModule: null,
    });

    assert.equal(access.canUseRhSelfService, true);
    assert.equal(access.canManageRh, true);
  });

  await runTest("RH access does not grant management from department alone", () => {
    const access = resolveRhPermissionAccess({
      hasUser: true,
      permission: 1,
      rh: 1,
      departmentModule: "rh",
    });

    assert.equal(access.canUseRhSelfService, true);
    assert.equal(access.canManageRh, false);
  });

  await runTest("canSSRAdmin redirects unauthenticated users to login", async () => {
    const guard = canSSRAdmin(async () => ({ props: { ok: true } }));
    const result = await guard(createSsrContext());

    assert.deepEqual(result, {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    });
  });

  await runTest("canSSRAdmin redirects non-admin users to dashboard without executing the page", async () => {
    let called = false;
    const guard = canSSRAdmin(async () => {
      called = true;
      return { props: { ok: true } };
    });

    const result = await guard(createSsrContext(createToken({ permission: 1 })));

    assert.equal(called, false);
    assert.deepEqual(result, {
      redirect: {
        destination: "/dashboard",
        permanent: false,
      },
    });
  });

  await runTest("canSSRAdmin can render a forbidden state instead of redirecting", async () => {
    const guard = canSSRAdmin(
      async () => ({ props: { ok: true } }),
      {
        onForbidden: () => ({ props: { forbidden: true } }),
      },
    );

    const result = await guard(createSsrContext(createToken({ permission: 1 })));

    assert.deepEqual(result, { props: { forbidden: true } });
  });

  await runTest("canSSRAdmin allows admin users through", async () => {
    const guard = canSSRAdmin(async () => ({ props: { ok: true } }));
    const result = await guard(createSsrContext(createToken({ permission: 2 })));

    assert.deepEqual(result, { props: { ok: true } });
  });

  await runTest("canSSRAdmin allows high-permission admins through", async () => {
    const guard = canSSRAdmin(async () => ({ props: { ok: true } }));
    const result = await guard(createSsrContext(createToken({ permission: 999 })));

    assert.deepEqual(result, { props: { ok: true } });
  });

  await runTest("canSSRAdmin redirects auth-token failures to login", async () => {
    const guard = canSSRAdmin(async () => {
      throw new AuthTokenError();
    });

    const result = await guard(createSsrContext(createToken({ permission: 2 })));

    assert.deepEqual(result, {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    });
  });

  await runTest("canSSRAdmin redirects unexpected authorization failures to dashboard", async () => {
    const guard = canSSRAdmin(async () => {
      throw new Error("403 forbidden");
    });

    const result = await guard(createSsrContext(createToken({ permission: 2 })));

    assert.deepEqual(result, {
      redirect: {
        destination: "/dashboard",
        permanent: false,
      },
    });
  });

  await runTest("auth cookie options keep session cookie safe in development", () => {
    assert.equal(AUTH_COOKIE_NAME, "cw.token");
    assert.equal(AUTH_COOKIE_MAX_AGE_SECONDS, 60 * 60 * 24 * 7);
    assert.deepEqual(getAuthCookieOptions("development"), {
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  await runTest("auth cookie options enable secure flag in production", () => {
    assert.deepEqual(getAuthCookieOptions("production"), {
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  await runTest("auth cookie options allow HTTP develop slots to disable secure flag", () => {
    const previousValue = process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE;
    process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE = "false";

    try {
      assert.deepEqual(getAuthCookieOptions("production"), {
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
        sameSite: "lax",
        secure: false,
      });
    } finally {
      if (previousValue === undefined) {
        delete process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE;
      } else {
        process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE = previousValue;
      }
    }
  });

  await runTest("auth headers are omitted when token is missing", () => {
    assert.equal(getAuthTokenValue(undefined), null);
    assert.equal(getAuthTokenValue(""), null);
    assert.equal(createBearerAuthHeaders(undefined), null);
    assert.equal(createBearerAuthHeaders(""), null);
  });

  await runTest("auth headers include bearer token when token exists", () => {
    assert.equal(getAuthTokenValue("abc.def.signature"), "abc.def.signature");
    assert.deepEqual(createBearerAuthHeaders("abc.def.signature"), {
      Authorization: "Bearer abc.def.signature",
    });
  });
})();
