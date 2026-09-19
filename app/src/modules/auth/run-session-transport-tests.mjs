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

const [
  apiSource,
  apiClientSource,
  authSource,
  authGuardSource,
  guestGuardSource,
  adminGuardSource,
  platformGuardSource,
  platformLoginSource,
  packageSource,
  authSessionSmokeSource,
  browserSmokeEnvSource,
] =
  await Promise.all([
    source("../../shared/services/api.ts"),
    source("../../shared/services/apiClient.ts"),
    source("../../context/AuthContext.tsx"),
    source("./utils/canSSRAuth.ts"),
    source("./utils/canSSRGuest.ts"),
    source("./utils/canSSRAdmin.ts"),
    source("./utils/canSSRPlatformAdmin.ts"),
    source("../../pages/super-admin/login.tsx"),
    source("../../../package.json"),
    source("./run-auth-session-browser-smoke.mjs"),
    source("../../shared/testing/browserSmokeEnv.mjs"),
  ]);
const appPackage = JSON.parse(packageSource);

await runTest("API uses credentials, SSR cookies and browser CSRF without JWT", () => {
  assert.match(apiSource, /API_INTERNAL_URL/);
  assert.match(apiSource, /cookieHeader:/);
  assert.match(apiSource, /getCsrfToken:/);
  assert.match(apiSource, /readBrowserCookie\("cw\.csrf"\)/);
  assert.doesNotMatch(apiSource, /cw\.token|getAccessToken|Authorization|Bearer/);
});

await runTest("AuthContext lifecycle is server-driven and token-free", () => {
  assert.match(authSource, /platformApi\.get\("\/user\/me"\)/);
  assert.match(authSource, /platformApi\.get\("\/platform\/me"\)/);
  assert.match(authSource, /api\.post\("\/user\/session\/refresh"\)/);
  assert.match(authSource, /platformApi\.post\("\/platform\/session\/refresh"\)/);
  assert.match(authSource, /api\.delete\("\/user\/session"\)/);
  assert.match(authSource, /platformApi\.delete\("\/platform\/session"\)/);
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
  assert.match(platformGuardSource, /setupAPIClient\(ctx\)/);
  assert.match(platformGuardSource, /\.get\("\/platform\/me"\)/);
  assert.doesNotMatch(platformGuardSource, /cw\.session|parseCookies|jwtDecode|cw\.token/);
  assert.doesNotMatch(platformLoginSource, /setCookie|destroyCookie|cw\.token|jwtDecode/);
});

await runTest("browser bundle no longer depends on jwt-decode", () => {
  assert.doesNotMatch(packageSource, /jwt-decode/);
});

await runTest("session security tests belong to the aggregate and build before browser proof", () => {
  assert.match(appPackage.scripts.test, /test:session-security/);
  assert.match(appPackage.scripts.test, /test:platform-session/);
  assert.match(appPackage.scripts.test, /test:auth-session/);
  // O build passou a acontecer dentro do smoke, com NEXT_PUBLIC_API_URL fixo em /api,
  // para o gate nao depender do .env.local de cada ambiente.
  assert.match(appPackage.scripts["test:auth-session"], /run-auth-session-browser-smoke\.mjs/);
  assert.match(authSessionSmokeSource, /buildApp\(\);/);
  assert.match(authSessionSmokeSource, /browserSmokeEnv\(\)/);
  assert.match(browserSmokeEnvSource, /NEXT_PUBLIC_API_URL: "\/api"/);
});
