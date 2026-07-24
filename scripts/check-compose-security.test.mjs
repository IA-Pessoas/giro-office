import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkComposeSecurity } from "./check-compose-security.mjs";

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
      - "3010:3010"
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
