import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getSocketClientConfig } from "./socketConfig.ts";

const socketContextSource = await readFile(new URL("./SocketContext.tsx", import.meta.url), "utf8");

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

await runTest("legacy socket stays disabled even when the obsolete flag is provided", () => {
  const config = getSocketClientConfig({
    NEXT_PUBLIC_ENABLE_SOCKET: "true",
    NEXT_PUBLIC_SOCKET_URL: "http://chat-service:3334",
    NEXT_PUBLIC_API_URL: "http://147.93.66.91:8086",
  });

  assert.deepEqual(config, {
    enabled: false,
    url: null,
  });
});

await runTest("legacy socket does not fall back to the public API", () => {
  const config = getSocketClientConfig({
    NEXT_PUBLIC_ENABLE_SOCKET: "true",
    NEXT_PUBLIC_API_URL: "http://147.93.66.91:8086",
  });

  assert.deepEqual(config, {
    enabled: false,
    url: null,
  });
});

await runTest("disabled legacy socket never receives browser credentials or bearer tokens", () => {
  assert.doesNotMatch(socketContextSource, /withCredentials/);
  assert.doesNotMatch(socketContextSource, /cw\.token|Authorization|Bearer|auth:\s*\{\s*token/);
});

await runTest("socket is exposed to chat only after a successful connection", () => {
  assert.match(socketContextSource, /newSocket\.on\("connect", handleConnect\)/);
  assert.match(socketContextSource, /newSocket\.on\("disconnect", handleDisconnect\)/);
});
