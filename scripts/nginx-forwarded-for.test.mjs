import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Nginx replaces untrusted X-Forwarded-For at both edge listeners", async () => {
  const generator = await readFile("docker/nginx/generate-nginx-config.sh", "utf8");
  const forwardedForDirectives = generator.match(/proxy_set_header X-Forwarded-For [^;]+;/gu) ?? [];

  assert.deepEqual(forwardedForDirectives, [
    "proxy_set_header X-Forwarded-For \\$remote_addr;",
    "proxy_set_header X-Forwarded-For \\$remote_addr;",
  ]);
  assert.doesNotMatch(generator, /proxy_add_x_forwarded_for/u);
});
