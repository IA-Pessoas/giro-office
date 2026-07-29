import assert from "node:assert/strict";

import { getSocketClientConfig } from "./socketConfig.ts";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await runTest("socket client is disabled when the public flag is absent", () => {
  const config = getSocketClientConfig({
    NEXT_PUBLIC_API_URL: "http://147.93.66.91:8086",
  });

  assert.deepEqual(config, {
    enabled: false,
    url: null,
  });
});

await runTest("socket client uses explicit socket url when enabled", () => {
  const config = getSocketClientConfig({
    NEXT_PUBLIC_ENABLE_SOCKET: "true",
    NEXT_PUBLIC_SOCKET_URL: "http://chat-service:3334",
    NEXT_PUBLIC_API_URL: "http://147.93.66.91:8086",
  });

  assert.deepEqual(config, {
    enabled: true,
    url: "http://chat-service:3334",
  });
});

await runTest("socket client falls back to the public api url only when enabled", () => {
  const config = getSocketClientConfig({
    NEXT_PUBLIC_ENABLE_SOCKET: "true",
    NEXT_PUBLIC_API_URL: "http://147.93.66.91:8086",
  });

  assert.deepEqual(config, {
    enabled: true,
    url: "http://147.93.66.91:8086",
  });
});
