import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { AuthTokenError } from "../../shared/services/errors/AuthTokenError.ts";
import { canSSRAdmin } from "./utils/canSSRAdmin.ts";
import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
} from "./utils/authCookie.ts";
import { canAccessAdministration, isAdminPermission } from "./utils/permissions.ts";

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

const authContextSource = await readFile(
  new URL("../../context/AuthContext.tsx", import.meta.url),
  "utf8",
);

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

  await runTest("auth diagnostics are hidden in production", () => {
    assert.match(authContextSource, /process\.env\.NODE_ENV !== "production"/);
    assert.match(authContextSource, /function logAuthError/);
    assert.equal(authContextSource.includes("fullError"), false);
    assert.equal(authContextSource.includes("URL:"), false);
    assert.equal(authContextSource.includes('console.error("Erro de conex'), false);
    assert.equal(authContextSource.includes('console.error("Erro do servidor'), false);
    assert.equal(authContextSource.includes('console.error("Erro de autentica'), false);
  });
})();
