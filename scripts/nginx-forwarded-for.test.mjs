import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Nginx replaces untrusted X-Forwarded-For at both edge listeners", async () => {
  const generator = await readFile("docker/nginx/generate-nginx-config.sh", "utf8");
  const forwardedForDirectives = generator.match(/proxy_set_header X-Forwarded-For [^;]+;/gu) ?? [];

  assert.equal(forwardedForDirectives.length, 10);
  assert.ok(forwardedForDirectives.every((directive) => directive.endsWith("\\$remote_addr;")));
  assert.doesNotMatch(generator, /proxy_add_x_forwarded_for/u);
});

test("Nginx sends the browser root to web and strips the public api prefix", async () => {
  const generator = await readFile("docker/nginx/generate-nginx-config.sh", "utf8");

  assert.equal((generator.match(/proxy_pass http:\/\/web:3000;/gu) ?? []).length, 2);
  assert.equal((generator.match(/location \/api\//gu) ?? []).length, 2);
  assert.equal((generator.match(/proxy_pass http:\/\/gateway:3010\//gu) ?? []).length, 2);
  assert.equal((generator.match(/location \/docs\//gu) ?? []).length, 2);
  assert.equal((generator.match(/location = \/openapi\.json/gu) ?? []).length, 2);
  assert.equal((generator.match(/proxy_pass http:\/\/gateway:3010;/gu) ?? []).length, 6);
  assert.doesNotMatch(generator, /location \/\s*\{\s*proxy_pass http:\/\/gateway:3010;/u);
});
