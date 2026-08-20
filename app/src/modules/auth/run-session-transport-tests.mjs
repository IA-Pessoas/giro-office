import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

async function runTest(name, test) {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const [apiSource, apiClientSource, authSource, authGuardSource, guestGuardSource, adminGuardSource, packageSource] =
  await Promise.all([
    source("../../shared/services/api.ts"),
    source("../../shared/services/apiClient.ts"),
    source("../../context/AuthContext.tsx"),
    source("./utils/canSSRAuth.ts"),
    source("./utils/canSSRGuest.ts"),
    source("./utils/canSSRAdmin.ts"),
    source("../../../package.json"),
  ]);

await runTest("API uses credentials, SSR cookies and browser CSRF without JWT", () => {
  assert.match(apiSource, /API_INTERNAL_URL/);
  assert.match(apiSource, /cookieHeader:/);
  assert.match(apiSource, /getCsrfToken:/);
  assert.match(apiSource, /readBrowserCookie\("cw\.csrf"\)/);
  assert.doesNotMatch(apiSource, /cw\.token|getAccessToken|Authorization|Bearer/);
});

await runTest("AuthContext lifecycle is server-driven and token-free", () => {
  assert.match(authSource, /api\.get\("\/user\/me"\)/);
  assert.match(authSource, /api\.post\("\/user\/session\/refresh"\)/);
  assert.match(authSource, /api\.delete\("\/user\/session"\)/);
  assert.doesNotMatch(
    authSource,
    /cw\.token|jwtDecode|getModulePermissionsFromToken|setCookie|destroyCookie|Authorization|Bearer/,
  );
});

await runTest("anonymous 401 responses do not masquerade as expired sessions", () => {
  assert.match(apiClientSource, /readBrowserCookie\("cw\.csrf"\)/);
  assert.match(apiClientSource, /signOut\(\)/);
});

await runTest("SSR guards treat the signed cookie as opaque", () => {
  assert.match(authGuardSource, /cw\.session/);
  assert.doesNotMatch(authGuardSource, /cw\.token|jwtDecode/);
  assert.doesNotMatch(guestGuardSource, /parseCookies|cw\.session|cw\.token/);
  assert.match(adminGuardSource, /setupAPIClient\(ctx\)/);
  assert.match(adminGuardSource, /\.get\("\/user\/me"\)/);
  assert.doesNotMatch(adminGuardSource, /jwtDecode|cw\.token/);
});

await runTest("browser bundle no longer depends on jwt-decode", () => {
  assert.doesNotMatch(packageSource, /jwt-decode/);
});
