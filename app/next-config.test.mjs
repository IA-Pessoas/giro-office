import assert from "node:assert/strict";
import test from "node:test";

const configUrl = new URL("./next.config.mjs", import.meta.url);

async function readSecurityHeaders(deploySlot) {
  const previousSlot = process.env.DEPLOY_SLOT;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  if (deploySlot === undefined) {
    delete process.env.DEPLOY_SLOT;
  } else {
    process.env.DEPLOY_SLOT = deploySlot;
  }

  try {
    const scenario = deploySlot ?? "default";
    const { securityHeaders } = await import(`${configUrl.href}?scenario=${scenario}`);
    return securityHeaders;
  } finally {
    if (previousSlot === undefined) {
      delete process.env.DEPLOY_SLOT;
    } else {
      process.env.DEPLOY_SLOT = previousSlot;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
}

function getHeader(headers, name) {
  return headers.find((header) => header.key.toLowerCase() === name.toLowerCase())?.value;
}

test("develop slot allows HTTP asset requests and keeps the other security headers", async () => {
  const headers = await readSecurityHeaders("develop");
  const csp = getHeader(headers, "Content-Security-Policy");

  assert.ok(csp);
  assert.doesNotMatch(csp, /(?:^|;\s*)upgrade-insecure-requests(?:;|$)/);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.equal(getHeader(headers, "Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
});

test("production and other slots retain upgrade-insecure-requests", async () => {
  for (const slot of [undefined, "production", "staging"]) {
    const headers = await readSecurityHeaders(slot);
    const csp = getHeader(headers, "Content-Security-Policy");

    assert.ok(csp);
    assert.match(csp, /(?:^|;\s*)upgrade-insecure-requests(?:;|$)/);
    assert.equal(getHeader(headers, "Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  }
});
