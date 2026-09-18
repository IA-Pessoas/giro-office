import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.endsWith("/shared/services/api.ts") &&
      (specifier === "./errors/AuthTokenError" || specifier === "./serverErrorToast")
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

async function source(relativePath) {
  try {
    return await readFile(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

async function runTest(name, test) {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const [authContextSource, platformGuardSource, platformLoginSource] = await Promise.all([
  source("../../context/AuthContext.tsx"),
  source("./utils/canSSRPlatformAdmin.ts"),
  source("../../pages/super-admin/login.tsx"),
]);
const platformSources = `${authContextSource}\n${platformGuardSource}\n${platformLoginSource}`;

async function startPlatformSessionServer() {
  const server = createServer((request, response) => {
    if (request.url === "/user/me") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Not authenticated" }));
      return;
    }

    if (request.url === "/platform/me") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        data: {
          id: "platform-user-1",
          name: "Platform Admin",
          email: "admin@example.com",
          auth_kind: "platform",
          platform_role: "super_admin",
        },
      }));
      return;
    }

    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not authenticated" }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

await runTest("platform session is derived from server identity without readable credentials", () => {
  assert.match(authContextSource, /signInPlatform/);
  assert.match(authContextSource, /platformApi\.get\("\/user\/me"/);
  assert.match(authContextSource, /platformApi\.get\("\/platform\/me"/);
  assert.match(authContextSource, /platformApi\.post\("\/platform\/session"/);
  assert.match(authContextSource, /platformApi\.post\("\/platform\/session\/refresh"/);
  assert.match(authContextSource, /platformApi\.delete\("\/platform\/session"/);
  assert.match(authContextSource, /auth_kind/);
  assert.match(authContextSource, /platform_role/);
  assert.match(platformLoginSource, /signInPlatform/);
  assert.match(platformGuardSource, /setupAPIClient\(ctx\)/);
  assert.match(platformGuardSource, /\.get\("\/platform\/me"\)/);
  assert.match(platformGuardSource, /destination:\s*["']\/super-admin\/login["']/);
  assert.doesNotMatch(platformGuardSource, /cw\.session|parseCookies/);
  assert.doesNotMatch(
    platformSources,
    /cw\.token|jwtDecode|Authorization|Bearer|localStorage|sessionStorage/,
  );
  assert.doesNotMatch(platformLoginSource, /setCookie|destroyCookie/);
});

await runTest("platform client survives organizational 401 and platform refresh/logout failures", async () => {
  const server = await startPlatformSessionServer();
  const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  process.env.NEXT_PUBLIC_API_URL = server.baseURL;
  globalThis.window = { location: { href: server.baseURL } };
  globalThis.document = { cookie: "cw.csrf=browser-proof" };

  try {
    const { platformApi } = await import(new URL("../../shared/services/api.ts", import.meta.url));
    assert.equal(typeof platformApi?.get, "function", "platform client must be available");

    await assert.rejects(platformApi.get("/user/me"), { status: 401 });
    const identity = await platformApi.get("/platform/me");
    assert.deepEqual(identity.data.data, {
      id: "platform-user-1",
      name: "Platform Admin",
      email: "admin@example.com",
      auth_kind: "platform",
      platform_role: "super_admin",
    });
    await assert.rejects(platformApi.post("/platform/session/refresh"), { status: 401 });
    await assert.rejects(platformApi.delete("/platform/session"), { status: 401 });
  } finally {
    if (previousApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = previousApiUrl;
    }
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
    await server.close();
  }
});

await runTest("principal switch removes every cached platform query", async () => {
  const [{ QueryClient }, { clearPlatformQueryCache }] = await Promise.all([
    import("@tanstack/react-query"),
    import(new URL("../../context/platformQueryCache.ts", import.meta.url)),
  ]);
  const queryClient = new QueryClient();
  const previousPlatformData = { organizations: ["tenant-a"] };
  const organizationData = { id: "organization-user" };

  queryClient.setQueryData(["platform", "organizations"], previousPlatformData);
  queryClient.setQueryData(["platform", "audit"], { items: ["old-event"] });
  queryClient.setQueryData(["me"], organizationData);

  await clearPlatformQueryCache(queryClient);

  assert.equal(queryClient.getQueryData(["platform", "organizations"]), undefined);
  assert.equal(queryClient.getQueryData(["platform", "audit"]), undefined);
  assert.deepEqual(queryClient.getQueryData(["me"]), organizationData);
  assert.match(authContextSource, /import \{ clearPlatformQueryCache \}/);
  assert.ok(
    (authContextSource.match(/clearPlatformQueryCache\(queryClient\)/g) ?? []).length >= 4,
    "invalidation, refresh, sign-in and logout must clear the platform query prefix",
  );
  assert.match(
    authContextSource,
    /async function signInPlatform[\s\S]*?clearPlatformQueryCache\(queryClient\)[\s\S]*?async function logoutUser/,
  );
  assert.match(
    authContextSource,
    /async function logoutPlatform[\s\S]*?clearPlatformQueryCache\(queryClient\)[\s\S]*?Router\.push\("\/super-admin\/login"\)/,
  );
});
