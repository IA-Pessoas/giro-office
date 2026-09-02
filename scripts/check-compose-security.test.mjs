import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkComposeSecurity,
  checkProductionComposeSecurity,
  checkResolvedProductionSecurity,
} from "./check-compose-security.mjs";

async function writeFixture(contents) {
  const dir = await mkdtemp(path.join(tmpdir(), "compose-security-"));
  const file = path.join(dir, "docker-compose.yml");
  await writeFile(file, contents, "utf8");
  return file;
}

test("checkComposeSecurity passes when only edge services publish host ports", async () => {
  const file = await writeFixture(`
services:
  gateway:
    ports:
      - "127.0.0.1:3010:3010"
  client-service:
    expose:
      - "3035"
networks:
  backend:
    driver: bridge
    internal: true
`);

  const result = await checkComposeSecurity({
    composeFiles: [file],
    registry: [{ name: "gateway" }, { name: "client-service" }],
  });

  assert.deepEqual(result.errors, []);
});

test("checkComposeSecurity rejects a gateway port exposed on every host interface", async () => {
  const file = await writeFixture(`
services:
  gateway:
    ports:
      - "3010:3010"
networks:
  backend:
    internal: true
`);

  const result = await checkComposeSecurity({
    composeFiles: [file],
    registry: [{ name: "gateway" }],
  });

  assert.match(result.errors.join("\n"), /gateway.*loopback/);
});

test("checkComposeSecurity rejects public plaintext edge ports", async () => {
  const file = await writeFixture(`
services:
  reverse-proxy:
    ports:
      - "8085:80"
  web:
    ports:
      - "3000:3000"
networks:
  backend:
    internal: true
`);

  const result = await checkComposeSecurity({
    composeFiles: [file],
    registry: [],
  });

  assert.match(result.errors.join("\n"), /reverse-proxy.*loopback/);
  assert.match(result.errors.join("\n"), /web.*loopback/);
});

test("checkComposeSecurity rejects insecure auth cookies in VPS compose", async () => {
  const file = await writeFixture(`
services:
  gateway:
    environment:
      AUTH_COOKIE_SECURE: "false"
networks:
  backend:
    internal: true
`);

  const result = await checkComposeSecurity({
    composeFiles: [file],
    registry: [{ name: "gateway" }],
  });

  assert.match(result.errors.join("\n"), /gateway.*AUTH_COOKIE_SECURE/);
});

test("workspace VPS compose files keep gateway ports private and auth cookies secure", async () => {
  const result = await checkComposeSecurity();

  assert.deepEqual(result.errors, []);
});

test("checkComposeSecurity fails when a workspace service publishes host ports", async () => {
  const file = await writeFixture(`
services:
  gateway:
    ports:
      - "3010:3010"
  client-service:
    ports:
      - "3035:3035"
networks:
  backend:
    internal: true
`);

  const result = await checkComposeSecurity({
    composeFiles: [file],
    registry: [{ name: "gateway" }, { name: "client-service" }],
  });

  assert.match(result.errors.join("\n"), /client-service.*ports/);
});

test("checkComposeSecurity fails when backend network is not internal", async () => {
  const file = await writeFixture(`
services:
  gateway:
    ports:
      - "3010:3010"
  client-service:
    expose:
      - "3035"
networks:
  backend:
    driver: bridge
`);

  const result = await checkComposeSecurity({
    composeFiles: [file],
    registry: [{ name: "gateway" }, { name: "client-service" }],
  });

  assert.match(result.errors.join("\n"), /backend.*internal/);
});

test("production security accepts only loopback reverse-proxy ports on public-edge", () => {
  const result = checkResolvedProductionSecurity({
    services: {
      "reverse-proxy": {
        networks: { edge: null, backend: null, "public-edge": null },
        ports: [
          { host_ip: "127.0.0.1", published: "8080", target: 80 },
          { host_ip: "127.0.0.1", published: "8443", target: 443 },
        ],
      },
      web: { networks: { edge: null, backend: null } },
      gateway: { networks: { edge: null, backend: null } },
      "user-service": { networks: { backend: null, egress: null } },
    },
    networks: {
      backend: { internal: true },
      "public-edge": { external: true, name: "public-edge" },
    },
  });

  assert.deepEqual(result.errors, []);
});

test("production security rejects public reverse-proxy ports and backend services on public-edge", () => {
  const result = checkResolvedProductionSecurity({
    services: {
      "reverse-proxy": {
        networks: { edge: null, backend: null, "public-edge": null },
        ports: [{ host_ip: "0.0.0.0", published: "3000", target: 3000 }],
      },
      gateway: { networks: { edge: null, backend: null, "public-edge": null } },
    },
    networks: {
      backend: { internal: true },
      "public-edge": { external: true, name: "public-edge" },
    },
  });

  assert.match(result.errors.join("\n"), /reverse-proxy.*host ports/);
  assert.match(result.errors.join("\n"), /gateway.*public-edge/);
});

test("production security validates the repository Compose topology", async () => {
  const result = await checkProductionComposeSecurity();

  assert.deepEqual(result.errors, []);
});
