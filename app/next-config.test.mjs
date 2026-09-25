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

test("develop and staging slots allow HTTP asset requests and keep the other security headers", async () => {
  for (const slot of ["develop", "staging"]) {
    const headers = await readSecurityHeaders(slot);
    const csp = getHeader(headers, "Content-Security-Policy");

    assert.ok(csp);
    assert.doesNotMatch(csp, /(?:^|;\s*)upgrade-insecure-requests(?:;|$)/);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self' 'unsafe-inline'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.equal(getHeader(headers, "Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  }
});

test("production and other slots retain upgrade-insecure-requests", async () => {
  for (const slot of [undefined, "production", "test-develop", "test-staging"]) {
    const headers = await readSecurityHeaders(slot);
    const csp = getHeader(headers, "Content-Security-Policy");

    assert.ok(csp);
    assert.match(csp, /(?:^|;\s*)upgrade-insecure-requests(?:;|$)/);
    assert.equal(getHeader(headers, "Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  }
});

// #1370: rotas legadas vão para as telas atuais em vez de mostrar visual antigo ou o login.
test("legacy routes redirect to the current screens", async () => {
  const { default: nextConfig } = await import(`${configUrl.href}?scenario=redirects`);
  const redirects = await nextConfig.redirects();
  const bySource = Object.fromEntries(redirects.map((rule) => [rule.source, rule]));

  assert.equal(bySource["/home"]?.destination, "/dashboard");
  assert.equal(bySource["/users"]?.destination, "/administracao");
  assert.equal(bySource["/me"]?.destination, "/configuracoes");
  assert.equal(bySource["/clients/:id/commercial"]?.destination, "/clients/:id");
  for (const rule of redirects) {
    assert.equal(rule.permanent, false, `${rule.source} não deve virar 308 cacheado`);
  }
});
