import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

import worker, { toGatewayRequest } from "../../worker.ts";

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

const { setupAPIClient } = await import(new URL("./services/api.ts", import.meta.url));
const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await runTest("api paths lose the /api prefix like the next.config rewrite", async () => {
  assert.equal(
    toGatewayRequest(new Request("https://app.test/api/user/me?x=1")).url,
    "https://app.test/user/me?x=1",
  );
  assert.equal(toGatewayRequest(new Request("https://app.test/api")).url, "https://app.test/");
});

await runTest("non-api paths stay with next", async () => {
  assert.equal(toGatewayRequest(new Request("https://app.test/dashboard")), null);
  assert.equal(toGatewayRequest(new Request("https://app.test/apiary")), null);
});

await runTest("api requests keep method, cookies, csrf header and body", async () => {
  let seen;
  const gateway = {
    fetch: async (request) => {
      seen = request;
      return new Response("ok");
    },
  };
  const request = new Request("https://app.test/api/user", {
    method: "POST",
    headers: { cookie: "cw.session=s; cw.csrf=c", "x-csrf-token": "c" },
    body: "{}",
  });

  const response = await worker.fetch(request, { GATEWAY: gateway }, {});

  assert.equal(await response.text(), "ok");
  assert.equal(seen.method, "POST");
  assert.equal(new URL(seen.url).pathname, "/user");
  assert.equal(seen.headers.get("cookie"), "cw.session=s; cw.csrf=c");
  assert.equal(seen.headers.get("x-csrf-token"), "c");
  assert.equal(await seen.text(), "{}");
});

await runTest("adapter still exposes the worker env under the symbol api.ts reads", async () => {
  const adapterContext = await readFile(
    fileURLToPath(import.meta.resolve("@opennextjs/cloudflare/cloudflare-context")),
    "utf8",
  );

  assert.match(adapterContext, /Symbol\.for\("__cloudflare-context__"\)/);
});

await runTest("ssr api calls go through the GATEWAY binding inside the worker", async () => {
  let seen;
  globalThis[cloudflareContextSymbol] = {
    env: {
      GATEWAY: {
        fetch: async (request) => {
          seen = request;
          return Response.json({ data: { id: "u1" } });
        },
      },
    },
  };

  try {
    const response = await setupAPIClient({ req: { headers: { cookie: "cw.session=s" } } }).get(
      "/user/me",
    );

    assert.deepEqual(response.data, { data: { id: "u1" } });
    assert.equal(new URL(seen.url).pathname, "/user/me");
    assert.equal(seen.headers.get("cookie"), "cw.session=s");
    assert.equal(setupAPIClient().defaults.baseURL, "/api");
  } finally {
    delete globalThis[cloudflareContextSymbol];
  }
});

await runTest("ssr outside the worker keeps API_INTERNAL_URL", async () => {
  const api = setupAPIClient({ req: { headers: {} } });

  assert.equal(api.defaults.baseURL, process.env.API_INTERNAL_URL || "http://127.0.0.1:3010");
  assert.notEqual(api.defaults.adapter, "fetch");
});
