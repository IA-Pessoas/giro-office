import assert from "node:assert/strict";

import { AuthTokenError } from "../../shared/services/errors/AuthTokenError.ts";
import { canSSRAdmin } from "./utils/canSSRAdmin.ts";
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

await (async () => {
  await runTest("isAdminPermission only allows permission level 2", () => {
    assert.equal(isAdminPermission(2), true);
    assert.equal(isAdminPermission(1), false);
    assert.equal(isAdminPermission(0), false);
    assert.equal(isAdminPermission(null), false);
  });

  await runTest("canAccessAdministration accepts both permission values and user-like objects", () => {
    assert.equal(canAccessAdministration(2), true);
    assert.equal(canAccessAdministration(1), false);
    assert.equal(canAccessAdministration({ permission: 2 }), true);
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

  await runTest("canSSRAdmin allows admin users through", async () => {
    const guard = canSSRAdmin(async () => ({ props: { ok: true } }));
    const result = await guard(createSsrContext(createToken({ permission: 2 })));

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
})();
