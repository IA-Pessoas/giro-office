import assert from "node:assert/strict";

import worker, { toGatewayRequest } from "../../worker.ts";

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
