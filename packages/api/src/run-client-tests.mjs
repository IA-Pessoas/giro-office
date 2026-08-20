import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createApiClient } from "./client.ts";

async function withServer(run) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ headers: request.headers, method: request.method, url: request.url });
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    assert.ok(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

await withServer(async (baseURL, requests) => {
  const api = createApiClient({
    baseURL,
    cookieHeader: "cw.session=signed; cw.csrf=browser-token",
    getCsrfToken: () => "browser-token",
  });

  assert.equal(api.defaults.withCredentials, true);

  await api.get("/safe");
  await api.post("/unsafe", { ok: true });

  assert.equal(requests[0].headers.cookie, "cw.session=signed; cw.csrf=browser-token");
  assert.equal(requests[0].headers["x-csrf-token"], undefined);
  assert.equal(requests[1].headers.cookie, "cw.session=signed; cw.csrf=browser-token");
  assert.equal(requests[1].headers["x-csrf-token"], "browser-token");
});

console.log("PASS API client forwards HttpOnly sessions and binds CSRF to unsafe requests");
